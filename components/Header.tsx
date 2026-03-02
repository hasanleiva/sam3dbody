
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { SubscriptionModal } from './SubscriptionModal';
import { SettingsModal } from './SettingsModal';

interface HeaderProps {
  onLoginClick: () => void;
  onNewScene: () => void;
  onSaveScene: () => void;
  onLoadScene: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLoginClick, onNewScene, onSaveScene, onLoadScene }) => {
  const { user } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProfileClick = () => {
    if (user) {
      setIsDropdownOpen(!isDropdownOpen);
    } else {
      onLoginClick();
    }
  };

  const handleSignOut = () => {
    signOut(auth);
    setIsDropdownOpen(false);
  };

  return (
    <>
      <header className="h-14 flex items-center justify-between px-6 bg-[#090909] border-b border-[#1a1a1a]">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-[#1a1a1a] rounded-lg text-[#888] hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          <h1 className="text-lg font-medium text-white/90">SAM 3D <span className="text-white/40 font-normal">| Body Generation</span></h1>
        </div>
        
        <div className="flex items-center gap-3 relative">
          {user && (
            <div className="flex items-center gap-2 mr-4">
              <button onClick={onNewScene} className="px-3 py-1.5 text-sm font-medium text-red-500 border border-red-500 hover:bg-red-500/10 rounded transition-colors">
                New scene
              </button>
              <button onClick={onSaveScene} className="px-3 py-1.5 text-sm font-medium text-red-500 border border-red-500 hover:bg-red-500/10 rounded transition-colors">
                Save scene
              </button>
              <button onClick={onLoadScene} className="px-3 py-1.5 text-sm font-medium text-red-500 border border-red-500 hover:bg-red-500/10 rounded transition-colors">
                Load scene
              </button>
            </div>
          )}
          <button className="p-2 hover:bg-[#1a1a1a] rounded-lg text-[#888] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          
          <div className="relative" ref={dropdownRef}>
            <div 
              onClick={handleProfileClick}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 cursor-pointer flex items-center justify-center text-white text-xs font-bold"
              title={user ? "Profile" : "Sign in"}
            >
              {user ? user.email?.[0].toUpperCase() : ''}
            </div>

            {isDropdownOpen && user && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-[#333]">
                  <p className="text-sm text-white truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  <button 
                    onClick={() => { setIsSubscriptionModalOpen(true); setIsDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition-colors"
                  >
                    Subscription
                  </button>
                  <button 
                    onClick={() => { setIsSettingsModalOpen(true); setIsDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition-colors"
                  >
                    Settings
                  </button>
                  <button 
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-[#2a2a2a] transition-colors"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <SubscriptionModal 
        isOpen={isSubscriptionModalOpen} 
        onClose={() => setIsSubscriptionModalOpen(false)} 
      />
      
      <SettingsModal 
        isOpen={isSettingsModalOpen} 
        onClose={() => setIsSettingsModalOpen(false)} 
      />
    </>
  );
};
