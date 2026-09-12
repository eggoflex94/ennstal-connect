import { supabase } from './supabaseClient';
import './profile-legacy-cleanup.css';

let regions = [];
let activeRegionId = '';
let viewerHomeRegionId = '';
let regionLoad = null;
let refreshTimer = null;
let observer = null;
let observedRoot = null;

const norm = (value) => String(value || '').trim().toUpperCase();

async function ensureContext() {
  if (!regionLoad) {
    regionLoad = (async () => {
      const [{ data: regionRows }, { data: auth }] = await Promise.all([
        supabase.from('regions').select('id,slug,name,short_name').eq('is_active', true),
        supabase.auth.getUser()
      ]);
      regions = regionRows || [];
      if (auth?.user?.id) {
        const { data: viewer } = await supabase.from('profiles').select('home_region_id').eq('id', auth.user.id).maybeSingle();
        viewerHomeRegionId = viewer?.home_region_id || '';
      }
      const savedSlug = window.localStorage.getItem('ec-active-region');
      const saved = savedSlug ? regions.find((region) => region.slug === savedSlug) : null;
      activeRegionId = activeRegionId || saved?.id || viewerHomeRegionId || regions[0]?.id || '';
    })();
  }
  await regionLoad;
}

function setFunctionPresentation(box, label, star) {
  const role = box.querySelector('.ec-mp-function-role');
  if (!role) return;
  role.replaceChildren();
  if (star) {
    const img = document.createElement('img');
    img.className = 'ec-mp-role-star';
    img.src = star;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    role.appendChild(img);
  }
  const strong = document.createElement('strong');
  strong.textContent = label;
  role.appendChild(strong);
}

async function applyProfileRoleContext() {
  const page = document.querySelector('.member-profile-page[data-profile-id]:not(.public-profile-preview)');
  if (!page) return;
  page.querySelectorAll('.admin-responsibilities').forEach((node) => node.remove());
  const box = page.querySelector('.ec-mp-function');
  if (!box) return;
  const profileId = page.dataset.profileId;
  if (!profileId) return;

  await ensureContext();
  const [{ data: profile }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('id,role,account_badge').eq('id', profileId).maybeSingle(),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', profileId).eq('active', true)
  ]);
  if (!page.isConnected || page.dataset.profileId !== profileId || !profile) return;

  const role = norm(profile.role);
  if (role === 'HEAD_ADMIN') return setFunctionPresentation(box, 'Hauptadmin', '/role-star-red.svg');
  if (role === 'ADMIN' || role === 'GLOBAL_ADMIN') return setFunctionPresentation(box, 'Global Admin', '/role-star-red.svg');

  const assignedIds = (assignments || []).map((assignment) => assignment.region_id).filter(Boolean);
  if (activeRegionId && assignedIds.includes(activeRegionId)) {
    const region = regions.find((item) => item.id === activeRegionId);
    const suffix = region?.short_name || region?.name || '';
    return setFunctionPresentation(box, `Regional Admin${suffix ? ` · ${suffix}` : ''}`, '/role-star-red.svg');
  }
  if (assignedIds.length || role === 'SUPPORTER') return setFunctionPresentation(box, 'Supporter', '/supporter-star.svg');
  if (profile.account_badge === 'BUSINESS') return setFunctionPresentation(box, 'Unternehmenskonto', '/role-star-blue.svg');
  setFunctionPresentation(box, 'Mitglied', null);
}

function schedule(delay = 40) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void applyProfileRoleContext(), delay);
}

function attachObserver() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main');
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
      node?.nodeType === Node.ELEMENT_NODE && (node.matches?.('.member-profile-page,.ec-mp-card,.admin-responsibilities') || node.querySelector?.('.member-profile-page,.ec-mp-card,.admin-responsibilities'))
    ));
    if (relevant) schedule(60);
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

window.addEventListener('ec:region-change', (event) => {
  if (event.detail?.id) activeRegionId = event.detail.id;
  schedule(0);
});
window.addEventListener('ec:navigate', () => { attachObserver(); schedule(20); });
window.addEventListener('focus', () => schedule(20));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { attachObserver(); schedule(0); }, { once: true });
else { attachObserver(); schedule(0); }

export {};
