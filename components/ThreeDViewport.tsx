import React, { Suspense, useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Float, useProgress, Line, Text, TransformControls, Html } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette, N8AO, DepthOfField } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Settings2 } from 'lucide-react';
import { HumanModel } from './HumanModel';
import { DetectedPerson, CalibrationPoint, DistanceMeasurement, BillboardData, CameraSettings, CameraKeyframe } from '../types';
import { PITCH_LINES } from '../utils/homography';
import * as THREE from 'three';
import { PLYLoader, FBXLoader, SkeletonUtils, GLTFExporter } from 'three-stdlib';
import { useLoader, useThree, useFrame } from '@react-three/fiber';

import { TextPlane } from './TextPlane';

declare const cv: any;

const getAnimationState = (time: number | undefined, start: number | undefined, end: number | undefined) => {
  if (time === undefined) return { scale: 1, opacity: 1, visible: true, progress: 1, phase: 'sustain' as const };
  
  const FADE_DURATION = 0.5; // 500ms fade in/out
  
  if (start !== undefined && start !== null && time < start + FADE_DURATION) {
    if (time < start) return { scale: 0.0001, opacity: 0, visible: false, progress: 0, phase: 'before' as const };
    const progress = (time - start) / FADE_DURATION;
    return {
      scale: 0.8 + (0.2 * progress),
      opacity: progress,
      visible: true,
      progress,
      phase: 'enter' as const
    };
  }
  
  if (end !== undefined && end !== null && time > end - FADE_DURATION) {
    if (time > end) return { scale: 0.0001, opacity: 0, visible: false, progress: 1, phase: 'after' as const };
    const progress = (end - time) / FADE_DURATION;
    return {
      scale: 0.8 + (0.2 * Math.max(0, progress)),
      opacity: Math.max(0, progress),
      visible: true,
      progress,
      phase: 'exit' as const
    };
  }
  
  return { scale: 1, opacity: 1, visible: true, progress: 1, phase: 'sustain' as const };
};

const CaptureManager = ({ onGrab }: { onGrab: (state: any) => void }) => {
  const state = useThree();
  
  useEffect(() => {
    onGrab(state);
  }, [state, onGrab]);

  return null;
};

const CameraAnimator = ({ cameraRef, controlsRef, keyframes, isPlayingCamera, timelineTime, isCameraViewActive, cameraSettings }: any) => {
  const lastTimeRef = useRef(timelineTime);

  useFrame(() => {
    if (!cameraRef.current || !controlsRef.current) return;

    const timeChanged = lastTimeRef.current !== timelineTime;
    lastTimeRef.current = timelineTime;
    
    // We only force the camera position if we are playing OR if the user scrubs the playhead.
    const shouldEnforceCamera = isPlayingCamera || timeChanged;

    if (shouldEnforceCamera && keyframes && keyframes.length > 0) {
      const sorted = [...keyframes].sort((a, b) => a.time - b.time);
      let k1 = sorted[0];
      let k2 = sorted[sorted.length - 1];
      
      if (timelineTime <= k1.time) {
        k2 = k1;
      } else if (timelineTime >= k2.time) {
        k1 = k2;
      } else {
        for (let i = 0; i < sorted.length - 1; i++) {
          if (timelineTime >= sorted[i].time && timelineTime <= sorted[i+1].time) {
            k1 = sorted[i];
            k2 = sorted[i+1];
            break;
          }
        }
      }

      if (k1 && k2) {
        const range = k2.time - k1.time;
        const progress = range > 0 ? (timelineTime - k1.time) / range : 0;
        
        cameraRef.current.position.lerpVectors(
          new THREE.Vector3(...k1.position),
          new THREE.Vector3(...k2.position),
          progress
        );
        controlsRef.current.target.lerpVectors(
          new THREE.Vector3(...k1.target),
          new THREE.Vector3(...k2.target),
          progress
        );
        cameraRef.current.fov = THREE.MathUtils.lerp(k1.fov, k2.fov, progress);
        cameraRef.current.updateProjectionMatrix();
        controlsRef.current.update();
      }
    } else if (isCameraViewActive && cameraSettings && !isPlayingCamera) {
      if (Math.abs(cameraRef.current.fov - cameraSettings.fov) > 0.1) {
        cameraRef.current.fov = cameraSettings.fov;
        cameraRef.current.updateProjectionMatrix();
      }
    }
  });
  return null;
};

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

import { extractRigPose } from '../utils/poseExtractor';

const R2_BASE = import.meta.env.VITE_R2_STORAGE_URL || '';

export const getProxiedUrl = (urlStr: string) => {
  if (!urlStr) return urlStr;
  
  if (urlStr.startsWith('http')) {
    return `/api/proxy-model?url=${encodeURIComponent(urlStr)}`;
  }
  return urlStr;
};

