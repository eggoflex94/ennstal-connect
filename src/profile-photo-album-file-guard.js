let pending = null;
let observer = null;
let observedRoot = null;

function capture(input) {
  const file = input?.files?.[0];
  const form = input?.closest?.('.ec-photo-upload-form');
  if (!file || !form) return;
  pending = {
    file,
    caption: String(form.elements?.caption?.value || ''),
    visibility: String(form.elements?.visibility?.value || 'PUBLIC'),
    capturedAt: Date.now()
  };
  form.dataset.ecPendingPhoto = 'true';
}

function restore(scope = document) {
  if (!pending || Date.now() - pending.capturedAt > 5 * 60 * 1000) {
    pending = null;
    return;
  }
  const form = scope?.matches?.('.ec-photo-upload-form') ? scope : scope?.querySelector?.('.ec-photo-upload-form');
  if (!form || form.dataset.ecPendingPhoto === 'true') return;
  const input = form.elements?.photo;
  if (!input) return;
  try {
    const transfer = new DataTransfer();
    transfer.items.add(pending.file);
    input.files = transfer.files;
    if (form.elements?.caption) form.elements.caption.value = pending.caption;
    if (form.elements?.visibility) form.elements.visibility.value = pending.visibility;
    form.hidden = false;
    form.dataset.ecPendingPhoto = 'true';
    const open = form.closest('.ec-profile-photo-album')?.querySelector('.ec-photo-upload-open');
    if (open) open.hidden = true;
  } catch (error) {
    console.warn('Fotoauswahl konnte nach Profilaktualisierung nicht wiederhergestellt werden:', error);
  }
}

function clearIfSubmitted(event) {
  const form = event.target?.closest?.('.ec-photo-upload-form');
  if (!form) return;
  window.setTimeout(() => {
    if (!form.isConnected || !form.elements?.photo?.files?.length) pending = null;
  }, 250);
}

function attach() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main');
  restore(root || document);
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node?.nodeType === Node.ELEMENT_NODE) restore(node);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

document.addEventListener('change', (event) => {
  if (event.target?.matches?.('.ec-photo-upload-form input[type="file"][name="photo"]')) capture(event.target);
}, true);
document.addEventListener('submit', clearIfSubmitted, true);
window.addEventListener('ec:navigate', attach);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
else attach();
