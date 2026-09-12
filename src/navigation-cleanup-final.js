// Final dashboard flow guard.
// Some legacy dashboard modules still assign sticky positioning after mount.
// Re-apply normal document-flow geometry only on relevant lifecycle events;
// no MutationObserver is used, so this does not fight React continuously.

function normalizeDashboardFlow() {
  const docks = document.querySelectorAll('.ec-right-dock');
  docks.forEach((dock) => {
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

  document.querySelectorAll('.modern-main,.content-root').forEach((node) => {
    node.style.setProperty('height', 'auto', 'important');
    node.style.setProperty('max-height', 'none', 'important');
    node.style.setProperty('overflow-y', 'visible', 'important');
  });
}

let timer = 0;
function scheduleDashboardFlow(delay = 60) {
  window.clearTimeout(timer);
  timer = window.setTimeout(normalizeDashboardFlow, delay);
}

window.addEventListener('ec:navigate', () => scheduleDashboardFlow(80));
window.addEventListener('ec:region-change', () => scheduleDashboardFlow(100));
window.addEventListener('pageshow', () => scheduleDashboardFlow(80));
window.addEventListener('resize', () => scheduleDashboardFlow(80));
window.addEventListener('focus', () => scheduleDashboardFlow(80));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scheduleDashboardFlow(120), { once: true });
} else {
  scheduleDashboardFlow(120);
}
