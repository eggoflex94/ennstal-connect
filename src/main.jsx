import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import './styles.css';

function Auth({ onClose, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ first_name:'', last_name:'', birth_date:'', nickname:'', email:'', password:'' });
  const setField = (key, value) => setForm({ ...form, [key]: value });

  async function submit(e) {
    e.preventDefault(); setLoading(true); setMessage('');
    let error;
    if (mode === 'register') {
      ({ error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { emailRedirectTo: window.location.origin, data: { first_name:form.first_name, last_name:form.last_name, birth_date:form.birth_date, nickname:form.nickname } }
      }));
      setMessage(error ? error.message : 'Registrierung erfolgreich. Bitte bestätige deine E-Mail. Danach wartet dein Konto auf die Admin-Freigabe.');
    } else {
      ({ error } = await supabase.auth.signInWithPassword({ email:form.email, password:form.password }));
      setMessage(error ? error.message : 'Erfolgreich angemeldet.');
    }
    setLoading(false);
  }

  return <div className="modalBackdrop"><form className="authModal" onSubmit={submit}>
    <button type="button" className="close" onClick={onClose}>×</button>
    <h2>{mode === 'login' ? 'Anmelden' : 'Mitglied werden'}</h2>
    {mode === 'register' && <>
      <input required placeholder="Vorname" onChange={e => setField('first_name', e.target.value)} />
      <input required placeholder="Nachname" onChange={e => setField('last_name', e.target.value)} />
      <input required type="date" onChange={e => setField('birth_date', e.target.value)} />
      <input required minLength="3" placeholder="Nickname" onChange={e => setField('nickname', e.target.value)} />
    </>}
    <input required type="email" placeholder="E-Mail-Adresse" onChange={e => setField('email', e.target.value)} />
    <input required minLength="8" type="password" placeholder="Passwort" onChange={e => setField('password', e.target.value)} />
    <button className="primary" disabled={loading}>{loading ? 'Bitte warten ...' : mode === 'login' ? 'Anmelden' : 'Registrieren'}</button>
    {message && <div className="authMessage">{message}</div>}
    <button type="button" className="switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
      {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}
    </button>
  </form></div>;
}

