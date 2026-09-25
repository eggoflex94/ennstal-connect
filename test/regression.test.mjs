import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const requiredMainModules = ["./notification-center.js","./privacy-center.js","./account-deletion-admin.js","./legal-evidence-admin.js","./admin-workspace.js","./regional-shell.js","./clean-profile-runtime.js","./clean-layout.css","./clean-components.css","./role-region-polish.css","./sidebar-compact-polish.css","./global-role-identity-polish.css","./people-links-polish.css"];

test("main entry keeps critical member/admin/regional modules wired without legacy layout stack", async () => {const main=await source("src/main.jsx");for(const module of requiredMainModules) assert.match(main,new RegExp(module.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));for(const legacy of ["mobile-admin-production.css","member-grid-final.css","role-theme-lock.css","profile-simple.css"])assert.doesNotMatch(main,new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));assert.doesNotMatch(main,/live-notifications\.js/);});

test("native member card renders role theme, identity and separated age/presence", async()=>{const card=await source("src/MemberCardView.jsx");assert.match(card,/data-member-id=\{member\.id\}/);assert.match(card,/data-home-region-id=\{member\.home_region_id/);assert.match(card,/data-role-theme=\{presentation\.theme\}/);for(const x of ['role-star-red.svg','supporter-star.svg','role-star-blue.svg'])assert.match(card,new RegExp(x.replace('.','\\.')));assert.doesNotMatch(card,/role-star-member\.svg/);assert.match(card,/presentation\.star &&/);assert.match(card,/className="ec-member-realname"/);assert.match(card,/className="ec-member-age"/);assert.match(card,/ec-member-presence-line/);assert.doesNotMatch(card,/isAdminCard && member\.last_active_at/);assert.match(card,/loading="lazy"/);assert.match(card,/tabIndex=\{0\}/);});

test("central role identity never gives normal members a role star", async()=>{const code=await source("src/roleIdentity.js");assert.match(code,/return \{ key:"member", label:"Mitglied", mark:"", icon:null/);assert.doesNotMatch(code,/role-star-member\.svg/);});

test("global identity layer is loaded last and uses role star plus nickname only",async()=>{const main=await source("src/main.jsx"),code=await source("src/global-role-identity-polish.js"),css=await source("src/global-role-identity-polish.css");const globalIndex=main.indexOf('./global-role-identity-polish.js');const sidebarIndex=main.indexOf('./sidebar-compact-polish.js');assert.ok(globalIndex>sidebarIndex);assert.match(code,/ec-global-role-identity/);assert.match(code,/starFor\(p(?:,[^)]*)?\)/);assert.match(code,/nick\(p\)/);assert.match(css,/\.ec-global-role-duplicate\{display:none!important\}/);});

test("member card and registration are native source without build-time layout rewriting",async()=>{const app=await source("src/App.jsx"),config=await source("vite.config.js");assert.match(app,/import MemberCardView from "\.\/MemberCardView\.jsx"/);assert.match(app,/function MemberCard\(props\).*MemberCardView/s);assert.match(app,/home_region_slug/);assert.doesNotMatch(config,/ennstal-native-member-card|transform\(code/);});

test("regional shell loads server regions, regional roles and home-region directory rules",async()=>{const code=await source("src/regional-shell.js");assert.match(code,/from\('regions'\)/);assert.match(code,/regional_admin_assignments/);assert.match(code,/homeRegionId|home-region-id/i);assert.match(code,/HEAD_ADMIN/);assert.match(code,/ADMIN/);assert.match(code,/Regional Admin/);assert.match(code,/home_region_id===activeRegion\.id/);assert.match(code,/ec:region-change/);assert.doesNotMatch(code,/location\.reload\(\)/);});

test("native directory owns all-region and active-region filtering",async()=>{const code=await source("src/regional-shell.js"),native=await source("src/NativeMembersDirectory.jsx");assert.match(code,/if\(card\.closest\('\.native-members-directory'\)\)card\.hidden=false/);assert.doesNotMatch(code,/card\.hidden=!searching&&p\.home_region_id!==activeRegion\.id/);assert.match(native,/regionId === "ALL"/);assert.match(native,/member\.home_region_id === regionId/);});

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
    "./admin-dashboard-modern.js","./admin-community-popup-manager.js","./admin-central-permissions.js",
    "./business-account-admin-fix.js","./head-admin-activity-folders.js","./admin-reload-watch.js","./admin-system-watch.js",
    "./profile-admin-tools-unified.js","./profile-admin-role-actions.js"
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
  assert.match(main,/ec-app-shell-build/);
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
  assert.match(main,/ec-app-shell-build/);
  assert.match(main,/window\.location\.replace\(url\.toString\(\)\)/);
});


