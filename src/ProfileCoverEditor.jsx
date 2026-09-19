import React, { useEffect, useMemo, useState } from "react";
import "./ProfileCoverEditor.css";

export default function ProfileCoverEditor({ file, current, onCancel, onSave }) {
  const [url, setUrl] = useState("");
  const [x, setX] = useState(Number(current?.x ?? 50));
  const [y, setY] = useState(Number(current?.y ?? 50));
  const [zoom, setZoom] = useState(Number(current?.zoom ?? 1));
  const [overlay, setOverlay] = useState(Number(current?.overlay ?? 0.18));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return undefined;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const imageStyle = useMemo(() => ({
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${x}% ${y}%`,
  }), [x, y, zoom]);

  const save = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await onSave(file, { x, y, zoom, overlay });
    } finally {
      setBusy(false);
    }
  };

  if (!file) return null;

  return <div className="ec-cover-editor-backdrop" role="dialog" aria-modal="true" aria-label="Profilhintergrund anpassen">
    <section className="ec-cover-editor">
      <header>
        <div>
          <span className="eyebrow">PROFIL-COVER</span>
          <h2>Hintergrund anpassen</h2>
          <p>Wähle den Ausschnitt, der oben in deinem öffentlichen Profil angezeigt wird.</p>
        </div>
        <button type="button" className="ec-cover-editor-close" onClick={onCancel} aria-label="Schließen">×</button>
      </header>

      <div className="ec-cover-editor-preview">
        {url && <img src={url} alt="Cover-Vorschau" style={imageStyle}/>}
        <div className="ec-cover-editor-overlay" style={{ background:`rgba(10,24,36,${overlay})` }}/>
        <div className="ec-cover-editor-demo">
          <span className="ec-cover-editor-avatar">★</span>
          <div><small>DEIN PROFIL</small><strong>So wirkt dein Cover</strong></div>
        </div>
      </div>

      <div className="ec-cover-editor-controls">
        <label><span>Links / rechts</span><input type="range" min="0" max="100" step="1" value={x} onChange={e=>setX(Number(e.target.value))}/><b>{x}%</b></label>
        <label><span>Oben / unten</span><input type="range" min="0" max="100" step="1" value={y} onChange={e=>setY(Number(e.target.value))}/><b>{y}%</b></label>
        <label><span>Zoom</span><input type="range" min="1" max="2.5" step="0.01" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><b>{Math.round(zoom*100)}%</b></label>
        <label><span>Abdunklung</span><input type="range" min="0" max="0.7" step="0.01" value={overlay} onChange={e=>setOverlay(Number(e.target.value))}/><b>{Math.round(overlay*100)}%</b></label>
      </div>

      <footer>
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="button" className="primary-button" onClick={save} disabled={busy}>{busy ? "Wird gespeichert …" : "Cover übernehmen"}</button>
      </footer>
    </section>
  </div>;
}
