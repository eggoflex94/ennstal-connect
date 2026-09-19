import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("unified profile admin tools are wired and expose direct-message policy to Head Admin", async () => {
  const main = await source("src/main.jsx");
  const runtime = await source("src/profile-admin-tools-runtime.js");
  assert.match(main, /import "\.\/profile-admin-tools-unified\.js";/);
  assert.match(runtime, /direct-message-policy/);
  assert.match(runtime, /head_admin_get_direct_message_policy/);
  assert.match(runtime, /head_admin_set_direct_message_policy/);
  assert.match(runtime, /Direktnachrichten verwalten/);
});

test("official account auto replies render as automated messages", async () => {
  const legacy = await source("src/automated-message-modern.js");
  const modern = await source("src/chat-modern-final.js");
  assert.match(legacy, /nicht für direktnachrichten verwendet/i);
  assert.match(modern, /"AUTO_REPLY"/);
});

test("profile admin modal participates in global overlay stacking authority", async () => {
  const css = await source("src/layout-integrity-final.css");
  assert.match(css, /\.ec-profile-admin-overlay/);
  assert.match(css, /\.ec-profile-admin-modal/);
  assert.match(css, /z-index:20000!important/);
});
