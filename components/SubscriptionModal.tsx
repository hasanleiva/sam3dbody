import React from 'react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl border border-[#eee] w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-[#eee]">
          <h2 className="text-lg font-medium text-black">Subscription Plans</h2>
          <button onClick={onClose} className="text-black/30 hover:text-black transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Freemium Plan */}
          <div className="bg-[#f8f8f8] rounded-lg p-6 border border-[#eee] flex flex-col">
            <h3 className="text-xl font-bold text-black mb-2">Freemium</h3>
            <p className="text-black/40 text-sm mb-4">Basic features for casual users.</p>
            <div className="text-3xl font-bold text-black mb-6">$0<span className="text-lg text-black/40 font-normal">/mo</span></div>
            
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center text-sm text-black/60">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Basic 3D Body Generation
              </li>
              <li className="flex items-center text-sm text-black/60">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Up to 5 scenes
              </li>
              <li className="flex items-center text-sm text-black/60">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Standard support
              </li>
            </ul>
            
            <button className="w-full py-2 rounded-lg bg-[#eee] text-black/60 font-medium cursor-default">
              Current Plan
            </button>
          </div>

          {/* Paid Plan */}
          <div className="bg-white rounded-lg p-6 border border-[#FC3434]/30 flex flex-col relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 bg-[#FC3434] text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Popular</div>
            <h3 className="text-xl font-bold text-black mb-2">Pro</h3>
            <p className="text-black/40 text-sm mb-4">Advanced features for professionals.</p>
            <div className="text-3xl font-bold text-black mb-6">$19<span className="text-lg text-black/40 font-normal">/mo</span></div>
            
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center text-sm text-black/60">
                <svg className="w-4 h-4 mr-2 text-[#FC3434]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                High-res 3D Body Generation
              </li>
              <li className="flex items-center text-sm text-black/60">
                <svg className="w-4 h-4 mr-2 text-[#FC3434]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Unlimited scenes
              </li>
              <li className="flex items-center text-sm text-black/60">
                <svg className="w-4 h-4 mr-2 text-[#FC3434]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Priority support
              </li>
              <li className="flex items-center text-sm text-black/60">
                <svg className="w-4 h-4 mr-2 text-[#FC3434]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Export to multiple formats
              </li>
            </ul>
            
            <button className="w-full py-2 rounded-lg bg-[#FC3434] text-white font-medium hover:bg-[#e02e2e] transition-colors shadow-[0_0_15px_rgba(252,52,52,0.2)]">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
