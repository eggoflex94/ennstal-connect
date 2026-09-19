import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("profile role typography matches function typography", async () => {
  const css = await source("src/member-profile-final.css");
  assert.match(css, /\.ec-mp-function-role strong\{font-size:1rem!important;line-height:1\.25!important;font-weight:800!important;letter-spacing:0!important;text-transform:none!important;opacity:1!important;color:#fff!important\}/);
  assert.doesNotMatch(css, /\.ec-mp-function>span:first-child/);
});
