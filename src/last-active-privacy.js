import { supabase } from "./supabaseClient";

const ADMIN_ROLES = new Set(["HEAD_ADMIN", "ADMIN"]);
let canSeeLastActive = false;
let observer = null;

function scrubLastActive(root = document) {
  if (canSeeLastActive) return;

  root.querySelectorAll?.(".member-status small,.last-active,.last-active-at,[data-last-active],time[data-last-active]").forEach((el) => {
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  });

  root.querySelectorAll?.("small,span,p,div,time").forEach((el) => {
    if (el.children.length) return;
    const text = String(el.textContent || "").trim();
    if (/^(zuletzt aktiv|letzte aktivität|last active)\b/i.test(text)) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
  });
}

async function applyLastActivePrivacy() {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  canSeeLastActive = ADMIN_ROLES.has(String(profile?.role || "").toUpperCase());
  document.documentElement.classList.toggle("ec-can-see-last-active", canSeeLastActive);
  document.documentElement.classList.toggle("ec-hide-last-active", !canSeeLastActive);

  if (!canSeeLastActive) scrubLastActive(document);

  observer?.disconnect();
  if (!canSeeLastActive) {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) scrubLastActive(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyLastActivePrivacy, { once: true });
} else {
  applyLastActivePrivacy();
}

supabase?.auth?.onAuthStateChange?.(() => setTimeout(applyLastActivePrivacy, 0));
