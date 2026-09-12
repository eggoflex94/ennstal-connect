// Keep profile modules compatible with the active member profile renderer.
// The renderer exposes data-ec-target-id; legacy scoped modules still read data-profile-id.
let observer = null;
let observedRoot = null;
let refreshQueued = false;

function notifyProfileModules() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { source: 'profile-target-compat' } }));
  });
}

function normalizePage(page) {
  if (!page?.matches?.('.member-profile-page')) return false;
  const targetId = page.dataset.ecTargetId || page.dataset.profileId || '';
  if (!targetId || page.dataset.profileId === targetId) return false;
  page.dataset.profileId = targetId;
  return true;
}

function normalize(scope = document) {
  let changed = false;
  if (scope?.matches?.('.member-profile-page')) changed = normalizePage(scope) || changed;
  scope?.querySelectorAll?.('.member-profile-page').forEach((page) => { changed = normalizePage(page) || changed; });
  return changed;
}

function attach() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main');
  if (normalize(root || document)) notifyProfileModules();
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    let changed = false;
    records.forEach((record) => {
      const page = record.target?.nodeType === Node.ELEMENT_NODE ? record.target.closest?.('.member-profile-page') : null;
      if (page) changed = normalizePage(page) || changed;
      record.addedNodes.forEach((node) => {
        if (node?.nodeType === Node.ELEMENT_NODE) changed = normalize(node) || changed;
      });
    });
    if (changed) notifyProfileModules();
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-ec-target-id']
  });
  observedRoot = root;
}

window.addEventListener('ec:navigate', attach);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
else attach();
