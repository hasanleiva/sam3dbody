import React, { useState, useEffect } from 'react';
import { DetectedPerson, DistanceMeasurement, BillboardData } from '../types';

interface AnalysisToolsProps {
  selectedPerson: DetectedPerson | null;
  activeTool: 'xg' | 'distance' | 'transform' | 'arrow' | 'billboard' | null;
  setActiveTool: (tool: 'xg' | 'distance' | 'transform' | 'arrow' | 'billboard' | null) => void;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;
  measurements: DistanceMeasurement[];
  activeMeasurementId: string | null;
  setActiveMeasurementId: (id: string | null) => void;
  onClearMeasurement: (id: string) => void;
  onClearAllMeasurements: () => void;
  overlayEnabled: boolean;
  setOverlayEnabled: (enabled: boolean) => void;
  overlayOpacity: number;
  setOverlayOpacity: (opacity: number) => void;
  billboards: BillboardData[];
  setBillboards: React.Dispatch<React.SetStateAction<BillboardData[]>>;
  selectedBillboardId: string | null;
  setSelectedBillboardId: (id: string | null) => void;
}

export const AnalysisTools: React.FC<AnalysisToolsProps> = ({
  selectedPerson,
  activeTool,
  setActiveTool,
  transformMode,
  setTransformMode,
  measurements,
  activeMeasurementId,
  setActiveMeasurementId,
  onClearMeasurement,
  onClearAllMeasurements,
  overlayEnabled,
  setOverlayEnabled,
  overlayOpacity,
  setOverlayOpacity,
  billboards,
  setBillboards,
  selectedBillboardId,
  setSelectedBillboardId
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
          <h3 className="text-xs font-bold text-[#666] uppercase tracking-wider">Analysis Tools</h3>
        </div>
        
        <div className="grid grid-cols-5 gap-2">
          {/* Transform Tool */}
          <button
            title="Transform / Rotate - Move and rotate selected body"
            onClick={() => {
              setActiveTool(activeTool === 'transform' ? null : 'transform');
            }}
            className={`aspect-square flex items-center justify-center rounded-xl border transition-all ${
              activeTool === 'transform' 
                ? 'bg-[#FC3434]/20 border-[#FC3434]/50 text-[#FC3434] shadow-sm' 
                : 'bg-white border-[#eee] text-black/60 hover:bg-[#f5f5f5] hover:border-[#ddd] hover:text-black'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>

          {/* Geometrik xG Tool */}
          <button
            title="Geometrik xG - Calculate expected goals"
            onClick={() => {
              setActiveTool(activeTool === 'xg' ? null : 'xg');
            }}
            className={`aspect-square flex items-center justify-center rounded-xl border transition-all ${
              activeTool === 'xg' 
                ? 'bg-[#FC3434]/20 border-[#FC3434]/50 text-[#FC3434] shadow-sm' 
                : 'bg-white border-[#eee] text-black/60 hover:bg-[#f5f5f5] hover:border-[#ddd] hover:text-black'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </button>

          {/* Distance Tool */}
          <button
            title="Distance Measure - Measure pitch distances"
            onClick={() => {
              setActiveTool(activeTool === 'distance' ? null : 'distance');
            }}
            className={`aspect-square flex items-center justify-center rounded-xl border transition-all ${
              activeTool === 'distance' 
                ? 'bg-[#FC3434]/20 border-[#FC3434]/50 text-[#FC3434] shadow-sm' 
                : 'bg-white border-[#eee] text-black/60 hover:bg-[#f5f5f5] hover:border-[#ddd] hover:text-black'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          {/* 3D Arrow Tool */}
          <button
            title="3D Arrow - Draw 3D arrows on pitch"
            onClick={() => {
              setActiveTool(activeTool === 'arrow' ? null : 'arrow');
            }}
            className={`aspect-square flex items-center justify-center rounded-xl border transition-all ${
              activeTool === 'arrow' 
                ? 'bg-[#FC3434]/20 border-[#FC3434]/50 text-[#FC3434] shadow-sm' 
                : 'bg-white border-[#eee] text-black/60 hover:bg-[#f5f5f5] hover:border-[#ddd] hover:text-black'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          {/* Image Billboard Tool */}
          <button
            title="Image Billboard - Add images to 3D scene"
            onClick={() => {
              setActiveTool(activeTool === 'billboard' ? null : 'billboard');
            }}
            className={`aspect-square flex items-center justify-center rounded-xl border transition-all ${
              activeTool === 'billboard' 
                ? 'bg-[#FC3434]/20 border-[#FC3434]/50 text-[#FC3434] shadow-sm' 
                : 'bg-white border-[#eee] text-black/60 hover:bg-[#f5f5f5] hover:border-[#ddd] hover:text-black'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </section>

      {/* Tool Content Area */}
      <section className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {activeTool === 'transform' && (
          <div className="p-4 rounded-xl bg-white border border-[#eee] shadow-sm">
            <h4 className="text-[10px] font-bold text-[#999] uppercase tracking-widest mb-4">Transform Controls</h4>
            
            {!selectedPerson ? (
              <div className="text-xs text-black/40 text-center py-4">
                Select a player in the 3D view to transform.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-black/60">Selected Player</span>
                  <span className="text-xs font-bold text-black">{selectedPerson.name}</span>
                </div>
                
                <div className="pt-4 border-t border-[#eee]">
                  <div className="text-xs text-black/60 mb-2">Mode</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setTransformMode('translate')}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-all border ${transformMode === 'translate' ? 'bg-[#FC3434]/10 border-[#FC3434]/30 text-[#FC3434]' : 'bg-[#f5f5f5] border-transparent text-black/70 hover:bg-[#eee]'}`}
                    >
                      <kbd className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${transformMode === 'translate' ? 'bg-[#FC3434] text-white' : 'bg-white border border-[#ddd] text-black'}`}>T</kbd>
                      <span className="text-xs font-medium">Translate</span>
                    </button>
                    <button 
                      onClick={() => setTransformMode('rotate')}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-all border ${transformMode === 'rotate' ? 'bg-[#FC3434]/10 border-[#FC3434]/30 text-[#FC3434]' : 'bg-[#f5f5f5] border-transparent text-black/70 hover:bg-[#eee]'}`}
                    >
                      <kbd className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${transformMode === 'rotate' ? 'bg-[#FC3434] text-white' : 'bg-white border border-[#ddd] text-black'}`}>R</kbd>
                      <span className="text-xs font-medium">Rotate</span>
                    </button>
                  </div>
                </div>
                
                <div className="text-[10px] text-black/40 leading-relaxed mt-4">
                  Use the 3D gizmo on the selected player to move or rotate them. Changes are saved automatically.
                </div>
              </div>
            )}
          </div>
        )}

        {activeTool === 'xg' && (
          <div className="p-4 rounded-xl bg-white border border-[#eee] shadow-sm">
            <h4 className="text-[10px] font-bold text-[#999] uppercase tracking-widest mb-4">xG Analysis</h4>
            
            {!selectedPerson ? (
              <div className="text-xs text-black/40 text-center py-4">
                Select a player in the 3D view to calculate xG.
              </div>
            ) : xgValue !== null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-black/60">Selected Player</span>
                  <span className="text-xs font-bold text-black">{selectedPerson.name}</span>
                </div>
                
                <div className="pt-4 border-t border-[#eee]">
                  <div className="text-[10px] text-black/40 uppercase tracking-wider mb-1">Expected Goal (xG)</div>
                  <div className="text-4xl font-bold text-[#FC3434]">
                    {xgValue.toFixed(2)}
                  </div>
                </div>
                
                <div className="text-[10px] text-black/40 leading-relaxed mt-4">
                  Based on angle to goalposts and distance to goal center.
                </div>
              </div>
            ) : (
              <div className="text-xs text-black/40 text-center py-4">
                Player position not available.
              </div>
            )}
          </div>
        )}

        {activeTool === 'arrow' && (
          <div className="p-4 rounded-xl bg-white border border-[#eee] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold text-[#999] uppercase tracking-widest">3D Arrows</h4>
              {measurements.filter(m => m.type === 'arrow').length > 0 && (
                <button 
                  onClick={() => {
                    measurements.filter(m => m.type === 'arrow').forEach(m => onClearMeasurement(m.id));
                  }}
                  className="text-[10px] text-[#FC3434] hover:text-[#e02e2e] font-bold uppercase"
                >
                  Clear Arrows
                </button>
              )}
            </div>
            
            <div className="space-y-2 mb-4">
              {measurements.filter(m => m.type === 'arrow').length === 0 && (
                <div className="text-xs text-black/40 text-center py-4">
                  Click on the pitch to draw an arrow.
                </div>
              )}
              {measurements.filter(m => m.type === 'arrow').map((m, i) => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-[#f5f5f5] border border-[#eee]">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-white border border-[#ddd] flex items-center justify-center text-[10px] font-bold text-black/60">
                      {i + 1}
                    </div>
                    <span className="text-xs font-medium text-black">
                      {m.points.length === 1 ? 'Drawing...' : 'Arrow'}
                    </span>
                  </div>
                  <button 
                    onClick={() => onClearMeasurement(m.id)}
                    className="p-1 text-black/30 hover:text-red-500 hover:bg-white rounded transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            
            <div className="text-[10px] text-black/40 leading-relaxed">
              Click two points on the pitch to draw a 3D arc arrow.
            </div>
          </div>
        )}

        {activeTool === 'distance' && (
          <div className="p-4 rounded-xl bg-white border border-[#eee] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold text-[#999] uppercase tracking-widest">Distance Measurements</h4>
              {measurements.length > 0 && (
                <button 
                  onClick={onClearAllMeasurements}
                  className="text-[10px] text-[#FC3434] hover:text-[#e02e2e] font-bold uppercase"
                >
                  Clear All
                </button>
              )}
            </div>
            
            <div className="space-y-2 mb-4">
              {measurements.length === 0 && (
                <div className="text-xs text-black/40 text-center py-4">
                  Click on the pitch to start measuring.
                </div>
              )}
              {measurements.map((m, i) => (
                <div 
                  key={m.id}
                  onClick={() => setActiveMeasurementId(m.id)}
                  className={`p-2 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${
                    m.id === activeMeasurementId 
                      ? 'bg-[#FC3434]/10 border-[#FC3434]/30' 
                      : 'bg-[#f8f8f8] border-[#eee] hover:bg-[#f0f0f0]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${m.points.length === 2 ? 'bg-[#FC3434]' : 'bg-[#FC3434]/50 animate-pulse'}`} />
                    <span className="text-xs font-medium text-black/70">Measurement {i + 1}</span>
                  </div>
                  {m.points.length === 2 && (
                    <span className="text-xs font-bold text-[#FC3434]">{calculateDistance(m.points).toFixed(1)}m</span>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); onClearMeasurement(m.id); }}
                    className="p-1 hover:bg-[#FC3434]/10 text-black/20 hover:text-[#FC3434] rounded transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {activeMeasurement && (
              <div className="pt-4 border-t border-[#eee]">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${activeMeasurement.points.length >= 1 ? 'bg-[#FC3434]' : 'border border-[#ddd]'}`} />
                    <span className={`text-xs ${activeMeasurement.points.length >= 1 ? 'text-black' : 'text-black/40'}`}>
                      {activeMeasurement.points.length >= 1 ? 'Point 1 selected' : 'Click first point'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${activeMeasurement.points.length >= 2 ? 'bg-[#FC3434]' : 'border border-[#ddd]'}`} />
                    <span className={`text-xs ${activeMeasurement.points.length >= 2 ? 'text-black' : 'text-black/40'}`}>
                      {activeMeasurement.points.length >= 2 ? 'Point 2 selected' : 'Click second point'}
                    </span>
                  </div>

                  {activeMeasurement.points.length === 2 && (
                    <div className="mt-2">
                      <div className="text-[10px] text-black/40 uppercase tracking-wider mb-1">Distance</div>
                      <div className="text-3xl font-bold text-[#FC3434]">
                        {calculateDistance(activeMeasurement.points).toFixed(1)} <span className="text-sm text-[#FC3434]/50">meters</span>
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
              className="mt-4 w-full py-2 bg-[#FC3434]/10 hover:bg-[#FC3434]/20 text-[#FC3434] border border-[#FC3434]/20 text-xs font-bold rounded-lg transition-all"
            >
              + New Measurement
            </button>
          </div>
        )}

        {activeTool === 'billboard' && (
          <div className="p-4 rounded-xl bg-white border border-[#eee] shadow-sm">
            <h4 className="text-[10px] font-bold text-[#999] uppercase tracking-widest mb-4">Image Billboards</h4>
            
            <div className="mb-4">
              <label className="block w-full py-2 bg-[#f5f5f5] hover:bg-[#eee] border border-[#ddd] border-dashed text-center rounded-lg cursor-pointer transition-colors">
                <span className="text-xs font-medium text-black/60">Upload Image</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const url = ev.target?.result as string;
                        const img = new Image();
                        img.onload = () => {
                          const newBillboard: BillboardData = {
                            id: Math.random().toString(36).substring(7),
                            url,
                            position: [0, 0, 0],
                            width: 2,
                            height: 2 * (img.height / img.width)
                          };
                          setBillboards(prev => [...prev, newBillboard]);
                          setSelectedBillboardId(newBillboard.id);
                        };
                        img.src = url;
                      };
                      reader.readAsDataURL(file);
                    }
                  }} 
                />
              </label>
            </div>

            <div className="space-y-2 mb-4">
              {billboards.length === 0 && (
                <div className="text-xs text-black/40 text-center py-4">
                  No billboards added yet.
                </div>
              )}
              {billboards.map((b, i) => (
                <div 
                  key={b.id}
                  onClick={() => setSelectedBillboardId(b.id)}
                  className={`p-2 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${
                    b.id === selectedBillboardId 
                      ? 'bg-[#FC3434]/10 border-[#FC3434]/30' 
                      : 'bg-[#f8f8f8] border-[#eee] hover:bg-[#f0f0f0]'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <img src={b.url} alt="billboard" className="w-6 h-6 object-cover rounded bg-white border border-[#ddd]" />
                    <span className="text-xs font-medium text-black/70 truncate">Billboard {i + 1}</span>
                  </div>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setBillboards(prev => prev.filter(bb => bb.id !== b.id));
                      if (selectedBillboardId === b.id) setSelectedBillboardId(null);
                    }}
                    className="p-1 hover:bg-[#FC3434]/10 text-black/20 hover:text-[#FC3434] rounded transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {selectedBillboardId && (
              <div className="pt-4 border-t border-[#eee]">
                <div className="text-xs font-bold text-black mb-3">Dimensions</div>
                
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[10px] text-black/60 mb-1">
                      <span>Width</span>
                      <span>{billboards.find(b => b.id === selectedBillboardId)?.width.toFixed(1)}m</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="10" 
                      step="0.1"
                      value={billboards.find(b => b.id === selectedBillboardId)?.width || 2}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setBillboards(prev => prev.map(b => b.id === selectedBillboardId ? { ...b, width: val } : b));
                      }}
                      className="w-full accent-[#FC3434]"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-[10px] text-black/60 mb-1">
                      <span>Height</span>
                      <span>{billboards.find(b => b.id === selectedBillboardId)?.height.toFixed(1)}m</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="10" 
                      step="0.1"
                      value={billboards.find(b => b.id === selectedBillboardId)?.height || 2}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setBillboards(prev => prev.map(b => b.id === selectedBillboardId ? { ...b, height: val } : b));
                      }}
                      className="w-full accent-[#FC3434]"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-black/40 leading-relaxed mt-4">
                  Use the 3D gizmo on the selected billboard to move it around the pitch.
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Broadcast Overlay Tool */}
      <section className="mt-4">
        <div className="bg-white border border-[#eee] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${overlayEnabled ? 'bg-[#FC3434]/20' : 'bg-[#f5f5f5]'}`}>
                <svg className={`w-4 h-4 ${overlayEnabled ? 'text-[#FC3434]' : 'text-[#999]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-black">Broadcast Overlay</h3>
                <div className="text-[10px] text-[#999]">Overlay media on 3D scene</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={overlayEnabled} onChange={(e) => setOverlayEnabled(e.target.checked)} />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FC3434]"></div>
            </label>
          </div>
          
          {overlayEnabled && (
            <div className="mt-4 pt-4 border-t border-[#eee] space-y-2">
              <div className="flex justify-between text-xs text-gray-500 font-medium">
                <span>Opacity</span>
                <span>{Math.round(overlayOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#FC3434]"
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
