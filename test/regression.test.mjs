import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const requiredMainModules = ["./notification-center.js","./privacy-center.js","./account-deletion-admin.js","./legal-evidence-admin.js","./admin-workspace.js","./admin-dashboard-modern.js","./admin-compact-enhancements.js","./regional-shell.js","./clean-profile-runtime.js","./clean-layout.css","./clean-components.css","./role-region-polish.css","./role-region-polish.js","./sidebar-compact-polish.css","./sidebar-compact-polish.js","./global-role-identity-polish.css","./global-role-identity-polish.js","./people-links-polish.css","./people-links-polish.js"];

test("main entry keeps critical member/admin/regional modules wired without legacy layout stack", async () => {const main=await source("src/main.jsx");for(const module of requiredMainModules) assert.match(main,new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));for(const legacy of ["mobile-admin-production.css","member-grid-final.css","role-theme-lock.css","profile-simple.css","regional-shell.css"])assert.doesNotMatch(main,new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));assert.doesNotMatch(main,/live-notifications\.js/);});

test("native member card renders role theme, identity and separated age/presence", async()=>{const card=await source("src/MemberCardView.jsx");assert.match(card,/data-member-id=\{member\.id\}/);assert.match(card,/data-home-region-id=\{member\.home_region_id/);assert.match(card,/data-role-theme=\{presentation\.theme\}/);for(const x of ['role-star-red.svg','supporter-star.svg','role-star-blue.svg'])assert.match(card,new RegExp(x.replace('.','\\.')));assert.doesNotMatch(card,/role-star-member\.svg/);assert.match(card,/presentation\.star &&/);assert.match(card,/className="ec-member-realname"/);assert.match(card,/className="ec-member-age"/);assert.match(card,/ec-member-presence-line/);assert.doesNotMatch(card,/isAdminCard && member\.last_active_at/);assert.match(card,/loading="lazy"/);assert.match(card,/tabIndex=\{0\}/);});

test("central role identity never gives normal members a role star", async()=>{const code=await source("src/roleIdentity.js");assert.match(code,/return \{ key:"member", label:"Mitglied", mark:"", icon:null/);assert.doesNotMatch(code,/role-star-member\.svg/);});

test("global identity layer is loaded last and uses role star plus nickname only",async()=>{const main=await source("src/main.jsx"),code=await source("src/global-role-identity-polish.js"),css=await source("src/global-role-identity-polish.css");const globalIndex=main.indexOf('./global-role-identity-polish.js');const sidebarIndex=main.indexOf('./sidebar-compact-polish.js');assert.ok(globalIndex>sidebarIndex);assert.match(code,/ec-global-role-identity/);assert.match(code,/starFor\(p(?:,[^)]*)?\)/);assert.match(code,/nick\(p\)/);assert.match(css,/\.ec-global-role-duplicate\{display:none!important\}/);});

test("member card and registration are native source without build-time layout rewriting",async()=>{const app=await source("src/App.jsx"),config=await source("vite.config.js");assert.match(app,/import MemberCardView from "\.\/MemberCardView\.jsx"/);assert.match(app,/function MemberCard\(props\).*MemberCardView/s);assert.match(app,/home_region_slug/);assert.doesNotMatch(config,/ennstal-native-member-card|transform\(code/);});

test("regional shell loads server regions, regional roles and home-region directory rules",async()=>{const code=await source("src/regional-shell.js");assert.match(code,/from\('regions'\)/);assert.match(code,/regional_admin_assignments/);assert.match(code,/homeRegionId|home-region-id/i);assert.match(code,/HEAD_ADMIN/);assert.match(code,/ADMIN/);assert.match(code,/Regional Admin/);assert.match(code,/home_region_id===activeRegion\.id/);assert.match(code,/ec:region-change/);assert.doesNotMatch(code,/location\.reload\(\)/);});

test("regional directory is scoped normally and global only while searching",async()=>{const code=await source("src/regional-shell.js"),app=await source("src/App.jsx"),css=await source("src/clean-components.css");assert.match(code,/card\.hidden=!searching&&p\.home_region_id!==activeRegion\.id/);assert.match(app,/if \(search\.trim\(\)\) return sortedMembers/);assert.match(app,/member\.home_region_id === activeRegionId/);assert.match(css,/\.member-card\[hidden\]\{display:none!important\}/);});

test("every region reloads its own homepage and regional community content",async()=>{const app=await source("src/App.jsx");assert.match(app,/const activeRegionId = activeRegion\?\.id \|\| profile\?\.home_region_id \|\| null/);assert.match(app,/const regionFilter = \(entries\) => activeRegionId \? entries\.filter\(\(entry\) => entry\.region_id === activeRegionId\) : entries/);for(const table of ["homepage_sections","news","community_events","community_ads","forum_posts","community_requests"]){assert.match(app,new RegExp(`from\\(\\"${table}\\"\\)[\\s\\S]{0,220}eq\\(\\"region_id\\", activeRegionId\\)`));}assert.match(app,/ec_region_group_directory/);assert.match(app,/ec_region_weekly_poll_current/);assert.match(app,/ec_region_featured_community_group/);assert.match(app,/\}, \[user\?\.id, activeRegionId\]\);/);assert.match(app,/homepageSections=\{regionFilter\(homepageSections\)\}/);assert.match(app,/groups=\{regionFilter\(groups\)\}/);assert.match(app,/events=\{regionFilter\(communityEvents\)\}/);assert.match(app,/ads=\{regionFilter\(communityAds\)\}/);assert.match(app,/posts=\{regionFilter\(forumPosts\)\}/);});

