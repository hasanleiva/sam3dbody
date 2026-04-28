import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { SegmentStrip } from './components/SegmentStrip';
import { ThreeDViewport } from './components/ThreeDViewport';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { MiniPitch } from './components/MiniPitch';
import { AnalysisTools } from './components/AnalysisTools';
import { AppState, DetectedPerson, CalibrationPoint, DistanceMeasurement, BillboardData } from './types';
import { calculateHomography, CALIBRATION_NODES, projectPoint } from './utils/homography';
import { fal } from '@fal-ai/client';
import { useAuth } from './AuthContext';
import { LoginModal } from './components/LoginModal';
import { SaveSceneModal } from './components/SaveSceneModal';
import { LoadSceneModal } from './components/LoadSceneModal';
import { auth } from './firebase';
import { extractColorsFromImage } from './utils/colorExtractor';

const cropImage = (img: HTMLImageElement, x: number, y: number, width: number, height: number): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    } else {
      resolve('');
    }
  });
};

import { ErrorBoundary } from './components/ErrorBoundary';

const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSaveSceneModalOpen, setIsSaveSceneModalOpen] = useState(false);
  const [isLoadSceneModalOpen, setIsLoadSceneModalOpen] = useState(false);
  const [activeAnalysisTool, setActiveAnalysisTool] = useState<'xg' | 'distance' | 'transform' | 'arrow' | 'billboard' | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
  const [measurements, setMeasurements] = useState<DistanceMeasurement[]>([]);
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);
  const [billboards, setBillboards] = useState<BillboardData[]>([]);
  const [selectedBillboardId, setSelectedBillboardId] = useState<string | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);

  const [cameraSettings, setCameraSettings] = useState<import('./types').CameraSettings>({
    aspectRatio: 'free',
    heightOffset: 0,
    fov: 35
  });
  const [isCameraViewActive, setIsCameraViewActive] = useState(false);
  const [isCameraSettingsModalOpen, setIsCameraSettingsModalOpen] = useState(false);
  
  const [keyframes, setKeyframes] = useState<import('./types').CameraKeyframe[]>([]);
  const [isPlayingCamera, setIsPlayingCamera] = useState(false);

  const viewportRef = useRef<import('./components/ThreeDViewport').ThreeDViewportRef>(null);

  const [timelineDuration, setTimelineDuration] = useState(10);
  const [durationStr, setDurationStr] = useState("00:10");
  const [timelineTime, setTimelineTime] = useState(0);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);

  // Time format helper
  const formatTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }, []);

  const applyDuration = useCallback((val: string) => {
    const parts = val.split(":");
    let secs = 10;
    if (parts.length === 2) {
      secs = (parseInt(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
    } else {
      secs = parseFloat(val);
    }
    if (!isNaN(secs) && secs > 0) {
      secs = Math.min(3600, Math.max(1, secs));
      setTimelineDuration(secs);
      setDurationStr(formatTime(secs));
    } else {
      setDurationStr(formatTime(timelineDuration));
    }
  }, [timelineDuration, formatTime]);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    if (isPlayingCamera) {
      const animate = (time: number) => {
        const delta = (time - lastTime) / 1000;
        lastTime = time;
        setTimelineTime(prev => {
          let next = prev + delta;
          if (next >= timelineDuration) {
            next = 0;
            setIsPlayingCamera(false);
          }
          return next;
        });
        animationFrameId = requestAnimationFrame(animate);
      };
      animationFrameId = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlayingCamera, timelineDuration]);

  const togglePlay = () => {
    if (!isPlayingCamera) {
      if (timelineTime >= timelineDuration) {
        setTimelineTime(0);
      }
      setIsPlayingCamera(true);
    } else {
      setIsPlayingCamera(false);
    }
  };

  const [state, setState] = useState<AppState & { activeNodeId: string | null; scanProgress: number }>({
    image: null,
    detectedPeople: [],
    selectedId: null,
    isAnalyzing: false,
    isCalibrating: true,
    calibrationPoints: [],
    homographyMatrix: null,
    inverseHomographyMatrix: null,
    error: null,
    activeNodeId: null,
    customNodes: [],
    scanProgress: 0,
  });

  const [cvReady, setCvReady] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      // @ts-ignore
      if (window.cv && window.cv.matFromArray) {
        setCvReady(true);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Update Homography Matrices and Map Players to World Space
  useEffect(() => {
    if (!cvReady || state.calibrationPoints.length < 4) {
      setState(prev => ({ 
        ...prev, 
        homographyMatrix: null, 
        inverseHomographyMatrix: null,
        detectedPeople: prev.detectedPeople.map(p => ({ ...p, worldPos: undefined }))
      }));
      return;
    }

    const world = state.calibrationPoints.map(p => [p.worldX, p.worldY]);
    const image = state.calibrationPoints.map(p => [p.imageX, p.imageY]);
    
    // Matrix for World -> Image (Drawing Grid)
    const forwardH = calculateHomography(world, image);
    // Matrix for Image -> World (Positioning Players)
    const inverseH = calculateHomography(image, world);

    setState(prev => {
      const updatedPeople = prev.detectedPeople.map(person => {
        if (!inverseH) return person;
        // Project the bottom-center of the bounding box as the ground point
        const centerX = person.bbox[0] + (person.bbox[2] / 2);
        const bottomY = person.bbox[1] + person.bbox[3];
        const worldPos = projectPoint(centerX, bottomY, inverseH);
        return { ...person, worldPos: worldPos as [number, number] };
      });

      return { 
        ...prev, 
        homographyMatrix: forwardH, 
        inverseHomographyMatrix: inverseH,
        detectedPeople: updatedPeople
      };
    });
  }, [state.calibrationPoints, cvReady]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
      const videoUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        setState(prev => ({
          ...prev,
          videoUrl,
          mediaType: 'video',
          image: null,
          imageDimensions: { width: video.videoWidth, height: video.videoHeight },
          detectedPeople: [],
          selectedId: null,
          error: null
        }));
      };
      video.src = videoUrl;
    } else {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setState(prev => ({ 
            ...prev, 
            image: base64, 
            mediaType: 'image',
            videoUrl: null,
            imageDimensions: { width: img.width, height: img.height },
            detectedPeople: [], 
            selectedId: null, 
            error: null 
          }));
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    }
  }, [user]);

  const handleImageClick = useCallback((x: number, y: number) => {
    if (!state.isCalibrating || !state.activeNodeId) return;

    const allNodes = [...CALIBRATION_NODES, ...state.customNodes];
    const node = allNodes.find(n => n.id === state.activeNodeId);
    if (!node) return;

    setState(prev => {
      const existingIndex = prev.calibrationPoints.findIndex(p => p.id === node.id);
      let newPoints;
      if (existingIndex > -1) {
        newPoints = [...prev.calibrationPoints];
        newPoints[existingIndex] = { ...newPoints[existingIndex], imageX: x, imageY: y };
      } else {
        newPoints = [...prev.calibrationPoints, { id: node.id, imageX: x, imageY: y, worldX: node.x, worldY: node.y }];
      }
      
      return {
        ...prev,
        calibrationPoints: newPoints,
        activeNodeId: null
      };
    });
  }, [state.isCalibrating, state.activeNodeId, state.customNodes]);

  const handleAddCustomNode = useCallback((x: number, y: number) => {
    const id = `custom_${Date.now()}`;
    const newNode = {
      id,
      name: `Custom Point (${x.toFixed(1)}, ${y.toFixed(1)})`,
      x,
      y
    };
    
    setState(prev => ({
      ...prev,
      customNodes: [...prev.customNodes, newNode],
      activeNodeId: id
    }));
  }, []);

  const updateCalibrationPoint = useCallback((id: string, x: number, y: number) => {
    setState(prev => ({
      ...prev,
      calibrationPoints: prev.calibrationPoints.map(p => p.id === id ? { ...p, imageX: x, imageY: y } : p)
    }));
  }, []);

  const removeCalibrationPoint = (id: string) => {
    setState(prev => ({
      ...prev,
      calibrationPoints: prev.calibrationPoints.filter(p => p.id !== id)
    }));
  };

  const handleNodeMap = useCallback((nodeId: string, x: number, y: number) => {
    const allNodes = [...CALIBRATION_NODES, ...state.customNodes];
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;

    setState(prev => {
      const existingIndex = prev.calibrationPoints.findIndex(p => p.id === nodeId);
      let newPoints;
      if (existingIndex > -1) {
        newPoints = [...prev.calibrationPoints];
        newPoints[existingIndex] = { ...newPoints[existingIndex], imageX: x, imageY: y };
      } else {
        newPoints = [...prev.calibrationPoints, { id: node.id, imageX: x, imageY: y, worldX: node.x, worldY: node.y }];
      }
      
      return {
        ...prev,
        calibrationPoints: newPoints
      };
    });
  }, [state.customNodes]);

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFalScan = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    let currentImage = state.image;
    
    if (state.mediaType === 'video' && videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        currentImage = canvas.toDataURL('image/jpeg', 0.9);
      }
    }

    if (!currentImage) return;
    
    const falKey = import.meta.env.VITE_FAL_KEY;
    if (!falKey) {
      setState(prev => ({ ...prev, error: "Please set VITE_FAL_KEY in your environment variables." }));
      return;
    }

    // Configure fal client with the key
    fal.config({
      credentials: () => falKey,
    });

    setState(prev => ({ ...prev, isAnalyzing: true, scanProgress: 10, image: currentImage }));
    
    try {
      // 1. Upload the base64 image to fal.ai's storage first if it's not already a public URL
      let uploadedUrl = currentImage;
      if (currentImage.startsWith('data:image')) {
        const file = await (await fetch(currentImage)).blob();
        uploadedUrl = await fal.storage.upload(file);
      }
      
      setState(prev => ({ ...prev, scanProgress: 30 }));

      // 2. Call the SAM 3D Body API using the official client
      const result: any = await fal.subscribe("fal-ai/sam-3/3d-body", {
        input: {
          image_url: uploadedUrl,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            setState(s => ({ ...s, scanProgress: Math.min(90, s.scanProgress + 5) }));
          }
        },
      });

      const data = result.data || result;

      if (!data || !data.metadata || !data.metadata.people) {
        throw new Error("Invalid response format from fal.ai: Missing metadata.people");
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("Failed to load image for cropping."));
        // If it's a data URL, load it directly. If it's an external URL (like R2), proxy it to avoid CORS issues.
        if (currentImage!.startsWith('data:image')) {
          img.src = currentImage!;
        } else {
          const apiUrl = window.location.origin;
          img.src = `${apiUrl}/api/proxy-image?url=${encodeURIComponent(currentImage!)}`;
        }
      });
      const imgWidth = img.width || 1280;
      const imgHeight = img.height || 720;

      const newPeople: DetectedPerson[] = await Promise.all(data.metadata.people.map(async (p: any, idx: number) => {
        const [x1, y1, x2, y2] = p.bbox;
        const cx = ((x1 + x2) / 2 / imgWidth) * 100;
        const bottomY = (y2 / imgHeight) * 100;

        let worldPos: [number, number] | undefined;
        if (state.homographyMatrix) {
          const inverseH = calculateHomography(
            state.calibrationPoints.map(cp => [cp.imageX, cp.imageY]),
            state.calibrationPoints.map(cp => [cp.worldX, cp.worldY])
          );
          if (inverseH) {
            const proj = projectPoint(cx, bottomY, inverseH);
            if (!isNaN(proj[0]) && !isNaN(proj[1])) {
              worldPos = proj as [number, number];
            }
          }
        }

        // Crop thumbnail
        const thumbnail = await cropImage(img, x1, y1, x2 - x1, y2 - y1);
        
        // Extract colors from thumbnail
        const colors = await extractColorsFromImage(thumbnail);

        return {
          id: `fal-${p.person_id}`,
          name: `Player ${p.person_id + 1}`,
          thumbnail,
          confidence: 0.99,
          box: [x1, y1, x2 - x1, y2 - y1],
          bbox: [(x1 / imgWidth) * 100, (y1 / imgHeight) * 100, ((x2 - x1) / imgWidth) * 100, ((y2 - y1) / imgHeight) * 100] as [number, number, number, number],
          worldPos,
          pose: { rotation: [0, 0, 0], scale: 1, activity: "FAL 3D Body" },
          meshUrl: data.meshes[idx]?.url,
          colors
        };
      }));

      setState(prev => ({ 
        ...prev, 
        // Remove previously detected fal.ai people to avoid duplicates
        detectedPeople: [...prev.detectedPeople.filter(p => !p.id.startsWith('fal-')), ...newPeople],
        isAnalyzing: false,
        scanProgress: 100
      }));
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, error: `Fal.ai Scan failed: ${err.message}`, isAnalyzing: false, scanProgress: 0 }));
    }
  };

  const handleExportImage = async (quality?: 'FHD' | '4K') => {
    let targetWidth = 1920;
    let targetHeight = 1080;
    
    const canvas = viewportRef.current?.getCanvas();
    if (canvas && cameraSettings.aspectRatio === 'free') {
      targetWidth = canvas.width;
      targetHeight = canvas.height;
    } else {
      if (quality === '4K') {
         if (cameraSettings.aspectRatio === '16:9') { targetWidth = 3840; targetHeight = 2160; }
         else if (cameraSettings.aspectRatio === '9:16') { targetWidth = 2160; targetHeight = 3840; }
         else if (cameraSettings.aspectRatio === '1:1') { targetWidth = 3840; targetHeight = 3840; }
      } else if (quality === 'FHD') {
         if (cameraSettings.aspectRatio === '16:9') { targetWidth = 1920; targetHeight = 1080; }
         else if (cameraSettings.aspectRatio === '9:16') { targetWidth = 1080; targetHeight = 1920; }
         else if (cameraSettings.aspectRatio === '1:1') { targetWidth = 1920; targetHeight = 1920; }
      }
    }

    const highResCanvas = viewportRef.current?.captureHighResFrame(targetWidth, targetHeight);
    if (!highResCanvas) return;

    const a = document.createElement('a');
    a.href = highResCanvas.toDataURL('image/png', 1.0);
    a.download = `tactical-analysis-${Date.now()}.png`;
    a.click();
  };

  const handleExportVideo = async (quality?: 'FHD' | '4K') => {
    const canvas = viewportRef.current?.getCanvas();
    if (!canvas || keyframes.length < 2) {
      alert("Please create at least 2 camera keyframes to export a video.");
      return;
    }
    
    if (!viewportRef.current?.encodeOfflineVideo) {
      alert("Offline rendering is not supported on your browser or currently compiling.");
      return;
    }

    let targetWidth = 1920;
    let targetHeight = 1080;
    
    if (cameraSettings.aspectRatio === 'free') {
      targetWidth = canvas.width;
      targetHeight = canvas.height;
    } else {
      if (quality === '4K') {
         if (cameraSettings.aspectRatio === '16:9') { targetWidth = 3840; targetHeight = 2160; }
         else if (cameraSettings.aspectRatio === '9:16') { targetWidth = 2160; targetHeight = 3840; }
         else if (cameraSettings.aspectRatio === '1:1') { targetWidth = 3840; targetHeight = 3840; }
      } else if (quality === 'FHD') {
         if (cameraSettings.aspectRatio === '16:9') { targetWidth = 1920; targetHeight = 1080; }
         else if (cameraSettings.aspectRatio === '9:16') { targetWidth = 1080; targetHeight = 1920; }
         else if (cameraSettings.aspectRatio === '1:1') { targetWidth = 1920; targetHeight = 1920; }
      }
    }

    try {
      // In a real application, you'd show a loading overlay here using `onProgress`
      console.log(`Starting High Quality 60FPS Offline Render at ${targetWidth}x${targetHeight}...`);
      
      const blob = await viewportRef.current.encodeOfflineVideo(
        targetWidth,
        targetHeight,
        60, // Enforce 60 FPS natively
        timelineDuration,
        keyframes,
        (progress) => {
          // Could dispatch to a state to show progress!
          console.log(`Exporting video: ${Math.round(progress * 100)}%`);
        },
        (time) => new Promise<void>(resolve => {
          setState(prev => ({...prev, timelineTime: time}));
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
      );
      
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tactical-analysis-HQ-${Date.now()}.mp4`;
      a.click();
      console.log("Export complete!");
    } catch (err) {
      console.error(err);
      alert("Failed to export video. Please check the console for details.");
    }
  };

  const selectedPerson = state.detectedPeople.find(p => p.id === state.selectedId) || null;
  const allNodes = [...CALIBRATION_NODES, ...state.customNodes];
  const activeNode = allNodes.find(n => n.id === state.activeNodeId);

  return (
    <div className="flex flex-col h-screen bg-white text-black overflow-hidden">
      <Header 
        onLoginClick={() => setIsLoginModalOpen(true)}
        onNewScene={() => {
          setState({
            image: null,
            detectedPeople: [],
            selectedId: null,
            isAnalyzing: false,
            isCalibrating: true,
            calibrationPoints: [],
            homographyMatrix: null,
            inverseHomographyMatrix: null,
            error: null,
            activeNodeId: null,
            customNodes: [],
            scanProgress: 0,
          });
          setActiveAnalysisTool(null);
          setMeasurements([]);
          setActiveMeasurementId(null);
          setOverlayEnabled(false);
          setOverlayOpacity(0.5);
        }}
        onSaveScene={() => setIsSaveSceneModalOpen(true)}
        onLoadScene={() => setIsLoadSceneModalOpen(true)}
      />
      
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 bg-[#f8f8f8] border-r border-[#eee] flex flex-col p-4 gap-6 overflow-y-auto no-scrollbar">
          {state.fullscreenView === '3d' ? (
            <AnalysisTools 
              selectedPerson={selectedPerson}
              activeTool={activeAnalysisTool}
              setActiveTool={setActiveAnalysisTool}
              transformMode={transformMode}
              setTransformMode={setTransformMode}
              measurements={measurements}
              setMeasurements={setMeasurements}
              activeMeasurementId={activeMeasurementId}
              setActiveMeasurementId={setActiveMeasurementId}
              onClearMeasurement={(id) => {
                setMeasurements(prev => prev.filter(m => m.id !== id));
                if (activeMeasurementId === id) setActiveMeasurementId(null);
              }}
              onClearAllMeasurements={() => {
                setMeasurements([]);
                setActiveMeasurementId(null);
              }}
              overlayEnabled={overlayEnabled}
              setOverlayEnabled={setOverlayEnabled}
              overlayOpacity={overlayOpacity}
              setOverlayOpacity={setOverlayOpacity}
              billboards={billboards}
              setBillboards={setBillboards}
              selectedBillboardId={selectedBillboardId}
              setSelectedBillboardId={setSelectedBillboardId}
              isCameraViewActive={isCameraViewActive}
              setIsCameraViewActive={setIsCameraViewActive}
              isCameraSettingsOpen={isCameraSettingsModalOpen}
              setIsCameraSettingsOpen={setIsCameraSettingsModalOpen}
              cameraSettings={cameraSettings}
              setCameraSettings={setCameraSettings}
              onExportImage={handleExportImage}
              onExportVideo={handleExportVideo}
            />
          ) : (
            <>
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-[#666] uppercase tracking-wider">Manual Calibration</h3>
                  <div className="px-2 py-0.5 rounded bg-[#FC3434]/10 text-[#FC3434] text-[10px] font-bold border border-[#FC3434]/20">
                    {state.calibrationPoints.length} POINTS
                  </div>
                </div>
                
                <MiniPitch 
                  activeNodeId={state.activeNodeId}
                  mappedNodeIds={state.calibrationPoints.map(p => p.id)}
                  customNodes={state.customNodes}
                  onSelectNode={(id) => setState(prev => ({ ...prev, activeNodeId: id }))}
                  onAddCustomNode={handleAddCustomNode}
                />
                
                <div className="mt-4 p-3 rounded bg-[#FC3434]/5 border border-[#FC3434]/10">
                  <p className="text-[11px] text-[#FC3434]/80 leading-relaxed font-medium">
                    {state.activeNodeId 
                      ? `NOW PLACING: ${activeNode?.name}. Click the location on the broadcast image below.`
                      : "Select a point on the pitch map above to begin mapping it to the image."
                    }
                  </p>
                </div>
              </section>

              <section className="flex-1 min-h-0 overflow-y-auto pr-2 no-scrollbar">
                <h4 className="text-[10px] font-bold text-[#999] uppercase tracking-widest mb-3 flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-[#FC3434]" />
                  Active Mappings
                </h4>
                <div className="space-y-1.5">
                  {state.calibrationPoints.length === 0 && (
                    <div className="text-[11px] text-[#999] py-8 text-center border border-dashed border-[#ddd] rounded-lg">
                      No points mapped yet
                    </div>
                  )}
                  {state.calibrationPoints.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg group border border-[#eee] hover:border-[#FC3434]/20 transition-all shadow-sm">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-5 h-5 rounded bg-[#FC3434]/10 text-[#FC3434] text-[10px] font-bold flex items-center justify-center shrink-0 border border-[#FC3434]/20">
                          {i + 1}
                        </div>
                        <span className="text-[11px] truncate text-black/80 font-medium">
                          {[...CALIBRATION_NODES, ...state.customNodes].find(n => n.id === p.id)?.name}
                        </span>
                      </div>
                      <button 
                        onClick={() => removeCalibrationPoint(p.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <button 
                onClick={() => setState(prev => ({ ...prev, calibrationPoints: [], customNodes: [] }))}
                className="w-full py-2.5 border border-red-900/20 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 text-[10px] uppercase font-bold rounded-lg transition-all"
              >
                Clear All Data
              </button>
            </>
          )}
        </aside>

        {/* Viewports Container */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          <SegmentStrip 
            people={state.detectedPeople} 
            selectedId={state.selectedId} 
            onSelect={(id) => setState(prev => ({ ...prev, selectedId: id }))} 
            onUpdatePerson={(id, updates) => setState(prev => ({
              ...prev,
              detectedPeople: prev.detectedPeople.map(p => p.id === id ? { ...p, ...updates } : p)
            }))}
          />
          
          <div className="flex-1 flex overflow-hidden p-6 gap-6">
            {/* 2D Image Panel */}
            <div className={`relative bg-[#f5f5f5] border border-[#eee] overflow-hidden group shadow-lg rounded-xl ${state.fullscreenView === '3d' ? 'hidden' : 'flex-1'}`}>
              {!state.image && !state.videoUrl ? (
                <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-[#eee] transition-all">
                  <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
                  <div className="p-8 rounded-3xl bg-[#FC3434]/5 border border-[#FC3434]/10 mb-6 group-hover:scale-110 transition-transform">
                    <svg className="w-12 h-12 text-[#FC3434]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-xl font-semibold tracking-tight text-black">Broadcast View</p>
                  <p className="text-sm text-[#999] mt-2">Upload a match photo or video to begin</p>
                </label>
              ) : (
                <>
                  <div className="w-full h-full flex items-center justify-center">
                    <div 
                      className={`relative ${state.activeNodeId ? 'cursor-crosshair' : ''}`}
                    style={{
                      aspectRatio: state.imageDimensions ? `${state.imageDimensions.width} / ${state.imageDimensions.height}` : 'auto',
                      maxHeight: '100%',
                      maxWidth: '100%'
                    }}
                  >
                    {state.mediaType === 'video' ? (
                      <video 
                        ref={videoRef}
                        src={state.videoUrl!} 
                        className="w-full h-full block" 
                        controls
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <img 
                        src={state.image?.startsWith('http') ? `${window.location.origin}/api/proxy-image?url=${encodeURIComponent(state.image)}` : state.image!} 
                        className="w-full h-full block pointer-events-none" 
                        alt="Source" 
                        referrerPolicy="no-referrer" 
                      />
                    )}
                    
                    <CalibrationOverlay 
                      isVisible={state.isCalibrating}
                      points={state.calibrationPoints}
                      customNodes={state.customNodes}
                      matrix={state.homographyMatrix}
                      onPointMove={updateCalibrationPoint}
                      onNodeMap={handleNodeMap}
                      onMapClick={handleImageClick}
                      activeNodeId={state.activeNodeId}
                    />

                    {/* Node Placement Prompt */}
                    {state.activeNodeId && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="px-6 py-3 rounded-full bg-[#FC3434]/90 text-white text-sm font-bold shadow-2xl animate-bounce backdrop-blur-md flex items-center gap-3">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}/></svg>
                          PLACE {activeNode?.name.toUpperCase()}
                        </div>
                      </div>
                    )}

                    {!state.isCalibrating && (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        {state.detectedPeople.map((person) => (
                          <g key={person.id}>
                            <rect 
                              x={`${person.bbox[0]}%`} 
                              y={`${person.bbox[1]}%`} 
                              width={`${person.bbox[2]}%`} 
                              height={`${person.bbox[3]}%`}
                              fill={state.selectedId === person.id ? "rgba(252, 52, 52, 0.15)" : "transparent"}
                              stroke={state.selectedId === person.id ? "#FC3434" : "rgba(0,0,0,0.2)"}
                              strokeWidth="2.5"
                              className="transition-all duration-500"
                            />
                          </g>
                        ))}
                      </svg>
                    )}
                  </div>
                </div>

              <div className="absolute top-6 right-6 flex gap-2">
                    <button 
                      onClick={() => setState(prev => ({ ...prev, fullscreenView: prev.fullscreenView === 'image' ? null : 'image' }))}
                      className="flex items-center justify-center w-10 h-10 rounded-full bg-white/80 border border-[#eee] text-black/80 hover:bg-white hover:text-black transition-all shadow-lg backdrop-blur-md"
                      title={state.fullscreenView === 'image' ? "Exit Fullscreen" : "Fullscreen"}
                    >
                      {state.fullscreenView === 'image' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m5 5v-4m0 4H5m10 0l5-5m-5 5v-4m0 4h4M9 15l-5 5m5-5v4m0-4H5m10 0l5 5m-5-5v4m0-4h4" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      )}
                    </button>
                    <button 
                      onClick={handleFalScan}
                      disabled={state.isAnalyzing}
                      className="flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-bold border bg-white/80 border-[#eee] text-black/90 hover:bg-white transition-all shadow-lg backdrop-blur-md disabled:opacity-50"
                    >
                      {state.isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-[#FC3434] border-t-transparent rounded-full animate-spin" />
                          SCANNING {state.scanProgress}%
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 text-[#FC3434]" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                          SCAN
                        </>
                      )}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setState(prev => ({ ...prev, isCalibrating: !prev.isCalibrating })); }}
                      className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-bold border transition-all shadow-lg backdrop-blur-md ${state.isCalibrating ? 'bg-[#FC3434] border-[#FC3434] text-white' : 'bg-white/80 border-[#eee] text-black/90 hover:bg-white'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                      {state.isCalibrating ? 'CALIBRATION MODE' : 'PLAYER VIEW'}
                    </button>
                  </div>

                  <div className="absolute bottom-6 right-6 flex gap-2">
                    <label className="flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-bold border bg-white/80 border-[#eee] text-black/90 hover:bg-white transition-all shadow-lg backdrop-blur-md cursor-pointer">
                      <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      CHANGE MEDIA
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* 3D Viewport Panel */}
            <div className={`flex flex-col min-w-0 ${state.fullscreenView === 'image' ? 'hidden' : 'flex-1'}`}>
              <div className="flex-1 overflow-hidden shadow-lg relative rounded-xl border border-[#eee]">
                <ThreeDViewport 
                  selectedPerson={selectedPerson} 
                  allPeople={state.detectedPeople} 
                  homographyMatrix={state.homographyMatrix}
                  calibrationPoints={state.calibrationPoints}
                  imageDimensions={state.imageDimensions}
                  isFullscreen={state.fullscreenView === '3d'}
                  onFullscreenToggle={() => setState(prev => ({ ...prev, fullscreenView: prev.fullscreenView === '3d' ? null : '3d' }))}
                  onSelectPerson={(id) => setState(prev => ({ ...prev, selectedId: id }))}
                  onPitchClick={(point) => {
                    if (activeAnalysisTool === 'distance' || activeAnalysisTool === 'arrow') {
                      setMeasurements(prev => {
                        let active = prev.find(m => m.id === activeMeasurementId);
                        
                        if (!active || active.points.length >= 2) {
                          const newId = Math.random().toString(36).substring(7);
                          setActiveMeasurementId(newId);
                          return [...prev, { id: newId, type: activeAnalysisTool, points: [point] }];
                        } else {
                          return prev.map(m => m.id === activeMeasurementId ? { ...m, points: [...m.points, point] } : m);
                        }
                      });
                    }
                  }}
                  measurements={measurements}
                  activeMeasurementId={activeMeasurementId}
                  overlayEnabled={overlayEnabled}
                  overlayOpacity={overlayOpacity}
                  image={state.image}
                  videoUrl={state.videoUrl}
                  activeTool={activeAnalysisTool}
                  transformMode={transformMode}
                  onUpdatePerson={(id, updates) => setState(prev => ({
                    ...prev,
                    detectedPeople: prev.detectedPeople.map(p => p.id === id ? { ...p, ...updates } : p)
                  }))}
                  billboards={billboards}
                  setBillboards={setBillboards}
                  selectedBillboardId={selectedBillboardId}
                  setSelectedBillboardId={setSelectedBillboardId}
                  ref={viewportRef}
                  cameraSettings={cameraSettings}
                  isCameraViewActive={isCameraViewActive}
                  keyframes={keyframes}
                  isPlayingCamera={isPlayingCamera}
                  timelineTime={timelineTime}
                />
              </div>
              {state.fullscreenView === '3d' && (
                <div className="h-20 bg-white border border-[#eee] rounded-xl mt-4 shadow-sm flex flex-col justify-center px-4 gap-2 flex-shrink-0 relative">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                       <button 
                         className={`p-2 rounded-lg transition-colors ${isPlayingCamera ? 'bg-[#FC3434]/20 text-[#FC3434]' : 'bg-[#f0f0f0] hover:bg-[#e0e0e0] text-[#666]'}`}
                         onClick={togglePlay}
                         title={isPlayingCamera ? "Pause" : "Play"}
                       >
                         {isPlayingCamera ? (
                           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                         ) : (
                           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                         )}
                       </button>
                       <span className="text-xs font-mono font-bold text-black/60 hidden md:block select-none w-12">{formatTime(timelineTime)}</span>
                    </div>

                    <div 
                      className="flex-1 relative h-8 group cursor-pointer flex items-center"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const rawProgress = Math.max(0, Math.min(1, x / rect.width));
                        setTimelineTime(rawProgress * timelineDuration);
                        setSelectedKeyframeId(null);
                      }}
                      onMouseMove={(e) => {
                        if (e.buttons === 1) { // Left click dragging
                           const rect = e.currentTarget.getBoundingClientRect();
                           const x = e.clientX - rect.left;
                           const rawProgress = Math.max(0, Math.min(1, x / rect.width));
                           setTimelineTime(rawProgress * timelineDuration);
                        }
                      }}
                    >
                      <div className="absolute left-0 right-0 h-1.5 bg-[#eee] rounded-full pointer-events-none" />
                      <div className="absolute left-0 h-1.5 bg-[#FC3434]/50 rounded-l-full pointer-events-none" style={{ width: `${(timelineTime / timelineDuration) * 100}%` }} />
                      
                      {/* Playhead handle */}
                      <div 
                        className="absolute w-1 h-6 bg-[#FC3434] top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-sm rounded-full pointer-events-none z-10"
                        style={{ left: `${(timelineTime / timelineDuration) * 100}%` }}
                      >
                         <div className="absolute -top-3 -left-2 w-5 h-3 bg-[#FC3434] rounded-sm flex items-center justify-center">
                            <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-[#FC3434] absolute -bottom-1" />
                         </div>
                      </div>

                      {/* Keyframes */}
                      {keyframes.map((kf) => (
                        <div 
                          key={kf.id}
                          className={`absolute w-3.5 h-3.5 rounded-full top-1/2 -translate-y-1/2 transform -translate-x-1/2 cursor-pointer border-2 transition-transform ${selectedKeyframeId === kf.id ? 'bg-[#FC3434] border-white scale-125 z-20 shadow-md' : 'bg-black border-white hover:scale-125 z-0'}`}
                          style={{ left: `${(kf.time / timelineDuration) * 100}%` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKeyframeId(kf.id);
                            setTimelineTime(kf.time);
                          }}
                          title={`Keyframe at ${formatTime(kf.time)}`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 border border-[#eee] bg-[#f8f8f8] px-2 py-1 rounded-lg" title="Timeline duration (mm:ss)">
                        <label className="text-[10px] uppercase font-bold text-[#999]">DUR</label>
                        <input 
                          type="text" 
                          value={durationStr}
                          onChange={(e) => setDurationStr(e.target.value)}
                          onBlur={() => applyDuration(durationStr)}
                          onKeyDown={(e) => e.key === 'Enter' && applyDuration(durationStr)}
                          className="w-10 text-xs font-mono font-bold bg-transparent text-center focus:outline-none text-[#333]"
                        />
                      </div>

                      <div className="w-[1px] h-6 bg-[#eee]" />

                      {/* Add/Update Keyframe */}
                      <button 
                        className="p-1.5 rounded-lg bg-black text-white hover:bg-black/80 transition-colors"
                        onClick={() => {
                          if (viewportRef.current) {
                            const camState = viewportRef.current.getCameraState();
                            const existingIdx = keyframes.findIndex(k => Math.abs(k.time - timelineTime) < 0.05);
                            if (existingIdx >= 0) {
                               const newKf = [...keyframes];
                               newKf[existingIdx] = { ...newKf[existingIdx], position: camState.position, target: camState.target, fov: camState.fov };
                               setKeyframes(newKf);
                               setSelectedKeyframeId(newKf[existingIdx].id);
                            } else {
                               const newKeyframe = {
                                 id: Math.random().toString(36).substring(7),
                                 time: timelineTime,
                                 position: camState.position,
                                 target: camState.target,
                                 fov: camState.fov
                               };
                               setKeyframes([...keyframes, newKeyframe]);
                               setSelectedKeyframeId(newKeyframe.id);
                            }
                          }
                        }}
                        title="Add/Update Keyframe at Playhead"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>

                      {/* Delete Selected Keyframe */}
                      <button 
                        className={`p-1.5 rounded-lg border transition-colors ${selectedKeyframeId ? 'border-[#FC3434] text-[#FC3434] hover:bg-[#FC3434]/10 bg-white' : 'border-[#eee] text-[#ccc] cursor-not-allowed bg-[#f8f8f8]'}`}
                        disabled={!selectedKeyframeId}
                        onClick={() => {
                          if (selectedKeyframeId) {
                            setKeyframes(keyframes.filter(k => k.id !== selectedKeyframeId));
                            setSelectedKeyframeId(null);
                          }
                        }}
                        title="Delete Selected Keyframe"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {state.error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 bg-red-600/90 backdrop-blur-md text-white rounded-xl shadow-2xl flex items-center gap-3 z-50 border border-red-400/20">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>
          <span className="text-sm font-medium">{state.error}</span>
          <button onClick={() => setState(p => ({...p, error: null}))} className="ml-2 hover:opacity-70 p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
      />
      
      <SaveSceneModal 
        isOpen={isSaveSceneModalOpen} 
        onClose={() => setIsSaveSceneModalOpen(false)} 
        state={state}
        measurements={measurements}
      />

      <LoadSceneModal 
        isOpen={isLoadSceneModalOpen} 
        onClose={() => setIsLoadSceneModalOpen(false)} 
        onLoad={(loadedState, loadedMeasurements) => {
          setState(prev => ({
            ...prev,
            ...loadedState,
            mediaType: 'image',
            videoUrl: null,
            // Reset some UI state
            selectedId: null,
            isAnalyzing: false,
            error: null,
            activeNodeId: null,
            scanProgress: 0,
          }));
          if (loadedMeasurements) {
            setMeasurements(loadedMeasurements);
            setActiveMeasurementId(null);
          } else {
            setMeasurements([]);
            setActiveMeasurementId(null);
          }
          setActiveAnalysisTool(null);
          setOverlayEnabled(false);
          setOverlayOpacity(0.5);
        }}
      />
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;