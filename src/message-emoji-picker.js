const EMOJIS = ['😀','😃','😄','😁','😊','🙂','😉','😍','🥰','😘','😎','🤗','🤔','😅','😂','🤣','😢','😭','😡','👍','👎','👏','🙌','🙏','💪','❤️','💙','💚','💛','🧡','💜','🔥','🎉','✅','⭐','🍀','☕','🍻','🚗','🏔️'];
let timer = null;
let observer = null;

function closePicker(form) {
  form?.querySelector('.ec-message-emoji-panel')?.remove();
  form?.querySelector('.ec-message-emoji-toggle')?.setAttribute('aria-expanded', 'false');
}

function setTextareaValue(textarea, value) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertEmoji(textarea, emoji) {
  const value = textarea.value || '';
  const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : value.length;
  const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
  const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
  setTextareaValue(textarea, next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + emoji.length;
    textarea.setSelectionRange(pos, pos);
  });
}

function mountEmojiPicker() {
  const form = document.querySelector('.message-form');
  const textarea = form?.querySelector('textarea');
  if (!form || !textarea) return false;

  const existingToggle = form.querySelector('.ec-message-emoji-toggle');
  if (existingToggle) {
    form.dataset.ecEmojiReady = '1';
    form.classList.add('ec-message-form-enhanced');
    return true;
  }

  // React can keep the form node but replace its children. Never trust the
  // old data flag unless the actual button still exists.
  delete form.dataset.ecEmojiReady;
  form.classList.add('ec-message-form-enhanced');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ec-message-emoji-toggle';
  toggle.textContent = '😊';
  toggle.title = 'Smileys und Emojis';
  toggle.setAttribute('aria-label', 'Smileys und Emojis öffnen');
  toggle.setAttribute('aria-expanded', 'false');

  toggle.onclick = () => {
    const existing = form.querySelector('.ec-message-emoji-panel');
    if (existing) return closePicker(form);
    const panel = document.createElement('div');
    panel.className = 'ec-message-emoji-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Emoji auswählen');
    EMOJIS.forEach((emoji) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = emoji;
      button.setAttribute('aria-label', `Emoji ${emoji}`);
      button.onclick = () => insertEmoji(textarea, emoji);
      panel.appendChild(button);
    });
    form.appendChild(panel);
    toggle.setAttribute('aria-expanded', 'true');
  };

  textarea.insertAdjacentElement('beforebegin', toggle);
  form.dataset.ecEmojiReady = '1';
  return true;
}

function schedule(delay = 20) {
  clearTimeout(timer);
  timer = setTimeout(mountEmojiPicker, delay);
}

function startObserver() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main') || document.getElementById('root');
  if (!root || observer) return;
  observer = new MutationObserver(() => {
    const form = document.querySelector('.message-form');
    if (form && !form.querySelector('.ec-message-emoji-toggle')) schedule(0);
  });
  observer.observe(root, { childList: true, subtree: true });
  schedule(0);
}

window.addEventListener('ec:navigate', () => schedule(20));
window.addEventListener('focus', () => schedule(40));
document.addEventListener('click', (event) => {
  const form = document.querySelector('.message-form.ec-message-form-enhanced');
  if (!form || form.contains(event.target)) return;
  closePicker(form);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
else startObserver();
