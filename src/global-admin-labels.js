let queued = false;

const exact = new Map([
  ['Community Admin', 'Global Admin'],
  ['★ Community Admin', '★ Global Admin'],
  ['Als Community Admin setzen', 'Als Global Admin setzen']
]);

function normalizeText(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,textarea,[contenteditable="true"],.message-bubble,.chat-message,.ec-chat-modern-bubble')) return NodeFilter.FILTER_REJECT;
      return node.nodeValue?.includes('Community Admin') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const value = String(node.nodeValue || '');
    node.nodeValue = exact.get(value.trim()) ? value.replace(value.trim(), exact.get(value.trim())) : value.replaceAll('Community Admin', 'Global Admin');
  });
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    normalizeText();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener('ec:navigate', schedule);
window.addEventListener('ec:open-profile', schedule);

export {};
