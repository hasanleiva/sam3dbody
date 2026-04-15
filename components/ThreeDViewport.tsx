import React, { Suspense, useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Float, useProgress, Line, Text, TransformControls } from '@react-three/drei';
import { HumanModel } from './HumanModel';
import { DetectedPerson, CalibrationPoint, DistanceMeasurement } from '../types';
import { PITCH_LINES } from '../utils/homography';
import * as THREE from 'three';
import { PLYLoader } from 'three-stdlib';
import { useLoader } from '@react-three/fiber';

declare const cv: any;

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#D7D7D7] text-black">
      <div className="w-8 h-8 border-4 border-[#FC3434] border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm font-bold tracking-widest uppercase">Scene is loading</p>
      <p className="text-xs text-black/40 mt-2">{Math.round(progress)}%</p>
    </div>
  );
}

import vertexMapping from '../vertex_mapping.json';

const PersonMesh = ({ url, color, colors }: { url: string, color: string, colors?: { jersey: string, shorts: string, socks: string, body: string } }) => {
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
    
    if (colors) {
      const positionAttribute = geom.attributes.position;
      const vertexColors = new Float32Array(positionAttribute.count * 3);
      
      const parseColor = (hexStr: string) => {
        const c = new THREE.Color(hexStr);
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        // Boost saturation and lightness for more "colorful" look
        c.setHSL(hsl.h, Math.min(1, hsl.s * 1.2), Math.min(1, hsl.l * 1.05));
        return [c.r, c.g, c.b];
      };
      
      const defaultColor = parseColor(color);
      const jerseyColor = parseColor(colors.jersey);
      const shortsColor = parseColor(colors.shorts);
      const socksColor = parseColor(colors.socks);
      const bodyColor = parseColor('#e0ac69'); // More natural skin tone for body
      
      // Initialize with default color
      for (let i = 0; i < positionAttribute.count; i++) {
        vertexColors[i * 3] = defaultColor[0];
        vertexColors[i * 3 + 1] = defaultColor[1];
        vertexColors[i * 3 + 2] = defaultColor[2];
      }
      
      const applyGroupColor = (indices: number[], col: number[]) => {
        for (const idx of indices) {
          if (idx < positionAttribute.count) {
            vertexColors[idx * 3] = col[0];
            vertexColors[idx * 3 + 1] = col[1];
            vertexColors[idx * 3 + 2] = col[2];
          }
        }
      };
      
      applyGroupColor(vertexMapping.body, bodyColor);
      applyGroupColor(vertexMapping.jersey, jerseyColor);
      applyGroupColor(vertexMapping.shorts, shortsColor);
      applyGroupColor(vertexMapping.socks, socksColor);
      
      geom.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    }
    
    geom.computeVertexNormals();
    return geom;
  }, [geometry, color, colors?.jersey, colors?.shorts, colors?.socks, colors?.body]);

  return (
    <mesh geometry={clonedGeometry} castShadow receiveShadow>
      <meshStandardMaterial 
        vertexColors={clonedGeometry.hasAttribute('color')} 
        color={clonedGeometry.hasAttribute('color') ? undefined : color} 
        roughness={0.4}
        metalness={0.1}
        envMapIntensity={1.2}
      />
    </mesh>
  );
};

interface ThreeDViewportProps {
  selectedPerson: DetectedPerson | null;
  allPeople: DetectedPerson[];
  homographyMatrix: number[] | null;
  calibrationPoints: CalibrationPoint[];
  isFullscreen?: boolean;
  onFullscreenToggle?: () => void;
  onSelectPerson?: (id: string) => void;
  onPitchClick?: (point: [number, number, number]) => void;
  measurements?: DistanceMeasurement[];
  activeMeasurementId?: string | null;
  imageDimensions?: { width: number, height: number } | null;
  overlayEnabled?: boolean;
  overlayOpacity?: number;
  image?: string | null;
  videoUrl?: string | null;
  activeTool?: 'xg' | 'distance' | 'transform' | null;
  transformMode?: 'translate' | 'rotate';
  onUpdatePerson?: (id: string, updates: Partial<DetectedPerson>) => void;
}

