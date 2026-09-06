import { supabase } from "./supabaseClient";

const ADMIN_ROLES = new Set(["HEAD_ADMIN", "ADMIN"]);
let canSeeLastActive = false;
let observer = null;

function ensurePrivacyStyle() {
  if (document.getElementById("ec-last-active-privacy-style")) return;
  const style = document.createElement("style");
  style.id = "ec-last-active-privacy-style";
  style.textContent = `
    html.ec-hide-last-active .member-status small,
    html.ec-hide-last-active .last-active,
    html.ec-hide-last-active .last-active-at,
    html.ec-hide-last-active [data-last-active],
    html.ec-hide-last-active time[data-last-active],
    html.ec-hide-last-active .ec-last-active-text {
      display: none !important;
      visibility: hidden !important;
    }
  `;
  document.head.appendChild(style);
}

function hideNode(el) {
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("display", "none", "important");
  el.style.setProperty("visibility", "hidden", "important");
}

function revealLastActive(root = document) {
  root.querySelectorAll?.(".member-status small,.last-active,.last-active-at,[data-last-active],time[data-last-active],.ec-last-active-text").forEach((el) => {
    el.hidden = false;
    el.removeAttribute("aria-hidden");
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
  });
}

function scrubLastActive(root = document) {
  if (canSeeLastActive) return;
  root.querySelectorAll?.(".member-status small,.last-active,.last-active-at,[data-last-active],time[data-last-active]").forEach(hideNode);
  root.querySelectorAll?.("small,span,p,div,time").forEach((el) => {
    if (el.children.length) return;
    const text = String(el.textContent || "").trim();
    if (/^(zuletzt aktiv|letzte aktivität|last active)\b/i.test(text)) {
      el.classList.add("ec-last-active-text");
      hideNode(el);
    }
  });
}

function observePrivacy() {
  observer?.disconnect();
  if (canSeeLastActive || !document.body) return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (parent) scrubLastActive(parent.parentElement || parent);
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scrubLastActive(node);
        else if (node.nodeType === Node.TEXT_NODE && node.parentElement) scrubLastActive(node.parentElement);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

async function applyLastActivePrivacy() {
  if (!supabase) return;
  ensurePrivacyStyle();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) console.error("Datenschutzrolle konnte nicht geladen werden:", error);
  canSeeLastActive = ADMIN_ROLES.has(String(profile?.role || "").toUpperCase());
  document.documentElement.classList.toggle("ec-can-see-last-active", canSeeLastActive);
  document.documentElement.classList.toggle("ec-hide-last-active", !canSeeLastActive);

  if (canSeeLastActive) {
    revealLastActive(document);
    requestAnimationFrame(() => revealLastActive(document));
  } else {
    scrubLastActive(document);
    requestAnimationFrame(() => scrubLastActive(document));
    setTimeout(() => scrubLastActive(document), 250);
    setTimeout(() => scrubLastActive(document), 1000);
  }
  observePrivacy();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyLastActivePrivacy, { once: true });
else applyLastActivePrivacy();

supabase?.auth?.onAuthStateChange?.(() => setTimeout(applyLastActivePrivacy, 0));
