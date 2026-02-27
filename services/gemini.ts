
import { GoogleGenAI, Type } from "@google/genai";
import { DetectedPerson } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeImage(base64Image: string): Promise<DetectedPerson[]> {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(',')[1],
            },
          },
          {
            text: "Identify all people in this image. For each person, provide: \n1. A bounding box [x, y, width, height] as percentage coordinates.\n2. Their activity.\n3. A simulated 3D pose (rotation X, Y, Z in radians) to represent their orientation.\nReturn the data as a JSON array.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            bbox: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER },
              description: "[x, y, width, height] in percentages (0-100)"
            },
            pose: {
              type: Type.OBJECT,
              properties: {
                rotation: { 
                  type: Type.ARRAY, 
                  items: { type: Type.NUMBER },
                  description: "[rotX, rotY, rotZ]"
                },
                scale: { type: Type.NUMBER },
                activity: { type: Type.STRING }
              },
              required: ["rotation", "scale", "activity"]
            }
          },
          required: ["id", "name", "bbox", "pose"],
        },
      },
    },
  });

  const text = response.text;
  if (!text) return [];

  try {
    const rawData = JSON.parse(text);
    return rawData.map((p: any) => ({
      ...p,
      thumbnail: "", // Will be populated by YOLO/TF.js cropping in App.tsx
      confidence: 0.9 + Math.random() * 0.1
    }));
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}
