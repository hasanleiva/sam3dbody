import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { SegmentStrip } from './components/SegmentStrip';
import { ThreeDViewport } from './components/ThreeDViewport';
import { CalibrationOverlay } from './components/CalibrationOverlay';
import { MiniPitch } from './components/MiniPitch';
import { AppState, DetectedPerson, CalibrationPoint } from './types';
import { calculateHomography, CALIBRATION_NODES, projectPoint } from './utils/homography';
import { fal } from '@fal-ai/client';

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

const App: React.FC = () => {
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
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setState(prev => ({ ...prev, image: base64, detectedPeople: [], selectedId: null, error: null }));
    };
    reader.readAsDataURL(file);
  }, []);

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

  const handleFalScan = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!state.image) return;
    
    const falKey = import.meta.env.VITE_FAL_KEY;
    if (!falKey) {
      setState(prev => ({ ...prev, error: "Please set VITE_FAL_KEY in your environment variables." }));
      return;
    }

    // Configure fal client with the key
    fal.config({
      credentials: () => falKey,
    });

    setState(prev => ({ ...prev, isAnalyzing: true, scanProgress: 10 }));
    
    try {
      // 1. Upload the base64 image to fal.ai's storage first
      // The SAM 3D API requires a URL, so we upload the data URL to get a public URL
      const file = await (await fetch(state.image)).blob();
      const uploadedUrl = await fal.storage.upload(file);
      
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

      const data = result;

      const img = new Image();
      img.src = state.image;
      await new Promise(r => {
        img.onload = r;
        img.onerror = r;
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

        return {
          id: `fal-${p.person_id}`,
          name: `Player ${p.person_id + 1}`,
          thumbnail,
          confidence: 0.99,
          box: [x1, y1, x2 - x1, y2 - y1],
          bbox: [(x1 / imgWidth) * 100, (y1 / imgHeight) * 100, ((x2 - x1) / imgWidth) * 100, ((y2 - y1) / imgHeight) * 100] as [number, number, number, number],
          worldPos,
          pose: { rotation: [0, 0, 0], scale: 1, activity: "FAL 3D Body" },
          meshUrl: data.meshes[idx]?.url
        };
      }));

      setState(prev => ({ 
        ...prev, 
        detectedPeople: [...prev.detectedPeople, ...newPeople],
        isAnalyzing: false,
        scanProgress: 100
      }));
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, error: `Fal.ai Scan failed: ${err.message}`, isAnalyzing: false, scanProgress: 0 }));
    }
  };

  const selectedPerson = state.detectedPeople.find(p => p.id === state.selectedId) || null;
  const allNodes = [...CALIBRATION_NODES, ...state.customNodes];
  const activeNode = allNodes.find(n => n.id === state.activeNodeId);

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white overflow-hidden">
      <Header />
      
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 bg-[#090909] border-r border-[#1a1a1a] flex flex-col p-4 gap-6 overflow-y-auto no-scrollbar">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-[#888] uppercase tracking-wider">Manual Calibration</h3>
              <div className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20">
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
            
            <div className="mt-4 p-3 rounded bg-blue-500/5 border border-blue-500/10">
              <p className="text-[11px] text-blue-400/80 leading-relaxed font-medium">
                {state.activeNodeId 
                  ? `NOW PLACING: ${activeNode?.name}. Click the location on the broadcast image below.`
                  : "Select a point on the pitch map above to begin mapping it to the image."
                }
              </p>
            </div>
          </section>

          <section className="flex-1 min-h-0 overflow-y-auto pr-2 no-scrollbar">
            <h4 className="text-[10px] font-bold text-[#444] uppercase tracking-widest mb-3 flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-500" />
              Active Mappings
            </h4>
            <div className="space-y-1.5">
              {state.calibrationPoints.length === 0 && (
                <div className="text-[11px] text-[#333] py-8 text-center border border-dashed border-[#222] rounded-lg">
                  No points mapped yet
                </div>
              )}
              {state.calibrationPoints.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between bg-[#141414] p-2.5 rounded-lg group border border-transparent hover:border-blue-500/20 transition-all">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-5 h-5 rounded bg-blue-600/10 text-blue-500 text-[10px] font-bold flex items-center justify-center shrink-0 border border-blue-500/20">
                      {i + 1}
                    </div>
                    <span className="text-[11px] truncate text-white/80 font-medium">
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
        </aside>

        {/* Viewports Container */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#070707]">
          <SegmentStrip 
            people={state.detectedPeople} 
            selectedId={state.selectedId} 
            onSelect={(id) => setState(prev => ({ ...prev, selectedId: id }))} 
          />
          
          <div className="flex-1 flex overflow-hidden p-6 gap-6">
            {/* 2D Image Panel */}
            <div className="flex-1 relative bg-[#111] rounded-xl border border-[#1a1a1a] overflow-hidden group shadow-2xl">
              {!state.image ? (
                <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-[#151515] transition-all">
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                  <div className="p-8 rounded-3xl bg-blue-500/5 border border-blue-500/10 mb-6 group-hover:scale-110 transition-transform">
                    <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-xl font-semibold tracking-tight">Broadcast View</p>
                  <p className="text-sm text-[#555] mt-2">Upload a match photo to begin</p>
                </label>
              ) : (
                <div 
                  className={`w-full h-full relative ${state.activeNodeId ? 'cursor-crosshair' : ''}`}
                >
                  <img src={state.image} className="w-full h-full object-contain pointer-events-none" alt="Source" />
                  
                  <CalibrationOverlay 
                    isVisible={state.isCalibrating}
                    points={state.calibrationPoints}
                    customNodes={state.customNodes}
                    matrix={state.homographyMatrix}
                    onPointMove={updateCalibrationPoint}
                    onNodeMap={handleNodeMap}
                    onMapClick={handleImageClick}
                  />

                  {/* Node Placement Prompt */}
                  {state.activeNodeId && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="px-6 py-3 rounded-full bg-blue-600/90 text-white text-sm font-bold shadow-2xl animate-bounce backdrop-blur-md flex items-center gap-3">
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
                            fill={state.selectedId === person.id ? "rgba(59, 130, 246, 0.15)" : "transparent"}
                            stroke={state.selectedId === person.id ? "#3b82f6" : "rgba(255,255,255,0.2)"}
                            strokeWidth="2.5"
                            className="transition-all duration-500"
                          />
                        </g>
                      ))}
                    </svg>
                  )}

                  <div className="absolute top-6 right-6 flex gap-2">
                    <button 
                      onClick={handleFalScan}
                      disabled={state.isAnalyzing}
                      className="flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-bold border bg-black/60 border-white/10 text-white/90 hover:bg-black/80 transition-all shadow-xl backdrop-blur-md disabled:opacity-50"
                    >
                      {state.isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                          SCANNING {state.scanProgress}%
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                          FAL.AI SCAN
                        </>
                      )}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setState(prev => ({ ...prev, isCalibrating: !prev.isCalibrating })); }}
                      className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-bold border transition-all shadow-xl backdrop-blur-md ${state.isCalibrating ? 'bg-blue-600 border-blue-400 text-white' : 'bg-black/60 border-white/10 text-white/90 hover:bg-black/80'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                      {state.isCalibrating ? 'CALIBRATION MODE' : 'PLAYER VIEW'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3D Viewport Panel */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 rounded-xl border border-[#1a1a1a] overflow-hidden shadow-2xl relative">
                <ThreeDViewport 
                  selectedPerson={selectedPerson} 
                  allPeople={state.detectedPeople} 
                  homographyMatrix={state.homographyMatrix}
                  calibrationPoints={state.calibrationPoints}
                />
              </div>
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
    </div>
  );
};

export default App;