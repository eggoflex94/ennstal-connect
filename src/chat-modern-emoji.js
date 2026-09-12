import './chat-modern-emoji.css';

const EMOJIS = ['😀','😃','😄','😁','😂','🤣','😊','😍','🥰','😘','😎','🤩','🥳','🙂','😉','😇','🤗','🤔','😅','😢','😭','😡','👍','👎','👏','🙌','🙏','💪','🤝','❤️','💚','💛','🔥','✨','🎉','✅','💯','📷','🌟','🍀'];
let observer = null;
let observedRoot = null;

function insertEmoji(textarea, emoji) {
  const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
  const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start;
  textarea.setRangeText(emoji, start, end, 'end');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

function closeOtherPickers(except = null) {
  document.querySelectorAll('.ec-chat-emoji-picker:not([hidden])').forEach((picker) => {
    if (picker !== except) picker.hidden = true;
  });
}

function enhance(form) {
  if (!form || form.dataset.ecEmojiReady === '1') return;
  const composer = form.querySelector('.ec-chat-modern-composer');
  const textarea = form.elements?.message || composer?.querySelector('textarea');
  if (!composer || !textarea) return;
  form.dataset.ecEmojiReady = '1';

  const wrap = document.createElement('div');
  wrap.className = 'ec-chat-emoji-wrap';
  wrap.innerHTML = `<button type="button" class="ec-chat-emoji-button" aria-label="Smileys öffnen" aria-expanded="false" title="Smiley einfügen">☺</button><div class="ec-chat-emoji-picker" role="dialog" aria-label="Smileys" hidden>${EMOJIS.map((emoji) => `<button type="button" class="ec-chat-emoji-option" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')}</div>`;
  const imageButton = composer.querySelector('.ec-chat-modern-image-button');
  composer.insertBefore(wrap, imageButton || composer.querySelector('.ec-chat-modern-send'));

  const trigger = wrap.querySelector('.ec-chat-emoji-button');
  const picker = wrap.querySelector('.ec-chat-emoji-picker');
  trigger.addEventListener('click', () => {
    const opening = picker.hidden;
    closeOtherPickers(opening ? picker : null);
    picker.hidden = !opening;
    trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
  });
  picker.querySelectorAll('[data-emoji]').forEach((button) => button.addEventListener('click', () => {
    insertEmoji(textarea, button.dataset.emoji || '');
    picker.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }));
}

function scan(scope = document) {
  if (scope?.matches?.('.ec-chat-modern-form')) enhance(scope);
  scope?.querySelectorAll?.('.ec-chat-modern-form').forEach(enhance);
}

function attach() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main') || document.body;
  scan(root);
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node?.nodeType === Node.ELEMENT_NODE) scan(node);
    }));
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

document.addEventListener('click', (event) => {
  if (!event.target?.closest?.('.ec-chat-emoji-wrap')) closeOtherPickers();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeOtherPickers();
});
window.addEventListener('ec:navigate', attach);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
else attach();
