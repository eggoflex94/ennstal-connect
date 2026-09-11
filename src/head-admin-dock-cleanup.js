import { supabase } from './supabaseClient';

const OPERATOR_LABEL = 'Betreiber (Hauptadmin)';
let isHeadAdmin = false;
let scheduled = false;
let observer = null;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanupDock() {
  if (!isHeadAdmin) return;
  const dock = document.querySelector('.ec-right-dock');
  if (!dock) return;

  dock.querySelectorAll('strong,small,span,b,em').forEach((node) => {
    const text = normalizeText(node.textContent).toLowerCase();
    if (
      text === 'global admin - betreiber' ||
      text === 'global admin · betreiber' ||
      text === 'global admin – betreiber' ||
      text === 'global admin' ||
      text === 'hauptadmin · betreiber' ||
      text === 'betreiber - hauptadmin' ||
      text === 'betreiber – hauptadmin'
    ) {
      if (node.textContent !== OPERATOR_LABEL) node.textContent = OPERATOR_LABEL;
    }
  });

  // Primary admin shortcuts are intentionally owned by admin-access-placement-final.js.
  // Do not remove them here; only clear obsolete text-only section labels and empty legacy slot content.
  dock.querySelectorAll('.ec-dock-section-label').forEach((node) => {
    const text = normalizeText(node.textContent);
    if (/^(ADMIN TOOLS|ADMINISTRATION)$/i.test(text)) node.remove();
  });

  const slot = dock.querySelector('.ec-dock-admin-slot');
  if (slot) {
    slot.replaceChildren();
    slot.hidden = true;
  }
}

function scheduleCleanup() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    cleanupDock();
  });
}

async function boot() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    isHeadAdmin = String(profile?.role || '').toUpperCase() === 'HEAD_ADMIN';
    if (!isHeadAdmin) return;

    cleanupDock();
    observer = new MutationObserver(scheduleCleanup);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener('ec:navigate', scheduleCleanup);
    window.addEventListener('ec:region-change', scheduleCleanup);
  } catch (error) {
    console.warn('Head-Admin-Dock konnte nicht bereinigt werden:', error);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else void boot();
