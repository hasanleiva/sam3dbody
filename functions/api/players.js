import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function onRequestGet(context) {
  const { env } = context;
  const r2Base = env.VITE_R2_STORAGE_URL || env.R2_PUBLIC_URL || "";
  const bucketName = env.R2_BUCKET_NAME;

  try {
    let contents = [];
    
    // First, try native Cloudflare R2 Binding if they configured it via the 'Bindings' tab
    if (env.R2_BUCKET) {
      const listed = await env.R2_BUCKET.list({ prefix: "players/" });
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
        Prefix: "players/",
      });
      const response = await s3Client.send(command);
      contents = response.Contents || [];
    } else {
      return new Response(JSON.stringify({ models: [], warn: "Missing R2 configurations" }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const models = contents
      .filter((obj) => obj.Key && /\.fbx$/i.test(obj.Key))
      .map((obj) => {
        const parts = obj.Key.split('/');
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
      
    return new Response(JSON.stringify({ models }), { 
       headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ models: [], error: err.message }), { 
       status: 500,
       headers: { "Content-Type": "application/json" }
    });
  }
}
