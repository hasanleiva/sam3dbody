import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { AppState, DistanceMeasurement, BillboardData } from '../types';

interface LoadSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (state: Partial<AppState>, measurements?: DistanceMeasurement[], billboards?: BillboardData[]) => void;
}

interface Scene {
  id: string;
  name: string;
  createdAt: any;
  state: Partial<AppState> & { measurements?: string | DistanceMeasurement[], billboards?: string | BillboardData[] };
  measurements?: string | DistanceMeasurement[];
  billboards?: string | BillboardData[];
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-[#eee] p-8 rounded-2xl shadow-2xl w-full max-w-2xl relative max-h-[80vh] flex flex-col">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-black/30 hover:text-black transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-black mb-6">Load Scene</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="w-8 h-8 border-4 border-[#FC3434] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : scenes.length === 0 ? (
            <div className="text-center text-black/40 py-12">
              No saved scenes found.
            </div>
          ) : (
            scenes.map(scene => (
              <div 
                key={scene.id}
                onClick={() => {
                  let parsedMeasurements: DistanceMeasurement[] | undefined = undefined;
                  const rawMeasurements = scene.measurements || scene.state.measurements;
                  if (rawMeasurements) {
                    if (typeof rawMeasurements === 'string') {
                      try {
                        parsedMeasurements = JSON.parse(rawMeasurements);
                      } catch (e) {
                        console.error('Failed to parse measurements', e);
                      }
                    } else {
                      parsedMeasurements = rawMeasurements;
                    }
                  }

                  let parsedBillboards: BillboardData[] | undefined = undefined;
                  const rawBillboards = scene.billboards || scene.state.billboards;
                  if (rawBillboards) {
                    if (typeof rawBillboards === 'string') {
                      try {
                        parsedBillboards = JSON.parse(rawBillboards);
                      } catch (e) {
                        console.error('Failed to parse billboards', e);
                      }
                    } else {
                      parsedBillboards = rawBillboards;
                    }
                  }

                  onLoad(scene.state, parsedMeasurements, parsedBillboards);
                  onClose();
                }}
                className="bg-[#f8f8f8] border border-[#eee] p-4 rounded-xl hover:bg-[#f0f0f0] hover:border-[#ddd] transition-all cursor-pointer flex items-center justify-between group"
              >
                <div>
                  <h3 className="text-black font-medium text-lg">{scene.name}</h3>
                  <p className="text-black/40 text-sm mt-1">
                    {scene.createdAt?.toDate ? scene.createdAt.toDate().toLocaleString() : 'Unknown date'}
                  </p>
                </div>
                <button 
                  onClick={(e) => handleDelete(scene.id, e)}
                  className="p-2 text-red-400/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
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