const PersonGroup = ({ 
  person, 
  isSelected, 
  onSelectPerson, 
  onPitchClick, 
  activeTool, 
  transformMode,
  onUpdatePerson,
  controlsRef
}: { 
  person: DetectedPerson, 
  isSelected: boolean, 
  onSelectPerson?: (id: string) => void, 
  onPitchClick?: (point: [number, number, number]) => void,
  activeTool?: string | null,
  transformMode?: 'translate' | 'rotate',
  onUpdatePerson?: (id: string, updates: Partial<DetectedPerson>) => void,
  controlsRef: React.MutableRefObject<any>
}) => {
  const groupRef = useRef<THREE.Group>(null);

  const wx = person.worldPos![0];
  const wy = person.worldPos![1];

  const content = (
    <group 
      ref={groupRef}
      position={[wx - 52.5, 0, wy - 34]}
      rotation={person.pose.rotation}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelectPerson) {
          onSelectPerson(person.id);
        }
        if (onPitchClick) {
          onPitchClick([e.point.x, e.point.y, e.point.z]);
        }
      }}
    >
      {isSelected && activeTool !== 'transform' ? (
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
          {person.meshUrl ? (
            <PersonMesh url={person.meshUrl} color="#FC3434" colors={person.colors} />
          ) : (
            <HumanModel 
              rotation={[0, 0, 0]} 
              scale={1.8} 
              color="#FC3434"
              colors={person.colors}
            />
          )}
        </Float>
      ) : (
        person.meshUrl ? (
          <PersonMesh url={person.meshUrl} color={isSelected ? "#FC3434" : "#999"} colors={person.colors} />
        ) : (
          <HumanModel 
            rotation={[0, 0, 0]} 
            scale={1.8} 
            color={isSelected ? "#FC3434" : "#999"} 
            colors={person.colors}
          />
        )
      )}
      
      {/* Selection Indicator */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.8, 1.0, 32]} />
          <meshBasicMaterial color="#FC3434" />
        </mesh>
      )}
    </group>
  );

  if (isSelected && activeTool === 'transform') {
    return (
      <>
        <TransformControls 
          object={groupRef}
          mode={transformMode}
          onMouseUp={() => {
            if (groupRef.current && onUpdatePerson) {
              // Drag ended, save new position/rotation
              const pos = groupRef.current.position;
              const rot = groupRef.current.rotation;
              onUpdatePerson(person.id, {
                worldPos: [pos.x + 52.5, pos.z + 34],
                pose: {
                  ...person.pose,
                  rotation: [rot.x, rot.y, rot.z]
                }
              });
            }
          }}
        />
        {content}
      </>
    );
  }

  return content;
};

const GoalNet: React.FC<{ position: [number, number, number], rotation: [number, number, number] }> = ({ position, rotation }) => {
  const width = 7.32;
  const height = 2.44;
  const depthBottom = 2;
  const depthTop = 0.8;
  const postRadius = 0.06;

  const sideGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, height, 10, 12);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      
      const y_norm = (y + height / 2) / height;
      const currentDepth = depthBottom * (1 - y_norm) + depthTop * y_norm;
      
      const x_norm = x + 0.5;
      const newX = -x_norm * currentDepth;
      
      pos.setX(i, newX);
    }
    geo.computeVertexNormals();
    return geo;
  }, [height, depthBottom, depthTop]);

  return (
    <group position={position} rotation={rotation}>
      {/* Goal Frame */}
      {/* Left Post */}
      <mesh position={[0, height / 2, width / 2]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, height, 16]} />
        <meshStandardMaterial color="white" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Right Post */}
      <mesh position={[0, height / 2, -width / 2]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, height, 16]} />
        <meshStandardMaterial color="white" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Crossbar */}
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, width + postRadius * 2, 16]} />
        <meshStandardMaterial color="white" roughness={0.2} metalness={0.8} />
      </mesh>

      {/* Net - Back */}
      <group position={[-(depthBottom + depthTop) / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh rotation={[Math.atan2(depthBottom - depthTop, height), 0, 0]}>
          <planeGeometry args={[width, Math.sqrt(height * height + (depthBottom - depthTop) * (depthBottom - depthTop)), 36, 12]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} wireframe />
        </mesh>
      </group>

      {/* Net - Top */}
      <mesh position={[-depthTop / 2, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[depthTop, width, 4, 36]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} wireframe />
      </mesh>

      {/* Net - Left Side */}
      <mesh position={[0, height / 2, width / 2]} geometry={sideGeo}>
        <meshStandardMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} wireframe />
      </mesh>

      {/* Net - Right Side */}
      <mesh position={[0, height / 2, -width / 2]} geometry={sideGeo}>
        <meshStandardMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} wireframe />
      </mesh>
    </group>
  );
};

