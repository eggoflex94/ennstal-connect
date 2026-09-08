// Abort stalled requests, including writes. Never replay a write after a timeout:
// the server may already have committed it even if its response was lost.
export function createNetworkFetch(fetchImpl, timeoutMs = 20_000) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const callerSignal = init.signal || input?.signal;
    const abort = () => controller.abort(callerSignal.reason);
    if (callerSignal?.aborted) abort();
    else callerSignal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException(
      "Die Verbindung antwortet nicht. Bitte prüfe vor einem erneuten Speichern, ob die Änderung bereits übernommen wurde.",
      "TimeoutError"
    )), timeoutMs);
    try { return await fetchImpl(input, { ...init, signal: controller.signal }); }
    finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abort);
    }
  };
}
