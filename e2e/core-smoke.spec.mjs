import { test, expect } from "@playwright/test";

const SUPABASE_ORIGIN = "https://eqfvhgiyrofjscvimvrc.supabase.co";
const REGION_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";

const nowIso = () => new Date().toISOString();

function profileFor(role) {
  const databaseRole = role === "REGIONAL_ADMIN" ? "SUPPORTER" : role;
  return {
    id: MEMBER_ID,
    nickname: role === "HEAD_ADMIN" ? "Smoke Hauptadmin" : role === "ADMIN" ? "Smoke Admin" : role === "REGIONAL_ADMIN" ? "Smoke Regionaladmin" : "Smoke Mitglied",
    first_name: "Smoke",
    last_name: "Test",
    role: databaseRole,
    is_primary_head_admin: role === "HEAD_ADMIN",
    account_status: "ACTIVE",
    account_badge: null,
    home_region_id: REGION_ID,
    home_region_slug: "ennstal",
    avatar_url: null,
    is_online: true,
    last_active_at: nowIso(),
    presence_device: "DESKTOP",
    hide_online_status: false,
    is_test_account: false,
    rules_accepted_at: nowIso(),
    district_code: "liezen",
    show_district: true,
    is_verified: true,
    privacy_settings: {}
  };
}

function otherMember() {
  return {
    id: OTHER_ID,
    nickname: "Zweites Mitglied",
    first_name: "Zweites",
    last_name: "Mitglied",
    role: "MEMBER",
    account_status: "ACTIVE",
    account_badge: null,
    home_region_id: REGION_ID,
    home_region_slug: "ennstal",
    avatar_url: null,
    is_online: false,
    last_active_at: nowIso(),
    hide_online_status: false,
    is_test_account: false,
    district_code: "liezen",
    show_district: true,
    privacy_settings: {}
  };
}

function jwt(userId, email) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: userId,
      email,
      role: "authenticated"
    }),
    "smoke-signature"
  ].join(".");
}

