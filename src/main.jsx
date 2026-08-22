import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

const LOGO = "/logo.png";

const isApproved = (p) => p?.status === "APPROVED";
const isAdminRole = (role) => ["ADMIN", "HEAD_ADMIN"].includes(role);

function nameOf(p) {
  if (!p) return "Mitglied";
  return p.nickname || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Mitglied";
}
function initials(p) {
  return nameOf(p).slice(0, 2).toUpperCase();
}
function roleLabel(role) {
  if (role === "HEAD_ADMIN") return "★ Hauptadmin";
  if (role === "ADMIN") return "★ Admin";
  if (role === "SUPPORTER") return "★ Unterstützer";
  return "Mitglied";
}

function AuthModal({ mode, setMode, onClose, notice }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name:"", last_name:"", birth_date:"", nickname:"", email:"", password:""
  });
  const set = (key, value) => setForm((x) => ({...x, [key]:value}));

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            first_name: form.first_name,
            last_name: form.last_name,
            birth_date: form.birth_date,
            nickname: form.nickname
          }
        }
      });
      notice(error ? error.message : "Registrierung erfolgreich. Bitte bestätige deine E-Mail. Danach wartet dein Konto auf die Freigabe durch einen Admin.");
      if (!error) onClose();
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email, password: form.password
      });
      notice(error ? error.message : "Erfolgreich angemeldet.");
      if (!error) onClose();
    }
    setLoading(false);
  }

  return <div className="modal-backdrop">
    <form className="auth-modal" onSubmit={submit}>
      <button type="button" className="icon-close" onClick={onClose}>×</button>
      <span className="eyebrow">ENNSTAL CONNECT</span>
      <h2>{mode === "login" ? "Willkommen zurück" : "Werde Teil der Community"}</h2>

      {mode === "register" && <>
        <div className="form-grid">
          <label>Vorname<input required value={form.first_name} onChange={e=>set("first_name",e.target.value)} /></label>
          <label>Nachname<input required value={form.last_name} onChange={e=>set("last_name",e.target.value)} /></label>
        </div>
        <label>Spitzname<input required minLength="3" value={form.nickname} onChange={e=>set("nickname",e.target.value)} /></label>
        <label>Geburtsdatum<input type="date" value={form.birth_date} onChange={e=>set("birth_date",e.target.value)} /></label>
      </>}

      <label>E-Mail<input required type="email" value={form.email} onChange={e=>set("email",e.target.value)} /></label>
      <label>Passwort<input required minLength="8" type="password" value={form.password} onChange={e=>set("password",e.target.value)} /></label>

      <button className="primary-button full" disabled={loading}>
        {loading ? "Bitte warten ..." : mode === "login" ? "Anmelden" : "Registrieren"}
      </button>
      <button type="button" className="link-button" onClick={()=>setMode(mode==="login"?"register":"login")}>
        {mode === "login" ? "Noch kein Konto? Jetzt registrieren" : "Bereits Mitglied? Jetzt anmelden"}
      </button>
    </form>
  </div>;
}

