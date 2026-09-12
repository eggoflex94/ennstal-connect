const EMOJIS = ['😀','😃','😄','😁','😊','🙂','😉','😍','🥰','😘','😎','🤗','🤔','😅','😂','🤣','😢','😭','😡','👍','👎','👏','🙌','🙏','💪','❤️','💙','💚','💛','🧡','💜','🔥','🎉','✅','⭐','🍀','☕','🍻','🚗','🏔️'];
let timer = null;

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
  if (!form || !textarea || form.dataset.ecEmojiReady === '1') return;
  form.dataset.ecEmojiReady = '1';
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
}

function schedule(delay = 30) {
  clearTimeout(timer);
  timer = setTimeout(mountEmojiPicker, delay);
}

window.addEventListener('ec:navigate', () => schedule(20));
window.addEventListener('focus', () => schedule(50));
document.addEventListener('click', (event) => {
  const form = document.querySelector('.message-form.ec-message-form-enhanced');
  if (!form || form.contains(event.target)) return;
  closePicker(form);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);
