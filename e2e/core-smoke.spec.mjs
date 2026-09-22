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

async function installSupabaseMock(page, role) {
  const profile = profileFor(role);
  const secondaryMember = otherMember();
  const members = [profile, secondaryMember];
  const rpcCalls = [];
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
      if (fn === "admin_get_permissions") return json({});
      if (fn === "prepare_privileged_action") return json({});
      if (fn === "admin_set_role") return json(null);
      return json([]);
    }

    if (path === "/rest/v1/profiles") {
      const idFilter = url.searchParams.get("id") || "";
      const selected = idFilter.includes(OTHER_ID) ? secondaryMember : profile;
      return json(accept.includes("application/vnd.pgrst.object+json") ? selected : [selected]);
    }

    if (path === "/rest/v1/user_permissions") {
      return json(accept.includes("application/vnd.pgrst.object+json") ? {} : []);
    }

    if (path === "/rest/v1/community_rule_acceptances") {
      const accepted = { rules_version: "2026-09-05", accepted_at: nowIso() };
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

async function login(page, role = "MEMBER") {
  const mock = await installSupabaseMock(page, role);
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
  await expect(other.locator(".admin-member-card-actions")).toHaveCount(0);
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
