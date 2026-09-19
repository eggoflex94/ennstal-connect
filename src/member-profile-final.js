import { supabase } from './supabaseClient';

let regions=[];
let viewer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const age=d=>{if(!d)return'';const b=new Date(d);if(Number.isNaN(b.getTime()))return'';const n=new Date();let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};
const date=d=>{if(!d)return'';const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toLocaleDateString('de-AT')};
const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();
const viennaDate=(offsetDays=0)=>new Date(Date.now()+offsetDays*86400000).toLocaleDateString('en-CA',{timeZone:'Europe/Vienna'});
function activeInfo(target){const streak=Math.max(0,Number(target?.active_streak)||0);const last=String(target?.last_daily_reward_date||'').slice(0,10);const show=target?.show_activity_flame!==false;return{active:streak>0&&(last===viennaDate(0)||last===viennaDate(-1)),streak,days:Math.max(0,Number(target?.active_days_count)||0),show};}

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
async function photographerInfo(target){
  const cachedRegionIds=Array.isArray(target?.community_photographer_region_ids)?target.community_photographer_region_ids:[];
  if(target?.is_community_photographer){
    return{
      active:true,
      global:Boolean(target.community_photographer_global),
      regionIds:cachedRegionIds
    };
  }
  if(!target?.id)return{active:false,global:false,regionIds:[]};
  const {data,error}=await supabase
    .from('community_photographer_assignments')
    .select('scope,region_id,active')
    .eq('user_id',target.id)
    .eq('active',true);
  if(error)return{active:false,global:false,regionIds:[]};
  const active=data||[];
  return{
    active:active.length>0,
    global:active.some(item=>item.scope==='GLOBAL'),
    regionIds:active.filter(item=>item.scope==='REGIONAL'&&item.region_id).map(item=>item.region_id)
  };
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
function coverMarkup(target){
  const url=String(target?.profile_background||'');
  if(!url.startsWith('http'))return '';
  const x=Number(target?.profile_background_position_x??50);
  const y=Number(target?.profile_background_position_y??50);
  const zoom=Number(target?.profile_background_zoom??1);
  const overlay=Number(target?.profile_background_overlay??0.18);
  const panX=(x-50)*0.16;
  const panY=(y-50)*0.16;
  return `<div class="ec-mp-cover"><img src="${esc(url)}" alt="" style="object-position:50% 50%;transform:translate(${panX}%, ${panY}%) scale(${zoom});transform-origin:50% 50%"><span class="ec-mp-cover-shade" style="--ec-cover-overlay:${overlay}"></span></div>`;
}
function cleanActionText(button){
  const t=(button.textContent||'').replace(/[💬🤝♥✓⏳🚫🚩⚠🔓🔒🟢★✕↩⚙]/g,'').replace(/\s+/g,' ').trim();
  if(t)button.textContent=t;
  button.classList.add('ec-mp-action');
}
function cleanProfileNoise(root){
  root.querySelectorAll(':scope > .profile-visible-details').forEach(node=>node.remove());
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
  root.querySelectorAll('.member-profile-hero .member-profile-bio').forEach(node=>{node.hidden=true});
  document.querySelectorAll('.toast,[role="alert"]').forEach(node=>{
    const text=String(node.textContent||'');
    if(/Profil gespeichert, aber .*protokolliert/i.test(text))node.remove();
  });
}
async function build(root){
  cleanProfileNoise(root);
  if(root.dataset.ecMemberProfileBuilding==='1')return;
  const hero=root.querySelector('.member-profile-hero');
  if(!hero)return;
  root.dataset.ecMemberProfileBuilding='1';
  try{
    await context();
    const target=await targetFor(root);if(!target)return;
    const photographer=await photographerInfo(target);

    const existingCard=root.querySelector(':scope > .ec-mp-card');
    if(root.dataset.ecMemberProfileFinal==='1'&&existingCard){
      const hasPhotographerRow=Boolean(existingCard.querySelector('.ec-mp-function-photographer'));
      const shouldHavePhotographerRow=photographer.active;
      if(hasPhotographerRow===shouldHavePhotographerRow)return;
      existingCard.remove();
      root.querySelector(':scope > .ec-mp-actions')?.remove();
      delete root.dataset.ecMemberProfileFinal;
    }
    const isFriend=await friendship(target.id);
    const avatar=hero.querySelector(':scope > img:not(.profile-bio-image)');
    const role=await functionInfo(target);
    const activity=activeInfo(target);
    const ownProfile=viewer?.id===target.id;
    const home=regions.find(r=>r.id===target.home_region_id)?.name||'';
    root.querySelectorAll(':scope > .ec-mp-card,:scope > .ec-mp-more,:scope > .ec-mp-actions,:scope > .profile-visible-details').forEach(node=>node.remove());
    root.dataset.ecTargetId=target.id;
    root.dataset.ecActivityFlameVisible=activity.show&&activity.active?'1':'0';
    root.classList.add('ec-member-profile-final');
    root.classList.toggle('ec-active-member-profile',activity.show&&activity.active);
    const card=document.createElement('section');card.className='ec-mp-card';
    if(String(target.profile_background||'').startsWith('http')){
      card.classList.add('has-profile-cover');
      card.insertAdjacentHTML('afterbegin',coverMarkup(target));
    }
    const left=document.createElement('div');left.className='ec-mp-left';
    const photoTheme=role.star==='/role-star-red.svg'?'admin':role.star==='/supporter-star.svg'?'supporter':role.star==='/role-star-blue.svg'?'business':'member';
    const photo=document.createElement('div');photo.className='ec-mp-photo';photo.dataset.roleTheme=photoTheme;if(avatar)photo.appendChild(avatar);left.appendChild(photo);
    const functionBox=document.createElement('div');functionBox.className='ec-mp-function';
    const roleMarkup=role.star?`<span class="ec-mp-function-role"><img class="ec-mp-role-star" src="${role.star}" alt="" aria-hidden="true"><strong>${esc(role.label)}</strong></span>`:`<span class="ec-mp-function-role"><strong>${esc(role.label)}</strong></span>`;
    const photographerRegionNames=photographer.regionIds.map(id=>regions.find(r=>r.id===id)?.name).filter(Boolean);
    const photographerScope=photographer.global
      ? 'Alle Regionen'
      : photographerRegionNames.length
        ? photographerRegionNames.join(', ')
        : 'Regional';
    const photographerMarkup=photographer.active
      ? `<span class="ec-mp-function-role ec-mp-function-photographer"><img class="ec-mp-function-camera" src="/community-photographer-camera.svg" alt="" aria-hidden="true"><span class="ec-mp-function-copy"><strong>Community-Fotograf</strong><small>${esc(photographerScope)}</small></span></span>`
      : '';
    const settingMarkup=ownProfile?`<label class="ec-activity-flame-setting"><input type="checkbox" data-activity-flame-toggle ${activity.show?'checked':''}><span>Aktivitätsflamme im Profil anzeigen</span></label>`:'';
    functionBox.innerHTML=`<span>Funktion</span>${roleMarkup}${photographerMarkup}${settingMarkup}`;
    left.appendChild(functionBox);
    const data=document.createElement('div');data.className='ec-mp-data';
    const realName=[target.first_name,target.last_name].filter(Boolean).join(' ');
    const activityRows=activity.show?`${activity.streak?row('Aktiv-Serie',`${activity.streak} Tag${activity.streak===1?'':'e'} 🔥`):''}${activity.days?row('Aktive Tage gesamt',String(activity.days)):''}`:'';
    const bioVisible=visible(target,'bio',isFriend)&&String(target.bio||'').trim();
    const bioFont=['modern','serif','handwritten'].includes(String(target.bio_font||''))?target.bio_font:'modern';
    const bioSize=['small','normal','large'].includes(String(target.bio_size||''))?target.bio_size:'normal';
    const bioColor=String(target.bio_color||'#1e3045');
    const bioMarkup=bioVisible?`<section class="ec-mp-about"><span>ÜBER MICH</span><p class="member-profile-bio ${esc(bioFont)} ${esc(bioSize)}" style="color:${esc(bioColor)}">${esc(target.bio)}</p>${target.bio_image_url?`<img src="${esc(target.bio_image_url)}" alt="Bild zum Über-mich-Bereich">`:''}</section>`:'';
    data.innerHTML=`<div class="ec-mp-data-head"><div><span>MITGLIEDSPROFIL</span><h1>${esc(target.nickname||realName||'Mitglied')}</h1></div>${target.is_verified?'<b class="ec-mp-verified" title="Verifiziert">✓</b>':''}</div><div class="ec-mp-rows">${row('Nickname',target.nickname)}${visible(target,'name',isFriend)?row('Vorname',target.first_name):''}${visible(target,'name',isFriend)?row('Nachname',target.last_name):''}${visible(target,'birth_date',isFriend)?row('Geburtsdatum',date(target.birth_date)):''}${visible(target,'birth_date',isFriend)?row('Alter',age(target.birth_date)):''}${row('Heimatregion',home)}${activityRows}</div>${bioMarkup}`;
    card.append(left,data);
    root.insertBefore(card,hero);
    hero.hidden=true;
    if(ownProfile){
      const toggle=functionBox.querySelector('[data-activity-flame-toggle]');
      if(toggle)toggle.addEventListener('change',async()=>{
        toggle.disabled=true;
        const value=toggle.checked;
        const {error}=await supabase.from('profiles').update({show_activity_flame:value}).eq('id',target.id);
        if(error){toggle.checked=!value;alert(error.message||'Einstellung konnte nicht gespeichert werden.');toggle.disabled=false;return;}
        viewer={...viewer,show_activity_flame:value};
        delete root.dataset.ecMemberProfileFinal;
        root.querySelector(':scope > .ec-mp-card')?.remove();
        await build(root);
      });
    }
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

let queued=false;
let observer=null;
let observedRoot=null;
let observerRetry=0;
function mutationTouchesMemberProfile(mutation){
  const target=mutation.target?.nodeType===Node.ELEMENT_NODE?mutation.target:null;
  if(target?.closest?.('.member-profile-page'))return true;
  return [...mutation.addedNodes,...mutation.removedNodes].some(node=>node.nodeType===Node.ELEMENT_NODE&&(node.matches?.('.member-profile-page')||node.querySelector?.('.member-profile-page')));
}
function desiredObserverRoot(){return document.querySelector('.content-root')||document.querySelector('.modern-main')}
function startObserver(){
  const root=desiredObserverRoot();
  if(!root){
    if(!observerRetry)observerRetry=window.setTimeout(()=>{observerRetry=0;startObserver()},250);
    return;
  }
  if(observer&&observedRoot===root)return;
  observer?.disconnect();
  observer=new MutationObserver(mutations=>{
    if(!mutations.some(mutationTouchesMemberProfile)||queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;run()});
  });
  observer.observe(root,{childList:true,subtree:true});
  observedRoot=root;
}
function refresh(){run();startObserver()}
function start(){refresh()}
window.addEventListener('ec:navigate',refresh);
window.addEventListener('DOMContentLoaded',start,{once:true});
start();
