import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Community Photographer badge is shown on member cards", async () => {
  const card = await source("src/MemberCardView.jsx");
  assert.match(card, /is_community_photographer/);
  assert.match(card, /community-photographer-camera\.svg/);
  assert.match(card, /ec-card-badge-photographer/);
});

test("Photos navigation is wired into shell and App", async () => {
  const shell = await source("src/regional-shell.js");
  const app = await source("src/App.jsx");
  assert.match(shell, /\['📷','Fotos','photos'\]/);
  assert.match(app, /photos: "photos"/);
  assert.match(app, /page === "photos"/);
  assert.match(app, /<EventPhotosPage/);
});

test("Head Admin tools expose global and regional photographer assignment", async () => {
  const runtime = await source("src/profile-admin-tools-runtime.js");
  assert.match(runtime, /Community-Fotograf/);
  assert.match(runtime, /photographer-global/);
  assert.match(runtime, /photographer-regional/);
  assert.match(runtime, /set_community_photographer_assignment/);
  assert.match(runtime, /photographer-manager-right/);
  assert.match(runtime, /head_admin_set_photographer_manager/);
});

test("event photo upload optimizes and watermarks before Storage upload", async () => {
  const photos = await source("src/EventPhotosPage.jsx");
  assert.match(photos, /MAX_EDGE = 2200/);
  assert.match(photos, /MAX_UPLOAD_BYTES = 5\.5 \* 1024 \* 1024/);
  assert.match(photos, /canvas\.toBlob/);
  assert.match(photos, /globalAlpha = 0\.28/);
  assert.match(photos, /ennstal-connect-wordmark\.svg/);
  assert.match(photos, /storage\.from\("event-photos"\)\.upload/);
  assert.match(photos, /cacheControl: "31536000"/);
  assert.match(photos, /loading="lazy"/);
});

test("event photo gallery includes like, comment, report, edit and delete interactions", async () => {
  const photos = await source("src/EventPhotosPage.jsx");
  assert.match(photos, /event_photo_likes/);
  assert.match(photos, /event_photo_comments/);
  assert.match(photos, /event_photo_reports/);
  assert.match(photos, /editCaption/);
  assert.match(photos, /deletePhoto/);
});

test("database migration restricts photographer upload scope and Storage paths", async () => {
  const migration = await source("supabase/migrations/20260919173000_community_event_photographers.sql");
  assert.match(migration, /can_upload_event_photo/);
  assert.match(migration, /scope='GLOBAL'/);
  assert.match(migration, /scope='REGIONAL'/);
  assert.match(migration, /bucket_id='event-photos'/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(migration, /revoke insert on public\.event_photos from authenticated, anon/);
});
