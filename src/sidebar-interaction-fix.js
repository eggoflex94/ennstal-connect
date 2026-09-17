// The regional shell owns normal dock interactions. The personal dashboard
// deliberately moves the rendered dock into the main page flow, though. Once
// moved, the legacy regional-shell selector can no longer find the visits
// trigger, so its existing click handler returns before toggling the panel.
//
// Keep this compatibility bridge deliberately narrow: profile visits already
// have their own realtime loader, so we only restore the missing expand/collapse
// behaviour for that one moved control and leave every other dock action alone.

function toggleMovedProfileVisits(button) {
  const panel = document.querySelector('.ec-dock-detail[data-panel="visits"]');
  if (!panel) return;

  const opening = panel.hidden;
  document.querySelectorAll('.ec-dock-detail').forEach((item) => {
    item.hidden = true;
  });
  document.querySelectorAll('[data-ec-detail]').forEach((item) => {
    item.setAttribute('aria-expanded', 'false');
  });

  panel.hidden = !opening;
  button.setAttribute('aria-expanded', opening ? 'true' : 'false');
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-ec-detail="visits"]');
  if (!button) return;

  // While the dock is still inside the regional shell, its native handler is
  // authoritative. Only bridge the layout where the dashboard moved the dock.
  if (button.closest('.ec-regional-shell')) return;

  toggleMovedProfileVisits(button);
});
