import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const requiredMainModules = ["./notification-center.js","./privacy-center.js","./account-deletion-admin.js","./legal-evidence-admin.js","./admin-workspace.js","./admin-dashboard-modern.js","./admin-compact-enhancements.js","./mobile-admin-production.css","./supporter-runtime-fix.js","./member-grid-final.css","./role-theme-lock.css","./regional-shell.css","./regional-shell.js"];

test("main entry keeps critical member/admin/regional modules wired", async () => {const main=await source("src/main.jsx");for(const module of requiredMainModules) assert.match(main,new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));assert.doesNotMatch(main,/live-notifications\.js/);});

test("native member card renders role theme, identity, 3d star and separated age/presence", async()=>{const card=await source("src/MemberCardView.jsx");assert.match(card,/data-member-id=\{member\.id\}/);assert.match(card,/data-home-region-id=\{member\.home_region_id/);assert.match(card,/data-role-theme=\{presentation\.theme\}/);for(const x of ['role-star-red.svg','supporter-star.svg','role-star-blue.svg','role-star-member.svg'])assert.match(card,new RegExp(x.replace('.','\\.')));assert.match(card,/className="ec-member-realname"/);assert.match(card,/className="ec-member-age"/);assert.match(card,/loading="lazy"/);assert.match(card,/tabIndex=\{0\}/);});

test("vite build swaps only the known MemberCard renderer",async()=>{const config=await source("vite.config.js");assert.match(config,/ennstal-native-member-card/);assert.match(config,/MemberCardView\.jsx/);assert.match(config,/MemberCard renderer markers not found/);assert.match(config,/home_region_slug/);});

test("regional shell loads server regions and enforces region directory rules",async()=>{const code=await source("src/regional-shell.js");assert.match(code,/from\('regions'\)/);assert.match(code,/regional_admin_assignments/);assert.match(code,/homeRegionId|home-region-id/i);assert.match(code,/role==='HEAD_ADMIN'\|\|role==='ADMIN'/);assert.match(code,/ec:region-change/);assert.doesNotMatch(code,/location\.reload\(\)/);});

test("regional shell has mobile icon dock and single-column member fallback",async()=>{const css=await source("src/regional-shell.css");assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/\.ec-right-dock/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);assert.match(css,/max-width:100vw!important/);});

test("notification center remains private and realtime",async()=>{const code=await source("src/notification-center.js");assert.match(code,/auth\.getUser\(\)/);assert.match(code,/\.eq\("user_id",uid\)/);assert.match(code,/member_mark_notification_read/);assert.match(code,/removeChannel\(channel\)/);});

test("friend requests use the canonical friendships table",async()=>{const code=await source("src/Friends.jsx");assert.match(code,/from\("friendships"\)/);assert.match(code,/\.eq\("receiver_id", user\.id\)/);});

test("admin workspace checks signed-in active admin role",async()=>{const code=await source("src/admin-workspace.js");assert.match(code,/auth\.getUser\(\)/);assert.match(code,/\["HEAD_ADMIN","ADMIN"\]\.includes\(p\?\.role\)/);assert.match(code,/head_admin_system_diagnostics/);});

test("legal evidence and deletion flows keep explicit confirmations",async()=>{const legal=await source("src/legal-evidence-admin.js"),deletion=await source("src/account-deletion-admin.js");assert.match(legal,/RECHTLICHE ANFRAGE BESTAETIGT/);assert.match(deletion,/LOESCHUNG ENDGUELTIG DURCHFUEHREN/);});

test("member privacy controls use server-side RPCs",async()=>{const center=await source("src/privacy-center.js"),lastName=await source("src/last-name-privacy.js");assert.match(center,/member_privacy_export/);assert.match(lastName,/set_last_name_privacy/);});

test("role runtime is limited to feeds and never rewrites member cards",async()=>{const code=await source("src/supporter-runtime-fix.js");assert.match(code,/MutationObserver/);assert.doesNotMatch(code,/setInterval\s*\(/);assert.doesNotMatch(code,/\.member-card/);});

test("mobile admin hardening preserves touch sized controls and narrow layouts",async()=>{const css=await source("src/mobile-admin-production.css");assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/min-height:44px/);assert.match(css,/safe-area-inset-bottom/);});

test("supporter role lock forbids green card fallback",async()=>{const css=await source("src/role-theme-lock.css");assert.match(css,/data-role-theme="supporter"/);assert.match(css,/#ffe537/);assert.match(css,/#050505/);});

test("service worker cleanup prevents stale application shells",async()=>{const main=await source("src/main.jsx");assert.match(main,/getRegistrations\(\)/);assert.match(main,/registration\.unregister\(\)/);assert.doesNotMatch(main,/serviceWorker\.register/);});
