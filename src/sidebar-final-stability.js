function closeAllDockPanels(dock, except = null) {
  dock.querySelectorAll('.ec-dock-detail[data-panel]').forEach((panel) => {
    const key = panel.dataset.panel;
    const button = dock.querySelector(`[data-ec-detail="${key}"]`);
    const open = key === except;
    panel.hidden = !open;
    panel.classList.toggle('is-open', open);
    if (button) {
      button.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });
}

function bindDock(dock) {
  if (!dock || dock.dataset.ecFinalStability === '1') return;
  dock.dataset.ecFinalStability = '1';
  closeAllDockPanels(dock);

  dock.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ec-detail]');
    if (!button || !dock.contains(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const key = button.dataset.ecDetail;
    const panel = dock.querySelector(`.ec-dock-detail[data-panel="${key}"]`);
    const willOpen = panel?.hidden !== false;
    closeAllDockPanels(dock, willOpen ? key : null);
  }, true);
}

function stabilize() {
  const dock = document.querySelector('.ec-right-dock');
  if (!dock) return false;
  dock.classList.add('ec-final-stable-dock');
  bindDock(dock);
  dock.querySelectorAll('.ec-dock-detail[data-panel]').forEach((panel) => {
    if (!panel.classList.contains('is-open')) panel.hidden = true;
  });
  return true;
}

let retryTimer = null;
function schedule(retries = 8) {
  clearTimeout(retryTimer);
  const run = (left) => {
    if (stabilize() || left <= 0) return;
    retryTimer = setTimeout(() => run(left - 1), 170);
  };
  requestAnimationFrame(() => run(retries));
}

function boot() {
  schedule(14);
  window.addEventListener('ec:navigate', () => schedule(6));
  window.addEventListener('ec:region-change', () => schedule(5));
  window.addEventListener('focus', () => schedule(2));
  window.addEventListener('resize', () => schedule(2), { passive: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