test("regional management rights are limited to the active assignment while global admins remain global",async()=>{const app=await source("src/App.jsx");assert.match(app,/regionalAssignments\.some\(\(assignment\) => assignment\.user_id === profile\?\.id && assignment\.region_id === activeRegionId && assignment\.active\)/);assert.match(app,/const canManageActiveRegion = isAdmin\(profile\?\.role\) \|\| isRegionalAdminHere/);assert.match(app,/canManage=\{canManageActiveRegion\}/);});

test("profile visits use their real timestamp and open the visitor profile",async()=>{const code=await source("src/regional-shell.js");assert.match(code,/order\('visited_at'/);assert.match(code,/row\.visited_at\|\|row\.created_at/);assert.match(code,/ec:open-profile/);assert.match(code,/avatar_url/);});

test("clean layout has mobile dock and single-column member fallback",async()=>{const css=await source("src/clean-layout.css");assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/\.ec-right-dock/);assert.match(css,/grid-template-columns:1fr!important/);assert.match(await source("src/clean-components.css"),/repeat\(auto-fill,minmax\(min\(100%,235px\),1fr\)\)/);});

test("clean components keep compact profile and dock surfaces",async()=>{const css=await source("src/clean-components.css");assert.match(css,/\.ec-clean-profile/);assert.match(css,/\.ec-dock-identity/);assert.match(css,/\.ec-dock-detail/);assert.match(css,/member-card/);});

test("notification center remains private and realtime",async()=>{const code=await source("src/notification-center.js");assert.match(code,/auth\.getSession\(\)/);assert.doesNotMatch(code,/auth\.getUser\(\)/);assert.match(code,/\.eq\("user_id",uid\)/);assert.match(code,/member_mark_notification_read/);assert.match(code,/removeChannel\(channel\)/);});

test("friend requests use the canonical friendships table",async()=>{const code=await source("src/Friends.jsx");assert.match(code,/from\("friendships"\)/);assert.match(code,/\.eq\("receiver_id", user\.id\)/);});

