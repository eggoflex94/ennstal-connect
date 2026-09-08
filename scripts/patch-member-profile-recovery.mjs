import fs from 'node:fs';

const path = new URL('../src/App.jsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const profileBlock = /\{page === \"member-profile\" && viewingMember && <MemberProfile[\s\S]*?\{page === \"member-profile\" && viewingMember && isHeadAdmin\(profile\?\.role\) && viewingMember\.role !== \"HEAD_ADMIN\" && <><FeatureUnlocks[\s\S]*?<\/>\}/;
if (!profileBlock.test(source)) throw new Error('[member profile recovery] profile block anchor not found');

source = source.replace(profileBlock, `{page === "member-profile" && viewingMember && <SafeMemberProfile member={viewingMember} user={user} friendship={friendshipWith(viewingMember.id)} back={() => { setViewingMember(null); setViewingFriends([]); setPage("members"); }} requestFriend={requestFriend} removeFriend={removeFriend} openChat={openChat}/>} `);

const homeAnchor = '\nfunction Home({';
if (!source.includes(homeAnchor)) throw new Error('[member profile recovery] Home anchor not found');

const component = `
function SafeMemberProfile({ member, user, friendship, back, requestFriend, removeFriend, openChat }) {
  if (!member) return null;
  const age = getAge(member.birth_date);
  const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ");
  const interests = formatInterests(member.interests);
  const accepted = friendship?.status === "ACCEPTED";
  const pending = friendship?.status === "PENDING";
  const responsibilities = Array.isArray(member.admin_responsibilities) ? member.admin_responsibilities.join(" · ") : "";
  return <section className="member-profile-page safe-member-profile" data-profile-id={member.id}>
    <button type="button" className="back-button" onClick={back}>← Zurück zur Mitgliederliste</button>
    <article className={\`member-profile-hero \${roleClass(member.role)}\`}>
      <img src={member.avatar_url || DEFAULT_AVATAR} alt="Profilbild"/>
      <div>
        <span>{member.account_badge === "BUSINESS" ? "Unternehmenskonto" : roleLabel(member.role)}</span>
        <h1>{getName(member)}</h1>
        {fullName && <p>{fullName}{age !== null ? \` · \${age} Jahre\` : ""}</p>}
        {member.bio && <p className={\`member-profile-bio \${member.bio_font || "modern"} \${member.bio_size || "normal"}\`} style={{color: member.bio_color || "#f1f5f9"}}>{member.bio}</p>}
        {responsibilities && <p className="admin-responsibilities">Zuständig für: {responsibilities}</p>}
      </div>
    </article>
    <section className="panel profile-visible-details">
      <span className="eyebrow">PROFILINFORMATIONEN</span>
      {member.location && <p><b>Ort:</b> {member.location}</p>}
      {interests && <p><b>Interessen:</b> {interests}</p>}
      {member.website && <p><b>Webseite:</b> <a href={member.website} target="_blank" rel="noreferrer">{member.website}</a></p>}
      {!member.location && !interests && !member.website && <p>Keine weiteren Profilinformationen hinterlegt.</p>}
    </section>
    {member.id !== user?.id && <div className="content-manage-actions safe-profile-actions">
      <button type="button" className="primary-button" onClick={() => openChat(member)}>Nachricht</button>
      {!friendship && <button type="button" className="secondary-button" onClick={() => requestFriend(member)}>Freundschaftsanfrage</button>}
      {pending && <button type="button" className="secondary-button" disabled>Anfrage offen</button>}
      {accepted && <button type="button" className="danger-button" onClick={() => removeFriend(member)}>Freundschaft entfernen</button>}
    </div>}
  </section>;
}
`;
source = source.replace(homeAnchor, `\n${component}\nfunction Home({`);

fs.writeFileSync(path, source, 'utf8');
console.log('[member profile recovery] resilient profile view installed');
