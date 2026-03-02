import React from 'react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] rounded-xl border border-[#333] w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-[#333]">
          <h2 className="text-lg font-medium text-white">Subscription Plans</h2>
          <button onClick={onClose} className="text-[#888] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Freemium Plan */}
          <div className="bg-[#222] rounded-lg p-6 border border-[#444] flex flex-col">
            <h3 className="text-xl font-bold text-white mb-2">Freemium</h3>
            <p className="text-[#888] text-sm mb-4">Basic features for casual users.</p>
            <div className="text-3xl font-bold text-white mb-6">$0<span className="text-lg text-[#888] font-normal">/mo</span></div>
            
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center text-sm text-[#ccc]">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Basic 3D Body Generation
              </li>
              <li className="flex items-center text-sm text-[#ccc]">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Up to 5 scenes
              </li>
              <li className="flex items-center text-sm text-[#ccc]">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Standard support
              </li>
            </ul>
            
            <button className="w-full py-2 rounded-lg bg-[#333] text-white font-medium hover:bg-[#444] transition-colors">
              Current Plan
            </button>
          </div>

          {/* Paid Plan */}
          <div className="bg-gradient-to-b from-[#2a2a3a] to-[#222] rounded-lg p-6 border border-blue-500/50 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Popular</div>
            <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
            <p className="text-[#888] text-sm mb-4">Advanced features for professionals.</p>
            <div className="text-3xl font-bold text-white mb-6">$19<span className="text-lg text-[#888] font-normal">/mo</span></div>
            
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center text-sm text-[#ccc]">
                <svg className="w-4 h-4 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                High-res 3D Body Generation
              </li>
              <li className="flex items-center text-sm text-[#ccc]">
                <svg className="w-4 h-4 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Unlimited scenes
              </li>
              <li className="flex items-center text-sm text-[#ccc]">
                <svg className="w-4 h-4 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Priority support
              </li>
              <li className="flex items-center text-sm text-[#ccc]">
                <svg className="w-4 h-4 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Export to multiple formats
              </li>
            </ul>
            
            <button className="w-full py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
