import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("../", import.meta.url);
const SOURCE_EXTS = new Set([".js",".jsx",".css",".html"]);
const ASSET_RE = /(?:src=|href=|url\(|["'`])\s*["']?(\/[A-Za-z0-9._\/-]+\.(?:svg|png|jpe?g|webp|ico))(?:\?[^"'\s)]*)?/gi;

async function walk(dir) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await walk(path));
    else if (SOURCE_EXTS.has(extname(entry.name))) rows.push(path);
  }
  return rows;
}

test("all local icon and image references resolve to public assets", async () => {
  const rootPath = decodeURIComponent(ROOT.pathname);
  const files = [...await walk(join(rootPath, "src")), join(rootPath, "index.html")];
  const refs = new Set();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(ASSET_RE)) refs.add(match[1]);
  }
  const missing = [];
  for (const ref of refs) {
    try { await access(join(rootPath, "public", ref.slice(1))); }
    catch { missing.push(ref); }
  }
  assert.deepEqual(missing, [], `Missing public assets: ${missing.join(", ")}`);
});

test("member cards navigate immediately and refresh profile data after navigation", async () => {
  const rootPath = decodeURIComponent(ROOT.pathname);
  const card = await readFile(join(rootPath, "src/MemberCardView.jsx"), "utf8");
  const app = await readFile(join(rootPath, "src/App.jsx"), "utf8");
  assert.doesNotMatch(card, /loadMemberProfile/);
  assert.match(card, /if \(onOpen\) onOpen\(member\)/);
  assert.match(app, /setPage\("member-profile"\); void loadMemberProfile\(m\)/);
});

test("regional shell uses one navigation dispatch instead of synthetic fallback clicks", async () => {
  const rootPath = decodeURIComponent(ROOT.pathname);
  const shell = await readFile(join(rootPath, "src/regional-shell.js"), "utf8");
  const body = shell.match(/function clickPage\(page\)\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(body, /ec:navigate/);
  assert.doesNotMatch(body, /querySelectorAll\('button,a'\)/);
});

test("navigation does not use placeholder or javascript links", async () => {
  const rootPath = decodeURIComponent(ROOT.pathname);
  const files = [...await walk(join(rootPath, "src")), join(rootPath, "index.html")];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /href\s*=\s*["']#["']/i, file);
    assert.doesNotMatch(source, /href\s*=\s*["']javascript:/i, file);
  }
});
