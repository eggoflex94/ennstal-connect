import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  Home, Users, MessageCircle, Newspaper, Gift, Settings, Shield,
  Crown, Star, Lock, Unlock, Trash2, Edit3, Save, Plus, LogOut
} from "lucide-react";

const ROLE_LABEL = {
  member: "Mitglied",
  supporter: "Supporter",
  admin: "Admin",
  head_admin: "Head Admin"
};

const ROLE_ORDER = { member: 0, supporter: 1, admin: 2, head_admin: 3 };

const DEFAULT_PERMISSIONS = {
  manage_members: false,
  manage_warnings: false,
  manage_restrictions: false,
  manage_roles: false,
  manage_forum: false,
  manage_news: false
};

function displayName(p) {
  if (!p) return "Unbekannt";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.nickname || full || "Mitglied";
}

function roleIcon(role) {
  if (role === "head_admin") return <Crown size={15}/>;
  if (role === "admin") return <Shield size={15}/>;
  if (role === "supporter") return <Star size={15}/>;
  return null;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [news, setNews] = useState([]);
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [restrictions, setRestrictions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [view, setView] = useState("home");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [editingPost, setEditingPost] = useState(null);

  const isHead = me?.role === "head_admin";
  const isAdmin = ["head_admin", "admin"].includes(me?.role);
  const privileged = ["head_admin", "admin", "supporter"].includes(me?.role);

  const can = (name) => isHead || permissions?.[name] === true;
  const restricted = (feature) => restrictions.some(r => r.feature === feature && r.active);

  const flash = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setLoading(false);
      return;
    }
    loadAll();
  }, [session?.user?.id]);

  async function rpc(name, args = {}) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadAll() {
    try {
      setLoading(true);
      const [profile, memberData, forumData, newsData, access, logData] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", session.user.id).single(),
        supabase.from("profiles").select("*").eq("account_status", "active").order("nickname"),
        supabase.from("forum_posts").select("*, author:profiles!forum_posts_author_id_fkey(*)").order("created_at", {ascending:false}),
        supabase.from("news").select("*, author:profiles!news_author_id_fkey(*)").order("created_at", {ascending:false}),
        rpc("refresh_my_access"),
        supabase.from("admin_logs").select("*").order("created_at", {ascending:false}).limit(100)
      ]);

      if (profile.error) throw profile.error;
      setMe(profile.data);
      setMembers(memberData.data || []);
      setPosts(forumData.data || []);
      setNews(newsData.data || []);
      setPermissions(access?.permissions || DEFAULT_PERMISSIONS);
      setRestrictions(access?.restrictions || []);
      setLogs(logData.data || []);
    } catch (e) {
      console.error(e);
      flash("Fehler beim Laden: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadAccess() {
    const access = await rpc("refresh_my_access");
    setPermissions(access?.permissions || DEFAULT_PERMISSIONS);
    setRestrictions(access?.restrictions || []);
    const {data} = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (data) setMe(data);
  }

  async function changeRole(userId, role) {
    try {
      await rpc("head_admin_set_role", { p_user_id: userId, p_role: role });
      await loadAll();
      flash("Rolle wurde aktualisiert.");
    } catch(e) { flash(e.message); }
  }

  async function togglePermission(userId, permission, value) {
    try {
      await rpc("head_admin_set_permission", {
        p_user_id: userId, p_permission: permission, p_allowed: value
      });
      await loadAll();
      flash("Berechtigung gespeichert.");
    } catch(e) { flash(e.message); }
  }

  async function toggleMemberFeature(userId, feature, value) {
    try {
      await rpc("head_admin_set_member_feature", {
        p_user_id: userId, p_feature: feature, p_allowed: value
      });
      await loadAll();
      flash("Freischaltung gespeichert.");
    } catch(e) { flash(e.message); }
  }

  async function toggleRestriction(userId, feature, active) {
    try {
      if (!can("manage_restrictions")) throw new Error("Keine Berechtigung.");
      await rpc("admin_set_restriction", {
        p_user_id: userId, p_feature: feature, p_active: active
      });
      await loadAll();
      flash(active ? "Funktion wurde gesperrt." : "Funktion wurde entsperrt.");
    } catch(e) { flash(e.message); }
  }

  async function savePost(post) {
    try {
      if (!post.title?.trim() || !post.content?.trim()) throw new Error("Titel und Inhalt sind erforderlich.");
      if (editingPost?.id) {
        const {error} = await supabase.from("forum_posts")
          .update({title:post.title.trim(), content:post.content.trim(), updated_at:new Date().toISOString()})
          .eq("id", editingPost.id);
        if (error) throw error;
      } else {
        if (restricted("forum")) throw new Error("Deine Forum-Funktion ist derzeit gesperrt.");
        const {error} = await supabase.from("forum_posts").insert({
          author_id: session.user.id, title: post.title.trim(), content: post.content.trim()
        });
        if (error) throw error;
      }
      setEditingPost(null);
      await loadAll();
      flash("Beitrag gespeichert.");
    } catch(e) { flash(e.message); }
  }

  async function deletePost(id) {
    if (!confirm("Beitrag wirklich löschen?")) return;
    try {
      const {error} = await supabase.from("forum_posts").delete().eq("id", id);
      if (error) throw error;
      await loadAll();
      flash("Beitrag gelöscht.");
    } catch(e) { flash(e.message); }
  }

  async function saveNews(item) {
    try {
      if (!can("manage_news")) throw new Error("Keine Berechtigung für News.");
      const {error} = await supabase.from("news").insert({
        author_id: session.user.id, title: item.title.trim(), content: item.content.trim()
      });
      if (error) throw error;
      await loadAll();
      flash("News veröffentlicht.");
    } catch(e) { flash(e.message); }
  }

  async function logout() {
    await supabase.auth.signOut();
    setMe(null);
  }

  if (!session) {
    return <AuthScreen onDone={() => supabase.auth.getSession().then(({data}) => setSession(data.session)} />;
  }

  const nav = [
    ["home", Home, "Startseite"],
    ["members", Users, "Mitglieder"],
    ["forum", MessageCircle, "Forum"],
    ["news", Newspaper, "News & Beiträge"],
    ["rewards", Gift, "Belohnungen"],
    ["profile", Settings, "Mein Profil"]
  ];

  if (isAdmin) nav.push(["admin", Shield, "Admin-Bereich"]);
  if (isHead) nav.push(["logs", Crown, "Admin-Logbuch"]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Star fill="currentColor"/></div>
          <div><b>ennstal</b><span>connect</span></div>
        </div>

        <button className={`identity-card role-${me?.role}`} onClick={() => setView("profile")}>
          <Avatar profile={me}/>
          <div className="identity-copy">
            <strong>{displayName(me)}</strong>
            <RoleBadge role={me?.role}/>
          </div>
        </button>

        <nav>
          {nav.map(([id, Icon, label]) => (
            <button key={id} className={view===id ? "active":""} onClick={() => setView(id)}>
              <Icon size={18}/><span>{label}</span>
            </button>
          ))}
        </nav>

        <button className="logout" onClick={logout}><LogOut size={18}/> Abmelden</button>
      </aside>

      <main className="content">
        {notice && <div className="notice">{notice}</div>}
        {loading ? <div className="loading">ENNSTAL CONNECT wird geladen…</div> : (
          <>
            {view === "home" && <HomeView me={me} members={members} posts={posts} news={news} setView={setView}/>}
            {view === "members" && <MembersView members={members} me={me} isHead={isHead} can={can}
              changeRole={changeRole} togglePermission={togglePermission}
              toggleRestriction={toggleRestriction} toggleMemberFeature={toggleMemberFeature}/>}
            {view === "forum" && <ForumView posts={posts} me={me} can={can} editingPost={editingPost}
              setEditingPost={setEditingPost} savePost={savePost} deletePost={deletePost} restricted={restricted}/>}
            {view === "news" && <NewsView news={news} me={me} can={can} saveNews={saveNews}/>}
            {view === "rewards" && <RewardsView privileged={privileged} me={me}/>}
            {view === "profile" && <ProfileView me={me} isHead={isHead} privileged={privileged} reload={loadAll} flash={flash}/>}
            {view === "admin" && <AdminView members={members} me={me} isHead={isHead} can={can}
              changeRole={changeRole} togglePermission={togglePermission} toggleRestriction={toggleRestriction}
              toggleMemberFeature={toggleMemberFeature}/>}
            {view === "logs" && <LogsView logs={logs}/>}
          </>
        )}
      </main>
    </div>
  );
}

function AuthScreen() {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [mode,setMode]=useState("login");
  const [message,setMessage]=useState("");

  async function submit(e) {
    e.preventDefault();
    const result = mode==="login"
      ? await supabase.auth.signInWithPassword({email,password})
      : await supabase.auth.signUp({email,password});
    setMessage(result.error?.message || (mode==="login" ? "Angemeldet." : "Registrierung erfolgreich. Bitte E-Mail bestätigen."));
  }

  return <div className="auth-page"><form className="auth-card" onSubmit={submit}>
    <div className="brand auth-brand"><b>ennstal</b><span>connect</span></div>
    <h1>{mode==="login" ? "Willkommen zurück" : "Mitglied werden"}</h1>
    <input type="email" placeholder="E-Mail" value={email} onChange={e=>setEmail(e.target.value)} required/>
    <input type="password" placeholder="Passwort" value={password} onChange={e=>setPassword(e.target.value)} required/>
    <button className="primary">{mode==="login" ? "Anmelden" : "Registrieren"}</button>
    <button type="button" className="link-button" onClick={()=>setMode(mode==="login"?"signup":"login")}>
      {mode==="login" ? "Noch kein Konto? Registrieren" : "Bereits Mitglied? Anmelden"}
    </button>
    {message && <p className="form-message">{message}</p>}
  </form></div>
}

function HomeView({me,members,posts,news,setView}) {
  return <div className="page">
    <section className="hero">
      <div className="hero-logo"><div className="brand-mark"><Star fill="currentColor"/></div><div><b>ennstal</b><span>connect</span></div></div>
      <div className="hero-text"><p className="eyebrow">DEINE REGION · DEINE COMMUNITY</p><h1>Willkommen zurück, {displayName(me)}.</h1><p>Alles Wichtige aus der Community auf einen Blick.</p></div>
      <RoleBadge role={me?.role}/>
    </section>

    <section className="stats-grid">
      <Stat label="Mitglieder" value={members.length} icon={<Users/>}/>
      <Stat label="Diskussionen" value={posts.length} icon={<MessageCircle/>}/>
      <Stat label="Neuigkeiten" value={news.length} icon={<Newspaper/>}/>
    </section>

    <section className="dashboard-grid">
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">COMMUNITY</span><h2>Aktuelle Diskussionen</h2></div><button onClick={()=>setView("forum")}>Alle ansehen</button></div>
        {posts.slice(0,4).map(p=><article className="compact-post" key={p.id}><Avatar profile={p.author}/><div><strong>{p.title}</strong><span>{displayName(p.author)} · {new Date(p.created_at).toLocaleDateString("de-DE")}</span></div></article>)}
        {!posts.length && <Empty text="Noch keine Diskussionen vorhanden."/>}
      </div>
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">AKTUELL</span><h2>News</h2></div><button onClick={()=>setView("news")}>Alle ansehen</button></div>
        {news.slice(0,4).map(n=><article className="compact-post" key={n.id}><div className="news-dot"><Newspaper size={16}/></div><div><strong>{n.title}</strong><span>{new Date(n.created_at).toLocaleDateString("de-DE")}</span></div></article>)}
        {!news.length && <Empty text="Noch keine News veröffentlicht."/>}
      </div>
    </section>
  </div>
}

function MembersView(props) {
  const [search,setSearch]=useState("");
  const filtered=props.members.filter(m=>displayName(m).toLowerCase().includes(search.toLowerCase()) || `${m.first_name||""} ${m.last_name||""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="page">
    <PageTitle eyebrow="COMMUNITY" title="Mitglieder" subtitle="Entdecke und verwalte die Community."/>
    <input className="search" placeholder="Mitglieder suchen…" value={search} onChange={e=>setSearch(e.target.value)}/>
    <div className="member-grid">{filtered.map(m=><MemberCard key={m.id} member={m} {...props}/>)}</div>
  </div>
}

function MemberCard({member,me,isHead,can,changeRole,togglePermission,toggleRestriction,toggleMemberFeature}) {
  const [open,setOpen]=useState(false);
  const isSelf=member.id===me?.id;
  const showTools=!isSelf && (isHead || can("manage_members"));
  return <article className={`member-card role-${member.role}`}>
    <div className="member-top"><Avatar profile={member} size="xl"/><RoleBadge role={member.role}/></div>
    <h2>{displayName(member)}</h2>
    <p>{member.first_name && member.last_name ? `${member.first_name} ${member.last_name}` : "Community-Mitglied"}</p>
    {showTools && <button className="secondary" onClick={()=>setOpen(!open)}>{open ? "Werkzeuge schließen" : "Admin-Werkzeuge"}</button>}
    {open && <div className="admin-tools">
      {isHead && <label>Rolle<select value={member.role} onChange={e=>changeRole(member.id,e.target.value)}>
        <option value="member">Mitglied</option><option value="supporter">Supporter</option><option value="admin">Admin</option>
      </select></label>}
      {can("manage_restrictions") && <div className="tool-block"><b>Funktionen sperren</b>
        {["messages","forum","profile_edit","news"].map(f=><Toggle key={f} label={f} checked={false} onChange={v=>toggleRestriction(member.id,f,v)}/>)}
      </div>}
      {isHead && member.role==="admin" && <div className="tool-block"><b>Admin-Berechtigungen</b>
        {Object.keys(DEFAULT_PERMISSIONS).map(p=><Toggle key={p} label={p} checked={false} onChange={v=>togglePermission(member.id,p,v)}/>)}
      </div>}
      {isHead && member.role==="member" && <div className="tool-block"><b>Mitglied freischalten</b>
        <Toggle label="Belohnungen" checked={false} onChange={v=>toggleMemberFeature(member.id,"rewards",v)}/>
        <Toggle label="Profilbild-Upload" checked={false} onChange={v=>toggleMemberFeature(member.id,"avatar_upload",v)}/>
      </div>}
    </div>}
  </article>
}

function ForumView({posts,me,can,editingPost,setEditingPost,savePost,deletePost,restricted}) {
  const [draft,setDraft]=useState({title:"",content:""});
  const isEditing=editingPost!==null;
  const submit=e=>{e.preventDefault(); savePost(isEditing?{...draft,id:editingPost.id}:draft); setDraft({title:"",content:""});};
  useEffect(()=>{if(editingPost)setDraft({title:editingPost.title,content:editingPost.content});},[editingPost]);

  return <div className="page">
    <PageTitle eyebrow="COMMUNITY" title="Forum" subtitle="Diskutiere mit der Community."/>
    {!restricted("forum") && <form className="composer panel" onSubmit={submit}>
      <input placeholder="Titel deiner Diskussion" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} required/>
      <textarea placeholder="Was möchtest du besprechen?" value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})} required/>
      <div className="row"><button className="primary">{isEditing?"Änderung speichern":"Beitrag veröffentlichen"}</button>{isEditing&&<button type="button" className="secondary" onClick={()=>setEditingPost(null)}>Abbrechen</button>}</div>
    </form>}
    {restricted("forum") && <div className="restriction"><Lock/> Deine Forum-Funktion wurde eingeschränkt.</div>}
    <div className="post-list">{posts.map(p=>{
      const owner=p.author_id===me.id;
      const moderator=me.role==="head_admin" || (can("manage_forum") && ["admin","head_admin"].includes(me.role));
      return <article className="post-card" key={p.id}><div className="post-author"><Avatar profile={p.author}/><div><b>{displayName(p.author)}</b><RoleBadge role={p.author?.role}/></div></div><h2>{p.title}</h2><p>{p.content}</p><div className="post-footer"><span>{new Date(p.created_at).toLocaleString("de-DE")}</span>{(owner||moderator)&&<div><button onClick={()=>setEditingPost(p)}><Edit3 size={15}/> Bearbeiten</button><button className="danger-text" onClick={()=>deletePost(p.id)}><Trash2 size={15}/> Löschen</button></div>}</div></article>
    })}</div>
    {!posts.length&&<Empty text="Starte die erste Diskussion."/>}
  </div>
}

function NewsView({news,can,saveNews}) {
  const [draft,setDraft]=useState({title:"",content:""});
  return <div className="page"><PageTitle eyebrow="AKTUELL" title="News & Beiträge" subtitle="Neuigkeiten aus ENNSTAL CONNECT."/>
    {can("manage_news")&&<form className="composer panel" onSubmit={e=>{e.preventDefault();saveNews(draft);setDraft({title:"",content:""});}}><input placeholder="Überschrift" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><textarea placeholder="Neuigkeit schreiben…" value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/><button className="primary">News veröffentlichen</button></form>}
    <div className="news-list">{news.map(n=><article className="news-card" key={n.id}><span className="eyebrow">{new Date(n.created_at).toLocaleDateString("de-DE")}</span><h2>{n.title}</h2><p>{n.content}</p></article>)}</div>
    {!news.length&&<Empty text="Noch keine News vorhanden."/>
    }
  </div>
}

function RewardsView({privileged,me}) {
  return <div className="page"><PageTitle eyebrow="BONUS" title="Belohnungen" subtitle="Deine Vorteile und Community-Belohnungen."/>
    {privileged||me?.member_features?.rewards ? <div className="reward-grid">
      {["Community-Bonus","Exklusives Profil-Design","Event-Vorteile","Supporter-Bonus"].map((x,i)=><article className="reward-card" key={x}><Gift/><span>Belohnung {i+1}</span><h2>{x}</h2><button className="primary">Nutzen</button></article>)}
    </div> : <div className="restriction"><Lock/> Diese Funktion wurde für dein Konto noch nicht freigeschaltet.</div>}
  </div>
}

function ProfileView({me,isHead,privileged,reload,flash}) {
  const [draft,setDraft]=useState(me);
  useEffect(()=>setDraft(me),[me]);
  async function save(e){e.preventDefault();try{
    const payload={nickname:draft.nickname||null,bio:draft.bio||null,avatar_url:draft.avatar_url||null};
    if(isHead){payload.first_name=draft.first_name;payload.last_name=draft.last_name;payload.birth_date=draft.birth_date;}
    const {error}=await supabase.from("profiles").update(payload).eq("id",me.id); if(error)throw error;
    await reload();flash("Profil gespeichert.");
  }catch(e){flash(e.message)}}
  return <div className="page"><PageTitle eyebrow="KONTO" title="Mein Profil" subtitle="Deine persönlichen Einstellungen."/>
    <form className="profile-form panel" onSubmit={save}><div className="profile-preview"><Avatar profile={{...me,...draft}} size="xl"/><RoleBadge role={me.role}/></div>
      {isHead&&<div className="form-grid"><label>Vorname<input value={draft.first_name||""} onChange={e=>setDraft({...draft,first_name:e.target.value})} required/></label><label>Nachname<input value={draft.last_name||""} onChange={e=>setDraft({...draft,last_name:e.target.value})} required/></label><label>Geburtsdatum<input type="date" value={draft.birth_date||""} onChange={e=>setDraft({...draft,birth_date:e.target.value})} required/></label></div>}
      <label>Benutzername<input value={draft.nickname||""} onChange={e=>setDraft({...draft,nickname:e.target.value})}/></label>
      <label>Über mich<textarea value={draft.bio||""} onChange={e=>setDraft({...draft,bio:e.target.value})}/></label>
      {privileged||me?.member_features?.avatar_upload?<label>Profilbild URL<input value={draft.avatar_url||""} onChange={e=>setDraft({...draft,avatar_url:e.target.value})}/></label>:<p className="hint">Der Profilbild-Upload wurde für dein Konto noch nicht freigeschaltet.</p>}
      <button className="primary"><Save size={17}/> Speichern</button>
      {!isHead&&<small>Vorname, Nachname und Geburtsdatum können nach der Registrierung nur vom Head Admin geändert werden.</small>}
    </form></div>
}

function AdminView(props) {
  return <div className="page"><PageTitle eyebrow="MODERATION" title="Admin-Bereich" subtitle="Mitglieder, Rollen, Berechtigungen und Einschränkungen verwalten."/>
    <div className="panel admin-summary"><Shield/><div><h2>Verwaltung</h2><p>Änderungen werden serverseitig gespeichert und direkt nachgeladen.</p></div></div>
    <div className="member-grid">{props.members.filter(m=>m.id!==props.me.id).map(m=><MemberCard key={m.id} member={m} {...props}/>)}</div>
  </div>
}

function LogsView({logs}) {
  return <div className="page"><PageTitle eyebrow="HEAD ADMIN" title="Admin-Logbuch" subtitle="Alle wichtigen Verwaltungsaktionen."/>
    <div className="panel log-list">{logs.map(l=><div className="log-row" key={l.id}><div><b>{l.action}</b><span>{l.target_id||"System"}</span></div><time>{new Date(l.created_at).toLocaleString("de-DE")}</time></div>)}{!logs.length&&<Empty text="Noch keine Einträge."/>)}</div>
  </div>
}

function PageTitle({eyebrow,title,subtitle}) { return <header className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</header> }
function Stat({label,value,icon}) { return <div className="stat-card"><div>{icon}</div><strong>{value}</strong><span>{label}</span></div> }
function Empty({text}) { return <div className="empty">{text}</div> }
function Avatar({profile,size=""}) { return <div className={`avatar ${size}`}><img src={profile?.avatar_url||"https://placehold.co/160x160?text=EC"} alt={displayName(profile)} onError={e=>e.currentTarget.src="https://placehold.co/160x160?text=EC"}/></div> }
function RoleBadge({role}) { if(!role)return null; return <span className={`role-badge ${role}`}>{roleIcon(role)} {ROLE_LABEL[role]||"Mitglied"}</span> }
function Toggle({label,checked,onChange}) { const [value,setValue]=useState(checked); return <label className="toggle"><span>{label.replaceAll("_"," ")}</span><input type="checkbox" checked={value} onChange={e=>{setValue(e.target.checked);onChange(e.target.checked)}}/></label> }