const Pitch3D: React.FC<{ onClick?: (point: [number, number, number]) => void }> = ({ onClick }) => {
  const pitchTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1324; // 105:68 ratio approx
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Grass Base
    ctx.fillStyle = '#4a8c42';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mown Grass Stripes
    const stripeCount = 12;
    const stripeWidth = canvas.width / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = '#3e7537';
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
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.01, 0]} 
        receiveShadow
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick([e.point.x, e.point.y, e.point.z]);
          }
        }}
      >
        <planeGeometry args={[125, 88]} />
        <meshStandardMaterial color="#D7D7D7" roughness={1} />
      </mesh>

      {/* Main Pitch with Texture */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick([e.point.x, e.point.y, e.point.z]);
          }
        }}
      >
        <planeGeometry args={[105, 68]} />
        <meshStandardMaterial 
          map={pitchTexture} 
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Goals */}
      <GoalNet position={[-52.5, 0, 0]} rotation={[0, 0, 0]} />
      <GoalNet position={[52.5, 0, 0]} rotation={[0, Math.PI, 0]} />
    </group>
  );
};

export const ThreeDViewport: React.FC<ThreeDViewportProps> = ({ 
  selectedPerson, 
  allPeople, 
  homographyMatrix, 
  calibrationPoints,
  isFullscreen,
  onFullscreenToggle,
  onSelectPerson,
  onPitchClick,
  measurements,
  activeMeasurementId,
  imageDimensions,
  overlayEnabled,
  overlayOpacity = 0.5,
  image,
  videoUrl,
  activeTool,
  transformMode,
  onUpdatePerson
}) => {
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
        
        const imgW = imageDimensions ? imageDimensions.width : W;
        const imgH = imageDimensions ? imageDimensions.height : H;
        
        const objectPoints: number[] = [];
        const imagePoints: number[] = [];
        
        calibrationPoints.forEach(p => {
          // Use Three.js world coordinates directly
          // Center of pitch is 0,0,0. X goes from -52.5 to 52.5, Z goes from -34 to 34, Y is 0 (ground)
          objectPoints.push(p.worldX - 52.5, 0, p.worldY - 34);
          imagePoints.push((p.imageX / 100) * imgW, (p.imageY / 100) * imgH);
        });

        const objMat = cv.matFromArray(calibrationPoints.length, 1, cv.CV_32FC3, objectPoints);
        const imgMat = cv.matFromArray(calibrationPoints.length, 1, cv.CV_32FC2, imagePoints);

        // Estimate focal length based on image dimensions
        const f = Math.max(imgW, imgH) * 1.2; 
        const cx = imgW / 2;
        const cy = imgH / 2;
        
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
          
          // Construct the transformation matrix from world to OpenCV camera
          const worldToCvCam = new THREE.Matrix4().set(
            rData[0], rData[1], rData[2], tData[0],
            rData[3], rData[4], rData[5], tData[1],
            rData[6], rData[7], rData[8], tData[2],
            0, 0, 0, 1
          );
          
          // We want OpenCV Camera to World
          const cvCamToWorld = worldToCvCam.clone().invert();
          
          // OpenCV Camera (X right, Y down, Z forward) to Three.js Camera (X right, Y up, Z backward)
          // We need to rotate 180 degrees around X axis.
          const cvToThree = new THREE.Matrix4().makeRotationX(Math.PI);
          
          // Final Three.js Camera to World matrix
          const threeCamToWorld = cvCamToWorld.multiply(cvToThree);
          
          // Apply to camera
          threeCamToWorld.decompose(cameraRef.current.position, cameraRef.current.quaternion, cameraRef.current.scale);
          
          // Set OrbitControls target by projecting the camera's forward vector to the ground plane
          const lookAtVector = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.current.quaternion);
          if (lookAtVector.y < 0) {
            const t = -cameraRef.current.position.y / lookAtVector.y;
            const target = cameraRef.current.position.clone().add(lookAtVector.multiplyScalar(t));
            if (controlsRef.current) {
              controlsRef.current.target.copy(target);
            }
          } else {
            // If looking up or parallel to ground, just set target a bit forward
            const target = cameraRef.current.position.clone().add(lookAtVector.multiplyScalar(100));
            if (controlsRef.current) {
              controlsRef.current.target.copy(target);
            }
          }
          
          if (controlsRef.current) {
            controlsRef.current.update();
          }
          
          // Update FOV based on image height
          const estimatedFov = 2 * Math.atan((imgH / 2) / f) * (180 / Math.PI);
          cameraRef.current.fov = estimatedFov;
          // Keep the aspect ratio of the 3D viewport container so it doesn't stretch
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
  }, [calibrationPoints, imageDimensions]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#D7D7D7] relative overflow-hidden rounded-lg">
      <Loader />
      <Canvas shadows dpr={[1, 2]}>
        <color attach="background" args={['#D7D7D7']} />
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
        
        <ambientLight intensity={0.8} />
        <directionalLight 
          position={[50, 50, 50]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-30, 20, -30]} intensity={0.8} />

        <Suspense fallback={null}>
          <Environment preset="city" />
          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={120} blur={2.5} far={10} />
          
          <Pitch3D onClick={onPitchClick} />

          {allPeople.map((person) => {
            if (!person.worldPos) return null;
            
            const isSelected = selectedPerson?.id === person.id;
            
            return (
              <PersonGroup 
                key={person.id}
                person={person}
                isSelected={isSelected}
                onSelectPerson={onSelectPerson}
                onPitchClick={onPitchClick}
                activeTool={activeTool}
                transformMode={transformMode}
                onUpdatePerson={onUpdatePerson}
                controlsRef={controlsRef}
              />
            );
          })}

          {measurements && measurements.map(m => {
            if (m.points.length === 0) return null;
            
            const isActive = m.id === activeMeasurementId;
            const color = isActive ? "#10b981" : "#059669";
            
            return (
              <group key={m.id}>
                {m.points.map((point, i) => (
                  <mesh key={`dp-${m.id}-${i}`} position={[point[0], 0.05, point[2]]}>
                    <sphereGeometry args={[0.3, 16, 16]} />
                    <meshBasicMaterial color={color} />
                  </mesh>
                ))}
                {m.points.length === 2 && (
                  <group>
                    <Line
                      points={[
                        [m.points[0][0], 0.05, m.points[0][2]],
                        [m.points[1][0], 0.05, m.points[1][2]]
                      ]}
                      color={color}
                      lineWidth={9}
                      transparent
                      opacity={isActive ? 1 : 0.6}
                    />
                    <Text
                      position={[
                        (m.points[0][0] + m.points[1][0]) / 2,
                        0.55,
                        (m.points[0][2] + m.points[1][2]) / 2
                      ]}
                      color="#ef4444"
                      fontSize={1.5}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[-Math.PI / 2, 0, 0]}
                      outlineWidth={0.1}
                      outlineColor="#000000"
                    >
                      {Math.sqrt(
                        Math.pow(m.points[0][0] - m.points[1][0], 2) + 
                        Math.pow(m.points[0][2] - m.points[1][2], 2)
                      ).toFixed(1)}m
                    </Text>
                  </group>
                )}
              </group>
            );
          })}

          <ContactShadows opacity={0.6} scale={120} blur={2} far={10} resolution={512} color="#000" />
        </Suspense>
      </Canvas>

      {/* Broadcast Overlay */}
      {overlayEnabled && (image || videoUrl) && (
        <div 
          className="absolute inset-0 pointer-events-none flex items-center justify-center z-10"
          style={{ opacity: overlayOpacity }}
        >
          {image ? (
            <img 
              src={image.startsWith('http') ? `${window.location.origin}/api/proxy-image?url=${encodeURIComponent(image)}` : image} 
              className="w-full h-full object-contain" 
              alt="Broadcast Overlay"
              referrerPolicy="no-referrer"
            />
          ) : videoUrl ? (
            <video 
              src={videoUrl} 
              className="w-full h-full object-contain" 
              crossOrigin="anonymous"
            />
          ) : null}
        </div>
      )}
      
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-black/5 z-20">
        <div className="w-2 h-2 rounded-full bg-[#FC3434] animate-pulse" />
        <span className="text-[10px] font-bold text-black tracking-[0.2em] uppercase">Tactical Analysis View</span>
      </div>

      <div className="absolute top-4 right-4 flex gap-2 z-20">
        {onFullscreenToggle && (
          <button 
            onClick={onFullscreenToggle}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/40 border border-black/10 text-black/80 hover:bg-white/60 hover:text-black transition-all backdrop-blur-md"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m5 5v-4m0 4H5m10 0l5-5m-5 5v-4m0 4h4M9 15l-5 5m5-5v4m0-4H5m10 0l5 5m-5-5v4m0-4h4" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        )}
        <button 
          onClick={matchCameraToBroadcast}
          disabled={!homographyMatrix}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border shadow-lg backdrop-blur-md ${
            homographyMatrix 
              ? 'bg-[#FC3434] border-[#FC3434] text-white hover:bg-[#e02e2e]' 
              : 'bg-white/40 border-black/5 text-black/20 cursor-not-allowed'
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
         <div className="bg-white/40 backdrop-blur-md p-3 rounded-xl border border-black/10 text-[10px] text-black/60">
            <p>Pitch: 105m x 68m</p>
            <p>Units: Metric (Meters)</p>
         </div>
      </div>
    </div>
  );
};