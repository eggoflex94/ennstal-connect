import {loadPageBlocks,appendEditStamp} from './operatorContentStore.js';
import {isOperatorProfile} from './operator-identity.js';
import { supabase } from "./supabaseClient";
import { roleIdentity, makeRoleIcon } from "./roleIdentity.js";

const SUPPORT_EMAIL = "ennstal.connect@gmx.at";
let contactEdits = new Map();
let canEditContacts = false;
let refreshRunning = false;
let lastSignature = "";
let realtimeStarted = false;
let pollTimer = null;

const normalizeRole = (value) => String(value || "").trim().toUpperCase();
const displayName = (profile) => profile.nickname || "Community-Team";

function findHostCard() {
  const heading = [...document.querySelectorAll("h1,h2,h3,h4")].find((node) =>
    /^Administration(?:\s*&\s*Support)?$/i.test(String(node.textContent || "").trim()) ||
    /^Ansprechpartner$/i.test(String(node.textContent || "").trim())
  );
  return heading?.closest("section,article,.card,.dashboard-card,.home-card,.panel") || heading?.parentElement || null;
}

function hideLegacyContacts(host, heading, panel) {
  [...host.children].forEach((child) => {
    if (child === heading || child === panel || child.classList?.contains("eyebrow")) return;
    const text = String(child.textContent || "").trim();
    if (
      /Zuständig\s+für|Gesamtverantwortung|Nachrichten verwalten|Profilbesuche|Community-Verwaltung|Technischen Support|Technischer Support|Hauptadmin|Betreiber|Moderation|Verifizierungen|Forum moderieren|Statistik/i.test(text)
    ) {
      child.style.setProperty("display", "none", "important");
      child.dataset.ecLegacyContact = "true";
    }
  });
}

function responsibilitiesFor(profile) {
  const role = normalizeRole(profile.role);
  const override=contactEdits.get(profile.user_id||profile.id)?.content?.responsibilities;
  if(typeof override==='string')return override.split(/\n/).map(x=>x.trim()).filter(Boolean);
  const custom = Array.isArray(profile.responsibilities) ? profile.responsibilities.filter(Boolean) : [];
  if (role === "HEAD_ADMIN") return custom.length ? custom : ["Gesamtverantwortung", "Sicherheit", "Regeln"];
  if (custom.length) return custom;
  const fallback = [];
  if (profile.forum_moderator) fallback.push("Forum moderieren");
  if (profile.group_moderator) fallback.push("Gruppen verwalten");
  return fallback.length ? fallback : ["Community-Support"];
}

function regionLabel(profile) {
  if (normalizeRole(profile.role) === "HEAD_ADMIN") return "";
  const names = Array.isArray(profile.region_names) ? profile.region_names.filter(Boolean) : [];
  return names.join(" · ");
}

function makePerson(profile) {
  const identity = roleIdentity(profile);
  const card = document.createElement("article");
  card.className = `ec-team-person ec-role-${identity.key}`;
  card.style.setProperty("--ec-role-color", identity.color);

  const profileButton = document.createElement("button");
  profileButton.type = "button";
  profileButton.className = "ec-team-person-top";
  profileButton.dataset.profileId = profile.user_id || profile.id || "";
  profileButton.title = `Profil von ${displayName(profile)} öffnen`;

  const avatar = document.createElement("img");
  avatar.className = "ec-team-avatar";
  avatar.src = profile.avatar_url || "/default-avatar.svg";
  avatar.alt = "";

  const star = makeRoleIcon(profile, "normal");
  if (star) star.classList.add("ec-team-role-star");

  const copy = document.createElement("span");
  copy.className = "ec-team-person-copy";

  const nameRow = document.createElement("span");
  nameRow.className = "ec-team-name-row";
  if (star) nameRow.appendChild(star);
  const name = document.createElement("strong");
  name.className = "ec-team-name ec-identity-name";
  name.textContent = displayName(profile);
  name.dataset.memberPreviewId = profile.user_id || profile.id;
  nameRow.appendChild(name);

  const responsibilities = document.createElement("small");
  responsibilities.className = "ec-team-responsibilities";
  responsibilities.textContent = responsibilitiesFor(profile).join(" · ");

  copy.append(nameRow, responsibilities);

  const region = regionLabel(profile);
  if (region) {
    const chip = document.createElement("span");
    chip.className = "ec-team-region";
    chip.textContent = `⌖ ${region}`;
    copy.appendChild(chip);
  }

  const arrow = document.createElement("span");
  arrow.className = "ec-team-arrow";
  arrow.textContent = "›";
  arrow.setAttribute("aria-hidden", "true");

  profileButton.append(avatar, copy, arrow);
  profileButton.addEventListener("click", () =>
    window.dispatchEvent(new CustomEvent("ec:open-profile", {
      detail: { profileId: profile.user_id || profile.id, nickname: displayName(profile) }
    }))
  );
  card.appendChild(profileButton);
  const record=contactEdits.get(profile.user_id||profile.id);
  appendEditStamp(card,record);
  if(canEditContacts){
    const edit=document.createElement('button');edit.type='button';edit.className='ec-team-edit';edit.textContent='Zuständigkeiten bearbeiten';
    edit.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('ec:edit-contact',{detail:{id:profile.user_id||profile.id,name:displayName(profile),text:responsibilitiesFor(profile).join('\n'),record}})));
    card.append(edit);
  }
  return card;
}

