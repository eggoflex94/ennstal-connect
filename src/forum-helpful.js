import { supabase } from './supabaseClient';

let timer = null;
let mutationObserver = null;
let cachedUserId = null;

async function currentUserId(){
  if(cachedUserId) return cachedUserId;
  const {data:{user}} = await supabase.auth.getUser();
  cachedUserId = user?.id || null;
  return cachedUserId;
}

async function loadMarks(replyIds){
  if(!replyIds.length) return [];
  const {data,error} = await supabase
    .from('forum_reply_helpful')
    .select('reply_id,user_id,created_at')
    .in('reply_id',replyIds);
  if(error) return [];
  return data || [];
}

function summarize(marks){
  const counts = new Map();
  const mine = new Set();
  for(const mark of marks){
    counts.set(mark.reply_id,(counts.get(mark.reply_id)||0)+1);
    if(mark.user_id===cachedUserId) mine.add(mark.reply_id);
  }
  return {counts,mine};
}

function label(count,active){
  if(active) return count===1 ? 'Hilfreich · 1' : `Hilfreich · ${count}`;
  return count ? `Hilfreich · ${count}` : 'Hilfreich';
}

async function toggle(replyId,active){
  const userId = await currentUserId();
  if(!userId) return;
  if(active){
    await supabase.from('forum_reply_helpful').delete().eq('reply_id',replyId).eq('user_id',userId);
  }else{
    await supabase.from('forum_reply_helpful').insert({reply_id:replyId,user_id:userId});
  }
  schedule(80);
}

async function paint(){
  if(!supabase) return;
  const userId = await currentUserId();
  if(!userId) return;

  const replies=[...document.querySelectorAll('.forum-reply[data-reply-id]')];
  if(!replies.length) return;

  const replyIds=[...new Set(replies.map(node=>node.dataset.replyId).filter(Boolean))];
  const marks=await loadMarks(replyIds);
  const {counts,mine}=summarize(marks);

  for(const reply of replies){
    const replyId=reply.dataset.replyId;
    if(!replyId) continue;
    const authorId=reply.dataset.authorId || '';
    let bar=reply.querySelector('.ec-forum-helpful-bar');
    if(!bar){
      bar=document.createElement('div');
      bar.className='ec-forum-helpful-bar';
      reply.appendChild(bar);
    }

    const count=counts.get(replyId)||0;
    const active=mine.has(replyId);
    const ownReply=authorId===userId;

    let button=bar.querySelector('.ec-forum-helpful-button');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='ec-forum-helpful-button';
      bar.appendChild(button);
    }

    button.dataset.active=active?'1':'0';
    button.disabled=ownReply;
    button.setAttribute('aria-pressed',active?'true':'false');
    button.title=ownReply ? 'Eigene Antworten können nicht als hilfreich markiert werden.' : 'Diese Antwort als hilfreich markieren';
    button.innerHTML = '<span aria-hidden="true">♡</span><b>' + label(count,active) + '</b>';

    if(!ownReply){
      button.onclick=()=>void toggle(replyId,active);
    }else{
      button.onclick=null;
    }

    let note=bar.querySelector('.ec-forum-helpful-note');
    if(count>=3){
      if(!note){
        note=document.createElement('span');
        note.className='ec-forum-helpful-note';
        bar.appendChild(note);
      }
      note.textContent='Von der Community besonders hilfreich';
    }else{
      note?.remove();
    }
  }
}

function schedule(delay=120){
  clearTimeout(timer);
  timer=setTimeout(()=>void paint(),delay);
}

function startObserver(){
  if(mutationObserver || !document.body) return;
  mutationObserver=new MutationObserver(()=>schedule(120));
  mutationObserver.observe(document.body,{childList:true,subtree:true});
}

window.addEventListener('ec:navigate',()=>schedule(180));
window.addEventListener('focus',()=>schedule(80));
supabase?.auth?.onAuthStateChange?.((event,session)=>{
  cachedUserId=session?.user?.id||null;
  if(event==='SIGNED_OUT') cachedUserId=null;
  schedule(120);
});

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{startObserver();schedule(260)},{once:true});
}else{
  startObserver();
  schedule(260);
}
