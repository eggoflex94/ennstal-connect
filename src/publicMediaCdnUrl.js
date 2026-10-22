// Opt-in media URL helper. ONLY rewrite URLs from explicitly public buckets.
// Do not route signed URLs, transformations or query strings through the CDN.
const PUBLIC_BUCKETS = new Set([
  "avatars", "community-images", "community-media", "community-reels",
  "event-photos", "group-images", "news-images", "popup-images",
  "profile-avatars", "profile-media", "sidebar-banners"
]);
const SUPABASE_HOST = "eqfvhgiyrofjscvimvrc.supabase.co";

export function publicMediaCdnUrl(value) {
  if (typeof value !== "string" || !value) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== SUPABASE_HOST || url.search || url.hash) return value;
    const prefix = "/storage/v1/object/public/";
    if (!url.pathname.startsWith(prefix)) return value;
    const suffix = url.pathname.slice(prefix.length);
    const bucket = suffix.split("/")[0];
    if (!PUBLIC_BUCKETS.has(bucket) || !suffix.includes("/")) return value;
    return `/media/public/${suffix}`;
  } catch {
    return value;
  }
}
