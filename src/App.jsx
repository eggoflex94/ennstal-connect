import {useEffect,useMemo,useState} from "react";
import {supabase} from "./supabaseClient";

const FALLBACK="/default-avatar.svg";
const roleRank={admin:0,supporter:1,member:2};

function age(d){if(!d)return null;const b=new Date(d),n=new Date();let a=n.getFullYear()-b.getFullYear();if(n<new Date(n.getFullYear(),b.getMonth(),b.getDate()))a--;return a}
function fmtDate(d){return d?new Date(d).toLocaleDateString("de-AT"): ""}
function Card({m,me,onOpen,friends,pending,onRequest}){
 const role=m.role||"member", isFriend=friends.has(m.id), sent=pending.has(m.id);
 return <button className={"member-card "+role} onClick={()=>onOpen(m)} aria-label={"Profil von "+m.nickname}>
   <div className="member-top"><span className="nickname" style={{color:m.nickname_color||undefined}}>{m.nickname}</span>
   <span className="badges">{role==="admin"&&<b title="Admin">★</b>}{role==="supporter"&&<b title="Supporter">★</b>}
   {me&&m.id!==me.id&&(isFriend?<i title="Ihr seid Freunde">🤝</i>:<i title={sent?"Anfrage offen":"Freundschaftsanfrage"} onClick={(e)=>{e.stopPropagation();!sent&&onRequest(m.id)}}>{sent?"⏳":"➕"}</i>)}</span></div>
   <img src={m.avatar_url||FALLBACK} onError={e=>e.currentTarget.src=FALLBACK} className="member-avatar"/>
   <div className="realname">{m.first_name||""} {m.last_name||""}</div>
   {m.show_age!==false&&<div className="member-age">{age(m.birth_date)!==null&&`(${age(m.birth_date)})`}</div>}
 </button>
}

function Auth({close,refresh}){
 const [mode,setMode]=useState("login"),[form,setForm]=useState({email:"",password:"",nickname:"",first_name:"",last_name:"",birth_date:""}),[msg,setMsg]=useState("");
 const set=(k,v)=>setForm({...form,[k]:v});
 async function submit(e){e.preventDefault();setMsg("");
  if(mode==="register"){
   if(!form.birth_date)return setMsg("Geburtsdatum ist ein Pflichtfeld.");
   const {error}=await supabase.auth.signUp({email:form.email,password:form.password,options:{data:{nickname:form.nickname,first_name:form.first_name,last_name:form.last_name,birth_date:form.birth_date}}});
   setMsg(error?error.message:"Registrierung erfolgreich. Bitte prüfe deine E-Mails, falls eine Bestätigung aktiviert ist.");
  }else{const {error}=await supabase.auth.signInWithPassword({email:form.email,password:form.password});if(error)setMsg(error.message);else{await refresh();close();}}
 }
 return <div className="modal-back"><form className="modal" onSubmit={submit}><button type="button" className="x" onClick={close}>×</button><h2>{mode==="login"?"Anmelden":"Registrieren"}</h2>
 {mode==="register"&&<><input placeholder="Nickname" required value={form.nickname} onChange={e=>set("nickname",e.target.value)}/><input placeholder="Vorname" required value={form.first_name} onChange={e=>set("first_name",e.target.value)}/><input placeholder="Nachname" required value={form.last_name} onChange={e=>set("last_name",e.target.value)}/><label>Geburtsdatum<input type="date" required value={form.birth_date} onChange={e=>set("birth_date",e.target.value)}/></label></>}
 <input type="email" placeholder="E-Mail" required value={form.email} onChange={e=>set("email",e.target.value)}/><input type="password" minLength="6" placeholder="Passwort" required value={form.password} onChange={e=>set("password",e.target.value)}/>
 <button className="primary">{mode==="login"?"Anmelden":"Konto erstellen"}</button><p>{mode==="login"?"Noch kein Konto? ":"Schon registriert? "}<button type="button" className="link" onClick={()=>setMode(mode==="login"?"register":"login")}>{mode==="login"?"Registrieren":"Anmelden"}</button></p>{msg&&<div className="notice">{msg}</div>}</form></div>
}

