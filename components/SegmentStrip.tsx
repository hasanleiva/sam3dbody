
import React, { useState, useRef, useEffect } from 'react';
import { DetectedPerson } from '../types';

interface SegmentStripProps {
  people: DetectedPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdatePerson?: (id: string, updates: Partial<DetectedPerson>) => void;
}

const COLORS = [
  '#FFFFFF', '#000000', '#FC3434', '#0000FF', '#00FF00', '#FFFF00', '#FFA500', '#800080', '#00FFFF', '#FFC0CB'
];

export const SegmentStrip: React.FC<SegmentStripProps> = ({ people, selectedId, onSelect, onUpdatePerson }) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number, left: number } | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    const handleScroll = () => {
      if (openMenuId) setOpenMenuId(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [openMenuId]);

  const handleColorChange = (personId: string, part: 'jersey' | 'shorts' | 'socks', color: string) => {
    if (!onUpdatePerson) return;
    const person = people.find(p => p.id === personId);
    if (!person) return;
    
    const currentColors = person.colors || { jersey: '#ffffff', shorts: '#ffffff', socks: '#ffffff', body: '#ffccaa' };
    onUpdatePerson(personId, {
      colors: { ...currentColors, [part]: color }
    });
  };

  const handleJerseyClick = (e: React.MouseEvent<HTMLButtonElement>, personId: string) => {
    e.stopPropagation();
    if (openMenuId === personId) {
      setOpenMenuId(null);
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2
    });
    setOpenMenuId(personId);
  };

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
          
          {selectedId === person.id && (
            <button
              onClick={(e) => handleJerseyClick(e, person.id)}
              className="text-[10px] font-bold uppercase tracking-wider bg-[#f5f5f5] hover:bg-[#eee] px-2 py-1 rounded border border-[#ddd] text-[#666] transition-colors"
            >
              Jersey
            </button>
          )}
        </div>
      ))}
      
      {openMenuId && menuPos && (
        <div 
          ref={menuRef}
          className="fixed bg-white border border-[#eee] shadow-xl rounded-lg p-3 z-50 w-48 flex flex-col gap-3"
          style={{ 
            top: `${menuPos.top}px`, 
            left: `${menuPos.left}px`,
            transform: 'translateX(-50%)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const person = people.find(p => p.id === openMenuId);
            if (!person) return null;
            return (['jersey', 'shorts', 'socks'] as const).map((part) => (
              <div key={part} className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase text-[#666]">{part}</span>
                <div className="flex flex-wrap gap-1">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => handleColorChange(person.id, part, color)}
                      className={`w-5 h-5 rounded-full border shadow-sm transition-transform hover:scale-110 ${
                        person.colors?.[part] === color ? 'ring-2 ring-offset-1 ring-[#FC3434]' : 'border-black/10'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {people.length === 0 && (
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="w-16 h-16 rounded-lg bg-[#f5f5f5] animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
};
