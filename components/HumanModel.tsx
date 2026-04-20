
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Cylinder, Box } from '@react-three/drei';
import * as THREE from 'three';

interface HumanModelProps {
  rotation?: [number, number, number];
  scale?: number;
  color?: string;
  colors?: {
    jersey: string;
    shorts: string;
    socks: string;
    body: string;
  };
}

const Bone: React.FC<{ start: [number, number, number], end: [number, number, number], color: string }> = ({ start, end, color }) => {
  const startVec = new THREE.Vector3(...start);
  const endVec = new THREE.Vector3(...end);
  const distance = startVec.distanceTo(endVec);
  const center = startVec.clone().add(endVec).multiplyScalar(0.5);
  
  return (
    <group position={center.toArray()}>
      <Cylinder 
        args={[0.02, 0.02, distance, 8]} 
        rotation={[Math.atan2(end[0] - start[0], end[1] - start[1]), 0, 0]}
      >
        <meshStandardMaterial color={color} />
      </Cylinder>
    </group>
  );
};

export const HumanModel: React.FC<HumanModelProps> = ({ rotation = [0, 0, 0], scale = 1, color = "#60a5fa", colors }) => {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y += Math.sin(state.clock.elapsedTime) * 0.001;
    }
  });

  const bodyColor = colors?.body || color;
  const jerseyColor = colors?.jersey || color;
  const shortsColor = colors?.shorts || color;
  const socksColor = colors?.socks || color;

  return (
    <group ref={group} rotation={rotation} scale={scale}>
      {/* Head */}
      <Sphere args={[0.15, 16, 16]} position={[0, 1.7, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={bodyColor} />
      </Sphere>
      
      {/* Torso (Jersey) */}
      <Box args={[0.3, 0.6, 0.15]} position={[0, 1.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={jerseyColor} />
      </Box>

      {/* Pelvis (Shorts) */}
      <Box args={[0.3, 0.1, 0.15]} position={[0, 1.0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={shortsColor} />
      </Box>

      {/* Arms (Body) */}
      <group position={[-0.2, 1.5, 0]} rotation={[0, 0, 0.3]}>
        <Cylinder args={[0.04, 0.04, 0.5]} position={[0, -0.25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={bodyColor} />
        </Cylinder>
      </group>
      <group position={[0.2, 1.5, 0]} rotation={[0, 0, -0.3]}>
        <Cylinder args={[0.04, 0.04, 0.5]} position={[0, -0.25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={bodyColor} />
        </Cylinder>
      </group>

      {/* Legs (Socks) */}
      <group position={[-0.1, 1.0, 0]} rotation={[0, 0, 0.1]}>
        <Cylinder args={[0.05, 0.05, 0.8]} position={[0, -0.4, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={socksColor} />
        </Cylinder>
      </group>
      <group position={[0.1, 1.0, 0]} rotation={[0, 0, -0.1]}>
        <Cylinder args={[0.05, 0.05, 0.8]} position={[0, -0.4, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={socksColor} />
        </Cylinder>
      </group>

      {/* Simplified Skeleton Lines Overlay */}
      <Bone start={[0, 1.7, 0]} end={[0, 1.0, 0]} color="#fff" />
      <Bone start={[-0.2, 1.5, 0]} end={[-0.3, 1.0, 0]} color="#fff" />
      <Bone start={[0.2, 1.5, 0]} end={[0.3, 1.0, 0]} color="#fff" />
    </group>
  );
};
