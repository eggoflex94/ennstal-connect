import { supabase } from './supabaseClient';

let timer = null;
let requestVersion = 0;

function mondayIso(){
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  monday.setHours(0,0,0,0);
  return monday.toISOString();
}

function navigate(page){
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}));
}

async function count(query){
  try{
    const { count, error } = await query;
    return error ? 0 : Number(count || 0);
  }catch{
    return 0;
  }
}

function goalCard({icon,title,copy,value,target,page}){
  const done = value >= target;
  const percent = Math.max(0, Math.min(100, Math.round((value / target) * 100)));
  const button = document.createElement('button');
  button.type='button';
  button.className='ec-weekly-goal';
  button.dataset.done=done?'1':'0';
  button.innerHTML=`
    <span class="ec-weekly-goal-icon">${icon}</span>
    <div class="ec-weekly-goal-copy">
      <strong>${title}</strong>
      <small>${copy}</small>
      <div class="ec-weekly-goal-progress"><i style="width:${percent}%"></i></div>
    </div>
    <b>${done?'✓':`${Math.min(value,target)}/${target}`}</b>`;
  button.addEventListener('click',()=>navigate(page));
  return button;
}

async function refresh(){
  const host = document.querySelector('#ec-home-activation .ec-weekly-region-recap');
  if(!host || !supabase) return;
  const version = ++requestVersion;

  const { data: { user } } = await supabase.auth.getUser();
  if(!user?.id || version !== requestVersion) return;

  const since = mondayIso();
  const [posts,replies,friends,rsvps] = await Promise.all([
    count(supabase.from('forum_posts').select('id',{count:'exact',head:true}).eq('author_id',user.id).gte('created_at',since)),
    count(supabase.from('forum_replies').select('id',{count:'exact',head:true}).eq('author_id',user.id).gte('created_at',since)),
    count(supabase.from('friendships').select('id',{count:'exact',head:true}).eq('status','ACCEPTED').gte('updated_at',since).or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)),
    count(supabase.from('community_event_rsvps').select('event_id',{count:'exact',head:true}).eq('user_id',user.id).gte('updated_at',since).neq('status','DECLINED'))
  ]);

  if(version !== requestVersion) return;

  let section = document.querySelector('#ec-home-activation .ec-weekly-goals');
  if(!section){
    section = document.createElement('section');
    section.className='ec-weekly-goals';
    host.after(section);
  }

  const contribution = posts + replies;
  const goals = [
    {icon:'💬',title:'Mitreden',copy:'Einen Beitrag oder eine Antwort schreiben.',value:contribution,target:1,page:'forum'},
    {icon:'🤝',title:'Vernetzen',copy:'Eine neue Freundschaft in der Community knüpfen.',value:friends,target:1,page:'members'},
    {icon:'🎉',title:'Dabei sein',copy:'Bei einer regionalen Veranstaltung zusagen.',value:rsvps,target:1,page:'events'}
  ];
  const done = goals.filter(goal=>goal.value>=goal.target).length;

  section.innerHTML = `
    <div class="ec-weekly-goals-head">
      <div><span class="eyebrow">DIESE WOCHE AKTIV WERDEN</span><h3>${done===3?'Wochenziele geschafft':'Drei kleine Schritte für mehr Community'}</h3><p>${done===3?'Stark – du hast alle drei Community-Ziele dieser Woche erreicht.':'Kein Ranking, kein Wettbewerb: einfach kleine Impulse, um miteinander in Kontakt zu bleiben.'}</p></div>
      <span class="ec-weekly-goals-score">${done}/3</span>
    </div>
    <div class="ec-weekly-goals-grid"></div>`;
  const grid = section.querySelector('.ec-weekly-goals-grid');
  goals.forEach(goal=>grid.appendChild(goalCard(goal)));
}

function schedule(delay=180){
  clearTimeout(timer);
  timer=setTimeout(()=>void refresh(),delay);
}

window.addEventListener('ec:navigate',()=>schedule(220));
window.addEventListener('ec:region-change',()=>schedule(220));
window.addEventListener('focus',()=>schedule(100));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(100)});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(320),{once:true});
else schedule(320);
