import { PitchNode } from '../types';

declare const cv: any;

/**
 * Standard FIFA pitch lines in world coordinates [x, y] in meters
 */
export const PITCH_LINES = [
  // Perimeter
  [[0, 0], [105, 0]], [[105, 0], [105, 68]], [[105, 68], [0, 68]], [[0, 68], [0, 0]],
  // Halfway line
  [[52.5, 0], [52.5, 68]],
  // Left Penalty Area
  [[0, 13.85], [16.5, 13.85]], [[16.5, 13.85], [16.5, 54.15]], [[16.5, 54.15], [0, 54.15]],
  // Right Penalty Area
  [[105, 13.85], [88.5, 13.85]], [[88.5, 13.85], [88.5, 54.15]], [[88.5, 54.15], [105, 54.15]],
  // 6 Yard Boxes
  [[0, 24.85], [5.5, 24.85]], [[5.5, 24.85], [5.5, 43.15]], [[5.5, 43.15], [0, 43.15]],
  [[105, 24.85], [99.5, 24.85]], [[99.5, 24.85], [99.5, 43.15]], [[99.5, 43.15], [105, 43.15]],
];

/**
 * Curved pitch markings (Center circle and D-arcs)
 * Format: { center: [x, y], radius: r, startAngle: deg, endAngle: deg }
 */
export const PITCH_CURVES = [
  // Center Circle
  { center: [52.5, 34], radius: 9.15, startAngle: 0, endAngle: 360 },
  // Left D-Arc
  { center: [11, 34], radius: 9.15, startAngle: -53, endAngle: 53 },
  // Right D-Arc
  { center: [105 - 11, 34], radius: 9.15, startAngle: 127, endAngle: 233 },
];

/**
 * Predefined calibration nodes based on pitch geometry to match the reference image density
 */
export const CALIBRATION_NODES: PitchNode[] = [
  // Corners
  { id: 'c_tl', name: 'Corner TL', x: 0, y: 0 },
  { id: 'c_bl', name: 'Corner BL', x: 0, y: 68 },
  { id: 'c_tr', name: 'Corner TR', x: 105, y: 0 },
  { id: 'c_br', name: 'Corner BR', x: 105, y: 68 },
  
  // Sideline/Halfway line intersections
  { id: 'h_t', name: 'Halfway Top', x: 52.5, y: 0 },
  { id: 'h_b', name: 'Halfway Bottom', x: 52.5, y: 68 },
  { id: 'h_c', name: 'Center Spot', x: 52.5, y: 34 },

  // Center Circle Intersections
  { id: 'cc_t', name: 'Center Circle Top', x: 52.5, y: 34 - 9.15 },
  { id: 'cc_b', name: 'Center Circle Bottom', x: 52.5, y: 34 + 9.15 },
  { id: 'cc_l', name: 'Center Circle Left', x: 52.5 - 9.15, y: 34 },
  { id: 'cc_r', name: 'Center Circle Right', x: 52.5 + 9.15, y: 34 },

  // Left Penalty Area
  { id: 'l_pa_tl', name: 'L Penalty TL', x: 0, y: 13.85 },
  { id: 'l_pa_bl', name: 'L Penalty BL', x: 0, y: 54.15 },
  { id: 'l_pa_tr', name: 'L Penalty TR', x: 16.5, y: 13.85 },
  { id: 'l_pa_br', name: 'L Penalty BR', x: 16.5, y: 54.15 },
  { id: 'l_pa_spot', name: 'L Penalty Spot', x: 11, y: 34 },

  // Right Penalty Area
  { id: 'r_pa_tl', name: 'R Penalty TL', x: 88.5, y: 13.85 },
  { id: 'r_pa_bl', name: 'R Penalty BL', x: 88.5, y: 54.15 },
  { id: 'r_pa_tr', name: 'R Penalty TR', x: 105, y: 13.85 },
  { id: 'r_pa_br', name: 'R Penalty BR', x: 105, y: 54.15 },
  { id: 'r_pa_spot', name: 'R Penalty Spot', x: 105 - 11, y: 34 },

  // Left 6-Yard Box
  { id: 'l_6_tl', name: 'L 6-Yard TL', x: 0, y: 24.85 },
  { id: 'l_6_bl', name: 'L 6-Yard BL', x: 0, y: 43.15 },
  { id: 'l_6_tr', name: 'L 6-Yard TR', x: 5.5, y: 24.85 },
  { id: 'l_6_br', name: 'L 6-Yard BR', x: 5.5, y: 43.15 },

  // Right 6-Yard Box
  { id: 'r_6_tl', name: 'R 6-Yard TL', x: 99.5, y: 24.85 },
  { id: 'r_6_bl', name: 'R 6-Yard BL', x: 99.5, y: 43.15 },
  { id: 'r_6_tr', name: 'R 6-Yard TR', x: 105, y: 24.85 },
  { id: 'r_6_br', name: 'R 6-Yard BR', x: 105, y: 43.15 },

  // Goal Post Intersections
  { id: 'l_g_t', name: 'L Goal Top', x: 0, y: 34 - 3.66 },
  { id: 'l_g_b', name: 'L Goal Bottom', x: 0, y: 34 + 3.66 },
  { id: 'r_g_t', name: 'R Goal Top', x: 105, y: 34 - 3.66 },
  { id: 'r_g_b', name: 'R Goal Bottom', x: 105, y: 34 + 3.66 },

  // D-Arc Intersections
  { id: 'l_d_t', name: 'L Arc Top', x: 16.5, y: 26.69 },
  { id: 'l_d_b', name: 'L Arc Bottom', x: 16.5, y: 41.31 },
  { id: 'r_d_t', name: 'R Arc Top', x: 88.5, y: 26.69 },
  { id: 'r_d_b', name: 'R Arc Bottom', x: 88.5, y: 41.31 },
];

/**
 * Computes the homography matrix from world coordinates to image percentages
 */
export function calculateHomography(worldPoints: number[][], imagePoints: number[][]): number[] | null {
  if (typeof cv === 'undefined' || !cv.matFromArray) return null;

  try {
    const src = cv.matFromArray(worldPoints.length, 1, cv.CV_32FC2, worldPoints.flat());
    const dst = cv.matFromArray(imagePoints.length, 1, cv.CV_32FC2, imagePoints.flat());
    // Use 0 (regular) instead of RANSAC for more stable results with few points
    const h = cv.findHomography(src, dst, 0);
    const data = Array.from(h.data64F) as number[];
    src.delete(); dst.delete(); h.delete();
    return data;
  } catch (e) {
    console.error("Homography calculation failed", e);
    return null;
  }
}

/**
 * Projects a point using a 3x3 homography matrix
 */
export function projectPoint(x: number, y: number, h: number[]): [number, number] {
  const w = h[6] * x + h[7] * y + h[8];
  return [
    (h[0] * x + h[1] * y + h[2]) / w,
    (h[3] * x + h[4] * y + h[5]) / w
  ];
}
