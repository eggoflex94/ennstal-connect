const STORAGE_ORIGIN = 'https://eqfvhgiyrofjscvimvrc.supabase.co';
export const IMAGE_CACHE_NAME = 'ec-public-images-v1';
export function publicImageVariant(src, width = 256) {
  try {
    const url = new URL(src);
    if (url.searchParams.has('token') || url.origin !== STORAGE_ORIGIN || !url.pathname.startsWith('/storage/v1/object/public/') || !/\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)) return src;
    const size = [128, 256, 640, 1280, 1920].find(size => size >= width) || 1920;
    url.searchParams.set('ec_w', String(size));
    return url.href;
  } catch { return src; }
}
export async function startPublicImageCache() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/ec-public-image-cache.js', { updateViaCache: 'none' }); }
  catch { /* Images still load normally when browser storage is unavailable. */ }
}
