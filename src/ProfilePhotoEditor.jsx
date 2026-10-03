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
  const visibleDiameter = size * (1 - CIRCLE_INSET_RATIO * 2);
  const renderedMinDimension = Math.min(rotatedWidth * coverScale, rotatedHeight * coverScale);
  const circleFillZoom = Math.max(0.1, visibleDiameter / Math.max(renderedMinDimension, 0.0001));
  return { quarterTurn, coverScale, circleFillZoom };
}

function drawEditedImage(canvas, source, { zoom, x, y, rotation }, size) {
  if (!canvas || !source) return;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  ctx.fillStyle = "#f3f6f8";
  ctx.fillRect(0, 0, size, size);

  const { quarterTurn, coverScale } = cropGeometry(source, rotation, size);
  const scale = coverScale * zoom;
  const drawW = source.naturalWidth * scale;
  const drawH = source.naturalHeight * scale;
  const renderedW = quarterTurn ? drawH : drawW;
  const renderedH = quarterTurn ? drawW : drawH;
  // The visible avatar is circular and inset from the square canvas.
  // Allow movement as long as the circle remains covered; the square corners
  // are outside the final avatar and must not unnecessarily lock panning.
  const visibleDiameter = size * (1 - CIRCLE_INSET_RATIO * 2);
  const maxOffsetX = Math.max(0, (renderedW - visibleDiameter) / 2);
  const maxOffsetY = Math.max(0, (renderedH - visibleDiameter) / 2);
  const requested = panOffsets(x, y, size);
  const offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, requested.x));
  const offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, requested.y));
  const radians = rotation * Math.PI / 180;

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
      { zoom, x, y, rotation },
      PREVIEW_SIZE
    );
  }, [source, zoom, x, y, rotation]);

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
  };

  const nudge = (dx, dy) => {
    applyPan(x + dx, y + dy);
  };

  const fillCircle = () => {
    setZoom(minZoom);
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
      drawEditedImage(canvas, source, { zoom, x, y, rotation }, SIZE);

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
          <p>Ziehe das Bild direkt im Kreis oder nutze die Regler. Der sichtbare Profilkreis bleibt dabei immer vollständig mit deinem Foto gefüllt.</p>
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
            <button type="button" onClick={fillCircle}>Kreis vollständig füllen</button>
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
