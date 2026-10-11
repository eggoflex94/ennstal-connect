import React, { useEffect, useRef, useState } from 'react';
import { MAGAZINE_LABELS, MAGAZINE_PAGES, normalizeMagazine, safeImageUrl, upcomingMagazineEvents } from './homeMagazine.js';

const navigate = page => window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page, source: 'homepage-magazine' } }));
function MagazineImage({ src, ...props }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const url = safeImageUrl(src);
  if (!url || failed) return null;
  return <img {...props} src={url} onError={() => setFailed(true)}/>;
}

export function HomeMagazine({ config, region, events, groups, sections, canEdit, onEdit, onDelete, preview = false }) {
  const upcoming = upcomingMagazineEvents(events, region?.id);
  const blocks = {
    hero: <section className={`ec-magazine-hero is-${config.heroHeight}`} aria-label="Willkommen in deiner Region">
      <MagazineImage src={config.heroImage} alt="" style={{ objectPosition: config.heroPosition }} fetchpriority="high"/>
      <div className="ec-magazine-hero-copy"><span className="ec-magazine-kicker">DEINE REGIONALE COMMUNITY · {region?.name || 'Ennstal Connect'}</span><h2>{config.title}</h2><p>{config.intro}</p>
        <div className="ec-magazine-hero-actions"><button type="button" className="primary-button" disabled={preview} onClick={() => navigate('community')}>Community entdecken →</button><button type="button" className="secondary-button" disabled={preview} onClick={() => { const picker = document.querySelector('.ec-region-picker select'); picker?.scrollIntoView({ behavior: 'smooth', block: 'center' }); picker?.focus(); }}>Region wechseln</button></div>
      </div><span className="ec-magazine-region">{region?.name || 'Deine Region'}</span>
    </section>,
    categories: <section className="ec-magazine-categories" aria-label="Bilder-Kategorien"><header className="ec-magazine-section-head"><div><span className="eyebrow">REGIONAL VERBUNDEN</span><h2>Entdecke deine Community</h2></div></header><div className="ec-magazine-category-grid">{config.categories.map((category, index) => <button key={index} type="button" className="ec-magazine-category" disabled={preview} onClick={() => navigate(category.page)}>
      <MagazineImage src={category.image} alt="" loading="lazy" style={{ objectPosition: ['center', 'left', 'right', 'bottom'][index] }}/><span><small>{category.subtitle}</small><strong>{category.title}</strong><b aria-hidden="true">↗</b></span>
    </button>)}</div></section>,
    events: <section className="ec-magazine-events" aria-label="Veranstaltungen"><header className="ec-magazine-section-head"><div><span className="eyebrow">GEMEINSAM ERLEBEN</span><h2>Demnächst in {region?.name || 'deiner Region'}</h2></div><button type="button" disabled={preview} onClick={() => navigate('events')}>Alle Veranstaltungen →</button></header>
      {upcoming.length ? <div className="ec-magazine-event-grid">{upcoming.map(event => <button type="button" key={event.id} disabled={preview} className="ec-magazine-event" onClick={() => navigate('events')}><div className="ec-magazine-event-image"><MagazineImage src={event.image_url} alt="" loading="lazy"/><time dateTime={event.event_at}><b>{new Date(event.event_at).toLocaleDateString('de-AT', { day: '2-digit', timeZone: 'Europe/Vienna' })}</b>{new Date(event.event_at).toLocaleDateString('de-AT', { month: 'short', timeZone: 'Europe/Vienna' })}</time></div><div><h3>{event.title}</h3><p>{new Date(event.event_at).toLocaleString('de-AT', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })}{event.location && ` · ${event.location}`}</p><span>Veranstaltungen öffnen →</span></div></button>)}</div> : <div className="ec-magazine-empty"><strong>Neue Erlebnisse kommen bald.</strong><p>Aktuell gibt es keine bevorstehenden Veranstaltungen in {region?.name || 'deiner Region'}.</p><button type="button" disabled={preview} onClick={() => navigate('events')}>Veranstaltungen ansehen →</button></div>}
    </section>,
    content: sections.length > 0 ? <section className="ec-magazine-content" aria-label="Freier Inhaltsbereich"><header className="ec-magazine-section-head"><div><span className="eyebrow">REGIONALE HIGHLIGHTS</span><h2>{config.contentTitle}</h2></div></header><div className="ec-magazine-content-grid">{sections.map(row => <article key={row.id} className={`ec-magazine-content-card is-${row.frame_style || 'standard'}`}>
      {row.image_url && <MagazineImage src={row.image_url} alt="" loading="lazy"/>}<div><h3>{row.title}</h3><p>{row.content}</p>{canEdit && !preview && <div className="content-manage-actions"><button type="button" onClick={() => onEdit(row)}>Bearbeiten</button><button type="button" className="danger-button" onClick={() => onDelete(row)}>Löschen</button></div>}</div>
    </article>)}</div></section> : canEdit ? <section className="ec-magazine-empty"><h3>{config.contentTitle}</h3><p>Hier erscheinen deine Beiträge mit Text und Bildern. Füge sie unten im Startseiten-Editor hinzu.</p></section> : null
  };
  return <div className="ec-home-magazine" style={{ '--ec-magazine-accent': config.accent }}>{config.order.filter(key => config.visible[key]).map(key => <React.Fragment key={key}>{blocks[key]}</React.Fragment>)}</div>;
}

