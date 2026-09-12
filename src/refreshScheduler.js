// Event bursts share one refresh; an event received during a request gets one
// trailing refresh. Supabase calls always start outside the auth callback.
// A stalled network/database request must never freeze the application forever.
// Full community reloads are deliberately rate-limited because Realtime can emit
// several related events for one user action.
export function createRefreshScheduler(refresh, onError = console.error, delay = 150) {
  let timer = null;
  let running = false;
  let pending = false;
  let disposed = false;
  let timeoutRetries = 0;
  let lastStartedAt = 0;
  const MAX_TIMEOUT_RETRIES = 1;
  const REFRESH_TIMEOUT_MS = 8000;
  const MIN_FULL_REFRESH_GAP_MS = 1200;

  const runWithTimeout = () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('REFRESH_TIMEOUT')), REFRESH_TIMEOUT_MS);
    Promise.resolve()
      .then(() => refresh())
      .then(
        (value) => { clearTimeout(timeout); resolve(value); },
        (error) => { clearTimeout(timeout); reject(error); }
      );
  });

  const schedule = () => {
    if (disposed) return;
    pending = true;
    if (running || timer !== null) return;

    const sinceLastStart = Date.now() - lastStartedAt;
    const gapWait = lastStartedAt ? Math.max(0, MIN_FULL_REFRESH_GAP_MS - sinceLastStart) : 0;
    const waitMs = Math.max(delay, gapWait);

    timer = setTimeout(async () => {
      timer = null;
      if (disposed) return;
      pending = false;
      running = true;
      lastStartedAt = Date.now();
      try {
        await runWithTimeout();
        timeoutRetries = 0;
      } catch (error) {
        if (error?.message === 'REFRESH_TIMEOUT') {
          onError(new Error('Ennstal Connect: Laden dauerte zu lange; erneuter Versuch wird gestartet.'));
          if (timeoutRetries < MAX_TIMEOUT_RETRIES && !disposed) {
            timeoutRetries += 1;
            pending = true;
          }
        } else {
          timeoutRetries = 0;
          onError(error);
        }
      } finally {
        running = false;
        if (pending && !disposed) schedule();
      }
    }, waitMs);
  };

  schedule.dispose = () => {
    disposed = true;
    pending = false;
    clearTimeout(timer);
    timer = null;
  };
  return schedule;
}