const PersonMesh = ({ url, color, colors, textureUrl, bodyModelUrl }: { url: string, color: string, colors?: { jersey: string, shorts: string, socks: string, body: string }, textureUrl?: string, bodyModelUrl?: string }) => {
  const getOldProxiedUrl = (urlStr: string) => { // keep this just in case I missed any usage, but replace usages with global one
    if (urlStr.startsWith('http')) {
      return `/api/proxy-model?url=${encodeURIComponent(urlStr)}`;
    }
    return urlStr;
  }

  const plyGeometry = useLoader(PLYLoader, getProxiedUrl(url));
  
  const fbxRigGroup = useLoader(FBXLoader, getProxiedUrl(R2_BASE ? `${R2_BASE}/models/mesh_rig.fbx` : '/models/mesh_rig.fbx'));
  
  const currentBodyUrl = bodyModelUrl || (R2_BASE ? `${R2_BASE}/models/mesh_rig_cloth.fbx` : '/models/mesh_rig_cloth.fbx');
  console.log("PersonMesh Render: url=", url, "bodyModelUrl=", bodyModelUrl, "currentBodyUrl=", currentBodyUrl);
  const fbxClothGroup = useLoader(FBXLoader, getProxiedUrl(currentBodyUrl));
  
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (textureUrl) {
      new THREE.TextureLoader().load(
        getProxiedUrl(textureUrl), 
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.flipY = true;
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          t.needsUpdate = true;
          setTexture(t);
        },
        undefined,
        (err) => {
          console.warn(`Failed to load texture at ${textureUrl}`, err);
          setTexture(null);
        }
      );
    } else {
      setTexture(null);
    }
  }, [textureUrl]);
  
  const { finalScene, scaleOffset, yOffset, xOffset, zOffset } = useMemo(() => {
    const rawSize = new THREE.Vector3();
    plyGeometry.computeBoundingBox();
    plyGeometry.boundingBox?.getSize(rawSize);
    
    // Calculate how much we need to scale the mesh to reach 1.8m
    const targetScale = 1.8 / rawSize.y;
    
    // To position correctly after scaling
    const center = new THREE.Vector3();
    plyGeometry.boundingBox?.getCenter(center);
    const scaledMinY = plyGeometry.boundingBox!.min.y * targetScale;
    const yOffset = -scaledMinY;

    const rigScene = SkeletonUtils.clone(fbxRigGroup) as THREE.Group;
    const clothScene = SkeletonUtils.clone(fbxClothGroup) as THREE.Group;
    
    // Enable shadows on the cloth scene and ensure unique geometry/materials
    clothScene.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Clone geometry so vertex colors are unique to this mesh instance
            mesh.geometry = mesh.geometry.clone();

            // Clone materials so textures/colors are unique to this mesh instance
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material = mesh.material.map(m => m.clone());
                } else {
                    mesh.material = mesh.material.clone();
                }

                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach(m => {
                    const stdMat = m as THREE.MeshStandardMaterial;
                    if (stdMat) {
                        // Will be overridden later, but set safe defaults
                        stdMat.roughness = 0.5;
                        stdMat.metalness = 0.1;
                    }
                });
            }
        }
    });
    
    let rigSkinnedMesh: THREE.SkinnedMesh | null = null;
    rigScene.traverse(child => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) rigSkinnedMesh = child as THREE.SkinnedMesh;
    });
    
    let clothSkinnedMesh: THREE.SkinnedMesh | null = null;
    clothScene.traverse(child => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) clothSkinnedMesh = child as THREE.SkinnedMesh;
    });

    if (rigSkinnedMesh && clothSkinnedMesh) {
      // PLY files are often indexed (e.g. 6890 verts), 
      // while FBX loaders often unroll meshes into non-indexed (e.g. 110622 verts).
      // If topologies are exactly the same, their non-indexed forms will align perfectly 1-to-1!
      const unrolledPly = plyGeometry.index ? plyGeometry.toNonIndexed() : plyGeometry;

      // Extract pose using original PLY vertex positions (unscaled)
      extractRigPose(rigSkinnedMesh, unrolledPly.attributes.position.array);
      
      const rigBones: Record<string, THREE.Bone> = {};
      rigSkinnedMesh.skeleton.bones.forEach(b => rigBones[b.name] = b);
      
      clothSkinnedMesh.skeleton.bones.forEach(clothBone => {
        const rigBone = rigBones[clothBone.name];
        if (rigBone) {
          clothBone.position.copy(rigBone.position);
          clothBone.quaternion.copy(rigBone.quaternion);
          clothBone.scale.copy(rigBone.scale);
        }
      });
      
      // Try to copy vertex colors from the PLY mesh to the cloth mesh (only for default rig)
      if (!bodyModelUrl) {
        if (unrolledPly.attributes.color && clothSkinnedMesh.geometry.attributes.position.count === unrolledPly.attributes.color.count) {
          clothSkinnedMesh.geometry.setAttribute('color', unrolledPly.attributes.color);
        } else if (plyGeometry.attributes.color && clothSkinnedMesh.geometry.attributes.position.count === plyGeometry.attributes.color.count) {
          clothSkinnedMesh.geometry.setAttribute('color', plyGeometry.attributes.color);
        }
      }
      
      clothScene.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          
          materials.forEach(m => {
            const mat = m as THREE.MeshStandardMaterial;
            if (mat) {
              // Material settings — low roughness/metalness for brighter look
              mat.roughness = 0.4;
              mat.metalness = 0.0;
              mat.envMapIntensity = 4.0;

              // Usually new models have 'materialkit' explicitly for the jersey.
              // Older models might just apply it universally if bodyModelUrl is not supplied.
              const isJerseyMaterial = mat.name.toLowerCase().includes('materialkit') || !bodyModelUrl || mat.name === 'Material';

              if (texture && isJerseyMaterial) {
                // Texture mode: boost via emissiveMap
                mat.map = texture;
                mat.emissiveMap = texture;
                mat.emissive.set(0xffffff);
                mat.emissiveIntensity = 0.5;
                mat.vertexColors = false;
                mat.color.set(0xffffff);
                mat.needsUpdate = true;
              } else if (bodyModelUrl && mat.map) {
                // Keep embedded texture from custom FBX!
                mat.emissiveMap = mat.map;
                mat.emissive.set(0xffffff);
                mat.emissiveIntensity = 0.2;
                mat.vertexColors = false;
                mat.color.set(0xffffff);
                mat.needsUpdate = true;
              } else if (unrolledPly.attributes.color && !bodyModelUrl) {
                // Vertex color mode: emissive white tint to lift dark colors
                mat.vertexColors = true;
                mat.map = null;
                mat.emissiveMap = null;
                mat.emissive.set(0x888888);
                mat.emissiveIntensity = 0.5;
                mat.color.set(0xffffff);
                mat.needsUpdate = true;
              } else {
                // Solid color fallback
                const baseColor = new THREE.Color(colors?.jersey || color || 0xcccccc);
                mat.vertexColors = false;
                mat.map = null;
                mat.emissiveMap = null;
                mat.emissive.copy(baseColor);
                mat.emissiveIntensity = 0.5;
                mat.color.copy(baseColor);
                mat.needsUpdate = true;
              }
            }
          });
        }
      });

      clothScene.updateMatrixWorld(true);
    }
    
    // Evaluate cloth dimensions fully to ensure exact 1.8 scale on screen.
    const clothBox = new THREE.Box3().setFromObject(clothScene);
    const clothSize = new THREE.Vector3();
    clothBox.getSize(clothSize);
    
    let adjustedScale = 1.0;
    let adjustedYOffset = 0;
    let adjustedXOffset = 0;
    let adjustedZOffset = 0;
    
    if (clothSize.y > 0) {
        adjustedScale = 1.8 / clothSize.y;
        adjustedYOffset = -(clothBox.min.y * adjustedScale);
        
        const clothCenter = new THREE.Vector3();
        clothBox.getCenter(clothCenter);
        adjustedXOffset = -(clothCenter.x * adjustedScale);
        adjustedZOffset = -(clothCenter.z * adjustedScale);
    }

    return { finalScene: clothScene, scaleOffset: adjustedScale, yOffset: adjustedYOffset, xOffset: adjustedXOffset, zOffset: adjustedZOffset };
  }, [plyGeometry, fbxRigGroup, fbxClothGroup, color, colors, texture, bodyModelUrl]);

  if (!finalScene) return null;

  return (
    <group position={[xOffset, yOffset, zOffset]} scale={[scaleOffset, scaleOffset, scaleOffset]}>
      {/* 
        The SAM3D mesh might have X/Z offsets that we need to cancel out to place it exactly at 0,0 locally.
        We wrap it in a centered scaled primitive.
       */}
      <primitive object={finalScene} />
    </group>
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
  activeTool?: 'xg' | 'distance' | 'transform' | 'arrow' | 'billboard' | null;
  transformMode?: 'translate' | 'rotate';
  onUpdatePerson?: (id: string, updates: Partial<DetectedPerson>) => void;
  billboards?: BillboardData[];
  setBillboards?: React.Dispatch<React.SetStateAction<BillboardData[]>>;
  selectedBillboardId?: string | null;
  setSelectedBillboardId?: (id: string | null) => void;
  cameraSettings?: CameraSettings;
  isCameraViewActive?: boolean;
  keyframes?: CameraKeyframe[];
  isPlayingCamera?: boolean;
  timelineTime?: number;
}

export interface ThreeDViewportRef {
  getCameraState: () => { position: [number, number, number], target: [number, number, number], fov: number };
  getCanvas: () => HTMLCanvasElement | null;
  captureHighResFrame: (width: number, height: number) => HTMLCanvasElement | null;
  startRecording: (width: number, height: number) => void;
  stopRecording: () => void;
  encodeOfflineVideo?: (width: number, height: number, fps: number, duration: number, keyframes: CameraKeyframe[], onProgress: (p: number) => void) => Promise<Blob>;
  exportSceneGLTF: (duration: number) => Promise<void>;
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
  const [target, setTarget] = useState<THREE.Group | null>(null);

