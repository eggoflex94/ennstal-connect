import { supabase } from './supabaseClient';
import './member-poke.css';

let timer=null;
let currentUserId='';

async function me(force=false){
  if(currentUserId&&!force)return currentUserId;
  const {data:{user}}=await supabase.auth.getUser();
  currentUserId=user?.id||'';
  return currentUserId;
}

function notice(text){
  document.querySelector('.ec-poke-toast')?.remove();
  const node=document.createElement('div');
  node.className='ec-poke-toast';
  node.textContent=text;
  document.body.append(node);
  setTimeout(()=>node.remove(),3500);
}

async function mount(){
  const page=document.querySelector('.member-profile-page[data-profile-id]:not(.public-profile-preview)');
  document.querySelectorAll('.ec-member-poke-wrap').forEach((node)=>node.remove());
  if(!page||!supabase)return;

  const senderId=await me();
  const receiverId=page.dataset.profileId||'';
  if(!senderId||!receiverId||senderId===receiverId)return;

  const actions=page.querySelector('.member-profile-actions')||page.querySelector('.ec-mp-actions');
  if(!actions)return;

  const {count,error}=await supabase
    .from('member_pokes')
    .select('id',{count:'exact',head:true})
    .eq('sender_id',senderId)
    .eq('receiver_id',receiverId);
  if(error)return;

  const wrap=document.createElement('div');
  wrap.className='ec-member-poke-wrap';
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary-button ec-member-poke-button';
  button.innerHTML=`👋 Anstupsen <span>${count||0}×</span>`;
  button.title='Diese Person freundlich anstupsen';
  wrap.append(button);
  actions.append(wrap);

  button.onclick=async()=>{
    if(button.disabled)return;
    button.disabled=true;
    const {error:pokeError}=await supabase.from('member_pokes').insert({
      sender_id:senderId,
      receiver_id:receiverId
    });
    if(pokeError){
      notice(pokeError.message||'Anstupsen konnte nicht gesendet werden.');
      button.disabled=false;
      return;
    }
    const next=(count||0)+1;
    button.innerHTML=`👋 Angestupst <span>${next}×</span>`;
    notice(`Anstupser gesendet · insgesamt ${next}×`);
    window.dispatchEvent(new CustomEvent('ec:member-poked',{detail:{receiverId,count:next}}));
    setTimeout(()=>{button.disabled=false;button.innerHTML=`👋 Anstupsen <span>${next}×</span>`;},1600);
  };
}

function schedule(delay=80){clearTimeout(timer);timer=setTimeout(()=>void mount(),delay)}
window.addEventListener('ec:navigate',()=>schedule(100));
window.addEventListener('ec:open-profile',()=>schedule(100));
window.addEventListener('ec:member-poked',()=>schedule(80));
supabase.auth.onAuthStateChange(()=>{currentUserId='';schedule(100)});

const observer=new MutationObserver((mutations)=>{
  const relevant=mutations.some((mutation)=>[...mutation.addedNodes,...mutation.removedNodes].some((node)=>
    node?.nodeType===Node.ELEMENT_NODE&&(
      node.matches?.('.member-profile-page,.member-profile-actions,.ec-mp-actions')||
      node.querySelector?.('.member-profile-page,.member-profile-actions,.ec-mp-actions')
    )
  ));
  if(relevant)schedule(120);
});
observer.observe(document.documentElement,{childList:true,subtree:true});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(20),{once:true});
else schedule(20);

export {};
