
import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="h-14 flex items-center justify-between px-6 bg-[#090909] border-b border-[#1a1a1a]">
      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-[#1a1a1a] rounded-lg text-[#888] hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
        <h1 className="text-lg font-medium text-white/90">SAM 3D <span className="text-white/40 font-normal">| Body Generation</span></h1>
      </div>
      
      <div className="flex items-center gap-3">
        <button className="p-2 hover:bg-[#1a1a1a] rounded-lg text-[#888] hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600" />
      </div>
    </header>
  );
};
