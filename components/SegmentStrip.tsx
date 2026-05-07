
import React, { useState, useRef, useEffect } from 'react';
import { DetectedPerson } from '../types';

interface SegmentStripProps {
  people: DetectedPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdatePerson?: (id: string, updates: Partial<DetectedPerson>) => void;
}

export const SegmentStrip: React.FC<SegmentStripProps> = ({ people, selectedId, onSelect, onUpdatePerson }) => {
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [availableTextures, setAvailableTextures] = useState<{name: string; path: string; team?: string}[]>([]);
  const [availableModels, setAvailableModels] = useState<{name: string; path: string; team: string; league: string}[]>([]);
  const [personMeshTeamFilters, setPersonMeshTeamFilters] = useState<Record<string, string>>({});
  const [personJerseyTeamFilters, setPersonJerseyTeamFilters] = useState<Record<string, string>>({});
  const [isModelsModalOpen, setIsModelsModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/textures')
      .then(res => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
           throw new TypeError("Received non-JSON response");
        }
        return res.json();
      })
      .then(data => {
        if (data.textures) {
          setAvailableTextures(data.textures);
        }
      })
      .catch(err => {
        console.warn("Failed to fetch textures from API", err);
        const R2_BASE = import.meta.env.VITE_R2_STORAGE_URL || '';
        setAvailableTextures([
          { name: 'Red Pattern', path: R2_BASE ? `${R2_BASE}/textures/red_pattern.png` : '/textures/red_pattern.png', team: 'System' },
          { name: 'Blue Stripes', path: R2_BASE ? `${R2_BASE}/textures/blue_stripes.png` : '/textures/blue_stripes.png', team: 'System' },
        ]);
      });

    fetch('/api/players')
      .then(res => {
        const contentType = res.headers.get("content-type");
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
           throw new TypeError("Received non-JSON response for players");
        }
        return res.json();
      })
      .then(data => {
        if (data.models) {
          setAvailableModels(data.models);
        }
      })
      .catch(err => {
        console.warn("Failed to fetch players from API, using fallback", err);
        const R2_BASE = import.meta.env.VITE_R2_STORAGE_URL || '';
        setAvailableModels([
          { name: 'Default Rig', path: R2_BASE ? `${R2_BASE}/models/mesh_rig.fbx` : '/models/mesh_rig.fbx', team: 'System', league: 'Base' },
          { name: 'Cloth Rig', path: R2_BASE ? `${R2_BASE}/models/mesh_rig_cloth.fbx` : '/models/mesh_rig_cloth.fbx', team: 'System', league: 'Base' },
          { name: 'Kobe Bryant', path: R2_BASE ? `${R2_BASE}/players/basketball/nba/lakers/kobe.fbx` : '/models/mesh_rig.fbx', team: 'Lakers', league: 'NBA' }, 
        ]);
      });
  }, []);

  const handleNameChange = (personId: string, newName: string) => {
    if (onUpdatePerson) {
      onUpdatePerson(personId, { name: newName });
    }
  };

  const toggleShowName = (e: React.MouseEvent, personId: string, currentShowName: boolean | undefined) => {
    e.stopPropagation();
    if (onUpdatePerson) {
      onUpdatePerson(personId, { showName: !currentShowName });
    }
  };

  return (
    <div className="h-32 px-6 flex items-center gap-3 overflow-x-auto bg-white border-b border-[#eee] no-scrollbar relative">
      <button
        onClick={() => setIsModelsModalOpen(true)}
        className="w-16 h-16 rounded-lg flex items-center justify-center border-2 border-[#eee] text-[#999] hover:text-[#FC3434] hover:border-[#FC3434] flex-shrink-0 transition-all shadow-sm bg-white"
        title="Manage 3D Body Models"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <div className="w-px h-12 bg-[#eee] flex-shrink-0 mx-1" />

      {people.map((person) => (
        <div key={person.id} className="relative flex flex-col items-center gap-2 flex-shrink-0">
          <div className="relative group">
            <button
              onClick={() => onSelect(person.id)}
              className={`
                relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all block
                ${selectedId === person.id ? 'border-[#FC3434] scale-105 shadow-[0_0_15px_rgba(252,52,52,0.3)]' : 'border-transparent hover:border-[#eee]'}
              `}
            >
              <img 
                src={person.thumbnail?.startsWith('http') ? `${window.location.origin}/api/proxy-image?url=${encodeURIComponent(person.thumbnail)}` : person.thumbnail} 
                alt={person.name} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer" 
              />
              <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-1">
                {editingNameId === person.id ? (
                  <input
                    type="text"
                    value={person.name}
                    onChange={(e) => handleNameChange(person.id, e.target.value)}
                    onBlur={() => setEditingNameId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingNameId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    className="w-[90%] text-[10px] text-black text-center bg-white/90 rounded px-0.5 outline-none"
                  />
                ) : (
                  <span 
                    className="text-[10px] text-white font-medium cursor-text px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNameId(person.id);
                    }}
                  >
                    {person.name}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={(e) => toggleShowName(e, person.id, person.showName)}
              className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-sm border transition-all ${
                person.showName 
                  ? 'bg-[#FC3434] text-white border-[#FC3434]' 
                  : 'bg-white text-[#999] border-[#ddd] opacity-0 group-hover:opacity-100 hover:text-black'
              }`}
              title={person.showName ? "Hide name in 3D view" : "Show name in 3D view"}
            >
              {person.showName ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.05 10.05 0 015.058-5.058m1.28-1.28A10.05 10.05 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.05 10.05 0 01-1.28 2.22m-1.28 1.28a3 3 0 11-4.243-4.243m4.242 4.242L3 3m18 18l-18-18" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ))}

      {people.length === 0 && (
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="w-16 h-16 rounded-lg bg-[#f5f5f5] animate-pulse" />
          ))}
        </div>
      )}

      {isModelsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setIsModelsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#eee]">
              <h2 className="text-lg font-bold">Manage 3D Body Models</h2>
              <button onClick={() => setIsModelsModalOpen(false)} className="p-1 hover:bg-[#f5f5f5] rounded-full text-[#999]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              {people.map(person => {
                const currentModel = availableModels.find(m => m.path === person.bodyModelUrl);
                const currentTexture = availableTextures.find(t => t.path === person.textureUrl);
                const selectedMeshTeam = personMeshTeamFilters[person.id] !== undefined 
                    ? personMeshTeamFilters[person.id] 
                    : (currentModel?.team && currentModel.team !== 'Unknown Team' && currentModel.team !== 'System' ? currentModel.team : '');
                
                const selectedJerseyTeam = personJerseyTeamFilters[person.id] !== undefined
                    ? personJerseyTeamFilters[person.id]
                    : (currentTexture?.team && currentTexture.team !== 'Unknown Team' && currentTexture.team !== 'System' ? currentTexture.team : '');
                
                const meshTeamOptions = Array.from(new Set([
                    ...availableModels.map(m => m.team).filter(team => team && team !== 'Unknown Team' && team !== 'System')
                ])).sort();

                const jerseyTeamOptions = Array.from(new Set([
                    ...availableTextures.map(t => t.team || '').filter(team => team && team !== 'Unknown Team' && team !== 'System')
                ])).sort();
                
                const modelsForTeam = availableModels.filter(m => m.team === selectedMeshTeam);
                const visibleModels = selectedMeshTeam ? modelsForTeam : availableModels.filter(m => m.team !== 'Unknown Team' && m.team !== 'System');

                const texturesForTeam = availableTextures.filter(t => t.team === selectedJerseyTeam);
                const visibleTextures = selectedJerseyTeam ? texturesForTeam : availableTextures.filter(t => t.team !== 'Unknown Team' && t.team !== 'System');

                return (
                  <div key={person.id} className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-[#f5f5f5] pb-4 last:border-0 last:pb-0 gap-3">
                    <div className="flex items-center gap-3 mt-1">
                      <img 
                        src={person.thumbnail?.startsWith('http') ? `${window.location.origin}/api/proxy-image?url=${encodeURIComponent(person.thumbnail)}` : person.thumbnail} 
                        alt="" 
                        className="w-10 h-10 rounded-md object-cover border border-[#eee]"
                      />
                      <div className="flex flex-col flex-1 min-w-[100px]">
                        <span className="text-sm font-bold">{person.name}</span>
                        <span className="text-[10px] text-[#999] truncate">
                          {currentModel?.name || 'Default Body'}
                        </span>
                        <span className="text-[10px] text-[#999] truncate">
                          {currentTexture?.name || 'Default Jersey'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end w-full sm:w-auto">
                      <div className="flex flex-col gap-1 w-full sm:w-48">
                        <select
                          className="text-xs font-medium border border-[#eee] rounded-md px-2 py-1.5 outline-none focus:border-[#FC3434] bg-[#f9f9f9] hover:bg-[#f5f5f5] cursor-pointer text-ellipsis transition-colors"
                          value={selectedMeshTeam}
                          onChange={(e) => {
                            setPersonMeshTeamFilters(prev => ({ ...prev, [person.id]: e.target.value }));
                          }}
                        >
                          <option value="">All Teams (Mesh Filter)</option>
                          {meshTeamOptions.map(team => (
                            <option key={team} value={team}>{team}</option>
                          ))}
                        </select>
                        <select
                          className="text-sm border border-[#eee] rounded-md px-2 py-1.5 outline-none focus:border-[#FC3434] bg-white cursor-pointer text-ellipsis transition-colors"
                          value={person.bodyModelUrl || ''}
                          onChange={(e) => {
                            if (onUpdatePerson) {
                              onUpdatePerson(person.id, { bodyModelUrl: e.target.value || undefined });
                            }
                          }}
                        >
                          <option value="">Default Mesh Rig</option>
                          {visibleModels.map(model => (
                            <option key={model.path} value={model.path}>
                              {!selectedMeshTeam && model.team && model.team !== 'System' ? `${model.team} - ` : ''}{model.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1 w-full sm:w-48 mt-1">
                        <select
                          className="text-xs font-medium border border-[#eee] rounded-md px-2 py-1.5 outline-none focus:border-[#FC3434] bg-[#f9f9f9] hover:bg-[#f5f5f5] cursor-pointer text-ellipsis transition-colors"
                          value={selectedJerseyTeam}
                          onChange={(e) => {
                            setPersonJerseyTeamFilters(prev => ({ ...prev, [person.id]: e.target.value }));
                          }}
                        >
                          <option value="">All Teams (Jersey Filter)</option>
                          {jerseyTeamOptions.map(team => (
                            <option key={team} value={team}>{team}</option>
                          ))}
                        </select>
                        <select
                          className="text-sm border border-[#eee] rounded-md px-2 py-1.5 outline-none focus:border-[#FC3434] bg-white cursor-pointer text-ellipsis transition-colors"
                          value={person.textureUrl || ''}
                          onChange={(e) => {
                            if (onUpdatePerson) {
                              onUpdatePerson(person.id, { textureUrl: e.target.value || undefined });
                            }
                          }}
                        >
                          <option value="">Default Jersey</option>
                          {visibleTextures.map(texture => (
                            <option key={texture.path} value={texture.path}>
                              {!selectedJerseyTeam && texture.team && texture.team !== 'System' ? `${texture.team} - ` : ''}{texture.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
