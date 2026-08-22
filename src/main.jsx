import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const members = [
  { role: 'admin', nick: 'AlpenAdmin', name: 'Max Mustermann', age: 35, points: 1250, online: true },
  { role: 'supporter', nick: 'BergHelfer', name: 'Anna Beispiel', age: 31, points: 820, online: true },
  { role: 'member', nick: 'Alpenfreund', name: 'Lukas Berger', age: 28, points: 245, online: false },
  { role: 'member', nick: 'Ennstaler', name: 'Maria Steiner', age: 26, points: 190, online: true }
];

function App(){
 const [query,setQuery]=useState('');
 const [adminOpen,setAdminOpen]=useState(false);
 const filtered=members.filter(m=>`${m.nick} ${m.name}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="app">
  <header><div className="brand"><span>🏔️</span><b>ennstal connect</b></div><nav><a>Start</a><a>Neuigkeiten</a><a>Mitglieder</a><a>Gruppen</a><a>Events</a></nav><div className="headerActions"><button className="ghost">Anmelden</button><button className="primary">Registrieren</button></div></header>
  <main>
   <section className="hero"><div className="mountains"></div><div className="heroContent"><p className="eyebrow">WILLKOMMEN IN DER REGION</p><h1>ennstal connect</h1><p>Die regionale Community für Ennstal & Obersteiermark.</p><button className="primary big">Community entdecken</button></div></section>
   <section className="toolbar"><div><h2>Mitglieder</h2><p>Finde Menschen aus deiner Region und bleibe verbunden.</p></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Mitglieder oder Nickname suchen ..."/></section>
   <section className="layout"><div className="content"><div className="tabs"><button className="active">Alle</button><button>Admins</button><button>Unterstützer</button><button>Online</button></div><div className="grid">{filtered.map(m=><article className={`card ${m.role}`} key={m.nick}><div className="roleStar">{m.role==='admin'?'★':m.role==='supporter'?'★':''}</div><div className="avatar">{m.nick[0]}</div><h3>{m.nick} <span>({m.points})</span></h3><p>{m.name} ({m.age})</p><small className={m.online?'online':'offline'}>{m.online?'● Online':'● Offline'}</small></article>)}</div></div>
   <aside className="side"><button className="adminToggle" onClick={()=>setAdminOpen(!adminOpen)}>🔒 Admin-Bereich {adminOpen?'⌃':'⌄'}</button>{adminOpen&&<div className="adminPanel"><h3>Admin-Funktionen</h3><button>Mitglieder freigeben</button><button>Gruppen freigeben</button><button>Punkteverwaltung</button><button>Meldungen</button><button>Admin-Protokoll</button><button>Website & Design</button></div>}<div className="onlineBox"><h3>🟢 Gerade online</h3><p>2 Mitglieder sind aktiv.</p></div></aside></section>
  </main><footer>© 2026 ennstal connect · Regional. Verbunden. Sicher.</footer>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