test("admin workspace checks signed-in active admin role",async()=>{const code=await source("src/admin-workspace.js");assert.match(code,/auth\.getUser\(\)/);assert.match(code,/allowed=p\?\.account_status==="ACTIVE"&&\(isHead\|\|isGlobalAdmin\|\|isRegionalAdmin\)/);assert.match(code,/a\.active&&a\.region_id===activeId/);assert.match(code,/head_admin_system_diagnostics/);});

test("legal evidence and deletion flows keep explicit confirmations",async()=>{const legal=await source("src/legal-evidence-admin.js"),deletion=await source("src/account-deletion-admin.js");assert.match(legal,/RECHTLICHE ANFRAGE BESTAETIGT/);assert.match(deletion,/LOESCHUNG ENDGUELTIG DURCHFUEHREN/);});

test("member privacy controls use server-side RPCs",async()=>{const center=await source("src/privacy-center.js"),lastName=await source("src/last-name-privacy.js");assert.match(center,/member_privacy_export/);assert.match(lastName,/set_last_name_privacy/);});

test("React profile keeps private fields restricted and legacy DOM replacement disabled",async()=>{const legacy=await source("src/clean-profile-runtime.js");assert.doesNotMatch(legacy,/innerHTML|replaceWith/);const code=await source("src/ProfileView.jsx");const body=code.match(/function privacyVisible\(member, field, mine, viewerIsAdmin\) \{([\s\S]*?)\n\}/)[1];const visible=new Function("member","field","mine","viewerIsAdmin",body);assert.equal(visible({privacy_settings:{city:"PRIVATE"}},"city",false,false),false);assert.equal(visible({privacy_settings:{city:"PRIVATE"}},"city",true,false),true);assert.equal(visible({privacy_settings:{city:"PRIVATE"}},"city",false,true),true);assert.equal(visible({privacy_settings:{city:"PUBLIC"}},"city",false,false),true);});

