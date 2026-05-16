export interface PitchNode {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface DetectedPerson {
  id: string;
  thumbnail: string;
  name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height] as percentage
  pose: {
    rotation: [number, number, number];
    scale: number;
    activity: string;
  };
  worldPos?: [number, number]; // [x, y] in meters on the pitch
  meshUrl?: string; // High-res PLY
  bodyModelUrl?: string; // Replaced 3D character model URL
  textureUrl?: string; // Adding textureUrl optional property
  colors?: {
    jersey: string;
    shorts: string;
    socks: string;
    body: string;
  };
  showName?: boolean;
}

export interface CalibrationPoint {
  id: string;
  imageX: number; // percentage 0-100
  imageY: number; // percentage 0-100
  worldX: number; // meters 0-105
  worldY: number; // meters 0-68
}

export interface DistanceMeasurement {
  id: string;
  type?: 'distance' | 'arrow';
  points: [number, number, number][];
  color?: string;
  text?: string;
  textColor?: string;
  startTime?: number;
  endTime?: number;
}

export interface BillboardData {
  id: string;
  url: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  width: number;
  height: number;
  startTime?: number;
  endTime?: number;
}

export interface CameraKeyframe {
  id: string;
  time: number; // 0 to 1, representing position on timeline
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface CameraSettings {
  aspectRatio: '16:9' | '1:1' | '9:16' | 'free';
}

export interface AppState {
  image: string | null;
  videoUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  imageDimensions?: { width: number; height: number } | null;
  detectedPeople: DetectedPerson[];
  selectedId: string | null;
  isAnalyzing: boolean;
  isCalibrating: boolean;
  calibrationPoints: CalibrationPoint[];
  homographyMatrix: number[] | null;
  inverseHomographyMatrix: number[] | null;
  error: string | null;
  customNodes: PitchNode[];
  fullscreenView?: 'image' | '3d' | null;
  measurements?: DistanceMeasurement[];
  billboards?: BillboardData[];
}