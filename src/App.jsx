import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles.css";

const ROLES = ["MEMBER","SUPPORTER","ADMIN","HEAD_ADMIN"];
const isAdmin = (r) => r === "ADMIN" || r === "HEAD_ADMIN";
const age = (d) => {
  if (!d) return null;
  const b = new Date(d), n = new Date();
  let a = n.getFullYear()-b.getFullYear();
  if (n.getMonth()<b.getMonth() || (n.getMonth()===b.getMonth() && n.getDate()<b.getDate())) a--;
  return a;
};
const fmtTime = (s=0) => `${Math.floor(s/3600)} Stunden ${Math.floor((s%3600)/60)} Minuten`;

export default function App(){
  const [user,setUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [members,setMembers]=useState([]);
  const [news,setNews]=useState([]);
  const [events,setEvents]=useState([]);
  const [groups,setGroups]=useState([]);
  const [history,setHistory]=useState([]);
  const [page,setPage]=useState("home");
  const [loading,setLoading]=useState(true);
  const [msg,setMsg]=useState("");

  const flash=(x)=>{setMsg(x);setTimeout(()=>setMsg(""),3500)};

  async function loadAll(){
    const {data:{user:u}}=await supabase.auth.getUser();
    setUser(u||null);
    if(!u){setLoading(false);return}
    const [p,m,n,e,g,h]=await Promise.all([
      supabase.from("profiles").select("*").eq("id",u.id).single(),
      supabase.from("profiles").select("*").order("nickname"),
      supabase.from("community_news").select("*").order("created_at",{ascending:false}),
      supabase.from("events").select("*").order("starts_at"),
      supabase.from("groups").select("*").order("created_at",{ascending:false}),
      supabase.from("point_history").select("*").eq("user_id",u.id).order("created_at",{ascending:false})
    ]);
    setProfile(p.data||null);setMembers(m.data||[]);setNews(n.data||[]);setEvents(e.data||[]);setGroups(g.data||[]);setHistory(h.data||[]);
    setLoading(false);
  }

  useEffect(()=>{loadAll();const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>loadAll());return()=>subscription.unsubscribe()},[]);
  useEffect(()=>{
    if(!user) return;
    const t=setInterval(async()=>{if(document.visibilityState==="visible"){const {error}=await supabase.rpc("record_online_time",{p_seconds:60});if(!error) loadAll()}},60000);
    return()=>clearInterval(t);
  },[user?.id]);

  async function login(e){
    e.preventDefault(); const f=new FormData(e.currentTarget);
    const {error}=await supabase.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});
    if(error) return flash(error.message); flash("Angemeldet"); loadAll();
  }

  async function register(e){
    e.preventDefault();const f=new FormData(e.currentTarget);
    const email=f.get("email"), password=f.get("password");
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{
      nickname:f.get("nickname"),first_name:f.get("first_name"),last_name:f.get("last_name"),birth_date:f.get("birth_date")
    }}});
    if(error) return flash(error.message);
    if(data.user && !data.session) flash("Registrierung erstellt. Prüfe gegebenenfalls deine E-Mails zur Bestätigung.");
    else flash("Registrierung erfolgreich.");
    e.currentTarget.reset();
  }

  async function logout(){await supabase.auth.signOut();setProfile(null);setUser(null);setPage("home")}

  async function saveProfile(e){
    e.preventDefault();const f=new FormData(e.currentTarget);
    const {error}=await supabase.rpc("update_my_profile",{
      p_nickname:f.get("nickname"),p_gender:f.get("gender"),p_avatar_url:f.get("avatar_url"),
      p_bio:f.get("bio"),p_location:f.get("location"),p_interests:f.get("interests"),p_website:f.get("website")
    });
    if(error) return flash(error.message);flash("Profil gespeichert");loadAll();
  }

  async function createNews(e){e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await supabase.from("community_news").insert({title:f.get("title"),content:f.get("content"),created_by:user.id});if(error)return flash(error.message);e.currentTarget.reset();flash("News veröffentlicht");loadAll()}
  async function createEvent(e){e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await supabase.from("events").insert({title:f.get("title"),description:f.get("description"),location:f.get("location"),starts_at:f.get("starts_at"),created_by:user.id});if(error)return flash(error.message);e.currentTarget.reset();loadAll()}
  async function createGroup(e){e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await supabase.from("groups").insert({name:f.get("name"),description:f.get("description"),image_url:f.get("image_url"),created_by:user.id});if(error)return flash(error.message);e.currentTarget.reset();loadAll()}

  async function changePoints(e){
    e.preventDefault();const f=new FormData(e.currentTarget);
    const {error}=await supabase.rpc("apply_points",{p_user_id:f.get("user_id"),p_community_change:Number(f.get("community")||0),p_purchase_change:Number(f.get("purchase")||0),p_reason:f.get("reason"),p_action_type:"ADMIN_CHANGE"});
    if(error)return flash(error.message);flash("Punkte geändert");e.currentTarget.reset();loadAll();
  }

  async function adminSaveMember(e){
    e.preventDefault();const f=new FormData(e.currentTarget);
    const {error}=await supabase.rpc("admin_update_member",{p_user_id:f.get("user_id"),p_nickname:f.get("nickname"),p_first_name:f.get("first_name"),p_last_name:f.get("last_name"),p_birth_date:f.get("birth_date"),p_role:f.get("role"),p_account_status:f.get("account_status")});
    if(error)return flash(error.message);flash("Mitglied gespeichert");loadAll();
  }

  if(loading) return <div className="center">Lädt Ennstal Connect …</div>;
  if(!user) return <Auth login={login} register={register} msg={msg}/>;
  if(profile?.account_status==="SUSPENDED") return <div className="suspended"><h1>Konto gesperrt</h1><p>{profile.suspension_reason||"Dein Konto ist derzeit gesperrt."}</p><button onClick={logout}>Abmelden</button></div>;

  const next = profile?.online_seconds<18000 ? 18000 : 18000+(Math.floor((profile.online_seconds-18000)/72000)+1)*72000;
  const remaining=Math.max(0,next-(profile?.online_seconds||0));
  const first=(profile?.online_seconds||0)<18000;

  return <div className="app">
    <header><div className="brand">ENNSTAL CONNECT</div><nav>
      <button onClick={()=>setPage("home")}>Startseite</button><button onClick={()=>setPage("members")}>Mitglieder</button><button onClick={()=>setPage("groups")}>Gruppen</button><button onClick={()=>setPage("events")}>Events</button><button onClick={()=>setPage("stats")}>📊 Statistik</button>
      {isAdmin(profile?.role)&&<button onClick={()=>setPage("admin")}>Admin-Bereich</button>}
      <button onClick={()=>setPage("profile")}>Mein Bereich</button><button onClick={logout}>Abmelden</button>
    </nav></header>
    {msg&&<div className="toast">{msg}</div>}
    <main>
      {page==="home"&&<><h1>Neuigkeiten</h1>{isAdmin(profile?.role)&&<form className="panel" onSubmit={createNews}><input name="title" placeholder="Überschrift" required/><textarea name="content" placeholder="Neuigkeit" required/><button>News veröffentlichen</button></form>}{news.map(x=><article className="news" key={x.id}><h2>{x.title}</h2><p>{x.content}</p><small>{new Date(x.created_at).toLocaleString("de-AT")}</small></article>)}</>}
      {page==="members"&&<><h1>Mitglieder</h1><div className="cards">{members.map(m=><Member key={m.id} m={m}/>)}</div></>}
      {page==="groups"&&<><h1>Gruppen</h1>{isAdmin(profile?.role)&&<form className="panel" onSubmit={createGroup}><input name="name" placeholder="Gruppenname" required/><textarea name="description" placeholder="Beschreibung"/><input name="image_url" placeholder="Bild-URL (optional)"/><button>Gruppe erstellen</button></form>}<div className="cards">{groups.map(g=><article className="member-card" key={g.id}><h2>{g.name}</h2><p>{g.description}</p></article>)}</div></>}
      {page==="events"&&<><h1>Events</h1>{isAdmin(profile?.role)&&<form className="panel" onSubmit={createEvent}><input name="title" placeholder="Titel" required/><textarea name="description" placeholder="Beschreibung"/><input name="location" placeholder="Ort"/><input type="datetime-local" name="starts_at" required/><button>Event erstellen</button></form>}{events.map(e=><article className="news" key={e.id}><h2>{e.title}</h2><p>{e.description}</p><b>{e.location||"Ort offen"} · {new Date(e.starts_at).toLocaleString("de-AT")}</b></article>)}</>}
      {page==="stats"&&<section><h1>Meine Statistik</h1><div className="stats"><div><span>⏱ Onlinezeit</span><strong>{fmtTime(profile?.online_seconds)}</strong></div><div><span>⭐ Community-Punkte</span><strong>{profile?.community_points||0}</strong></div><div><span>🛒 Kaufpunkte</span><strong>{profile?.purchase_points||0}</strong></div></div><article className="news"><h2>Nächste Belohnung</h2><p>Noch {fmtTime(remaining)}</p><b>{first?"+5 Punkte · +10 Kaufpunkte":"+20 Punkte · +40 Kaufpunkte"}</b></article><h2>Meine Punktehistorie</h2>{history.map(h=><article className="history" key={h.id}><div><b>{h.reason}</b><small>{new Date(h.created_at).toLocaleString("de-AT")}</small></div><div className={h.community_points_change<0?"minus":"plus"}>{h.community_points_change>=0?"+":""}{h.community_points_change} P · {h.purchase_points_change>=0?"+":""}{h.purchase_points_change} KP</div></article>)}</section>}
      {page==="profile"&&<form className="panel" onSubmit={saveProfile}><h1>Profil Einstellungen</h1><input name="nickname" defaultValue={profile?.nickname||""} placeholder="Nickname" required/><div className="locked"><input defaultValue={profile?.first_name||""} disabled/><input defaultValue={profile?.last_name||""} disabled/></div><input type="date" defaultValue={profile?.birth_date||""} disabled/><small>Vorname, Nachname und Geburtsdatum können nach der Registrierung nur durch einen Admin geändert werden.</small><input name="avatar_url" defaultValue={profile?.avatar_url||""} placeholder="Profilbild URL"/><input name="gender" defaultValue={profile?.gender||""} placeholder="Geschlecht"/><textarea name="bio" defaultValue={profile?.bio||""} placeholder="Über mich"/><input name="location" defaultValue={profile?.location||""} placeholder="Wohnort"/><input name="interests" defaultValue={profile?.interests||""} placeholder="Interessen"/><input name="website" defaultValue={profile?.website||""} placeholder="Website"/><button>Speichern</button></form>}
      {page==="admin"&&isAdmin(profile?.role)&&<section><h1>Admin-Bereich</h1><form className="panel" onSubmit={changePoints}><h2>Punkte verwalten</h2><select name="user_id" required><option value="">Mitglied auswählen</option>{members.map(m=><option value={m.id} key={m.id}>{m.nickname||m.first_name}</option>)}</select><input type="number" name="community" placeholder="+ / - Community-Punkte"/><input type="number" name="purchase" placeholder="+ / - Kaufpunkte"/><textarea name="reason" placeholder="Grund (Pflicht)" required/><button>Änderung speichern</button></form><h2>Mitglieder verwalten</h2>{members.map(m=><form className="admin-member panel" key={m.id} onSubmit={adminSaveMember}><input type="hidden" name="user_id" value={m.id}/><input name="nickname" defaultValue={m.nickname||""} placeholder="Nickname"/><input name="first_name" defaultValue={m.first_name||""} placeholder="Vorname"/><input name="last_name" defaultValue={m.last_name||""} placeholder="Nachname"/><input type="date" name="birth_date" defaultValue={m.birth_date||""}/><select name="role" defaultValue={m.role||"MEMBER"}>{ROLES.filter(r=>profile.role==="HEAD_ADMIN"||r!=="HEAD_ADMIN").map(r=><option key={r}>{r}</option>)}</select><select name="account_status" defaultValue={m.account_status||"ACTIVE"}><option>ACTIVE</option><option>SUSPENDED</option></select><button>Mitglied speichern</button></form>)}</section>}
    </main>
  </div>
}

