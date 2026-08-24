import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";
import ProfileView from "./ProfileView";

const ROLES = { MEMBER:"MEMBER", SUPPORTER:"SUPPORTER", ADMIN:"ADMIN", HEAD_ADMIN:"HEAD_ADMIN" };
const DEFAULT_AVATAR = "/default-avatar.svg";
const roleMeta = {
  HEAD_ADMIN: { icon:"👑", label:"Head Admin", cls:"head-admin" },
  ADMIN: { icon:"★", label:"Admin", cls:"admin" },
  SUPPORTER: { icon:"✦", label:"Supporter", cls:"supporter" },
  MEMBER: { icon:"●", label:"Mitglied", cls:"member" }
};
const getName = m => m?.nickname || [m?.first_name,m?.last_name].filter(Boolean).join(" ") || "Mitglied";
const getAge = d => { if(!d) return null; const b=new Date(d), t=new Date(); let a=t.getFullYear()-b.getFullYear(); if(t.getMonth()<b.getMonth() || (t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--; return a; };
const isAdmin = r => r==="ADMIN" || r==="HEAD_ADMIN";
const isHead = r => r==="HEAD_ADMIN";

function RoleBadge({role}) { const r=roleMeta[role]||roleMeta.MEMBER; return <span className={`role-badge ${r.cls}`}>{r.icon} {r.label}</span>; }

export default function App() {
  const [user,setUser]=useState(null), [profile,setProfile]=useState(null), [members,setMembers]=useState([]);
  const [friendships,setFriendships]=useState([]), [messages,setMessages]=useState([]), [news,setNews]=useState([]);
  const [forumPosts,setForumPosts]=useState([]), [permissions,setPermissions]=useState({}), [restrictions,setRestrictions]=useState([]);
  const [adminLogs,setAdminLogs]=useState([]), [warnings,setWarnings]=useState([]), [loading,setLoading]=useState(true);
  const [page,setPage]=useState("home"), [selectedMember,setSelectedMember]=useState(null), [chatMember,setChatMember]=useState(null);
  const [search,setSearch]=useState(""), [notice,setNotice]=useState(""), [messageText,setMessageText]=useState("");

  const notify = text => { setNotice(text); window.clearTimeout(window.__ecNotice); window.__ecNotice=window.setTimeout(()=>setNotice(""),4000); };
  const can = key => isHead(profile?.role) || !!permissions?.[key];

  async function safe(label, query, fallback) {
    const {data,error}=await query;
    if(error) { console.warn(label,error.message); return fallback; }
    return data ?? fallback;
  }
  async function loadAll() {
    setLoading(true);
    const {data:{session}}=await supabase.auth.getSession();
    const current=session?.user||null; setUser(current);
    if(!current){ setProfile(null); setLoading(false); return; }
    await supabase.rpc("ensure_current_profile").catch(()=>{});
    const [me, all, friends, msgs, newsRows, forumRows, perms, rest, logs, warns] = await Promise.all([
      safe("Profil",supabase.from("profiles").select("*").eq("id",current.id).maybeSingle(),null),
      safe("Mitglieder",supabase.from("profiles").select("*").neq("account_status","DELETED"),[]),
      safe("Freundschaften",supabase.from("friendships").select("*").or(`requester_id.eq.${current.id},receiver_id.eq.${current.id}`),[]),
      safe("Nachrichten",supabase.from("messages").select("*").or(`sender_id.eq.${current.id},receiver_id.eq.${current.id}`).order("created_at",{ascending:true}),[]),
      safe("News",supabase.from("news").select("*").order("created_at",{ascending:false}),[]),
      safe("Forum",supabase.from("forum_posts").select("*").order("created_at",{ascending:false}),[]),
      safe("Berechtigungen",supabase.from("user_permissions").select("*").eq("user_id",current.id).maybeSingle(),{}),
      safe("Sperren",supabase.from("user_restrictions").select("*").eq("user_id",current.id),[]),
      safe("Admin-Log",supabase.from("admin_logs").select("*").order("created_at",{ascending:false}).limit(100),[]),
      safe("Verwarnungen",supabase.from("user_warnings").select("*").order("created_at",{ascending:false}),[])
    ]);
    setProfile(me); setMembers(all); setFriendships(friends); setMessages(msgs); setNews(newsRows); setForumPosts(forumRows);
    setPermissions(perms||{}); setRestrictions(rest); setAdminLogs(logs); setWarnings(warns); setLoading(false);
  }
  useEffect(()=>{ loadAll(); const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>loadAll()); return ()=>subscription.unsubscribe(); },[]);

  const activeRestrictions=useMemo(()=>new Set(restrictions.filter(r=>!r.expires_at||new Date(r.expires_at)>new Date()).map(r=>r.feature)),[restrictions]);
  const visibleMembers=useMemo(()=>members.filter(m=>m.account_status!=="DELETED"),[members]);
  const orderedMembers=useMemo(()=>[...visibleMembers].filter(m=>getName(m).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>{
    const order={HEAD_ADMIN:0,ADMIN:1,SUPPORTER:2,MEMBER:3}; return (order[a.role]??9)-(order[b.role]??9)||getName(a).localeCompare(getName(b),"de");
  }),[visibleMembers,search]);
  const acceptedIds=useMemo(()=>friendships.filter(f=>f.status==="ACCEPTED").map(f=>f.requester_id===user?.id?f.receiver_id:f.requester_id),[friendships,user?.id]);
  const myFriends=visibleMembers.filter(m=>acceptedIds.includes(m.id));
  const rewardLevel=Number(profile?.reward_level||0), hours=Number(profile?.total_online_seconds||0)/3600;
  const nextHours=Math.max(0,5-(Number(profile?.total_online_seconds||0)-Number(profile?.last_reward_seconds||0))/3600);

  async function login(e){e.preventDefault(); const f=new FormData(e.currentTarget); const {error}=await supabase.auth.signInWithPassword({email:f.get("email"),password:f.get("password")}); if(error)return notify(error.message); notify("Willkommen zurück!");}
  async function register(e){e.preventDefault(); const f=new FormData(e.currentTarget); const first_name=String(f.get("first_name")||"").trim(),last_name=String(f.get("last_name")||"").trim(),birth_date=String(f.get("birth_date")||"").trim(); if(!first_name||!last_name||!birth_date)return notify("Vorname, Nachname und Geburtsdatum sind Pflichtfelder."); const {error}=await supabase.auth.signUp({email:f.get("email"),password:f.get("password"),options:{emailRedirectTo:window.location.origin+"/",data:{nickname:f.get("nickname"),first_name,last_name,birth_date}}}); if(error)return notify(error.message); notify("Registrierung erfolgreich. Bitte E-Mail bestätigen.");}
  async function logout(){await supabase.auth.signOut(); setPage("home");}
  async function requestFriend(member){ if(member.id===user.id)return; const existing=friendships.find(f=>(f.requester_id===user.id&&f.receiver_id===member.id)||(f.receiver_id===user.id&&f.requester_id===member.id)); if(existing)return notify(existing.status==="ACCEPTED"?"Ihr seid bereits Freunde.":"Anfrage ist bereits vorhanden."); const {error}=await supabase.from("friendships").insert({requester_id:user.id,receiver_id:member.id,status:"PENDING"}); if(error)return notify(error.message); notify("Freundschaftsanfrage gesendet."); loadAll(); }
  async function respondFriend(f,accept){const {error}=await supabase.from("friendships").update({status:accept?"ACCEPTED":"DECLINED"}).eq("id",f.id); if(error)return notify(error.message); notify(accept?"Freundschaft angenommen.":"Anfrage abgelehnt."); loadAll();}
  async function sendMessage(e){e.preventDefault(); if(activeRestrictions.has("messages"))return notify("Deine Nachrichtenfunktion ist derzeit gesperrt."); if(!chatMember||!messageText.trim())return; const {error}=await supabase.from("messages").insert({sender_id:user.id,receiver_id:chatMember.id,content:messageText.trim()}); if(error)return notify(error.message); setMessageText(""); loadAll();}
  async function createForum(e){e.preventDefault(); if(activeRestrictions.has("forum"))return notify("Deine Forum-Funktion ist derzeit gesperrt."); const f=new FormData(e.currentTarget),title=String(f.get("title")||"").trim(),content=String(f.get("content")||"").trim(); if(!title||!content)return; const {error}=await supabase.from("forum_posts").insert({author_id:user.id,title,content}); if(error)return notify(error.message); e.currentTarget.reset(); loadAll();}
  async function createNews(e){e.preventDefault(); if(!can("manage_news"))return notify("Keine Berechtigung."); const f=new FormData(e.currentTarget),title=String(f.get("title")||"").trim(),content=String(f.get("content")||"").trim(); const {error}=await supabase.from("news").insert({created_by:user.id,title,content,image_url:String(f.get("image_url")||"").trim()||null}); if(error)return notify(error.message); e.currentTarget.reset(); loadAll();}
  async function openMember(member){setSelectedMember(member);setPage("member"); if(member.id!==user.id) await supabase.rpc("record_profile_visit",{target_profile:member.id}).catch(()=>{});}
  async function syncReward(){const {data,error}=await supabase.rpc("record_online_activity"); if(error)return; if(data)setProfile(p=>({...p,...data}));}
  useEffect(()=>{if(!user)return; syncReward(); const i=setInterval(syncReward,60000); return()=>clearInterval(i);},[user?.id]);
  async function claimReward(){const {data,error}=await supabase.rpc("claim_online_reward"); if(error)return notify(error.message); notify(data?.message||"Belohnung aktualisiert."); loadAll();}

  if(loading) return <div className="boot">Ennstal Connect wird geladen…</div>;
  if(!user) return <Auth onLogin={login} onRegister={register} notice={notice}/>;

  const incoming=friendships.filter(f=>f.receiver_id===user.id&&f.status==="PENDING");
  const nav=[["home","⌂","Startseite"],["members","♧","Mitglieder"],["friends","🤝","Freunde"],["forum","☏","Forum"],["news","▣","News & Beiträge"],["messages","✉","Nachrichten"],["rewards","🎁","Belohnungen"],["profile","⚙","Mein Profil"]];
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand">ENNSTAL <b>CONNECT</b></div><div className="me-card"><img src={profile?.avatar_url||DEFAULT_AVATAR}/><div><strong>{getName(profile)}</strong><RoleBadge role={profile?.role}/></div></div>
      <nav>{nav.map(([id,ic,label])=><button key={id} className={page===id?"active":""} onClick={()=>{setPage(id);setSelectedMember(null);setChatMember(null)}}><span>{ic}</span>{label}</button>)}
      {isAdmin(profile?.role)&&<button className={page==="admin"?"active":""} onClick={()=>setPage("admin")}>★ Admin-Bereich</button>}
      {isHead(profile?.role)&&<button className={page==="admin-log"?"active":""} onClick={()=>setPage("admin-log")}>👑 Admin-Logbuch</button>}</nav>
      <button className="logout" onClick={logout}>Abmelden</button>
    </aside>
    <main className="main-content">
      {notice&&<div className="notice">{notice}</div>}
      {page==="home"&&<Home profile={profile} friends={myFriends} news={news} forum={forumPosts} onPage={setPage}/>}
      {page==="members"&&<Members members={orderedMembers} search={search} setSearch={setSearch} onOpen={openMember}/>}
      {page==="friends"&&<Friends friends={myFriends} incoming={incoming} members={members} onRespond={respondFriend} onOpen={openMember}/>}
      {page==="forum"&&<Forum posts={forumPosts} members={members} onSubmit={createForum} restricted={activeRestrictions.has("forum")}/>}
      {page==="news"&&<News news={news} members={members} canManage={can("manage_news")} onSubmit={createNews}/>}
      {page==="messages"&&<Messages members={members} messages={messages} user={user} chatMember={chatMember} setChatMember={setChatMember} text={messageText} setText={setMessageText} onSend={sendMessage} restricted={activeRestrictions.has("messages")}/>}
      {page==="rewards"&&<Rewards level={rewardLevel} hours={hours} remaining={nextHours} onClaim={claimReward}/>}
      {page==="profile"&&<ProfileView member={profile} currentUserId={user.id} viewerRole={profile?.role} onProfileSaved={u=>{setProfile(u);setMembers(ms=>ms.map(m=>m.id===u.id?u:m))}} onMessage={m=>{setChatMember(m);setPage("messages")}} restrictions={activeRestrictions}/>}
      {page==="member"&&selectedMember&&<ProfileView member={selectedMember} currentUserId={user.id} viewerRole={profile?.role} viewerPermissions={permissions} onClose={()=>setPage("members")} onProfileSaved={u=>setMembers(ms=>ms.map(m=>m.id===u.id?u:m))} onMessage={m=>{setChatMember(m);setPage("messages")}} onFriend={requestFriend} />}
      {page==="admin"&&isAdmin(profile?.role)&&<Admin members={members} warnings={warnings} onOpen={openMember} can={can}/>}
      {page==="admin-log"&&isHead(profile?.role)&&<AdminLog logs={adminLogs} members={members}/>}
    </main>
    <aside className="rightbar"><h3>ONLINE</h3>{visibleMembers.filter(m=>m.is_online).slice(0,8).map(m=><button className="person-row" key={m.id} onClick={()=>openMember(m)}><img src={m.avatar_url||DEFAULT_AVATAR}/><span>{getName(m)}<RoleBadge role={m.role}/></span></button>)}<h3>FREUNDE</h3>{myFriends.slice(0,6).map(m=><button className="person-row" key={m.id} onClick={()=>openMember(m)}><img src={m.avatar_url||DEFAULT_AVATAR}/><span>{getName(m)}</span></button>)}</aside>
  </div>;
}

function Auth({onLogin,onRegister,notice}){const [mode,setMode]=useState("login");return <div className="auth"><div className="auth-card"><div className="brand big">ENNSTAL <b>CONNECT</b></div><h1>{mode==="login"?"Willkommen zurück":"Community beitreten"}</h1>{notice&&<div className="notice">{notice}</div>}{mode==="login"?<form onSubmit={onLogin}><input name="email" type="email" placeholder="E-Mail" required/><input name="password" type="password" placeholder="Passwort" required/><button className="primary">Anmelden</button></form>:<form onSubmit={onRegister}><div className="two"><input name="first_name" placeholder="Vorname *" required/><input name="last_name" placeholder="Nachname *" required/></div><input name="nickname" placeholder="Benutzername"/><input name="birth_date" type="date" required/><input name="email" type="email" placeholder="E-Mail" required/><input name="password" type="password" minLength="6" placeholder="Passwort" required/><button className="primary">Registrieren</button></form>}<button className="link" onClick={()=>setMode(mode==="login"?"register":"login")}>{mode==="login"?"Noch kein Konto? Registrieren":"Bereits registriert? Anmelden"}</button></div></div>;}
function Home({profile,friends,news,forum,onPage}){return <><header className="hero"><div><span>DEINE COMMUNITY</span><h1>Willkommen zurück, {getName(profile)} 👋</h1><p>Alles Wichtige auf einen Blick.</p></div><RoleBadge role={profile.role}/></header><div className="dashboard"><Card title="Neueste Beiträge" value={forum.length} text="Aktuelle Diskussionen" onClick={()=>onPage("forum")}/><Card title="Meine Freunde" value={friends.length} text="Mitglieder in deinem Netzwerk" onClick={()=>onPage("friends")}/><Card title="News" value={news.length} text="Neuigkeiten aus der Community" onClick={()=>onPage("news")}/></div><section className="panel"><div className="section-head"><h2>Aktuelles</h2><button className="ghost" onClick={()=>onPage("news")}>Alle News</button></div>{news.slice(0,3).map(n=><article className="feed" key={n.id}><div><h3>{n.title}</h3><p>{n.content}</p></div></article>)}{!news.length&&<p className="muted">Noch keine News vorhanden.</p>}</section></>}
function Card({title,value,text,onClick}){return <button className="stat-card" onClick={onClick}><span>{title}</span><strong>{value}</strong><small>{text}</small></button>;}
function Members({members,search,setSearch,onOpen}){return <Page title="Mitglieder" sub="Entdecke die Community"><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Mitglieder suchen…"/><div className="member-grid">{members.map(m=><button className="member-card" key={m.id} onClick={()=>onOpen(m)}><img src={m.avatar_url||DEFAULT_AVATAR}/><div><RoleBadge role={m.role}/><h3>{getName(m)}</h3><p>{m.first_name} {m.last_name}{m.birth_date?` · ${getAge(m.birth_date)} Jahre`:""}</p></div></button>)}</div></Page>;}
function Friends({friends,incoming,members,onRespond,onOpen}){return <Page title="Freunde" sub="Dein persönliches Netzwerk">{incoming.length>0&&<section className="panel"><h2>Neue Anfragen</h2>{incoming.map(f=>{const m=members.find(x=>x.id===f.requester_id);return m&&<div className="request" key={f.id}><span>{getName(m)}</span><button className="primary" onClick={()=>onRespond(f,true)}>Annehmen</button><button className="ghost" onClick={()=>onRespond(f,false)}>Ablehnen</button></div>})}</section>}<div className="member-grid">{friends.map(m=><button className="member-card" key={m.id} onClick={()=>onOpen(m)}><img src={m.avatar_url||DEFAULT_AVATAR}/><div><RoleBadge role={m.role}/><h3>{getName(m)}</h3></div></button>)}</div></Page>;}
function Forum({posts,members,onSubmit,restricted}){return <Page title="Forum" sub="Diskutiere mit der Community">{!restricted?<form className="composer panel" onSubmit={onSubmit}><input name="title" placeholder="Titel deiner Diskussion" required/><textarea name="content" placeholder="Was möchtest du besprechen?" required/><button className="primary">Beitrag veröffentlichen</button></form>:<div className="notice">Deine Forum-Funktion ist derzeit gesperrt.</div>}<div className="feed-list">{posts.map(p=>{const a=members.find(m=>m.id===p.author_id);return <article className="panel feed" key={p.id}><div className="feed-author"><img src={a?.avatar_url||DEFAULT_AVATAR}/><div><strong>{getName(a)}</strong><RoleBadge role={a?.role}/></div></div><h2>{p.title}</h2><p>{p.content}</p></article>})}</div></Page>;}
function News({news,members,canManage,onSubmit}){return <Page title="News & Beiträge" sub="Offizielle Informationen und Community-News">{canManage&&<form className="composer panel" onSubmit={onSubmit}><input name="title" placeholder="Titel" required/><input name="image_url" placeholder="Bild-URL (optional)"/><textarea name="content" placeholder="Inhalt" required/><button className="primary">News veröffentlichen</button></form>}<div className="news-grid">{news.map(n=>{const a=members.find(m=>m.id===n.created_by||m.id===n.creator_id);return <article className="news-card panel" key={n.id}>{n.image_url&&<img src={n.image_url}/>}<RoleBadge role={a?.role}/><h2>{n.title}</h2><p>{n.content}</p></article>})}</div></Page>;}
function Messages({members,messages,user,chatMember,setChatMember,text,setText,onSend,restricted}){const conversations=[...new Set(messages.map(m=>m.sender_id===user.id?m.receiver_id:m.sender_id))].map(id=>members.find(m=>m.id===id)).filter(Boolean);const current=chatMember?messages.filter(m=>(m.sender_id===user.id&&m.receiver_id===chatMember.id)||(m.receiver_id===user.id&&m.sender_id===chatMember.id)):[];return <Page title="Nachrichten" sub="Direkt mit anderen Mitgliedern schreiben"><div className="messages-layout"><div className="conversation-list">{conversations.map(m=><button key={m.id} className={chatMember?.id===m.id?"active":""} onClick={()=>setChatMember(m)}><img src={m.avatar_url||DEFAULT_AVATAR}/>{getName(m)}</button>)}</div><div className="chat panel">{chatMember?<><h2>{getName(chatMember)}</h2><div className="chat-scroll">{current.map(m=><div className={`bubble ${m.sender_id===user.id?"mine":""}`} key={m.id}>{m.content}</div>)}</div>{restricted?<div className="notice">Nachrichtenfunktion gesperrt.</div>:<form onSubmit={onSend}><input value={text} onChange={e=>setText(e.target.value)} placeholder="Nachricht schreiben…"/><button className="primary">Senden</button></form>}</>:<p className="muted">Wähle eine Unterhaltung.</p>}</div></div></Page>;}
function Rewards({level,hours,remaining,onClaim}){const rewards=["Profil-Akzentfarbe","Profil-Hintergrund","Erweiterte Gestaltung","Zusätzliches Profil-Layout","Exklusive Designoptionen"];return <Page title="Belohnungen" sub="Aktive Community-Zeit schaltet neue Profilfunktionen frei"><section className="reward-hero panel"><span>DEINE STUFE</span><strong>{level}</strong><p>{hours.toFixed(1)} Stunden aktive Community-Zeit</p><div className="progress"><i style={{width:`${Math.max(0,Math.min(100,(5-remaining)/5*100))}%`}}/></div><p>Noch {remaining.toFixed(1)} Stunden bis zur nächsten Belohnung.</p><button className="primary" disabled={remaining>0.01} onClick={onClaim}>{remaining<=0.01?"Belohnung freischalten":"Noch nicht verfügbar"}</button></section><div className="reward-list">{rewards.map((r,i)=><div className={`reward ${i<level?"unlocked":""}`} key={r}><b>{i<level?"✓":"🔒"}</b><div><strong>Stufe {i+1}</strong><span>{r}</span></div></div>)}</div></Page>;}
function Admin({members,warnings,onOpen,can}){return <Page title="Admin-Bereich" sub="Verwaltung und Moderation">{!can("manage_members")&&!can("manage_restrictions")&&!can("manage_warnings")?<div className="notice">Dir wurden noch keine Verwaltungsrechte zugewiesen.</div>:<div className="member-grid">{members.filter(m=>m.account_status!=="DELETED").map(m=><button className="member-card" key={m.id} onClick={()=>onOpen(m)}><img src={m.avatar_url||DEFAULT_AVATAR}/><div><RoleBadge role={m.role}/><h3>{getName(m)}</h3><p>{warnings.filter(w=>w.user_id===m.id).length} Verwarnungen</p></div></button>)}</div>}</Page>;}
function AdminLog({logs,members}){return <Page title="Admin-Logbuch" sub="Nur für den Head Admin">{logs.map(l=>{const a=members.find(m=>m.id===l.admin_id),t=members.find(m=>m.id===l.target_user_id);return <article className="panel log" key={l.id}><strong>{l.action}</strong><p>{getName(a)} → {getName(t)}</p>{l.reason&&<p>{l.reason}</p>}<small>{new Date(l.created_at).toLocaleString("de-AT")}</small></article>})}{!logs.length&&<p className="muted">Noch keine Admin-Aktionen protokolliert.</p>}</Page>;}
function Page({title,sub,children}){return <section><header className="page-head"><span>ENNSTAL CONNECT</span><h1>{title}</h1><p>{sub}</p></header>{children}</section>;}
