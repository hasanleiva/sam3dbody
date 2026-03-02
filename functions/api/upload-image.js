export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { image } = await request.json();

    if (!image) {
      return new Response(JSON.stringify({ error: "Missing image" }), { status: 400 });
    }

    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return new Response(JSON.stringify({ error: "Invalid base64 string" }), { status: 400 });
    }

    const contentType = matches[1];
    const buffer = Uint8Array.from(atob(matches[2]), c => c.charCodeAt(0));
    const filename = `scenes/${Date.now()}_image.jpg`;

    // Assuming the R2 bucket is bound as `R2_BUCKET`
    if (!env.R2_BUCKET) {
      return new Response(JSON.stringify({ error: "R2_BUCKET binding not found" }), { status: 500 });
    }

    await env.R2_BUCKET.put(filename, buffer, {
      httpMetadata: { contentType },
    });

    const publicUrlBase = env.R2_PUBLIC_URL;
    if (!publicUrlBase) {
      return new Response(JSON.stringify({ error: "R2_PUBLIC_URL not configured" }), { status: 500 });
    }

    const publicUrl = `${publicUrlBase}/${filename}`;
    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Failed to upload image" }), { status: 500 });
  }
}
