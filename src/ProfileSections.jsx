import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import './profile-sections.css';

const VISIBILITY = { PUBLIC: 'Alle Mitglieder', FRIENDS: 'Nur Freunde', PRIVATE: 'Nur ich' };
const COLORS = ['#243b4b', '#a12640', '#175f91', '#296845', '#725015', '#71438f'];
const BACKGROUNDS = ['#ffffff', '#f5f8fa', '#fff3eb', '#eef6fb', '#eef7f1', '#f6f0fb', '#172b3a'];
const FONTS = { modern: 'Arial, sans-serif', classic: 'Georgia, serif', mono: 'monospace' };
const BUCKET = 'profile-layout-media';
const blank = kind => ({ kind, title: '', body: '', visibility: 'PRIVATE', appearance: { color: COLORS[0], background: BACKGROUNDS[0], size: 'normal', font: 'modern', align: 'left', style: 'card' } });

function PrivateImage({ path, alt }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    let current = '';
    setUrl('');
    if (!path || !supabase) return undefined;
    supabase.storage.from(BUCKET).download(path).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      current = URL.createObjectURL(data);
      setUrl(current);
    });
    return () => {
      cancelled = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [path]);
  return url ? <img src={url} alt={alt || 'Profilfoto'} loading="lazy"/> : <span className="profile-image-loading">Bild wird geladen …</span>;
}

