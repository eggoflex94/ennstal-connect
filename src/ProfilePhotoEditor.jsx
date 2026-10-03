import React, { useEffect, useRef, useState } from "react";
import "./ProfilePhotoEditor.css";

const SIZE = 900;
const PREVIEW_SIZE = 720;
const PAN_X_LIMIT = 120;
const PAN_Y_UP_LIMIT = 260;
const PAN_Y_DOWN_LIMIT = 160;
const MAX_ZOOM = 2.8;
const CIRCLE_INSET_RATIO = 0.08;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht geladen werden."));
    };
    img.src = url;
  });
}

function panOffsets(x, y, size) {
  const xLimit = PAN_X_LIMIT || 1;
  const yLimit = y < 0 ? PAN_Y_UP_LIMIT : PAN_Y_DOWN_LIMIT;
  return {
    x: (x / xLimit) * size * 0.34,
    y: (y / Math.max(1, yLimit)) * size * 0.46
  };
}

function cropGeometry(source, rotation, size) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const quarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const rotatedWidth = quarterTurn ? source.naturalHeight : source.naturalWidth;
  const rotatedHeight = quarterTurn ? source.naturalWidth : source.naturalHeight;
  const coverScale = Math.max(size / rotatedWidth, size / rotatedHeight);
  const containScale = Math.min(size / rotatedWidth, size / rotatedHeight);
  const visibleDiameter = size * (1 - CIRCLE_INSET_RATIO * 2);
  const renderedMinDimension = Math.min(rotatedWidth * coverScale, rotatedHeight * coverScale);
  const circleFillZoom = Math.max(0.1, visibleDiameter / Math.max(renderedMinDimension, 0.0001));
  return { quarterTurn, coverScale, containScale, circleFillZoom };
}

