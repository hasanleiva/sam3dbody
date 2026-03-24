import React from 'react';
import { CALIBRATION_NODES, PITCH_LINES } from '../utils/homography';
import { PitchNode } from '../types';

interface MiniPitchProps {
  activeNodeId: string | null;
  mappedNodeIds: string[];
  customNodes: PitchNode[];
  onSelectNode: (id: string) => void;
  onAddCustomNode: (x: number, y: number) => void;
}

export const MiniPitch: React.FC<MiniPitchProps> = ({ 
  activeNodeId, 
  mappedNodeIds, 
  customNodes,
  onSelectNode,
  onAddCustomNode
}) => {
  const handlePitchClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    // Ensure coordinates are within pitch bounds
    const x = Math.max(0, Math.min(105, cursorpt.x));
    const y = Math.max(0, Math.min(68, cursorpt.y));
    
    onAddCustomNode(x, y);
  };

  const allNodes = [...CALIBRATION_NODES, ...customNodes];

  return (
    <div className="relative w-full aspect-[105/68] bg-[#2d5a27] rounded border border-[#eee] overflow-hidden shadow-lg select-none">
      <svg 
        viewBox="0 0 105 68" 
        className="w-full h-full cursor-crosshair"
        onClick={handlePitchClick}
      >
        {/* Pitch markings */}
        <g stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" fill="none" className="pointer-events-none">
          {PITCH_LINES.map((line, idx) => (
            <line key={idx} x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]} />
          ))}
          {/* Center Circle */}
          <circle cx="52.5" cy="34" r="9.15" />
          <circle cx="52.5" cy="34" r="0.4" fill="rgba(255,255,255,0.6)" />
          
          {/* D Arcs */}
          <path d="M 16.5 26.69 A 9.15 9.15 0 0 1 16.5 41.31" />
          <path d="M 88.5 26.69 A 9.15 9.15 0 0 0 88.5 41.31" />
        </g>

        {/* Calibration Nodes */}
        {allNodes.map((node) => {
          const isMapped = mappedNodeIds.includes(node.id);
          const isActive = activeNodeId === node.id;
          const isCustom = node.id.startsWith('custom_');
          
          return (
            <g 
              key={node.id} 
              className="cursor-pointer group transition-all duration-200"
              style={{ 
                transformOrigin: 'center', 
                transformBox: 'fill-box' 
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
              }}
            >
              {/* Hit area */}
              <rect 
                x={node.x - 4} 
                y={node.y - 4} 
                width="8" 
                height="8" 
                fill="transparent" 
                className="pointer-events-auto"
              />
              
              {/* Visual Marker */}
              <rect 
                x={node.x - 2.5} 
                y={node.y - 2.5} 
                width="5" 
                height="5" 
                rx={isCustom ? "2.5" : "1.5"}
                fill={isActive ? "#FC3434" : isMapped ? "#4ade80" : isCustom ? "rgba(255, 255, 255, 0.4)" : "rgba(20, 20, 20, 0.6)"}
                stroke={isActive ? "white" : isMapped ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.1)"}
                strokeWidth={isActive ? "0.6" : "0.3"}
                className={`transition-all duration-200 group-hover:scale-125 ${isActive ? 'scale-110 shadow-lg' : ''}`}
                style={{ 
                  filter: isActive ? 'drop-shadow(0px 0px 3px rgba(252,52,52,0.8))' : 'drop-shadow(0px 1px 2px rgba(0,0,0,0.4))',
                  transformOrigin: 'center',
                  transformBox: 'fill-box'
                }}
              />
              <title>{node.name}</title>
            </g>
          );
        })}
      </svg>
      
      <div className="absolute bottom-1 left-1 pointer-events-none">
        <span className="text-[8px] text-white/60 uppercase font-bold bg-black/20 px-1 rounded">Click pitch to add custom point</span>
      </div>
    </div>
  );
};
