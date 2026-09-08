import fs from 'node:fs';

const path = new URL('../src/App.jsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8');

const pattern = /async function editHomepageSection\(x\) \{[\s\S]*?\n  \}\n  async function deleteHomepageSection\(x\) \{[\s\S]*?\n  \}/;
if (!pattern.test(source)) throw new Error('[homepage actions patch] edit/delete anchor not found');

const replacement = `async function editHomepageSection(x) {
    if (!canManageActiveRegion) return showNotice("Du hast in dieser Region keine Administrationsrechte.");
    if (x.publication_scope === "GLOBAL" && !isHeadAdmin(profile?.role)) return showNotice("Globale Beiträge darf nur der Head Admin bearbeiten.");
    const title = prompt("Überschrift:", x.title || ""); if (title === null) return;
    const content = prompt("Text:", x.content || ""); if (content === null) return;
    if (title.trim().length < 3 || content.trim().length < 3) return showNotice("Bitte Überschrift und Text ausfüllen.");
    const frameStyle = prompt("Rahmenstil: standard, accent, soft oder dark", x.frame_style || "standard"); if (frameStyle === null) return;
    const titleFont = prompt("Titel-Schriftart: modern, montserrat, arial, opensans oder serif", x.title_font_family || "modern"); if (titleFont === null) return;
    const titleSize = prompt("Titel-Schriftgröße (18–64):", String(x.title_font_size || 32)); if (titleSize === null) return;
    const titleColor = prompt("Titel-Farbe als HEX, z. B. #0f172a:", x.title_color || "#0f172a"); if (titleColor === null) return;
    const textFont = prompt("Text-Schriftart: modern, montserrat, arial, opensans oder serif", x.font_family || "modern"); if (textFont === null) return;
    const textSize = prompt("Text-Schriftgröße (12–48):", String(x.font_size || 18)); if (textSize === null) return;
    const textColor = prompt("Text-Farbe als HEX, z. B. #334155:", x.text_color || "#334155"); if (textColor === null) return;
    const imageUrl = prompt("Bild-URL (leer = kein Bild):", x.image_url || ""); if (imageUrl === null) return;
    const allowedFrames = new Set(["standard","accent","soft","dark"]);
    const allowedFonts = new Set(["modern","montserrat","arial","opensans","serif"]);
    const ts = Math.max(18, Math.min(64, Number(titleSize) || 32));
    const fs = Math.max(12, Math.min(48, Number(textSize) || 18));
    if (!/^#[0-9a-f]{6}$/i.test(titleColor) || !/^#[0-9a-f]{6}$/i.test(textColor)) return showNotice("Bitte gültige HEX-Farben verwenden, z. B. #ff5a1f.");
    const prepared = await preparePrivilegedAction("Startseiten-Beitrag bearbeiten", x.id); if (prepared.error) return showNotice(prepared.error.message);
    const { error } = await supabase.from("homepage_sections").update({
      title: title.trim(), content: content.trim(), image_url: imageUrl.trim() || null,
      frame_style: allowedFrames.has(frameStyle) ? frameStyle : "standard",
      title_font_family: allowedFonts.has(titleFont) ? titleFont : "modern", title_font_size: ts, title_color: titleColor,
      font_family: allowedFonts.has(textFont) ? textFont : "modern", font_size: fs, text_color: textColor,
      updated_by: user.id, updated_at: new Date().toISOString()
    }).eq("id", x.id);
    if (error) return showSaveError("Der Startseiten-Beitrag", error);
    showNotice("Startseiten-Beitrag gespeichert."); await loadAll();
  }
  async function deleteHomepageSection(x) {
    if (!canManageActiveRegion) return showNotice("Du hast in dieser Region keine Administrationsrechte.");
    if (x.publication_scope === "GLOBAL" && !isHeadAdmin(profile?.role)) return showNotice("Globale Beiträge darf nur der Head Admin löschen.");
    if (!confirm("Startseiten-Beitrag wirklich löschen?")) return;
    const prepared = await preparePrivilegedAction("Startseiten-Beitrag löschen", x.id); if (prepared.error) return showNotice(prepared.error.message);
    const { error } = await supabase.from("homepage_sections").delete().eq("id", x.id);
    if (error) return showSaveError("Der Startseiten-Beitrag", error);
    showNotice("Startseiten-Beitrag gelöscht."); await loadAll();
  }`;

source = source.replace(pattern, replacement);
fs.writeFileSync(path, source, 'utf8');
console.log('[homepage actions patch] edit/delete permissions and typography: ok');