function App() {
  const [query, setQuery] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notice, setNotice] = useState('');

  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'HEAD_ADMIN';
  const isHead = profile?.role === 'HEAD_ADMIN';

  async function load() {
    const { data } = await supabase.from('profiles').select('id,first_name,last_name,nickname,avatar_url,role,community_points,is_online,status').eq('status','APPROVED').order('nickname');
    setMembers(data || []);
    if (isAdmin) {
      const { data: p } = await supabase.from('profiles').select('id,first_name,last_name,nickname,status,created_at').eq('status','PENDING_ADMIN').order('created_at');
      setPending(p || []);
    }
    if (isHead) {
      const { data: l } = await supabase.from('admin_logs').select('*').order('created_at',{ ascending:false }).limit(20);
      setLogs(l || []);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => setProfile(data || null));
  }, [user]);

  useEffect(() => { load(); }, [user, profile?.role]);

  async function changeStatus(id, newStatus) {
    const { error } = await supabase.rpc('set_account_status', { target_user:id, new_status:newStatus, note:'' });
    setNotice(error ? error.message : 'Mitglied aktualisiert.');
    load();
  }

  async function changePoints(id) {
    const delta = Number(prompt('Punkte eingeben, z.B. 5 oder -3:'));
    if (!delta) return;
    const reason = prompt('Begründung (Pflicht):');
    if (!reason || reason.trim().length < 3) { setNotice('Eine Begründung ist erforderlich.'); return; }
    const { error } = await supabase.rpc('admin_change_points', { target_user:id, delta, change_kind:delta > 0 ? 'PLUS' : 'MINUS', reason_text:reason });
    setNotice(error ? error.message : 'Punkte erfolgreich geändert.');
    load();
  }

  const filtered = members.filter(m => `${m.nickname} ${m.first_name} ${m.last_name}`.toLowerCase().includes(query.toLowerCase()));
  const openAuth = mode => { setAuthMode(mode); setAuthOpen(true); };

  return <div className="app">
    {authOpen && <Auth initialMode={authMode} onClose={() => setAuthOpen(false)} />}
    <header>
      <div className="brand">🏔️ <b>ennstal connect</b></div>
      <nav><a>Start</a><a>Neuigkeiten</a><a>Mitglieder</a><a>Gruppen</a><a>Events</a></nav>
      <div className="headerActions">
        {user ? <><span className="welcome">{profile?.nickname || user.email}</span><button className="ghost" onClick={() => supabase.auth.signOut()}>Abmelden</button></> : <><button className="ghost" onClick={() => openAuth('login')}>Anmelden</button><button className="primary" onClick={() => openAuth('register')}>Registrieren</button></>}
      </div>
    </header>
    <main>
      <section className="hero"><div className="mountains" /><div className="heroContent"><p className="eyebrow">WILLKOMMEN IN DER REGION</p><h1>ennstal connect</h1><p>Die regionale Community für Ennstal & Obersteiermark.</p><button className="primary big" onClick={() => openAuth('register')}>Community entdecken</button></div></section>
      {notice && <section className="statusBanner">{notice}</section>}
      {profile && profile.status !== 'APPROVED' && <section className="statusBanner"><b>Dein Konto ist noch nicht freigegeben.</b> Ein Admin prüft deine Registrierung.</section>}
      <section className="toolbar"><div><h2>Mitglieder</h2><p>Finde Menschen aus deiner Region und bleibe verbunden.</p></div><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Mitglieder oder Nickname suchen ..." /></section>
      <section className="layout"><div className="content"><div className="grid">
        {filtered.map(m => {
          const roleClass = m.role === 'ADMIN' || m.role === 'HEAD_ADMIN' ? 'admin' : m.role === 'SUPPORTER' ? 'supporter' : 'member';
          return <article className={`card ${roleClass}`} key={m.id}><div className="roleStar">{roleClass !== 'member' ? '★' : ''}</div><div className="avatar">{m.avatar_url ? <img src={m.avatar_url} alt="Profilbild" /> : m.nickname?.[0]?.toUpperCase()}</div><h3>{m.nickname} <span>({m.community_points})</span></h3><p>{m.first_name} {m.last_name}</p><small className={m.is_online ? 'online' : 'offline'}>{m.is_online ? '● Online' : '● Offline'}</small>{isAdmin && <button className="smallAction" onClick={() => changePoints(m.id)}>Punkte ändern</button>}</article>;
        })}
      </div></div>
      <aside className="side">
        {isAdmin && <button className="adminToggle" onClick={() => setAdminOpen(!adminOpen)}>🔒 Admin-Bereich {adminOpen ? '⌃' : '⌄'}</button>}
        {isAdmin && adminOpen && <div className="adminPanel"><h3>Admin-Dashboard</h3><b>Neue Mitglieder ({pending.length})</b>{pending.map(p => <div className="pending" key={p.id}><strong>{p.nickname}</strong><span>{p.first_name} {p.last_name}</span><div><button onClick={() => changeStatus(p.id,'APPROVED')}>Freigeben</button><button onClick={() => changeStatus(p.id,'REJECTED')}>Ablehnen</button></div></div>)}{!pending.length && <p>Keine offenen Registrierungen.</p>}{isHead && <><hr /><b>Hauptadmin-Protokoll</b>{logs.map(l => <small className="log" key={l.id}>{new Date(l.created_at).toLocaleString()} · {l.action}</small>)}</>}</div>}
        <div className="onlineBox"><h3>🟢 Gerade online</h3><p>{members.filter(m => m.is_online).length} Mitglieder sind aktiv.</p></div>
      </aside></section>
    </main>
    <footer>© 2026 ennstal connect · Regional. Verbunden. Sicher.</footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
