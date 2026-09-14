// Final dashboard flow guard.
// CSS owns the steady-state geometry. JavaScript only repairs legacy inline
// styles when they are actually present instead of rewriting layout on every
// resize/focus/navigation event.

function needsDashboardRepair(dock) {
  if (!dock) return false;
  const position = dock.style.getPropertyValue('position');
  const overflowY = dock.style.getPropertyValue('overflow-y');
  const transform = dock.style.getPropertyValue('transform');
  return position === 'fixed' || position === 'sticky' ||
    (overflowY && overflowY !== 'visible') ||
    (transform && transform !== 'none');
}

function normalizeDashboardFlow(force = false) {
  const docks = document.querySelectorAll('.ec-right-dock');
  docks.forEach((dock) => {
    if (!force && !needsDashboardRepair(dock)) return;
    dock.style.setProperty('position', 'static', 'important');
    dock.style.setProperty('inset', 'auto', 'important');
    dock.style.setProperty('top', 'auto', 'important');
    dock.style.setProperty('right', 'auto', 'important');
    dock.style.setProperty('bottom', 'auto', 'important');
    dock.style.setProperty('left', 'auto', 'important');
    dock.style.setProperty('height', 'auto', 'important');
    dock.style.setProperty('min-height', '0', 'important');
    dock.style.setProperty('max-height', 'none', 'important');
    dock.style.setProperty('overflow', 'visible', 'important');
    dock.style.setProperty('overflow-y', 'visible', 'important');
    dock.style.setProperty('transform', 'none', 'important');

    dock.querySelectorAll('.ec-dock-detail,.ec-dashboard-content,.ec-dashboard-sections,.ec-dashboard-body').forEach((node) => {
      node.style.setProperty('height', 'auto', 'important');
      node.style.setProperty('min-height', '0', 'important');
      node.style.setProperty('max-height', 'none', 'important');
      node.style.setProperty('overflow', 'visible', 'important');
      node.style.setProperty('overflow-y', 'visible', 'important');
    });
  });
}

let timer = 0;
function scheduleRepair(delay = 80, force = false) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => normalizeDashboardFlow(force), delay);
}

// One normalisation after the shell appears is enough for the usual case.
function boot() {
  scheduleRepair(120, true);
  scheduleRepair(700, false);
}

window.addEventListener('ec:navigate', () => scheduleRepair(80, false));
window.addEventListener('pageshow', () => scheduleRepair(80, false));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
