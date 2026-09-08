import { supabase } from './supabaseClient';

let timer = null;
const activeSlug = () => document.documentElement.dataset.ecRegion || localStorage.getItem('ec-active-region') || '';

async function ensureMount() {
  clearTimeout(timer);
  if (!supabase || !document.querySelector('.home-page')) return;
  if (document.querySelector('.homepage-editor-toggle')) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: profile }, { data: region }, { data: assignment }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('regions').select('id,slug,name').eq('slug', activeSlug()).maybeSingle(),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('user_id', user.id).eq('active', true)
    ]);
    const role = String(profile?.role || '').toUpperCase();
    const allowed = role === 'HEAD_ADMIN' || (region?.id && (assignment || []).some(a => a.region_id === region.id));
    if (!allowed) return;
    const home = document.querySelector('.home-page');
    if (!home || document.querySelector('.homepage-editor-toggle')) return;
    const placeholder = document.createElement('details');
    placeholder.className = 'homepage-editor-toggle ec-homepage-editor-mount';
    placeholder.hidden = true;
    placeholder.innerHTML = '<summary>Startseite gestalten</summary>';
    const heading = home.querySelector('.page-heading');
    if (heading) heading.insertAdjacentElement('afterend', placeholder);
    else home.prepend(placeholder);
  } catch (error) {
    console.warn('Startseiten-Editor konnte nicht bereitgestellt werden:', error);
  }
}

function schedule() { clearTimeout(timer); timer = setTimeout(() => void ensureMount(), 80); }
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change', schedule);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once:true }); else schedule();
