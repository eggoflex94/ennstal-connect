import React, { useEffect, useRef, useState } from 'react';
import { supabase, preparePrivilegedAction } from './supabaseClient';
import { APPROVAL_FIELDS, APPROVAL_LABELS, correctionPayload } from './accountApproval.js';
import './account-approvals.css';

export function AccountApprovalNotice({ userId, onUpdated }) {
  const [record, setRecord] = useState(null), [values, setValues] = useState({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const alive = useRef(true), dirty = useRef(false);
  useEffect(() => {
    let cancelled = false; alive.current = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('ec_my_account_approval');
      if (!cancelled && !error && !dirty.current) { setRecord(data); setValues(data || {}); }
    };
    void load(); window.addEventListener('focus', load);
    return () => { cancelled = true; alive.current = false; window.removeEventListener('focus', load); };
  }, [userId]);
  if (!record || !['PENDING', 'CHANGES_REQUIRED'].includes(record.status)) return null;
  const submit = async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try {
      const { error } = await supabase.rpc('ec_submit_account_corrections', { p_changes: correctionPayload(record, values), p_note: values.member_note || '', p_expected_updated_at: record.updated_at });
      if (error) throw error;
      if (alive.current) { dirty.current = false; setRecord(current => ({ ...current, status: 'PENDING' })); setMessage('✓ Korrekturen eingereicht. Der Hauptadmin prüft deinen Account erneut.'); onUpdated?.(); }
    } catch (error) { if (alive.current) setMessage(error.message || 'Die Korrekturen konnten nicht gespeichert werden.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <section className="ec-account-approval-notice" aria-label="Account-Freigabe"><strong>{APPROVAL_LABELS[record.status]}</strong>
    {record.status === 'PENDING' ? <p>Dein Account wartet auf die Prüfung durch den Hauptadmin. Du bleibst angemeldet und kannst die Community weiter nutzen.</p> : <><p>{record.review_note}</p><form onSubmit={submit}><fieldset disabled={busy}><legend>Diese Angaben bitte korrigieren</legend><div className="ec-approval-fields">{(record.required_fields || []).map(field => <label key={field}>{APPROVAL_FIELDS[field]}<input type={field === 'birth_date' ? 'date' : 'text'} value={values[field] || ''} required minLength={field === 'birth_date' ? undefined : 2} maxLength={field === 'birth_date' ? undefined : 80} onChange={event => { dirty.current = true; setValues(current => ({ ...current, [field]: event.target.value })); }}/></label>)}</div><label>Optionale Nachricht zur Korrektur<textarea value={values.member_note || ''} maxLength={1000} onChange={event => { dirty.current = true; setValues(current => ({ ...current, member_note: event.target.value })); }}/></label><button type="submit" className="primary-button">{busy ? 'Wird gespeichert …' : 'Korrekturen zur Prüfung einreichen'}</button></fieldset></form></>}
    {message && <p role="status">{message}</p>}
  </section>;
}

function ApprovalCard({ item, onDecision, busy }) {
  const [fields, setFields] = useState([]), [note, setNote] = useState('');
  return <article className="panel ec-approval-card"><header><div><h2>{item.nickname || 'Mitglied'}</h2><span>{APPROVAL_LABELS[item.status]}</span></div><small>Registriert: {new Date(item.registered_at).toLocaleDateString('de-AT')}</small></header>
    <dl><div><dt>Vorname</dt><dd>{item.first_name || 'Fehlt'}</dd></div><div><dt>Nachname</dt><dd>{item.last_name || 'Fehlt'}</dd></div><div><dt>Geburtsdatum</dt><dd>{item.birth_date ? new Date(`${item.birth_date}T12:00:00`).toLocaleDateString('de-AT') : 'Fehlt'}</dd></div></dl>
    {item.review_note && <p><strong>Bisherige Auflagen:</strong> {item.review_note}</p>}{item.member_note && <p><strong>Rückmeldung:</strong> {item.member_note}</p>}
    <fieldset disabled={busy}><legend>Auflagen für diesen Account</legend><div className="ec-approval-checkboxes">{Object.entries(APPROVAL_FIELDS).map(([field, label]) => <label key={field}><input type="checkbox" checked={fields.includes(field)} onChange={event => setFields(current => event.target.checked ? [...current, field] : current.filter(key => key !== field))}/>{label} korrigieren</label>)}</div><label>Prüfvermerk / genaue Anleitung<textarea value={note} maxLength={1000} placeholder="Bitte gib deinen vollständigen Vor- und Nachnamen an …" onChange={event => setNote(event.target.value)}/></label><div className="content-manage-actions"><button type="button" className="primary-button" onClick={() => onDecision(item, 'APPROVED', [], note)}>✓ Account freigeben</button><button type="button" className="secondary-button" disabled={!fields.length || note.trim().length < 10} onClick={() => onDecision(item, 'CHANGES_REQUIRED', fields, note)}>Auflagen senden</button></div><small>Auflagen ändern weder die Anmeldung noch die Kontosperre. Profil-Verifizierung wird separat verwaltet.</small></fieldset>
  </article>;
}

function AccountMailSetup({ configured, onSaved }) {
  const [key, setKey] = useState(''), [sender, setSender] = useState('noreply@ennstal-connect.com'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const save = async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try {
      const prepared = await preparePrivilegedAction('Account-Mailversand einrichten');
      if (prepared.error) throw prepared.error;
      const { error } = await supabase.rpc('ec_configure_account_email', { p_api_key: key.trim(), p_sender: sender.trim() });
      if (error) throw error;
      setKey(''); setSender('noreply@ennstal-connect.com'); setMessage('✓ Versandzugang gespeichert. Vorgemerkte E-Mails werden automatisch verarbeitet.'); onSaved();
    } catch (error) { setMessage(error.message || 'Der Versandzugang konnte nicht gespeichert werden.'); }
    finally { setBusy(false); }
  };
  return <details className="ec-approval-mail-setup"><summary>{configured ? 'Brevo-Zugang ändern' : 'E-Mail-Versand mit Brevo einrichten'}</summary><p>Deine Registrierungs-Mails laufen bereits über Brevo. Erstelle im selben <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer">Brevo-Konto einen API-Key</a> für diese zusätzlichen Nachrichten. Die SMTP-Einstellungen für die Anmeldung bleiben bestehen. Bitte einen API-Key verwenden, keinen SMTP-Schlüssel.</p><form onSubmit={save}><fieldset disabled={busy}><legend>Versandzugang · nur Hauptadmin</legend><div className="ec-approval-fields"><label>Bestätigte Absenderadresse<input type="email" value={sender} required maxLength={254} placeholder="name@deine-domain.at" onChange={event => setSender(event.target.value)}/></label><label>Brevo API-Key<input type="password" value={key} required autoComplete="new-password" maxLength={507} placeholder="xkeysib-…" onChange={event => setKey(event.target.value)}/></label></div><p>Der Schlüssel wird verschlüsselt gespeichert und nicht erneut angezeigt. Freigaben und Auflagen werden zusätzlich zur Community-Benachrichtigung automatisch per E-Mail versendet.</p><button type="submit" className="primary-button">{busy ? 'Wird gespeichert …' : 'Versandzugang speichern'}</button></fieldset></form>{message && <p role="status">{message}</p>}</details>;
}

export default function AccountApprovals({ onBack }) {
  const [filter, setFilter] = useState('OPEN'), [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const [result, setResult] = useState({ items: [], total: 0 }), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [revision, setRevision] = useState(0), [mailStatus, setMailStatus] = useState(null);
  useEffect(() => {
    let cancelled = false; setLoading(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('ec_account_approval_queue', { p_status: filter, p_query: query, p_limit: 25, p_offset: page * 25 });
      if (cancelled) return;
      if (error) { setMessage(error.message); setResult({ items: [], total: 0 }); } else { setResult(data || { items: [], total: 0 }); }
      setLoading(false);
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filter, query, page, revision]);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('ec_account_email_status').then(({ data, error }) => { if (!cancelled && !error) setMailStatus(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [revision]);
  const decide = async (item, decision, fields, note) => {
    if (busy) return;
    if (decision === 'APPROVED' && !window.confirm(`Account von ${item.nickname || 'diesem Mitglied'} nach Prüfung freigeben?`)) return;
    setBusy(true); setMessage('');
    try {
      const prepared = await preparePrivilegedAction('Account-Freigabe prüfen', item.user_id);
      if (prepared.error) throw prepared.error;
      const { error } = await supabase.rpc('ec_review_account_approval', { p_user_id: item.user_id, p_decision: decision, p_fields: fields, p_note: note, p_expected_updated_at: item.updated_at });
      if (error) throw error;
      setMessage(decision === 'APPROVED' ? '✓ Account freigegeben. Community-Benachrichtigung versendet; E-Mail vorgemerkt.' : '✓ Auflagen gespeichert. Community-Benachrichtigung versendet; E-Mail vorgemerkt.'); setRevision(current => current + 1);
    } catch (error) { setMessage(error.message || 'Die Entscheidung konnte nicht gespeichert werden.'); }
    finally { setBusy(false); }
  };
  return <section className="ec-account-approvals"><div className="page-heading"><div><span className="eyebrow">HAUPTADMIN · ACCOUNT-FREIGABE</span><h1>Accounts freigeben</h1><p>Neue Accounts prüfen, freigeben oder konkrete Korrekturen verlangen. Bestandskonten bleiben nutzbar.</p></div><button type="button" className="secondary-button" onClick={onBack}>← Zurück</button></div>
    {mailStatus && <aside className="panel ec-approval-mail-status" role="status"><strong>{mailStatus.configured ? 'E-Mail-Versand eingerichtet' : 'E-Mail-Versand noch nicht eingerichtet'}</strong><p>{mailStatus.configured ? 'Freigaben und Auflagen werden zusätzlich per E-Mail zugestellt.' : 'Mitglieder erhalten die Benachrichtigung in der Community. Die E-Mail wird vorgemerkt; ein Versanddienst muss noch verbunden werden.'}</p><small>{mailStatus.pending} vorgemerkt · {mailStatus.accepted} vom Maildienst angenommen · {mailStatus.failed} fehlgeschlagen</small><AccountMailSetup configured={mailStatus.configured} onSaved={() => setRevision(current => current + 1)}/></aside>}
    <div className="panel ec-approval-filters"><label>Prüfstatus<select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}>{[['OPEN','Offene Prüfungen'],['PENDING','Warten auf Prüfung'],['CHANGES_REQUIRED','Auflagen offen'],['APPROVED','Freigegeben'],['LEGACY_ACTIVE','Bestandskonten'],['ALL','Alle Accounts']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Mitglied suchen<input value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Nickname, Vor- oder Nachname"/></label><button type="button" className="secondary-button" disabled={loading || busy} onClick={() => setRevision(current => current + 1)}>Neu laden</button></div>
    {message && <p role="status">{message}</p>}{loading ? <p role="status">Accounts werden geladen …</p> : <><p>{result.total} Accounts</p>{result.items.map(item => <ApprovalCard key={`${item.user_id}-${item.updated_at}`} item={item} onDecision={decide} busy={busy}/>)}{!result.items.length && <div className="empty-card">Keine Accounts für diesen Filter gefunden.</div>}<nav className="ec-approval-pagination" aria-label="Account-Freigaben Seiten"><button type="button" disabled={!page || busy} onClick={() => setPage(current => current - 1)}>← Zurück</button><span>Seite {page + 1}</span><button type="button" disabled={(page + 1) * 25 >= result.total || busy} onClick={() => setPage(current => current + 1)}>Weiter →</button></nav></>}
  </section>;
}