export function MagazineEditor({ config, region, events, groups, sections, onSave, uploadImage }) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const generation = useRef(0);
  useEffect(() => { generation.current++; setDraft(config); setStatus(''); }, [config]);
  const set = (key, value) => { generation.current++; setDraft(current => ({ ...current, [key]: value })); };
  const category = (index, key, value) => { generation.current++; setDraft(current => ({ ...current, categories: current.categories.map((item, i) => i === index ? { ...item, [key]: value } : item) })); };
  const upload = async (event, apply) => {
    const file = event.target.files?.[0]; if (!file || uploading) return;
    const token = generation.current; setUploading(true); setStatus('Bild wird hochgeladen …');
    try { const url = await uploadImage(file); if (token === generation.current) { apply(url); setStatus('Bild bereit. Zum Veröffentlichen speichern.'); } }
    catch (error) { setStatus(error.message || 'Bild konnte nicht hochgeladen werden.'); }
    finally { setUploading(false); event.target.value = ''; }
  };
  const move = (key, direction) => { const order = [...draft.order]; const index = order.indexOf(key), target = index + direction; if (key === 'hero' || target < 1 || target >= order.length) return; [order[index], order[target]] = [order[target], order[index]]; set('order', order); };
  return <div className="ec-magazine-editor"><h2>Magazin-Layout · {region?.name}</h2><p>Gestalte die Startseite dieser Region. Deine Änderungen werden erst beim Speichern veröffentlicht. Das Titelbild bleibt ganz oben. Fotos erscheinen nur, wenn du sie auswählst oder hochlädst.</p><form onSubmit={async event => { event.preventDefault(); if (saving || uploading) return; setSaving(true); setStatus('Wird gespeichert …'); try { await onSave(normalizeMagazine(draft)); setStatus('✓ Magazin für diese Region gespeichert.'); } catch (error) { setStatus(error.message || 'Speichern fehlgeschlagen.'); } finally { setSaving(false); } }}>
    <fieldset disabled={saving || uploading}><legend>Titelbild & Gestaltung</legend><div className="ec-magazine-fields"><label>Überschrift<input value={draft.title} maxLength={120} required onChange={event => set('title', event.target.value)}/></label><label>Einleitung<textarea value={draft.intro} maxLength={300} onChange={event => set('intro', event.target.value)}/></label><label>Titelbild-URL<input value={draft.heroImage} onChange={event => set('heroImage', event.target.value)} placeholder="https://…"/></label><label>Titelbild hochladen<input type="file" accept="image/*" onChange={event => upload(event, url => set('heroImage', url))}/></label><label>Bildausschnitt<select value={draft.heroPosition} onChange={event => set('heroPosition', event.target.value)}><option value="top">Oben</option><option value="center">Mitte</option><option value="bottom">Unten</option></select></label><label>Bildhöhe<select value={draft.heroHeight} onChange={event => set('heroHeight', event.target.value)}><option value="large">Groß</option><option value="compact">Kompakt</option></select></label><label>Akzentfarbe<input type="color" value={draft.accent} onChange={event => set('accent', event.target.value)}/></label><label>Überschrift freier Bereich<input value={draft.contentTitle} maxLength={120} onChange={event => set('contentTitle', event.target.value)}/></label></div></fieldset>
    <fieldset disabled={saving || uploading}><legend>Bereiche & Reihenfolge</legend>{draft.order.map((key, index) => <div className="ec-magazine-order" key={key}><label><input type="checkbox" checked={draft.visible[key]} onChange={event => set('visible', { ...draft.visible, [key]: event.target.checked })}/>{MAGAZINE_LABELS[key]}</label><button type="button" disabled={index <= 1} aria-label={`${MAGAZINE_LABELS[key]} nach oben`} onClick={() => move(key, -1)}>↑</button><button type="button" disabled={key === 'hero' || index === draft.order.length - 1} aria-label={`${MAGAZINE_LABELS[key]} nach unten`} onClick={() => move(key, 1)}>↓</button></div>)}</fieldset>
    <fieldset disabled={saving || uploading}><legend>Bilder-Kategorien</legend><div className="ec-magazine-fields">{draft.categories.map((item, index) => <section className="ec-magazine-category-editor" key={index}><h3>Kategorie {index + 1}</h3><label>Titel<input value={item.title} maxLength={70} required onChange={event => category(index, 'title', event.target.value)}/></label><label>Kurztext<input value={item.subtitle} maxLength={100} onChange={event => category(index, 'subtitle', event.target.value)}/></label><label>Zielbereich<select value={item.page} onChange={event => category(index, 'page', event.target.value)}>{Object.entries(MAGAZINE_PAGES).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><label>Bild-URL<input value={item.image} onChange={event => category(index, 'image', event.target.value)} placeholder="Leer = kein Foto"/></label><label>Bild hochladen<input type="file" accept="image/*" onChange={event => upload(event, url => category(index, 'image', url))}/></label></section>)}</div></fieldset>
    <div className="ec-magazine-editor-actions"><button type="submit" className="primary-button" disabled={saving || uploading}>{saving ? 'Wird gespeichert …' : 'Magazin speichern & veröffentlichen'}</button><button type="button" className="secondary-button" disabled={saving || uploading} onClick={() => { setDraft(config); generation.current++; setStatus('Änderungen zurückgesetzt.'); }}>Änderungen verwerfen</button></div><p role="status">{status}</p>
  </form><details className="ec-magazine-preview"><summary>Vorschau deiner Gestaltung</summary><HomeMagazine config={normalizeMagazine(draft)} region={region} events={events} groups={groups} sections={sections} canEdit preview/></details></div>;
}
