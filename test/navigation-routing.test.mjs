import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("events navigation keeps the events route and active state", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const nav = await readFile(new URL("../src/top-nav-active-sync.js", import.meta.url), "utf8");

  assert.match(
    app,
    /community:\s*"community",\s*events:\s*"events",/,
    "ec:navigate must keep Events on the events page"
  );

  assert.match(
    nav,
    /saved==='events'\?'events':'community'/,
    "community hub DOM inference must preserve the Events active state"
  );
});
