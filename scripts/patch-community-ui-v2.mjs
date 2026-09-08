import fs from 'node:fs';

const path = new URL('../src/App.jsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

function replaceOnce(label, pattern, replacement) {
  if (!pattern.test(source)) throw new Error('[community patch] ' + label + ': anchor not found');
  source = source.replace(pattern, replacement);
  console.log('[community patch] ' + label + ': ok');
}

replaceOnce(
  'member filter state',
  /const \[search, setSearch\] = useState\(""\);/,
  'const [search, setSearch] = useState("");\n  const [memberRegionFilter, setMemberRegionFilter] = useState("all");\n  const [memberOnlineOnly, setMemberOnlineOnly] = useState(false);'
);

replaceOnce(
  'member filtering',
  /const displayedMembers = useMemo\(\(\) => \{[\s\S]*?\}, \[sortedMembers, search, activeRegionId\]\);/,
  'const displayedMembers = useMemo(() => sortedMembers.filter((member) => {\n    const regionOk = memberRegionFilter === "all" || member.home_region_id === memberRegionFilter;\n    const onlineOk = !memberOnlineOnly || isRecentlyActive(member);\n    return regionOk && onlineOk;\n  }), [sortedMembers, memberRegionFilter, memberOnlineOnly]);'
);

replaceOnce(
  'homepage create action',
  /async function createHomepageSection\(e\) \{[\s\S]*?\n  \}\n  async function editHomepageSection/,
  'async function createHomepageSection(e) {\n' +
  '    e.preventDefault();\n' +
  '    if (!canManageActiveRegion) return showNotice("Du hast in dieser Region keine Administrationsrechte.");\n' +
  '    if (!activeRegionId) return showNotice("Bitte zuerst eine Region auswählen.");\n' +
  '    const f = new FormData(e.currentTarget);\n' +
  '    const publication_scope = String(f.get("publication_scope") || "REGION");\n' +
  '    if (publication_scope === "GLOBAL" && !isHeadAdmin(profile?.role)) return showNotice("Global veröffentlichen darf nur der Head Admin.");\n' +
  '    const prepared = await preparePrivilegedAction(publication_scope === "GLOBAL" ? "Startseiten-Beitrag global erstellen" : "Startseiten-Beitrag erstellen");\n' +
  '    if (prepared.error) return showNotice(prepared.error.message);\n' +
  '    const payload = { title: String(f.get("title") || "").trim(), content: String(f.get("content") || "").trim(), image_url: String(f.get("image_url") || "").trim() || null, frame_style: String(f.get("frame_style") || "standard"), publication_scope, title_font_family: String(f.get("title_font_family") || "modern"), title_font_size: Number(f.get("title_font_size") || 32), title_color: String(f.get("title_color") || "#0f172a"), font_family: String(f.get("font_family") || "modern"), font_size: Number(f.get("font_size") || 18), text_color: String(f.get("text_color") || "#334155"), created_by: user.id, updated_by: user.id, sort_order: (homepageSections.length + 1) * 10, is_visible: true, region_id: activeRegionId };\n' +
  '    if (payload.title.length < 3 || payload.content.length < 3) return showNotice("Bitte Überschrift und Text ausfüllen.");\n' +
  '    const { error } = await supabase.from("homepage_sections").insert(payload);\n' +
  '    if (error) { showSaveError("Die Startseite", error); return false; }\n' +
  '    e.currentTarget.reset(); showNotice(publication_scope === "GLOBAL" ? "Global veröffentlicht." : "Startseite gespeichert und veröffentlicht."); await loadAll(); return true;\n' +
  '  }\n  async function editHomepageSection'
);

const homeComponent = [
'function Home({ profile, user, activeRegion, isHeadAdmin, homepageSections, canEdit, createHomepageSection, editHomepageSection, deleteHomepageSection, uploadHomepageImage, weeklyPoll, welcomeBadges, groups, featuredGroup, communityRequests, onVote, onCreatePoll, onFeatureGroup, onCreateRequest, onCloseRequest, onOpenGroup }) {',
'  const [imageUrl, setImageUrl] = useState("");',
'  const [uploadStatus, setUploadStatus] = useState("");',
'  const [preview, setPreview] = useState({ title: "Deine Überschrift", content: "Dein Text erscheint hier als Vorschau.", titleFont: "modern", titleSize: 32, titleColor: "#0f172a", textFont: "modern", textSize: 18, textColor: "#334155" });',
'  const fontStack = (name) => name === "serif" ? "Georgia, Times New Roman, serif" : name === "arial" ? "Arial, Helvetica, sans-serif" : name === "montserrat" ? "Montserrat, Inter, sans-serif" : name === "opensans" ? "Open Sans, Arial, sans-serif" : "Inter, system-ui, sans-serif";',
'  const chooseImage = async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploadStatus("Bild wird hochgeladen …"); try { const url = await uploadHomepageImage(file); setImageUrl(url); setUploadStatus("✓ Bild bereit"); } catch (error) { setUploadStatus("Upload fehlgeschlagen: " + (error?.message || "Unbekannter Fehler")); } };',
'  const updatePreview = (event) => { const form = event.currentTarget.form || event.currentTarget; if (!form?.elements) return; setPreview({ title: form.elements.title?.value || "Deine Überschrift", content: form.elements.content?.value || "Dein Text erscheint hier als Vorschau.", titleFont: form.elements.title_font_family?.value || "modern", titleSize: Number(form.elements.title_font_size?.value || 32), titleColor: form.elements.title_color?.value || "#0f172a", textFont: form.elements.font_family?.value || "modern", textSize: Number(form.elements.font_size?.value || 18), textColor: form.elements.text_color?.value || "#334155" }); };',
'  const save = async (event) => { const ok = await createHomepageSection(event); if (ok) { setImageUrl(""); setUploadStatus(""); setPreview({ title: "Deine Überschrift", content: "Dein Text erscheint hier als Vorschau.", titleFont: "modern", titleSize: 32, titleColor: "#0f172a", textFont: "modern", textSize: 18, textColor: "#334155" }); } };',
'  return <section className="home-page"><div className="page-heading"><div><span className="eyebrow">REGION {activeRegion?.name || "ENNSTAL CONNECT"}</span><h1>Willkommen, {getName(profile)}</h1><p>Entdecke Beiträge, Gruppen und gemeinsame Aktivitäten in {activeRegion?.name || "deiner Region"}.</p></div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">★ Hauptadmin · Betreiber</div>}</div><EngagementPanel poll={weeklyPoll} badges={welcomeBadges} groups={groups} featuredGroup={featuredGroup} requests={communityRequests} user={user} isHeadAdmin={isHeadAdmin(profile?.role)} onVote={onVote} onCreatePoll={onCreatePoll} onFeatureGroup={onFeatureGroup} onCreateRequest={onCreateRequest} onCloseRequest={onCloseRequest} onOpenGroup={onOpenGroup}/>{canEdit && <details className="homepage-editor-toggle homepage-editor-native" open><summary>Startseite für {activeRegion?.name || "diese Region"} gestalten</summary><section className="homepage-builder panel"><span className="eyebrow">STARTSEITE VERWALTEN</span><h2>Inhalt & Design</h2><p className="homepage-editor-intro">Schrift, Größe, Farben, Bild und Veröffentlichungsbereich direkt einstellen.</p><form onSubmit={save} onInput={updatePreview} onChange={updatePreview} className="homepage-form homepage-form-advanced"><div className="homepage-editor-grid"><label>Veröffentlichung<select name="publication_scope" defaultValue="REGION"><option value="REGION">Nur {activeRegion?.name || "aktuelle Region"}</option>{isHeadAdmin(profile?.role) && <option value="GLOBAL">🌍 Global – alle Regionen</option>}</select></label><label>Rahmen<select name="frame_style" defaultValue="standard"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select></label><label className="wide">Überschrift<input name="title" placeholder="Überschrift" required/></label><label className="wide">Text<textarea name="content" placeholder="Text für die Startseite" rows="8" required/></label><label>Titel-Schriftart<select name="title_font_family" defaultValue="modern"><option value="modern">Modern</option><option value="montserrat">Montserrat</option><option value="arial">Arial</option><option value="opensans">Open Sans</option><option value="serif">Serif</option></select></label><label>Titel-Größe<input type="number" name="title_font_size" min="18" max="64" defaultValue="32"/></label><label>Titel-Farbe<input type="color" name="title_color" defaultValue="#0f172a"/></label><label>Text-Schriftart<select name="font_family" defaultValue="modern"><option value="modern">Modern</option><option value="montserrat">Montserrat</option><option value="arial">Arial</option><option value="opensans">Open Sans</option><option value="serif">Serif</option></select></label><label>Text-Größe<input type="number" name="font_size" min="12" max="48" defaultValue="18"/></label><label>Text-Farbe<input type="color" name="text_color" defaultValue="#334155"/></label><label>Foto hochladen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseImage}/></label><label>Bild-URL<input name="image_url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…"/></label></div>{imageUrl && <img className="homepage-upload-preview" src={imageUrl} alt="Bildvorschau"/>}{uploadStatus && <p className="homepage-upload-status" aria-live="polite">{uploadStatus}</p>}<article className="homepage-live-preview"><span className="eyebrow">LIVE-VORSCHAU</span><h3 style={{fontFamily:fontStack(preview.titleFont),fontSize:preview.titleSize + "px",color:preview.titleColor}}>{preview.title}</h3><p style={{fontFamily:fontStack(preview.textFont),fontSize:preview.textSize + "px",color:preview.textColor}}>{preview.content}</p></article><button className="primary-button">Speichern & veröffentlichen</button></form></section></details>}{homepageSections.length > 0 && <div className="homepage-sections">{homepageSections.map((x) => <article className={"homepage-frame " + (x.frame_style || "standard")} key={x.id}>{x.image_url && <img src={x.image_url} alt=""/>}<div><span className="frame-kicker">{x.publication_scope === "GLOBAL" ? "🌍 GLOBAL" : activeRegion?.name || "ENNSTAL CONNECT"}</span><h2 style={{fontFamily:fontStack(x.title_font_family),fontSize:(x.title_font_size || 32) + "px",color:x.title_color || "#0f172a"}}>{x.title}</h2><p style={{fontFamily:fontStack(x.font_family),fontSize:(x.font_size || 18) + "px",color:x.text_color || "#334155"}}>{x.content}</p>{canEdit && <div className="content-manage-actions"><button onClick={() => editHomepageSection(x)}>Bearbeiten</button><button className="danger-button" onClick={() => deleteHomepageSection(x)}>Löschen</button></div>}</div></article>)}</div>}</section>;',
'}',
'',
'function EngagementPanel'
].join('\n');

replaceOnce('homepage component', /function Home\(\{[\s\S]*?\n\}\n\nfunction EngagementPanel/, homeComponent);

replaceOnce(
  'home props',
  /homepageSections=\{regionFilter\(homepageSections\)\} canEdit=\{isHeadAdmin\(profile\?\.role\)\}/,
  'homepageSections={homepageSections.filter((item) => item.publication_scope === "GLOBAL" || item.region_id === activeRegionId)} canEdit={canManageActiveRegion}'
);

const membersPage = '{page === "members" && <section className="members-directory-page"><div className="page-heading"><div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1><p>Finde Mitglieder aus allen Regionen und filtere die Community gezielt.</p></div></div><section className="member-search-panel panel"><div className="member-search-panel-head"><div><span className="eyebrow">MITGLIEDER FINDEN</span><h2>Community durchsuchen</h2></div><b>{displayedMembers.length} Mitglieder gefunden</b></div><div className="member-search-controls"><input className="search-input" placeholder="Name oder Nickname suchen …" value={search} onChange={(e) => setSearch(e.target.value)}/><select value={memberRegionFilter} onChange={(e) => setMemberRegionFilter(e.target.value)}><option value="all">Alle Regionen</option>{regions.map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}</select><label><input type="checkbox" checked={memberOnlineOnly} onChange={(e) => setMemberOnlineOnly(e.target.checked)}/> Nur online</label></div><div className="member-search-quick"><button className={memberRegionFilter === "all" ? "active" : ""} onClick={() => setMemberRegionFilter("all")}>Alle Regionen</button>{activeRegionId && <button className={memberRegionFilter === activeRegionId ? "active" : ""} onClick={() => setMemberRegionFilter(activeRegionId)}>Aktuelle Region: {activeRegion?.name}</button>}</div></section><MemberGrid members={displayedMembers} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}';
replaceOnce('member page jsx', /\{page === "members" && <section><div className="page-heading">[\s\S]*?<MemberGrid members=\{displayedMembers\} profile=\{profile\} friendships=\{friendships\} onOpen=\{openMember\} onMessage=\{openChat\}\/\><\/section>\}/, membersPage);

fs.writeFileSync(path, source, 'utf8');
console.log('[community patch] App.jsx patched successfully');
