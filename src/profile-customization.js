import { supabase } from "./supabaseClient";

async function enhanceOwnProfile(root) {
  if (!root || root.querySelector(".ec-profile-design")) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return;
  const { data: profile } = await supabase.from("profiles").select("id,avatar_url,profile_accent,profile_background,profile_layout").eq("id", session.user.id).maybeSingle();
  if (!profile) return;

  const panel = document.createElement("section");
  panel.className = "ec-profile-design panel";
  panel.innerHTML = `
    <div class="ec-design-head"><span>DEIN PROFIL</span><h2>🎨 Profil gestalten</h2><p>Gestalte dein Profil mit Bild, Hintergrund, Farbe und Layout.</p></div>
    <form class="ec-design-form">
      <label>Profilbild / Bild-URL<input name="avatar_url" type="url" placeholder="https://…" value="${profile.avatar_url || ""}"></label>
      <label>Hintergrundbild / Bild-URL<input name="profile_background" type="url" placeholder="https://…" value="${profile.profile_background || ""}"></label>
      <label>Akzentfarbe<input name="profile_accent" type="color" value="${/^#[0-9a-f]{6}$/i.test(profile.profile_accent||"") ? profile.profile_accent : "#ff8a2a"}"></label>
      <label>Layout<select name="profile_layout"><option value="standard">Standard</option><option value="compact">Kompakt</option><option value="showcase">Showcase</option></select></label>
      <button type="submit">💾 Profilgestaltung speichern</button>
    </form>`;
  panel.querySelector('[name="profile_layout"]').value = profile.profile_layout || "standard";
  panel.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const { error } = await supabase.from("profiles").update({
      avatar_url: String(f.get("avatar_url") || "").trim() || null,
      profile_background: String(f.get("profile_background") || "").trim() || null,
      profile_accent: String(f.get("profile_accent") || "#ff8a2a"),
      profile_layout: String(f.get("profile_layout") || "standard")
    }).eq("id", session.user.id);
    if (error) return alert(error.message);
    alert("Profilgestaltung gespeichert.");
    window.location.reload();
  };
  root.prepend(panel);
}

const observer = new MutationObserver(() => {
  const candidates = [...document.querySelectorAll(".content-root, main, .modern-main")];
  const text = document.body.innerText || "";
  if (!/Mein Profil|Mein Profil bearbeiten|Profil bearbeiten/i.test(text)) return;
  const root = candidates.find((x) => x && x.getBoundingClientRect().width > 0);
  enhanceOwnProfile(root);
});
observer.observe(document.body, { childList: true, subtree: true });
