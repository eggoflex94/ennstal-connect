/* Images only: never cache HTML, scripts, API responses, private or signed files. */
const CACHE = 'ec-public-images-v1';
const ORIGIN = 'https://eqfvhgiyrofjscvimvrc.supabase.co';
const TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 96 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const pending = new Map();
let writes = Promise.resolve();
function eligible(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && !request.headers.has('authorization') && !request.headers.has('range')
    && url.origin === ORIGIN && url.pathname.startsWith('/storage/v1/object/public/')
    && /\.(?:jpe?g|png|webp|avif|gif)$/i.test(url.pathname)
    && !url.searchParams.has('token');
}
async function cached(url) {
  try {
    const cache = await caches.open(CACHE), response = await cache.match(url);
    if (response && Date.now() - Number(response.headers.get('x-ec-saved-at') || 0) < TTL) return response;
    if (response) await cache.delete(url);
  } catch {}
  return null;
}
function store(url, response, event) {
  if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '') || /no-store/i.test(response.headers.get('cache-control') || '')) return;
  const task = response.blob().then(blob => {
    if (blob.size > MAX_FILE) return;
    writes = writes.catch(() => {}).then(async () => {
      const cache = await caches.open(CACHE), headers = new Headers(response.headers);
      headers.set('x-ec-saved-at', String(Date.now())); headers.set('x-ec-bytes', String(blob.size));
      await cache.delete(url); await cache.put(url, new Response(blob, { headers }));
      const keys = await cache.keys();
      const entries = await Promise.all(keys.map(async key => ({ key, bytes: Number((await cache.match(key))?.headers.get('x-ec-bytes') || MAX_FILE) })));
      let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0), count = entries.length;
      for (const entry of entries) {
        if (bytes <= MAX_BYTES && count <= 128) break;
        await cache.delete(entry.key); bytes -= entry.bytes; count--;
      }
    });
    return writes;
  }).catch(() => {});
  event.waitUntil(task);
}
async function original(url, event) {
  const hit = await cached(url); if (hit) return hit;
  if (pending.has(url)) return (await pending.get(url)).clone();
  const task = fetch(url, { mode: 'cors', credentials: 'omit' }).then(response => { store(url, response.clone(), event); return response; });
  pending.set(url, task);
  try { return (await task).clone(); } finally { pending.delete(url); }
}
async function deliver(event) {
  const requestUrl = new URL(event.request.url);
  const variantUrl = requestUrl.href;
  const width = Number(requestUrl.searchParams.get('ec_w'));
  requestUrl.searchParams.delete('ec_w');
  const hit = await cached(variantUrl); if (hit) return hit;
  const response = await original(requestUrl.href, event);
  if (/no-store/i.test(response.headers.get('cache-control') || '') || !response.ok || ![128, 256, 640, 1280, 1920].includes(width) || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function' || /image\/gif/i.test(response.headers.get('content-type') || '')) return response;
  let bitmap;
  try {
    bitmap = await createImageBitmap(await response.clone().blob());
    const scale = Math.min(1, width / bitmap.width);
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: width <= 256 ? 0.8 : 0.84 });
    const resized = new Response(blob, { headers: { 'content-type': blob.type } });
    store(variantUrl, resized.clone(), event); return resized;
  } catch { return response; } finally { bitmap?.close(); }
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => { if (eligible(event.request)) event.respondWith(deliver(event)); });
