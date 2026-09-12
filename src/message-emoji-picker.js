import './head-admin-message-read-receipts.js';

const EMOJIS = ['😀','😃','😄','😁','😊','🙂','😉','😍','🥰','😘','😎','🤗','🤔','😅','😂','🤣','😢','😭','😡','👍','👎','👏','🙌','🙏','💪','❤️','💙','💚','💛','🧡','💜','🔥','🎉','✅','⭐','🍀','☕','🍻','🚗','🏔️'];

let toggle = null;
let panel = null;
let activeTextarea = null;
let scheduled = false;
let observer = null;
let observedRoot = null;
let observerRetry = 0;

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

function closePanel() {
  panel?.remove();
  panel = null;
  toggle?.setAttribute('aria-expanded', 'false');
}

function findTextarea() {
  return document.querySelector('.ec-chat-modern-form textarea[name="message"], .message-form textarea');
}

function ensureToggle() {
  if (toggle?.isConnected) return toggle;
  toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ec-message-emoji-portal-toggle';
  toggle.textContent = '😊';
  toggle.title = 'Smileys und Emojis';
  toggle.setAttribute('aria-label', 'Smileys und Emojis öffnen');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.hidden = true;
  toggle.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeTextarea?.isConnected) return;
    if (panel?.isConnected) return closePanel();
    panel = document.createElement('div');
    panel.className = 'ec-message-emoji-portal-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Emoji auswählen');
    EMOJIS.forEach((emoji) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = emoji;
      button.setAttribute('aria-label', `Emoji ${emoji}`);
      button.onclick = (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        insertEmoji(activeTextarea, emoji);
      };
      panel.appendChild(button);
    });
    document.body.appendChild(panel);
    toggle.setAttribute('aria-expanded', 'true');
    positionPortal();
  };
  document.body.appendChild(toggle);
  return toggle;
}

function positionPortal() {
  const textarea = findTextarea();
  const button = ensureToggle();
  if (!textarea) {
    activeTextarea = null;
    button.hidden = true;
    closePanel();
    return;
  }
  activeTextarea = textarea;
  button.hidden = false;
  const rect = textarea.getBoundingClientRect();
  const size = 42;
  const left = Math.max(8, Math.min(window.innerWidth - size - 8, rect.left + 8));
  const top = Math.max(8, Math.min(window.innerHeight - size - 8, rect.bottom - size - 8));
  button.style.left = `${Math.round(left)}px`;
  button.style.top = `${Math.round(top)}px`;
  textarea.style.paddingLeft = '58px';
  if (panel?.isConnected) {
    const panelWidth = Math.min(340, window.innerWidth - 24);
    panel.style.width = `${panelWidth}px`;
    const panelLeft = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, rect.left));
    const preferredTop = top - 250 - 8;
    const panelTop = preferredTop > 8 ? preferredTop : Math.min(window.innerHeight - 260, rect.bottom + 8);
    panel.style.left = `${Math.round(panelLeft)}px`;
    panel.style.top = `${Math.max(8, Math.round(panelTop))}px`;
  }
}

function schedulePosition() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    positionPortal();
  });
}

function desiredObserverRoot() {
  return document.querySelector('.content-root') || document.querySelector('.modern-main');
}

function attachObserver() {
  const root = desiredObserverRoot();
  if (!root) {
    if (!observerRetry) observerRetry = window.setTimeout(() => { observerRetry = 0; attachObserver(); }, 250);
    return;
  }
  if (root === observedRoot && observer) return;
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.message-form, .ec-chat-modern-form, .chat-box, textarea') || node.querySelector?.('.message-form, .ec-chat-modern-form, .chat-box'))));
    if (relevant) schedulePosition();
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

function refresh() {
  attachObserver();
  schedulePosition();
}

function start() {
  ensureToggle();
  refresh();
}

window.addEventListener('ec:navigate', refresh);
window.addEventListener('resize', schedulePosition, { passive: true });
window.addEventListener('scroll', schedulePosition, { passive: true, capture: true });
window.addEventListener('focus', schedulePosition);
document.addEventListener('click', (event) => {
  if (event.target === toggle || toggle?.contains(event.target) || panel?.contains(event.target)) return;
  closePanel();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel(); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
