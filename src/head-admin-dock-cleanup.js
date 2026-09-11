import { supabase } from './supabaseClient';

const OPERATOR_LABEL = 'Betreiber (Hauptadmin)';
let isHeadAdmin = false;
let scheduled = false;
let observer = null;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function keepFirstAndRemoveDuplicates(dock, pattern) {
  const matches = [...dock.querySelectorAll('button,a,[role="button"]')]
    .filter((node) => pattern.test(normalizeText(node.textContent)));
  matches.slice(1).forEach((node) => node.remove());
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

  keepFirstAndRemoveDuplicates(dock, /^Admin-Zentrale$/i);
  keepFirstAndRemoveDuplicates(dock, /^Admin Tools$/i);
  keepFirstAndRemoveDuplicates(dock, /^Beweissicherung$/i);

  const headings = [...dock.querySelectorAll('.ec-dock-section-label')]
    .filter((node) => /^(admin tools|administration)$/i.test(normalizeText(node.textContent)));
  headings.slice(1).forEach((node) => node.remove());
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
