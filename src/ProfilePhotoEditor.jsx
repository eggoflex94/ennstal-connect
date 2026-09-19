import React, { useEffect, useRef, useState } from "react";
import "./ProfilePhotoEditor.css";

const SIZE = 900;
const PREVIEW_SIZE = 720;
const PAN_LIMIT = 120;

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

function drawEditedImage(canvas, source, { zoom, x, y, rotation }, size) {
  if (!canvas || !source) return;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const quarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const rotatedWidth = quarterTurn ? source.naturalHeight : source.naturalWidth;
  const rotatedHeight = quarterTurn ? source.naturalWidth : source.naturalHeight;

  // Cover the square first, then apply the user's zoom and pan.
  // If the user drags farther than the current crop permits, add only the
  // minimum extra zoom needed to keep the crop filled instead of clamping.
  const coverScale = Math.max(size / rotatedWidth, size / rotatedHeight);
  const requestedX = (x / PAN_LIMIT) * size * 0.30;
  const requestedY = (y / PAN_LIMIT) * size * 0.34;

  const baseScale = coverScale * zoom;
  const baseDrawW = source.naturalWidth * baseScale;
  const baseDrawH = source.naturalHeight * baseScale;
  const baseRenderedW = quarterTurn ? baseDrawH : baseDrawW;
  const baseRenderedH = quarterTurn ? baseDrawW : baseDrawH;

  const requiredRenderedW = size + Math.abs(requestedX) * 2;
  const requiredRenderedH = size + Math.abs(requestedY) * 2;
  const adaptiveScale = Math.max(
    1,
    requiredRenderedW / Math.max(1, baseRenderedW),
    requiredRenderedH / Math.max(1, baseRenderedH)
  );

  const scale = baseScale * adaptiveScale;
  const drawW = source.naturalWidth * scale;
  const drawH = source.naturalHeight * scale;
  const renderedW = quarterTurn ? drawH : drawW;
  const renderedH = quarterTurn ? drawW : drawH;
  const maxOffsetX = Math.max(0, (renderedW - size) / 2);
  const maxOffsetY = Math.max(0, (renderedH - size) / 2);
  const offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, requestedX));
  const offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, requestedY));
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

  const clampPan = (value) => Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, value));

  const startDrag = (event) => {
    if (!source || busy) return;
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
    const nextY = drag.startY + ((event.clientY - drag.startClientY) / height) * 150;
    setX(clampPan(nextX));
    setY(clampPan(nextY));
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

  const exportImage = async () => {
    if (!source || busy) return;
    setBusy(true);
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
          <p>Ziehe das Bild direkt mit Finger oder Maus. Wenn du es weiter nach oben oder unten ziehst, zoomt der Ausschnitt automatisch nur so weit nach, dass kein leerer Rand entsteht.</p>
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
          aria-label={source ? "Profilbild-Vorschau. Bild mit Finger oder Maus verschieben." : undefined}
        >
          {source
            ? <canvas ref={previewCanvasRef} aria-label="Profilbild-Vorschau"/>
            : loadError
              ? <div className="ec-photo-editor-load-error"><strong>Bild kann nicht geöffnet werden.</strong><span>{loadError}</span><small>Bitte wähle ein anderes Foto oder speichere es auf dem Handy als JPG/PNG.</small></div>
              : <span>Bild wird geladen …</span>}
          <div className="ec-photo-editor-circle" aria-hidden="true"/>
        </div>

        <div className="ec-photo-editor-controls">
          <label>
            <span>Zoom</span>
            <input type="range" min="1" max="2.8" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))}/>
            <b>{Math.round(zoom * 100)}%</b>
          </label>
          <label>
            <span>Links / rechts</span>
            <input type="range" min={-PAN_LIMIT} max={PAN_LIMIT} step="1" value={x} onChange={e => setX(Number(e.target.value))}/>
            <b>{x}</b>
          </label>
          <label>
            <span>Oben / unten</span>
            <input type="range" min={-PAN_LIMIT} max={PAN_LIMIT} step="1" value={y} onChange={e => setY(Number(e.target.value))}/>
            <b>{y}</b>
          </label>
          <div className="ec-photo-editor-rotate">
            <button type="button" onClick={() => setRotation(v => v - 90)}>↶ Links drehen</button>
            <button type="button" onClick={() => setRotation(v => v + 90)}>↷ Rechts drehen</button>
            <button type="button" onClick={reset}>Zurücksetzen</button>
          </div>
        </div>
      </div>

      <footer>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="button" className="primary-button" onClick={exportImage} disabled={busy || !source}>
          {busy ? "Wird gespeichert …" : "Profilbild übernehmen"}
        </button>
      </footer>

      <canvas ref={exportCanvasRef} hidden/>
    </section>
  </div>;
}
