import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import './styles.css';

function Auth({ onClose }) {
  const [mode, setMode] = useState('login');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ first_name:'', last_name:'', birth_date:'', nickname:'', email:'', password:'' });
  const set = (key, value) => setForm({ ...form, [key]: value });
  async function submit(e) {
    e.preventDefault(); setLoading(true); setMessage('');
    if (mode === 'register') {
      const { error } = await supabase.auth.signUp({ email: form.email, password: form.password, options: { emailRedirectTo: window.location.origin, data: { first_name: form.first_name, last_name: form.last_name, birth_date: form.birth_date, nickname: form.nickname } } });
      setMessage(error ? error.message : 'Registrierung erfolgreich. Bitte bestätige deine E-Mail. Danach wartet dein Konto auf die Admin-Freigabe.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      setMessage(error ? error.message : 'Erfolgreich angemeldet.');
    }
    setLoading(false);
  }
  return <div className="modalBackdrop"><form className="authModal" onSubmit={submit}><button type="button" className="close" onClick={onClose}>×</button><h2>{mode==='login'?'Anmelden':'Mitglied werden'}</h2><p>{mode==='login'?'Melde dich bei ennstal connect an.':'Erstelle dein Konto für die regionale Community.'}</p>{mode==='register' && <><input required placeholder="Vorname" value={form.first_name} onChange={e=>set('first_name',e.target.value)}/><input required placeholder="Nachname" value={form.last_name} onChange={e=>set('last_name',e.target.value)}/><label>Geburtsdatum<input required type="date" value={form.birth_date} onChange={e=>set('birth_date',e.target.value)}/></label><input required minLength="3" placeholder="Nickname" value={form.nickname} onChange={e=>set('nickname',e.target.value)}/></>}<input required type="email" placeholder="E-Mail-Adresse" value={form.email} onChange={e=>set('email',e.target.value)}/><input required minLength="8" type="password" placeholder="Passwort (mindestens 8 Zeichen)" value={form.password} onChange={e=>set('password',e.target.value)}/><button className="primary" disabled={loading}>{loading?'Bitte warten ...':mode==='login'?'Anmelden':'Registrieren'}</button>{message&&<div className="authMessage">{message}</div>}<button type="button" className="switch" onClick={()=>{setMode(mode==='login'?'register':'login');setMessage('')}}>{mode==='login'?'Noch kein Konto? Jetzt registrieren':'Bereits registriert? Anmelden'}</button></form></div>;
}

function App(){
 const [query,setQuery]=useState(''); const [adminOpen,setAdminOpen]=useState(false); const [authOpen,setAuthOpen]=useState(false); const [authMode,setAuthMode]=useState('login'); const [user,setUser]=useState(null); const [profile,setProfile]=useState(null); const [members,setMembers]=useState([]);
 useEffect(()=>{supabase.auth.getUser().then(({data})=>setUser(data.user||null)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user||null)); return ()=>subscription.unsubscribe();},[]);
 useEffect(()=>{if(!user)return setProfile(null); supabase.from('profiles').select('*').eq('id',user.id).single().then(({data})=>setProfile(data||null);},[user]);
 useEffect(()=>{supabase.from('profiles').select('id,first_name,last_name,birth_date,nickname,avatar_url,role,community_points,is_online,status').eq('status','APPROVED').order('nickname').then(({data})=>setMembers(data||[]));},[user]);
 const filtered=members.filter(m=>`${m.nickname} ${m.first_name} ${m.last_name}`.toLowerCase().includes(query.toLowerCase()));
 const openAuth=(mode)=>{setAuthMode(mode);setAuthOpen(true)};
 return <div className="app">
  {authOpen&&<Auth onClose={()=>setAuthOpen(false)} />}
  <header><div className="brand"><span>🏔️</span><b>ennstal connect</b></div><nav><a>Start</a><a>Neuigkeiten</a><a>Mitglieder</a><a>Gruppen</a><a>Events</a></nav><div className="headerActions">{user?<><span className="welcome">{profile?.nickname||user.email}</span><button className="ghost" onClick={()=>supabase.auth.signOut()}>Abmelden</button></>:<><button className="ghost" onClick={()=>openAuth('login')}>Anmelden</button><button className="primary" onClick={()=>openAuth('register')}>Registrieren</button></>}</div></header>
  <main><section className="hero"><div className="mountains"></div><div className="heroContent"><p className="eyebrow">WILLKOMMEN IN DER REGION</p><h1>ennstal connect</h1><p>Die regionale Community für Ennstal & Obersteiermark.</p><button className="primary big" onClick={()=>openAuth('register')}>Community entdecken</button></div></section>
   {profile && profile.status !== 'APPROVED' && <section className="statusBanner"><b>Dein Konto ist noch nicht freigegeben.</b> {profile.status==='PENDING_ADMIN'?'Ein Admin prüft derzeit deine Registrierung.':profile.status}</section>}
   <section className="toolbar"><div><h2>Mitglieder</h2><p>Finde Menschen aus deiner Region und bleibe verbunden.</p></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Mitglieder oder Nickname suchen ..."/></section>
   <section className="layout"><div className="content"><div className="tabs"><button className="active">Alle</button><button>Admins</button><button>Unterstützer</button><button>Online</button></div><div className="grid">{filtered.map(m=>{const age=m.birth_date?Math.floor((Date.now()-new Date(m.birth_date))/(365.25*24*3600*1000)):'';const role=m.role==='ADMIN'||m.role==='HEAD_ADMIN'?'admin':m.role==='SUPPORTER'?'supporter':'member';return <article className={`card ${role}`} key={m.id}><div className="roleStar">{role==='admin'||role==='supporter'?'★':''}</div><div className="avatar">{m.avatar_url?<img src={m.avatar_url} alt="Profilbild"/>:m.nickname?.[0]?.toUpperCase()}</div><h3>{m.nickname} <span>({m.community_points})</span></h3><p>{m.first_name} {m.last_name}{age!==''&&` (${age})`}</p><small className={m.is_online?'online':'offline'}>{m.is_online?'● Online':'● Offline'}</small></article>})}{!filtered.length&&<p>Noch keine freigegebenen Mitglieder vorhanden.</p>}</div></div>
   <aside className="side"><button className="adminToggle" onClick={()=>setAdminOpen(!adminOpen)}>🔒 Admin-Bereich {adminOpen?'⌃':'⌄'}</button>{adminOpen&&<div className="adminPanel"><h3>Admin-Funktionen</h3><button>Mitglieder freigeben</button><button>Gruppen freigeben</button><button>Punkteverwaltung</button><button>Meldungen</button><button>Admin-Protokoll</button><button>Website & Design</button></div>}<div className="onlineBox"><h3>🟢 Gerade online</h3><p>{members.filter(m=>m.is_online).length} Mitglieder sind aktiv.</p></div></aside></section>
  </main><footer>© 2026 ennstal connect · Regional. Verbunden. Sicher.</footer></div>
}
createRoot(document.getElementById('root')).render(<App/>);
