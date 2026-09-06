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
  "./supporter-runtime-fix.js"
];

test("main entry keeps critical member/admin modules wired", async () => {
  const main = await source("src/main.jsx");
  for (const module of requiredMainModules) assert.match(main, new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(main, /live-notifications\.js/);
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

test("role runtime is event driven and has no recurring repaint loop", async () => {
  const code = await source("src/supporter-runtime-fix.js");
  assert.match(code, /MutationObserver/);
  assert.match(code, /requestAnimationFrame/);
  assert.doesNotMatch(code, /setInterval\s*\(/);
  assert.doesNotMatch(code, /attributes\s*:\s*true/);
});

test("mobile admin hardening preserves touch sized controls and narrow layouts", async () => {
  const css = await source("src/mobile-admin-production.css");
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /font-size:16px/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("Cloudflare production entry keeps stability assets wired", async () => {
  const html = await source("dist/index.html");
  assert.match(html, /mobile-admin-production\.css/);
  assert.match(html, /supporter-runtime-fix\.js/);
  assert.match(html, /viewport-fit=cover/);
});