async function installSupabaseMock(page, role, options = {}) {
  const profile = profileFor(role);
  const secondaryMember = {...otherMember(),is_online:options.onlineFriend === true};
  const members = [profile, secondaryMember];
  const rpcCalls = [];
  const designRows = new Map();
  const email = role === "HEAD_ADMIN" ? "head-admin@example.test" : role === "ADMIN" ? "admin@example.test" : "member@example.test";
  const user = {
    id: MEMBER_ID,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: nowIso(),
    created_at: nowIso(),
    updated_at: nowIso(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {}
  };
  const accessToken = jwt(MEMBER_ID, email);

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const accept = request.headers()["accept"] || "";

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
          "access-control-allow-headers": "*"
        },
        body: ""
      });
    }

    const json = async (body, status = 200, headers = {}) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          ...headers
        },
        body: method === "HEAD" ? "" : JSON.stringify(body)
      });
    };

    if (path === "/auth/v1/token" && method === "POST") {
      return json({
        access_token: accessToken,
        refresh_token: "smoke-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user
      });
    }

    if (path === "/auth/v1/user") return json(user);
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });

    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = decodeURIComponent(path.split("/").pop());
      let body = null;
      try { body = request.postDataJSON(); } catch {}
      rpcCalls.push({ fn, body });
      if (["community_member_directory", "admin_full_member_directory", "admin_member_directory"].includes(fn)) {
        return json(members);
      }
      if(fn === "community_moderation_contacts") return json([{...profileFor("HEAD_ADMIN"),user_id:MEMBER_ID,responsibilities:["Gesamtverantwortung","Sicherheit"]}]);
      if(fn === "community_member_profile") return json(members.find(m=>m.id===body?.p_user)||null);
      if (fn === "community_activity_progress") {
        return json({
          score: 0,
          level: "Neu",
          next_score: 10,
          prestige: null,
          prestige_next_score: 300,
          red_unlocked: false,
          blue_unlocked: false,
          components: { online: 0 }
        });
      }
      if (fn === "member_notification_settings") {
        return json([{
          notify_message_popup: true,
          notify_friend_request_popup: true,
          notify_forum_reply_popup: true
        }]);
      }
      if (fn === "member_onboarding_status") {
        return json([{ completed: true }]);
      }
      if (fn === "record_online_time") return json({ rewards: 0 });
      if (fn === "my_admin_permissions") return json(role === "ADMIN" || role === "HEAD_ADMIN" ? { manage_members: true, manage_reports: true, manage_news: true, manage_community: true } : {});
      if (fn === "admin_get_permissions") return json({});
      if (fn === "prepare_privileged_action") return json({});
      if (fn === "admin_set_role") return json(null);
      return json([]);
    }

    if(path === "/rest/v1/operator_page_blocks") {
      const scope=(url.searchParams.get("page_key")||"").replace(/^eq\./,"");
      const region=(url.searchParams.get("region_key")||"").replace(/^eq\./,"");
      const key=(url.searchParams.get("block_key")||"").replace(/^eq\./,"");
      if(method==="POST"||method==="PATCH"){
        const input=request.postDataJSON();
        const row={...(designRows.get(`${scope}:${region}:${key}`)||{}),...input,page_key:input.page_key||scope,region_key:input.region_key||region,block_key:input.block_key||key,updated_at:nowIso(),updated_by:MEMBER_ID,editor_profile:profile};
        designRows.set(`${row.page_key}:${row.region_key}:${row.block_key}`,row);
        return json(accept.includes("application/vnd.pgrst.object+json")?row:[row]);
      }
      return json([...designRows.values()].filter(r=>(!scope||r.page_key===scope)&&(!region||r.region_key===region)));
    }
    if (path === "/rest/v1/profiles") {
      const idFilter = url.searchParams.get("id") || "";
      const selected = idFilter.includes(OTHER_ID) ? secondaryMember : profile;
      return json(accept.includes("application/vnd.pgrst.object+json") ? selected : idFilter ? [selected] : members);
    }

    if(path === "/rest/v1/friendships" && options.includeFriend) return json([{requester_id:MEMBER_ID,receiver_id:OTHER_ID,status:"ACCEPTED"}]);
    if (path === "/rest/v1/user_permissions") {
      return json(accept.includes("application/vnd.pgrst.object+json") ? {} : []);
    }

    if (path === "/rest/v1/community_rule_acceptances") {
      const accepted = { rules_version: "2026-10-10", accepted_at: nowIso() };
      return json(accept.includes("application/vnd.pgrst.object+json") ? accepted : [accepted]);
    }

    if (path === "/rest/v1/regions") {
      return json([{ id: REGION_ID, slug: "ennstal", name: "Ennstal", active: true, is_active: true }]);
    }

    if (path === "/rest/v1/regional_admin_assignments") {
      return json(role === "REGIONAL_ADMIN" ? [{ user_id: MEMBER_ID, region_id: REGION_ID, active: true }] : []);
    }

    if (path === "/rest/v1/regional_moderation_assignments") {
      return json([]);
    }

    if (path === "/rest/v1/notifications" && method === "HEAD") {
      return json([], 200, { "content-range": "*/0" });
    }

    if (path.startsWith("/rest/v1/")) {
      return json([], 200, { "content-range": "*/0" });
    }

    return json({});
  });
  return { rpcCalls };
}

async function login(page, role = "MEMBER", options = {}) {
  const mock = await installSupabaseMock(page, role, options);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  await page.locator('input[name="email"]').fill(role === "HEAD_ADMIN" ? "head-admin@example.test" : role === "ADMIN" ? "admin@example.test" : "member@example.test");
  await page.locator('input[name="password"]').fill("smoke-password");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.locator(".app")).toBeVisible();
  await expect(page.locator("button:visible").filter({ hasText: /Startseite/i }).first()).toBeVisible();
  await expect(page.locator(".app-recovery")).toHaveCount(0);
  return mock;
}

async function visibleButton(page, label) {
  return page.locator("button:visible").filter({ hasText: new RegExp(label, "i") }).first();
}

