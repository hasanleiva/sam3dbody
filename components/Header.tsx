
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
      <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-[#eee]">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-[#FC3434]">REPLAYGRAM <span className="text-[#FC3434]/60 font-medium">| Soccer 3D web analysis</span></h1>
        </div>
        
        <div className="flex items-center gap-3 relative">
          {user && (
            <div className="flex items-center gap-2 mr-4">
              <button onClick={onNewScene} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#FC3434] text-white hover:bg-[#e02e2e] rounded transition-colors shadow-sm">
                New scene
              </button>
              <button onClick={onSaveScene} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#FC3434] text-white hover:bg-[#e02e2e] rounded transition-colors shadow-sm">
                Save scene
              </button>
              <button onClick={onLoadScene} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#FC3434] text-white hover:bg-[#e02e2e] rounded transition-colors shadow-sm">
                Load scene
              </button>
            </div>
          )}
          
          <div className="relative" ref={dropdownRef}>
            <div 
              onClick={handleProfileClick}
              className="w-8 h-8 rounded-full bg-[#FC3434] cursor-pointer flex items-center justify-center text-white text-xs font-bold shadow-sm"
              title={user ? "Profile" : "Sign in"}
            >
              {user ? user.email?.[0].toUpperCase() : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>

            {isDropdownOpen && user && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-[#eee] rounded-lg shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-[#eee]">
                  <p className="text-sm text-black font-medium truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  <button 
                    onClick={() => { setIsSubscriptionModalOpen(true); setIsDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-[#666] hover:bg-[#f5f5f5] hover:text-black transition-colors"
                  >
                    Subscription
                  </button>
                  <button 
                    onClick={() => { setIsSettingsModalOpen(true); setIsDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-[#666] hover:bg-[#f5f5f5] hover:text-black transition-colors"
                  >
                    Settings
                  </button>
                  <button 
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-[#FC3434] hover:bg-[#f5f5f5] transition-colors"
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
