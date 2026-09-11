import { supabase } from './supabaseClient';

const OPERATOR_LABEL = 'Betreiber (Hauptadmin)';
let isHeadAdmin = false;
let scheduled = false;
let observer = null;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function removeMatchingControls(dock, pattern) {
  [...dock.querySelectorAll('button,a,[role="button"]')]
    .filter((node) => pattern.test(normalizeText(node.textContent)))
    .forEach((node) => node.remove());
}

function removeAdminToolsArea(dock) {
  removeMatchingControls(dock, /^Admin-Zentrale$/i);
  removeMatchingControls(dock, /^Admin Tools$/i);
  removeMatchingControls(dock, /^Beweissicherung$/i);

  [...dock.querySelectorAll('*')].forEach((node) => {
    const text = normalizeText(node.textContent);
    if (/^(ADMIN TOOLS|ADMINISTRATION)$/i.test(text)) node.remove();
  });

  // Remove now-empty wrappers left behind by the admin shortcut grid,
  // but never remove the logout control or containers that still hold content.
  [...dock.querySelectorAll('section,div')].reverse().forEach((node) => {
    if (node === dock) return;
    if (node.querySelector('button,a,[role="button"]')) return;
    if (normalizeText(node.textContent)) return;
    if (node.children.length === 0) node.remove();
  });
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

  removeAdminToolsArea(dock);
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
