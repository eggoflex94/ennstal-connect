const fs=require('fs');
const path=require('path');
const file=path.join(process.cwd(),'src','App.jsx');
let s=fs.readFileSync(file,'utf8');

// Fix profile save for PostgreSQL text[] interests.
s=s.replace('interests: String(f.get("interests") || "").trim()', 'interests: String(f.get("interests") || "").split(",").map(x => x.trim()).filter(Boolean)');

// Make the Austrian contact address visible in the legal page.
s=s.replace('Eine veröffentlichte Kontakt-E-Mail sollte an dieser Stelle ergänzt werden.', 'Kontakt: ennsstal.connect@gmx.at');
s=s.replace('Kontakt</h2><p>Eine veröffentlichte Kontakt-E-Mail sollte an dieser Stelle ergänzt werden.</p>', 'Kontakt</h2><p><strong>E-Mail:</strong> ennsstal.connect@gmx.at</p>');

// The homepage builder has two independent frame slots. Each slot keeps the same
// upload flow (desktop/mobile image upload is injected by homepage-media.js).
const start = s.indexOf('function Home({');
const end = s.indexOf('\nfunction MemberGrid(', start);
if (start >= 0 && end > start) {
  const home = `function Home({ profile, isHeadAdmin, homepageSections, canEdit, createHomepageSection, editHomepageSection, deleteHomepageSection }) {
  const frameForm = (label) => <section className="homepage-builder panel"><span className="eyebrow">{label}</span><h2>Rahmen gestalten</h2><p className="builder-hint">Bild direkt vom Computer oder Handy auswählen oder optional eine Bild-URL verwenden.</p><form onSubmit={createHomepageSection} className="homepage-form"><input name="title" placeholder="Rahmen-Überschrift" required/><textarea name="content" placeholder="Text für den Rahmen" required/><input name="image_url" placeholder="Bild-URL (optional)"/><select name="frame_style" defaultValue="standard"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select><button className="primary-button">Rahmen veröffentlichen</button></form></section>;
  return <section className="home-page"><div className="hero"><img src="/banner.png" alt="Ennstal Connect"/></div><div className="page-heading"><div><span className="eyebrow">ENNSTAL & OBERSTEIERMARK</span><h1>Willkommen, {getName(profile)}</h1><p>Eine lebendige regionale Community für Menschen aus dem Ennstal und Umgebung.</p></div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}</div>{canEdit && <div className="homepage-builder-grid">{frameForm("RAHMEN 1")}{frameForm("RAHMEN 2")}</div>}{homepageSections.length > 0 && <div className="homepage-sections">{homepageSections.map((x) => <article className={\`homepage-frame \${x.frame_style || "standard"}\`} key={x.id}>{x.image_url && <img src={x.image_url} alt=""/>}<div><span className="frame-kicker">ENNSTAL CONNECT</span><h2>{x.title}</h2><p>{x.content}</p>{canEdit && <div className="content-manage-actions"><button onClick={() => editHomepageSection(x)}>Bearbeiten</button><button className="danger-button" onClick={() => deleteHomepageSection(x)}>Löschen</button></div>}</div></article>)}</div>}</section>;
}
`;
  s = s.slice(0,start) + home + s.slice(end);
}

fs.writeFileSync(file,s);
