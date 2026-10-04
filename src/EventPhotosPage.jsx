import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { watermarkPhoto } from "./photoWatermark.js";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5.5 * 1024 * 1024;
const MAX_EDGE = 2200;
const MAX_BATCH = 12;
let watermarkPromise = null;

const memberName = (member) => member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied";

function loadWatermark() {
  if (watermarkPromise) return watermarkPromise;
  watermarkPromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/ennstal-connect-wordmark.svg";
  });
  return watermarkPromise;
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {}
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || "").startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(String(file.name || ""));
}

async function optimizeAndWatermarkLegacy(file) {
  if (!isImageFile(file)) throw new Error("Bitte nur Bilddateien auswählen.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name}: Das Original ist größer als 20 MB.`);

  const source = await decodeImage(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error(`${file.name}: Bildgröße konnte nicht ermittelt werden.`);

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Bildverarbeitung wird von diesem Browser nicht unterstützt.");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  source.close?.();

  const watermark = await loadWatermark();
  if (watermark) {
    const naturalWidth = watermark.naturalWidth || watermark.width || 1;
    const naturalHeight = watermark.naturalHeight || watermark.height || 1;
    const markWidth = Math.min(Math.max(width * 0.18, 150), 420);
    const markHeight = markWidth * (naturalHeight / naturalWidth);
    const pad = Math.max(14, width * 0.018);
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(8,27,42,.72)";
    ctx.fillRect(width - markWidth - pad - 14, height - markHeight - pad - 12, markWidth + 28, markHeight + 24);
    ctx.drawImage(watermark, width - markWidth - pad, height - markHeight - pad, markWidth, markHeight);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.max(14, Math.round(width * 0.012))}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("ENNSTAL CONNECT", width - pad, height - pad - 4);
    ctx.restore();
  }

  let quality = 0.82;
  let type = "image/webp";
  let blob = await canvasBlob(canvas, type, quality);
  if (!blob) {
    type = "image/jpeg";
    blob = await canvasBlob(canvas, type, quality);
  }
  while (blob && blob.size > MAX_UPLOAD_BYTES && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasBlob(canvas, type, quality);
  }
  if (!blob) throw new Error(`${file.name}: Optimierung fehlgeschlagen.`);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: Das optimierte Bild ist noch zu groß.`);

  return { blob, extension: type === "image/webp" ? "webp" : "jpg", contentType: type };
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EventPhotosPage({ user, profile, members = [], regions = [], activeRegion, showNotice }) {
  const [events, setEvents] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [regionFilter, setRegionFilter] = useState(activeRegion?.id || "ALL");
  const [photoAssignments, setPhotoAssignments] = useState([]);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);

  const canUploadEvent = (event) => {
    if (!event || !profile || String(event.status || "ACTIVE").toUpperCase() === "CANCELLED") return false;
    if (String(profile.role || "").toUpperCase() === "HEAD_ADMIN") return true;
    return photoAssignments.some((assignment) =>
      assignment?.active === true &&
      (assignment.scope === "GLOBAL" || (assignment.scope === "REGIONAL" && assignment.region_id === event.region_id))
    );
  };

  const refresh = async () => {
    if (!user?.id) return;
    const [{ data: eventRows, error: eventError }, { data: photoRows, error: photoError }, { data: myLikes }, { data: assignments, error: assignmentError }] = await Promise.all([
      supabase.from("community_events").select("id,title,event_at,location,region_id,status,image_url").order("event_at", { ascending: false }).limit(120),
      supabase.from("event_photos").select("id,event_id,uploaded_by,storage_path,caption,status,like_count,comment_count,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("event_photo_likes").select("photo_id").eq("user_id", user.id),
      supabase.from("community_photographer_assignments").select("scope,region_id,active").eq("user_id", user.id).eq("active", true)
    ]);
    if (eventError) return showNotice?.(eventError.message);
    if (photoError) return showNotice?.(photoError.message);
    if (assignmentError) console.warn("Foto-Berechtigungen konnten nicht geladen werden:", assignmentError.message);
    setEvents(eventRows || []);
    setPhotos(photoRows || []);
    setLikedIds(new Set((myLikes || []).map((row) => row.photo_id)));
    setPhotoAssignments(assignments || []);
    setSelectedEventId((current) => current || eventRows?.[0]?.id || "");
  };

  useEffect(() => { void refresh(); }, [user?.id]);

  useEffect(() => {
    if (activeRegion?.id) setRegionFilter(activeRegion.id);
  }, [activeRegion?.id]);

  useEffect(() => {
    const handleOpenEventPhotos = (event) => {
      const eventId = String(event.detail?.eventId || "");
      if (!eventId) return;
      setSelectedEventId(eventId);
      const target = events.find((item) => item.id === eventId);
      if (target?.region_id) setRegionFilter(target.region_id);
      window.setTimeout(() => document.querySelector(".event-photos-page")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };
    window.addEventListener("ec:open-event-photos", handleOpenEventPhotos);
    return () => window.removeEventListener("ec:open-event-photos", handleOpenEventPhotos);
  }, [events]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => regionFilter === "ALL" || event.region_id === regionFilter);
  }, [events, regionFilter]);

  useEffect(() => {
    if (selectedEventId && visibleEvents.some((event) => event.id === selectedEventId)) return;
    setSelectedEventId(visibleEvents[0]?.id || "");
  }, [regionFilter, visibleEvents, selectedEventId]);

  const selectedEvent = events.find((event) => event.id === selectedEventId) || null;
  const eventPhotos = photos.filter((photo) => !selectedEventId || photo.event_id === selectedEventId);

  const publicUrl = (path) => supabase.storage.from("event-photos").getPublicUrl(path).data.publicUrl;

  const uploadFiles = async (files) => {
    if (!selectedEvent || !canUploadEvent(selectedEvent)) return showNotice?.("Für dieses Event hast du keine Foto-Berechtigung.");
    const list = [...(files || [])].slice(0, MAX_BATCH);
    if (!list.length) return;
    if (files.length > MAX_BATCH) showNotice?.(`Pro Durchgang werden maximal ${MAX_BATCH} Fotos verarbeitet.`);

    setUploading(true);
    let completed = 0;
    try {
      for (const file of list) {
        setUploadStatus(`Optimiere ${completed + 1} von ${list.length}: ${file.name}`);
        const optimized = await watermarkPhoto(file, { mode: "event", maxEdge: MAX_EDGE, quality: 0.84 });
        const filename = `${Date.now()}-${crypto.randomUUID()}.${optimized.extension}`;
        const path = `${user.id}/${selectedEvent.id}/${filename}`;

        setUploadStatus(`Lade ${completed + 1} von ${list.length} hoch …`);
        const { error: uploadError } = await supabase.storage.from("event-photos").upload(path, optimized.blob, {
          cacheControl: "31536000",
          contentType: optimized.contentType,
          upsert: false
        });
        if (uploadError) throw uploadError;

        let createError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const result = await supabase.rpc("create_event_photo", {
            p_event_id: selectedEvent.id,
            p_storage_path: path,
            p_caption: caption.trim() || null
          });
          createError = result.error;
          if (!createError) break;

          const { data: existing } = await supabase
            .from("event_photos")
            .select("id")
            .eq("storage_path", path)
            .maybeSingle();
          if (existing?.id) { createError = null; break; }

          if (!/failed to fetch|load failed|network|timeout|antwortet nicht|aborted|thread killed/i.test(String(createError?.message || createError || "")) || attempt === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
        if (createError) {
          const { data: existing } = await supabase
            .from("event_photos")
            .select("id")
            .eq("storage_path", path)
            .maybeSingle();
          if (!existing?.id) {
            await supabase.storage.from("event-photos").remove([path]);
            throw createError;
          }
        }
        completed += 1;
      }
      setCaption("");
      setUploadStatus(`${completed} Foto${completed === 1 ? "" : "s"} veröffentlicht.`);
      await refresh();
      window.dispatchEvent(new CustomEvent("ec:regional-events-refresh", { detail: { eventId: selectedEvent.id, reason: "photos-uploaded" } }));
    } catch (error) {
      showNotice?.(error?.message || "Foto-Upload fehlgeschlagen.");
      setUploadStatus(completed ? `${completed} Foto(s) wurden bereits hochgeladen.` : "");
    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async (photo) => {
    const liked = likedIds.has(photo.id);
    const query = liked
      ? supabase.from("event_photo_likes").delete().eq("photo_id", photo.id).eq("user_id", user.id)
      : supabase.from("event_photo_likes").insert({ photo_id: photo.id, user_id: user.id });
    const { error } = await query;
    if (error) return showNotice?.(error.message);
    setLikedIds((current) => {
      const next = new Set(current);
      liked ? next.delete(photo.id) : next.add(photo.id);
      return next;
    });
    setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, like_count: Math.max(0, Number(item.like_count || 0) + (liked ? -1 : 1)) } : item));
  };

  const openPhoto = async (photo) => {
    setSelectedPhoto(photo);
    setCommentDraft("");
    const { data, error } = await supabase.from("event_photo_comments").select("id,photo_id,user_id,content,created_at").eq("photo_id", photo.id).order("created_at", { ascending: true }).limit(150);
    if (!error) setComments(data || []);
  };

  const moveSelectedPhoto = (offset) => {
    if (!selectedPhoto || eventPhotos.length < 2) return;
    const index = eventPhotos.findIndex((photo) => photo.id === selectedPhoto.id);
    if (index < 0) return;
    const next = eventPhotos[(index + offset + eventPhotos.length) % eventPhotos.length];
    if (next) void openPhoto(next);
  };

  const addComment = async (event) => {
    event.preventDefault();
    const clean = commentDraft.trim();
    if (!selectedPhoto || !clean) return;
    const { data, error } = await supabase.from("event_photo_comments").insert({ photo_id: selectedPhoto.id, user_id: user.id, content: clean }).select("id,photo_id,user_id,content,created_at").single();
    if (error) return showNotice?.(error.message);
    setComments((current) => [...current, data]);
    setCommentDraft("");
    setPhotos((current) => current.map((item) => item.id === selectedPhoto.id ? { ...item, comment_count: Number(item.comment_count || 0) + 1 } : item));
  };

  const reportPhoto = async (photo) => {
    const reason = window.prompt("Warum möchtest du dieses Eventfoto melden?", "Datenschutz / unpassender Inhalt");
    if (reason === null || reason.trim().length < 3) return;
    const { error } = await supabase.from("event_photo_reports").insert({ photo_id: photo.id, reporter_id: user.id, reason: reason.trim() });
    showNotice?.(error ? (error.code === "23505" ? "Du hast dieses Foto bereits gemeldet." : error.message) : "Foto wurde zur Prüfung gemeldet.");
  };

  const editCaption = async (photo) => {
    const next = window.prompt("Bildbeschreibung bearbeiten:", photo.caption || "");
    if (next === null) return;
    const clean = next.trim().slice(0, 240);
    const { error } = await supabase.from("event_photos").update({ caption: clean || null, updated_at: new Date().toISOString() }).eq("id", photo.id);
    if (error) return showNotice?.(error.message);
    setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, caption: clean || null } : item));
    setSelectedPhoto((current) => current?.id === photo.id ? { ...current, caption: clean || null } : current);
  };

  const deletePhoto = async (photo) => {
    if (!window.confirm("Dieses Eventfoto wirklich löschen? Die dafür vergebenen Fotopunkte werden zurückgenommen.")) return;
    const { error } = await supabase.from("event_photos").delete().eq("id", photo.id);
    if (error) return showNotice?.(error.message);
    await supabase.storage.from("event-photos").remove([photo.storage_path]);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
    showNotice?.("Eventfoto wurde gelöscht.");
  };

  const eventPhotoCount = (eventId) => photos.filter((photo) => photo.event_id === eventId).length;

  return <section className="event-photos-page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">COMMUNITY FOTOS</span>
        <h1>Eventfotos</h1>
        <p>Fotos zu Veranstaltungen ansehen, kommentieren und – mit Foto-Berechtigung – direkt hochladen.</p>
      </div>
    </div>

    <section className="event-photo-toolbar panel">
      <label>Region
        <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
          <option value="ALL">Alle Regionen</option>
          {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
        </select>
      </label>
      <label>Event
        <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
          {!visibleEvents.length && <option value="">Keine Events vorhanden</option>}
          {visibleEvents.map((event) => <option key={event.id} value={event.id}>{event.title} · {eventPhotoCount(event.id)} Fotos</option>)}
        </select>
      </label>
      {selectedEvent && <div className="event-photo-event-meta">
        <strong>{selectedEvent.title}</strong>
        <span>{formatDate(selectedEvent.event_at)}{selectedEvent.location ? ` · ${selectedEvent.location}` : ""}</span>
      </div>}
    </section>

    {selectedEvent && canUploadEvent(selectedEvent) && <section className="event-photo-upload panel">
      <div>
        <span className="eyebrow">COMMUNITY-FOTOGRAF</span>
        <h2>Fotos zu diesem Event hochladen</h2>
        <p>Die Bilder werden vor dem Upload automatisch verkleinert, komprimiert und mit einem transparenten Ennstal-Connect-Wasserzeichen versehen.</p>
      </div>
      <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength="240" placeholder="Bildbeschreibung für diesen Upload (optional)"/>
      <label className={`event-photo-upload-button ${uploading ? "is-busy" : ""}`}>
        {uploading ? "Upload läuft …" : "📷 Fotos auswählen"}
        <input type="file" accept="image/*,.heic,.heif,.avif" multiple disabled={uploading} onChange={(event) => { const input = event.currentTarget; const files = input.files; void uploadFiles(files).finally(() => { input.value = ""; }); }}/>
      </label>
      <small>Bis zu {MAX_BATCH} Fotos pro Durchgang · Original max. 20 MB · Upload wird automatisch auf unter 6 MB optimiert.</small>
      {uploadStatus && <div className="event-photo-upload-status" aria-live="polite">{uploadStatus}</div>}
    </section>}

    <div className="event-photo-grid">
      {eventPhotos.map((photo) => {
        const photographer = memberById.get(photo.uploaded_by);
        const liked = likedIds.has(photo.id);
        const own = photo.uploaded_by === user?.id;
        return <article className="event-photo-card" key={photo.id}>
          <button className="event-photo-image-button" type="button" onClick={() => void openPhoto(photo)}>
            <img src={publicUrl(photo.storage_path)} alt={photo.caption || `Eventfoto von ${memberName(photographer)}`} loading="lazy" decoding="async"/>
          </button>
          <div className="event-photo-card-body">
            <div className="event-photo-author"><span className="event-photo-camera" aria-hidden="true">📷</span><strong>{memberName(photographer)}</strong><small>Community-Fotograf</small></div>
            {photo.caption && <p>{photo.caption}</p>}
            <div className="event-photo-actions">
              <button type="button" onClick={() => void toggleLike(photo)}>{liked ? "♥" : "♡"} {Number(photo.like_count || 0)}</button>
              <button type="button" onClick={() => void openPhoto(photo)}>💬 {Number(photo.comment_count || 0)}</button>
              <button type="button" onClick={() => void reportPhoto(photo)}>⚑ Melden</button>
            </div>
            {own && <div className="event-photo-owner-actions"><button type="button" onClick={() => void editCaption(photo)}>✎ Bearbeiten</button><button type="button" className="danger-button" onClick={() => void deletePhoto(photo)}>Löschen</button></div>}
          </div>
        </article>;
      })}
      {!eventPhotos.length && <div className="empty-card">Zu diesem Event wurden noch keine Fotos veröffentlicht.</div>}
    </div>

    {selectedPhoto && <div className="event-photo-lightbox" role="dialog" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) setSelectedPhoto(null); }}>
      <section className="event-photo-lightbox-card">
        <button className="event-photo-lightbox-close" type="button" onClick={() => setSelectedPhoto(null)} aria-label="Schließen">×</button>
        <div className="event-photo-lightbox-image">
          {eventPhotos.length > 1 && <button type="button" className="event-photo-lightbox-nav prev" onClick={() => moveSelectedPhoto(-1)} aria-label="Vorheriges Foto">‹</button>}
          <img src={publicUrl(selectedPhoto.storage_path)} alt={selectedPhoto.caption || "Eventfoto"}/>
          <span className="ec-image-watermark ec-image-watermark-event" aria-hidden="true"/>
          {eventPhotos.length > 1 && <button type="button" className="event-photo-lightbox-nav next" onClick={() => moveSelectedPhoto(1)} aria-label="Nächstes Foto">›</button>}
        </div>
        <aside>
          <div className="event-photo-author"><span className="event-photo-camera">📷</span><strong>{memberName(memberById.get(selectedPhoto.uploaded_by))}</strong><small>Community-Fotograf</small></div>
          {selectedPhoto.caption && <p>{selectedPhoto.caption}</p>}
          <div className="event-photo-lightbox-actions">
            <button type="button" onClick={() => void toggleLike(selectedPhoto)}>{likedIds.has(selectedPhoto.id) ? "♥ Gefällt dir" : "♡ Gefällt mir"}</button>
            <button type="button" onClick={() => void reportPhoto(selectedPhoto)}>⚑ Melden</button>
          </div>
          <div className="event-photo-comments">
            <h3>Kommentare</h3>
            <div>{comments.map((comment) => <p key={comment.id}><strong>{memberName(memberById.get(comment.user_id))}</strong><span>{comment.content}</span><small>{formatDate(comment.created_at)}</small></p>)}{!comments.length && <small>Noch keine Kommentare.</small>}</div>
            <form onSubmit={addComment}><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} maxLength="500" placeholder="Kommentar schreiben …"/><button type="submit">Senden</button></form>
          </div>
        </aside>
      </section>
    </div>}
  </section>;
}
