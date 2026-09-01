import { supabase } from "./supabaseClient";

async function wireHomepageImageUpload() {
  const form = document.querySelector(".homepage-form");
  if (!form || form.querySelector(".ec-home-upload-wrap")) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return;

  const urlInput = form.querySelector('input[name="image_url"]');
  if (!urlInput) return;

  const wrap = document.createElement("div");
  wrap.className = "ec-home-upload-wrap";
  wrap.innerHTML = `
    <label class="ec-home-upload-label">
      <span>🖼️ Bild direkt hochladen</span>
      <input class="ec-home-upload-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif">
      <small>JPG, PNG, WebP oder GIF · maximal 6 MB</small>
    </label>
    <div class="ec-home-upload-status" aria-live="polite"></div>
  `;
  urlInput.parentElement?.insertAdjacentElement("afterend", wrap);

  const input = wrap.querySelector("input[type=file]");
  const status = wrap.querySelector(".ec-home-upload-status");

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      status.textContent = "Bitte eine Bilddatei auswählen.";
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      status.textContent = "Das Bild darf maximal 6 MB groß sein.";
      return;
    }

    status.textContent = "Bild wird hochgeladen …";
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${session.user.id}/homepage/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("community-media").upload(path, file, {
      upsert: false,
      cacheControl: "3600",
      contentType: file.type
    });
    if (error) {
      status.textContent = `Upload fehlgeschlagen: ${error.message}`;
      return;
    }

    const { data } = supabase.storage.from("community-media").getPublicUrl(path);
    urlInput.value = data.publicUrl;
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    status.textContent = "✓ Bild hochgeladen und für den Rahmen übernommen.";
  });
}

const observer = new MutationObserver(() => wireHomepageImageUpload());
observer.observe(document.body, { childList: true, subtree: true });
wireHomepageImageUpload();
