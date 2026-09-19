import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("all profile role labels use the same final typography authority", async () => {
  const css = await source("src/member-profile-final.css");
  assert.match(css, /Final authority: every role\/function label uses the same typography/);
  assert.match(css, /font-size:1rem!important/);
  assert.match(css, /font-weight:800!important/);
  assert.match(css, /text-transform:none!important/);
  assert.match(css, /word-break:normal!important/);
  assert.match(css, /overflow-wrap:normal!important/);
  assert.match(css, /hyphens:none!important/);
});
