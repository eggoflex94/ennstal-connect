// Abort stalled requests quickly enough that the UI never looks frozen.
// Safe read requests get one bounded retry. Writes are never replayed because
// the server may already have committed them. Large resumable uploads retain a
// longer window, while ordinary image uploads fail fast with a useful error.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTransientNetworkError = (error) => /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(String(error?.message || error || ''));

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return String(input?.url || '');
}

export function createNetworkFetch(fetchImpl, timeoutMs = 6_000) {
  return async (input, init = {}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const canRetry = method === 'GET' || method === 'HEAD';
    const attempts = canRetry ? 2 : 1;
    const url = requestUrl(input);
    const isStorageWrite = !canRetry && /\/storage\/v1\/(?:object|upload\/resumable)/i.test(url);
    const isResumableStorageWrite = !canRetry && /\/storage\/v1\/upload\/resumable/i.test(url);
    const effectiveTimeoutMs = isResumableStorageWrite
      ? Math.max(timeoutMs, 180_000)
      : isStorageWrite
        ? Math.max(timeoutMs, 30_000)
        : timeoutMs;
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
        return await fetchImpl(input, { ...init, signal: controller.signal });
      } catch (error) {
        lastError = error;
        if (!canRetry || callerSignal?.aborted || !isTransientNetworkError(error) || attempt === attempts - 1) throw error;
        await wait(300);
      } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', abort);
      }
    }

    throw lastError || new Error('Netzwerkanfrage fehlgeschlagen.');
  };
}
