import { supabase } from './supabaseClient';

const CONTEXT_TTL_MS = 10000;
const contextCache = new Map();
const contextLoads = new Map();
let currentUser = null;
let userLoad = null;
let mountVersion = 0;
let handledToken = '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf = (p) => p?.nickname || [p?.first_name,p?.last_name].filter(Boolean).join(' ') || 'Mitglied';

async function getCurrentUser() {
  if (currentUser) return currentUser;
  if (userLoad) return userLoad;
  userLoad = supabase.auth.getUser().then(({ data }) => {
    currentUser = data?.user || null;
    return currentUser;
  }).finally(() => { userLoad = null; });
  return userLoad;
}

function invalidateContext(groupId = null) {
  if (!groupId) {
    contextCache.clear();
    contextLoads.clear();
    return;
  }
  for (const key of contextCache.keys()) if (key.startsWith(`${groupId}:`)) contextCache.delete(key);
  for (const key of contextLoads.keys()) if (key.startsWith(`${groupId}:`)) contextLoads.delete(key);
}

async function loadContext(page, force = false) {
  const groupId = page?.dataset?.groupId;
  if (!groupId) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const key = `${groupId}:${user.id}`;
  const cached = contextCache.get(key);
  if (!force && cached?.expiresAt > Date.now()) return cached.value;
  if (!force && contextLoads.has(key)) return contextLoads.get(key);

  const load = (async () => {
    const [groupResult,membersAResult,membersBResult,profilesResult,selfResult,manageResult] = await Promise.all([
      supabase.from('community_groups').select('*').eq('id',groupId).maybeSingle(),
      supabase.from('community_group_members').select('user_id').eq('group_id',groupId),
      supabase.from('group_members').select('user_id').eq('group_id',groupId),
      supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,account_status').eq('account_status','ACTIVE').order('nickname',{ascending:true}),
      supabase.from('profiles').select('role,account_status').eq('id',user.id).maybeSingle(),
      supabase.rpc('ec_can_manage_community_groups',{p_user:user.id})
    ]);
    const group = groupResult.data;
    if (!group) return null;
    const memberIds = [...new Set([...(membersAResult.data||[]),...(membersBResult.data||[])].map(x=>x.user_id))];
    const role = String(selfResult.data?.role || '').toUpperCase();
    const canInvite = group.owner_id===user.id || group.created_by===user.id || role==='HEAD_ADMIN' || role==='ADMIN' || manageResult.data===true;
    const value = {user,group,memberIds,profiles:profilesResult.data||[],canInvite};
    contextCache.set(key,{value,expiresAt:Date.now()+CONTEXT_TTL_MS});
    return value;
  })().finally(() => contextLoads.delete(key));
  contextLoads.set(key, load);
  return load;
}

