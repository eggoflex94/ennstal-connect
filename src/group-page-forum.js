import { supabase } from "./supabaseClient";

let activePage = null;
let opening = false;
let currentGroupId = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const fmtDate = (value) => value ? new Date(value).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" }) : "";
const displayName = (profile) => profile?.nickname || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Mitglied";
const styleClass = (post) => `gfp-font-${post.font_family || "modern"} gfp-size-${post.font_size || "normal"} gfp-align-${post.text_align || "left"}`;

async function resolveGroupFromCard(card) {
  const name = (card.querySelector("h2,h3,.group-card-title")?.textContent || "").trim();
  if (!name) return null;
  const { data } = await supabase.from("community_groups").select("*").eq("name", name).limit(20);
  if (!data?.length) return null;
  if (data.length === 1) return data[0];
  const activeRegion = localStorage.getItem("ec-active-region");
  return data.find((group) => group.region_id === activeRegion) || data[0];
}

async function getProfiles(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("profiles").select("id,nickname,first_name,last_name,avatar_url,role").in("id", unique);
  return new Map((data || []).map((profile) => [profile.id, profile]));
}

async function uploadForumImage(userId, file) {
  if (!file || !file.size) return null;
  if (!/^image\//.test(file.type)) throw new Error("Bitte nur Bilddateien hochladen.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Das Bild darf maximal 8 MB groß sein.");
  const ext = String(file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const path = `${userId}/forum/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("group-images").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabase.storage.from("group-images").getPublicUrl(path).data.publicUrl;
}

async function loadGroupPage(groupId) {
  const [{ data: group, error: groupError }, { data: auth }] = await Promise.all([
    supabase.from("community_groups").select("*").eq("id", groupId).single(),
    supabase.auth.getUser()
  ]);
  if (groupError || !group) throw groupError || new Error("Gruppe nicht gefunden.");
  const user = auth?.user;
  const [membersA, membersB, postsResult] = await Promise.all([
    supabase.from("community_group_members").select("user_id,joined_at").eq("group_id", group.id),
    supabase.from("group_members").select("user_id,joined_at").eq("group_id", group.id),
    supabase.from("group_forum_posts").select("*").eq("group_id", group.id).order("created_at", { ascending: false })
  ]);
  const memberIds = [...new Set([...(membersA.data || []), ...(membersB.data || [])].map((entry) => entry.user_id))];
  const posts = postsResult.data || [];
  const { data: replies } = posts.length
    ? await supabase.from("group_forum_replies").select("*").in("post_id", posts.map((post) => post.id)).order("created_at", { ascending: true })
    : { data: [] };
  const profileIds = [group.created_by, group.owner_id, ...memberIds, ...posts.map((post) => post.author_id), ...(replies || []).map((reply) => reply.author_id)];
  const profiles = await getProfiles(profileIds);
  const self = profiles.get(user?.id);
  const isMember = Boolean(user?.id && (memberIds.includes(user.id) || group.owner_id === user.id || group.created_by === user.id || self?.role === "HEAD_ADMIN"));
  return { group, user, memberIds, posts, replies: replies || [], profiles, isMember };
}

function renderPage(state) {
  const { group, user, memberIds, posts, replies, profiles, isMember } = state;
  const owner = profiles.get(group.owner_id);
  const creator = profiles.get(group.created_by);
  const shell = document.createElement("div");
  shell.className = "gfp-page";
  shell.dataset.groupId = group.id;
  shell.innerHTML = `
    <header class="gfp-topbar">
      <button type="button" class="gfp-back" aria-label="Zurück zu Gruppen">← <span>Gruppen</span></button>
      <strong>${esc(group.name)}</strong>
    </header>
    <main class="gfp-main">
      <section class="gfp-hero">
        ${group.image_url ? `<img class="gfp-cover" src="${esc(group.image_url)}" alt="Gruppenbild ${esc(group.name)}">` : `<div class="gfp-cover gfp-cover-empty">★</div>`}
        <div class="gfp-hero-copy">
          <span class="gfp-kicker">COMMUNITY-GRUPPE</span>
          <h1>${esc(group.name)}</h1>
          <p>${esc(group.description || "Diese Gruppe hat noch keine Beschreibung.")}</p>
          <div class="gfp-meta"><span>${memberIds.length} Mitglieder</span><span>Inhaber: ${esc(displayName(owner))}</span><span>Erstellt von ${esc(displayName(creator))}</span></div>
        </div>
      </section>

      <div class="gfp-grid">
        <section class="gfp-forum">
          <div class="gfp-section-heading"><div><span class="gfp-kicker">GRUPPENFORUM</span><h2>Beiträge & Austausch</h2></div><span>${posts.length} Beiträge</span></div>
          ${isMember ? `
          <form class="gfp-composer">
            <input name="title" maxlength="140" minlength="2" placeholder="Thema / Überschrift" required>
            <textarea name="content" maxlength="5000" rows="5" placeholder="Schreibe etwas in das Gruppenforum …" required></textarea>
            <div class="gfp-formatbar" aria-label="Text gestalten">
              <label>Schrift<select name="font_family"><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="rounded">Rund</option><option value="mono">Mono</option></select></label>
              <label>Größe<select name="font_size"><option value="small">Klein</option><option value="normal" selected>Normal</option><option value="large">Groß</option></select></label>
              <label>Ausrichtung<select name="text_align"><option value="left">Links</option><option value="center">Mitte</option><option value="right">Rechts</option></select></label>
              <label class="gfp-image-button">🖼 Bild<input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
            </div>
            <div class="gfp-preview"><span>Vorschau</span><p></p></div>
            <div class="gfp-composer-actions"><small>Bild-Upload bis 8 MB · Gestaltung wird mit dem Beitrag gespeichert.</small><button type="submit">Beitrag veröffentlichen</button></div>
          </form>` : `<div class="gfp-join-note">Tritt der Gruppe bei, um Beiträge und Antworten zu schreiben.</div>`}
          <div class="gfp-posts">
            ${posts.map((post) => {
              const author = profiles.get(post.author_id);
              const postReplies = replies.filter((reply) => reply.post_id === post.id);
              return `<article class="gfp-post" data-post-id="${post.id}">
                <div class="gfp-author"><img src="${esc(author?.avatar_url || "/community-default-avatar.png")}" alt=""><div><strong>${esc(displayName(author))}</strong><small>${esc(fmtDate(post.created_at))}</small></div></div>
                <h3>${esc(post.title)}</h3>
                <div class="gfp-post-content ${styleClass(post)}">${esc(post.content).replace(/\n/g, "<br>")}</div>
                ${post.image_url ? `<button class="gfp-post-image" type="button"><img src="${esc(post.image_url)}" alt="Bild zum Forumsbeitrag"></button>` : ""}
                <div class="gfp-replies">
                  ${postReplies.map((reply) => { const ra = profiles.get(reply.author_id); return `<div class="gfp-reply"><img src="${esc(ra?.avatar_url || "/community-default-avatar.png")}" alt=""><div><div><strong>${esc(displayName(ra))}</strong><small>${esc(fmtDate(reply.created_at))}</small></div><p>${esc(reply.content).replace(/\n/g, "<br>")}</p></div></div>`; }).join("")}
                </div>
                ${isMember ? `<form class="gfp-reply-form"><input name="content" maxlength="2000" placeholder="Antwort schreiben …" required><button type="submit">Antworten</button></form>` : ""}
              </article>`;
            }).join("") || `<div class="gfp-empty"><strong>Noch keine Beiträge.</strong><span>Starte das erste Thema in dieser Gruppe.</span></div>`}
          </div>
        </section>

        <aside class="gfp-side">
          <section class="gfp-members"><div class="gfp-section-heading"><div><span class="gfp-kicker">MITGLIEDER</span><h2>${memberIds.length} Personen</h2></div></div>
            <div>${memberIds.slice(0, 18).map((id) => { const member = profiles.get(id); return member ? `<div class="gfp-member"><img src="${esc(member.avatar_url || "/community-default-avatar.png")}" alt=""><span><strong>${esc(displayName(member))}</strong><small>${esc(member.role === "HEAD_ADMIN" ? "Hauptadmin" : member.role === "ADMIN" ? "Admin" : member.role === "SUPPORTER" ? "Supporter" : "Mitglied")}</small></span></div>` : ""; }).join("")}</div>
          </section>
        </aside>
      </div>
    </main>
    <div class="gfp-lightbox" hidden><button type="button" aria-label="Bild schließen">×</button><img alt="Bild groß anzeigen"></div>`;

  shell.querySelector(".gfp-back").addEventListener("click", closeGroupPage);
  const composer = shell.querySelector(".gfp-composer");
  if (composer) {
    const textarea = composer.elements.content;
    const preview = composer.querySelector(".gfp-preview p");
    const updatePreview = () => {
      preview.textContent = textarea.value || "So wird dein Text aussehen.";
      preview.className = styleClass({ font_family: composer.elements.font_family.value, font_size: composer.elements.font_size.value, text_align: composer.elements.text_align.value });
    };
    composer.addEventListener("input", updatePreview); composer.addEventListener("change", updatePreview); updatePreview();
    composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = composer.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Wird veröffentlicht …";
      try {
        const imageUrl = await uploadForumImage(user.id, composer.elements.image.files?.[0]);
        const { error } = await supabase.from("group_forum_posts").insert({
          group_id: group.id, author_id: user.id, title: composer.elements.title.value.trim(), content: composer.elements.content.value.trim(), image_url: imageUrl,
          font_family: composer.elements.font_family.value, font_size: composer.elements.font_size.value, text_align: composer.elements.text_align.value
        });
        if (error) throw error;
        await refreshCurrentPage();
      } catch (error) { alert(error?.message || "Beitrag konnte nicht veröffentlicht werden."); button.disabled = false; button.textContent = "Beitrag veröffentlichen"; }
    });
  }

  shell.querySelectorAll(".gfp-reply-form").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault(); const postId = form.closest(".gfp-post")?.dataset.postId; const input = form.elements.content; const button = form.querySelector("button");
    if (!postId || !input.value.trim()) return; button.disabled = true;
    const { error } = await supabase.from("group_forum_replies").insert({ post_id: postId, author_id: user.id, content: input.value.trim() });
    if (error) { alert(error.message); button.disabled = false; return; }
    await refreshCurrentPage();
  }));

  const lightbox = shell.querySelector(".gfp-lightbox");
  shell.querySelectorAll(".gfp-post-image").forEach((button) => button.addEventListener("click", () => { lightbox.querySelector("img").src = button.querySelector("img").src; lightbox.hidden = false; }));
  lightbox.addEventListener("click", () => { lightbox.hidden = true; });
  lightbox.querySelector("img").addEventListener("click", (event) => event.stopPropagation());

  return shell;
}

async function openGroupPage(group, pushState = true) {
  if (!group?.id || opening) return;
  opening = true;
  try {
    currentGroupId = group.id;
    const state = await loadGroupPage(group.id);
    activePage?.remove();
    activePage = renderPage(state);
    document.body.appendChild(activePage);
    document.documentElement.classList.add("gfp-open");
    if (pushState) {
      const url = new URL(location.href); url.searchParams.set("group", group.id); history.pushState({ ...(history.state || {}), ecGroup: group.id }, "", url);
    }
    window.scrollTo(0, 0);
  } catch (error) { console.error("[group-forum]", error); alert("Die Gruppe konnte nicht geöffnet werden."); }
  finally { opening = false; }
}

async function refreshCurrentPage() {
  if (!currentGroupId) return;
  const state = await loadGroupPage(currentGroupId);
  const replacement = renderPage(state);
  activePage?.replaceWith(replacement); activePage = replacement;
}

function closeGroupPage() {
  activePage?.remove(); activePage = null; currentGroupId = null; document.documentElement.classList.remove("gfp-open");
  const url = new URL(location.href); url.searchParams.delete("group"); history.pushState({ ...(history.state || {}), ecGroup: null }, "", url);
}

async function openFromUrl() {
  const id = new URLSearchParams(location.search).get("group");
  if (!id || id === currentGroupId) return;
  const { data } = await supabase.from("community_groups").select("*").eq("id", id).maybeSingle();
  if (data) openGroupPage(data, false);
}

document.addEventListener("click", async (event) => {
  const card = event.target.closest(".groups-page .group-card");
  if (!card || event.target.closest("button,input,textarea,label,select,a")) return;
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
  const group = await resolveGroupFromCard(card);
  if (group) openGroupPage(group);
}, true);

window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("group");
  if (!id) { activePage?.remove(); activePage = null; currentGroupId = null; document.documentElement.classList.remove("gfp-open"); }
  else openFromUrl();
});

setTimeout(openFromUrl, 800);
window.addEventListener("ec:authenticated", openFromUrl);

export {};
