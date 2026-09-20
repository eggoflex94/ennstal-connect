// Abort stalled requests quickly enough that the UI never looks frozen.
// Safe read requests get one bounded retry. Writes are never replayed because
// the server may already have committed them. Large resumable uploads retain a
// longer window, while ordinary image uploads fail fast with a useful error.
//
// Identical Supabase REST reads are also deduplicated while in flight and kept
// in a tiny short-lived cache. A small explicit whitelist extends this to RPCs
// that are guaranteed to be read-only. Mutating RPCs are never cached/retried.
// Any real write immediately clears the cache so read-after-write stays fresh.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTransientNetworkError = (error) => /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(String(error?.message || error || ''));

function emitNetworkError(url, method, detail = {}) {
  if (/\/rpc\/record_client_error(?:[/?#]|$)/i.test(String(url || ""))) return;
  try {
    const parsed = new URL(String(url || ""), globalThis.location?.href || "http://localhost");
    globalThis.window?.dispatchEvent?.(new CustomEvent("ec:network-error", {
      detail: {
        endpoint: `${parsed.host}${parsed.pathname}`.slice(0, 500),
        method,
        ...detail
      }
    }));
  } catch {}
}

const READ_ONLY_RPCS = new Set([
  'community_member_directory',
  'community_group_directory',
  'ec_region_group_directory',
  'weekly_poll_current',
  'ec_region_weekly_poll_current',
  'featured_community_group',
  'ec_region_featured_community_group',
  'my_welcome_badges',
  'admin_full_member_directory',
  'admin_member_directory',
  'get_admin_log',
  'admin_get_permissions',
  'admin_verification_review_queue',
  'community_group_owner_change_queue',
  'head_admin_error_summary',
  'head_admin_error_feed',
]);

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return String(input?.url || '');
}

function requestHeader(input, init, name) {
  const headers = new Headers(init?.headers || input?.headers || undefined);
  return headers.get(name) || '';
}

function rpcName(url) {
  const match = String(url).match(/\/rest\/v1\/rpc\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function requestBodyKey(init) {
  if (typeof init?.body === 'string') return init.body;
  if (init?.body == null) return '';
  return '[body]';
}

export function createNetworkFetch(fetchImpl, timeoutMs = 12_000, readCacheMs = 900) {
  const inFlightReads = new Map();
  const recentReads = new Map();

  return async (input, init = {}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const url = requestUrl(input);
    const rpc = rpcName(url);
    const safeRpcRead = method === 'POST' && READ_ONLY_RPCS.has(rpc);
    const safeRead = method === 'GET' || method === 'HEAD' || safeRpcRead;
    const attempts = safeRead ? 2 : 1;
    const isSupabaseRestRead = safeRead && /\/rest\/v1\//i.test(url);
    const isAuthUserRead = safeRead && /\/auth\/v1\/user(?:[/?#]|$)/i.test(url);
    const dedupeRead = isSupabaseRestRead || isAuthUserRead;
    const readKey = dedupeRead
      ? `${method}|${url}|${requestBodyKey(init)}|${requestHeader(input, init, 'authorization')}|${requestHeader(input, init, 'accept-profile')}`
      : '';

    if (!safeRead) recentReads.clear();

    if (readKey) {
      const cached = recentReads.get(readKey);
      if (cached && cached.expiresAt > Date.now()) return cached.response.clone();
      if (cached) recentReads.delete(readKey);
      const pending = inFlightReads.get(readKey);
      if (pending) return (await pending).clone();
    }

    const isStorageWrite = !safeRead && /\/storage\/v1\/(?:object|upload\/resumable)/i.test(url);
    const isResumableStorageWrite = !safeRead && /\/storage\/v1\/upload\/resumable/i.test(url);
    const effectiveTimeoutMs = isResumableStorageWrite
      ? Math.max(timeoutMs, 180_000)
      : isStorageWrite
        ? Math.max(timeoutMs, 30_000)
        : timeoutMs;

    const execute = async () => {
      let lastError = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const controller = new AbortController();
        const callerSignal = init.signal || input?.signal;
        const abort = () => controller.abort(callerSignal?.reason);
        if (callerSignal?.aborted) abort();
        else callerSignal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => controller.abort(new DOMException(
          'Die Verbindung antwortet nicht.',
          'TimeoutError'
        )), effectiveTimeoutMs);

        try {
          const response = await fetchImpl(input, { ...init, signal: controller.signal });
          if (!response.ok && response.status >= 500) {
            emitNetworkError(url, method, {
              kind: "server",
              status: response.status,
              message: `Serveranfrage fehlgeschlagen (HTTP ${response.status}).`
            });
          }
          return response;
        } catch (error) {
          lastError = error;
          const finalAttempt = !safeRead || callerSignal?.aborted || !isTransientNetworkError(error) || attempt === attempts - 1;
          if (finalAttempt) {
            emitNetworkError(url, method, {
              kind: error?.name === "TimeoutError" || /timeout|antwortet nicht/i.test(String(error?.message || error || "")) ? "timeout" : "network",
              message: String(error?.message || error || "Netzwerkanfrage fehlgeschlagen.").slice(0, 1000)
            });
            throw error;
          }
          await wait(300);
        } finally {
          clearTimeout(timer);
          callerSignal?.removeEventListener('abort', abort);
        }
      }
      throw lastError || new Error('Netzwerkanfrage fehlgeschlagen.');
    };

    if (!readKey) return execute();

    const pending = execute()
      .then((response) => {
        if (response.ok && readCacheMs > 0) {
          const ttl = isAuthUserRead ? Math.max(readCacheMs, 10_000) : readCacheMs;
          recentReads.set(readKey, { response: response.clone(), expiresAt: Date.now() + ttl });
        }
        return response;
      })
      .finally(() => inFlightReads.delete(readKey));
    inFlightReads.set(readKey, pending);
    return (await pending).clone();
  };
}
