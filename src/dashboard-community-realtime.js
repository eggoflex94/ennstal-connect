import { isOperatorProfile, operatorStarSrc } from './operator-identity.js';
import { supabase } from './supabaseClient';
import { loadMemberScores } from './member-score.js';

let userId = null;
let channel = null;
let timer = null;
let refreshInFlight = null, refreshAgain = false;
const visitProfiles = new Map();

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (value) => value ? new Date(value).toLocaleString('de-AT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

function setCount(selector, value) {
  const node = document.querySelector(selector);
  if (!node) return;
  const text = String(value ?? 0);
  if (node.textContent !== text) node.textContent = text;
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

function profileStar(profile) {
  if (isOperatorProfile(profile)) return operatorStarSrc;
  const role = String(profile?.role || '').toUpperCase();
  if (role === 'HEAD_ADMIN' || role === 'ADMIN') return '/role-star-red.svg';
  if (role === 'MUNICIPALITY') return profile?.role_star_url || '/role-star-green.svg';
  if (role === 'SUPPORTER') return '/supporter-star.svg';
  if (profile?.account_badge === 'BUSINESS') return '/role-star-blue.svg';
  return '';
}

async function loadVisitProfiles(visits) {
  const ids = [...new Set((visits || []).map((row) => row.visitor_id).filter((id) => id && id !== userId))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('id,nickname,avatar_url,role,account_badge,role_star_url,points')
    .in('id', ids);
  if (error) return visitProfiles;
  const scores = await loadMemberScores(ids);
  (data || []).forEach(profile => visitProfiles.set(profile.id, { ...profile, total_score: scores.get(String(profile.id)) ?? Number(profile.points || 0) }));
  return visitProfiles;
}

function uniqueRecentVisits(visits, limit = 10) {
  const seen = new Set();
  const rows = [];
  for (const visit of visits || []) {
    const id = visit.visitor_id;
    if (!id || id === userId || seen.has(id)) continue;
    seen.add(id);
    rows.push(visit);
    if (rows.length >= limit) break;
  }
  return rows;
}

async function refreshData() {
  if (!userId || !document.querySelector('.ec-right-dock')) return;
  const picker = document.querySelector('.ec-region-picker select');
  const slug = picker?.value || localStorage.getItem('ec-active-region');
  const { data: regions } = await supabase.from('regions').select('id,slug').eq('is_active',true);
  const regionId = (regions || []).find((region) => region.slug === slug)?.id || null;

  const [visitsResult, newsResult] = await Promise.all([
    supabase.from('profile_visits').select('visitor_id,visited_at').eq('profile_id',userId).order('visited_at',{ascending:false}).limit(40),
    regionId ? supabase.from('news').select('id,title,created_at',{count:'exact'}).eq('region_id',regionId).order('created_at',{ascending:false}).limit(8) : Promise.resolve({data:[],count:0,error:null})
  ]);

  if (!visitsResult.error) {
    const visits = uniqueRecentVisits(visitsResult.data || []);
    const profiles = await loadVisitProfiles(visits);
    const visitsPanel = document.querySelector('.ec-dock-detail[data-panel="visits"]');
    setCount('.ec-dock-visits-count', visits.length);
    if (visitsPanel) {
      visitsPanel.dataset.visitsOwner = 'dashboard';
      const remaining = new Set(visits.map(row=>row.visitor_id));
      visitsPanel.querySelectorAll('[data-profile-id]').forEach(row=>{if(!remaining.has(row.dataset.profileId))row.remove();});
      if(visits.length)visitsPanel.querySelectorAll('.ec-dock-empty').forEach(node=>node.remove());
      visits.forEach((row,index)=>{
        const person=profiles.get(row.visitor_id);
        let node=[...visitsPanel.children].find(node=>node.dataset.profileId===row.visitor_id);
        // Preserve the last resolved identity during temporary lookup failures.
        if(!person && node)return;
        const nickname=person?.nickname || 'Mitglied';
        const star=profileStar(person || {id:row.visitor_id});
        const markup=`<span class="ec-profile-visitor-copy"><strong>${star?`<img class="ec-inline-role-star" src="${esc(star)}" alt="" aria-hidden="true">`:''}<span class="ec-profile-visitor-name" data-member-preview-id="${esc(row.visitor_id)}">${esc(nickname)} <span class="ec-inline-points">[${esc(Number(person?.total_score??person?.points??0).toLocaleString('de-AT'))}]</span></span></strong><small>hat dein Profil besucht</small><time datetime="${esc(row.visited_at)}">${esc(fmt(row.visited_at))}</time></span>`;
        if(!node){node=document.createElement('button');node.type='button';node.className='ec-dock-detail-row ec-profile-visitor-link';node.dataset.profileId=row.visitor_id;}
        if(node.dataset.visitMarkup!==markup){node.dataset.visitMarkup=markup;node.innerHTML=markup;node.setAttribute('aria-label',`Profil von ${nickname} öffnen`);}
        const reference=visitsPanel.children[index];
        if(reference!==node)visitsPanel.insertBefore(node,reference||null);
      });
      if(!visits.length && !visitsPanel.querySelector('.ec-dock-empty'))visitsPanel.innerHTML='<div class="ec-dock-empty">Noch keine Profilbesuche.</div>';
      bindProfileRows(visitsPanel);
    }
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

function refresh(){
  if(refreshInFlight){refreshAgain=true;return refreshInFlight;}
  refreshInFlight=refreshData().catch(error=>console.warn('Dashboard konnte nicht aktualisiert werden:',error)).finally(()=>{refreshInFlight=null;if(refreshAgain){refreshAgain=false;queue(0);}});
  return refreshInFlight;
}

function queue(delay = 80) {
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), delay);
}

async function start() {
  const { data:{ session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user?.id || !session?.access_token) return;
  userId = user.id;
  supabase.realtime.setAuth(session.access_token);
  await refresh();
  if (channel) await supabase.removeChannel(channel);
  const nextChannel = supabase.channel(`dashboard-community-${user.id}-${Date.now()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'public_profile_updates'},() => queue())
    .on('postgres_changes',{event:'*',schema:'public',table:'profile_activity'},() => queue())
    .on('postgres_changes',{event:'*',schema:'public',table:'news'},() => queue());
  channel = nextChannel;
  nextChannel.subscribe((status) => {
    if (channel !== nextChannel) return;
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      channel = null;
      window.setTimeout(() => { if (!document.hidden) void start(); }, 1000);
    }
  });
}

window.addEventListener('ec:dashboard-visits-refresh',()=>queue());
window.addEventListener('ec:region-change',() => queue());
window.addEventListener('focus',() => queue(),{passive:true});
document.addEventListener('visibilitychange',() => { if (!document.hidden) queue(); });
let observedDock = null, observedVisitsPanel = null;
new MutationObserver(() => {
  const dock = document.querySelector('.ec-right-dock');
  const panel = dock?.querySelector('.ec-dock-detail[data-panel="visits"]');
  if (dock === observedDock && panel === observedVisitsPanel) return;
  observedDock = dock;
  observedVisitsPanel = panel;
  if (dock) queue(120);
}).observe(document.documentElement,{childList:true,subtree:true});

supabase.auth.onAuthStateChange((_event, session) => {
  const nextId = session?.user?.id || null;
  if (nextId === userId) return;
  if (!nextId) {
    userId = null;
    visitProfiles.clear();
    clearTimeout(timer);
    if (channel) void supabase.removeChannel(channel);
    channel = null;
    return;
  }
  // Start outside the auth callback so getSession cannot wait on its own lock.
  window.setTimeout(() => void start(), 0);
});

void start();


window.addEventListener('ec:profile-visits-changed', (event) => {
  if (event.detail?.userId && event.detail.userId !== userId) return;
  queue(0);
});
