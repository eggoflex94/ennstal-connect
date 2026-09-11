import { supabase } from './supabaseClient';

let syncing = false;
let timer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf = (p) => p?.nickname || [p?.first_name,p?.last_name].filter(Boolean).join(' ') || 'Mitglied';

async function loadContext(page){
  const groupId = page?.dataset?.groupId;
  if(!groupId) return null;
  const [{data:auth},{data:group},{data:membersA},{data:membersB},{data:profiles}] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('community_groups').select('*').eq('id',groupId).maybeSingle(),
    supabase.from('community_group_members').select('user_id').eq('group_id',groupId),
    supabase.from('group_members').select('user_id').eq('group_id',groupId),
    supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,account_status').eq('account_status','ACTIVE').order('nickname',{ascending:true})
  ]);
  const user = auth?.user;
  if(!user || !group) return null;
  const memberIds = [...new Set([...(membersA||[]),...(membersB||[])].map(x=>x.user_id))];
  const canInvite = group.owner_id===user.id || group.created_by===user.id;
  return {user,group,memberIds,profiles:profiles||[],canInvite};
}

async function sendInvite(groupId,targetId,button){
  if(button.disabled) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Wird eingeladen …';
  const { error } = await supabase.rpc('invite_to_community_group',{p_group_id:groupId,p_target_user:targetId});
  if(error){ alert(`Einladung konnte nicht gesendet werden: ${error.message}`); button.disabled=false; button.textContent=original; return; }
  button.textContent = '✓ Einladung gesendet';
  setTimeout(()=>{ if(button.isConnected){ button.disabled=true; } },500);
}

async function mountInvites(){
  if(syncing) return;
  const page = document.querySelector('.gfp-page');
  if(!page || page.querySelector('.gfp-invite-panel')) return;
  syncing=true;
  try{
    const ctx = await loadContext(page);
    if(!ctx?.canInvite) return;
    const candidates = ctx.profiles.filter(p=>p.id!==ctx.user.id && !ctx.memberIds.includes(p.id));
    const side = page.querySelector('.gfp-side') || page.querySelector('.gfp-grid');
    if(!side) return;
    const panel = document.createElement('section');
    panel.className='gfp-invite-panel';
    panel.innerHTML = `<div class="gfp-section-heading"><div><span class="gfp-kicker">EINLADEN</span><h2>Mitglieder einladen</h2></div></div><input class="gfp-invite-search" type="search" placeholder="Mitglied suchen …" aria-label="Mitglied suchen"><div class="gfp-invite-list"></div>`;
    const list = panel.querySelector('.gfp-invite-list');
    const render = (query='')=>{
      const q=query.trim().toLowerCase();
      const filtered=candidates.filter(p=>!q || nameOf(p).toLowerCase().includes(q)).slice(0,40);
      list.innerHTML='';
      if(!filtered.length){ list.innerHTML='<div class="gfp-invite-empty">Keine passenden Mitglieder gefunden.</div>'; return; }
      filtered.forEach(p=>{
        const row=document.createElement('div'); row.className='gfp-invite-row';
        row.innerHTML=`<img src="${esc(p.avatar_url||'/community-default-avatar.png')}" alt=""><span><strong>${esc(nameOf(p))}</strong><small>Einladung per Nachricht mit Gruppenlink</small></span><button type="button">Einladen</button>`;
        row.querySelector('button').onclick=()=>void sendInvite(ctx.group.id,p.id,row.querySelector('button'));
        list.append(row);
      });
    };
    panel.querySelector('.gfp-invite-search').addEventListener('input',e=>render(e.target.value));
    render();
    side.append(panel);
  } finally { syncing=false; }
}

async function handleInviteFromUrl(){
  const token = new URLSearchParams(location.search).get('group_invite');
  if(!token) return;
  const {data:auth}=await supabase.auth.getUser();
  if(!auth?.user) return;
  const accept = confirm('Du hast eine Gruppeneinladung erhalten. Möchtest du der Gruppe beitreten?');
  if(accept){
    const {data:groupId,error}=await supabase.rpc('accept_group_invitation',{p_token:token});
    if(error) return alert(error.message);
    const url=new URL(location.href); url.searchParams.delete('group_invite'); url.searchParams.set('group',groupId); location.href=url.toString();
  } else {
    const {error}=await supabase.rpc('decline_group_invitation',{p_token:token});
    if(error) return alert(error.message);
    const url=new URL(location.href); url.searchParams.delete('group_invite'); history.replaceState({},'',url);
    alert('Einladung abgelehnt.');
  }
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void mountInvites(),100);}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:navigate',schedule);
window.addEventListener('popstate',schedule);
setTimeout(()=>{void handleInviteFromUrl();schedule();},400);

export {};
