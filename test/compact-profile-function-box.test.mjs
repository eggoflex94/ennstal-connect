import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("profile function box is compact and content-sized", async () => {
  const css = await source("src/member-profile-final.css");
  assert.match(css, /width:fit-content!important/);
  assert.match(css, /padding:9px 12px!important/);
  assert.match(css, /gap:5px!important/);
  assert.match(css, /font-size:1rem!important/);
  assert.match(css, /width:20px!important/);
  assert.match(css, /height:20px!important/);
});
