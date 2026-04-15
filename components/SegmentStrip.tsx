
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

  return (
    <div className="h-32 px-6 flex items-center gap-3 overflow-x-auto bg-white border-b border-[#eee] no-scrollbar relative">
      {people.map((person) => (
        <div key={person.id} className="relative flex flex-col items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onSelect(person.id)}
            className={`
              relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all
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
              <span className="text-[10px] text-white font-medium">{person.name}</span>
            </div>
          </button>
          
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
