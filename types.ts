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
  meshUrl?: string;
  colors?: {
    jersey: string;
    shorts: string;
    socks: string;
    body: string;
  };
}

export interface CalibrationPoint {
  id: string;
  imageX: number; // percentage 0-100
  imageY: number; // percentage 0-100
  worldX: number; // meters 0-105
  worldY: number; // meters 0-68
}

export interface AppState {
  image: string | null;
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
}