async function sendInvite(groupId,targetId,button){
  if(button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy','true');
  const original = button.textContent;
  button.textContent = 'Wird eingeladen …';
  const { error } = await supabase.rpc('invite_to_community_group',{p_group_id:groupId,p_target_user:targetId});
  button.removeAttribute('aria-busy');
  if(error){ alert(`Einladung konnte nicht gesendet werden: ${error.message}`); button.disabled=false; button.textContent=original; return; }
  invalidateContext(groupId);
  button.textContent = '✓ Einladung gesendet';
}

function buildPanel(ctx){
  const candidates = ctx.profiles.filter(p=>p.id!==ctx.user.id && !ctx.memberIds.includes(p.id));
  const panel = document.createElement('section');
  panel.className='gfp-invite-panel gfp-invite-panel-prominent';
  panel.innerHTML = `<div class="gfp-section-heading"><div><span class="gfp-kicker">GRUPPENVERWALTUNG</span><h2>Mitglieder einladen</h2><p class="gfp-invite-help">Suche ein Mitglied und sende mit einem Klick eine Einladung. Das Mitglied erhält automatisch eine Nachricht mit direktem Gruppenlink.</p></div></div><input class="gfp-invite-search" type="search" placeholder="Mitglied suchen …" aria-label="Mitglied suchen"><div class="gfp-invite-list"></div>`;
  const list = panel.querySelector('.gfp-invite-list');
  const render = (query='')=>{
    const q=query.trim().toLowerCase();
    const filtered=candidates.filter(p=>!q || nameOf(p).toLowerCase().includes(q)).slice(0,50);
    list.innerHTML='';
    if(!filtered.length){ list.innerHTML='<div class="gfp-invite-empty">Keine einladbaren Mitglieder gefunden.</div>'; return; }
    filtered.forEach(p=>{
      const row=document.createElement('div'); row.className='gfp-invite-row';
      row.innerHTML=`<img src="${esc(p.avatar_url||'/community-default-avatar.png')}" alt=""><span><strong>${esc(nameOf(p))}</strong><small>Einladung per privater Nachricht</small></span><button type="button">Einladen</button>`;
      const button=row.querySelector('button');
      button.addEventListener('click',()=>void sendInvite(ctx.group.id,p.id,button));
      list.append(row);
    });
  };
  panel.querySelector('.gfp-invite-search').addEventListener('input',e=>render(e.target.value));
  render();
  return panel;
}

async function mountInvites(page = document.querySelector('.gfp-page'), force = false){
  if(!page || page.querySelector('.gfp-invite-panel')) return;
  const version = ++mountVersion;
  try{
    const ctx = await loadContext(page, force);
    if(version !== mountVersion || !page.isConnected || !ctx?.canInvite || page.querySelector('.gfp-invite-panel')) return;
    const main = page.querySelector('.gfp-main');
    const hero = page.querySelector('.gfp-hero');
    if(!main) return;
    const panel = buildPanel(ctx);
    if(hero?.parentElement===main) hero.insertAdjacentElement('afterend',panel);
    else main.prepend(panel);
  } catch(error){
    console.warn('[group-invitations]',error?.message||error);
  }
}

async function handleInviteFromUrl(){
  const token = new URLSearchParams(location.search).get('group_invite');
  if(!token || token === handledToken) return;
  const user = await getCurrentUser();
  if(!user) return;
  handledToken = token;
  const accept = confirm('Du hast eine Gruppeneinladung erhalten. Möchtest du der Gruppe beitreten?');
  if(accept){
    const {data:groupId,error}=await supabase.rpc('accept_group_invitation',{p_token:token});
    if(error){ handledToken=''; return alert(error.message); }
    invalidateContext(groupId);
    const url=new URL(location.href); url.searchParams.delete('group_invite'); url.searchParams.set('group',groupId); history.replaceState({},'',url); window.dispatchEvent(new PopStateEvent('popstate'));
  } else {
    const {error}=await supabase.rpc('decline_group_invitation',{p_token:token});
    if(error){ handledToken=''; return alert(error.message); }
    const url=new URL(location.href); url.searchParams.delete('group_invite'); history.replaceState({},'',url);
  }
}

function onGroupPageRendered(event) {
  const page = event.detail?.page || document.querySelector('.gfp-page');
  void mountInvites(page);
}

window.addEventListener('ec:group-page-rendered', onGroupPageRendered);
window.addEventListener('ec:navigate',()=>{ mountVersion++; void handleInviteFromUrl(); });
window.addEventListener('popstate',()=>{ mountVersion++; void handleInviteFromUrl(); });
window.addEventListener('focus',()=>void handleInviteFromUrl());
supabase.auth.onAuthStateChange((event, session)=>{
  currentUser = session?.user || null;
  invalidateContext();
  if(event==='SIGNED_IN'||event==='INITIAL_SESSION') {
    void handleInviteFromUrl();
    void mountInvites();
  }
});
queueMicrotask(()=>{ void handleInviteFromUrl(); void mountInvites(); });

export {};
