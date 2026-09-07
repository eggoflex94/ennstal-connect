import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import './profile-sections.css';

const VISIBILITY = { PUBLIC: 'Alle Mitglieder', FRIENDS: 'Nur Freunde', PRIVATE: 'Nur ich' };
const COLORS = ['#243b4b', '#a12640', '#175f91', '#296845', '#725015', '#71438f'];
const FONTS = { modern: 'Arial, sans-serif', classic: 'Georgia, serif', mono: 'monospace' };
const BUCKET = 'profile-layout-media';
const blank = kind => ({ kind, title: '', body: '', visibility: 'PRIVATE', appearance: { color: COLORS[0], size: 'normal', font: 'modern', align: 'left', style: 'plain' } });

function PrivateImage({ path, alt }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let cancelled = false, current = '';
    if (!path || !supabase) return;
    // Authenticated downloads re-check RLS; no publicly shareable storage URL.
    supabase.storage.from(BUCKET).download(path).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      current = URL.createObjectURL(data); setUrl(current);
    });
    return () => { cancelled = true; if (current) URL.revokeObjectURL(current); };
  }, [path]);
  return url ? <img src={url} alt={alt || 'Profilfoto'} loading="lazy"/> : <span className="profile-image-loading">Bild wird geladen …</span>;
}