export default function ProfileSections({ member, editable = false, preview = false, isFriend = false, children }) {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const [folder, setFolder] = useState('PUBLIC');

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setLoaded(false);
    setDraft(null);
    setFile(null);
    setError('');
    setNotice('');
    setFolder('PUBLIC');
    if (!supabase || !member?.id) return undefined;

    supabase
      .from('profile_sections')
      .select('*')
      .eq('owner_id', member.id)
      .order('sort_order')
      .order('created_at')
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        setItems(data || []);
        setLoaded(true);
        if (loadError) setError('Der persönliche Profilbereich konnte nicht geladen werden. Bitte lade die Seite neu.');
      });

    return () => { cancelled = true; };
  }, [member?.id]);

  const canSeeVisibility = visibility => {
    if (editable) return true;
    if (preview) return visibility === 'PUBLIC';
    return visibility === 'PUBLIC' || (visibility === 'FRIENDS' && isFriend);
  };

  const visibleItems = useMemo(() => items.filter(item => canSeeVisibility(item.visibility || 'PRIVATE')), [items, editable, preview, isFriend]);
  const visibleLegacy = key => editable || (!preview && isFriend && member?.privacy_settings?.[key] === 'FRIENDS') || (member?.privacy_settings?.[key] || 'PUBLIC') === 'PUBLIC';
  const fields = visibleItems.filter(x => x.kind === 'FIELD');
  const blocks = visibleItems.filter(x => x.kind === 'TEXT' || x.kind === 'IMAGE');
  const photos = visibleItems.filter(x => x.kind === 'PHOTO');
  const legacyFields = [
    ['Wohnort', 'location', member.location],
    ['Hobbys', 'interests', Array.isArray(member.interests) ? member.interests.join(', ') : member.interests],
    ['Webseite', 'website', member.website]
  ].filter(([title, key, value]) => value && visibleLegacy(key) && !fields.some(x => String(x.title || '').toLowerCase() === title.toLowerCase()));
  const legacyBioVisible = Boolean(member?.bio && visibleLegacy('bio'));

  const start = (kind, title = '') => {
    setDraft({ ...blank(kind), title });
    setFile(null);
    setError('');
    setNotice('');
  };
  const patch = value => setDraft(current => current ? ({ ...current, ...value }) : current);
  const appearance = value => patch({ appearance: { ...(draft?.appearance || {}), ...value } });

  async function save(event) {
    event.preventDefault();
    if (!editable || busy || !draft) return;
    setBusy(true);
    setError('');
    let uploaded = '';
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || user?.id !== member.id) throw new Error('Bitte melde dich erneut an.');
      if (file) {
        const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
        if (!extensions[file.type] || file.size > 5 * 1024 * 1024) throw new Error('Bitte JPG, PNG, WebP oder GIF bis 5 MB auswählen.');
        uploaded = `${user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(uploaded, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      if (['IMAGE', 'PHOTO'].includes(draft.kind) && !uploaded && !draft.media_path) throw new Error('Bitte ein Bild auswählen.');
      const payload = {
        id: draft.id || crypto.randomUUID(),
        owner_id: member.id,
        kind: draft.kind,
        title: String(draft.title || '').trim(),
        body: String(draft.body || '').trim(),
        visibility: draft.visibility,
        appearance: draft.appearance || {},
        media_path: uploaded || draft.media_path || null,
        sort_order: draft.sort_order ?? items.length
      };
      const { data, error: saveError } = await supabase.from('profile_sections').upsert(payload).select().single();
      if (saveError) throw saveError;
      setItems(current => [...current.filter(x => x.id !== data.id), data].sort((a, b) => a.sort_order - b.sort_order));
      if (draft.kind === 'PHOTO') setFolder(draft.visibility);
      setDraft(null);
      setFile(null);
      setNotice('Gespeichert.');
    } catch (saveError) {
      if (uploaded) await supabase.storage.from(BUCKET).remove([uploaded]);
      setError(saveError.message || 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  const edit = item => {
    setDraft({ ...item, appearance: { ...blank(item.kind).appearance, ...(item.appearance || {}) } });
    setFile(null);
    setNotice('');
  };

  async function remove(item) {
    if (!editable || busy || !window.confirm('Diesen Profilinhalt wirklich löschen?')) return;
    setBusy(true);
    setError('');
    try {
      const { error: removeError } = await supabase.from('profile_sections').delete().eq('id', item.id).eq('owner_id', member.id);
      if (removeError) throw removeError;
      setItems(current => current.filter(x => x.id !== item.id));
      setNotice('Entfernt.');
    } catch (removeError) {
      setError(removeError.message || 'Entfernen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  const itemActions = item => editable && (
    <div className="profile-item-actions">
      <button type="button" className="text-button" onClick={() => edit(item)}>Bearbeiten</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => remove(item)}>Entfernen</button>
    </div>
  );
  const shownFolders = Object.keys(VISIBILITY).filter(key => editable || photos.some(x => x.visibility === key));

  const storyStyle = item => {
    const a = { ...blank(item.kind).appearance, ...(item.appearance || {}) };
    const background = BACKGROUNDS.includes(a.background) ? a.background : BACKGROUNDS[0];
    let color = COLORS.includes(a.color) ? a.color : COLORS[0];
    if (background === '#172b3a' && (!a.color || a.color === COLORS[0])) color = '#ffffff';
    return {
      color,
      background,
      fontFamily: FONTS[a.font] || FONTS.modern,
      fontSize: ({ small: 14, normal: 17, large: 23 })[a.size] || 17,
      textAlign: ['left', 'center', 'right'].includes(a.align) ? a.align : 'left'
    };
  };

  return (
    <section className="personal-profile-sections" data-profile-owner={member?.id || ''}>
      {editable && <header className="profile-section-heading"><div><span className="eyebrow">DEIN PERSÖNLICHER BEREICH</span><h2>Dein Profil gestalten</h2><p>Persönliche Angaben, dein „Das bin ich“-Bereich und Fotos werden hier getrennt und übersichtlich verwaltet.</p></div></header>}
      {error && <p role="alert" className="profile-section-error">{error}</p>}
      {notice && <p role="status" className="profile-section-notice">{notice}</p>}
      {!loaded && <div className="profile-section-loading" aria-live="polite"><span/>Profilbereich wird geladen …</div>}

      {loaded && <aside className="profile-facts panel"><span className="eyebrow">STECKBRIEF</span><h2>Profilinformationen</h2><dl>
        {legacyFields.map(([title, , value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}
        {fields.map(item => <div key={item.id}><dt>{item.title}</dt><dd>{item.body}</dd>{editable && <small>{VISIBILITY[item.visibility]}</small>}{itemActions(item)}</div>)}
      </dl>{!fields.length && !legacyFields.length && <p>Noch keine Angaben.</p>}{editable && <div className="profile-add-actions"><button type="button" onClick={() => start('FIELD', 'Wohnort')}>Wohnort</button><button type="button" onClick={() => start('FIELD', 'Hobbys')}>Hobbys</button><button type="button" onClick={() => start('FIELD', 'Beruf')}>Beruf</button><button type="button" onClick={() => start('FIELD')}>+ Eigenes Feld</button></div>}</aside>}

      {loaded && children}

      {loaded && (legacyBioVisible || blocks.length > 0 || editable) && <section className="profile-story panel"><div className="profile-story-heading"><div><span className="eyebrow">PERSÖNLICH</span><h2>Das bin ich</h2><p>Ein eigener Bereich für deine Geschichte, Bilder und persönliche Gestaltung.</p></div>{editable && <button type="button" className="secondary-button" onClick={() => start('TEXT', 'Über mich')}>+ Textblock</button>}</div>
        <div className="profile-story-stack">
          {legacyBioVisible && <article className="profile-story-block profile-story-legacy style-card" style={{ color: member.bio_color || COLORS[0], background: '#ffffff', fontFamily: FONTS[member.bio_font] || FONTS.modern, fontSize: ({ small: 14, normal: 17, large: 23 })[member.bio_size] || 17, textAlign: 'left' }}><span className="profile-story-kicker">ÜBER MICH</span><p className="profile-story-text">{member.bio}</p>{editable && <small className="profile-story-hint">Dieser bestehende Profiltext kann im Profilformular geändert werden. Für frei gestaltbare Farben und Hintergründe nutze zusätzliche Textblöcke.</small>}</article>}
          {blocks.map(item => {
            const a = { ...blank(item.kind).appearance, ...(item.appearance || {}) };
            return <article key={item.id} className={`profile-story-block style-${['plain', 'card', 'quote'].includes(a.style) ? a.style : 'card'}`} style={storyStyle(item)}>{item.title && <h3>{item.title}</h3>}{item.kind === 'IMAGE' && <PrivateImage path={item.media_path} alt={item.title}/>}<p className="profile-story-text">{item.body}</p>{editable && <small className="profile-story-visibility">{VISIBILITY[item.visibility]}</small>}{itemActions(item)}</article>;
          })}
          {editable && !legacyBioVisible && !blocks.length && <div className="profile-story-empty"><strong>Hier ist Platz für dich.</strong><span>Erstelle einen modernen Text- oder Bildblock und wähle Farbe, Hintergrund, Schrift und Sichtbarkeit.</span></div>}
        </div>
        {editable && <div className="profile-add-actions profile-story-add"><button type="button" onClick={() => start('TEXT')}>+ Textabschnitt</button><button type="button" onClick={() => start('IMAGE')}>+ Bildabschnitt</button></div>}
      </section>}

      {loaded && (photos.length > 0 || editable) && <section className="profile-folders panel"><span className="eyebrow">FOTOORDNER</span><h2>{editable ? 'Meine persönlichen Profilfotos' : 'Persönliche Profilfotos'}</h2><div className="profile-folder-tabs">{shownFolders.map(key => <button type="button" key={key} className={folder === key ? 'active' : ''} onClick={() => setFolder(key)}>{key === 'PUBLIC' ? 'Öffentlich' : key === 'FRIENDS' ? 'Freunde' : 'Privat'} · {photos.filter(x => x.visibility === key).length}</button>)}{editable && <button type="button" onClick={() => start('PHOTO')}>+ Foto hinzufügen</button>}</div><div className="profile-folder-grid">{photos.filter(x => x.visibility === folder).map(item => <figure key={item.id}><PrivateImage path={item.media_path} alt={item.title}/><figcaption>{item.title}</figcaption>{itemActions(item)}</figure>)}</div>{!photos.some(x => x.visibility === folder) && <p>In diesem Ordner sind noch keine sichtbaren Fotos.</p>}</section>}

      {editable && draft && <div className="profile-section-modal" role="dialog" aria-modal="true" aria-label="Profilinhalt bearbeiten"><form onSubmit={save} className="profile-section-form"><header><h2>{draft.kind === 'FIELD' ? 'Steckbrief-Feld' : draft.kind === 'PHOTO' ? 'Foto' : draft.kind === 'IMAGE' ? 'Bildabschnitt' : 'Textabschnitt'}</h2><button type="button" disabled={busy} onClick={() => setDraft(null)} aria-label="Bearbeitung schließen">×</button></header><label>{draft.kind === 'FIELD' ? 'Feldname' : 'Überschrift / Bildbeschreibung'}<input value={draft.title} onChange={e => patch({ title: e.target.value })} maxLength={100} required={draft.kind === 'FIELD'} autoFocus/></label>{draft.kind !== 'PHOTO' && <label>{draft.kind === 'FIELD' ? 'Deine Angabe' : 'Text'}<textarea value={draft.body} onChange={e => patch({ body: e.target.value })} maxLength={10000} rows={draft.kind === 'FIELD' ? 3 : 7} required={draft.kind === 'FIELD' || draft.kind === 'TEXT'}/></label>}
        {['IMAGE', 'PHOTO'].includes(draft.kind) && <label>Bild (bis 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setFile(e.target.files?.[0] || null)}/></label>}
        {['TEXT', 'IMAGE'].includes(draft.kind) && <div className="profile-format-toolbar"><label>Textfarbe<select value={draft.appearance?.color || COLORS[0]} onChange={e => appearance({ color: e.target.value })}>{COLORS.map((c, i) => <option value={c} key={c}>{['Dunkel', 'Rot', 'Blau', 'Grün', 'Gold', 'Violett'][i]}</option>)}</select></label><label>Hintergrund<select value={draft.appearance?.background || BACKGROUNDS[0]} onChange={e => appearance({ background: e.target.value })}>{BACKGROUNDS.map((c, i) => <option value={c} key={c}>{['Weiß', 'Hellgrau', 'Pfirsich', 'Hellblau', 'Hellgrün', 'Hellviolett', 'Dunkel'][i]}</option>)}</select></label><label>Größe<select value={draft.appearance?.size || 'normal'} onChange={e => appearance({ size: e.target.value })}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label><label>Schrift<select value={draft.appearance?.font || 'modern'} onChange={e => appearance({ font: e.target.value })}><option value="modern">Modern</option><option value="classic">Klassisch</option><option value="mono">Schreibmaschine</option></select></label><label>Ausrichtung<select value={draft.appearance?.align || 'left'} onChange={e => appearance({ align: e.target.value })}><option value="left">Links</option><option value="center">Mittig</option><option value="right">Rechts</option></select></label><label>Darstellung<select value={draft.appearance?.style || 'card'} onChange={e => appearance({ style: e.target.value })}><option value="plain">Minimal</option><option value="card">Karte</option><option value="quote">Zitat</option></select></label></div>}
        <label>Sichtbar für<select value={draft.visibility} onChange={e => patch({ visibility: e.target.value })}>{Object.entries(VISIBILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Wird gespeichert …' : 'Speichern'}</button></form></div>}
    </section>
  );
}