  const wx = person.worldPos![0];
  const wy = person.worldPos![1];

  return (
    <>
      <group 
        ref={setTarget}
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
              <PersonMesh url={person.meshUrl} color="#FC3434" colors={person.colors} textureUrl={person.textureUrl} bodyModelUrl={person.bodyModelUrl} />
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
            <PersonMesh url={person.meshUrl} color={isSelected ? "#FC3434" : "#999"} colors={person.colors} textureUrl={person.textureUrl} bodyModelUrl={person.bodyModelUrl} />
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

        {/* Player Name Label */}
        {person.showName && (
          <Html position={[0, 2.2, 0]} center zIndexRange={[100, 0]}>
            <div className="bg-white px-2 py-1 rounded-md shadow-md border border-gray-200 text-black text-xs font-bold whitespace-nowrap pointer-events-none">
              {person.name}
            </div>
          </Html>
        )}
      </group>

      {target && isSelected && activeTool === 'transform' && (
        <TransformControls 
          object={target}
          mode={transformMode}
          onMouseUp={() => {
            if (onUpdatePerson) {
              // Drag ended, save new position/rotation
              const pos = target.position;
              const rot = target.rotation;
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
      )}
    </>
  );
};

const BillboardGroup = ({
  billboard,
  isSelected,
  onSelect,
  activeTool,
  transformMode = 'translate',
  onUpdate,
  timelineTime
}: {
  billboard: BillboardData,
  isSelected: boolean,
  onSelect?: (id: string) => void,
  activeTool?: string | null,
  transformMode?: 'translate' | 'rotate',
  onUpdate?: (id: string, updates: Partial<BillboardData>) => void,
  timelineTime?: number
}) => {
  const [target, setTarget] = useState<THREE.Group | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const anim = getAnimationState(timelineTime, billboard.startTime, billboard.endTime);

  useEffect(() => {
    if (billboard.url) {
      new THREE.TextureLoader().load(
        billboard.url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.needsUpdate = true;
          setTexture(t);
        },
        undefined,
        (err) => {
          console.warn(`Failed to load billboard texture at ${billboard.url}`, err);
          setTexture(null);
        }
      );
    }
  }, [billboard.url]);

  if (!texture) return null;

  return (
    <>
      <group 
        ref={setTarget}
        name={`billboard_${billboard.id}`}
        position={billboard.position}
        rotation={billboard.rotation || [0, 0, 0]}
        scale={[anim.scale, anim.scale, anim.scale]}
        onClick={(e) => {
          if (activeTool === 'billboard' || activeTool === 'transform') {
            e.stopPropagation();
            onSelect?.(billboard.id);
          }
        }}
        onPointerOver={() => {
            if (activeTool === 'billboard' || activeTool === 'transform') {
                document.body.style.cursor = 'pointer';
            }
        }}
        onPointerOut={() => {
            document.body.style.cursor = 'auto';
        }}
      >
        <mesh position={[0, billboard.height / 2, 0]} castShadow>
          <planeGeometry args={[billboard.width, billboard.height]} />
          <meshBasicMaterial map={texture} transparent opacity={anim.opacity} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {target && isSelected && (activeTool === 'billboard' || activeTool === 'transform') && (
        <TransformControls 
          object={target}
          mode={transformMode}
          onMouseUp={() => {
            if (onUpdate) {
              const pos = target.position;
              const rot = target.rotation;
              onUpdate(billboard.id, {
                position: [pos.x, pos.y, pos.z],
                rotation: [rot.x, rot.y, rot.z]
              });
            }
          }}
        />
      )}
    </>
  );
};

const ArcArrow: React.FC<{ start: [number, number, number], end: [number, number, number], color: string, isActive: boolean, text?: string, textColor?: string, opacity?: number, drawProgress?: number }> = ({ start, end, color, isActive, text, textColor, opacity = 1, drawProgress = 1 }) => {
  const curve = useMemo(() => {
    const startVec = new THREE.Vector3(start[0], start[1], start[2]);
    const endVec = new THREE.Vector3(end[0], end[1], end[2]);
    const distance = startVec.distanceTo(endVec);
    
    // Create a quadratic bezier curve
    const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    // Height of the arc depends on the distance
    midPoint.y += Math.max(2, distance * 0.3);
    
    return new THREE.QuadraticBezierCurve3(startVec, midPoint, endVec);
  }, [start, end]);

  const { ribbonGeometry, arrowGeometry, arrowPosition, arrowRotation, shadowRibbonGeometry, shadowArrowGeometry } = useMemo(() => {
    const ribbonWidth = 0.4;
    const ribbonThickness = 0.05;
    const segments = 64;
    
    const curveLength = curve.getLength();
    const arrowLength = 1.5;
    
    const tipT = Math.max(0.01, drawProgress);
    const arrowFraction = curveLength > 0 ? arrowLength / curveLength : 0.01;
    const tBase = Math.max(0, tipT - arrowFraction);
    
    const vertices = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * tBase;
      const pt = curve.getPoint(t);
      const tangent = curve.getTangent(t).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      let right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      if (right.lengthSq() < 0.001) right.set(1, 0, 0);
      let normal = new THREE.Vector3().crossVectors(right, tangent).normalize();
      
      const p1 = new THREE.Vector3().copy(pt).addScaledVector(right, ribbonWidth/2).addScaledVector(normal, ribbonThickness/2);
      const p2 = new THREE.Vector3().copy(pt).addScaledVector(right, -ribbonWidth/2).addScaledVector(normal, ribbonThickness/2);
      const p3 = new THREE.Vector3().copy(pt).addScaledVector(right, -ribbonWidth/2).addScaledVector(normal, -ribbonThickness/2);
      const p4 = new THREE.Vector3().copy(pt).addScaledVector(right, ribbonWidth/2).addScaledVector(normal, -ribbonThickness/2);
      
      vertices.push(p1.x, p1.y, p1.z);
      vertices.push(p2.x, p2.y, p2.z);
      vertices.push(p3.x, p3.y, p3.z);
      vertices.push(p4.x, p4.y, p4.z);
      
      if (i < segments) {
        const offset = i * 4;
        // Top
        indices.push(offset, offset + 4, offset + 5);
        indices.push(offset, offset + 5, offset + 1);
        // Bottom
        indices.push(offset + 3, offset + 2, offset + 6);
        indices.push(offset + 3, offset + 6, offset + 7);
        // Right
        indices.push(offset, offset + 3, offset + 7);
        indices.push(offset, offset + 7, offset + 4);
        // Left
        indices.push(offset + 1, offset + 5, offset + 6);
        indices.push(offset + 1, offset + 6, offset + 2);
      }
    }

    indices.push(0, 1, 2);
    indices.push(0, 2, 3);
    
    const endOffset = segments * 4;
    indices.push(endOffset, endOffset + 3, endOffset + 2);
    indices.push(endOffset, endOffset + 2, endOffset + 1);

    const rGeom = new THREE.BufferGeometry();
    rGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    rGeom.setIndex(indices);
    rGeom.computeVertexNormals();

    const basePt = curve.getPoint(tBase);
    const tipPt = curve.getPoint(tipT);
    const arrowDir = new THREE.Vector3().subVectors(tipPt, basePt);
    
    if (arrowDir.lengthSq() < 0.0001 || isNaN(arrowDir.x)) {
      arrowDir.copy(curve.getTangent(tipT).normalize());
    } else {
      arrowDir.normalize();
    }
    
    const actualArrowLength = basePt.distanceTo(tipPt);

    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, actualArrowLength);
    arrowShape.lineTo(0.6, 0);
    arrowShape.lineTo(-0.6, 0);
    arrowShape.lineTo(0, actualArrowLength);

    const arrowExtrudeSettings = { depth: ribbonThickness, bevelEnabled: false };
    const aGeom = new THREE.ExtrudeGeometry(arrowShape, arrowExtrudeSettings);
    aGeom.translate(0, 0, -ribbonThickness / 2);

    const endUp = new THREE.Vector3(0, 1, 0);
    let endRight = new THREE.Vector3().crossVectors(arrowDir, endUp).normalize();
    if (endRight.lengthSq() < 0.001) endRight.set(1, 0, 0);
    let endNormal = new THREE.Vector3().crossVectors(endRight, arrowDir).normalize();

    const matrix = new THREE.Matrix4().makeBasis(endRight, arrowDir, endNormal);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    const arrPos = basePt.toArray() as [number, number, number];
    const arrRot = [euler.x, euler.y, euler.z] as [number, number, number];

    // Create shadow geometries by flattening to Y=0.02
    const shadowRGeom = rGeom.clone();
    const rPosAttr = shadowRGeom.attributes.position;
    for (let i = 0; i < rPosAttr.count; i++) {
      rPosAttr.setY(i, 0.02);
    }

    const shadowAGeom = aGeom.clone();
    const arrowWorldMatrix = new THREE.Matrix4().compose(
      basePt,
      quaternion,
      new THREE.Vector3(1, 1, 1)
    );
    shadowAGeom.applyMatrix4(arrowWorldMatrix);
    const aPosAttr = shadowAGeom.attributes.position;
    for (let i = 0; i < aPosAttr.count; i++) {
      aPosAttr.setY(i, 0.02);
    }

    return { 
      ribbonGeometry: rGeom, 
      arrowGeometry: aGeom, 
      arrowPosition: arrPos,
      arrowRotation: arrRot,
      shadowRibbonGeometry: shadowRGeom,
      shadowArrowGeometry: shadowAGeom
    };
  }, [curve, drawProgress]);

