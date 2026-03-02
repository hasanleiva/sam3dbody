export async function onRequestGet(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    const imageUrl = url.searchParams.get("url");

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), { status: 400 });
    }

    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch image" }), { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Failed to proxy image" }), { status: 500 });
  }
}