function PublicHome({ openAuth }) {
  return <div className="public-home">
    <header className="topbar">
      <div className="brand"><img src={LOGO} alt="Ennstal Connect" /><span>Ennstal Connect</span></div>
      <div className="header-actions">
        <button className="secondary-button" onClick={()=>openAuth("login")}>Anmelden</button>
        <button className="primary-button" onClick={()=>openAuth("register")}>Mitglied werden</button>
      </div>
    </header>
    <main className="public-main">
      <section className="public-hero">
        <span className="eyebrow">DEINE REGION. DEINE COMMUNITY.</span>
        <h1>Willkommen bei<br />Ennstal Connect</h1>
        <p>Verbinde dich mit Menschen aus deiner Region. Entdecke Neuigkeiten, tausche dich aus und finde spannende Angebote.</p>
        <button className="primary-button large" onClick={()=>openAuth("register")}>Community entdecken →</button>
        <div className="hero-info"><div className="hero-icon">🏔️</div><div><h2>Das Ennstal verbindet.</h2><p>Menschen, Neuigkeiten, Veranstaltungen und lokale Angebote an einem Ort.</p></div></div>
      </section>
    </main>
  </div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [market, setMarket] = useState([]);
  const [messages, setMessages] = useState([]);
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [page, setPage] = useState("start");
  const [authMode, setAuthMode] = useState(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newPost, setNewPost] = useState("");
  const [marketForm, setMarketForm] = useState({title:"",description:"",price:""});
  const [profileForm, setProfileForm] = useState({first_name:"",last_name:"",nickname:"",bio:""});

  const user = session?.user || null;
  const isAdmin = isAdminRole(profile?.role);
  const isHead = profile?.role === "HEAD_ADMIN";
  const approvedMembers = useMemo(()=>members.filter(isApproved),[members]);
  const onlineMembers = useMemo(()=>approvedMembers.filter(m=>m.is_online),[approvedMembers]);
  const filteredMembers = useMemo(()=>approvedMembers.filter(m=>nameOf(m).toLowerCase().includes(search.toLowerCase())),[approvedMembers,search]);

  function show(text) {
    setNotice(text);
    window.clearTimeout(window.__ecNoticeTimer);
    window.__ecNoticeTimer = window.setTimeout(()=>setNotice(""),5000);
  }

  async function loadProfile(id) {
    const {data,error} = await supabase.from("profiles").select("*").eq("id",id).single();
    if (error) { show(error.message); return null; }
    setProfile(data);
    setProfileForm({
      first_name:data.first_name || "", last_name:data.last_name || "",
      nickname:data.nickname || "", bio:data.bio || ""
    });
    return data;
  }

  async function loadAll(currentProfile) {
    const [{data: m, error: me}, {data: p}, {data: mk}] = await Promise.all([
      supabase.from("profiles").select("*").order("nickname"),
      supabase.from("posts").select("*").order("created_at",{ascending:false}),
      supabase.from("marketplace_items").select("*").order("created_at",{ascending:false})
    ]);
    if (me) show(me.message);
    setMembers(m || []); setPosts(p || []); setMarket(mk || []);

    if (currentProfile && isAdminRole(currentProfile.role)) {
      const {data} = await supabase.from("profiles").select("*").eq("status","PENDING_ADMIN").order("created_at");
      setPending(data || []);
    } else setPending([]);

    if (user) {
      const {data} = await supabase.from("messages").select("*").order("created_at",{ascending:false}).limit(50);
      setMessages(data || []);
      const {data: fr} = await supabase.from("friend_requests").select("*").or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
      setFriends(fr || []);
    }
  }

  useEffect(()=>{
    let alive = true;
    (async()=>{
      const {data:{session}} = await supabase.auth.getSession();
      if (!alive) return;
      setSession(session);
      let p = null;
      if (session?.user) {
        p = await loadProfile(session.user.id);
        await loadAll(p);
        if (p) {
          await supabase.from("profiles").update({is_online:true,last_seen:new Date().toISOString()}).eq("id",p.id);
        }
      }
      if (alive) setLoading(false);
    })();

    const {data:{subscription}} = supabase.auth.onAuthStateChange(async(_event,newSession)=>{
      setSession(newSession);
      if (!newSession?.user) { setProfile(null); setPage("start"); return; }
      const p = await loadProfile(newSession.user.id);
      await loadAll(p);
    });
    return ()=>{alive=false; subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if (!user || !profile) return;
    const t = window.setInterval(async()=>{
      await supabase.from("profiles").update({is_online:true,last_seen:new Date().toISOString()}).eq("id",user.id);
      await loadAll(profile);
    },60000);
    return ()=>window.clearInterval(t);
  },[user?.id,profile?.role]);

  async function signOut() {
    if (user) await supabase.from("profiles").update({is_online:false,last_seen:new Date().toISOString()}).eq("id",user.id);
    await supabase.auth.signOut();
    setSession(null); setProfile(null);
  }

  async function createPost() {
    if (!newPost.trim()) return;
    const {error}=await supabase.from("posts").insert({author_id:user.id,content:newPost.trim()});
    if (error) return show(error.message);
    setNewPost(""); show("Beitrag veröffentlicht."); await loadAll(profile);
  }

  async function createMarketItem() {
    if (!marketForm.title.trim()) return show("Bitte einen Titel eingeben.");
    const {error}=await supabase.from("marketplace_items").insert({
      author_id:user.id,title:marketForm.title.trim(),
      description:marketForm.description.trim(),price:marketForm.price.trim()
    });
    if(error) return show(error.message);
    setMarketForm({title:"",description:"",price:""}); show("Angebot veröffentlicht."); await loadAll(profile);
  }

  async function saveProfile() {
    const {error}=await supabase.from("profiles").update({
      first_name:profileForm.first_name.trim(),last_name:profileForm.last_name.trim(),
      nickname:profileForm.nickname.trim(),bio:profileForm.bio.trim(),
      updated_at:new Date().toISOString()
    }).eq("id",user.id);
    if(error) return show(error.message);
    await loadProfile(user.id); await loadAll(profile); show("Profil gespeichert.");
  }

  async function setStatus(memberId,status) {
    const {error}=await supabase.rpc("set_account_status",{target_user:memberId,new_status:status,note:""});
    if(error) return show(error.message);
    show(status==="APPROVED" ? "Mitglied freigegeben." : "Registrierung abgelehnt.");
    await loadAll(profile);
  }

  async function changePoints(member) {
    const delta=Number(window.prompt("Punkte eingeben, z. B. 5 oder -3:"));
    if(!Number.isFinite(delta) || delta===0) return;
    const reason=window.prompt("Begründung (Pflicht):");
    if(!reason || reason.trim().length<3) return show("Eine Begründung ist erforderlich.");
    const {error}=await supabase.rpc("admin_change_points",{
      target_user:member.id,delta,
      change_kind:delta>0?"PLUS":"MINUS",reason_text:reason.trim()
    });
    if(error) return show(error.message);
    show("Punkte erfolgreich geändert."); await loadAll(profile);
  }

  async function sendFriendRequest(memberId) {
    if(memberId===user.id) return;
    const {error}=await supabase.from("friend_requests").insert({sender_id:user.id,receiver_id:memberId,status:"PENDING"});
    show(error ? error.message : "Freundschaftsanfrage gesendet.");
  }

  if(loading) return <div className="loading-screen"><img src={LOGO} alt="" /><p>Ennstal Connect wird geladen ...</p></div>;

  if(!user) return <>
    <PublicHome openAuth={setAuthMode} />
    {authMode && <AuthModal mode={authMode} setMode={setAuthMode} onClose={()=>setAuthMode(null)} notice={show}/>}
    {notice && <div className="notice">{notice}</div>}
  </>;

  if(profile && !isApproved(profile) && !isAdmin) return <div className="pending-page">
    <img src={LOGO} alt="Ennstal Connect" className="pending-logo"/>
    <div className="pending-card"><span className="eyebrow">ENNSTAL CONNECT</span>
      <h1>Dein Konto wartet auf Freigabe.</h1>
      <p>Willkommen {nameOf(profile)}. Ein Admin muss deine Registrierung noch freigeben.</p>
      <button className="secondary-button" onClick={signOut}>Abmelden</button>
    </div>
  </div>;

  const nav = (key,label)=> <button className={page===key?"active":""} onClick={()=>setPage(key)}>{label}</button>;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand brand-button" onClick={()=>setPage("start")}><img src={LOGO} alt=""/><span>Ennstal Connect</span></button>
      <nav className="main-nav">
        {nav("start","Start")}{nav("news","News")}{nav("members","Mitglieder")}
        {nav("marketplace","Marktplatz")}{nav("messages","Nachrichten")}
      </nav>
      <button className="profile-nav" onClick={()=>setPage("profile")}>{nameOf(profile)}</button>
    </header>

    {notice && <div className="notice">{notice}<button onClick={()=>setNotice("")}>×</button></div>}

    <main className="community-layout">
      <section className="main-content">
        {page==="start" && <Start profile={profile} posts={posts} members={approvedMembers} setPage={setPage}/>}
        {page==="news" && <News posts={posts} members={members} value={newPost} setValue={setNewPost} create={createPost}/>}
        {page==="members" && <Members members={filteredMembers} search={search} setSearch={setSearch} user={user} isAdmin={isAdmin} changePoints={changePoints} addFriend={sendFriendRequest}/>}
        {page==="marketplace" && <Marketplace items={market} members={members} form={marketForm} setForm={setMarketForm} create={createMarketItem}/>}
        {page==="messages" && <Messages messages={messages}/>}
        {page==="profile" && <Profile profile={profile} form={profileForm} setForm={setProfileForm} save={saveProfile}/>}
        {page==="admin" && isAdmin && <Admin pending={pending} approved={approvedMembers} setStatus={setStatus} changePoints={changePoints} isHead={isHead}/>}
      </section>

      <aside className="right-sidebar">
        <div className="sidebar-profile">
          <div className="avatar large">{initials(profile)}</div>
          <div><strong>{nameOf(profile)}</strong><small className="role-text">{roleLabel(profile?.role)}</small></div>
        </div>
        <div className="sidebar-card">
          <div className="sidebar-title"><h3>Online</h3><span>{onlineMembers.length}</span></div>
          {onlineMembers.slice(0,8).map(m=><div className="online-member" key={m.id}><div className="avatar tiny">{initials(m)}</div><span>{nameOf(m)}</span><i className="online-dot"/></div>)}
          {!onlineMembers.length && <p className="empty-text">Gerade niemand online.</p>}
        </div>
        <div className="sidebar-card">
          <div className="sidebar-title"><h3>Mein Bereich</h3></div>
          <div className="sidebar-menu">
            <button onClick={()=>setPage("profile")}>👤 Mein Profil</button>
            <button onClick={()=>setPage("members")}>👥 Freunde & Mitglieder <span>{friends.length||""}</span></button>
            <button onClick={()=>setPage("messages")}>💬 Nachrichten</button>
            <button onClick={()=>setPage("marketplace")}>🛍️ Meine Angebote</button>
            {isAdmin && <button onClick={()=>setPage("admin")}>🛠️ Admin Tools {pending.length>0&&<span>{pending.length}</span>}</button>}
            <button className="logout-button" onClick={signOut}>↪ Abmelden</button>
          </div>
        </div>
      </aside>
    </main>

    <footer><span>© {new Date().getFullYear()} Ennstal Connect</span><div><button>Impressum</button><button>Datenschutz</button><button>Community-Regeln</button></div></footer>
  </div>;
}

function Start({profile,posts,members,setPage}) {
  return <><section className="welcome-card"><span className="eyebrow">WILLKOMMEN ZURÜCK</span><h1>Hallo, {nameOf(profile)} 👋</h1><p>Schön, dass du wieder bei Ennstal Connect bist. Entdecke, was in deiner Community passiert.</p><div className="action-row"><button className="primary-button" onClick={()=>setPage("news")}>Beiträge entdecken</button><button className="secondary-button" onClick={()=>setPage("marketplace")}>Zum Marktplatz</button></div></section>
  <div className="stats"><div><b>{members.length}</b><span>Mitglieder</span></div><div><b>{posts.length}</b><span>Beiträge</span></div><div><b>∞</b><span>Verbunden</span></div></div>
  <section className="content-card"><div className="section-header"><h2>Neu in der Community</h2><button onClick={()=>setPage("news")}>Alle Beiträge →</button></div>{posts.slice(0,3).map(p=><article className="mini-post" key={p.id}><div className="avatar tiny">EC</div><div><strong>Community Mitglied</strong><p>{p.content}</p></div></article>)}{!posts.length&&<p className="empty-text">Noch keine Beiträge vorhanden.</p>}</section></>;
}

function News({posts,members,value,setValue,create}) {
  return <><div className="page-heading"><span className="eyebrow dark">COMMUNITY</span><h1>News & Beiträge</h1><p>Teile, was gerade im Ennstal passiert.</p></div>
  <div className="editor-card"><textarea value={value} onChange={e=>setValue(e.target.value)} placeholder="Schreibe etwas für die Community ..."/><button className="primary-button" onClick={create}>Beitrag veröffentlichen</button></div>
  <div className="posts">{posts.map(p=>{const a=members.find(m=>m.id===p.author_id);return <article className="post-card" key={p.id}><div className="post-header"><div className="avatar tiny">{initials(a)}</div><div><strong>{nameOf(a)}</strong><small>{p.created_at?new Date(p.created_at).toLocaleString("de-AT"):""}</small></div></div><p>{p.content}</p></article>})}{!posts.length&&<div className="empty-state">Noch keine Beiträge. Sei der Erste!</div>}</div></>;
}

function Members({members,search,setSearch,user,isAdmin,changePoints,addFriend}) {
  return <><div className="page-heading"><span className="eyebrow dark">COMMUNITY</span><h1>Mitglieder</h1><p>Menschen aus deiner Region kennenlernen und verbinden.</p></div><input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Mitglieder suchen ..."/>
  <div className="member-grid">{members.map(m=><article className="member-card" key={m.id}><div className="member-top"><div className="avatar">{initials(m)}</div>{m.role!=="MEMBER"&&<span className="role-badge">{roleLabel(m.role)}</span>}</div><h3>{nameOf(m)}</h3><p>{m.bio||"Mitglied der Ennstal Community"}</p><small className={m.is_online?"online":"offline"}>{m.is_online?"● Online":"● Offline"}</small><div className="member-actions">{m.id!==user.id&&<button className="secondary-button" onClick={()=>addFriend(m.id)}>Freund hinzufügen</button>}{isAdmin&&<button className="small-button" onClick={()=>changePoints(m)}>Punkte</button>}</div></article>)}</div></>;
}

function Marketplace({items,members,form,setForm,create}) {
 const set=(k,v)=>setForm(x=>({...x,[k]:v}));
 return <><div className="page-heading"><span className="eyebrow dark">REGIONAL</span><h1>Marktplatz</h1><p>Kaufen, verkaufen und tauschen – direkt in der Community.</p></div><div className="editor-card"><input placeholder="Titel" value={form.title} onChange={e=>set("title",e.target.value)}/><textarea placeholder="Beschreibung" value={form.description} onChange={e=>set("description",e.target.value)}/><input placeholder="Preis, z. B. 50 €" value={form.price} onChange={e=>set("price",e.target.value)}/><button className="primary-button" onClick={create}>Angebot veröffentlichen</button></div><div className="market-grid">{items.map(i=>{const a=members.find(m=>m.id===i.author_id);return <article className="market-card" key={i.id}><div className="market-image">🏔️</div><div><span className="price">{i.price||"Preis auf Anfrage"}</span><h3>{i.title}</h3><p>{i.description}</p><small>Angebot von {nameOf(a)}</small></div></article>})}{!items.length&&<div className="empty-state">Noch keine Angebote vorhanden.</div>}</div></>;
}

function Messages({messages}) { return <><div className="page-heading"><span className="eyebrow dark">KONTAKT</span><h1>Nachrichten</h1><p>Bleib mit deinen Freunden und Community-Mitgliedern verbunden.</p></div><div className="content-card">{messages.map(m=><div className="message-row" key={m.id}><div className="avatar tiny">EC</div><div><strong>Nachricht</strong><p>{m.content||m.content_text||""}</p></div></div>)}{!messages.length&&<div className="empty-state">Noch keine Nachrichten vorhanden.</div>}</div></>; }

function Profile({profile,form,setForm,save}) { const set=(k,v)=>setForm(x=>({...x,[k]:v})); return <><div className="page-heading"><span className="eyebrow dark">MEIN BEREICH</span><h1>Mein Profil</h1><p>Hier kannst du dein persönliches Profil bearbeiten.</p></div><div className="profile-editor"><div className="profile-preview"><div className="avatar profile-avatar">{initials(form)}</div><h2>{form.nickname||`${form.first_name} ${form.last_name}`}</h2><span className="role-badge">{roleLabel(profile.role)}</span></div><div className="profile-form"><div className="form-grid"><label>Vorname<input value={form.first_name} onChange={e=>set("first_name",e.target.value)}/></label><label>Nachname<input value={form.last_name} onChange={e=>set("last_name",e.target.value)}/></label></div><label>Spitzname<input value={form.nickname} onChange={e=>set("nickname",e.target.value)}/></label><label>Über mich<textarea value={form.bio} onChange={e=>set("bio",e.target.value)}/></label><button className="primary-button" onClick={save}>Änderungen speichern</button></div></div></>; }

function Admin({pending,approved,setStatus,changePoints,isHead}) { return <><div className="page-heading"><span className="eyebrow dark">VERWALTUNG</span><h1>Admin Tools</h1><p>Mitglieder freigeben und die Community verwalten.</p></div><section className="admin-section"><h2>Registrierungen zur Freigabe <span className="notification-badge">{pending.length}</span></h2>{pending.map(m=><div className="admin-member" key={m.id}><div className="avatar tiny">{initials(m)}</div><div><strong>{nameOf(m)}</strong><small>{m.created_at?new Date(m.created_at).toLocaleString("de-AT"):""}</small></div><div className="admin-actions"><button className="primary-button small-button" onClick={()=>setStatus(m.id,"APPROVED")}>Freigeben</button><button className="danger-button small-button" onClick={()=>setStatus(m.id,"REJECTED")}>Ablehnen</button></div></div>)}{!pending.length&&<div className="empty-state">Keine offenen Registrierungen.</div>}</section><section className="admin-section"><h2>Freigegebene Mitglieder</h2><div className="admin-list">{approved.map(m=><div className="admin-member" key={m.id}><span>{nameOf(m)} · {m.community_points||0} Punkte</span><button className="small-button" onClick={()=>changePoints(m)}>Punkte ändern</button></div>)}</div>{isHead&&<p className="admin-note">★ Hauptadmin-Zugriff aktiv.</p>}</section></>; }

createRoot(document.getElementById("root")).render(<App />);
