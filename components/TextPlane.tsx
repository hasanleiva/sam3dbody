import React, { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';

export const TextPlane: React.FC<{ 
    text: string; 
    color?: string; 
    fontSize?: number; 
    position?: [number, number, number]; 
    rotation?: [number, number, number];
    scale?: [number, number, number];
    opacity?: number;
}> = ({ text, color = "#ffffff", fontSize = 48, position, rotation, scale = [1, 1, 1], opacity = 1 }) => {
    const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
    const [aspect, setAspect] = useState(1);
    
    useEffect(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textMetrics = ctx.measureText(text);
        
        // Add padding
        const width = Math.max(1, textMetrics.width + 40);
        const height = Math.max(1, fontSize + 40);
        
        canvas.width = width;
        canvas.height = height;
        setAspect(width / height);
        
        // Reset font after resizing canvas
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        const r = 10;
        ctx.moveTo(r, 0);
        ctx.lineTo(width - r, 0);
        ctx.quadraticCurveTo(width, 0, width, r);
        ctx.lineTo(width, height - r);
        ctx.quadraticCurveTo(width, height, width - r, height);
        ctx.lineTo(r, height);
        ctx.quadraticCurveTo(0, height, 0, height - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.fill();
        
        // Text shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        ctx.fillStyle = color;
        ctx.fillText(text, width / 2, height / 2);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        
        setTexture(tex);
        
        return () => {
            tex.dispose();
        };
    }, [text, color, fontSize]);

    if (!texture) return null;

    const planeHeight = fontSize * 0.02; // scale factor
    const planeWidth = planeHeight * aspect;

    return (
        <mesh position={position} rotation={rotation} scale={scale}>
            <planeGeometry args={[planeWidth, planeHeight]} />
            <meshBasicMaterial 
                map={texture} 
                transparent={true} 
                opacity={opacity} 
                depthWrite={false}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
};
