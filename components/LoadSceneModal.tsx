import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { AppState } from '../types';

interface LoadSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (state: Partial<AppState>) => void;
}

interface Scene {
  id: string;
  name: string;
  createdAt: any;
  state: Partial<AppState>;
}

export const LoadSceneModal: React.FC<LoadSceneModalProps> = ({ isOpen, onClose, onLoad }) => {
  const { user } = useAuth();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !user) return;

    const fetchScenes = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'users', user.uid, 'scenes'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const fetchedScenes: Scene[] = [];
        querySnapshot.forEach((doc) => {
          fetchedScenes.push({ id: doc.id, ...doc.data() } as Scene);
        });
        setScenes(fetchedScenes);
      } catch (err: any) {
        setError(err.message || 'Failed to load scenes');
      } finally {
        setLoading(false);
      }
    };

    fetchScenes();
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'scenes', id));
      setScenes(scenes.filter(scene => scene.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete scene');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#111] border border-white/10 p-8 rounded-2xl shadow-2xl w-full max-w-2xl relative max-h-[80vh] flex flex-col">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-white mb-6">Load Scene</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : scenes.length === 0 ? (
            <div className="text-center text-white/50 py-12">
              No saved scenes found.
            </div>
          ) : (
            scenes.map(scene => (
              <div 
                key={scene.id}
                onClick={() => {
                  onLoad(scene.state);
                  onClose();
                }}
                className="bg-black/40 border border-white/5 p-4 rounded-xl hover:bg-white/5 hover:border-white/20 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div>
                  <h3 className="text-white font-medium text-lg">{scene.name}</h3>
                  <p className="text-white/40 text-sm mt-1">
                    {scene.createdAt?.toDate ? scene.createdAt.toDate().toLocaleString() : 'Unknown date'}
                  </p>
                </div>
                <button 
                  onClick={(e) => handleDelete(scene.id, e)}
                  className="p-2 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Delete scene"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