test("stable profile enhancement does not move React-owned nodes or insert against stale parents", async()=>{
  const code=await source("src/stable-app.js");
  assert.match(code,/if\(!root\.isConnected\|\|hero\.parentNode!==root\)return/);
  assert.match(code,/currentHero!==hero/);
  assert.match(code,/cloneNode\(true\)/);
  assert.match(code,/hero\.before\(layout\)/);
  assert.doesNotMatch(code,/root\.insertBefore\(layout,hero\)/);
  assert.doesNotMatch(code,/photo\.appendChild\(avatar\)/);
  assert.doesNotMatch(code,/actions\.appendChild\(button\)/);
});

test("stable dock enhancement is idempotent instead of remove-and-reinsert churn", async()=>{
  const code=await source("src/stable-app.js");
  assert.match(code,/let box=dock\.querySelector\(':scope > \.ec-stable-admin-dock'\)/);
  assert.match(code,/if\(!box\)/);
  assert.ok(!code.includes(".ec-production-logout,.ec-stable-admin-dock').forEach(el=>el.remove())"));
});


test("municipality partnership module stays wired and scoped", async()=>{
  const main=await source("src/main.jsx");
  const module=await source("src/municipality-module.js");
  const sql=await source("supabase/migrations/20260920213000_municipality_partnership_module.sql");
  assert.ok(main.includes('import "./municipality-module.js";'));
  assert.ok(main.includes('import "./municipality-module.css";'));
  assert.match(module,/ec_municipality_context/);
  assert.match(module,/ec_submit_citizen_request/);
  assert.match(module,/ec_municipality_staff_requests/);
  assert.match(module,/ec_municipality_update_request/);
  assert.match(module,/data-ec-page="municipality"/);
  assert.match(sql,/create table if not exists public\.municipality_profiles/);
  assert.match(sql,/create table if not exists public\.municipality_staff/);
  assert.match(sql,/create table if not exists public\.municipality_notices/);
  assert.match(sql,/create table if not exists public\.citizen_requests/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/ec_municipality_can_manage/);
  assert.match(sql,/reporter_id = auth\.uid\(\)/);
});


test("primary navigation stays focused and Community groups secondary areas", async()=>{
  const shell=await source("src/regional-shell.js");
  const app=await source("src/App.jsx");
  const municipality=await source("src/municipality-module.js");
  const topLinks=shell.match(/const TOP_LINKS=\[(.*?)\];/s)?.[1]||"";
  for(const label of ["Startseite","Mitglieder","Forum","Gruppen","Events","Community"]) assert.ok(topLinks.includes(label), `missing primary nav item: ${label}`);
  for(const label of ["Fotos","Neuigkeiten"]) assert.ok(!topLinks.includes(label), `secondary item leaked into primary nav: ${label}`);
  assert.match(app,/className="community-section-links"/);
  assert.match(app,/page:"news"/);
  assert.match(app,/page:"photos"/);
  assert.match(app,/page:"municipality"/);
  assert.match(app,/Gemeinde & Service/);
  assert.ok(!municipality.includes("nav.appendChild(button)"));
});


