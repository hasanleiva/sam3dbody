import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import * as admin from "firebase-admin";
import { fal } from "@fal-ai/client";
import dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Admin
// In a real production environment, FIREBASE_SERVICE_ACCOUNT would be a JSON string of your service account key
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin initialized successfully.");
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON.");
  }
} else {
  console.warn("FIREBASE_SERVICE_ACCOUNT environment variable is not set. Auth verification will be bypassed for development.");
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Middleware to verify Firebase Auth token
const verifyToken = async (req: any, res: any, next: any) => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Bypass verification if no service account is provided (for easy local dev)
    req.user = { uid: 'dev-user' };
    return next();
  }

  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// API Route to start Fal.ai integration securely on the backend
app.post("/api/fal-scan/start", verifyToken, async (req: any, res: any) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    const falKey = process.env.VITE_FAL_KEY || process.env.FAL_KEY;
    if (!falKey) {
      return res.status(500).json({ error: "FAL_KEY is not configured on the server" });
    }

    fal.config({
      credentials: () => falKey,
    });

    console.log(`Starting Fal.ai scan for user ${req.user.uid} with image ${imageUrl}`);

    // Submit the job to the queue
    const { request_id } = await fal.queue.submit("fal-ai/sam-3/3d-body", {
      input: {
        image_url: imageUrl,
      },
    });

    res.json({ request_id });
  } catch (error: any) {
    console.error("Fal.ai API Error:", error);
    res.status(500).json({ error: error.message || "Failed to start image processing" });
  }
});

// API Route to check status
app.get("/api/fal-scan/status/:requestId", verifyToken, async (req: any, res: any) => {
  try {
    const { requestId } = req.params;
    const falKey = process.env.VITE_FAL_KEY || process.env.FAL_KEY;
    if (!falKey) {
      return res.status(500).json({ error: "FAL_KEY is not configured on the server" });
    }

    fal.config({
      credentials: () => falKey,
    });

    const status = await fal.queue.status("fal-ai/sam-3/3d-body", { requestId, logs: true });
    
    if (status.status === "COMPLETED") {
      const result = await fal.queue.result("fal-ai/sam-3/3d-body", requestId);
      return res.json({ status: "COMPLETED", result });
    }

    res.json({ status: status.status, logs: (status as any).logs });
  } catch (error: any) {
    console.error("Fal.ai API Status Error:", error);
    res.status(500).json({ error: error.message || "Failed to check status" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