async function openPersonalDock(page) {
  const dock = page.locator(".ec-right-dock");
  if (await dock.isVisible()) return;
  const toggle = page.getByRole("button", { name: "Menü öffnen" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(dock).toBeVisible();
}

async function assertTopNavigationWorks(page, label) {
  const pageByLabel = {
    "Startseite": "home",
    "Mitglieder": "members",
    "Forum": "forum",
    "Gruppen": "groups",
    "Events": "events",
    "Fotos": "photos",
    "Neuigkeiten": "news",
    "Community": "community"
  };
  const target = pageByLabel[label];
  const button = target
    ? page.locator(`.ec-top-nav [data-ec-page="${target}"]`).first()
    : page.getByRole("button", { name: new RegExp(label, "i") }).first();
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  // The top navigation may be outside the viewport after prior page scrolling.
  // Scroll it into view before measuring actual hit targeting.
  await button.scrollIntoViewIfNeeded();
  const hit = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return { clickable: false, reason: "zero-size" };
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + Math.min(rect.width / 2, 20)));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const top = document.elementFromPoint(x, y);
    return {
      clickable: top === element || Boolean(top?.closest("button") === element),
      target: {
        tag: element.tagName,
        className: String(element.className || ""),
        text: String(element.textContent || "").trim(),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      },
      top: top ? {
        tag: top.tagName,
        className: String(top.className || ""),
        id: top.id || "",
        text: String(top.textContent || "").trim().slice(0, 160)
      } : null
    };
  });
  expect(hit.clickable, label + " must not be covered: " + JSON.stringify(hit)).toBe(true);
  await button.evaluate((element) => element.click());
  await expect(page.locator(".content-root")).toBeVisible();
  await expect(page.locator(".app-recovery")).toHaveCount(0);
}
async function assertDockNavigationWorks(page, label) {
  await openPersonalDock(page);
  const button = await visibleButton(page, label);
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator(".content-root")).toBeVisible();
  await expect(page.locator(".app-recovery")).toHaveCount(0);
}

test("member core functions remain visible and navigable", async ({ page }) => {
  await login(page, "MEMBER");

  for (const label of [
    "Startseite",
    "Mitglieder",
    "Forum",
    "Gruppen",
    "Events",
    "Community"
  ]) {
    await assertTopNavigationWorks(page, label);
  }

  await assertTopNavigationWorks(page, "Community");
  const communityLinks = page.locator(".community-section-links");
  await expect(communityLinks).toBeVisible();
  for (const label of ["Neuigkeiten", "Fotos", "Gemeinde & Service"]) {
    const button = communityLinks.getByRole("button", { name: new RegExp(label, "i") });
    await expect(button, label + " must stay reachable from Community").toBeVisible();
    await expect(button).toBeEnabled();
  }

  for (const label of ["Mein Profil", "Nachrichten", "Freunde", "Anfragen", "Blockiert"]) {
    await assertDockNavigationWorks(page, label);
  }

  await assertTopNavigationWorks(page, "Community");
  await expect(page.locator(".community-hub-grid")).toBeVisible();
});

test("head admin keeps all admin entry points visible and usable", async ({ page }) => {
  await login(page, "HEAD_ADMIN");

  await openPersonalDock(page);
  const adminEntry = page.locator('.ec-right-dock [data-ec-admin-central-hub="1"]');
  await expect(adminEntry).toHaveCount(1);
  await expect(adminEntry).toBeVisible();
  await adminEntry.click();

  const hub = page.getByRole("dialog", { name: "Admin-Zentrale" });
  await expect(hub).toBeVisible();
  await expect(hub.locator('[data-admin-hub-action="admin-log"]')).toBeVisible();
  await expect(hub.locator('[data-admin-hub-action="admin"]')).toBeVisible();
  await hub.locator('[data-admin-hub-action="admin"]').click();

  await expect(page.locator(".admin-page")).toBeVisible();
  await expect(page.locator(".app-recovery")).toHaveCount(0);

  const shortcuts = page.locator(".admin-dashboard-shortcuts");
  await expect(shortcuts).toBeVisible();
  for (const label of ["Mitglieder", "Meldungen", "Admin-Forum", "Community", "Neuigkeiten", "Kontoschutz"]) {
    const shortcut = shortcuts.locator(".admin-dashboard-action:visible").filter({ hasText: new RegExp(label, "i") }).first();
    await expect(shortcut).toBeVisible();
    await expect(shortcut).toBeEnabled();
  }

  const memberCard = page.locator(".admin-member-card").filter({ hasText: "Zweites Mitglied" }).first();
  await expect(memberCard).toBeVisible();
  await memberCard.locator(".admin-member-person-button").click();
  await expect(page.locator(".member-profile-page")).toBeVisible();

  const adminTools = page.getByRole("button", { name: /Admin Tools/i }).first();
  await expect(adminTools).toBeVisible();
});

