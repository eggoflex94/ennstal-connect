import { supabase } from './supabaseClient';

let userId = null;
let channel = null;
let timer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (value) => value ? new Date(value).toLocaleString('de-AT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

function setCount(selector, value) {
  const node = document.querySelector(selector);
  if (!node) return;
  node.textContent = String(value ?? 0);
  node.hidden = false;
}

function bindProfileRows(panel) {
  panel?.querySelectorAll('[data-profile-id]').forEach((button) => {
    button.onclick = () => {
      const profileId = button.dataset.profileId;
      if (profileId && profileId !== userId) window.dispatchEvent(new CustomEvent('ec:open-profile', { detail:{ profileId } }));
    };
  });
}

async function refresh() {
  if (!userId || !document.querySelector('.ec-right-dock')) return;
  const picker = document.querySelector('.ec-region-picker select');
  const slug = picker?.value || localStorage.getItem('ec-active-region');
  const { data: regions } = await supabase.from('regions').select('id,slug').eq('is_active',true);
  const regionId = (regions || []).find((region) => region.slug === slug)?.id || null;

  const [visitsResult, updatesResult, actionsResult, newsResult] = await Promise.all([
    supabase.from('profile_visits').select('visitor_id,visited_at', { count:'exact' }).eq('profile_id',userId).order('visited_at',{ascending:false}).limit(10),
    supabase.from('public_profile_updates').select('profile_id,nickname,activity_type,created_at',{count:'exact'}).order('created_at',{ascending:false}).limit(10),
    supabase.from('profile_activity').select('actor_id,profile_id,target_user_id,activity_type,text,created_at',{count:'exact'}).order('created_at',{ascending:false}).limit(10),
    regionId ? supabase.from('news').select('id,title,created_at',{count:'exact'}).eq('region_id',regionId).order('created_at',{ascending:false}).limit(8) : Promise.resolve({data:[],count:0,error:null})
  ]);

  if (!visitsResult.error) setCount('.ec-dock-visits-count', visitsResult.count ?? visitsResult.data?.length ?? 0);
  if (!updatesResult.error) setCount('.ec-dock-updates-count', updatesResult.count ?? updatesResult.data?.length ?? 0);
  if (!actionsResult.error) setCount('.ec-dock-actions-count', actionsResult.count ?? actionsResult.data?.length ?? 0);

  const updatesPanel = document.querySelector('.ec-dock-detail[data-panel="updates"]');
  if (updatesPanel && !updatesResult.error) {
    const rows = updatesResult.data || [];
    updatesPanel.innerHTML = rows.length ? rows.map((row) => `<button type="button" class="ec-dock-detail-row" data-profile-id="${esc(row.profile_id)}"><span><strong>${esc(row.nickname || 'Mitglied')}</strong><small>${esc(row.activity_type || 'Profil aktualisiert')}</small></span><time>${esc(fmt(row.created_at))}</time></button>`).join('') : '<div class="ec-dock-empty">Noch keine Einträge.</div>';
    bindProfileRows(updatesPanel);
  }

  const actionsPanel = document.querySelector('.ec-dock-detail[data-panel="actions"]');
  if (actionsPanel && !actionsResult.error) {
    const rows = actionsResult.data || [];
    actionsPanel.innerHTML = rows.length ? rows.map((row) => {
      const profileId = row.actor_id || row.profile_id || row.target_user_id || '';
      return `<button type="button" class="ec-dock-detail-row" data-profile-id="${esc(profileId)}"><span><strong>${esc(row.activity_type || 'Community-Aktion')}</strong><small>${esc(row.text || 'Neue Aktivität')}</small></span><time>${esc(fmt(row.created_at))}</time></button>`;
    }).join('') : '<div class="ec-dock-empty">Noch keine Einträge.</div>';
    bindProfileRows(actionsPanel);
  }

  const newsPanel = document.querySelector('.ec-dock-detail[data-panel="news"]');
  if (newsPanel && !newsResult.error) {
    const rows = newsResult.data || [];
    newsPanel.innerHTML = rows.length ? rows.map((row) => `<button type="button" class="ec-dock-detail-row"><span><strong>${esc(row.title || 'Neuigkeit')}</strong><small>Community Neuigkeit</small></span><time>${esc(fmt(row.created_at))}</time></button>`).join('') : '<div class="ec-dock-empty">Noch keine Einträge.</div>';
    newsPanel.querySelectorAll('.ec-dock-detail-row').forEach((button) => {
      button.onclick = () => window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'news'}}));
    });
  }
}

function queue(delay = 80) {
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), delay);
}

async function start() {
  const { data:{ user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  userId = user.id;
  await refresh();
  if (channel) await supabase.removeChannel(channel);
  channel = supabase.channel(`dashboard-community-${user.id}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'profile_visits',filter:`profile_id=eq.${user.id}`},() => queue())
    .on('postgres_changes',{event:'*',schema:'public',table:'public_profile_updates'},() => queue())
    .on('postgres_changes',{event:'*',schema:'public',table:'profile_activity'},() => queue())
    .on('postgres_changes',{event:'*',schema:'public',table:'news'},() => queue())
    .subscribe();
}

window.addEventListener('ec:region-change',() => queue());
window.addEventListener('focus',() => queue(),{passive:true});
document.addEventListener('visibilitychange',() => { if (!document.hidden) queue(); });
new MutationObserver(() => {
  if (document.querySelector('.ec-right-dock')) queue(120);
}).observe(document.documentElement,{childList:true,subtree:true});

void start();