function appendGroup(panel, titleText, members) {
  if (!members.length) return;
  const group = document.createElement("div");
  group.className = "ec-team-group";

  const title = document.createElement("div");
  title.className = "ec-team-group-title";
  title.textContent = titleText;

  const grid = document.createElement("div");
  grid.className = "ec-team-grid";
  members.forEach((profile) => grid.appendChild(makePerson(profile)));

  group.append(title, grid);
  panel.appendChild(group);
}

function renderTeam(profiles) {
  const host = findHostCard();
  if (!host) return;

  const heading = [...host.querySelectorAll("h1,h2,h3,h4")].find((node) =>
    /Administration|Ansprechpartner/i.test(node.textContent || "")
  );
  if (heading) heading.textContent = "Administration & Support";

  let panel = host.querySelector(".ec-team-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "ec-team-panel";
    const old = host.querySelector(".ec-support-panel");
    if (old) old.replaceWith(panel);
    else heading?.insertAdjacentElement("afterend", panel);
  }

  hideLegacyContacts(host, heading, panel);
  panel.replaceChildren();

  const intro = document.createElement("div");
  intro.className = "ec-team-intro";
  const copy = document.createElement("div");
  copy.innerHTML = "<strong>Support & Ansprechpartner</strong><p>Zuständigkeiten und regionale Verantwortung auf einen Blick.</p>";
  const email = document.createElement("a");
  email.className = "ec-team-email";
  email.href = `mailto:${SUPPORT_EMAIL}`;
  email.textContent = "✉ E-Mail senden";
  intro.append(copy, email);
  panel.appendChild(intro);

  const administration = profiles.filter((profile) => ["HEAD_ADMIN", "ADMIN"].includes(normalizeRole(profile.role)));
  const moderation = profiles.filter((profile) =>
    normalizeRole(profile.role) === "SUPPORTER" && (profile.forum_moderator || profile.group_moderator)
  );

  appendGroup(panel, "Administration", administration);
  appendGroup(panel, "Moderation & Support", moderation);
}

function signature(profiles) {
  return profiles.map((profile) => [
    profile.user_id,
    profile.role,
    profile.is_primary_head_admin,
    profile.nickname,
    profile.forum_moderator,
    profile.group_moderator,
    (profile.region_names || []).join(","),
    (profile.responsibilities || []).join(",")
  ].join("|")).join("::");
}

async function refreshTeam() {
  if (!supabase || refreshRunning || !findHostCard()) return;
  refreshRunning = true;
  try {
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user)return;
    const {data:viewer}=await supabase.from('profiles').select('id,is_primary_head_admin,account_status').eq('id',session.user.id).maybeSingle();
    canEditContacts=isOperatorProfile(viewer)&&viewer?.account_status==='ACTIVE';
    contactEdits=new Map((await loadPageBlocks('__support__')).map(row=>[row.block_key,row]));
    const { data, error } = await supabase.rpc("community_moderation_contacts");
    if (error) throw error;
    const ids=(data||[]).map(p=>p.user_id).filter(Boolean);
    const {data:flags,error:flagsError}=ids.length?await supabase.from('profiles').select('id,is_primary_head_admin').in('id',ids):{data:[]};
    if(flagsError)throw flagsError;
    const primaryIds=new Set((flags||[]).filter(p=>p.is_primary_head_admin===true).map(p=>p.id));
    const profiles = (data || []).map((profile) => ({ ...profile, id: profile.user_id, is_primary_head_admin: primaryIds.has(profile.user_id) }));
    const nextSignature = signature(profiles)+JSON.stringify([...contactEdits.values()])+canEditContacts;
    if (nextSignature !== lastSignature || !document.querySelector(".ec-team-panel")) {
      lastSignature = nextSignature;
      renderTeam(profiles);
    }
  } catch (error) {
    console.error("Administration & Support konnte nicht synchronisiert werden:", error);
  } finally {
    refreshRunning = false;
  }
}

function startRealtime() {
  if (!supabase || realtimeStarted) return;
  realtimeStarted = true;
  supabase.channel("ec-team-role-sync-v8")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
      lastSignature = "";
      refreshTeam();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "user_permissions" }, () => {
      lastSignature = "";
      refreshTeam();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "regional_admin_assignments" }, () => {
      lastSignature = "";
      refreshTeam();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "regional_moderation_assignments" }, () => {
      lastSignature = "";
      refreshTeam();
    })
    .subscribe();
}

function boot() {
  refreshTeam();
  startRealtime();
  if (!pollTimer) pollTimer = setInterval(() => {
    if (!document.hidden) refreshTeam();
  }, 15000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

const observer = new MutationObserver(() => {
  if (findHostCard() && !document.querySelector(".ec-team-panel")) refreshTeam();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('ec:page-block-saved',event=>{if(event.detail?.page_key==='__support__'){lastSignature='';void refreshTeam();}});
