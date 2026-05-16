import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { AppState, DistanceMeasurement, BillboardData } from '../types';

interface SaveSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  measurements: DistanceMeasurement[];
  billboards: BillboardData[];
}

export const SaveSceneModal: React.FC<SaveSceneModalProps> = ({ isOpen, onClose, state, measurements, billboards }) => {
  const { user } = useAuth();
  const [sceneName, setSceneName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!sceneName.trim()) {
      setError('Scene name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let imageUrl = state.image;

      // If the image is a base64 string, upload it to Cloudflare R2 via our backend
      if (imageUrl && imageUrl.startsWith('data:image')) {
        const token = await user.getIdToken();
        // Use the current origin for the API URL since the backend is hosted on the same domain
        const apiUrl = window.location.origin;
        const response = await fetch(`${apiUrl}/api/upload-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ image: imageUrl })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to upload image to R2');
        }

        const data = await response.json();
        imageUrl = data.url;
      }

      const stateToSave = JSON.parse(JSON.stringify({
        image: imageUrl,
        imageDimensions: state.imageDimensions || null,
        calibrationPoints: state.calibrationPoints || null,
        homographyMatrix: state.homographyMatrix || null,
        detectedPeople: state.detectedPeople || [],
        customNodes: state.customNodes || [],
        measurements: JSON.stringify(measurements),
        billboards: JSON.stringify(billboards)
      }));

      await addDoc(collection(db, 'users', user.uid, 'scenes'), {
        name: sceneName,
        createdAt: serverTimestamp(),
        state: stateToSave
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save scene');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-[#eee] p-8 rounded-2xl shadow-2xl w-full max-w-md relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-black/30 hover:text-black transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-black mb-6">Save Scene</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black/60 mb-1">Scene Name</label>
            <input 
              type="text" 
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              className="w-full bg-[#f8f8f8] border border-[#eee] rounded-lg px-4 py-2.5 text-black focus:outline-none focus:border-[#FC3434] transition-colors"
              placeholder="e.g. Match 1 - First Half"
              required
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#FC3434] hover:bg-[#e02e2e] text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Scene'}
          </button>
        </form>
      </div>
    </div>
  );
};