  return (
    <group>
      {/* Shadow */}
      <mesh geometry={shadowRibbonGeometry}>
        <meshBasicMaterial color="#000000" opacity={0.3 * opacity} transparent depthWrite={false} />
      </mesh>
      <mesh geometry={shadowArrowGeometry}>
        <meshBasicMaterial color="#000000" opacity={0.3 * opacity} transparent depthWrite={false} />
      </mesh>
      
      {/* Main Arrow */}
      <mesh geometry={ribbonGeometry}>
        <meshStandardMaterial color={color} opacity={(isActive ? 1 : 0.8) * opacity} transparent side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={arrowGeometry} position={arrowPosition} rotation={arrowRotation}>
        <meshStandardMaterial color={color} opacity={(isActive ? 1 : 0.8) * opacity} transparent side={THREE.DoubleSide} />
      </mesh>

      {text && (
        <TextPlane 
            position={[curve.getPoint(0.5).x, curve.getPoint(0.5).y + 0.5, curve.getPoint(0.5).z]} 
            text={text}
            color={textColor || color}
            fontSize={50}
            rotation={[-Math.PI / 2 + Math.PI / 6, 0, 0]}
            scale={[1, 1, 1]}
            opacity={opacity}
        />
      )}
    </group>
  );
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
    // We are extending the dimensions from 105x68 to 125x88.
    // 2048 * (88 / 125) = ~1441.79
    canvas.height = 1442; 
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Grass Base (Realistic green)
    ctx.fillStyle = '#4f7b2c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mown Grass Stripes. Original had 18 for 105m. We are 125m now.
    // 18 * (125 / 105) ~ 21.4. Let's use 22.
    const stripeCount = 22;
    const stripeWidth = canvas.width / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = '#446c24';
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, canvas.height);
      }
    }

    // Add realistic noise layer
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 256;
    noiseCanvas.height = 256;
    const nCtx = noiseCanvas.getContext('2d');
    if (nCtx) {
        const idata = nCtx.createImageData(256, 256);
        const buf32 = new Uint32Array(idata.data.buffer);
        for (let i = 0; i < buf32.length; i++) {
           const isDark = Math.random() > 0.5;
           const alpha = (Math.random() * 25 | 0); // 0 to 25 opacity
           if (isDark) {
               // Black noise
               buf32[i] = (alpha << 24) | (0 << 16) | (0 << 8) | 0; 
           } else {
               // Yellow/White bright noise
               buf32[i] = ((alpha) << 24) | (200 << 16) | (230 << 8) | 200; 
           }
        }
        nCtx.putImageData(idata, 0, 0);
        
        ctx.fillStyle = ctx.createPattern(noiseCanvas, 'repeat')!;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Scaling factors from world (125x88) to canvas
    const scaleX = canvas.width / 125;
    const scaleY = canvas.height / 88;

    // Pitch layout is heavily offset 10m inwards to stay 105x68 in the middle
    const offsetX = 10 * scaleX;
    const offsetY = 10 * scaleY;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; // Slightly softer white
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Draw lines from PITCH_LINES
    PITCH_LINES.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(offsetX + line[0][0] * scaleX, offsetY + line[0][1] * scaleY);
      ctx.lineTo(offsetX + line[1][0] * scaleX, offsetY + line[1][1] * scaleY);
      ctx.stroke();
    });

    // Center Circle
    ctx.beginPath();
    ctx.arc(offsetX + 52.5 * scaleX, offsetY + 34 * scaleY, 9.15 * scaleX, 0, Math.PI * 2);
    ctx.stroke();

    // Center Spot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(offsetX + 52.5 * scaleX, offsetY + 34 * scaleY, 0.4 * scaleX, 0, Math.PI * 2);
    ctx.fill();

    // Penalty Spots
    ctx.beginPath();
    ctx.arc(offsetX + 11 * scaleX, offsetY + 34 * scaleY, 0.4 * scaleX, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(offsetX + (105 - 11) * scaleX, offsetY + 34 * scaleY, 0.4 * scaleX, 0, Math.PI * 2);
    ctx.fill();

    // Penalty Arcs
    // Left
    ctx.beginPath();
    ctx.arc(offsetX + 11 * scaleX, offsetY + 34 * scaleY, 9.15 * scaleX, -0.926, 0.926);
    ctx.stroke();
    // Right
    ctx.beginPath();
    ctx.arc(offsetX + (105 - 11) * scaleX, offsetY + 34 * scaleY, 9.15 * scaleX, Math.PI - 0.926, Math.PI + 0.926);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    return texture;
  }, []);

  return (
    <group>
      {/* Main Pitch with Texture covering 125x88m including out of bounds area */}
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
        <planeGeometry args={[125, 88]} />
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

export const ThreeDViewport = React.forwardRef<ThreeDViewportRef, ThreeDViewportProps>(({ 
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
  onUpdatePerson,
  billboards,
  setBillboards,
  selectedBillboardId,
  setSelectedBillboardId,
  cameraSettings,
  isCameraViewActive,
  keyframes,
  isPlayingCamera,
  timelineTime
}, ref) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera>(null);
  const controlsRef = React.useRef<any>(null);
  const composerRef = React.useRef<any>(null);
  const threeContext = React.useRef<any>(null);
  const [dpr, setDpr] = useState<[number, number]>([1, 2]);

  React.useImperativeHandle(ref, () => ({
    getCameraState: () => {
      if (!cameraRef.current || !controlsRef.current) {
        return { position: [0, 40, 60], target: [0, 0, 0], fov: 35 };
      }
      return {
        position: cameraRef.current.position.toArray() as [number, number, number],
        target: controlsRef.current.target.toArray() as [number, number, number],
        fov: cameraRef.current.fov
      };
    },
    getCanvas: () => {
      if (!containerRef.current) return null;
      return containerRef.current.querySelector('canvas');
    },
    captureHighResFrame: (width: number, height: number) => {
      if (!threeContext.current) return null;
      
      const { gl, scene, camera } = threeContext.current;
      
      const originalSize = new THREE.Vector2();
      gl.getSize(originalSize);
      const originalPixelRatio = gl.getPixelRatio();
      
      gl.setPixelRatio(1.0); 
      gl.setSize(width, height, false); 
      
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const cam = camera as THREE.PerspectiveCamera;
        cam.aspect = width / height;
        cam.updateProjectionMatrix();
      }
      
      if (composerRef.current) {
        composerRef.current.setSize(width, height);
        composerRef.current.render();
      } else {
        gl.render(scene, camera);
      }
      
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = width;
      targetCanvas.height = height;
      const ctx = targetCanvas.getContext('2d');
      if (ctx) {
         ctx.drawImage(gl.domElement, 0, 0, width, height);
      }
      
      gl.setPixelRatio(originalPixelRatio);
      gl.setSize(originalSize.x, originalSize.y, false);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
         const cam = camera as THREE.PerspectiveCamera;
         cam.aspect = originalSize.x / originalSize.y;
         cam.updateProjectionMatrix();
      }

      if (composerRef.current) {
        composerRef.current.setSize(originalSize.x, originalSize.y);
        composerRef.current.render();
      } else {
        gl.render(scene, camera);
      }
      
      return targetCanvas;
    },
    startRecording: (width: number, height: number) => {
      setDpr([1, 1]); // Force to 1 so the pixel ratio is strictly 1:1 for 4K
      
      if (!containerRef.current) return;
      const el = containerRef.current;
      
      const rect = el.getBoundingClientRect();
      (containerRef.current as any)._originalStyle = el.getAttribute('style') || '';
      
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      
      const scaleX = rect.width / width;
      const scaleY = rect.height / height;
      const scale = Math.min(scaleX, scaleY);
      
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = 'top left';
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.zIndex = '50';
      // R3F will automatically catch this dimension change and adjust its internal canvas size to match it!
    },
    stopRecording: () => {
      setDpr([1, 2]); 
      
      if (!containerRef.current) return;
      const el = containerRef.current;
      
      if (typeof (el as any)._originalStyle === 'string') {
        el.setAttribute('style', (el as any)._originalStyle);
      }
      
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    },
    encodeOfflineVideo: async (width: number, height: number, fps: number, duration: number, kfs: CameraKeyframe[], onProgress: (p: number) => void) => {
      if (!threeContext.current) throw new Error("No WebGL Context");
      const { gl, scene, camera } = threeContext.current;

      const MuxerMod = await import('mp4-muxer');
      
      let muxer = new MuxerMod.Muxer({
          target: new MuxerMod.ArrayBufferTarget(),
          video: {
              codec: 'avc',
              width,
              height
          },
          fastStart: 'in-memory'
      });

      let videoEncoder = new window.VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: e => console.error(e)
      });

      videoEncoder.configure({
          codec: 'avc1.64003E',
          width,
          height,
          bitrate: width >= 3000 ? 100_000_000 : 40_000_000,
          framerate: fps,
      });

      const originalSize = new THREE.Vector2();
      gl.getSize(originalSize);
      const originalPixelRatio = gl.getPixelRatio();
      
      gl.setPixelRatio(1.0); 
      gl.setSize(width, height, false); 
      
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
          const cam = camera as THREE.PerspectiveCamera;
          cam.aspect = width / height;
          cam.updateProjectionMatrix();
      }

      const totalFrames = Math.ceil(duration * fps);
      for(let f = 0; f < totalFrames; f++) {
          const time = (f / fps);
          
          if (kfs && kfs.length > 0) {
              const sorted = [...kfs].sort((a, b) => a.time - b.time);
              let k1 = sorted[0];
              let k2 = sorted[sorted.length - 1];
              
              if (time <= k1.time) k2 = k1;
              else if (time >= k2.time) k1 = k2;
              else {
                  for (let i = 0; i < sorted.length - 1; i++) {
                      if (time >= sorted[i].time && time <= sorted[i+1].time) {
                          k1 = sorted[i]; k2 = sorted[i+1]; break;
                      }
                  }
              }

              if (k1 && k2) {
                  const range = k2.time - k1.time;
                  const progress = range > 0 ? (time - k1.time) / range : 0;
                  
                  camera.position.lerpVectors(
                    new THREE.Vector3(...k1.position),
                    new THREE.Vector3(...k2.position),
                    progress
                  );
                  if (controlsRef.current) {
                      controlsRef.current.target.lerpVectors(
                          new THREE.Vector3(...k1.target),
                          new THREE.Vector3(...k2.target),
                          progress
                      );
                      controlsRef.current.update();
                  }
                  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
                      const cam = camera as THREE.PerspectiveCamera;
                      cam.fov = THREE.MathUtils.lerp(k1.fov, k2.fov, progress);
                      cam.updateProjectionMatrix();
                  }
              }
          }

          if (composerRef.current) {
              composerRef.current.setSize(width, height);
              composerRef.current.render();
          } else {
              gl.render(scene, camera);
          }
          
          const targetCanvas = document.createElement('canvas');
          targetCanvas.width = width;
          targetCanvas.height = height;
          const ctx = targetCanvas.getContext('2d');
          if (ctx) {
             ctx.drawImage(gl.domElement, 0, 0, width, height);
          }

          const frame = new window.VideoFrame(targetCanvas, { timestamp: time * 1_000_000 });
          videoEncoder.encode(frame);
          frame.close();

          onProgress(f / totalFrames);
          
          if (f % 5 === 0) {
              await new Promise(r => setTimeout(r, 1));
          }
      }

      await videoEncoder.flush();
      muxer.finalize();

      gl.setPixelRatio(originalPixelRatio);
      gl.setSize(originalSize.x, originalSize.y, false);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
         const cam = camera as THREE.PerspectiveCamera;
         cam.aspect = originalSize.x / originalSize.y;
         cam.updateProjectionMatrix();
      }

      if (composerRef.current) {
          composerRef.current.setSize(originalSize.x, originalSize.y);
          composerRef.current.render();
      } else {
          gl.render(scene, camera);
      }

      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    },
    exportSceneGLTF: async (duration: number) => {
      if (!threeContext.current) return;
      const { scene, camera } = threeContext.current;
      
      const clips: THREE.AnimationClip[] = [];
      
      // Ensure camera is part of the exported scene and has a predictable name
      scene.add(camera);
      camera.name = "MainCamera";
      
      if (keyframes && keyframes.length > 0) {
        const sorted = [...keyframes].sort((a, b) => a.time - b.time);
        const times = sorted.map(k => k.time);
        
        const positions: number[] = [];
        const quaternions: number[] = [];
        
        const dummyCam = new THREE.PerspectiveCamera();
        
        for (const k of sorted) {
           positions.push(...k.position);
           dummyCam.position.set(k.position[0], k.position[1], k.position[2]);
           dummyCam.lookAt(new THREE.Vector3(...k.target));
           quaternions.push(dummyCam.quaternion.x, dummyCam.quaternion.y, dummyCam.quaternion.z, dummyCam.quaternion.w);
        }
        
        const posTrack = new THREE.VectorKeyframeTrack('MainCamera.position', times, positions);
        const quatTrack = new THREE.QuaternionKeyframeTrack('MainCamera.quaternion', times, quaternions);
        
        const clip = new THREE.AnimationClip('CameraAnimation', duration, [posTrack, quatTrack]);
        clips.push(clip);
      }

      const elementsTracks: THREE.KeyframeTrack[] = [];
      const createVisibilityScaleTrack = (nodeName: string, startTime?: number, endTime?: number) => {
         const tStart = Math.max(0, startTime ?? 0);
         const tEnd = Math.min(duration, endTime ?? duration);
         
         if (tStart >= tEnd) return null; // Invalid duration

         const times = [0];
         const values = [0.0001, 0.0001, 0.0001];

         if (tStart > 0) {
             times.push(tStart);
             values.push(0.0001, 0.0001, 0.0001);
         }

         const FADE = 0.5;
         const inMid = Math.min(tStart + FADE, tStart + (tEnd - tStart) / 2);
         const outMid = Math.max(tEnd - FADE, tStart + (tEnd - tStart) / 2);

         times.push(inMid);
         values.push(1, 1, 1);

         if (outMid > inMid) {
             times.push(outMid);
             values.push(1, 1, 1);
         }

         times.push(tEnd);
         values.push(0.0001, 0.0001, 0.0001);

         if (tEnd < duration) {
             times.push(duration);
             values.push(0.0001, 0.0001, 0.0001);
         }

         // Ensure monotonically increasing times to avoid warnings
         const finalTimes = [times[0]];
         for (let i = 1; i < times.length; i++) {
            finalTimes.push(Math.max(finalTimes[i-1] + 0.001, times[i]));
         }

         return new THREE.VectorKeyframeTrack(`${nodeName}.scale`, finalTimes, values);
      };

      if (billboards) {
          billboards.forEach(b => {
              const track = createVisibilityScaleTrack(`billboard_${b.id}`, b.startTime, b.endTime);
              if (track) elementsTracks.push(track);
          });
      }
      
      if (measurements) {
          measurements.forEach(m => {
              const track = createVisibilityScaleTrack(`measurement_${m.id}`, m.startTime, m.endTime);
              if (track) elementsTracks.push(track);
          });
      }
      
      if (elementsTracks.length > 0) {
          clips.push(new THREE.AnimationClip('ElementsAnimation', duration, elementsTracks));
      }

      const exporter = new GLTFExporter();
      const originalOpacities = new Map<THREE.Material, number>();
      
      scene.traverse(node => {
          if (node.name.startsWith('measurement_') || node.name.startsWith('billboard_')) {
              node.traverse(child => {
                  const mesh = child as THREE.Mesh;
                  if (mesh.material) {
                      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                      materials.forEach(mat => {
                          if (mat.transparent && mat.opacity < 1 && !originalOpacities.has(mat)) {
                              originalOpacities.set(mat, mat.opacity);
                              mat.opacity = 1;
                              if (mat.opacity === 0) mat.transparent = false; // Prevent completely invisible logic if engine optimizes it
                          }
                      });
                  }
              });
          }
      });
      
      try {
        const gltf = await exporter.parseAsync(scene, { binary: true, animations: clips });
        
        // Restore opacities
        for (const [mat, op] of Array.from(originalOpacities.entries())) {
            mat.opacity = op;
            mat.transparent = true;
        }

        let output;
        if (gltf instanceof ArrayBuffer) {
          output = new Blob([gltf], { type: 'application/octet-stream' });
        } else {
          const data = JSON.stringify(gltf);
          output = new Blob([data], { type: 'text/plain' });
        }
        
        const url = URL.createObjectURL(output);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = 'scene.glb';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Failed to export GLTF:", error);
      }
    }
  }));

  const [showPostProcessModal, setShowPostProcessModal] = useState(false);
  const [availableHdrs, setAvailableHdrs] = useState<{name: string, path: string}[]>([]);
  const [ppSettings, setPpSettings] = useState(() => {
    const defaultSettings = {
      hdr: '',
      envPreset: 'city',
      bloom: true,
      bloomIntensity: 1.0,
      bloomLuminanceThreshold: 0.9,
      chromaticAberration: true,
      chromaticAberrationOffset: 0.0015,
      vignette: true,
      vignetteDarkness: 0.5,
      noise: true,
      noiseOpacity: 0.05,
      exposure: 1.0,
      lightAzimuth: Math.PI / 4,
      lightElevation: Math.PI / 4,
      ao: true,
      aoIntensity: 2.0,
      dof: false,
      dofFocusDistance: 0.1
    };
    try {
      const saved = localStorage.getItem('3d_pp_settings');
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch(e) {}
    return defaultSettings;
  });

  useEffect(() => {
    fetch('/api/hdr')
      .then(res => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
           throw new TypeError("Received non-JSON response");
        }
        return res.json();
      })
      .then(data => {
        if (data.hdrs) {
           setAvailableHdrs(data.hdrs);
           setPpSettings(p => {
               if (p.hdr && !data.hdrs.find((h: any) => h.path === p.hdr)) {
                   return { ...p, hdr: '' }; // reset invalid HDR
               }
               return p;
           });
        }
      })
      .catch(err => {
         console.warn("Failed to fetch HDR maps from API", err);
      });
  }, []);

  const RendererSettings = () => {
    const { gl } = useThree();
    useEffect(() => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = ppSettings.exposure;
    }, [gl, ppSettings.exposure]);
    return null;
  };

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
      <Canvas shadows dpr={dpr} gl={{ antialias: false, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: ppSettings.exposure }}>
        <CaptureManager onGrab={(state) => { threeContext.current = state; }} />
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
        <CameraAnimator 
          cameraRef={cameraRef} 
          controlsRef={controlsRef} 
          keyframes={keyframes} 
          isPlayingCamera={isPlayingCamera} 
          timelineTime={timelineTime} 
          isCameraViewActive={isCameraViewActive} 
          cameraSettings={cameraSettings} 
        />
        
        <ambientLight intensity={0.8 * ppSettings.exposure} />
        <directionalLight 
          position={[
            100 * Math.cos(ppSettings.lightElevation) * Math.sin(ppSettings.lightAzimuth), 
            100 * Math.sin(ppSettings.lightElevation), 
            100 * Math.cos(ppSettings.lightElevation) * Math.cos(ppSettings.lightAzimuth)
          ]} 
          intensity={1.5 * ppSettings.exposure} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.001}
        >
          <orthographicCamera attach="shadow-camera" args={[-80, 80, 80, -80, 0.1, 300]} />
        </directionalLight>
        <pointLight position={[-30, 20, -30]} intensity={0.8 * ppSettings.exposure} />

        <Suspense fallback={null}>
          <RendererSettings />
          {ppSettings.hdr && availableHdrs.some(h => h.path === ppSettings.hdr) ? (
            <Environment files={getProxiedUrl(ppSettings.hdr)} background={false} />
          ) : (
            <Environment preset={ppSettings.envPreset as any} />
          )}
          
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

          {billboards && billboards.map(b => (
            <BillboardGroup
              key={b.id}
              billboard={b}
              isSelected={b.id === selectedBillboardId}
              onSelect={setSelectedBillboardId}
              activeTool={activeTool}
              transformMode={transformMode}
              timelineTime={timelineTime}
              onUpdate={(id, updates) => {
                if (setBillboards) {
                  setBillboards(prev => prev.map(bb => bb.id === id ? { ...bb, ...updates } : bb));
                }
              }}
            />
          ))}

          {measurements && measurements.map(m => {
            if (m.points.length === 0) return null;
            
            const anim = getAnimationState(timelineTime, m.startTime, m.endTime);

            const isActive = m.id === activeMeasurementId;
            const color = isActive ? "#10b981" : "#059669";
            
            if (m.type === 'arrow') {
              const arrowColor = m.color || (isActive ? "#ffffff" : "#e5e5e5");
              const isEntering = anim.phase === 'enter';
              const arrowScale = isEntering ? 1 : anim.scale;
              const arrowOpacity = isEntering ? 1 : anim.opacity;
              const drawProgress = isEntering ? anim.progress : 1;
              
              return (
                <group key={m.id} name={`measurement_${m.id}`} scale={[arrowScale, arrowScale, arrowScale]}>
                  {m.points.length === 1 && (
                    <mesh position={[m.points[0][0], 0.05, m.points[0][2]]}>
                      <sphereGeometry args={[0.3, 16, 16]} />
                      <meshBasicMaterial color={arrowColor} transparent opacity={arrowOpacity} />
                    </mesh>
                  )}
                  {m.points.length === 2 && (
                    <ArcArrow 
                      start={m.points[0]} 
                      end={m.points[1]} 
                      color={arrowColor} 
                      isActive={isActive}
                      text={m.text}
                      textColor={m.textColor}
                      opacity={arrowOpacity}
                      drawProgress={drawProgress}
                    />
                  )}
                </group>
              );
            }
            
            return (
              <group key={m.id} name={`measurement_${m.id}`} scale={[anim.scale, anim.scale, anim.scale]}>
                {m.points.map((point, i) => (
                  <mesh key={`dp-${m.id}-${i}`} position={[point[0], 0.05, point[2]]}>
                    <sphereGeometry args={[0.3, 16, 16]} />
                    <meshBasicMaterial color={m.color || color} transparent opacity={anim.opacity} />
                  </mesh>
                ))}
                {m.points.length === 2 && (() => {
                  const p1 = new THREE.Vector3(m.points[0][0], 0.05, m.points[0][2]);
                  const p2 = new THREE.Vector3(m.points[1][0], 0.05, m.points[1][2]);
                  const distance = p1.distanceTo(p2);
                  const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
                  const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
                  if (dir.lengthSq() < 0.001) dir.set(1, 0, 0);
                  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                  
                  return (
                  <group>
                    <mesh position={midPoint} quaternion={quaternion}>
                      <cylinderGeometry args={[0.08, 0.08, distance, 8]} />
                      <meshBasicMaterial color={m.color || color} transparent opacity={isActive ? anim.opacity : 0.6 * anim.opacity} />
                    </mesh>
                    <TextPlane
                      position={[
                        (m.points[0][0] + m.points[1][0]) / 2,
                        0.55,
                        (m.points[0][2] + m.points[1][2]) / 2
                      ]}
                      color={m.textColor || m.color || "#ef4444"}
                      fontSize={75}
                      rotation={[-Math.PI / 2, 0, 0]}
                      scale={[1, 1, 1]}
                      opacity={anim.opacity}
                      text={m.text || `${Math.sqrt(
                        Math.pow(m.points[0][0] - m.points[1][0], 2) + 
                        Math.pow(m.points[0][2] - m.points[1][2], 2)
                      ).toFixed(1)}m`}
                    />
                  </group>
                )})()}
              </group>
            );
          })}
          
          {/* @ts-ignore */}
          <EffectComposer ref={composerRef} disableNormalPass multisampling={0}>
            {ppSettings.ao && (
               <N8AO 
                 halfRes
                 aoRadius={ppSettings.aoRadius || 2.0}
                 intensity={ppSettings.aoIntensity}
                 distanceFalloff={1.0}
                 color="black"
               />
            )}
            {ppSettings.bloom && (
              <Bloom 
                intensity={ppSettings.bloomIntensity} 
                luminanceThreshold={ppSettings.bloomLuminanceThreshold} 
                mipmapBlur 
              />
            )}
            {ppSettings.dof && (
              <DepthOfField 
                 focusDistance={ppSettings.dofFocusDistance} 
                 focalLength={0.1} 
                 bokehScale={ppSettings.dofBokehScale || 5} 
                 height={480} 
              />
            )}
            {ppSettings.chromaticAberration && (
              <ChromaticAberration 
                blendFunction={BlendFunction.NORMAL} 
                offset={new THREE.Vector2(ppSettings.chromaticAberrationOffset, ppSettings.chromaticAberrationOffset)} 
              />
            )}
            {ppSettings.noise && (
              <Noise 
                opacity={ppSettings.noiseOpacity} 
                blendFunction={BlendFunction.OVERLAY}
              />
            )}
            {ppSettings.vignette && (
              <Vignette 
                eskil={false} 
                offset={0.1} 
                darkness={ppSettings.vignetteDarkness} 
              />
            )}
          </EffectComposer>
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

      <div className="absolute bottom-4 left-4 z-20">
        <button
          onClick={() => setShowPostProcessModal(!showPostProcessModal)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 backdrop-blur-md border border-black/10 text-xs font-bold text-black uppercase hover:bg-white transition-colors shadow-lg"
        >
          <Settings2 className="w-4 h-4" />
          Post Processing
        </button>
      </div>

      {showPostProcessModal && (
        <div className="absolute bottom-[60px] left-4 z-30 w-64 max-h-[calc(100%-80px)] bg-white/95 backdrop-blur-md border border-black/10 shadow-xl rounded-xl p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-black">Settings</h3>
            <button 
              onClick={() => setShowPostProcessModal(false)}
              className="text-black/50 hover:text-black"
            >
              X
            </button>
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto pr-2 no-scrollbar">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-[#666] uppercase">HDR Map</label>
              <select 
                className="bg-black/5 p-1 rounded border border-transparent focus:border-[#FC3434] outline-none text-[10px]"
                value={ppSettings.hdr}
                onChange={(e) => setPpSettings(p => ({ ...p, hdr: e.target.value }))}
              >
                <option value="">Default (City Preset)</option>
                {availableHdrs.map(h => (
                  <option key={h.path} value={h.path}>{h.name}</option>
                ))}
              </select>
            </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#666] uppercase">Exposure</label>
                <input 
                  type="range" min="0.1" max="3" step="0.1" 
                  value={ppSettings.exposure}
                  onChange={(e) => setPpSettings(p => ({ ...p, exposure: parseFloat(e.target.value) }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#666] uppercase">Sun Azimuth (Rotation)</label>
                <input 
                  type="range" min="0" max={Math.PI * 2} step="0.1" 
                  value={ppSettings.lightAzimuth}
                  onChange={(e) => setPpSettings(p => ({ ...p, lightAzimuth: parseFloat(e.target.value) }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[#666] uppercase">Sun Elevation (Height)</label>
                <input 
                  type="range" min="0" max={Math.PI / 2} step="0.05" 
                  value={ppSettings.lightElevation}
                  onChange={(e) => setPpSettings(p => ({ ...p, lightElevation: parseFloat(e.target.value) }))}
                />
              </div>

              <label className="flex items-center gap-2 text-[10px] font-bold mt-1">
                <input 
                  type="checkbox" 
                  checked={ppSettings.ao}
                  onChange={(e) => setPpSettings(p => ({ ...p, ao: e.target.checked }))}
                />
                AMBIENT OCCLUSION (SSAO)
              </label>

              {ppSettings.ao && (
                <div className="flex flex-col gap-1 pl-6">
                  <label className="text-[9px] font-bold text-[#666] uppercase">Intensity</label>
                  <input 
                    type="range" min="0" max="5" step="0.1" 
                    value={ppSettings.aoIntensity}
                    onChange={(e) => setPpSettings(p => ({ ...p, aoIntensity: parseFloat(e.target.value) }))}
                  />
                </div>
              )}
              
              <label className="flex items-center gap-2 text-[10px] font-bold mt-1">
                <input 
                  type="checkbox" 
                  checked={ppSettings.dof}
                  onChange={(e) => setPpSettings(p => ({ ...p, dof: e.target.checked }))}
                />
                DEPTH OF FIELD
              </label>

              {ppSettings.dof && (
                <div className="flex flex-col gap-1 pl-6">
                  <label className="text-[9px] font-bold text-[#666] uppercase">Focus Distance</label>
                  <input 
                    type="range" min="0.0" max="1" step="0.01" 
                    value={ppSettings.dofFocusDistance}
                    onChange={(e) => setPpSettings(p => ({ ...p, dofFocusDistance: parseFloat(e.target.value) }))}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-[10px] font-bold mt-1">
                <input 
                  type="checkbox" 
                  checked={ppSettings.bloom}
                  onChange={(e) => setPpSettings(p => ({ ...p, bloom: e.target.checked }))}
                />
                BLOOM
              </label>

              {ppSettings.bloom && (
                <div className="flex flex-col gap-1 pl-6">
                  <label className="text-[9px] font-bold text-[#666] uppercase">Intensity</label>
                  <input 
                    type="range" min="0" max="3" step="0.1" 
                    value={ppSettings.bloomIntensity}
                    onChange={(e) => setPpSettings(p => ({ ...p, bloomIntensity: parseFloat(e.target.value) }))}
                  />
                  <label className="text-[9px] font-bold text-[#666] uppercase mt-1">Threshold</label>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={ppSettings.bloomLuminanceThreshold}
                    onChange={(e) => setPpSettings(p => ({ ...p, bloomLuminanceThreshold: parseFloat(e.target.value) }))}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-[10px] font-bold mt-1">
                <input 
                  type="checkbox" 
                  checked={ppSettings.chromaticAberration}
                  onChange={(e) => setPpSettings(p => ({ ...p, chromaticAberration: e.target.checked }))}
                />
                CHROMATIC ABERRATION
              </label>

              {ppSettings.chromaticAberration && (
                <div className="flex flex-col gap-1 pl-6">
                  <label className="text-[9px] font-bold text-[#666] uppercase">Offset</label>
                  <input 
                    type="range" min="0" max="0.005" step="0.0001" 
                    value={ppSettings.chromaticAberrationOffset}
                    onChange={(e) => setPpSettings(p => ({ ...p, chromaticAberrationOffset: parseFloat(e.target.value) }))}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-[10px] font-bold mt-1">
                <input 
                  type="checkbox" 
                  checked={ppSettings.vignette}
                  onChange={(e) => setPpSettings(p => ({ ...p, vignette: e.target.checked }))}
                />
                VIGNETTE
              </label>

              {ppSettings.vignette && (
                <div className="flex flex-col gap-1 pl-6">
                  <label className="text-[9px] font-bold text-[#666] uppercase">Darkness</label>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={ppSettings.vignetteDarkness}
                    onChange={(e) => setPpSettings(p => ({ ...p, vignetteDarkness: parseFloat(e.target.value) }))}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-[10px] font-bold mt-1">
                <input 
                  type="checkbox" 
                  checked={ppSettings.noise}
                  onChange={(e) => setPpSettings(p => ({ ...p, noise: e.target.checked }))}
                />
                NOISE
              </label>

              {ppSettings.noise && (
                <div className="flex flex-col gap-1 pl-6">
                  <label className="text-[9px] font-bold text-[#666] uppercase">Opacity</label>
                  <input 
                    type="range" min="0" max="0.2" step="0.01" 
                    value={ppSettings.noiseOpacity}
                    onChange={(e) => setPpSettings(p => ({ ...p, noiseOpacity: parseFloat(e.target.value) }))}
                  />
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#eee] shrink-0">
              <button
                onClick={() => {
                  localStorage.setItem('3d_pp_settings', JSON.stringify(ppSettings));
                  setShowPostProcessModal(false);
                }}
                className="w-full bg-[#FC3434] text-white text-[10px] font-bold uppercase tracking-wider py-1.5 rounded hover:bg-[#e02e2e] transition-colors"
                title="Save as default for all scenes"
              >
                Save
              </button>
            </div>
          </div>
        )}

      {isCameraViewActive && cameraSettings && cameraSettings.aspectRatio !== 'free' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center z-40">
          <div 
            className="bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] border border-white/50 relative flex items-center justify-center"
            style={{
              aspectRatio: cameraSettings.aspectRatio === '16:9' ? '16/9' : cameraSettings.aspectRatio === '9:16' ? '9/16' : '1/1',
              width: cameraSettings.aspectRatio === '16:9' ? '100%' : 'auto',
              height: (cameraSettings.aspectRatio === '9:16' || cameraSettings.aspectRatio === '1:1') ? '100%' : 'auto',
              maxWidth: '100%',
              maxHeight: '100%'
            }}
          >
            <div className="absolute inset-0 border border-white/10 m-8 flex items-center justify-center">
              <div className="w-4 h-4 border-t border-l border-white/50 absolute top-0 left-0" />
              <div className="w-4 h-4 border-t border-r border-white/50 absolute top-0 right-0" />
              <div className="w-4 h-4 border-b border-l border-white/50 absolute bottom-0 left-0" />
              <div className="w-4 h-4 border-b border-r border-white/50 absolute bottom-0 right-0" />
            </div>
            <div className="absolute top-4 left-4 px-2 py-1 bg-[#FC3434] rounded text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              REC
            </div>
          </div>
        </div>
      )}
    </div>
  );
});