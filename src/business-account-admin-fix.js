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

    /* Verify the effective value instead of pretending success when an old RPC did nothing. */
    const {data:check,error:checkError}=await supabase.from('profiles').select('account_badge,company_name').eq('id',profileId).maybeSingle();
    if(checkError)throw checkError;
    const effective=String(check?.account_badge||'').toUpperCase()==='BUSINESS';
    if(effective!==enabled)throw new Error('Die Änderung wurde von der Datenbank nicht übernommen.');

    notice(enabled?'Unternehmenskonto wurde vergeben.':'Unternehmenskonto wurde entfernt.',true);
    window.dispatchEvent(new CustomEvent('ec:business-account-changed',{detail:{profileId,enabled}}));
    setTimeout(()=>window.location.reload(),650);
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

  const {data:member}=await supabase.from('profiles').select('id,account_badge').eq('id',profileId).maybeSingle();
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
}

function boot(){
  void loadViewer().then(ensureTool);
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecBusinessToolTimer);window.__ecBusinessToolTimer=setTimeout(()=>void ensureTool(),80)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:open-profile',()=>setTimeout(()=>void ensureTool(),120));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