test("supporter role remains gold with black nickname in clean layout",async()=>{const css=await source("src/clean-layout.css");assert.match(css,/data-role-theme="supporter"/);assert.match(css,/#ffe532/);assert.match(css,/#050505/);});

test("linked people presentation keeps online friends text-only and responsibilities profile-linked",async()=>{const code=await source("src/people-links-polish.js"),css=await source("src/people-links-polish.css");assert.match(code,/ec-online-friend/);assert.match(code,/ec-region-responsibility-person/);assert.match(code,/ec:open-profile/);assert.match(css,/\.ec-dock-detail-row>img\{display:none!important\}/);assert.match(css,/\.ec-responsibility-avatar\{display:block!important/);});

test("service worker cleanup prevents stale application shells",async()=>{const main=await source("src/main.jsx");assert.match(main,/getRegistrations\(\)/);assert.match(main,/registration\.unregister\(\)/);assert.doesNotMatch(main,/serviceWorker\.register/);});


test("deferred admin modules stay reachable instead of disappearing from the UI", async()=>{
  const main=await source("src/main.jsx");
  const deferred=await source("src/deferred-admin-enhancements.js");
  assert.ok(main.includes('import "./deferred-admin-enhancements.js";'));
  assert.ok(main.includes('import "./admin-central-hub.js";'), "shared admin center must load eagerly");
  for(const module of [
    "./admin-dashboard-modern.js","./admin-compact-enhancements.js","./admin-community-popup-manager.js","./admin-central-permissions.js",
    "./business-account-admin-fix.js","./head-admin-activity-folders.js","./admin-reload-watch.js","./admin-system-watch.js",
    "./profile-admin-tools-unified.js","./profile-admin-role-actions.js","./regional-admin-tools-bridge.js"
  ]) assert.ok(deferred.includes(module), `missing deferred module: ${module}`);
  for(const page of ["admin","reports","admin-forum","admin-account-review","adminTools","legal","profile","profile-preview","member-profile","members"])
    assert.ok(deferred.includes(`\'${page}\'`) || deferred.includes(`"${page}"`), `missing deferred page route: ${page}`);
  assert.ok(deferred.includes(".member-profile-page[data-profile-id]"));
});

test("core visible community surfaces remain wired while performance code changes", async()=>{
  const app=await source("src/App.jsx");
  for(const label of ["Nachrichten","Forum","Mitglieder","Gruppen","Events"])
    assert.ok(app.includes(label), `missing visible community label: ${label}`);
  for(const table of ["messages","forum_posts","community_events","community_ads","member_photos"])
    assert.ok(app.includes(`from("${table}")`), `missing community data source: ${table}`);
});


test("Events navigation has a rendered page and Head Admin access stays visibly wired", async()=>{
  const app=await source("src/App.jsx");
  const main=await source("src/main.jsx");
  assert.ok(app.includes('page === "events"'), "Events navigation target must render content");
  assert.ok(main.includes('import "./admin-access-placement-final.js";'), "final admin access placement must load at startup");
});


test("head admin error center stays wired and system notifications open it", async()=>{
  const main=await source("src/main.jsx");
  const monitor=await source("src/error-monitor.js");
  const center=await source("src/admin-error-center.js");
  const notifications=await source("src/notification-center.js");
  const network=await source("src/networkFetch.js");
  const sql=await source("supabase/head_admin_error_center.sql");

  assert.match(main,/import "\.\/error-monitor\.js"/);
  assert.match(main,/import "\.\/admin-error-center\.js"/);
  assert.match(monitor,/window\.addEventListener\("error"/);
  assert.match(monitor,/unhandledrejection/);
  assert.match(monitor,/ec:network-error/);
  assert.match(monitor,/LAYOUT/);
  assert.match(network,/record_client_error/);
  assert.match(network,/response\.status >= 500/);
  assert.match(center,/head_admin_error_summary/);
  assert.match(center,/head_admin_error_feed/);
  assert.match(center,/head_admin_set_error_status/);
  assert.match(center,/ec:open-system-errors/);
  assert.match(notifications,/SYSTEM_ERROR/);
  assert.match(notifications,/ec:open-system-errors/);
  assert.match(sql,/private\.app_error_events/);
  assert.match(sql,/revoke all on table private\.app_error_events from public, anon, authenticated/);
  assert.match(sql,/not public\.ec_is_head_admin\(\)/);
  assert.match(sql,/grant execute on function public\.record_client_error[\s\S]*to authenticated/);
});


test("error center does not depend on auth user endpoint and stays visible on backend failure", async()=>{
  const center=await source("src/admin-error-center.js");
  const monitor=await source("src/error-monitor.js");
  const network=await source("src/networkFetch.js");

  assert.ok(!center.includes("supabase.auth.getUser()"), "error center must not call /auth/v1/user");
  assert.ok(!monitor.includes("supabase.auth.getUser()"), "error reporter must not call /auth/v1/user");
  assert.match(center,/Berechtigung und Verbindung werden geprüft/);
  assert.match(center,/Verbindung nicht verfügbar/);
  assert.match(center,/head_admin_error_summary/);
  assert.match(network,/head_admin_error_summary/);
  assert.match(network,/head_admin_error_feed/);
});


test("high-frequency UI modules do not hammer the auth user endpoint", async()=>{
  const paths=[
    "src/sidebar-reward-progress.js",
    "src/regional-shell.js",
    "src/sidebar-friends-newsfeed.js",
    "src/personal-dashboard-final-fix.js",
    "src/notification-center.js",
    "src/dashboard-top-polish.js",
    "src/role-region-polish.js",
    "src/sidebar-role-pin.js"
  ];
  for(const path of paths){
    const code=await source(path);
    assert.ok(!code.includes("auth.getUser()"), `${path} must use local session data for repeated UI identity reads`);
    assert.ok(code.includes("auth.getSession()"), `${path} must keep a local session identity source`);
  }
  const network=await source("src/networkFetch.js");
  assert.match(network,/isAuthUserRead/);
  assert.match(network,/10_000/);
});


test("modern admin dashboard always loads its own styles", async()=>{
  const dashboard=await source("src/admin-dashboard-modern.js");
  const css=await source("src/admin-dashboard-modern.css");
  assert.match(dashboard,/import "\.\/admin-dashboard-modern\.css";/);
  for(const selector of [".ec-admin-modern",".ec-admin-tabs",".ec-admin-stat-grid",".ec-admin-system-row",".ec-admin-notice-row"])
    assert.ok(css.includes(selector), `missing admin dashboard selector: ${selector}`);
});


test("admin dashboard actions navigate instead of silently failing on missing DOM targets", async()=>{
  const code=await source("src/admin-dashboard-modern.js");
  assert.match(code,/async function navigateAndFocus/);
  assert.match(code,/navigateAndFocus\("reports","\.report-list"\)/);
  assert.match(code,/navigateAndFocus\("admin","\.admin-member-cards"\)/);
  assert.match(code,/navigateAndFocus\("admin","\.admin-email-directory"\)/);
  assert.match(code,/async function openVerificationReview/);
  assert.match(code,/new CustomEvent\("ec:navigate"/);
  assert.doesNotMatch(code,/\["Meldungen",d\.reports,\(\)=>scrollTo\("\.report-list"\)\]/);
  assert.doesNotMatch(code,/\["✓ Verifizierungen",\(\)=>document\.querySelector\("\.admin-review-button"\)\?\.click\(\)\]/);
});


test("first-paint assets stay lightweight, cacheable and preloaded", async()=>{
  const app=await source("src/App.jsx");
  const memberCard=await source("src/MemberCardView.jsx");
  const regional=await source("src/regional-shell.js");
  const main=await source("src/main.jsx");
  const index=await source("index.html");
  const headers=await source("public/_headers");
  const avatar=await source("public/community-default-avatar-fast.svg");

  for(const code of [app,memberCard,regional])
    assert.ok(code.includes("/community-default-avatar-fast.svg"), "visible fallback avatar must use lightweight SVG");

  assert.ok(!app.includes('const DEFAULT_AVATAR = "/community-default-avatar.png"'));
  assert.match(index,/preconnect" href="https:\/\/eqfvhgiyrofjscvimvrc\.supabase\.co"/);
  assert.match(index,/preload" as="image" href="\/ennstal-connect-wordmark\.svg"/);
  assert.match(index,/preload" as="image" href="\/community-default-avatar-fast\.svg"/);
  assert.match(headers,/\/\*\.svg[\s\S]*stale-while-revalidate=86400/);
  assert.match(headers,/\/\*\.png[\s\S]*stale-while-revalidate=86400/);
  assert.match(main,/ec-legacy-cache-cleanup-v7/);
  assert.ok(avatar.length < 10000, "fallback avatar must remain lightweight");
});


test("first-paint assets stay cacheable and legacy service workers self-heal", async()=>{
  const headers=await source("public/_headers");
  const index=await source("index.html");
  const main=await source("src/main.jsx");
  const app=await source("src/App.jsx");
  const cards=await source("src/MemberCardView.jsx");
  const shell=await source("src/regional-shell.js");

  assert.match(headers,/\/\*\.svg[\s\S]*Cache-Control: public/);
  assert.match(headers,/\/\*\.png[\s\S]*Cache-Control: public/);
  assert.match(headers,/\/assets\/\*[\s\S]*immutable/);
  assert.match(index,/preconnect[^>]+supabase\.co/);
  assert.match(index,/community-default-avatar-fast\.svg/);
  assert.match(index,/ennstal-connect-wordmark\.svg/);
  assert.match(app,/community-default-avatar-fast\.svg/);
  assert.match(cards,/community-default-avatar-fast\.svg/);
  assert.match(shell,/community-default-avatar-fast\.svg/);
  assert.match(main,/ec-legacy-cache-cleanup-v7/);
  assert.match(main,/window\.location\.reload\(\)/);
});
