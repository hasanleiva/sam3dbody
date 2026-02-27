
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let model: cocoSsd.ObjectDetection | null = null;

export async function loadYoloModel() {
  if (!model) {
    // COCO-SSD is a common object detection model for TF.js that performs similarly to YOLO
    model = await cocoSsd.load();
  }
  return model;
}

export async function detectAndCropPlayers(imageElement: HTMLImageElement): Promise<{ bbox: [number, number, number, number], thumbnail: string }[]> {
  const detector = await loadYoloModel();
  const predictions = await detector.detect(imageElement);
  
  const players = predictions.filter(p => p.class === 'person');
  
  const results = await Promise.all(players.map(async (player) => {
    const [x, y, width, height] = player.bbox;
    const thumbnail = await cropImage(imageElement, x, y, width, height);
    
    // Convert to percentage for the app's coordinate system
    const pctX = (x / imageElement.width) * 100;
    const pctY = (y / imageElement.height) * 100;
    const pctW = (width / imageElement.width) * 100;
    const pctH = (height / imageElement.height) * 100;
    
    return {
      bbox: [pctX, pctY, pctW, pctH] as [number, number, number, number],
      thumbnail
    };
  }));
  
  return results;
}

export async function cropImage(image: HTMLImageElement | HTMLCanvasElement, x: number, y: number, width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas');
  // Add some padding to the crop
  const padding = 0.1;
  const px = Math.max(0, x - width * padding);
  const py = Math.max(0, y - height * padding);
  const pw = Math.min(image.width - px, width * (1 + padding * 2));
  const ph = Math.min(image.height - py, height * (1 + padding * 2));

  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  ctx.drawImage(image, px, py, pw, ph, 0, 0, 200, 200);
  return canvas.toDataURL('image/jpeg', 0.8);
}
