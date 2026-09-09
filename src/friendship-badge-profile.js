const FRIENDSHIP_BUTTON_SELECTOR = '.member-profile-actions button, .profile-actions button';

function markFriendshipButtons(root = document) {
  root.querySelectorAll(FRIENDSHIP_BUTTON_SELECTOR).forEach((button) => {
    const accepted = /\bBefreundet\b/i.test(String(button.textContent || ''));
    button.classList.toggle('ec-profile-friendship-accepted', accepted);
    if (accepted) {
      const firstText = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (firstText) firstText.textContent = firstText.textContent.replace(/^\s*♥\s*/, '');
    }
  });
}

function bootFriendshipBadge() {
  markFriendshipButtons();
  const observer = new MutationObserver(() => {
    clearTimeout(window.__ecFriendshipBadgeProfileTimer);
    window.__ecFriendshipBadgeProfileTimer = setTimeout(() => markFriendshipButtons(), 25);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootFriendshipBadge, { once: true });
} else {
  bootFriendshipBadge();
}