test("public login and registration entry points stay visible", async ({ page }) => {
  await installSupabaseMock(page, "MEMBER");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();

  await page.getByRole("button", { name: /Noch kein Konto/ }).click();
  await expect(page.getByRole("heading", { name: "Registrieren" })).toBeVisible();
  await expect(page.locator('input[name="nickname"]')).toBeVisible();
  await expect(page.locator('select[name="home_region_slug"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Konto erstellen" })).toBeVisible();
});


const ROLE_VISIBILITY_MATRIX = {
  MEMBER: {
    top: ["Startseite", "Mitglieder", "Forum", "Gruppen", "Events", "Community"],
    dock: ["Mein Profil", "Nachrichten", "Freunde", "Anfragen", "Blockiert"],
    adminVisible: false
  },
  ADMIN: {
    top: ["Startseite", "Mitglieder", "Forum", "Gruppen", "Events", "Community"],
    dock: ["Mein Profil", "Nachrichten", "Freunde", "Anfragen", "Blockiert", "Admin-Zentrale"],
    adminVisible: true
  },
  REGIONAL_ADMIN: {
    top: ["Startseite", "Mitglieder", "Forum", "Gruppen", "Events", "Community"],
    dock: ["Mein Profil", "Nachrichten", "Freunde", "Anfragen", "Blockiert", "Admin-Zentrale"],
    adminVisible: true
  },
  HEAD_ADMIN: {
    top: ["Startseite", "Mitglieder", "Forum", "Gruppen", "Events", "Community"],
    dock: ["Mein Profil", "Nachrichten", "Freunde", "Anfragen", "Blockiert", "Admin-Zentrale"],
    adminVisible: true
  }
};

for (const [role, expected] of Object.entries(ROLE_VISIBILITY_MATRIX)) {
  test(`${role} keeps its complete visible function matrix`, async ({ page }) => {
    await login(page, role);

    for (const label of expected.top) {
      const pageByLabel = { "Startseite":"home", "Mitglieder":"members", "Forum":"forum", "Gruppen":"groups", "Events":"events", "Fotos":"photos", "Neuigkeiten":"news", "Community":"community" };
      const button = page.locator(`.ec-top-nav [data-ec-page="${pageByLabel[label]}"]`).first();
      await expect(button, `${role}: ${label} must stay visible in top navigation`).toBeVisible();
      await expect(button).toBeEnabled();
    }

    await openPersonalDock(page);
    for (const label of expected.dock) {
      const button = page.locator(".ec-right-dock button:visible").filter({ hasText: new RegExp(label, "i") }).first();
      await expect(button, `${role}: ${label} must stay visible in personal dock`).toBeVisible();
      await expect(button).toBeEnabled();
    }

    const adminEntry = page.locator('.ec-right-dock [data-ec-admin-central-hub="1"]');
    if (expected.adminVisible) {
      await expect(adminEntry).toHaveCount(1);
      await expect(adminEntry).toBeVisible();
      await expect(adminEntry).toHaveAttribute("aria-label", "Admin-Zentrale");
    } else {
      await expect(adminEntry).toHaveCount(0);
    }

    await expect(page.locator(".app-recovery")).toHaveCount(0);
  });
}

test("community admin sees one central hub and no head-admin-only areas", async ({ page }) => {
  await login(page, "ADMIN");
  await openPersonalDock(page);

  const adminEntry = page.locator('.ec-right-dock [data-ec-admin-central-hub="1"]');
  await expect(adminEntry).toHaveCount(1);
  await adminEntry.click();

  const hub = page.getByRole("dialog", { name: "Admin-Zentrale" });
  await expect(hub).toBeVisible();
  await expect(hub.locator('[data-admin-hub-action="admin"]')).toBeVisible();
  await expect(hub.locator('[data-admin-hub-action="admin-log"]')).toHaveCount(0);

  await hub.locator('[data-admin-hub-action="admin"]').click();
  await expect(page.locator(".admin-page")).toBeVisible();
  await expect(page.locator(".admin-member-card")).toHaveCount(2);

  const other = page.locator(".admin-member-card").filter({ hasText: "Zweites Mitglied" }).first();
  await expect(other).toBeVisible();
  // Community admins retain explicitly granted member-management actions.
  // Only head-admin-exclusive controls must be absent.
  await expect(other.locator(".admin-member-card-actions .head-admin")).toHaveCount(0);
  await expect(other.locator(".admin-member-card-actions .business-account-button")).toHaveCount(0);
  await expect(page.locator(".app-recovery")).toHaveCount(0);
});

test("regional admin sees only regional admin-center areas", async ({ page }) => {
  await login(page, "REGIONAL_ADMIN");
  await openPersonalDock(page);

  const adminEntry = page.locator('.ec-right-dock [data-ec-admin-central-hub="1"]');
  await expect(adminEntry).toHaveCount(1);
  await expect(adminEntry).toBeVisible();
  await adminEntry.click();

  const hub = page.getByRole("dialog", { name: "Admin-Zentrale" });
  await expect(hub).toBeVisible();
  for (const label of ["Admin-Forum", "Mitglieder", "Gruppen", "Neuigkeiten", "Community"]) {
    await expect(hub.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
  }
  await expect(hub.locator('[data-admin-hub-action="admin"]')).toHaveCount(0);
  await expect(hub.locator('[data-admin-hub-action="admin-log"]')).toHaveCount(0);
});


test("member cannot accidentally see admin navigation", async ({ page }) => {
  await login(page, "MEMBER");
  await openPersonalDock(page);
  await expect(page.locator(".ec-right-dock button:visible").filter({ hasText: /Admin-Zentrale/i })).toHaveCount(0);
  await expect(page.locator(".admin-page")).toHaveCount(0);
});

test("legal and rules pages remain visible from the footer", async ({ page }) => {
  await login(page, "MEMBER");

  for (const label of ["Impressum", "Datenschutz", "Community-Regeln"]) {
    const button = page.locator(".site-footer").getByRole("button", { name: label });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator(".content-root")).toBeVisible();
    await expect(page.locator(".app-recovery")).toHaveCount(0);
  }
});


test("head admin can open the automated error center from admin tools", async ({ page }) => {
  await login(page, "HEAD_ADMIN");

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ec:open-admin-tools")));
  await expect(page.getByRole("heading", { name: "Admin Tools" })).toBeVisible();

  const errorCenter = page.getByRole("button", { name: /Fehlerzentrale/i }).first();
  await expect(errorCenter).toBeVisible();
  await expect(errorCenter).toBeEnabled();
  await errorCenter.click();

  await expect(page.getByRole("heading", { name: "Fehlerzentrale" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Head Admin Fehlerzentrale" })).toBeVisible();
  await expect(page.locator(".app-recovery")).toHaveCount(0);
});


test("directory filters stay compact and legal links remain outside the desktop dock", async ({ page }) => {
  await login(page, "MEMBER");
  await assertTopNavigationWorks(page, "Mitglieder");
  const filters = page.locator('.native-member-search');
  await expect(filters).toBeVisible();
  for (const label of ['Nur online', 'Neu seit 30 Tagen']) {
    const checkbox = filters.getByRole('checkbox', { name: label });
    const box = await checkbox.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(24);
    expect(box?.height).toBeLessThanOrEqual(24);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if(overflow) console.log('OVERFLOW_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(n=>({tag:n.tagName,cls:n.className,rect:n.getBoundingClientRect().toJSON()})).filter(n=>n.rect.right>innerWidth+1||n.rect.left< -1).slice(-35))));
  expect(overflow).toBe(false);
  const footer = page.locator('.site-footer');
  await footer.scrollIntoViewIfNeeded();
  if (page.viewportSize().width > 900) {
    const footerBox = await footer.boundingBox();
    const dockBox = await page.locator('.ec-right-dock').boundingBox();
    if (dockBox) expect(footerBox.x + footerBox.width).toBeLessThanOrEqual(dockBox.x);
  }
  await expect(footer.getByRole('button', { name: 'Impressum', exact: true })).toBeVisible();
});

test("cover typography changes are reflected immediately in the live preview", async ({ page }) => {
  await login(page, "HEAD_ADMIN");
  await page.locator('.homepage-editor-toggle > summary').click();
  const editor = page.locator('.ec-magazine-editor');
  await expect(editor).toBeVisible();
  await editor.getByLabel('Überschrift', { exact: true }).fill('Live Cover Test');
  const preview = editor.locator('.ec-cover-live-preview');
  await expect(preview.getByRole('heading', { name: 'Live Cover Test' })).toBeVisible();
  const fontSize = editor.locator('.ec-cover-controls label').filter({ hasText: /^Schriftgröße/ }).locator('input');
  await fontSize.press('Home');
  await expect(fontSize).toHaveValue('24');
  const vertical = editor.locator('.ec-cover-controls label').filter({ hasText: /^Schrift oben \/ unten/ }).locator('input');
  await vertical.press('Home');
  await expect(vertical).toHaveValue('0');
  const headingSize = await preview.locator('h2').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  expect(headingSize).toBe(24);
  await expect(page.locator('.app-recovery')).toHaveCount(0);
});


test("operator can save a styled page block and see it after reload",async({page})=>{
 await login(page,"HEAD_ADMIN");
 await page.getByRole('button',{name:'✎ Seite gestalten',exact:true}).click();
 await page.getByRole('button',{name:'＋ Grauen Inhaltsrahmen hinzufügen',exact:true}).click();
 const inspector=page.locator('.ec-design-inspector');
 await inspector.getByLabel('Überschrift',{exact:true}).fill('Gespeicherter Testbereich');
 await inspector.getByLabel('Inhalt / Ergänzung',{exact:true}).fill('Dieser Text bleibt nach dem Neuladen erhalten.');
 await inspector.getByRole('button',{name:'Speichern & veröffentlichen',exact:true}).click();
 await expect(inspector.getByRole('status')).toContainText('Gespeichert und veröffentlicht.');
 await page.reload();
 await expect(page.locator('.ec-page-custom-block h2')).toHaveText('Gespeicherter Testbereich');
 await expect(page.locator('.ec-page-custom-block')).toContainText('Dieser Text bleibt nach dem Neuladen erhalten.');
 await expect(page.locator('.ec-page-custom-block .ec-content-edit-stamp')).toContainText('Smoke Hauptadmin');
});

test("support nickname opens and dismisses the member-card hover preview",async({page},testInfo)=>{
 test.skip(testInfo.project.name.includes('mobile'),'Hover requires a mouse');
 await login(page,"HEAD_ADMIN");
 await assertTopNavigationWorks(page,"Community");
 const name=page.locator('.ec-team-name').first();
 await expect(name).toBeVisible();await name.hover();
 await expect(page.locator('#ec-member-hover-preview .member-card')).toBeVisible();
 await page.mouse.move(1,1);
 await expect(page.locator('#ec-member-hover-preview')).toHaveCount(0);
});

test("ordinary member cannot see the operator page or contact editor",async({page})=>{
 await login(page,"MEMBER");
 await expect(page.locator('.ec-design-launch')).toHaveCount(0);
 await assertTopNavigationWorks(page,"Community");
 await expect(page.locator('.ec-team-edit')).toHaveCount(0);
});


test("online-friend nickname shows the card instead of the native tooltip",async({page},testInfo)=>{
 test.skip(testInfo.project.name.includes('mobile'),'Hover requires a mouse');
 await login(page,"MEMBER",{includeFriend:true,onlineFriend:true});
 await openPersonalDock(page);
 const nickname=page.locator('.ec-online-nickname').filter({hasText:'Zweites Mitglied'});
 await expect(nickname).toBeVisible({timeout:15000});
 await page.evaluate(()=>{
  window.__hoverDebug=[];const save=(event)=>{const n=event.target;window.__hoverDebug.push({type:event.type,tag:n?.tagName,cls:n?.className,x:event.clientX,y:event.clientY,sy:scrollY,rect:document.querySelector('.ec-online-nickname')?.getBoundingClientRect().toJSON(),hit:event.clientX!=null?document.elementFromPoint(event.clientX,event.clientY)?.className:null,match:n?.closest?.('[data-member-preview-id],.ec-online-nickname,.ec-online-friend-name')?.outerHTML?.slice(0,400),related:event.relatedTarget?.className});if(window.__hoverDebug.length>200)window.__hoverDebug.shift();};
  ['pointerover','pointerout','scroll','visibilitychange'].forEach(type=>document.addEventListener(type,save,true));
 });
 await page.evaluate(()=>{
  window.__scrollCalls=[];
  for(const [obj,key] of [[window,'scrollTo'],[Element.prototype,'scrollIntoView'],[HTMLElement.prototype,'focus']]){const original=obj[key];obj[key]=function(...args){window.__scrollCalls.push({key,args,cls:this.className,stack:new Error().stack});return original.apply(this,args);};}
 });
 await nickname.hover();
 try {await expect(page.locator('#ec-member-hover-preview .member-card')).toBeVisible();}
 catch(error){console.log('HOVER_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({calls:window.__scrollCalls,events:window.__hoverDebug,name:document.querySelector('.ec-online-nickname')?.outerHTML,ancestors:[...function*(n){while(n){yield n.className;n=n.parentElement;}}(document.querySelector('.ec-online-nickname'))]}))));throw error;}
 await expect(page.locator('.ec-online-friend').first()).not.toHaveAttribute('title');
 await page.mouse.move(1,1);await expect(page.locator('#ec-member-hover-preview')).toHaveCount(0);
});
test("offline friend with a recent timestamp is excluded from friends online",async({page})=>{
 await login(page,"MEMBER",{includeFriend:true,onlineFriend:false});await openPersonalDock(page);
 await expect(page.locator('.ec-online-friends-panel')).toBeVisible();
 await expect(page.locator('.ec-online-friend')).toHaveCount(0);
});
