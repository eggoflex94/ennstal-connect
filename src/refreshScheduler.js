// Event bursts share one refresh; an event received during a request gets one
// trailing refresh. Supabase calls always start outside the auth callback.
export function createRefreshScheduler(refresh, onError = console.error, delay = 150) {
  let timer = null;
  let running = false;
  let pending = false;
  let disposed = false;
  const schedule = () => {
    if (disposed) return;
    pending = true;
    if (running || timer !== null) return;
    timer = setTimeout(async () => {
      timer = null;
      if (disposed) return;
      pending = false;
      running = true;
      try { await refresh(); } catch (error) { onError(error); }
      finally {
        running = false;
        if (pending && !disposed) schedule();
      }
    }, delay);
  };
  schedule.dispose = () => {
    disposed = true;
    pending = false;
    clearTimeout(timer);
    timer = null;
  };
  return schedule;
}
