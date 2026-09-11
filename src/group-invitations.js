import { supabase } from './supabaseClient';

let syncing = false;
let timer = null;
let handledToken = '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf = (p) => p?.nickname || [p?.first_name,p?.last_name].filter(Boolean).join(' ') || 'Mitglied';

async function loadContext(page){
  const groupId = page?.dataset?.groupId;
  if(!groupId) return null;
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if(!user) return null;

  const [groupResult,membersAResult,membersBResult,profilesResult,selfResult,manageResult] = await Promise.all([
    supabase.from('community_groups').select('*').eq('id',groupId).maybeSingle(),
    supabase.from('community_group_members').select('user_id').eq('group_id',groupId),
    supabase.from('group_members').select('user_id').eq('group_id',groupId),
    supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,account_status').eq('account_status','ACTIVE').order('nickname',{ascending:true}),
    supabase.from('profiles').select('role,account_status').eq('id',user.id).maybeSingle(),
    supabase.rpc('ec_can_manage_community_groups',{p_user:user.id})
  ]);

  const group = groupResult.data;
  if(!group) return null;
  const memberIds = [...new Set([...(membersAResult.data||[]),...(membersBResult.data||[])].map(x=>x.user_id))];
  const role = String(selfResult.data?.role || '').toUpperCase();
  const canInvite = group.owner_id===user.id || group.created_by===user.id || role==='HEAD_ADMIN' || role==='ADMIN' || manageResult.data===true;
  return {user,group,memberIds,profiles:profilesResult.data||[],canInvite};
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
      button.onclick=()=>void sendInvite(ctx.group.id,p.id,button);
      list.append(row);
    });
  };
  panel.querySelector('.gfp-invite-search').addEventListener('input',e=>render(e.target.value));
  render();
  return panel;
}

async function mountInvites(){
  if(syncing) return;
  const page = document.querySelector('.gfp-page');
  if(!page || page.querySelector('.gfp-invite-panel')) return;
  syncing=true;
  try{
    const ctx = await loadContext(page);
    if(!ctx?.canInvite) return;
    const main = page.querySelector('.gfp-main');
    const hero = page.querySelector('.gfp-hero');
    if(!main) return;
    const panel = buildPanel(ctx);
    if(hero?.parentElement===main) hero.insertAdjacentElement('afterend',panel);
    else main.prepend(panel);
  } catch(error){
    console.warn('[group-invitations]',error?.message||error);
  } finally { syncing=false; }
}

async function handleInviteFromUrl(){
  const token = new URLSearchParams(location.search).get('group_invite');
  if(!token || token === handledToken) return;
  const {data:auth}=await supabase.auth.getUser();
  if(!auth?.user) return;
  handledToken = token;
  const accept = confirm('Du hast eine Gruppeneinladung erhalten. Möchtest du der Gruppe beitreten?');
  if(accept){
    const {data:groupId,error}=await supabase.rpc('accept_group_invitation',{p_token:token});
    if(error){ handledToken=''; return alert(error.message); }
    const url=new URL(location.href); url.searchParams.delete('group_invite'); url.searchParams.set('group',groupId); history.replaceState({},'',url); window.dispatchEvent(new PopStateEvent('popstate'));
  } else {
    const {error}=await supabase.rpc('decline_group_invitation',{p_token:token});
    if(error){ handledToken=''; return alert(error.message); }
    const url=new URL(location.href); url.searchParams.delete('group_invite'); history.replaceState({},'',url);
  }
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void mountInvites(),60);}
new MutationObserver((records)=>{if(records.every(r=>r.target?.closest?.('.gfp-invite-panel')))return;schedule();}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:navigate',schedule);
window.addEventListener('popstate',()=>{schedule();void handleInviteFromUrl();});
window.addEventListener('focus',()=>{schedule();void handleInviteFromUrl();});
supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN'||event==='INITIAL_SESSION') setTimeout(()=>{void handleInviteFromUrl();schedule();},60);});
setInterval(()=>{if(document.querySelector('.gfp-page')&&!document.querySelector('.gfp-invite-panel'))schedule();},1000);
setTimeout(()=>{void handleInviteFromUrl();schedule();},150);

export {};