export default function ProfileSections({ member, editable = false, preview = false, isFriend = false, children }) {
  const [items, setItems] = useState([]), [draft, setDraft] = useState(null), [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false), [notice, setNotice] = useState('');
  const [folder, setFolder] = useState('PUBLIC');
  useEffect(() => {
    let cancelled = false; setItems([]); setLoaded(false); setDraft(null); setError('');
    if (!supabase || !member?.id) return;
    let query = supabase.from('profile_sections').select('*').eq('owner_id', member.id).order('sort_order').order('created_at');
    if (preview) query = query.eq('visibility', 'PUBLIC');
    query.then(({ data, error }) => { if (!cancelled) { setItems(data || []); setLoaded(true); if (error) setError('Der persönliche Profilbereich konnte nicht geladen werden. Bitte lade die Seite neu.'); } });
    return () => { cancelled = true; };
  }, [member?.id, preview]);
  const visibleLegacy = key => editable || (!preview && isFriend && member?.privacy_settings?.[key] === 'FRIENDS') || (member?.privacy_settings?.[key] || 'PUBLIC') === 'PUBLIC';
  const fields = items.filter(x => x.kind === 'FIELD');
  const blocks = items.filter(x => x.kind === 'TEXT' || x.kind === 'IMAGE');
  const photos = items.filter(x => x.kind === 'PHOTO');
  const legacyFields = [['Wohnort', 'location', member.location], ['Hobbys', 'interests', Array.isArray(member.interests) ? member.interests.join(', ') : member.interests], ['Webseite', 'website', member.website]].filter(([title,key,value]) => value && visibleLegacy(key) && !fields.some(x => x.title.toLowerCase() === title.toLowerCase()));
  const start = (kind, title = '') => { setDraft({ ...blank(kind), title }); setFile(null); setError(''); setNotice(''); };
  const patch = value => setDraft(current => ({ ...current, ...value }));
  const appearance = value => patch({ appearance: { ...draft.appearance, ...value } });
  async function save(event) {
    event.preventDefault(); if (!editable || busy) return;
    setBusy(true); setError(''); let uploaded = '';
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || user?.id !== member.id) throw new Error('Bitte melde dich erneut an.');
      if (file) {
        const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
        if (!extensions[file.type] || file.size > 5 * 1024 * 1024) throw new Error('Bitte JPG, PNG, WebP oder GIF bis 5 MB auswählen.');
        uploaded = `${user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
        const { error } = await supabase.storage.from(BUCKET).upload(uploaded, file, { contentType: file.type, upsert: false });
        if (error) throw error;
      }
      if (['IMAGE','PHOTO'].includes(draft.kind) && !uploaded && !draft.media_path) throw new Error('Bitte ein Bild auswählen.');
      const payload = { id: draft.id || crypto.randomUUID(), owner_id: member.id, kind: draft.kind, title: draft.title.trim(), body: draft.body.trim(), visibility: draft.visibility, appearance: draft.appearance || {}, media_path: uploaded || draft.media_path || null, sort_order: draft.sort_order ?? items.length };
      const { data, error } = await supabase.from('profile_sections').upsert(payload).select().single();
      if (error) throw error;
      setItems(current => [...current.filter(x => x.id !== data.id), data].sort((a,b) => a.sort_order - b.sort_order));
      if (draft.kind === 'PHOTO') setFolder(draft.visibility);
      setDraft(null); setFile(null); setNotice('Gespeichert.');
    } catch (error) {
      if (uploaded) await supabase.storage.from(BUCKET).remove([uploaded]);
      setError(error.message || 'Speichern fehlgeschlagen.');
    } finally { setBusy(false); }
  }
  const edit = item => { setDraft({ ...item }); setFile(null); setNotice(''); };
  async function remove(item) {
    if (!editable || busy || !window.confirm('Diesen Profilinhalt wirklich löschen?')) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.from('profile_sections').delete().eq('id',item.id).eq('owner_id',member.id);
      if (error) throw error;
      setItems(current=>current.filter(x=>x.id!==item.id)); setNotice('Entfernt.');
    } catch(error) { setError(error.message || 'Entfernen fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  const itemActions = item => editable && <div className="profile-item-actions"><button className="text-button" onClick={() => edit(item)}>Bearbeiten</button><button className="text-button" disabled={busy} onClick={()=>remove(item)}>Entfernen</button></div>;
  const shownFolders = Object.keys(VISIBILITY).filter(key => editable || photos.some(x => x.visibility === key));
  return <section className="personal-profile-sections">
    {editable && <header className="profile-section-heading"><div><span className="eyebrow">DEIN PERSÖNLICHER BEREICH</span><h2>Dein Profil gestalten</h2><p>Jedes Feld, jeden Text und jedes Foto kannst du einzeln freigeben.</p></div></header>}
    {error && <p role="alert" className="profile-section-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!loaded && <p>Profilbereich wird geladen …</p>}
    <div className="personal-profile-columns"><aside className="profile-facts panel"><span className="eyebrow">STECKBRIEF</span><h2>Über mich</h2><dl>
      {legacyFields.map(([title,,value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}
      {fields.map(item => <div key={item.id}><dt>{item.title}</dt><dd>{item.body}</dd>{editable && <small>{VISIBILITY[item.visibility]}</small>}{itemActions(item)}</div>)}
    </dl>{!fields.length && !legacyFields.length && <p>Noch keine Angaben.</p>}{editable && <div className="profile-add-actions"><button onClick={() => start('FIELD','Wohnort')}>Wohnort</button><button onClick={() => start('FIELD','Hobbys')}>Hobbys</button><button onClick={() => start('FIELD','Beruf')}>Beruf</button><button onClick={() => start('FIELD')}>+ Eigenes Feld</button></div>}</aside>
    <section className="profile-story panel"><span className="eyebrow">MEIN BEREICH</span><h2>Das bin ich</h2>
      {!blocks.length && visibleLegacy('bio') && member.bio && <p className="profile-story-text">{member.bio}</p>}
      {!blocks.length && !member.bio && <p>{editable ? 'Gestalte diesen Bereich mit Texten und Bildern.' : 'Hier gibt es noch keine Beiträge.'}</p>}
      {blocks.map(item => { const a = item.appearance || {}; return <article key={item.id} className={`profile-story-block style-${['plain','card','quote'].includes(a.style) ? a.style : 'plain'}`} style={{color:COLORS.includes(a.color)?a.color:COLORS[0],fontFamily:FONTS[a.font]||FONTS.modern,fontSize:({small:14,normal:17,large:23})[a.size]||17,textAlign:['left','center','right'].includes(a.align)?a.align:'left'}}>{item.title && <h3>{item.title}</h3>}{item.kind === 'IMAGE' && <PrivateImage path={item.media_path} alt={item.title}/>}<p className="profile-story-text">{item.body}</p>{itemActions(item)}</article> })}
      {editable && <div className="profile-add-actions"><button onClick={() => start('TEXT')}>+ Textabschnitt</button><button onClick={() => start('IMAGE')}>+ Bild</button></div>}
    </section></div>
    {children}
    <section className="profile-folders panel"><span className="eyebrow">FOTOORDNER</span><h2>{editable?'Meine Fotos':'Fotos'}</h2><div className="profile-folder-tabs">{shownFolders.map(key => <button key={key} className={folder===key?'active':''} onClick={() => setFolder(key)}>{key==='PUBLIC'?'Öffentlich':key==='FRIENDS'?'Freunde':'Privat'} · {photos.filter(x=>x.visibility===key).length}</button>)}{editable && <button onClick={() => start('PHOTO')}>+ Foto hinzufügen</button>}</div><div className="profile-folder-grid">{photos.filter(x=>x.visibility===folder).map(item=><figure key={item.id}><PrivateImage path={item.media_path} alt={item.title}/><figcaption>{item.title}</figcaption>{itemActions(item)}</figure>)}</div>{!photos.some(x=>x.visibility===folder)&&<p>In diesem Ordner sind noch keine sichtbaren Fotos.</p>}</section>
    {editable && draft && <div className="profile-section-modal" role="dialog" aria-modal="true" aria-label="Profilinhalt bearbeiten"><form onSubmit={save} className="profile-section-form"><header><h2>{draft.kind==='FIELD'?'Steckbrief-Feld':draft.kind==='PHOTO'?'Foto':draft.kind==='IMAGE'?'Bildabschnitt':'Textabschnitt'}</h2><button type="button" disabled={busy} onClick={()=>setDraft(null)} aria-label="Bearbeitung schließen">×</button></header><label>{draft.kind==='FIELD'?'Feldname':'Überschrift / Bildbeschreibung'}<input value={draft.title} onChange={e=>patch({title:e.target.value})} maxLength={100} required={draft.kind==='FIELD'} autoFocus/></label>{draft.kind!=='PHOTO'&&<label>{draft.kind==='FIELD'?'Deine Angabe':'Text'}<textarea value={draft.body} onChange={e=>patch({body:e.target.value})} maxLength={10000} rows={draft.kind==='FIELD'?3:7} required={draft.kind==='FIELD'||draft.kind==='TEXT'}/></label>}
    {['IMAGE','PHOTO'].includes(draft.kind)&&<label>Bild (bis 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>}
    {['TEXT','IMAGE'].includes(draft.kind)&&<div className="profile-format-toolbar"><label>Farbe<select value={draft.appearance?.color||COLORS[0]} onChange={e=>appearance({color:e.target.value})}>{COLORS.map((c,i)=><option value={c} key={c}>{['Dunkel','Rot','Blau','Grün','Gold','Violett'][i]}</option>)}</select></label><label>Größe<select value={draft.appearance?.size||'normal'} onChange={e=>appearance({size:e.target.value})}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label><label>Schrift<select value={draft.appearance?.font||'modern'} onChange={e=>appearance({font:e.target.value})}><option value="modern">Modern</option><option value="classic">Klassisch</option><option value="mono">Schreibmaschine</option></select></label><label>Ausrichtung<select value={draft.appearance?.align||'left'} onChange={e=>appearance({align:e.target.value})}><option value="left">Links</option><option value="center">Mittig</option><option value="right">Rechts</option></select></label><label>Darstellung<select value={draft.appearance?.style||'plain'} onChange={e=>appearance({style:e.target.value})}><option value="plain">Ohne Rahmen</option><option value="card">Karte</option><option value="quote">Zitat</option></select></label></div>}
    <label>Sichtbar für<select value={draft.visibility} onChange={e=>patch({visibility:e.target.value})}>{Object.entries(VISIBILITY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{error&&<p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy?'Wird gespeichert …':'Speichern'}</button></form></div>}
  </section>;
}
