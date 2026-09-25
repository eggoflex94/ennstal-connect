import { supabase } from './supabaseClient';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
let timer = null;
let requestVersion = 0;

function navigate(page){
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}));
}

function taskButton(key,title,copy,done,page){
  const button=document.createElement('button');
  button.type='button';
  button.className='ec-starter-task';
  button.dataset.done=done?'1':'0';
  button.dataset.task=key;
  button.innerHTML=`<span class="ec-starter-task-state">${done?'✓':'○'}</span><div><strong>${title}</strong><small>${copy}</small></div><em>${done?'Erledigt':'Öffnen →'}</em>`;
  if(!done)button.addEventListener('click',()=>navigate(page));
  return button;
}

async function count(query){
  try{
    const {count,error}=await query;
    return error?0:Number(count||0);
  }catch{
    return 0;
  }
}

async function refresh(force=false){
  const section=document.querySelector('#ec-home-activation .ec-first-steps');
  if(!section||!supabase)return;
  const version=++requestVersion;

  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id||version!==requestVersion)return;

  const {data:profile,error:profileError}=await supabase
    .from('profiles')
    .select('id,nickname,bio,interests,created_at,account_status')
    .eq('id',user.id)
    .maybeSingle();
  if(profileError||!profile||profile.account_status!=='ACTIVE'||version!==requestVersion)return;

  const createdAt=new Date(profile.created_at||0).getTime();
  const ageMs=Date.now()-createdAt;
  if(!createdAt||ageMs>SEVEN_DAYS){
    section.hidden=true;
    section.dataset.ecStarterJourney='expired';
    return;
  }

  const [groups,posts,friends]=await Promise.all([
    count(supabase.from('community_group_members').select('group_id',{count:'exact',head:true}).eq('user_id',user.id)),
    count(supabase.from('forum_posts').select('id',{count:'exact',head:true}).eq('author_id',user.id)),
    count(supabase.from('friendships').select('id',{count:'exact',head:true}).eq('status','ACCEPTED').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`))
  ]);
  if(version!==requestVersion)return;

  const profileDone=Boolean(String(profile.nickname||'').trim()&&String(profile.bio||'').trim()&&String(profile.interests||'').trim());
  const tasks=[
    {key:'profile',title:'Profil persönlich machen',copy:'Spitzname, Kurzinfo und Interessen ergänzen.',done:profileDone,page:'profile'},
    {key:'group',title:'Erste Gruppe finden',copy:'Menschen mit ähnlichen Interessen entdecken.',done:groups>0,page:'groups'},
    {key:'forum',title:'Ein erstes Servus schreiben',copy:'Dich vorstellen oder bei einem Thema mitreden.',done:posts>0,page:'forum'},
    {key:'friend',title:'Ersten Kontakt knüpfen',copy:'Mit einem Mitglied aus deiner Region verbinden.',done:friends>0,page:'members'}
  ];
  const done=tasks.filter(task=>task.done).length;
  const remaining=tasks.length-done;
  const daysLeft=Math.max(1,Math.ceil((SEVEN_DAYS-ageMs)/(24*60*60*1000)));

  section.hidden=false;
  section.dataset.ecStarterJourney='active';
  section.dataset.progress=String(done);

  const head=section.querySelector('.ec-first-steps-head');
  if(head){
    head.innerHTML=`<div><span class="eyebrow">DEINE ERSTEN 7 TAGE</span><h2>${done===tasks.length?'Dein Community-Start ist geschafft.':'Dein persönlicher Startplan'}</h2><p>${done===tasks.length?'Du hast alle wichtigen ersten Schritte erledigt. Jetzt gehört die Community dir.':`Noch ${remaining} ${remaining===1?'Schritt':'Schritte'} offen · ${daysLeft} ${daysLeft===1?'Tag':'Tage'} im Startplan.`}</p></div><span class="ec-first-steps-badge">${done}/${tasks.length} erledigt</span>`;
  }

  let grid=section.querySelector('.ec-first-steps-grid');
  if(!grid){
    grid=document.createElement('div');
    grid.className='ec-first-steps-grid';
    section.appendChild(grid);
  }
  grid.replaceChildren(...tasks.map(task=>taskButton(task.key,task.title,task.copy,task.done,task.page)));

  let progress=section.querySelector('.ec-starter-progress');
  if(!progress){
    progress=document.createElement('div');
    progress.className='ec-starter-progress';
    section.appendChild(progress);
  }
  const percent=Math.round(done/tasks.length*100);
  progress.innerHTML=`<div><i style="width:${percent}%"></i></div><span>${percent}%</span>`;
}

function schedule(delay=180){
  clearTimeout(timer);
  timer=setTimeout(()=>void refresh(),delay);
}

window.addEventListener('ec:navigate',()=>schedule(220));
window.addEventListener('ec:region-change',()=>schedule(220));
window.addEventListener('ec:onboarding-closed',()=>schedule(120));
window.addEventListener('focus',()=>schedule(100));

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(350),{once:true});
else schedule(350);