test("mobile navigation never reparents React-owned top-nav buttons", async()=>{
  const code=await source("src/mobile-nav-runtime.js");
  assert.doesNotMatch(code,/appendChild\(button\)/);
  assert.doesNotMatch(code,/insertBefore\(button/);
  assert.doesNotMatch(code,/nav\.prepend\(rail\)/);
  assert.match(code,/classList\.toggle\('ec-mobile-nav-ready'/);
});


test("runtime DOM insertion guards avoid stale insertBefore references", async()=>{
  const paths=[
    "src/admin-online-status.js",
    "src/last-name-privacy.js",
    "src/community-event-region-fix.js",
    "src/sidebar-reward-progress.js",
    "src/standard-theme-runtime.js",
    "src/community-support-verification.js",
    "src/member-extras.js",
    "src/sidebar-compact-polish.js",
    "src/mobile-nav-runtime.js",
    "src/stable-app.js"
  ];
  for(const path of paths){
    const code=await source(path);
    assert.doesNotMatch(code,/\.insertBefore\(/, `${path} must not insert against a potentially stale reference node`);
  }
});

test("async DOM enhancers revalidate their live surfaces before mutation", async()=>{
  const adminOnline=await source("src/admin-online-status.js");
  const lastName=await source("src/last-name-privacy.js");
  const eventRegion=await source("src/community-event-region-fix.js");
  const stable=await source("src/stable-app.js");
  assert.match(adminOnline,/!form\.isConnected/);
  assert.match(lastName,/!section\.isConnected/);
  assert.match(eventRegion,/!form\.isConnected \|\| form !== eventForm\(\)/);
  assert.match(stable,/!root\.isConnected\|\|hero\.parentNode!==root/);
});


test("legacy DOM reparenting layers stay disabled on React-owned surfaces", async()=>{
  const main=await source("src/main.jsx");
  const deferred=await source("src/deferred-admin-enhancements.js");
  assert.doesNotMatch(main,/^import "\.\/home-modern-final\.js";/m);
  assert.doesNotMatch(main,/^import "\.\/profile-layout-organizer\.js";/m);
  assert.doesNotMatch(deferred,/import\('\.\/admin-compact-enhancements\.js'\)/);
});

test("point suspension migration keeps status fields consistent at minus ten", async()=>{
  const sql=await source("supabase/migrations/20260920224000_point_suspension_consistency.sql");
  assert.match(sql,/coalesce\(new\.points,\s*0\) <= -10/);
  assert.match(sql,/account_status = 'SUSPENDED'/);
  assert.match(sql,/is_suspended = true/);
  assert.match(sql,/ec_is_protected_admin_target/);
});


test("legacy polish scripts that mutate React-owned DOM stay disabled", async()=>{
  const main=await source("src/main.jsx");
  for(const script of [
    "role-region-polish.js",
    "sidebar-compact-polish.js",
    "global-role-identity-polish.js",
    "people-links-polish.js",
    "community-contact-cleanup.js",
    "home-modern-final.js",
    "profile-layout-organizer.js"
  ]){
    assert.doesNotMatch(main,new RegExp('^import "\\.\\/'+script.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+'";','m'));
  }
});


test("member profile exposes groups forum posts and friends as dedicated tabs", async()=>{
  const app=await source("src/App.jsx");
  const tabs=await source("src/ProfileSocialTabs.jsx");
  const css=await source("src/profile-social-tabs.css");
  const sql=await source("supabase/migrations/20260920235000_profile_social_overview.sql");
  assert.match(app,/ProfileSocialTabs/);
  assert.match(tabs,/label:"Gruppen"/);
  assert.match(tabs,/label:"Forum-Beiträge"/);
  assert.match(tabs,/label:"Freunde"/);
  assert.match(tabs,/MemberCardView/);
  assert.match(tabs,/ec_profile_social_overview/);
  assert.match(css,/profile-social-member-grid/);
  assert.match(sql,/friend_count/);
  assert.match(sql,/group_count/);
  assert.match(sql,/forum_post_count/);
});

test("legacy duplicate friend and group blocks are removed from member profile", async()=>{
  const app=await source("src/App.jsx");
  const start=app.indexOf("function MemberProfile(");
  const end=app.indexOf("function PublicProfileUpdatesPreview",start);
  const block=app.slice(start,end);
  assert.doesNotMatch(block,/className="public-friends"/);
  assert.doesNotMatch(block,/<MemberGroups member={member}/);
});


test("personal dashboard stays off-canvas on narrow screens", async()=>{
  const code=await source("src/personal-dashboard-final-fix.js");
  const css=await source("src/layout-overlap-authority.css");
  assert.match(code,/max-width:1050px/);
  assert.match(code,/classList\.remove\('ec-document-flow-dock'\)/);
  assert.match(code,/document\.body\.appendChild\(dock\)/);
  assert.match(code,/addEventListener\('resize',schedule/);
  assert.doesNotMatch(css,/ec-stable-personal-dock\.ec-document-flow-dock\{grid-column:1/);
});


test("regional dashboard renders its compact icon grid natively", async()=>{
  const shell=await source("src/regional-shell.js");
  assert.match(shell,/ec-right-dock ec-compact-personal-dock/);
  assert.match(shell,/class="ec-compact-menu-grid"/);
  for(const label of ["Benachrichtigungen","Mein Profil","Nachrichten","Freunde","Anfragen","Blockiert","Einstellungen","Hilfe","Heimatregion ändern"]){
    assert.ok(shell.includes(label), "missing dashboard item: "+label);
  }
  assert.match(shell,/ec-compact-menu-icon/);
  assert.match(shell,/DOCK_ICONS/);
});


test("Admin Central stays in the compact dashboard icon grid", async()=>{
  const hub=await source("src/admin-central-hub.js");
  const placement=await source("src/admin-access-placement-final.js");
  assert.match(hub,/querySelector\(':scope > \.ec-compact-menu-grid'\)/);
  assert.match(hub,/dataset\.ecAdminCentralHub = '1'/);
  assert.match(placement,/:not\(\[data-ec-admin-central-hub="1"\]\)/);
});

test("network monitor coalesces transient timeout bursts and uses a safer read timeout", async()=>{
  const monitor=await source("src/error-monitor.js");
  const network=await source("src/networkFetch.js");
  assert.match(monitor,/NETWORK_BURST_COOLDOWN_MS = 60_000/);
  assert.match(monitor,/Serververbindung verzögert/);
  assert.match(monitor,/severity: Number\(d\.status\) >= 500 \? "ERROR" : "WARN"/);
  assert.match(network,/timeoutMs = 12_000/);
});


test("session bootstrap recovers without requiring a manual Ctrl+R", async()=>{
  const app=await source("src/App.jsx");
  const main=await source("src/main.jsx");
  assert.match(app,/bootstrapRetry = useRef/);
  assert.match(app,/bootstrapRetry\.current\.count < 3/);
  assert.match(app,/addEventListener\("pageshow", handlePageShow\)/);
  assert.match(app,/visibilitychange/);
  assert.match(app,/15000/);
  assert.match(main,/ec-app-shell-build/);
  assert.match(main,/getRegistrations\(\)/);
  assert.match(main,/url\.searchParams\.get\(reloadParam\) === buildId/);
});


test("Community hub keeps readable desktop and mobile layout", async()=>{
  const main=await source("src/main.jsx");
  const css=await source("src/community-hub-final.css");
  assert.ok(main.includes('import "./community-hub-final.css";'));
  assert.match(css,/\.community-section-links\{/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.community-hub-layout\{/);
  assert.match(css,/minmax\(320px,\.95fr\)/);
  assert.match(css,/\.hub-row:not\(:has\(>img\)\)>div/);
  assert.match(css,/justify-self:start/);
  assert.match(css,/@media\(max-width:760px\)/);
});


test("secondary tools stay inside Community instead of crowding primary navigation", async()=>{
  const app=await source("src/App.jsx");
  const support=await source("src/community-support-verification.js");
  const rules=await source("src/community-rules-runtime.js");
  const reels=await source("src/community-reels.js");
  for(const label of ["Reels","Regeln","Support"]) assert.ok(app.includes(`<b>${label}</b>`));
  assert.match(app,/ec:open-rules/);
  assert.match(app,/ec:open-support/);
  assert.match(app,/page:"reels"/);
  assert.doesNotMatch(support,/ensureSupportNav/);
  assert.doesNotMatch(rules,/insertBefore\(button/);
  assert.doesNotMatch(reels,/insertBefore\(button/);
});

test("dashboard utility shortcuts remain icon-only", async()=>{
  const css=await source("src/admin-central-hub.css");
  assert.match(css,/ec-dashboard-utility-button>\.ec-compact-menu-label[\s\S]*display:none!important/);
});


test("native regional-shell handlers remain authoritative for navigation", async()=>{
  const ui=await source("src/ui-requested-fixes.js");
  const shell=await source("src/regional-shell.js");
  const deferred=await source("src/deferred-admin-enhancements.js");
  assert.doesNotMatch(ui,/react-navigation-bridge\.js/);
  assert.match(shell,/document\.querySelector\(\`\[data-ec-detail=/);
  assert.doesNotMatch(deferred,/regional-admin-tools-bridge\.js/);
});

test("app waits for stale service-worker cleanup before React bootstrap", async()=>{
  const main=await source("src/main.jsx");
  assert.match(main,/async function bootstrap\(\)/);
  assert.match(main,/await removeLegacyAppShellOnce\(\)/);
  assert.match(main,/if \(reloading\) return/);
  assert.match(main,/ec-app-shell-build/);
  assert.match(main,/return true/);
});


test("touch and narrow layouts no longer force a clipped desktop canvas", async()=>{
  const touch=await source("src/touch-desktop-stability.css");
  const nav=await source("src/navigation-cleanup-final.css");
  const dashboard=await source("src/personal-dashboard-final-fix.js");
  assert.doesNotMatch(touch,/min-width:\s*1180px/);
  assert.match(nav,/@media\(max-width:1050px\)/);
  assert.match(nav,/transform:translateX\(105%\)!important/);
  assert.match(nav,/\.ec-dock-open \.ec-right-dock/);
  assert.match(dashboard,/max-width:1050px/);
});


test("Admin Forum opens the host rendered by Admin Central", async()=>{
  const hub=await source("src/admin-central-hub.js");
  assert.match(hub,/class="ec-admin-hub-forum-host"/);
  assert.match(hub,/querySelector\?\.\('\.ec-admin-hub-forum-host'\)/);
  assert.doesNotMatch(hub,/querySelector\('\.ec-admin-forum-host'\)/);
});


test("Admin Forum visibility toggles never write to a missing node", async()=>{
  const hub=await source("src/admin-central-hub.js");
  assert.match(hub,/if \(!host \|\| !gridEl\) return/);
});

test("capture-phase lightweight dashboard navigation is not loaded", async()=>{
  const html=await source("index.html");
  assert.doesNotMatch(html,/lightweight-dashboard-nav\.js/);
  assert.match(html,/content="width=1180"/);
  assert.doesNotMatch(html,/width=device-width/);
});


test("municipality accounts have a dedicated protected role and regional management rights", async()=>{
  const sql=await source("supabase/migrations/20260922123000_municipality_account_role.sql");
  const protection=await source("supabase/migrations/20260922124500_municipality_role_protection.sql");
  assert.match(sql,/alter type public\.user_role add value if not exists 'MUNICIPALITY'/);
  assert.match(sql,/new_role not in \('MEMBER','SUPPORTER','ADMIN','MUNICIPALITY'\)/);
  assert.match(sql,/upper\(p\.role::text\) = 'MUNICIPALITY'/);
  assert.match(sql,/p\.home_region_id = p_region_id/);
  assert.match(protection,/HEAD_ADMIN','ADMIN','MUNICIPALITY/);
});

test("municipality accounts render green identity and immediate login benefits", async()=>{
  const app=await source("src/App.jsx");
  const card=await source("src/MemberCardView.jsx");
  const identity=await source("src/roleIdentity.js");
  const css=await source("src/municipality-role.css");
  const main=await source("src/main.jsx");
  assert.match(card,/role === "MUNICIPALITY"/);
  assert.match(card,/role-star-green\.svg/);
  assert.match(identity,/label:"Gemeinde"/);
  assert.match(app,/function MunicipalityWelcome/);
  assert.match(app,/Offizielle Hinweise veröffentlichen/);
  assert.match(app,/Bürgeranliegen bearbeiten/);
  assert.match(app,/Gemeindebereich öffnen/);
  assert.match(css,/role-theme-municipality/);
  assert.match(css,/--ec-municipality-green/);
  assert.ok(main.indexOf('import "./municipality-role.css";') > main.indexOf('import "./member-card-exact-authority.css";'));
});

test("municipality area includes navigation, introduction and official management cockpit", async()=>{
  const app=await source("src/App.jsx");
  const module=await source("src/municipality-module.js");
  const css=await source("src/municipality-module.css");
  assert.match(app,/municipality: "municipality"/);
  assert.match(app,/page === "municipality"/);
  assert.match(module,/GEMEINDE & SERVICE · EINFÜHRUNG/);
  assert.match(module,/Offizielle Informationen und Bürgeranliegen/);
  assert.match(module,/Willkommen im offiziellen Gemeindebereich/);
  assert.match(module,/requestAnimationFrame\(\(\)=>void render\(\)\)/);
  assert.match(module,/GEMEINDE-COCKPIT/);
  assert.match(module,/ec_municipality_save_profile/);
  assert.match(module,/Gemeindeprofil & Kontaktdaten bearbeiten/);
  assert.match(module,/ec-municipality-profile-form/);
  assert.match(css,/ec-municipality-intro/);
  assert.match(css,/ec-municipality-cockpit/);
  assert.match(css,/ec-municipality-profile-settings/);
});

test("Head Admin can assign and filter municipality accounts", async()=>{
  const manager=await source("src/admin-role-manager.js");
  assert.match(manager,/MUNICIPALITY_STAR/);
  assert.match(manager,/<option value="MUNICIPALITY">Gemeinde<\/option>/);
  assert.match(manager,/\['municipality','Gemeinden'\]/);
  assert.match(manager,/new_role:'MUNICIPALITY'|MUNICIPALITY/);
});


test("regional shell base layout CSS is loaded before final navigation authority", async()=>{
  const main=await source("src/main.jsx");
  assert.match(main,/import "\.\/regional-shell\.css";\s*import "\.\/regional-shell\.js";/);
  assert.ok(main.indexOf('import "./regional-shell.css";') < main.indexOf('import "./navigation-cleanup-final.css";'));
});


test("layout integrity must not reset regional shell positioning", async()=>{
  const css=await source("src/layout-integrity-final.css");
  assert.doesNotMatch(css,/\.ec-brand-masthead,\.ec-top-nav,\.ec-region-picker,\.ec-dock-toggle\{position:relative/);
  assert.match(css,/\.ec-brand-masthead,\.ec-top-nav,\.ec-region-picker,\.ec-dock-toggle\{z-index:300\}/);
});


test("app shell cleanup is versioned by the deployed bundle", async()=>{
  const main=await source("src/main.jsx");
  assert.match(main,/const buildId = new URL\(import\.meta\.url\)\.pathname/);
  assert.match(main,/const cleanupKey = "ec-app-shell-build"/);
  assert.match(main,/navigator\.serviceWorker\?\.controller/);
  assert.match(main,/window\.location\.replace\(url\.toString\(\)\)/);
  assert.doesNotMatch(main,/ec-legacy-cache-cleanup-v9/);
  assert.doesNotMatch(main,/ec-legacy-sw-reload-v9/);
});


test("personal area role pin supports municipality", async()=>{
  const code=await source("src/sidebar-role-pin.js");
  assert.match(code,/municipality:'\/role-star-green\.svg'/);
  assert.match(code,/if\(base==='MUNICIPALITY'\)return'municipality'/);
});


test("municipality page stays below the fixed regional shell", async()=>{
  const css=await source("src/municipality-module.css");
  assert.match(css,/body\.ec-municipality-open \.modern-main\{\s*padding-top:var\(--ec-page-top,154px\)!important;/);
  assert.match(css,/body\.ec-municipality-open \.ec-municipality-page[\s\S]*margin-top:0!important;/);
  assert.match(css,/@media\(max-width:1050px\)[\s\S]*body\.ec-municipality-open \.modern-main\{padding-top:128px!important\}/);
});


test("final regional header geometry keeps brand and picker inside viewport", async()=>{
  const css=await source("src/navigation-cleanup-final.css");
  assert.match(css,/\.ec-brand-masthead\{[\s\S]*height:72px!important/);
  assert.match(css,/\.ec-brand-masthead \.ec-brand-logo\{[\s\S]*min-width:380px!important/);
  assert.match(css,/\.ec-top-nav\{[\s\S]*top:72px!important[\s\S]*height:56px!important/);
  assert.match(css,/\.ec-top-nav \.ec-region-picker\{[\s\S]*max-width:250px!important[\s\S]*margin-left:auto!important/);
});


test("native member directory owns region filtering without shell hiding cards", async()=>{
  const shell=await source("src/regional-shell.js");
  assert.match(shell,/if\(card\.closest\('\.native-members-directory'\)\)card\.hidden=false/);
  assert.doesNotMatch(shell,/card\.hidden=!searching&&p\.home_region_id!==activeRegion\.id/);
});

test("online friends use municipality role star", async()=>{
  const dash=await source("src/dashboard-top-polish.js");
  assert.match(dash,/const MUNICIPALITY_STAR='\/role-star-green\.svg'/);
  assert.match(dash,/if\(role\(p\)==='MUNICIPALITY'\)return MUNICIPALITY_STAR/);
});


test("community event image field uses a direct-child DOM anchor", async()=>{
  const app=await source("src/App.jsx");
  assert.match(app,/const directAction = \[\.\.\.eventForm\.children\]/);
  assert.match(app,/directAction\?\.parentElement === eventForm/);
  assert.match(app,/else if \(eventForm\.isConnected\) eventForm\.appendChild\(label\)/);
  assert.doesNotMatch(app,/eventForm\.insertBefore\(label, eventForm\.querySelector\("button"\)\)/);
});


test("dock admin shortcuts stay icon-only", async()=>{
  const css=await source("src/navigation-cleanup-final.css");
  assert.match(css,/FINAL ADMIN SHORTCUT ICON-ONLY/);
  assert.match(css,/\.ec-admin-primary-shortcut \.ec-compact-menu-label[\s\S]*display:none!important/);
  assert.match(css,/\[data-ec-admin-central-hub="1"\] \.ec-compact-menu-label[\s\S]*display:none!important/);
});


test("today-in-region dashboard exposes six live regional signals", async()=>{
  const base=await source("src/home-multi-region-clarity-base.js");
  const live=await source("src/home-today-live.js");
  const loader=await source("src/home-multi-region-clarity.js");
  const css=await source("src/home-multi-region-clarity.css");

  for(const kind of ["municipality","events","requests","members","forum","business"]){
    assert.match(base,new RegExp('data-ec-today-kind="'+kind+'"'));
  }
  assert.match(loader,/home-today-live\.js/);
  assert.match(live,/municipality_notices/);
  assert.match(live,/community_events/);
  assert.match(live,/community_requests/);
  assert.match(live,/forum_posts/);
  assert.match(live,/business_listings/);
  assert.match(live,/profiles/);
  assert.match(css,/\.ec-today-count/);
  assert.match(css,/grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
});


test("weekly regional recap summarizes live signals", async()=>{
  const base=await source("src/home-multi-region-clarity-base.js");
  const live=await source("src/home-today-live.js");
  const css=await source("src/home-multi-region-clarity.css");
  assert.match(base,/ec-weekly-region-recap/);
  assert.match(base,/DIESE WOCHE/);
  assert.match(live,/function renderWeeklyRecap/);
  assert.match(live,/renderWeeklyRecap\(region,\{municipality,events,requests,members,forum,business\}\)/);
  assert.match(css,/\.ec-weekly-region-recap/);
});


test("seven-day new member journey tracks four starter tasks", async()=>{
  const journey=await source("src/home-new-member-journey.js");
  const loader=await source("src/home-multi-region-clarity.js");
  const css=await source("src/home-multi-region-clarity.css");
  assert.match(loader,/home-new-member-journey\.js/);
  assert.match(journey,/SEVEN_DAYS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(journey,/Profil persönlich machen/);
  assert.match(journey,/Erste Gruppe finden/);
  assert.match(journey,/Ein erstes Servus schreiben/);
  assert.match(journey,/Ersten Kontakt knüpfen/);
  assert.match(journey,/community_group_members/);
  assert.match(journey,/forum_posts/);
  assert.match(journey,/friendships/);
  assert.match(css,/\.ec-starter-task/);
  assert.match(css,/ec-starter-progress/);
});
