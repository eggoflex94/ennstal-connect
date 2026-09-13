import { supabase } from './supabaseClient';

let timer=null;
let currentUserId='';
let currentRole='';

async function refreshIdentity(){
  const {data:{user}}=await supabase.auth.getUser();
  currentUserId=user?.id||'';
  if(!currentUserId){currentRole='';return;}
  const {data}=await supabase.from('profiles').select('role').eq('id',currentUserId).maybeSingle();
  currentRole=String(data?.role||'');
}

async function expireDue(){
  if(!currentUserId)return;
  await supabase.rpc('expire_temporary_supporters');
}

function localDate(value){
  if(!value)return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
}

async function assignTemporarySupporter(profileId,name){
  const today=new Date();
  const min=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const raw=prompt(`Supporter-Stern für ${name} bis einschließlich Datum (JJJJ-MM-TT):`,min);
  if(raw===null)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return alert('Bitte ein gültiges Datum im Format JJJJ-MM-TT eingeben.');
  const {data,error}=await supabase.rpc('admin_set_temporary_supporter',{p_target_user:profileId,p_until_date:raw});
  if(error)return alert(error.message);
  alert(`Supporter-Stern vergeben bis einschließlich ${localDate(data)}.`);
  window.location.reload();
}

async function enhanceMemberProfile(){
  if(currentRole!=='HEAD_ADMIN')return;
  const page=document.querySelector('.member-profile-page[data-profile-id]');
  const tools=page?.querySelector('.member-admin-tools>div');
  const profileId=page?.dataset.profileId;
  if(!page||!tools||!profileId||profileId===currentUserId)return;
  if(tools.querySelector('.temporary-supporter-tool'))return;
  const {data:member}=await supabase.from('profiles').select('id,nickname,first_name,last_name,role,supporter_until').eq('id',profileId).maybeSingle();
  if(!member||String(member.role)==='HEAD_ADMIN')return;
  const name=member.nickname||[member.first_name,member.last_name].filter(Boolean).join(' ')||'Mitglied';
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary-button temporary-supporter-tool';
  button.textContent=member.supporter_until?`🕒 Supporter verlängern · bis ${localDate(member.supporter_until)}`:'🕒 Supporter mit Enddatum';
  button.onclick=()=>assignTemporarySupporter(member.id,name);
  tools.appendChild(button);
  if(member.supporter_until){
    const note=document.createElement('small');
    note.className='temporary-supporter-note';
    note.textContent=`Befristeter Supporter bis einschließlich ${localDate(member.supporter_until)}.`;
    tools.appendChild(note);
  }
}

async function enhanceAdminCards(){
  if(currentRole!=='HEAD_ADMIN')return;
  const cards=[...document.querySelectorAll('.admin-member-card')];
  if(!cards.length)return;
  const {data:members}=await supabase.from('profiles').select('id,nickname,first_name,last_name,role,supporter_until').neq('id',currentUserId);
  for(const card of cards){
    if(card.querySelector('.temporary-supporter-tool'))continue;
    const label=card.querySelector('.admin-member-person-button strong')?.textContent?.trim();
    if(!label)continue;
    const member=(members||[]).find((item)=>(item.nickname||[item.first_name,item.last_name].filter(Boolean).join(' ')||'Mitglied')===label);
    if(!member||String(member.role)==='HEAD_ADMIN')continue;
    const actions=card.querySelector('.admin-member-card-actions');
    if(!actions)continue;
    const button=document.createElement('button');
    button.type='button';
    button.className='profile-admin-button supporter temporary-supporter-tool';
    button.textContent=member.supporter_until?`🕒 Supporter bis ${localDate(member.supporter_until)}`:'🕒 Supporter mit Enddatum';
    button.onclick=()=>assignTemporarySupporter(member.id,label);
    actions.appendChild(button);
  }
}

async function apply(){
  if(!supabase)return;
  await refreshIdentity();
  await expireDue();
  await Promise.allSettled([enhanceMemberProfile(),enhanceAdminCards()]);
}

function schedule(delay=100){clearTimeout(timer);timer=setTimeout(()=>void apply(),delay);}
window.addEventListener('ec:navigate',()=>schedule(100));
window.addEventListener('focus',()=>schedule(80));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(80)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(20),{once:true});else schedule(20);
