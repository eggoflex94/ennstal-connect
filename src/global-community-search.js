import { supabase } from './supabaseClient';

const STYLE_ID='ec-global-search-style';
let cache=null;
let cacheAt=0;
let timer=null;
let activeIndex=-1;

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=(v)=>String(v??'').trim().toLocaleLowerCase('de-AT');

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .ec-global-search{position:relative;flex:0 0 auto;display:flex;align-items:center;min-width:210px;max-width:300px}
    .ec-global-search input{width:100%;height:42px;box-sizing:border-box;padding:0 36px 0 34px;border:1px solid rgba(18,62,112,.14);border-radius:12px;background:#fff;color:#17324a;font-size:.76rem;font-weight:700;outline:none;box-shadow:0 4px 12px rgba(18,62,112,.04)}
    .ec-global-search input:focus{border-color:#0b6dcc;box-shadow:0 0 0 3px rgba(11,109,204,.1)}
    .ec-global-search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:.9rem;color:#46627d;pointer-events:none}
    .ec-global-search-clear{position:absolute;right:7px;top:50%;transform:translateY(-50%);display:none;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:#63778a;font-size:1rem;cursor:pointer}.ec-global-search.has-value .ec-global-search-clear{display:grid;place-items:center}
    .ec-global-search-panel{position:fixed;z-index:2147483000;width:min(520px,calc(100vw - 20px));max-height:min(560px,70vh);overflow:auto;padding:8px;border:1px solid rgba(18,62,112,.12);border-radius:15px;background:#fff;box-shadow:0 22px 55px rgba(17,52,88,.2)}
    .ec-global-search-panel[hidden]{display:none!important}.ec-global-search-section+ .ec-global-search-section{margin-top:8px;padding-top:8px;border-top:1px solid rgba(18,62,112,.08)}
    .ec-global-search-section-title{padding:3px 7px 5px;color:#789; font-size:.58rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    .ec-global-search-result{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:8px;align-items:center;width:100%;min-height:48px;padding:7px;border:0;border-radius:10px;background:transparent;color:#263f58;text-align:left;cursor:pointer}.ec-global-search-result:hover,.ec-global-search-result.is-active{background:#f0f6fb}
    .ec-global-search-result img,.ec-global-search-result .ec-global-search-type{width:32px;height:32px;border-radius:9px;object-fit:cover}.ec-global-search-result .ec-global-search-type{display:grid;place-items:center;background:#edf3f7;color:#29445e;font-size:.85rem;font-weight:900}
    .ec-global-search-result strong,.ec-global-search-result small{display:block;min-width:0}.ec-global-search-result strong{font-size:.72rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ec-global-search-result small{margin-top:2px;color:#78899a;font-size:.6rem;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ec-global-search-result em{color:#0b69c7;font-size:.58rem;font-style:normal;font-weight:900}
    .ec-global-search-empty{padding:16px 12px;text-align:center;color:#7a8b9b;font-size:.68rem;line-height:1.4}
    @media(max-width:900px){.ec-global-search{min-width:180px;max-width:220px}.ec-global-search input{height:40px;font-size:.7rem}}
    @media(max-width:620px){.ec-global-search{min-width:165px;max-width:180px}.ec-global-search input{padding-left:31px;font-size:.66rem}.ec-global-search-panel{width:calc(100vw - 12px);max-height:62vh;border-radius:13px}.ec-global-search-result{min-height:46px}}
  `;
  document.head.appendChild(style);
}

function parseDirectory(data){
  return (data||[]).map(row=>{try{return typeof row==='string'?JSON.parse(row):row}catch{return null}}).filter(Boolean);
}

async function loadData(force=false){
  if(cache&&!force&&Date.now()-cacheAt<60000)return cache;
  if(!supabase)return {members:[],groups:[],events:[],forum:[],news:[]};
  const [membersRes,groupsRes,eventsRes,forumRes,newsRes]=await Promise.all([
    supabase.rpc('community_member_directory'),
    supabase.from('community_groups').select('id,name,description,image_url,region_id').limit(80),
    supabase.from('community_events').select('id,title,description,location,event_at,status,region_id').eq('status','ACTIVE').order('event_at',{ascending:true}).limit(80),
    supabase.from('forum_posts').select('id,title,content,scope,created_at,region_id').eq('scope','COMMUNITY').order('created_at',{ascending:false}).limit(80),
    supabase.from('news').select('id,title,content,created_at,region_id').order('created_at',{ascending:false}).limit(80)
  ]);
  cache={
    members:parseDirectory(membersRes.data),
    groups:groupsRes.data||[],events:eventsRes.data||[],forum:forumRes.data||[],news:newsRes.data||[]
  };
  cacheAt=Date.now();
  return cache;
}

function score(text,q){
  const hay=norm(text); if(!hay)return 0;
  if(hay===q)return 100;
  if(hay.startsWith(q))return 70;
  if(hay.includes(` ${q}`))return 55;
  if(hay.includes(q))return 35;
  return 0;
}

function memberName(m){return m.nickname||[m.first_name,m.last_name].filter(Boolean).join(' ')||'Mitglied'}
function memberHay(m){return [memberName(m),m.first_name,m.last_name,m.location,m.interests,m.company_name].filter(Boolean).join(' ')}

function ranked(data,q){
  const take=(rows,hay)=>rows.map(row=>({row,score:score(hay(row),q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4).map(x=>x.row);
  return {
    members:take(data.members,memberHay),
    groups:take(data.groups,g=>`${g.name||''} ${g.description||''}`),
    events:take(data.events,e=>`${e.title||''} ${e.description||''} ${e.location||''}`),
    forum:take(data.forum,p=>`${p.title||''} ${p.content||''}`),
    news:take(data.news,n=>`${n.title||''} ${n.content||''}`)
  };
}

function openProfile(id){
  const ev=new CustomEvent('ec:open-profile',{detail:{profileId:id},cancelable:true});
  if(window.dispatchEvent(ev))window.location.assign(`/?profile=${encodeURIComponent(id)}`);
}
function go(page){
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}));
  document.body.classList.remove('ec-dock-open');
}

function resultButton(kind,row){
  const b=document.createElement('button');b.type='button';b.className='ec-global-search-result';
  const map={groups:['●','Gruppe','groups'],events:['▣','Event','events'],forum:['▤','Forum','forum'],news:['▦','Neuigkeit','news']};
  if(kind==='members'){
    const img=document.createElement('img');img.src=row.avatar_url||'/community-default-avatar.png';img.alt='';
    const copy=document.createElement('span');copy.innerHTML=`<strong>${esc(memberName(row))}</strong><small>${esc([row.location,row.interests].filter(Boolean).join(' · ')||'Mitglied')}</small>`;
    const type=document.createElement('em');type.textContent='Profil';b.append(img,copy,type);b.onclick=()=>openProfile(row.id);
  }else{
    const [icon,label,page]=map[kind];
    const ico=document.createElement('span');ico.className='ec-global-search-type';ico.textContent=icon;
    const copy=document.createElement('span');
    const title=row.name||row.title||label;
    const detail=kind==='events'?[row.location,row.event_at?new Date(row.event_at).toLocaleDateString('de-AT'):null].filter(Boolean).join(' · '):(row.description||row.content||'').slice(0,100);
    copy.innerHTML=`<strong>${esc(title)}</strong><small>${esc(detail||label)}</small>`;
    const type=document.createElement('em');type.textContent=label;b.append(ico,copy,type);b.onclick=()=>go(page);
  }
  return b;
}

function render(panel,results){
  panel.replaceChildren();
  const labels={members:'Mitglieder',groups:'Gruppen',events:'Events',forum:'Forum',news:'Neuigkeiten'};
  let total=0;
  Object.entries(results).forEach(([kind,rows])=>{
    if(!rows.length)return;total+=rows.length;
    const section=document.createElement('section');section.className='ec-global-search-section';
    const title=document.createElement('div');title.className='ec-global-search-section-title';title.textContent=labels[kind];section.appendChild(title);
    rows.forEach(row=>section.appendChild(resultButton(kind,row)));panel.appendChild(section);
  });
  if(!total){const empty=document.createElement('div');empty.className='ec-global-search-empty';empty.textContent='Keine passenden Mitglieder, Gruppen, Events oder Beiträge gefunden.';panel.appendChild(empty);}
  activeIndex=-1;panel.hidden=false;positionPanel();
}

function positionPanel(){
  const root=document.querySelector('.ec-global-search');const panel=document.querySelector('.ec-global-search-panel');if(!root||!panel||panel.hidden)return;
  const r=root.getBoundingClientRect();const width=Math.min(520,window.innerWidth-20);let left=Math.min(r.left,window.innerWidth-width-10);left=Math.max(10,left);
  panel.style.left=`${left}px`;panel.style.top=`${Math.min(r.bottom+6,window.innerHeight-120)}px`;
}

async function doSearch(value){
  const q=norm(value);const panel=document.querySelector('.ec-global-search-panel');if(!panel)return;
  if(q.length<2){panel.hidden=true;return;}
  panel.innerHTML='<div class="ec-global-search-empty">Suche …</div>';panel.hidden=false;positionPanel();
  const data=await loadData();if(norm(document.querySelector('.ec-global-search input')?.value)!==q)return;
  render(panel,ranked(data,q));
}

function keyboard(event){
  const panel=document.querySelector('.ec-global-search-panel');if(!panel||panel.hidden)return;
  const items=[...panel.querySelectorAll('.ec-global-search-result')];
  if(event.key==='Escape'){panel.hidden=true;event.target.blur();return;}
  if(!items.length)return;
  if(event.key==='ArrowDown'){event.preventDefault();activeIndex=(activeIndex+1)%items.length;}
  else if(event.key==='ArrowUp'){event.preventDefault();activeIndex=(activeIndex-1+items.length)%items.length;}
  else if(event.key==='Enter'&&activeIndex>=0){event.preventDefault();items[activeIndex].click();panel.hidden=true;return;}else return;
  items.forEach((item,i)=>item.classList.toggle('is-active',i===activeIndex));items[activeIndex]?.scrollIntoView({block:'nearest'});
}

function mount(){
  const nav=document.querySelector('.ec-top-nav');if(!nav)return false;
  if(nav.querySelector('.ec-global-search'))return true;
  ensureStyle();
  const root=document.createElement('div');root.className='ec-global-search';
  root.innerHTML='<span class="ec-global-search-icon" aria-hidden="true">⌕</span><input type="search" autocomplete="off" spellcheck="false" aria-label="Community durchsuchen" placeholder="Alles durchsuchen …"><button type="button" class="ec-global-search-clear" aria-label="Suche leeren">×</button>';
  const picker=nav.querySelector('.ec-region-picker');nav.insertBefore(root,picker||nav.lastElementChild);
  let panel=document.querySelector('.ec-global-search-panel');if(!panel){panel=document.createElement('div');panel.className='ec-global-search-panel';panel.hidden=true;document.body.appendChild(panel);}
  const input=root.querySelector('input');const clear=root.querySelector('.ec-global-search-clear');
  input.addEventListener('input',()=>{root.classList.toggle('has-value',!!input.value);clearTimeout(timer);timer=setTimeout(()=>void doSearch(input.value),180);});
  input.addEventListener('focus',()=>{if(input.value.trim().length>=2)void doSearch(input.value);});
  input.addEventListener('keydown',keyboard);
  clear.addEventListener('click',()=>{input.value='';root.classList.remove('has-value');panel.hidden=true;input.focus();});
  return true;
}

function schedule(retries=10){
  const run=(left)=>{if(mount()||left<=0)return;setTimeout(()=>run(left-1),180)};run(retries);
}

document.addEventListener('click',(event)=>{
  const panel=document.querySelector('.ec-global-search-panel');if(!panel)return;
  if(!event.target.closest('.ec-global-search')&&!event.target.closest('.ec-global-search-panel'))panel.hidden=true;
});
window.addEventListener('resize',positionPanel,{passive:true});
window.addEventListener('scroll',positionPanel,{passive:true});
window.addEventListener('ec:navigate',()=>{document.querySelector('.ec-global-search-panel')?.setAttribute('hidden','');schedule(4);});
window.addEventListener('ec:region-change',()=>{cache=null;cacheAt=0;schedule(3);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(),{once:true});else schedule();
