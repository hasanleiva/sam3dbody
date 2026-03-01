import React, { Suspense, useMemo, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Float, useProgress } from '@react-three/drei';
import { HumanModel } from './HumanModel';
import { DetectedPerson, CalibrationPoint } from '../types';
import { PITCH_LINES } from '../utils/homography';
import * as THREE from 'three';
import { PLYLoader } from 'three-stdlib';
import { useLoader } from '@react-three/fiber';

declare const cv: any;

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#080808] text-white">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm font-bold tracking-widest uppercase">Scene is loading</p>
      <p className="text-xs text-white/50 mt-2">{Math.round(progress)}%</p>
    </div>
  );
}

const PersonMesh = ({ url, color }: { url: string, color: string }) => {
  const geometry = useLoader(PLYLoader, url);
  
  const clonedGeometry = useMemo(() => {
    const geom = geometry.clone();
    geom.computeBoundingBox();
    const center = new THREE.Vector3();
    geom.boundingBox?.getCenter(center);
    geom.translate(-center.x, -center.y, -center.z);
    
    const size = new THREE.Vector3();
    geom.boundingBox?.getSize(size);
    const scale = 1.8 / size.y;
    geom.scale(scale, scale, scale);
    
    geom.computeBoundingBox();
    geom.translate(0, -geom.boundingBox!.min.y, 0);
    
    geom.computeVertexNormals();
    return geom;
  }, [geometry]);

  return (
    <mesh geometry={clonedGeometry}>
      <meshStandardMaterial 
        vertexColors={clonedGeometry.hasAttribute('color')} 
        color={clonedGeometry.hasAttribute('color') ? undefined : color} 
        roughness={0.6}
      />
    </mesh>
  );
};

interface ThreeDViewportProps {
  selectedPerson: DetectedPerson | null;
  allPeople: DetectedPerson[];
  homographyMatrix: number[] | null;
  calibrationPoints: CalibrationPoint[];
}

