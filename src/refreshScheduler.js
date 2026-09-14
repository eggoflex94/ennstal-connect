// Keep ownership until the actual refresh settles. HTTP requests have their own
// cancellation; a timeout race here would start overlapping refreshes.
// A short cooldown after a completed refresh keeps realtime bursts (for example
// several message/friendship changes) from repeatedly starting a full app load.
export function createRefreshScheduler(refresh, onError = console.error, delay = 150, cooldown = 400) {
  let timer = null;
  let running = false;
  let pending = false;
  let disposed = false;
  let lastFinishedAt = 0;

  const schedule = () => {
    if (disposed) return;
    pending = true;
    if (running || timer !== null) return;

    const sinceLast = lastFinishedAt ? Date.now() - lastFinishedAt : Number.POSITIVE_INFINITY;
    const waitFor = Math.max(delay, Math.max(0, cooldown - sinceLast));
    timer = setTimeout(async () => {
      timer = null;
      if (disposed) return;
      pending = false;
      running = true;
      try {
        await refresh();
      } catch (error) {
        if (!disposed) onError(error);
      } finally {
        running = false;
        lastFinishedAt = Date.now();
        if (pending && !disposed) schedule();
      }
    }, waitFor);
  };

  schedule.dispose = () => {
    disposed = true;
    pending = false;
    clearTimeout(timer);
    timer = null;
  };
  return schedule;
}