function drawSoftBackdrop(ctx, source, rotation, size, coverScale) {
  const radians = rotation * Math.PI / 180;
  const backdropScale = coverScale * 1.12;
  const bgW = source.naturalWidth * backdropScale;
  const bgH = source.naturalHeight * backdropScale;

  ctx.save();
  ctx.filter = "blur(34px) brightness(.56) saturate(1.12)";
  ctx.translate(size / 2, size / 2);
  ctx.rotate(radians);
  ctx.drawImage(source, -bgW / 2, -bgH / 2, bgW, bgH);
  ctx.restore();
  ctx.filter = "none";

  // Darken the image-derived backdrop slightly so exposed space can never
  // turn into a white/light letterbox, even with very bright source photos.
  ctx.save();
  ctx.fillStyle = "rgba(10, 24, 36, 0.22)";
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

function drawEditedImage(canvas, source, { zoom, x, y, rotation, mode = "cover" }, size) {
  if (!canvas || !source) return;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  const { quarterTurn, coverScale, containScale } = cropGeometry(source, rotation, size);
  const radians = rotation * Math.PI / 180;

  // Always paint the empty area with a blurred version of the photo.
  // This keeps zoomed-out avatars free of white/light letterboxing in every mode.
  drawSoftBackdrop(ctx, source, rotation, size, coverScale);

  if (mode === "contain") {
    // Keep the complete source visible, but leave a small safe margin so the
    // user can still move it up/down (and left/right) without cropping it.
    const scale = containScale * 0.88;
    const drawW = source.naturalWidth * scale;
    const drawH = source.naturalHeight * scale;
    const renderedW = quarterTurn ? drawH : drawW;
    const renderedH = quarterTurn ? drawW : drawH;
    const freeX = Math.max(0, (size - renderedW) / 2);
    const freeY = Math.max(0, (size - renderedH) / 2);
    const offsetX = (Math.max(-PAN_X_LIMIT, Math.min(PAN_X_LIMIT, x)) / PAN_X_LIMIT) * freeX;
    const yLimit = y < 0 ? PAN_Y_UP_LIMIT : PAN_Y_DOWN_LIMIT;
    const offsetY = (Math.max(-yLimit, Math.min(yLimit, y)) / Math.max(1, yLimit)) * freeY;

    ctx.save();
    ctx.translate(size / 2 + offsetX, size / 2 + offsetY);
    ctx.rotate(radians);
    ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    return;
  }

  const scale = coverScale * zoom;
  const drawW = source.naturalWidth * scale;
  const drawH = source.naturalHeight * scale;
  const renderedW = quarterTurn ? drawH : drawW;
  const renderedH = quarterTurn ? drawW : drawH;
  const visibleDiameter = size * (1 - CIRCLE_INSET_RATIO * 2);
  const maxOffsetX = Math.max(0, (renderedW - visibleDiameter) / 2);
  const maxOffsetY = Math.max(0, (renderedH - visibleDiameter) / 2);

  // Slider extremes now always map to the maximum useful movement.
  const offsetX = (Math.max(-PAN_X_LIMIT, Math.min(PAN_X_LIMIT, x)) / PAN_X_LIMIT) * maxOffsetX;
  const yLimit = y < 0 ? PAN_Y_UP_LIMIT : PAN_Y_DOWN_LIMIT;
  const offsetY = (Math.max(-yLimit, Math.min(yLimit, y)) / Math.max(1, yLimit)) * maxOffsetY;

  ctx.save();
  ctx.translate(size / 2 + offsetX, size / 2 + offsetY);
  ctx.rotate(radians);
  ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

export default function ProfilePhotoEditor({ file, onCancel, onSave }) {
  const [source, setSource] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState("cover");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const previewCanvasRef = useRef(null);
  const exportCanvasRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    let active = true;
    let url = "";
    if (!file) return undefined;

    setLoadError("");
    void loadImage(file).then((loaded) => {
      url = loaded.url;
      if (active) setSource(loaded.img);
      else URL.revokeObjectURL(loaded.url);
    }).catch((error) => {
      if (active) {
        setSource(null);
        setLoadError(error?.message || "Bild konnte nicht geladen werden.");
      }
    });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (!source) return;
    drawEditedImage(
      previewCanvasRef.current,
      source,
      { zoom, x, y, rotation, mode },
      PREVIEW_SIZE
    );
  }, [source, zoom, x, y, rotation, mode]);

  const circleFillZoom = source ? cropGeometry(source, rotation, PREVIEW_SIZE).circleFillZoom : 0.84;
  const minZoom = Math.max(0.1, circleFillZoom);
  const zoomSliderValue = Math.max(0, Math.min(100,
    ((zoom - minZoom) / Math.max(0.0001, MAX_ZOOM - minZoom)) * 100
  ));
  const zoomFromSlider = (value) => {
    const position = Math.max(0, Math.min(100, Number(value))) / 100;
    return minZoom + (MAX_ZOOM - minZoom) * position;
  };
  const clampPanX = (value) => Math.max(-PAN_X_LIMIT, Math.min(PAN_X_LIMIT, value));
  const clampPanY = (value) => Math.max(-PAN_Y_UP_LIMIT, Math.min(PAN_Y_DOWN_LIMIT, value));

  const applyPan = (nextX, nextY) => {
    setX(clampPanX(nextX));
    setY(clampPanY(nextY));
  };

  const startDrag = (event) => {
    if (!source || busy || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: x,
      startY: y
    };
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const nextX = drag.startX + ((event.clientX - drag.startClientX) / width) * 120;
    const nextY = drag.startY + ((event.clientY - drag.startClientY) / height) * 300;
    applyPan(nextX, nextY);
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    dragRef.current = null;
  };

  const reset = () => {
    setZoom(1);
    setX(0);
    setY(0);
    setRotation(0);
    setMode("cover");
  };

  const nudge = (dx, dy) => {
    applyPan(x + dx, y + dy);
  };

  const fillCircle = () => {
    setMode("cover");
    setZoom(Math.max(1, circleFillZoom));
    setX(0);
    setY(0);
  };

  const showWholePhoto = () => {
    setMode("contain");
    setZoom(1);
    setX(0);
    setY(0);
  };

  const centerImage = () => {
    setX(0);
    setY(0);
  };

  const exportImage = async () => {
    if (!source || busy) return;
    setBusy(true);
    setSaveError("");
    try {
      const canvas = exportCanvasRef.current;
      drawEditedImage(canvas, source, { zoom, x, y, rotation, mode }, SIZE);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.92)
      );
      if (!blob) throw new Error("Profilbild konnte nicht verarbeitet werden.");

      const edited = new File(
        [blob],
        `profilbild-${Date.now()}.webp`,
        { type: "image/webp" }
      );
      await onSave(edited);
    } catch (error) {
      setSaveError(error?.message || "Profilbild konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const saveOriginal = async () => {
    if (!file || busy) return;
    setBusy(true);
    setSaveError("");
    try {
      await onSave(file);
    } catch (error) {
      setSaveError(error?.message || "Profilbild konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  if (!file) return null;

  return <div className="ec-photo-editor-backdrop" role="dialog" aria-modal="true" aria-label="Profilbild anpassen">
    <section className="ec-photo-editor">
      <header>
        <div>
          <span className="eyebrow">PROFILBILD</span>
          <h2>Foto anpassen</h2>
          <p>Ziehe das Bild direkt im Kreis oder nutze die Regler. Du kannst zwischen engem Profil-Ausschnitt und vollständigem Foto wechseln.</p>
        </div>
        <button type="button" className="ec-photo-editor-close" onClick={onCancel} aria-label="Schließen">×</button>
      </header>

      <div className="ec-photo-editor-workspace">
        <div
          className={`ec-photo-editor-preview${source ? " is-draggable" : ""}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={() => { dragRef.current = null; }}
          onTouchStart={event => { if (event.touches.length > 1) event.preventDefault(); }}
          onTouchMove={event => { if (event.touches.length > 1) event.preventDefault(); }}
          aria-label={source ? "Profilbild-Vorschau. Bild mit Finger oder Maus verschieben." : undefined}
        >
          {source
            ? <canvas ref={previewCanvasRef} aria-label="Profilbild-Vorschau"/>
            : loadError
              ? <div className="ec-photo-editor-load-error"><strong>Vorschau kann nicht geöffnet werden.</strong><span>{loadError}</span><small>Das Foto kann trotzdem direkt als Profilbild hochgeladen werden.</small><button type="button" className="primary-button" onClick={saveOriginal} disabled={busy}>{busy ? "Wird hochgeladen …" : "Foto ohne Zuschnitt verwenden"}</button></div>
              : <span>Bild wird geladen …</span>}
          <div className="ec-photo-editor-circle" aria-hidden="true"/>
        </div>

        <div className="ec-photo-editor-controls">
          <div className="ec-photo-editor-mode" role="group" aria-label="Bildmodus">
            <button type="button" className={mode === "cover" ? "is-active" : ""} onClick={() => { setMode("cover"); setZoom(Math.max(1, circleFillZoom)); setX(0); setY(0); }}>Profilkreis füllen</button>
            <button type="button" className={mode === "contain" ? "is-active" : ""} onClick={showWholePhoto}>Ganzes Foto</button>
          </div>
          {mode === "contain" && (
            <div className="ec-photo-editor-whole-note" role="status">
              Das komplette Foto bleibt sichtbar. Mit „Oben / unten“ kannst du es jetzt trotzdem sauber verschieben – ohne weißen Hintergrund.
            </div>
          )}
          {mode !== "contain" && (
            <label>
              <span>Zoom</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={zoomSliderValue}
                onInput={e => setZoom(zoomFromSlider(e.currentTarget.value))}
                onChange={e => setZoom(zoomFromSlider(e.currentTarget.value))}
                aria-label="Profilbild Zoom"
              />
              <b>{zoomSliderValue <= 1 ? "Weit" : Math.round(zoom * 100) + "%"}</b>
            </label>
          )}
          <label>
            <span>Links / rechts</span>
            <input type="range" min={-PAN_X_LIMIT} max={PAN_X_LIMIT} step="1" value={x} onChange={e => applyPan(Number(e.target.value), y)}/>
            <b>{x}</b>
          </label>
          <label>
            <span>Oben / unten</span>
            <input type="range" min={-PAN_Y_UP_LIMIT} max={PAN_Y_DOWN_LIMIT} step="1" value={y} onChange={e => applyPan(x, Number(e.target.value))}/>
            <b>{y}</b>
          </label>
          <div className="ec-photo-editor-nudges" aria-label="Bild fein verschieben">
            <button type="button" onClick={() => nudge(0,-12)} aria-label="Bild nach oben">↑</button>
            <button type="button" onClick={() => nudge(-12,0)} aria-label="Bild nach links">←</button>
            <button type="button" onClick={() => nudge(12,0)} aria-label="Bild nach rechts">→</button>
            <button type="button" onClick={() => nudge(0,12)} aria-label="Bild nach unten">↓</button>
          </div>
          <div className="ec-photo-editor-rotate">
            <button type="button" onClick={fillCircle}>Profilkreis füllen</button>
            <button type="button" onClick={showWholePhoto}>Ganzes Foto</button>
            <button type="button" onClick={centerImage}>Bild zentrieren</button>
            <button type="button" onClick={() => setRotation(v => v - 90)}>↶ Links drehen</button>
            <button type="button" onClick={() => setRotation(v => v + 90)}>↷ Rechts drehen</button>
            <button type="button" onClick={reset}>Zurücksetzen</button>
          </div>
        </div>
      </div>

      {saveError && <div className="ec-photo-editor-save-error" role="alert">{saveError}</div>}
      <footer>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="button" className="secondary-button" onClick={saveOriginal} disabled={busy}>{busy ? "Wird hochgeladen …" : "Ohne Zuschnitt verwenden"}</button>
        <button type="button" className="primary-button" onClick={exportImage} disabled={busy || !source}>
          {busy ? "Wird gespeichert …" : "Profilbild übernehmen"}
        </button>
      </footer>

      <canvas ref={exportCanvasRef} hidden/>
    </section>
  </div>;
}
