const EMOJIS=['😀','😃','😄','😁','😊','😉','😍','🥰','😘','😎','🤗','🤔','😂','🤣','😅','🙈','👍','👎','👏','🙌','🙏','💪','🤝','❤️','💚','💙','💛','🧡','💜','🔥','✨','🎉','🎈','✅','❗','❓','☕','🍻','🏔️','🚗','🚲','🥾','🌲','🌞','🌧️'];
let timer=0;

function closePickers(except=null){
  document.querySelectorAll('.ec-chat-emoji-picker').forEach(p=>{if(p!==except)p.remove();});
}

function insertEmoji(textarea,emoji){
  const start=Number.isInteger(textarea.selectionStart)?textarea.selectionStart:textarea.value.length;
  const end=Number.isInteger(textarea.selectionEnd)?textarea.selectionEnd:start;
  const before=textarea.value.slice(0,start);
  const after=textarea.value.slice(end);
  textarea.value=`${before}${emoji}${after}`;
  const caret=start+emoji.length;
  textarea.focus();
  textarea.setSelectionRange?.(caret,caret);
  textarea.dispatchEvent(new Event('input',{bubbles:true}));
}

function enhanceForm(form){
  if(!form||form.dataset.ecEmojiReady==='1')return;
  const textarea=form.querySelector('textarea[name="message"],textarea');
  const send=form.querySelector('.ec-chat-modern-send,button[type="submit"]');
  if(!textarea||!send)return;
  form.dataset.ecEmojiReady='1';

  const actions=document.createElement('div');
  actions.className='ec-chat-compose-actions';
  const trigger=document.createElement('button');
  trigger.type='button';
  trigger.className='ec-chat-emoji-trigger';
  trigger.textContent='😊';
  trigger.title='Smileys einfügen';
  trigger.setAttribute('aria-label','Smileys einfügen');
  actions.append(trigger);
  form.insertBefore(actions,send);

  trigger.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    const existing=form.querySelector('.ec-chat-emoji-picker');
    if(existing){existing.remove();return;}
    closePickers();
    const picker=document.createElement('div');
    picker.className='ec-chat-emoji-picker';
    picker.setAttribute('role','dialog');
    picker.setAttribute('aria-label','Smileys auswählen');
    EMOJIS.forEach(emoji=>{
      const button=document.createElement('button');
      button.type='button';
      button.textContent=emoji;
      button.setAttribute('aria-label',`Emoji ${emoji}`);
      button.addEventListener('click',()=>insertEmoji(textarea,emoji));
      picker.append(button);
    });
    form.append(picker);
  });
}

function sync(){
  document.querySelectorAll('.ec-chat-modern-form,.message-form').forEach(enhanceForm);
}

function schedule(delay=40){clearTimeout(timer);timer=setTimeout(sync,delay);}
new MutationObserver(records=>{
  if(records.every(record=>record.target?.closest?.('.ec-chat-emoji-picker')))return;
  schedule();
}).observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('click',event=>{
  if(!event.target.closest?.('.ec-chat-emoji-trigger,.ec-chat-emoji-picker'))closePickers();
});
window.addEventListener('ec:navigate',()=>schedule(20));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(0),{once:true});else schedule(0);

export {};
