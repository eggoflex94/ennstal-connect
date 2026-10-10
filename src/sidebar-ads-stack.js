import { supabase } from "./supabaseClient";

// Display all active global advertisements in a fixed vertical list.
// The existing carousel remains mounted for compatibility, but is visually replaced.
let ads = [];
let busy = false;
let queued = false;
function card(ad) {
  const article = document.createElement("article");
  article.className = "ec-stacked-ad-card";
  const header = document.createElement("div");
  header.className = "ec-stacked-ad-heading";
  const badge = document.createElement("strong"); badge.textContent = "WERBUNG";
  const scope = document.createElement("span"); scope.textContent = "Global";
  header.append(badge, scope); article.append(header);
  const url = (() => { try { const u = new URL(ad.link_url); return ["http:","https:"].includes(u.protocol) ? u.href : null; } catch { return null; } })();
  const body = document.createElement(url ? "a" : "div");
  if (url) { body.href = url; body.target = "_blank"; body.rel = "noopener noreferrer"; }
  if (ad.image_url) {
    const image = document.createElement("img");
    image.src = ad.image_url; image.alt = ad.title || "Werbung"; image.loading = "lazy";
    body.append(image);
  }
  const title = document.createElement("strong"); title.textContent = ad.title || "Werbung"; body.append(title);
  if (ad.body) { const p = document.createElement("p"); p.textContent = ad.body; body.append(p); }
  article.append(body);
  return article;
}
function mount() {
  const dock = document.querySelector(".ec-right-dock");
  if (!dock) return;
  const originals = dock.querySelectorAll(".ec-sidebar-banners, .ec-sidebar-ads");
  let list = dock.querySelector(":scope > .ec-stacked-ads");
  if (!ads.length) {
    list?.remove();
    originals.forEach(el => el.classList.add("ec-legacy-ads-hidden"));
    return;
  }
  if (!list) {
    list = document.createElement("section");
    list.className = "ec-stacked-ads";
    list.setAttribute("aria-label", "Werbungen untereinander");
    dock.appendChild(list);
  }
  const signature = JSON.stringify(ads);
  if (list.dataset.signature !== signature) {
    list.replaceChildren(...ads.map(card));
    list.dataset.signature = signature;
  }
  if (dock.lastElementChild !== list) dock.appendChild(list);
  originals.forEach(el => el.classList.add("ec-legacy-ads-hidden"));
}
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; mount(); });
}
async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const { data, error } = await supabase.from("community_ads")
      .select("id,title,body,image_url,link_url,region_id")
      .eq("is_active", true).is("region_id", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    ads = data || [];
    schedule();
  } catch (error) {
    console.warn("Werbungen konnten nicht geladen werden:", error);
  } finally { busy = false; }
}
new MutationObserver(schedule).observe(document.documentElement, {childList:true,subtree:true});
void refresh();
window.addEventListener("focus", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
