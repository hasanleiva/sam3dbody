// Cloudflare Pages Function to proxy R2 requests to bypass CORS
export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      return new Response("Failed to fetch model", { status: response.status });
    }

    // Pass the response through but add permissive CORS headers
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=31536000");

    return new Response(response.body, {
      status: response.status,
      headers: headers
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
