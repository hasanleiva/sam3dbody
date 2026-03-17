
import React from 'react';
import { DetectedPerson } from '../types';

interface SegmentStripProps {
  people: DetectedPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const SegmentStrip: React.FC<SegmentStripProps> = ({ people, selectedId, onSelect }) => {
  return (
    <div className="h-24 px-6 flex items-center gap-3 overflow-x-auto bg-[#090909] border-b border-[#1a1a1a] no-scrollbar">
      {people.map((person) => (
        <button
          key={person.id}
          onClick={() => onSelect(person.id)}
          className={`
            relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all
            ${selectedId === person.id ? 'border-blue-500 scale-105 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'border-transparent hover:border-[#333]'}
          `}
        >
          <img 
            src={person.thumbnail?.startsWith('http') ? `${window.location.origin}/api/proxy-image?url=${encodeURIComponent(person.thumbnail)}` : person.thumbnail} 
            alt={person.name} 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer" 
          />
          <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center pb-1">
            <span className="text-[10px] text-white/80">{person.name}</span>
          </div>
        </button>
      ))}
      
      {people.length === 0 && (
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="w-16 h-16 rounded-lg bg-[#1a1a1a] animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
};
