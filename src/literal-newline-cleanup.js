// Remove visible literal "\\n" artifacts without deleting DOM nodes.
// Keeping the text node in place avoids desynchronizing React's DOM ownership.
function clearLiteralNewlineText(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (String(node.nodeValue || "").trim() === "\\n") {
      node.nodeValue = "";
    }
    node = walker.nextNode();
  }
}

let scheduled = false;
function scheduleLiteralNewlineCleanup() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    clearLiteralNewlineText();
  });
}

function bootLiteralNewlineCleanup() {
  clearLiteralNewlineText();
  const observer = new MutationObserver(scheduleLiteralNewlineCleanup);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  window.addEventListener("ec:navigate", scheduleLiteralNewlineCleanup);
  window.addEventListener("ec:region-change", scheduleLiteralNewlineCleanup);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootLiteralNewlineCleanup, { once: true });
} else {
  bootLiteralNewlineCleanup();
}
