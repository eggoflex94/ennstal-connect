import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ProfilePhotoEditor.css";

const SIZE = 900;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bild konnte nicht geladen werden.")); };
    img.src = url;
  });
}

export default function ProfilePhotoEditor({ file, onCancel, onSave }) {
  const [source, setSource] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    let active = true;
    let url = "";
    if (!file) return undefined;
    void loadImage(file).then((loaded) => {
      url = loaded.url;
      if (active) setSource(loaded.img);
      else URL.revokeObjectURL(loaded.url);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const previewStyle = useMemo(() => ({
    transform: `translate(${x}%, ${y}%) scale(${zoom}) rotate(${rotation}deg)`
  }), [x, y, zoom, rotation]);

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
      const canvas = canvasRef.current;
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIZE, SIZE);

      const radians = rotation * Math.PI / 180;
      const quarter = Math.abs(rotation % 180) === 90;
      const baseW = quarter ? source.naturalHeight : source.naturalWidth;
      const baseH = quarter ? source.naturalWidth : source.naturalHeight;
      const cover = Math.max(SIZE / baseW, SIZE / baseH) * zoom;
      const drawW = source.naturalWidth * cover;
      const drawH = source.naturalHeight * cover;
      const offsetX = (x / 100) * SIZE * 0.48;
      const offsetY = (y / 100) * SIZE * 0.48;

      ctx.save();
      ctx.translate(SIZE / 2 + offsetX, SIZE / 2 + offsetY);
      ctx.rotate(radians);
      ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
      if (!blob) throw new Error("Profilbild konnte nicht verarbeitet werden.");
      const edited = new File([blob], `profilbild-${Date.now()}.webp`, { type: "image/webp" });
      await onSave(edited);
    } finally {
      setBusy(false);
    }
  };

  if (!file) return null;

  return <div className="ec-photo-editor-backdrop" role="dialog" aria-modal="true" aria-label="Profilbild anpassen">
    <section className="ec-photo-editor">
      <header>
        <div><span className="eyebrow">PROFILBILD</span><h2>Foto anpassen</h2><p>Richte das Bild so aus, wie es später im runden Profilbild erscheinen soll.</p></div>
        <button type="button" className="ec-photo-editor-close" onClick={onCancel} aria-label="Schließen">×</button>
      </header>

      <div className="ec-photo-editor-workspace">
        <div className="ec-photo-editor-preview">
          {source ? <img src={source.src} alt="Profilbild-Vorschau" style={previewStyle}/> : <span>Bild wird geladen …</span>}
          <div className="ec-photo-editor-circle" aria-hidden="true"/>
        </div>

        <div className="ec-photo-editor-controls">
          <label><span>Zoom</span><input type="range" min="1" max="2.8" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))}/><b>{Math.round(zoom * 100)}%</b></label>
          <label><span>Links / rechts</span><input type="range" min="-55" max="55" step="1" value={x} onChange={e => setX(Number(e.target.value))}/><b>{x}</b></label>
          <label><span>Oben / unten</span><input type="range" min="-55" max="55" step="1" value={y} onChange={e => setY(Number(e.target.value))}/><b>{y}</b></label>
          <div className="ec-photo-editor-rotate">
            <button type="button" onClick={() => setRotation(v => v - 90)}>↶ Links drehen</button>
            <button type="button" onClick={() => setRotation(v => v + 90)}>↷ Rechts drehen</button>
            <button type="button" onClick={reset}>Zurücksetzen</button>
          </div>
        </div>
      </div>

      <footer>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="button" className="primary-button" onClick={exportImage} disabled={busy || !source}>{busy ? "Wird gespeichert …" : "Profilbild übernehmen"}</button>
      </footer>
      <canvas ref={canvasRef} hidden/>
    </section>
  </div>;
}