function Member({m}){
  const a=age(m.birth_date);
  const role=m.role||"MEMBER";
  return <article className={`member-card ${role==="SUPPORTER"?"supporter":isAdmin(role)?"admin":""}`}>
    <div className="role-star">{isAdmin(role)?"★":role==="SUPPORTER"?"★":""}</div>
    {m.avatar_url?<img src={m.avatar_url} className="avatar" alt="Profil"/>:<div className="avatar placeholder">👤</div>}
    <h2>{m.nickname||"Mitglied"}</h2>
    <p className="full-name">{[m.first_name,m.last_name].filter(Boolean).join(" ")}{a!==null?` (${a})`:""}</p>
  </article>
}

function Auth({login,register,msg}){
  const [mode,setMode]=useState("login");
  return <div className="auth"><h1>ENNSTAL CONNECT</h1>{msg&&<div className="toast">{msg}</div>}
    <div className="auth-grid">
      {mode==="login"?<form className="panel" onSubmit={login}><h2>Anmelden</h2><input name="email" type="email" placeholder="E-Mail" required/><input name="password" type="password" placeholder="Passwort" required/><button>Anmelden</button><button type="button" className="link" onClick={()=>setMode("register")}>Noch kein Konto? Registrieren</button></form>:
      <form className="panel" onSubmit={register}><h2>Registrieren</h2><input name="nickname" placeholder="Nickname" required/><input name="first_name" placeholder="Vorname" required/><input name="last_name" placeholder="Nachname" required/><label>Geburtsdatum *</label><input name="birth_date" type="date" required/><input name="email" type="email" placeholder="E-Mail-Adresse" required/><input name="password" type="password" minLength="6" placeholder="Passwort (mind. 6 Zeichen)" required/><button>Konto erstellen</button><button type="button" className="link" onClick={()=>setMode("login")}>Zur Anmeldung</button></form>}
    </div>
  </div>
}
