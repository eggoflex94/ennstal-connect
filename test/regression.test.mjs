import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const requiredMainModules = [
  "./notification-center.js",
  "./privacy-center.js",
  "./account-deletion-admin.js",
  "./legal-evidence-admin.js",
  "./admin-workspace.js",
  "./admin-dashboard-modern.js",
  "./admin-compact-enhancements.js",
  "./mobile-admin-production.css",
  "./supporter-runtime-fix.js",
  "./member-grid-final.css",
  "./role-theme-lock.css"
];

test("main entry keeps critical member/admin modules wired", async () => {
  const main = await source("src/main.jsx");
  for (const module of requiredMainModules) assert.match(main, new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(main, /live-notifications\.js/);
});

test("native member card renders role theme, 3d star and separated age/presence", async () => {
  const card = await source("src/MemberCardView.jsx");
  assert.match(card, /data-role-theme=\{presentation\.theme\}/);
  assert.match(card, /role-star-red\.svg/);
  assert.match(card, /supporter-star\.svg/);
  assert.match(card, /role-star-blue\.svg/);
  assert.match(card, /role-star-member\.svg/);
  assert.match(card, /className="member-meta ec-member-meta"/);
  assert.match(card, /className="ec-member-realname"/);
  assert.match(card, /className="ec-member-age"/);
  assert.match(card, /className="ec-member-presence-line"/);
  assert.match(card, /className="ec-member-presence-dot"/);
  assert.match(card, /className="ec-member-presence-label"/);
  assert.match(card, /\(\{age\} Jahre\)/);
  assert.match(card, /loading="lazy"/);
  assert.match(card, /tabIndex=\{0\}/);
});

test("vite build swaps only the known MemberCard renderer", async () => {
  const config = await source("vite.config.js");
  assert.match(config, /ennstal-native-member-card/);
  assert.match(config, /MemberCardView\.jsx/);
  assert.match(config, /MemberCard renderer markers not found/);
  assert.match(config, /function MemberCard\(props\) \{ return <MemberCardView \{\.\.\.props\}\/>; \}/);
});

test("notification center remains private and realtime", async () => {
  const code = await source("src/notification-center.js");
  assert.match(code, /auth\.getUser\(\)/);
  assert.match(code, /\.eq\("user_id",uid\)/);
  assert.match(code, /table:"notifications",filter:`user_id=eq\.\$\{uid\}`/);
  assert.match(code, /member_mark_notification_read/);
  assert.match(code, /member_mark_all_notifications_read/);
  assert.match(code, /removeChannel\(channel\)/);
  assert.doesNotMatch(code, /n\.content|message\.content/);
});

test("friend requests use the canonical friendships table", async () => {
  const code = await source("src/Friends.jsx");
  assert.match(code, /from\("friendships"\)/);
  assert.match(code, /\.eq\("receiver_id", user\.id\)/);
  assert.match(code, /\.eq\("status", "pending"\)/);
});

test("admin workspace checks signed-in active admin role", async () => {
  const code = await source("src/admin-workspace.js");
  assert.match(code, /auth\.getUser\(\)/);
  assert.match(code, /\["HEAD_ADMIN","ADMIN"\]\.includes\(p\?\.role\)/);
  assert.match(code, /p\?\.account_status!=="ACTIVE"/);
  assert.match(code, /head_admin_system_diagnostics/);
  assert.match(code, /head_admin_backup_review_status/);
});

test("legal evidence and deletion flows keep explicit confirmations", async () => {
  const legal = await source("src/legal-evidence-admin.js");
  const deletion = await source("src/account-deletion-admin.js");
  assert.match(legal, /RECHTLICHE ANFRAGE BESTAETIGT/);
  assert.match(legal, /FALL BEWUSST OEFFNEN/);
  assert.match(legal, /head_admin_verify_legal_evidence_case/);
  assert.match(deletion, /LOESCHUNG ENDGUELTIG DURCHFUEHREN/);
  assert.match(deletion, /head_admin_complete_account_deletion_request/);
});

test("member privacy controls use server-side RPCs", async () => {
  const center = await source("src/privacy-center.js");
  const lastName = await source("src/last-name-privacy.js");
  assert.match(center, /member_privacy_export/);
  assert.match(center, /member_request_account_deletion/);
  assert.match(center, /member_cancel_account_deletion/);
  assert.match(lastName, /set_last_name_privacy/);
  assert.match(lastName, /ADMIN_ONLY/);
});

test("role runtime is limited to feeds and never rewrites member cards", async () => {
  const code = await source("src/supporter-runtime-fix.js");
  assert.match(code, /MutationObserver/);
  assert.match(code, /requestAnimationFrame/);
  assert.match(code, /ec-rf-person/);
  assert.match(code, /ec-rf-update/);
  assert.match(code, /ec-rf-activity/);
  assert.doesNotMatch(code, /setInterval\s*\(/);
  assert.doesNotMatch(code, /\.member-card/);
  assert.doesNotMatch(code, /ecAgeStacked|formatMemberAges|member-avatar/);
});

test("mobile admin hardening preserves touch sized controls and narrow layouts", async () => {
  const css = await source("src/mobile-admin-production.css");
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /font-size:16px/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("member card layout keeps name age and presence in separate flex blocks", async () => {
  const css = await source("src/member-grid-final.css");
  assert.match(css, /\.member-card \.ec-member-meta\{display:flex!important;flex-direction:column!important/);
  assert.match(css, /\.member-card \.member-name\{display:flex!important;flex-direction:column!important/);
  assert.match(css, /\.member-card \.member-status\{display:flex!important;flex-direction:column!important/);
  assert.match(css, /\.member-card \.ec-member-presence-line\{display:flex!important/);
  assert.match(css, /gap:12px!important/);
});

test("friendship badges are decorative square images without fallback text", async () => {
  const js = await source("src/community-sidebar-links.js");
  const css = await source("src/community-sidebar-links.css");
  assert.match(js, /img\.alt=''/);
  assert.match(js, /aria-hidden/);
  assert.match(css, /aspect-ratio:1\/1!important/);
  assert.match(css, /object-fit:contain!important/);
});

test("supporter role lock forbids green card fallback", async () => {
  const css = await source("src/role-theme-lock.css");
  assert.match(css, /data-role-theme="supporter"/);
  assert.match(css, /#ffe537/);
  assert.match(css, /#050505/);
});

test("service worker cleanup prevents stale application shells", async () => {
  const main = await source("src/main.jsx");
  assert.match(main, /getRegistrations\(\)/);
  assert.match(main, /registration\.unregister\(\)/);
  assert.match(main, /ennstal-connect-shell-/);
  assert.doesNotMatch(main, /serviceWorker\.register/);
});
