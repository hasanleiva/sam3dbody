import React, { useState, useEffect } from 'react';
import { DetectedPerson, DistanceMeasurement } from '../types';

interface AnalysisToolsProps {
  selectedPerson: DetectedPerson | null;
  activeTool: 'xg' | 'distance' | null;
  setActiveTool: (tool: 'xg' | 'distance' | null) => void;
  measurements: DistanceMeasurement[];
  activeMeasurementId: string | null;
  setActiveMeasurementId: (id: string | null) => void;
  onClearMeasurement: (id: string) => void;
  onClearAllMeasurements: () => void;
}

export const AnalysisTools: React.FC<AnalysisToolsProps> = ({
  selectedPerson,
  activeTool,
  setActiveTool,
  measurements,
  activeMeasurementId,
  setActiveMeasurementId,
  onClearMeasurement,
  onClearAllMeasurements
}) => {
  const [xgValue, setXgValue] = useState<number | null>(null);

  useEffect(() => {
    if (activeTool === 'xg' && selectedPerson && selectedPerson.worldPos) {
      // Calculate xG
      const [x, y] = selectedPerson.worldPos;
      
      // Goal centers are at (0, 34) and (105, 34)
      // Determine which goal is closer
      const distToLeftGoal = Math.sqrt(Math.pow(x - 0, 2) + Math.pow(y - 34, 2));
      const distToRightGoal = Math.sqrt(Math.pow(x - 105, 2) + Math.pow(y - 34, 2));
      
      const isLeftGoal = distToLeftGoal < distToRightGoal;
      const goalX = isLeftGoal ? 0 : 105;
      
      // Goalposts are at (goalX, 34 - 3.66) and (goalX, 34 + 3.66)
      const post1 = { x: goalX, y: 34 - 3.66 };
      const post2 = { x: goalX, y: 34 + 3.66 };
      
      // Vector from player to post1
      const v1 = { x: post1.x - x, y: post1.y - y };
      // Vector from player to post2
      const v2 = { x: post2.x - x, y: post2.y - y };
      
      // Dot product
      const dot = v1.x * v2.x + v1.y * v2.y;
      // Magnitudes
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
      
      // Angle in radians
      let angle = Math.acos(dot / (mag1 * mag2));
      if (isNaN(angle)) angle = 0;
      
      // Distance to goal center
      const distance = isLeftGoal ? distToLeftGoal : distToRightGoal;
      
      // xG Formula: Angle / Distance^2
      let xg = (angle / Math.pow(distance, 2)) * 140;
      
      // Cap xG between 0.01 and 0.99
      xg = Math.max(0.01, Math.min(0.99, xg));
      
      setXgValue(xg);
    } else {
      setXgValue(null);
    }
  }, [activeTool, selectedPerson]);

  const calculateDistance = (points: [number, number, number][]) => {
    if (points.length !== 2) return 0;
    const [p1, p2] = points;
    const dx = p1[0] - p2[0];
    const dy = p1[2] - p2[2]; // Using Z coordinate from 3D world (which maps to Y in 2D)
    return Math.sqrt(dx * dx + dy * dy);
  };

  const activeMeasurement = measurements.find(m => m.id === activeMeasurementId);

  return (
    <div className="flex flex-col h-full gap-6">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-[#888] uppercase tracking-wider">Analysis Tools</h3>
        </div>
        
        <div className="space-y-3">
          {/* Geometrik xG Tool */}
          <button
            onClick={() => {
              setActiveTool(activeTool === 'xg' ? null : 'xg');
            }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
              activeTool === 'xg' 
                ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' 
                : 'bg-[#141414] border-white/5 text-white/70 hover:bg-white/5 hover:border-white/20'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTool === 'xg' ? 'bg-blue-500/20' : 'bg-white/5'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">Geometrik xG</div>
              <div className="text-[10px] opacity-70">Calculate expected goals</div>
            </div>
          </button>

          {/* Distance Tool */}
          <button
            onClick={() => {
              setActiveTool(activeTool === 'distance' ? null : 'distance');
            }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
              activeTool === 'distance' 
                ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                : 'bg-[#141414] border-white/5 text-white/70 hover:bg-white/5 hover:border-white/20'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTool === 'distance' ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold">Distance Measure</div>
              <div className="text-[10px] opacity-70">Measure pitch distances</div>
            </div>
          </button>
        </div>
      </section>

      {/* Tool Content Area */}
      <section className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {activeTool === 'xg' && (
          <div className="p-4 rounded-xl bg-[#141414] border border-white/5">
            <h4 className="text-[10px] font-bold text-[#444] uppercase tracking-widest mb-4">xG Analysis</h4>
            
            {!selectedPerson ? (
              <div className="text-xs text-white/50 text-center py-4">
                Select a player in the 3D view to calculate xG.
              </div>
            ) : xgValue !== null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/70">Selected Player</span>
                  <span className="text-xs font-bold text-white">{selectedPerson.name}</span>
                </div>
                
                <div className="pt-4 border-t border-white/10">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Expected Goal (xG)</div>
                  <div className="text-4xl font-bold text-blue-400">
                    {xgValue.toFixed(2)}
                  </div>
                </div>
                
                <div className="text-[10px] text-white/40 leading-relaxed mt-4">
                  Based on angle to goalposts and distance to goal center.
                </div>
              </div>
            ) : (
              <div className="text-xs text-white/50 text-center py-4">
                Player position not available.
              </div>
            )}
          </div>
        )}

        {activeTool === 'distance' && (
          <div className="p-4 rounded-xl bg-[#141414] border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold text-[#444] uppercase tracking-widest">Distance Measurements</h4>
              {measurements.length > 0 && (
                <button 
                  onClick={onClearAllMeasurements}
                  className="text-[10px] text-red-500 hover:text-red-400 font-bold uppercase"
                >
                  Clear All
                </button>
              )}
            </div>
            
            <div className="space-y-2 mb-4">
              {measurements.length === 0 && (
                <div className="text-xs text-white/50 text-center py-4">
                  Click on the pitch to start measuring.
                </div>
              )}
              {measurements.map((m, i) => (
                <div 
                  key={m.id}
                  onClick={() => setActiveMeasurementId(m.id)}
                  className={`p-2 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${
                    m.id === activeMeasurementId 
                      ? 'bg-emerald-500/10 border-emerald-500/30' 
                      : 'bg-white/5 border-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${m.points.length === 2 ? 'bg-emerald-500' : 'bg-emerald-500/50 animate-pulse'}`} />
                    <span className="text-xs font-medium text-white/80">Measurement {i + 1}</span>
                  </div>
                  {m.points.length === 2 && (
                    <span className="text-xs font-bold text-emerald-400">{calculateDistance(m.points).toFixed(1)}m</span>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); onClearMeasurement(m.id); }}
                    className="p-1 hover:bg-red-500/20 text-white/30 hover:text-red-400 rounded transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {activeMeasurement && (
              <div className="pt-4 border-t border-white/10">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${activeMeasurement.points.length >= 1 ? 'bg-emerald-500' : 'border border-white/20'}`} />
                    <span className={`text-xs ${activeMeasurement.points.length >= 1 ? 'text-white' : 'text-white/50'}`}>
                      {activeMeasurement.points.length >= 1 ? 'Point 1 selected' : 'Click first point'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${activeMeasurement.points.length >= 2 ? 'bg-emerald-500' : 'border border-white/20'}`} />
                    <span className={`text-xs ${activeMeasurement.points.length >= 2 ? 'text-white' : 'text-white/50'}`}>
                      {activeMeasurement.points.length >= 2 ? 'Point 2 selected' : 'Click second point'}
                    </span>
                  </div>

                  {activeMeasurement.points.length === 2 && (
                    <div className="mt-2">
                      <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Distance</div>
                      <div className="text-3xl font-bold text-emerald-400">
                        {calculateDistance(activeMeasurement.points).toFixed(1)} <span className="text-sm text-emerald-400/50">meters</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <button 
              onClick={() => {
                const newId = Math.random().toString(36).substring(7);
                setActiveMeasurementId(newId);
              }}
              className="mt-4 w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-lg transition-all"
            >
              + New Measurement
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
