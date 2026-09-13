// Publish each section as soon as it is ready. A failed section keeps its last
// successful data, and stale sessions stop consuming queue slots.
export async function loadSections(tasks, { isCurrent, onError, onSettled }, concurrency = 4) {
  let next = 0;
  async function worker() {
    while (isCurrent() && next < tasks.length) {
      const task = tasks[next++];
      try {
        const data = await task.load();
        if (isCurrent()) task.commit(data);
      } catch (error) {
        if (isCurrent()) onError(task.name, error);
      } finally {
        if (isCurrent()) onSettled(task.name);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}
