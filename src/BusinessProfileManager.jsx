import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./BusinessProfileManager.css";

const DOC_BUCKET = "business-profile-documents";
const PHOTO_BUCKET = "profile-layout-media";
const DOC_TYPES = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
const PHOTO_TYPES = new Set(["image/jpeg","image/png","image/webp","image/gif"]);

const escName = (value) => String(value || "").trim();

export default function BusinessProfileManager({ profile, user }) {
  const isBusiness = profile?.account_badge === "BUSINESS";
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const ownerId = user?.id || profile?.id || "";

  const load = async () => {
    if (!isBusiness || !ownerId) return;
    const [docsResult, foldersResult] = await Promise.all([
      supabase.from("business_profile_documents").select("id,title,document_type,file_path,mime_type,visibility,created_at").eq("owner_id", ownerId).order("created_at", { ascending:false }),
      supabase.from("profile_photo_folders").select("id,title,created_at").eq("owner_id", ownerId).order("created_at", { ascending:true }),
    ]);
    if (!docsResult.error) setDocuments(docsResult.data || []);
    if (!foldersResult.error) setFolders(foldersResult.data || []);
  };

  useEffect(() => {
    void load();
  }, [isBusiness, ownerId]);

  const folderOptions = useMemo(() => [{ id:"", title:"Allgemein" }, ...folders], [folders]);

  if (!isBusiness) return null;

  const show = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  };

  const uploadDocument = async (event) => {
    event.preventDefault();
    if (busy || !ownerId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = form.elements.file?.files?.[0];
    const title = escName(data.get("title"));
    const documentType = String(data.get("document_type") || "DOCUMENT");
    const visibility = String(data.get("visibility") || "MEMBERS");
    if (!file || !title) return show("Bitte Titel und Datei auswählen.");
    if (!DOC_TYPES.has(file.type) || file.size > 10 * 1024 * 1024) return show("Erlaubt sind PDF, JPG, PNG oder WebP bis 10 MB.");

    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "bin";
    const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
    setBusy(true);
    try {
      const { error: uploadError } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType:file.type, upsert:false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from("business_profile_documents").insert({
        owner_id: ownerId,
        title,
        document_type: documentType,
        file_path: path,
        mime_type: file.type,
        visibility,
      });
      if (insertError) {
        await supabase.storage.from(DOC_BUCKET).remove([path]);
        throw insertError;
      }
      form.reset();
      await load();
      show("Datei wurde hochgeladen.");
    } catch (error) {
      show(error?.message || "Datei konnte nicht hochgeladen werden.");
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (doc) => {
    const { data, error } = await supabase.storage.from(DOC_BUCKET).download(doc.file_path);
    if (error || !data) return show(error?.message || "Datei konnte nicht geöffnet werden.");
    const url = URL.createObjectURL(data);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const updateDocumentVisibility = async (doc, visibility) => {
    if (!["PUBLIC","MEMBERS","HIDDEN"].includes(visibility)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("business_profile_documents")
        .update({ visibility })
        .eq("id", doc.id)
        .eq("owner_id", ownerId);
      if (error) throw error;
      setDocuments((current) => current.map((item) => item.id === doc.id ? { ...item, visibility } : item));
      show("Sichtbarkeit gespeichert.");
    } catch (error) {
      show(error?.message || "Sichtbarkeit konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const deleteDocument = async (doc) => {
    if (!window.confirm(`„${doc.title}“ wirklich löschen?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("business_profile_documents").delete().eq("id", doc.id).eq("owner_id", ownerId);
      if (error) throw error;
      await supabase.storage.from(DOC_BUCKET).remove([doc.file_path]);
      await load();
      show("Datei gelöscht.");
    } catch (error) {
      show(error?.message || "Datei konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async (event) => {
    event.preventDefault();
    if (busy || !ownerId) return;
    const form = event.currentTarget;
    const title = escName(new FormData(form).get("folder_title"));
    if (!title) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("profile_photo_folders").insert({ owner_id: ownerId, title });
      if (error) throw error;
      form.reset();
      await load();
      window.dispatchEvent(new CustomEvent("ec:profile-photo-folders-changed"));
      show("Fotoalbum angelegt.");
    } catch (error) {
      show(error?.message || "Fotoalbum konnte nicht angelegt werden.");
    } finally {
      setBusy(false);
    }
  };

  const uploadAlbumPhoto = async (event) => {
    event.preventDefault();
    if (busy || !ownerId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = form.elements.photo?.files?.[0];
    if (!file) return show("Bitte ein Foto auswählen.");
    if (!PHOTO_TYPES.has(file.type) || file.size > 8 * 1024 * 1024) return show("Erlaubt sind JPG, PNG, WebP oder GIF bis 8 MB.");
    const ext = ({ "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif" })[file.type] || "jpg";
    const path = `${ownerId}/album/${crypto.randomUUID()}.${ext}`;
    const folderId = String(data.get("folder_id") || "") || null;
    setBusy(true);
    try {
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType:file.type, upsert:false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from("member_photos").insert({
        owner_id: ownerId,
        image_url: path,
        caption: escName(data.get("caption")),
        visibility: "PUBLIC",
        folder_id: folderId,
      });
      if (insertError) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        throw insertError;
      }
      form.reset();
      window.dispatchEvent(new CustomEvent("ec:profile-photo-folders-changed"));
      show("Foto wurde ins Album hochgeladen.");
    } catch (error) {
      show(error?.message || "Foto konnte nicht hochgeladen werden.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="panel ec-business-manager">
    <header className="ec-business-manager-head">
      <div>
        <span className="eyebrow">UNTERNEHMERPROFIL</span>
        <h2>Unternehmerprofil verwalten</h2>
        <p>Speisekarten, Preislisten, Dokumente und eigene Fotoalben direkt in deinem Profil verwalten.</p>
      </div>
      <span className="ec-business-manager-badge">★ Unternehmerkonto</span>
    </header>

    {message && <div className="ec-business-manager-message" role="status">{message}</div>}

    <div className="ec-business-manager-grid">
      <section className="ec-business-manager-card">
        <h3>Speisekarten & Dokumente</h3>
        <p>Lade Speisekarten, Preislisten oder andere Unternehmensunterlagen hoch.</p>
        <form onSubmit={uploadDocument} className="ec-business-manager-form">
          <label>Art<select name="document_type" defaultValue="MENU"><option value="MENU">Speisekarte</option><option value="PRICE_LIST">Preisliste</option><option value="DOCUMENT">Dokument</option></select></label>
          <label>Titel<input name="title" maxLength="120" placeholder="z. B. Speisekarte Herbst 2026" required /></label>
          <label>Sichtbarkeit<select name="visibility" defaultValue="MEMBERS"><option value="PUBLIC">Öffentlich</option><option value="MEMBERS">Nur Mitglieder</option><option value="HIDDEN">Nicht anzeigen</option></select></label>
          <label className="ec-business-manager-wide">Datei<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
          <button className="primary-button ec-business-manager-wide" disabled={busy}>Hochladen</button>
        </form>
        <div className="ec-business-manager-list">
          {documents.map((doc) => <article key={doc.id}>
            <div>
              <small>{doc.document_type === "MENU" ? "SPEISEKARTE" : doc.document_type === "PRICE_LIST" ? "PREISLISTE" : "DOKUMENT"}</small>
              <strong>{doc.title}</strong>
              <span className="ec-business-doc-visibility">{doc.visibility === "PUBLIC" ? "🌍 Öffentlich" : doc.visibility === "HIDDEN" ? "🙈 Nicht anzeigen" : "👥 Nur Mitglieder"}</span>
            </div>
            <div className="ec-business-doc-actions">
              <select aria-label="Sichtbarkeit" value={doc.visibility || "MEMBERS"} onChange={(event) => updateDocumentVisibility(doc, event.target.value)} disabled={busy}>
                <option value="PUBLIC">Öffentlich</option>
                <option value="MEMBERS">Nur Mitglieder</option>
                <option value="HIDDEN">Nicht anzeigen</option>
              </select>
              <button type="button" onClick={() => openDocument(doc)}>Öffnen</button>
              <button type="button" onClick={() => deleteDocument(doc)}>Löschen</button>
            </div>
          </article>)}
          {!documents.length && <p>Noch keine Speisekarten oder Dokumente hochgeladen.</p>}
        </div>
      </section>

      <section className="ec-business-manager-card">
        <h3>Eigene Fotoalben</h3>
        <p>Lege mehrere Alben an, z. B. „Gerichte“, „Projekte“, „Team“ oder „Referenzen“.</p>
        <form onSubmit={createFolder} className="ec-business-folder-create">
          <input name="folder_title" maxLength="80" placeholder="Name des neuen Albums" required />
          <button className="secondary-button" disabled={busy}>+ Album anlegen</button>
        </form>
        <div className="ec-business-folder-chips">
          {folderOptions.map((folder) => <span key={folder.id || "general"}>{folder.title}</span>)}
        </div>
        <form onSubmit={uploadAlbumPhoto} className="ec-business-manager-form">
          <label>Album<select name="folder_id">{folderOptions.map((folder) => <option key={folder.id || "general"} value={folder.id}>{folder.title}</option>)}</select></label>
          <label>Bildbeschreibung<input name="caption" maxLength="180" placeholder="z. B. Unser neues Mittagsmenü" /></label>
          <label className="ec-business-manager-wide">Foto<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required /></label>
          <button className="primary-button ec-business-manager-wide" disabled={busy}>Foto hochladen</button>
        </form>
        <p className="ec-business-manager-note">Die Fotos erscheinen unten im Profil als kleine Albumansichten. Beim Anklicken werden sie groß; Likes, Kommentare und Teilen funktionieren wie bei allen Profilfotos.</p>
      </section>
    </div>
  </section>;
}
