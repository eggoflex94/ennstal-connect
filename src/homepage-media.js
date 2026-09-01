import { supabase } from "./supabaseClient";

async function enhanceHomepageForm(form) {
  if (!form || form.dataset.mediaReady === "1") return;
  const imageUrl = form.querySelector('[name="image_url"]');
  if (!imageUrl) return;
  form.dataset.mediaReady = "1";

  const wrap = document.createElement("div");
  wrap.className = "ec-home-image-upload";
  wrap.innerHTML = `<label>Bild hochladen <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"><small>Max. 5 MB. Das Bild wird automatisch in den Rahmen übernommen.</small></label>`;
  imageUrl.parentElement?.insertBefore(wrap, imageUrl);
  imageUrl.placeholder = "Bild-URL (optional)";

  const input = wrap.querySelector("input");
  const small = wrap.querySelector("small");
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { small.textContent = "Bitte eine Bilddatei auswählen."; return; }
    if (file.size > 5 * 1024 * 1024) { small.textContent = "Das Bild darf höchstens 5 MB groß sein."; return; }
    input.disabled = true;
    small.textContent = "Bild wird hochgeladen …";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht eingeloggt.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `homepage/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("community-media").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("community-media").getPublicUrl(path);
      imageUrl.value = data.publicUrl;
      imageUrl.dispatchEvent(new Event("input", { bubbles: true }));
      small.textContent = "✓ Bild übernommen. Du kannst den Rahmen jetzt veröffentlichen.";
    } catch (error) {
      small.textContent = `Upload fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}`;
    } finally {
      input.disabled = false;
    }
  });
}

const observer = new MutationObserver(() => {
  document.querySelectorAll("form.homepage-form").forEach(enhanceHomepageForm);
});
observer.observe(document.body, { childList: true, subtree: true });
