const fs=require('fs');
const path=require('path');
const file=path.join(process.cwd(),'src','App.jsx');
let s=fs.readFileSync(file,'utf8');

function replaceFunction(name,replacement){
  const start=s.search(new RegExp(`function ${name}\\s*\\(`));
  if(start<0) throw new Error(`Patch marker missing: ${name}`);
  const next=s.slice(start+1).search(/\nfunction\s+[A-Za-z0-9_]+\s*\(/);
  const end=next<0?s.length:start+1+next;
  s=s.slice(0,start)+replacement+'\n'+s.slice(end);
}

const profile=`function Profile({ profile, user, isHeadAdmin, saveProfile, uploadProfileImage }) {
  const bg=profile?.profile_background||"#202b38";
  const avatar=profile?.avatar_url||DEFAULT_AVATAR;
  return <section><div className="my-area-layout">
    <div className={\`my-profile-card profile-showcase \${roleClass(profile?.role)}\`} style={{background:bg,backgroundSize:"cover",backgroundPosition:"center",borderColor:profile?.profile_accent||"#f0a52d"}}>
      <div className="profile-role-mark">{profile?.role==="HEAD_ADMIN"?"♛":profile?.role==="MEMBER"?"":"★"}</div>
      <div className="profile-nickname-line"><span className={\`profile-inline-star \${roleClass(profile?.role)}\`}>{profile?.role==="HEAD_ADMIN"?"♛":profile?.role==="MEMBER"?"":"★"}</span><h1>{getName(profile)}</h1></div>
      <div className={\`profile-role-label \${roleClass(profile?.role)}\`}>{roleLabel(profile?.role)}</div>
      {isHeadAdmin(profile?.role)&&<div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}
      <img className="my-avatar" src={avatar} alt="Profil"/>
      <h2>{[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")}{getAge(profile?.birth_date)!==null&&\` · \${getAge(profile.birth_date)} Jahre\`}</h2>
      <p>{profile?.bio||"Noch kein Über-mich-Text."}</p>
    </div>
    <form className="panel profile-form" onSubmit={saveProfile}>
      <span className="eyebrow">DEIN PROFIL</span><h2>Profil gestalten</h2>
      <label>Nickname *</label><input name="nickname" defaultValue={profile?.nickname||""} required/>
      <div className="form-grid"><div><label>Profil-Akzent</label><input type="color" name="profile_accent" defaultValue={profile?.profile_accent||"#f0a52d"}/></div><div><label>Profil-Hintergrund</label><input name="profile_background" defaultValue={profile?.profile_background||"#202b38"} placeholder="#202b38 oder Bild-URL"/></div></div>
      <label>Profilbild vom Computer oder Handy</label><input className="profile-file-input" type="file" accept="image/*" capture="environment" onChange={e=>e.target.files?.[0]&&uploadProfileImage(e.target.files[0])}/><small>JPG, PNG, WEBP – maximal 5 MB.</small>
      <label>Profil-Layout</label><select name="profile_layout" defaultValue={profile?.profile_layout||"standard"}><option value="standard">Standard</option><option value="compact">Kompakt</option><option value="showcase">Showcase</option></select>
      <label>Geschlecht *</label><select name="gender" defaultValue={profile?.gender||""} required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select>
      <label>Über mich</label><textarea name="bio" defaultValue={profile?.bio||""}/>
      <label>Interessen</label><input name="interests" defaultValue={Array.isArray(profile?.interests)?profile.interests.join(", "):profile?.interests||""}/>
      <label>Wohnort</label><input name="location" defaultValue={profile?.location||""}/>
      <label>Website</label><input name="website" defaultValue={profile?.website||""}/>
      <button className="primary-button">💾 Profilgestaltung speichern</button>
    </form>
  </div></section>;
}`;

const member=`function MemberCard({ member, profile, friendships, onOpen, onMessage }) {
  const r=member.role||"MEMBER";
  const friendship=friendships.find(x=>(x.requester_id===profile?.id&&x.receiver_id===member.id)||(x.receiver_id===profile?.id&&x.requester_id===member.id));
  const friend=friendship?.status==="ACCEPTED";
  const icon=r==="HEAD_ADMIN"?"♛":r==="MEMBER"?"":"★";
  return <article className={\`member-card \${roleClass(r)}\`} onClick={()=>onOpen(member)}>
    <div className="member-nickname-row"><span className={\`compact-role-symbol \${roleClass(r)}\`}>{icon}</span><strong className="member-nickname">{getName(member)}</strong>{friend&&<span className="friend-indicator">♥</span>}</div>
    <div className={\`member-role-caption \${roleClass(r)}\`}>{roleLabel(r)}</div>
    <img className="member-avatar" src={member.avatar_url||DEFAULT_AVATAR} alt=""/>
    <div className="member-name">{[member.first_name,member.last_name].filter(Boolean).join(" ")}{getAge(member.birth_date)!==null&&\` · \${getAge(member.birth_date)} Jahre\`}</div>
    <div className={\`member-status \${member.is_online?"online":"offline"}\`}><span/>{member.is_online?"Online":"Offline"}</div>
    {member.id!==profile?.id&&<button className="member-message" onClick={e=>{e.stopPropagation();onMessage(member);}}>💬 Nachricht</button>}
  </article>;
}`;

replaceFunction('Profile',profile);
replaceFunction('MemberCard',member);

// Prevent the text[] interests field from receiving one invalid empty string.
s=s.replace('interests: String(f.get("interests") || "").trim()', 'interests: String(f.get("interests") || "").split(",").map(x => x.trim()).filter(Boolean)');

const legal=`function LegalPage({type}) { return <section className="legal-page"><h1>{type==="impressum"?"Impressum":"Datenschutz"}</h1>{type==="impressum"?<><p><strong>Ennstal Connect</strong></p><p><strong>Betreiber / Medieninhaber / Verantwortlicher:</strong><br/>Marco Egger (Ennstal-Connect)<br/>Waidbachstrasse<br/>8700 Leoben<br/>Österreich</p><p><strong>Verantwortung für die Community:</strong> Global Admin.</p><h2>Blattlinie</h2><p>Ennstal Connect dient der regionalen Vernetzung, Kommunikation und dem Austausch innerhalb der Community.</p><div className="legal-notice">Je nach Rechtsform, Gewerbestatus und konkreter Tätigkeit können nach österreichischem Recht zusätzliche Impressumsangaben erforderlich sein.</div></>:<><h2>Verantwortlicher</h2><p>Marco Egger (Ennstal-Connect), Waidbachstrasse, 8700 Leoben, Österreich.</p><h2>Welche Daten werden verarbeitet?</h2><p>Insbesondere Registrierungs- und Profildaten wie Nickname, Name, Geburtsdatum, Geschlecht, Profilbild, Interessen, Wohnort und freiwillige Inhalte sowie Freundschaften, Nachrichten, Meldungen, Sperren und technisch notwendige Sicherheitsdaten.</p><h2>Wofür?</h2><p>Zur Bereitstellung des Kontos und der Community, Kommunikation, Moderation, Missbrauchsvermeidung und Systemsicherheit. Rechtsgrundlagen sind insbesondere Vertragserfüllung, berechtigte Interessen, Einwilligung soweit erforderlich und gesetzliche Pflichten.</p><h2>Dienstleister</h2><p>Für Authentifizierung, Datenbank, Hosting und Community-Funktionen werden technische Dienstleister eingesetzt, insbesondere Supabase entsprechend der eingesetzten Konfiguration.</p><h2>Speicherdauer</h2><p>Daten werden nur so lange gespeichert, wie sie für den jeweiligen Zweck erforderlich sind oder gesetzliche Aufbewahrungspflichten bestehen. Konkrete Löschfristen hängen von Funktion und technischer Konfiguration ab.</p><h2>Deine Rechte</h2><p>Im Rahmen der gesetzlichen Voraussetzungen bestehen insbesondere Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch.</p><h2>Beschwerde</h2><p>Du kannst dich bei der österreichischen Datenschutzbehörde beschweren.</p></>}</section>; }`;
if(!/function LegalPage\s*\(/.test(s)){
  const auth=s.search(/function Auth\s*\(/);
  if(auth<0) throw new Error('Patch marker missing: Auth');
  s=s.slice(0,auth)+legal+'\n'+s.slice(auth);
}
s=s.replace(/<p>Ein gemeinsames Raster[^<]*<\/p>/g,'');
s=s.replace(/<InfoPage title="Impressum"[^/]*\/>/g,'<LegalPage type="impressum" />');
s=s.replace(/<InfoPage title="Datenschutz"[^/]*\/>/g,'<LegalPage type="privacy" />');

fs.writeFileSync(file,s);
