// Keep profile modules compatible with the active member profile renderer.
// The renderer exposes data-ec-target-id; legacy scoped modules still read data-profile-id.
let observer = null;
let observedRoot = null;

function normalizePage(page) {
  if (!page?.matches?.('.member-profile-page')) return;
  const targetId = page.dataset.ecTargetId || page.dataset.profileId || '';
  if (targetId && page.dataset.profileId !== targetId) page.dataset.profileId = targetId;
}

function normalize(scope = document) {
  if (scope?.matches?.('.member-profile-page')) normalizePage(scope);
  scope?.querySelectorAll?.('.member-profile-page').forEach(normalizePage);
}

function attach() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main');
  normalize(root || document);
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node?.nodeType === Node.ELEMENT_NODE) normalize(node);
    }));
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

window.addEventListener('ec:navigate', attach);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
else attach();
