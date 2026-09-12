import { supabase } from './supabaseClient';
import './member-directory-polish.css';

let regions=[];
let viewer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const age=d=>{if(!d)return'';const b=new Date(d);if(Number.isNaN(b.getTime()))return'';const n=new Date();let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};
const date=d=>{if(!d)return'';const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toLocaleDateString('de-AT')};

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
  return{label:'Mitglied',star:null};
}
function row(label,value){if(!value)return'';return `<div class="ec-mp-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function cleanActionText(button){
  const t=(button.textContent||'').replace(/[💬🤝♥✓⏳🚫🚩⚠🔓🔒🟢★✕↩⚙]/g,'').replace(/\s+/g,' ').trim();
  if(t)button.textContent=t;
  button.classList.add('ec-mp-action');
}
async function build(root){
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

    root.querySelectorAll(':scope > .ec-mp-card,:scope > .ec-mp-more,:scope > .ec-mp-actions').forEach(node=>node.remove());
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
    data.innerHTML=`<div class="ec-mp-data-head"><div><span>MITGLIEDSPROFIL</span><h1>${esc(target.nickname||realName||'Mitglied')}</h1></div>${target.is_verified?'<b class="ec-mp-verified" title="Verifiziert">✓</b>':''}</div><div class="ec-mp-rows">${row('Nickname',target.nickname)}${visible(target,'name',isFriend)?row('Vorname',target.first_name):''}${visible(target,'name',isFriend)?row('Nachname',target.last_name):''}${visible(target,'birth_date',isFriend)?row('Geburtsdatum',date(target.birth_date)):''}${visible(target,'birth_date',isFriend)?row('Alter',age(target.birth_date)):''}${visible(target,'location',isFriend)?row('Wohnort',target.location):''}${row('Heimatregion',home)}</div>`;
    card.append(left,data);
    root.insertBefore(card,hero);
    hero.hidden=true;

    const actions=document.createElement('div');actions.className='ec-mp-actions';
    const sourceActions=root.querySelector('.member-profile-actions');
    const admin=root.querySelector('.member-admin-tools');

    if(admin){
      admin.classList.add('ec-mp-admin-panel');admin.hidden=true;
      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.className='ec-mp-admin-toggle';
      toggle.textContent='Admin Tools';
      toggle.onclick=()=>{admin.hidden=!admin.hidden;toggle.classList.toggle('is-open',!admin.hidden)};
      actions.appendChild(toggle);
    }

    if(sourceActions){
      [...sourceActions.querySelectorAll('button')].forEach(button=>{cleanActionText(button);actions.appendChild(button)});
      sourceActions.hidden=true;
    }

    card.after(actions);
    if(admin)actions.after(admin);

    // Keep the single, structured "Das bin ich / Über mich" section rendered
    // by ProfileSections below the profile. This final renderer must not create
    // a second bio card.
    const interests=Array.isArray(target.interests)?target.interests.join(', '):target.interests;
    const info=[];if(interests&&visible(target,'interests',isFriend))info.push(row('Interessen',interests));if(target.website&&visible(target,'website',isFriend))info.push(row('Webseite',target.website));
    if(info.length){
      const more=document.createElement('div');more.className='ec-mp-more';
      more.innerHTML=`<section class="ec-mp-section"><span>WEITERE ANGABEN</span><h2>Profilinformationen</h2><div class="ec-mp-rows compact">${info.join('')}</div></section>`;
      const anchor=admin||actions;anchor.after(more);
    }

    root.dataset.ecMemberProfileFinal='1';
  }finally{
    delete root.dataset.ecMemberProfileBuilding;
  }
}
function run(){document.querySelectorAll('.member-profile-page:not(.public-profile-preview)').forEach(build)}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('DOMContentLoaded',run);run();
