// Schedule layout writes outside ResizeObserver delivery and coalesce notifications.
export function createAnimationFrameTask(callback, runtime = globalThis) {
  let frame = null;
  let disposed = false;
  return {
    schedule() {
      if (disposed || frame !== null) return;
      frame = runtime.requestAnimationFrame(() => {
        frame = null;
        if (!disposed) callback();
      });
    },
    dispose() {
      disposed = true;
      if (frame !== null) runtime.cancelAnimationFrame(frame);
      frame = null;
    }
  };
}
