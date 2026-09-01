import { supabase } from "./supabaseClient";

const roleIcon = (role) => role === "HEAD_ADMIN" ? "♛" : role === "ADMIN" ? "★" : role === "SUPPORTER" ? "★" : "";
const roleClass = (role) => String(role || "MEMBER").toLowerCase().replace("_", "-");

async function sessionUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}

async function addHomepageUpload() {
  const forms = [...document.querySelectorAll("form")].filter(f => f.querySelector('input[name="image_url"]'));
  const user = await sessionUser();
  if (!user) return;
  for (const form of forms) {
    if (form.querySelector(".ec-home-direct-upload")) continue;
    const urlInput = form.querySelector('input[name="image_url"]');
    if (!urlInput) continue;
    const wrap = document.createElement("div");
    wrap.className = "ec-home-direct-upload";
    wrap.innerHTML = `<label><span>🖼️ Bild vom Computer oder Handy</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif"><small>JPG, PNG, WebP oder GIF · maximal 5 MB</small></label><div class="ec-home-upload-status" aria-live="polite"></div><img class="ec-home-upload-preview" alt="Bildvorschau" hidden>`;
    urlInput.closest("label")?.insertAdjacentElement("afterend", wrap) || urlInput.parentElement?.insertAdjacentElement("afterend", wrap);
    const input = wrap.querySelector("input[type=file]");
    const status = wrap.querySelector(".ec-home-upload-status");
    const preview = wrap.querySelector(".ec-home-upload-preview");
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { status.textContent = "Bitte JPG, PNG, WebP oder GIF auswählen."; return; }
      if (file.size > 5 * 1024 * 1024) { status.textContent = "Das Bild darf maximal 5 MB groß sein."; return; }
      status.textContent = "Bild wird hochgeladen …";
      const localUrl = URL.createObjectURL(file); preview.src = localUrl; preview.hidden = false;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/homepage/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("community-media").upload(path, file, { upsert:false, cacheControl:"3600", contentType:file.type });
      if (error) { status.textContent = `Upload fehlgeschlagen: ${error.message}`; return; }
      const { data } = supabase.storage.from("community-media").getPublicUrl(path);
      urlInput.value = data.publicUrl;
      urlInput.dispatchEvent(new Event("input", { bubbles:true }));
      urlInput.dispatchEvent(new Event("change", { bubbles:true }));
      status.textContent = "✓ Bild übernommen. Jetzt Rahmen veröffentlichen.";
    });
  }
}

async function decorateHomepageFrames() {
  const { data: sections } = await supabase.from("homepage_sections").select("id,title,description,image_url,created_by,created_at").eq("is_visible", true).order("sort_order", { ascending:true });
  if (!sections?.length) return;
  const ids = [...new Set(sections.map(s => s.created_by).filter(Boolean))];
  let authors = [];
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id,nickname,role,avatar_url").in("id", ids);
    authors = data || [];
  }
  for (const section of sections) {
    const title = String(section.title || "").trim();
    if (!title) continue;
    const nodes = [...document.querySelectorAll("main h1,main h2,main h3,main h4,main strong")].filter(n => (n.textContent || "").trim() === title);
    const heading = nodes[0];
    if (!heading) continue;
    let card = heading;
    for (let i=0;i<5 && card.parentElement;i++) {
      card = card.parentElement;
      if (card.querySelector?.(`img[src="${CSS.escape(section.image_url || "__none__")}"]`)) break;
    }
    if (card.querySelector?.(".ec-frame-author")) continue;
    const author = authors.find(a => a.id === section.created_by);
    const name = author?.nickname || "Ennstal Connect";
    const role = author?.role || "MEMBER";
    const badge = document.createElement("div");
    badge.className = `ec-frame-author ${roleClass(role)}`;
    badge.innerHTML = `<span class="ec-frame-author-icon">${roleIcon(role)}</span><span>Erstellt von ${name}</span>`;
    card.insertBefore(badge, card.firstChild);
  }
}

let timer;
const run = () => { clearTimeout(timer); timer = setTimeout(() => { addHomepageUpload(); decorateHomepageFrames(); }, 120); };
const observer = new MutationObserver(run);
observer.observe(document.body, { childList:true, subtree:true });
run();
supabase.auth.onAuthStateChange(() => run());