const Pitch3D: React.FC = () => {
  const pitchTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1324; // 105:68 ratio approx
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Grass Base
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mown Grass Stripes
    const stripeCount = 12;
    const stripeWidth = canvas.width / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = '#264d21';
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, canvas.height);
      }
    }

    // Scaling factors from world (105x68) to canvas
    const scaleX = canvas.width / 105;
    const scaleY = canvas.height / 68;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Draw lines from PITCH_LINES
    PITCH_LINES.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line[0][0] * scaleX, line[0][1] * scaleY);
      ctx.lineTo(line[1][0] * scaleX, line[1][1] * scaleY);
      ctx.stroke();
    });

    // Center Circle
    ctx.beginPath();
    ctx.arc(52.5 * scaleX, 34 * scaleY, 9.15 * scaleX, 0, Math.PI * 2);
    ctx.stroke();

    // Center Spot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(52.5 * scaleX, 34 * scaleY, 0.4 * scaleX, 0, Math.PI * 2);
    ctx.fill();

    // Penalty Spots
    ctx.beginPath();
    ctx.arc(11 * scaleX, 34 * scaleY, 0.4 * scaleX, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc((105 - 11) * scaleX, 34 * scaleY, 0.4 * scaleX, 0, Math.PI * 2);
    ctx.fill();

    // Penalty Arcs
    // Left
    ctx.beginPath();
    ctx.arc(11 * scaleX, 34 * scaleY, 9.15 * scaleX, -0.926, 0.926);
    ctx.stroke();
    // Right
    ctx.beginPath();
    ctx.arc((105 - 11) * scaleX, 34 * scaleY, 9.15 * scaleX, Math.PI - 0.926, Math.PI + 0.926);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    return texture;
  }, []);

  return (
    <group>
      {/* Grass Surround (Outer) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[125, 88]} />
        <meshStandardMaterial color="#1a331a" roughness={1} />
      </mesh>

      {/* Main Pitch with Texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[105, 68]} />
        <meshStandardMaterial 
          map={pitchTexture} 
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
};

export const ThreeDViewport: React.FC<ThreeDViewportProps> = ({ selectedPerson, allPeople, homographyMatrix, calibrationPoints }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera>(null);
  const controlsRef = React.useRef<any>(null);

  const matchCameraToBroadcast = useCallback(() => {
    if (!calibrationPoints || calibrationPoints.length < 4 || !cameraRef.current || !controlsRef.current || !containerRef.current) return;

    try {
      if (typeof cv !== 'undefined' && cv.solvePnP) {
        const W = containerRef.current.clientWidth;
        const H = containerRef.current.clientHeight;
        if (W === 0 || H === 0) return;
        
        const objectPoints: number[] = [];
        const imagePoints: number[] = [];
        
        calibrationPoints.forEach(p => {
          objectPoints.push(p.worldX, p.worldY, 0);
          imagePoints.push((p.imageX / 100) * W, (p.imageY / 100) * H);
        });

        const objMat = cv.matFromArray(calibrationPoints.length, 1, cv.CV_32FC3, objectPoints);
        const imgMat = cv.matFromArray(calibrationPoints.length, 1, cv.CV_32FC2, imagePoints);

        // Estimate focal length based on viewport
        const f = Math.max(W, H) * 1.2; 
        const cx = W / 2;
        const cy = H / 2;
        
        const camMat = cv.matFromArray(3, 3, cv.CV_64F, [
          f, 0, cx,
          0, f, cy,
          0, 0, 1
        ]);
        const distCoeffs = cv.Mat.zeros(4, 1, cv.CV_64F);

        const rvec = new cv.Mat();
        const tvec = new cv.Mat();

        // Use SOLVEPNP_EPNP for better stability with planar points, fallback to ITERATIVE
        let success = false;
        try {
           success = cv.solvePnP(objMat, imgMat, camMat, distCoeffs, rvec, tvec, false, cv.SOLVEPNP_EPNP);
        } catch (e) {
           success = cv.solvePnP(objMat, imgMat, camMat, distCoeffs, rvec, tvec, false, cv.SOLVEPNP_ITERATIVE);
        }

        if (success) {
          const R = new cv.Mat();
          cv.Rodrigues(rvec, R);
          
          const rData = R.data64F;
          const tData = tvec.data64F;
          
          // Construct the transformation matrix from world to camera
          const rotMatrix = new THREE.Matrix4().set(
            rData[0], rData[1], rData[2], tData[0],
            rData[3], rData[4], rData[5], tData[1],
            rData[6], rData[7], rData[8], tData[2],
            0, 0, 0, 1
          );
          
          // We want Camera to World
          const camToWorld = rotMatrix.clone().invert();
          
          // Extract camera position in world coordinates
          const pos = new THREE.Vector3().setFromMatrixPosition(camToWorld);
          
          // Map to Three.js Scene
          // World X -> Three X (-52.5 offset)
          // World Y -> Three Z (-34 offset)
          // World Z (up) -> Three Y
          const finalPos = new THREE.Vector3(
            pos.x - 52.5,
            Math.abs(pos.z), // ensure above ground
            pos.y - 34
          );
          
          cameraRef.current.position.copy(finalPos);
          
          // Calculate lookAt target by projecting the center of the image to the ground plane
          if (homographyMatrix) {
            const h_pct = homographyMatrix;
            const h = [
              h_pct[0] * W / 100, h_pct[1] * W / 100, h_pct[2] * W / 100,
              h_pct[3] * H / 100, h_pct[4] * H / 100, h_pct[5] * H / 100,
              h_pct[6],           h_pct[7],           h_pct[8]
            ];
            const H_mat = new THREE.Matrix3().fromArray([
              h[0], h[3], h[6],
              h[1], h[4], h[7],
              h[2], h[5], h[8]
            ]);
            const Hinv = H_mat.clone().invert();
            const centerImg = new THREE.Vector3(cx, cy, 1);
            const centerWorld = centerImg.applyMatrix3(Hinv);
            const targetX = (centerWorld.x / centerWorld.z) - 52.5;
            const targetZ = (centerWorld.y / centerWorld.z) - 34;
            
            cameraRef.current.lookAt(targetX, 0, targetZ);
            
            if (controlsRef.current) {
              controlsRef.current.target.set(targetX, 0, targetZ);
              controlsRef.current.update();
            }
          }
          
          // Update FOV
          const estimatedFov = 2 * Math.atan((H / 2) / f) * (180 / Math.PI);
          cameraRef.current.fov = estimatedFov;
          cameraRef.current.aspect = W / H;
          cameraRef.current.updateProjectionMatrix();

          // Cleanup
          objMat.delete(); imgMat.delete(); camMat.delete(); distCoeffs.delete();
          rvec.delete(); tvec.delete(); R.delete();
          return;
        }
      }
    } catch (e) {
      console.error("solvePnP failed", e);
    }
  }, [calibrationPoints, homographyMatrix]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#080808] relative overflow-hidden rounded-lg">
      <Loader />
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera 
          ref={cameraRef}
          makeDefault 
          position={[0, 40, 60]} 
          fov={35} 
        />
        <OrbitControls 
          ref={controlsRef}
          makeDefault 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2.1} 
          target={[0, 0, 0]}
        />
        
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[50, 50, 50]} 
          intensity={1.2} 
          castShadow 
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-30, 20, -30]} intensity={0.5} />

        <Suspense fallback={null}>
          <Environment preset="night" />
          
          <Pitch3D />

          {allPeople.map((person) => {
            if (!person.worldPos) return null;
            
            const isSelected = selectedPerson?.id === person.id;
            const [wx, wy] = person.worldPos;
            
            return (
              <group 
                key={person.id} 
                position={[wx - 52.5, 0, wy - 34]}
              >
                {isSelected ? (
                  <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
                    {person.meshUrl ? (
                      <PersonMesh url={person.meshUrl} color="#3b82f6" />
                    ) : (
                      <HumanModel 
                        rotation={person.pose.rotation} 
                        scale={1.8} 
                        color="#3b82f6"
                      />
                    )}
                  </Float>
                ) : (
                  person.meshUrl ? (
                    <PersonMesh url={person.meshUrl} color="#444" />
                  ) : (
                    <HumanModel 
                      rotation={person.pose.rotation} 
                      scale={1.8} 
                      color="#444" 
                    />
                  )
                )}
                
                {/* Selection Indicator */}
                {isSelected && (
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                    <ringGeometry args={[0.8, 1.0, 32]} />
                    <meshBasicMaterial color="#3b82f6" />
                  </mesh>
                )}
              </group>
            );
          })}

          <ContactShadows opacity={0.6} scale={120} blur={2} far={10} resolution={512} color="#000" />
        </Suspense>
      </Canvas>
      
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-[10px] font-bold text-white tracking-[0.2em] uppercase">Tactical Analysis View</span>
      </div>

      <div className="absolute top-4 right-4 flex gap-2">
        <button 
          onClick={matchCameraToBroadcast}
          disabled={!homographyMatrix}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border shadow-lg backdrop-blur-md ${
            homographyMatrix 
              ? 'bg-blue-600 border-blue-400 text-white hover:bg-blue-500' 
              : 'bg-black/40 border-white/5 text-white/20 cursor-not-allowed'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Match Broadcast View
        </button>
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
         <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10 text-[10px] text-white/60">
            <p>Pitch: 105m x 68m</p>
            <p>Units: Metric (Meters)</p>
         </div>
      </div>
    </div>
  );
};