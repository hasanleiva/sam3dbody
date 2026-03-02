import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import * as admin from "firebase-admin";
import { fal } from "@fal-ai/client";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
