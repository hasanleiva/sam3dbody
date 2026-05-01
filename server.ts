import express from "express";
import cors from "cors";
import * as admin from "firebase-admin";
import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

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
app.use(express.json({ limit: '50mb' }));

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

let s3Client: S3Client | null = null;
function getS3Client() {
  if (!s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("Missing R2 credentials in environment variables");
    }

    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

// API Route to upload image to Cloudflare R2
app.post("/api/upload-image", verifyToken, async (req: any, res: any) => {
  try {
    const { image } = req.body;
    const userId = req.user.uid;

    if (!image) {
      return res.status(400).json({ error: "Missing image" });
    }

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 string" });
    }

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `users/${userId}/scenes/${Date.now()}_image.jpg`;

    const client = getS3Client();
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrlBase = process.env.R2_PUBLIC_URL;

    if (!bucketName || !publicUrlBase) {
      return res.status(500).json({ error: "Missing R2 bucket configuration" });
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      Body: buffer,
      ContentType: contentType,
    });

    await client.send(command);

    const publicUrl = `${publicUrlBase}/${filename}`;
    res.json({ url: publicUrl });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload image" });
  }
});

// Proxy image route to bypass CORS for Cloudflare R2 images
app.get("/api/proxy-model", async (req: any, res: any) => {
  try {
    const modelUrl = req.query.url as string;
    if (!modelUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const response = await fetch(modelUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch model" });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.send(buffer);
  } catch (error: any) {
    console.error("Proxy model error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/proxy-image", async (req: any, res: any) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch image" });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.send(buffer);
  } catch (error: any) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error.message || "Failed to proxy image" });
  }
});

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

// API Route to list textures
app.get("/api/textures", async (req: any, res: any) => {
  const r2Base = process.env.VITE_R2_STORAGE_URL || process.env.R2_PUBLIC_URL || "";
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!r2Base || !bucketName || !process.env.R2_ACCOUNT_ID) {
    console.warn("Server is missing R2 environment variables for /api/textures endpoint. Requires VITE_R2_STORAGE_URL, R2_BUCKET_NAME, and R2_ACCOUNT_ID.");
    return res.json({ textures: [] });
  }

  try {
    const client = getS3Client();
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: "textures/"
    });
    const response = await client.send(command);
    const textures = (response.Contents || [])
      .filter((obj) => obj.Key && /\.(png|jpe?g|svg|webp)$/i.test(obj.Key))
      .map((obj) => {
        const parts = obj.Key!.split('/');
        const fileName = parts.pop();
        
        let team = 'System';
        if (parts.length > 1) {
          const idx = parts.indexOf('textures');
          if (idx !== -1 && idx + 1 < parts.length) {
            team = parts[idx + 1];
          }
        }
        
        return { name: fileName, path: `${r2Base}/${obj.Key}`, team };
      });
    return res.json({ textures });
  } catch (e) {
    console.error("Error fetching textures from R2:", e);
    return res.json({ textures: [] });
  }
});

// API Route to list HDR maps
app.get("/api/hdr", async (req: any, res: any) => {
  const r2Base = process.env.VITE_R2_STORAGE_URL || process.env.R2_PUBLIC_URL || "";
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!r2Base || !bucketName || !process.env.R2_ACCOUNT_ID) {
    console.warn("Server is missing R2 environment variables for /api/hdr endpoint. Requires VITE_R2_STORAGE_URL, R2_BUCKET_NAME, and R2_ACCOUNT_ID.");
    return res.json({ hdrs: [] });
  }

  try {
    const client = getS3Client();
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: "hdr/"
    });
    const response = await client.send(command);
    const hdrs = (response.Contents || [])
      .filter((obj) => obj.Key && /\.(hdr)$/i.test(obj.Key))
      .map((obj) => {
        const fileName = obj.Key!.split('/').pop();
        return { name: fileName, path: `${r2Base}/${obj.Key}` };
      });
    return res.json({ hdrs });
  } catch (e) {
    console.error("Error fetching HDRs from R2:", e);
    return res.json({ hdrs: [] });
  }
});

// API Route to list Player models
app.get("/api/players", async (req: any, res: any) => {
  const r2Base = process.env.VITE_R2_STORAGE_URL || process.env.R2_PUBLIC_URL || "";
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!r2Base || !bucketName || !process.env.R2_ACCOUNT_ID) {
    console.warn("Server is missing R2 environment variables for /api/players endpoint.");
    return res.json({ models: [] });
  }

  try {
    const client = getS3Client();
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: "players/"
    });
    const response = await client.send(command);
    
    const models = (response.Contents || [])
      .filter((obj) => obj.Key && /\.fbx$/i.test(obj.Key))
      .map((obj) => {
        const parts = obj.Key!.split('/');
        const fileName = parts.pop() || '';
        let team = 'Unknown Team';
        let league = 'Unknown League';
        
        if (parts.length >= 4 && parts[0] === 'players') {
            league = parts[1];
            team = parts.length >= 4 ? parts[3] : parts[2];
        } else if (parts.length >= 3) {
            team = parts[parts.length - 1];
        }

        return { 
          name: fileName.replace('.fbx', ''), 
          path: `${r2Base}/${obj.Key}`,
          team: team,
          league: league
        };
      });
    return res.json({ models });
  } catch (e) {
    console.error("Error fetching player models from R2:", e);
    return res.json({ models: [] });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