function App(){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[members,setMembers]=useState([]),[news,setNews]=useState([]),[view,setView]=useState("home"),[search,setSearch]=useState(""),[selected,setSelected]=useState(null),[auth,setAuth]=useState(false),[friends,setFriends]=useState(new Set()),[pending,setPending]=useState(new Set()),[requests,setRequests]=useState([]),[toast,setToast]=useState("");
 const flash=(x)=>{setToast(x);setTimeout(()=>setToast(""),3500)};
 const refresh=async()=>{
  const {data:{session:s}}=await supabase.auth.getSession();setSession(s);
  if(s){const {data}=await supabase.from("profiles").select("*").eq("id",s.user.id).single();setProfile(data||null);
   const {data:fs}=await supabase.from("friendships").select("*").or(`requester_id.eq.${s.user.id},addressee_id.eq.${s.user.id}`);
   const f=new Set(),p=new Set(),r=[];(fs||[]).forEach(x=>{const other=x.requester_id===s.user.id?x.addressee_id:x.requester_id;if(x.status==="accepted")f.add(other);else if(x.requester_id===s.user.id)p.add(other);else r.push(x)});setFriends(f);setPending(p);setRequests(r);
  } else {setProfile(null);setFriends(new Set());setPending(new Set());setRequests([])}
 };
 const load=async()=>{const [{data:m},{data:n}]=await Promise.all([supabase.from("public_profiles").select("*"),supabase.from("news_posts").select("*").order("created_at",{ascending:false})]);setMembers(m||[]);setNews(n||[])};
 useEffect(()=>{refresh();load();const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>refresh());return()=>subscription.unsubscribe()},[]);
 const filtered=useMemo(()=>members.filter(m=>[m.nickname,m.first_name,m.last_name].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a,b)=>(roleRank[a.role||"member"]-roleRank[b.role||"member"])||a.nickname.localeCompare(b.nickname,"de")),[members,search]);
 async function friend(id){if(!session)return setAuth(true);const {error}=await supabase.from("friendships").insert({requester_id:session.user.id,addressee_id:id,status:"pending"});flash(error?error.message:"Freundschaftsanfrage gesendet.");if(!error)refresh()}
 async function answer(r,ok){const {error}=ok?await supabase.from("friendships").update({status:"accepted"}).eq("id",r.id):await supabase.from("friendships").delete().eq("id",r.id);flash(error?error.message:(ok?"Freundschaft angenommen.":"Anfrage abgelehnt."));refresh()}
 async function saveSettings(e){e.preventDefault();if(!profile)return;const fd=new FormData(e.target);const payload={show_age:fd.get("show_age")==="on",show_online_status:fd.get("show_online_status")==="on",show_profile_visits:fd.get("show_profile_visits")==="on",allow_friend_requests:fd.get("allow_friend_requests")==="on"};const {error}=await supabase.from("user_settings").upsert({user_id:profile.id,...payload});flash(error?error.message:"Einstellungen gespeichert.");}
 async function uploadAvatar(file){if(!file||!session)return;const ext=file.name.split(".").pop();const path=`${session.user.id}/avatar.${ext}`;const {error}=await supabase.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type});if(error)return flash(error.message);const {data}=supabase.storage.from("avatars").getPublicUrl(path);const r=await supabase.from("profiles").update({avatar_url:data.publicUrl}).eq("id",session.user.id);if(r.error)flash(r.error.message);else{flash("Profilbild gespeichert.");refresh();load()}}
 async function createNews(e){e.preventDefault();if(!profile||profile.role!=="admin")return;const fd=new FormData(e.target);let image_url=null,file=fd.get("image");if(file&&file.size){const path=`${crypto.randomUUID()}-${file.name}`;const u=await supabase.storage.from("news-images").upload(path,file,{contentType:file.type});if(u.error)return flash(u.error.message);image_url=supabase.storage.from("news-images").getPublicUrl(path).data.publicUrl}const {error}=await supabase.from("news_posts").insert({author_id:profile.id,title:fd.get("title"),body:fd.get("body"),image_url});flash(error?error.message:"News veröffentlicht.");if(!error){e.target.reset();load()}}
 async function createTest(){if(profile?.role!=="admin")return;const nick="Testmitglied"+Math.floor(Math.random()*9999);const {error}=await supabase.from("profiles").insert({id:crypto.randomUUID(),nickname:nick,first_name:"Test",last_name:"Profil",birth_date:"2000-01-01",role:"member",is_test:true});flash(error?error.message:"Testprofil erstellt.");load()}
 const isAdmin=profile?.role==="admin";
 return <div className="app">
 <header><div className="brand"><img src="/banner.png" onError={e=>e.currentTarget.style.display="none"}/><div className="brand-fallback">ENNSTAL CONNECT</div></div><nav><button onClick={()=>setView("home")}>Startseite</button><button onClick={()=>setView("members")}>Mitglieder</button><button onClick={()=>setView("groups")}>Gruppen</button><button onClick={()=>setView("events")}>Events</button></nav><div className="auth">{session?<button className="primary" onClick={()=>supabase.auth.signOut()}>Abmelden</button>:<button className="primary" onClick={()=>setAuth(true)}>Anmelden</button>}</div></header>
 <main><section className="content">
 {view==="home"&&<><h1>Neuigkeiten</h1>{isAdmin&&<form className="panel admin-form" onSubmit={createNews}><h3>News erstellen</h3><input name="title" placeholder="Überschrift" required/><textarea name="body" placeholder="Neuigkeit" required/><label>Bild hinzufügen<input type="file" name="image" accept="image/*"/></label><button className="primary">Veröffentlichen</button></form>}{news.length?news.map(n=><article className="news-card" key={n.id}>{n.image_url&&<img src={n.image_url}/>}<h2>{n.title}</h2><p>{n.body}</p><small>{fmtDate(n.created_at)}</small></article>):<div className="empty">Noch keine News vorhanden.</div>}</>}
 {view==="members"&&<><h1>Mitgliederübersicht</h1><input className="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Mitglieder suchen nach Nickname oder Name"/>{["admin","supporter","member"].map(role=>{const list=filtered.filter(m=>(m.role||"member")===role);if(!list.length)return null;return <section key={role}><h2 className="section-title">{role==="admin"?"⭐ Admins":role==="supporter"?"★ Supporter":"Mitglieder A–Z"}</h2><div className="members-grid">{list.map(m=><Card key={m.id} m={m} me={profile} onOpen={setSelected} friends={friends} pending={pending} onRequest={friend}/>)}</div></section>})}</>}
 {view==="settings"&&profile&&<><h1>Meine Einstellungen</h1><form className="panel settings" onSubmit={saveSettings}><h3>Darstellung & Privatsphäre</h3>{["show_age","show_online_status","show_profile_visits","allow_friend_requests"].map((x,i)=><label key={x}><input type="checkbox" name={x} defaultChecked={i===0}/> {["Alter im Profil anzeigen","Online-Status für Mitglieder anzeigen","Profilbesucher aktivieren","Freundschaftsanfragen erlauben"][i]}</label>)}<button className="primary">Speichern</button></form><div className="panel"><h3>Profilbild</h3><input type="file" accept="image/*" onChange={e=>uploadAvatar(e.target.files[0])}/></div></>}
 {view==="requests"&&<><h1>Freundschaftsanfragen</h1>{requests.length?requests.map(r=><div className="panel request" key={r.id}>Neue Freundschaftsanfrage <span><button onClick={()=>answer(r,true)}>Annehmen</button><button onClick={()=>answer(r,false)}>Ablehnen</button></span></div>):<div className="empty">Keine offenen Anfragen.</div>}</>}
 {["groups","events"].includes(view)&&<div className="empty"><h1>{view==="groups"?"Gruppen":"Events"}</h1><p>Dieser Bereich ist vorbereitet. Gruppen und Events können hier mit denselben Berechtigungen wie im SQL-Schema ergänzt werden.</p></div>}
 </section>
 {session&&<aside className="sidebar"><div className={"mini-profile "+(profile?.role||"member")}><div className="side-nick" style={{color:profile?.nickname_color||undefined}}>{profile?.nickname}</div><img src={profile?.avatar_url||FALLBACK} onError={e=>e.currentTarget.src=FALLBACK}/>{profile?.role==="admin"&&<span className="role admin-star">★</span>}{profile?.role==="supporter"&&<span className="role supporter-star">★</span>}</div><h3>MEIN BEREICH</h3><button onClick={()=>setSelected(profile)}>👤 Mein Profil</button><button onClick={()=>setView("settings")}>⚙️ Einstellungen</button><button onClick={()=>setView("requests")}>🤝 Freundschaftsanfragen {requests.length?`(${requests.length})`:""}</button><button>👁 Profilbesucher</button><button>💬 Nachrichten</button><button>🪙 Punkte & Verlauf</button><button>🛒 Marktplatz</button>{isAdmin&&<><h3>ADMIN-BEREICH</h3><button onClick={()=>setView("home")}>📰 News verwalten</button><button onClick={createTest}>🧪 Testprofil erstellen</button><button>👥 Mitglieder verwalten</button><button>📊 Statistik</button></>}</aside>}
 </main>
 {selected&&<div className="modal-back" onClick={()=>setSelected(null)}><div className="profile-modal" onClick={e=>e.stopPropagation()}><button className="x" onClick={()=>setSelected(null)}>×</button><Card m={selected} me={profile} onOpen={()=>{}} friends={friends} pending={pending} onRequest={friend}/><h2>{selected.first_name} {selected.last_name}</h2><p>Mitglied seit {fmtDate(selected.created_at)}</p></div></div>}
 {auth&&<Auth close={()=>setAuth(false)} refresh={refresh}/>} {toast&&<div className="toast">{toast}</div>}
 <footer><b>Ennstal Connect</b><span>Impressum · Datenschutz · Nutzungsbedingungen · Community-Regeln</span><span>© 2026 Ennstal Connect · Verantwortlich für den Inhalt: Marco Egger, 8700 Leoben</span></footer>
 </div>
}
export default App;
