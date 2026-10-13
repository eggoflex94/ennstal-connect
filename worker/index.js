// Public Supabase Storage CDN. This endpoint is deliberately restricted to
// named PUBLIC buckets; private messages and documents never reach this proxy.
const PUBLIC_BUCKETS = new Set([
  "avatars", "community-images", "community-media", "community-reels",
  "event-photos", "group-images", "news-images", "popup-images",
  "profile-avatars", "profile-media", "sidebar-banners"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/media/public/")) {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const pieces = url.pathname.slice("/media/public/".length).split("/");
    const bucket = pieces.shift();
    if (!PUBLIC_BUCKETS.has(bucket) || !pieces.length || pieces.some(p => !p || p === "." || p === "..")) {
      return new Response("Not found", { status: 404 });
    }
    // Do not accept transform directives or signed-token query parameters.
    if (url.search) return new Response("Unsupported query", { status: 400 });
    const path = pieces.map(segment => encodeURIComponent(decodeURIComponent(segment))).join("/");
    const origin = new URL(`https://eqfvhgiyrofjscvimvrc.supabase.co/storage/v1/object/public/${bucket}/${path}`);
    const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    if (!response) {
      const upstream = await fetch(origin, { redirect: "error" });
      if (!upstream.ok) return new Response("Media unavailable", { status: upstream.status });
      const type = upstream.headers.get("content-type") || "";
      if (!/^(image\/|video\/|audio\/|application\/pdf)/i.test(type)) {
        return new Response("Unsupported media", { status: 415 });
      }
      response = new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          "X-Content-Type-Options": "nosniff"
        }
      });
      // Best-effort cache write; a cold miss still serves normally.
      await cache.put(cacheKey, response.clone());
    }
    if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
    return response;
  }
};
