import { supabase } from './supabaseClient';

let viewer=null;
let busy=false;

async function loadViewer(){
  if(!supabase)return null;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data}=await supabase.from('profiles').select('id,role').eq('id',user.id).maybeSingle();
  viewer=data||null;
  return viewer;
}

const isHeadAdmin=()=>String(viewer?.role||'').toUpperCase()==='HEAD_ADMIN';

function notice(text,ok=false){
  document.querySelector('.ec-business-admin-toast')?.remove();
  const node=document.createElement('div');
  node.className=`ec-business-admin-toast ${ok?'is-success':'is-error'}`;
  node.setAttribute('role','status');
  node.textContent=text;
  document.body.appendChild(node);
  setTimeout(()=>node.remove(),5000);
}

async function setJobsEnabled(profileId,enabled){
  if(busy||!isHeadAdmin()||!profileId)return;
  if(!window.confirm(enabled?'Stellenanzeigen für dieses Unternehmenskonto freischalten?':'Stellenanzeigen für dieses Unternehmenskonto wieder sperren?'))return;

  busy=true;
  try{
    const {error}=await supabase.rpc('admin_set_business_jobs_enabled',{
      p_user_id:profileId,
      p_enabled:enabled
    });
    if(error)throw error;
    notice(enabled?'Stellenanzeigen wurden freigeschaltet.':'Stellenanzeigen wurden gesperrt.',true);
    window.dispatchEvent(new CustomEvent('ec:business-jobs-changed',{detail:{profileId,enabled}}));
    window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
    setTimeout(()=>void ensureTool(),80);
  }catch(error){
    console.error('Stellenanzeigen-Freigabe konnte nicht geändert werden:',error);
    notice(`Stellenanzeigen konnten nicht ${enabled?'freigeschaltet':'gesperrt'} werden: ${error?.message||error}`);
  }finally{busy=false}
}

async function setBusiness(profileId,enabled){
  if(busy||!isHeadAdmin()||!profileId)return;
  let company=null;
  if(enabled){
    company=window.prompt('Firmen- oder Vereinsname:','');
    if(company===null||!company.trim())return;
  }else if(!window.confirm('Unternehmenskonto wirklich entfernen? Das Profil bleibt als normales Mitglied bestehen.'))return;

  busy=true;
  try{
    const {error}=await supabase.rpc('admin_set_business_account',{
      p_user_id:profileId,
      p_enabled:enabled,
      p_company_name:enabled?company.trim():null,
      p_company_description:null
    });
    if(error)throw error;

    const {data:check,error:checkError}=await supabase.from('profiles').select('account_badge,company_name').eq('id',profileId).maybeSingle();
    if(checkError)throw checkError;
    const effective=String(check?.account_badge||'').toUpperCase()==='BUSINESS';
    if(effective!==enabled)throw new Error('Die Änderung wurde von der Datenbank nicht übernommen.');

    notice(enabled?'Unternehmenskonto wurde vergeben.':'Unternehmenskonto wurde entfernt.',true);
    window.dispatchEvent(new CustomEvent('ec:business-account-changed',{detail:{profileId,enabled,companyName:check?.company_name||null}}));
    window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
    setTimeout(()=>void ensureTool(),80);
  }catch(error){
    console.error('Unternehmenskonto konnte nicht geändert werden:',error);
    notice(`Unternehmenskonto konnte nicht ${enabled?'vergeben':'entfernt'} werden: ${error?.message||error}`);
  }finally{busy=false}
}

async function ensureTool(){
  const page=document.querySelector('.member-profile-page[data-profile-id]');
  if(!page)return;
  if(!viewer)await loadViewer();
  if(!isHeadAdmin())return;
  const profileId=page.dataset.profileId;
  if(!profileId||profileId===viewer?.id)return;
  const tools=page.querySelector('.member-admin-tools>div');
  if(!tools)return;

  const {data:member}=await supabase.from('profiles').select('id,account_badge,business_jobs_enabled').eq('id',profileId).maybeSingle();
  if(!member)return;
  const business=String(member.account_badge||'').toUpperCase()==='BUSINESS';

  let button=tools.querySelector('.profile-business-tool,.ec-business-account-tool');
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.className='secondary-button ec-business-account-tool';
    tools.appendChild(button);
  }
  button.dataset.ecBusinessManaged='1';
  button.textContent=business?'Unternehmenskonto entfernen':'Unternehmenskonto vergeben';
  button.classList.toggle('danger-button',business);
  button.classList.toggle('secondary-button',!business);
  button.onclick=(event)=>{event.preventDefault();event.stopPropagation();void setBusiness(profileId,!business)};

  let jobsButton=tools.querySelector('.ec-business-jobs-tool');
  if(!business){
    jobsButton?.remove();
    return;
  }
  if(!jobsButton){
    jobsButton=document.createElement('button');
    jobsButton.type='button';
    jobsButton.className='secondary-button ec-business-jobs-tool';
    tools.appendChild(jobsButton);
  }
  const jobsEnabled=member.business_jobs_enabled===true;
  jobsButton.textContent=jobsEnabled?'Stellenanzeigen sperren':'Stellenanzeigen freischalten';
  jobsButton.classList.toggle('danger-button',jobsEnabled);
  jobsButton.classList.toggle('secondary-button',!jobsEnabled);
  jobsButton.onclick=(event)=>{event.preventDefault();event.stopPropagation();void setJobsEnabled(profileId,!jobsEnabled)};
}

function boot(){
  void loadViewer().then(ensureTool);
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecBusinessToolTimer);window.__ecBusinessToolTimer=setTimeout(()=>void ensureTool(),80)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:open-profile',()=>setTimeout(()=>void ensureTool(),120));
  window.addEventListener('ec:business-account-changed',()=>setTimeout(()=>void ensureTool(),80));
  window.addEventListener('ec:business-jobs-changed',()=>setTimeout(()=>void ensureTool(),80));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
