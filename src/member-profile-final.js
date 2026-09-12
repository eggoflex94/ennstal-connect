import { supabase } from './supabaseClient';

let regions=[];
let viewer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const age=d=>{if(!d)return'';const b=new Date(d);if(Number.isNaN(b.getTime()))return'';const n=new Date();let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};
const date=d=>{if(!d)return'';const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toLocaleDateString('de-AT')};
const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();

async function context(){
  if(viewer&&regions.length)return;
  const {data:{user}}=await supabase.auth.getUser();
  if(user){const {data}=await supabase.from('profiles').select('*').eq('id',user.id).maybeSingle();viewer=data||null}
  const {data:r}=await supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order');regions=r||[];
}
async function targetFor(root){
  const id=root.dataset.profileId||root.dataset.ecTargetId;
  if(id){const {data}=await supabase.from('profiles').select('*').eq('id',id).maybeSingle();if(data)return data}
  const name=(root.querySelector('.member-profile-hero h1')?.textContent||'').trim();
  if(!name)return null;
  let {data}=await supabase.from('profiles').select('*').eq('nickname',name).maybeSingle();
  if(!data){const all=await supabase.from('profiles').select('*');data=(all.data||[]).find(p=>[p.first_name,p.last_name].filter(Boolean).join(' ')===name)||null}
  return data;
}
async function friendship(targetId){
  if(!viewer?.id||!targetId)return false;
  const {data}=await supabase.from('friendships').select('status').eq('status','ACCEPTED').or(`and(requester_id.eq.${viewer.id},receiver_id.eq.${targetId}),and(requester_id.eq.${targetId},receiver_id.eq.${viewer.id})`).limit(1);
  return Boolean(data?.length);
}
function visible(target,field,isFriend){
  if(viewer?.id===target.id||['HEAD_ADMIN','ADMIN'].includes(String(viewer?.role||'').toUpperCase()))return true;
  const setting=String(target?.privacy_settings?.[field]||'PUBLIC').toUpperCase();
  return setting==='PUBLIC'||(setting==='FRIENDS'&&isFriend);
}
async function functionInfo(target){
  const role=String(target.role||'MEMBER').toUpperCase();
  if(role==='HEAD_ADMIN')return{label:'Hauptadmin',star:'/role-star-red.svg'};
  if(role==='ADMIN')return{label:'Global Admin',star:'/role-star-red.svg'};
  const {data}=await supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',target.id).eq('active',true);
  if(data?.length){
    const names=data.map(a=>regions.find(r=>r.id===a.region_id)?.name).filter(Boolean);
    return{label:`Regional Admin${names.length?` · ${names.join(', ')}`:''}`,star:'/role-star-red.svg'};
  }
  if(role==='SUPPORTER')return{label:'Supporter',star:'/supporter-star.svg'};
  if(target.account_badge==='BUSINESS')return{label:'Unternehmenskonto',star:'/role-star-blue.svg'};
  return{label:'Mitglied',star:null};
}
function row(label,value){if(!value)return'';return `<div class="ec-mp-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function cleanActionText(button){
  const t=(button.textContent||'').replace(/[💬🤝♥✓⏳🚫🚩⚠🔓🔒🟢★✕↩⚙]/g,'').replace(/\s+/g,' ').trim();
  if(t)button.textContent=t;
  button.classList.add('ec-mp-action');
}
function cleanProfileNoise(root){
  root.querySelectorAll(':scope > .profile-visible-details').forEach(node=>node.remove());

  // ProfileSections owns the one public "Das bin ich" section. Older profile
  // layers used to add another "Über mich / Das bin ich" panel. Remove every
  // competing panel instead of trying to style two copies of the same bio.
  const canonicalStory=root.querySelector('.personal-profile-sections > .profile-story');
  [...root.querySelectorAll('section,article')].forEach(node=>{
    if(node===canonicalStory||canonicalStory?.contains(node))return;
    const heading=norm(node.querySelector(':scope > h2')?.textContent||node.querySelector(':scope > div > h2')?.textContent);
    const eyebrow=norm(node.querySelector(':scope > .eyebrow')?.textContent||node.querySelector(':scope > div > .eyebrow')?.textContent);
    if(heading==='das bin ich'&&(eyebrow==='über mich'||eyebrow==='persönlich'||node.classList.contains('profile-story')))node.remove();
  });

  const stories=[...root.querySelectorAll('.personal-profile-sections > .profile-story')];
  stories.slice(1).forEach(node=>node.remove());
  const story=stories[0];
  if(story){
    const seen=new Set();
    const legacy=story.querySelector('.profile-story-legacy .profile-story-text');
    const legacyText=norm(legacy?.textContent);
    [...story.querySelectorAll('.profile-story-block')].forEach(block=>{
      const text=norm(block.querySelector('.profile-story-text')?.textContent);
      const title=norm(block.querySelector('h3')?.textContent);
      const isLegacy=block.classList.contains('profile-story-legacy');
      const duplicatesLegacy=!isLegacy&&legacyText&&text===legacyText;
      const duplicateText=text&&seen.has(text);
      const redundantAbout=!isLegacy&&legacyText&&['über mich','das bin ich'].includes(title)&&(!text||text===legacyText);
      if(duplicatesLegacy||duplicateText||redundantAbout)block.remove();
      else if(text)seen.add(text);
    });
  }

  // The hidden React hero must never leave a second visible bio behind.
  root.querySelectorAll('.member-profile-hero .member-profile-bio').forEach(node=>{node.hidden=true});

  document.querySelectorAll('.toast,[role="alert"]').forEach(node=>{
    const text=String(node.textContent||'');
    if(/Profil gespeichert, aber .*protokolliert/i.test(text))node.remove();
  });
}
async function build(root){
  cleanProfileNoise(root);
  if(root.dataset.ecMemberProfileFinal==='1'||root.dataset.ecMemberProfileBuilding==='1')return;
  const hero=root.querySelector('.member-profile-hero');
  if(!hero)return;

  root.dataset.ecMemberProfileBuilding='1';
  try{
    await context();
    const target=await targetFor(root);if(!target)return;
    const isFriend=await friendship(target.id);
    const avatar=hero.querySelector('img');
    const role=await functionInfo(target);
    const home=regions.find(r=>r.id===target.home_region_id)?.name||'';

    root.querySelectorAll(':scope > .ec-mp-card,:scope > .ec-mp-more,:scope > .ec-mp-actions,:scope > .profile-visible-details').forEach(node=>node.remove());
    root.dataset.ecTargetId=target.id;
    root.classList.add('ec-member-profile-final');

    const card=document.createElement('section');card.className='ec-mp-card';
    const left=document.createElement('div');left.className='ec-mp-left';
    const photo=document.createElement('div');photo.className='ec-mp-photo';if(avatar)photo.appendChild(avatar);left.appendChild(photo);
    const functionBox=document.createElement('div');functionBox.className='ec-mp-function';
    const roleMarkup=role.star?`<span class="ec-mp-function-role"><img class="ec-mp-role-star" src="${role.star}" alt="" aria-hidden="true"><strong>${esc(role.label)}</strong></span>`:`<span class="ec-mp-function-role"><strong>${esc(role.label)}</strong></span>`;
    functionBox.innerHTML=`<span>Funktion</span>${roleMarkup}`;
    left.appendChild(functionBox);

    const data=document.createElement('div');data.className='ec-mp-data';
    const realName=[target.first_name,target.last_name].filter(Boolean).join(' ');
    data.innerHTML=`<div class="ec-mp-data-head"><div><span>MITGLIEDSPROFIL</span><h1>${esc(target.nickname||realName||'Mitglied')}</h1></div>${target.is_verified?'<b class="ec-mp-verified" title="Verifiziert">✓</b>':''}</div><div class="ec-mp-rows">${row('Nickname',target.nickname)}${visible(target,'name',isFriend)?row('Vorname',target.first_name):''}${visible(target,'name',isFriend)?row('Nachname',target.last_name):''}${visible(target,'birth_date',isFriend)?row('Geburtsdatum',date(target.birth_date)):''}${visible(target,'birth_date',isFriend)?row('Alter',age(target.birth_date)):''}${row('Heimatregion',home)}</div>`;
    card.append(left,data);
    root.insertBefore(card,hero);
    hero.hidden=true;

    const actions=document.createElement('div');actions.className='ec-mp-actions';
    const sourceActions=root.querySelector('.member-profile-actions');
    if(sourceActions){
      [...sourceActions.querySelectorAll('button')].forEach(button=>{cleanActionText(button);actions.appendChild(button)});
      sourceActions.hidden=true;
    }
    if(actions.children.length)card.after(actions);

    cleanProfileNoise(root);
    root.dataset.ecMemberProfileFinal='1';
  }finally{
    delete root.dataset.ecMemberProfileBuilding;
  }
}
function run(){document.querySelectorAll('.member-profile-page:not(.public-profile-preview)').forEach(root=>{cleanProfileNoise(root);build(root)})}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('DOMContentLoaded',run);run();
