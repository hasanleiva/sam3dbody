import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function onRequestGet(context) {
  const { env } = context;
  const r2Base = env.VITE_R2_STORAGE_URL || env.R2_PUBLIC_URL || "";
  const bucketName = env.R2_BUCKET_NAME;

  try {
    let contents = [];
    
    // First, try native Cloudflare R2 Binding if they configured it via the 'Bindings' tab
    if (env.R2_BUCKET) {
      const listed = await env.R2_BUCKET.list({ prefix: "hdr/" });
      contents = listed.objects.map(obj => ({ Key: obj.key }));
    } 
    // Fallback to manual S3 SDK via Secrets if bindings aren't set
    else if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && bucketName) {
      const s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: "hdr/",
      });
      const response = await s3Client.send(command);
      contents = response.Contents || [];
    } else {
      return new Response(JSON.stringify({ hdrs: [], warn: "Missing R2 configurations" }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const hdrs = contents
      .filter((obj) => obj.Key && /\.(hdr)$/i.test(obj.Key))
      .map((obj) => {
        const fileName = obj.Key.split('/').pop();
        return { name: fileName, path: `${r2Base}/${obj.Key}` };
      });
      
    return new Response(JSON.stringify({ hdrs }), { 
       headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ hdrs: [], error: err.message }), { 
       status: 500,
       headers: { "Content-Type": "application/json" }
    });
  }
}
