import React, { useRef, useState } from 'react';
import { CalibrationPoint, PitchNode } from '../types';
import { PITCH_LINES, projectPoint, CALIBRATION_NODES, PITCH_CURVES } from '../utils/homography';

interface CalibrationOverlayProps {
  points: CalibrationPoint[];
  customNodes: PitchNode[];
  matrix: number[] | null;
  onPointMove: (id: string, x: number, y: number) => void;
  onNodeMap: (nodeId: string, x: number, y: number) => void;
  onMapClick: (x: number, y: number) => void;
  isVisible: boolean;
}

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({ 
  points, customNodes, matrix, onPointMove, onNodeMap, onMapClick, isVisible 
}) => {
  const containerRef = useRef<SVGSVGElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setActiveId(id);
    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeId || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Clamp to 0-100
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    const isExistingPoint = points.some(p => p.id === activeId);
    if (isExistingPoint) {
      onPointMove(activeId, clampedX, clampedY);
    } else {
      onNodeMap(activeId, clampedX, clampedY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeId) {
      if (containerRef.current) {
        containerRef.current.releasePointerCapture(e.pointerId);
      }
      setActiveId(null);
    }
  };

  if (!isVisible) return null;

  return (
    <svg 
      ref={containerRef}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full touch-none pointer-events-auto"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Invisible background to capture clicks that aren't on dots/handles */}
      <rect 
        width="100" 
        height="100" 
        fill="transparent" 
        className="pointer-events-auto cursor-crosshair"
        onPointerDown={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            onMapClick(x, y);
          }
        }}
      />

      {/* Warped Grid */}
      {matrix && (
        <g>
          {/* Lines */}
          <g stroke="#ffdf00" strokeWidth="0.15" opacity="0.4" fill="none">
            {PITCH_LINES.map((line, idx) => {
              try {
                const p1 = projectPoint(line[0][0], line[0][1], matrix);
                const p2 = projectPoint(line[1][0], line[1][1], matrix);
                
                if (isNaN(p1[0]) || isNaN(p1[1]) || isNaN(p2[0]) || isNaN(p2[1])) return null;
                // Guard against extreme values that break SVG rendering
                if (Math.abs(p1[0]) > 1000 || Math.abs(p1[1]) > 1000) return null;

                return (
                  <line 
                    key={idx} 
                    x1={p1[0]} y1={p1[1]} 
                    x2={p2[0]} y2={p2[1]} 
                  />
                );
              } catch (e) { return null; }
            })}
            {/* Curves */}
            {PITCH_CURVES.map((curve, idx) => {
              const segments = 40;
              const pointsInCurve: [number, number][] = [];
              for (let i = 0; i <= segments; i++) {
                const angle = (curve.startAngle + (curve.endAngle - curve.startAngle) * (i / segments)) * (Math.PI / 180);
                const x = curve.center[0] + Math.cos(angle) * curve.radius;
                const y = curve.center[1] + Math.sin(angle) * curve.radius;
                try {
                  const p = projectPoint(x, y, matrix);
                  if (!isNaN(p[0]) && !isNaN(p[1]) && Math.abs(p[0]) < 1000 && Math.abs(p[1]) < 1000) {
                    pointsInCurve.push(p);
                  }
                } catch (e) {}
              }
              if (pointsInCurve.length < 2) return null;
              return (
                <polyline 
                  key={`curve-${idx}`}
                  points={pointsInCurve.map(p => `${p[0]},${p[1]}`).join(' ')}
                />
              );
            })}
          </g>

          {/* Projected Nodes (Interactive Yellow Dots) */}
          <g>
            {[...CALIBRATION_NODES, ...customNodes].map((node) => {
              try {
                const p = projectPoint(node.x, node.y, matrix);
                if (isNaN(p[0]) || isNaN(p[1])) return null;
                if (Math.abs(p[0]) > 200 || Math.abs(p[1]) > 200) return null; // Hide if far off-screen
                
                const isMapped = points.some(cp => cp.id === node.id);
                if (isMapped) return null; // Already handled by blue handles

                return (
                  <g 
                    key={node.id} 
                    className="cursor-crosshair pointer-events-auto"
                    onPointerDown={(e) => handlePointerDown(e, node.id)}
                  >
                    {/* Larger hit area */}
                    <circle cx={p[0]} cy={p[1]} r="3" fill="transparent" />
                    <circle 
                      cx={p[0]} 
                      cy={p[1]} 
                      r="0.6" 
                      fill="#ffdf00"
                      stroke="black"
                      strokeWidth="0.1"
                    />
                  </g>
                );
              } catch (e) { return null; }
            })}
          </g>
        </g>
      )}

      {/* Calibration Handles */}
      {points.map((p) => {
        const nodeInfo = [...CALIBRATION_NODES, ...customNodes].find(n => n.id === p.id);
        const isBeingDragged = activeId === p.id;
        
        return (
          <g 
            key={p.id} 
            className="cursor-move pointer-events-auto"
            onPointerDown={(e) => handlePointerDown(e, p.id)}
          >
            {/* Hit area for dragging */}
            <circle cx={p.imageX} cy={p.imageY} r="4" fill="transparent" />
            
            <circle 
              cx={p.imageX} 
              cy={p.imageY} 
              r={isBeingDragged ? "1.5" : "1.2"} 
              fill={isBeingDragged ? "rgba(59, 130, 246, 0.8)" : "rgba(59, 130, 246, 0.5)"}
              stroke="white" 
              strokeWidth="0.2"
            />
            <circle cx={p.imageX} cy={p.imageY} r="0.3" fill="white" />
            <text 
              x={p.imageX} 
              y={p.imageY} 
              dy="-2" 
              textAnchor="middle" 
              fontSize="1.5"
              className="fill-blue-400 font-bold select-none drop-shadow-[0_0.2px_0.2px_rgba(0,0,0,0.8)]"
            >
              {nodeInfo?.name.split(' ').pop()}
            </text>
          </g>
        );
      })}
    </svg>
  );
};