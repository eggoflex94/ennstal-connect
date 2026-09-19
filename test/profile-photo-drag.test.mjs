import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("profile photo editor supports direct drag positioning", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /onPointerDown=\{startDrag\}/);
  assert.match(editor, /onPointerMove=\{moveDrag\}/);
  assert.match(editor, /onPointerUp=\{endDrag\}/);
  assert.match(editor, /setPointerCapture/);
  assert.match(editor, /releasePointerCapture/);
  assert.match(editor, /setX\(clampPan/);
  assert.match(editor, /setY\(clampPan/);
});

test("profile photo drag blocks page scrolling on touch devices", async () => {
  const css = await source("src/ProfilePhotoEditor.css");
  assert.match(css, /\.ec-photo-editor-preview\.is-draggable/);
  assert.match(css, /touch-action:none/);
  assert.match(css, /cursor:grab/);
  assert.match(css, /cursor:grabbing/);
});


test("profile photo editor allows extended vertical positioning", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /const PAN_LIMIT = 120/);
  assert.match(editor, /min=\{-PAN_LIMIT\} max=\{PAN_LIMIT\}/);
  assert.match(editor, /Math\.max\(-PAN_LIMIT, Math\.min\(PAN_LIMIT, value\)\)/);
  assert.match(editor, /\* 150/);
});


test("profile photo editor adds adaptive zoom instead of clamping pan", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /requiredRenderedW/);
  assert.match(editor, /requiredRenderedH/);
  assert.match(editor, /adaptiveScale/);
  assert.match(editor, /baseScale \* adaptiveScale/);
  assert.match(editor, /\(y \/ PAN_LIMIT\) \* size \* 0\.34/);
});


test("profile photo editor gives extra upward range", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /PAN_Y_UP_LIMIT = 260/);
  assert.match(editor, /PAN_Y_DOWN_LIMIT = 160/);
  assert.match(editor, /min=\{-PAN_Y_UP_LIMIT\} max=\{PAN_Y_DOWN_LIMIT\}/);
  assert.match(editor, /\* 300/);
  assert.match(editor, /size \* 0\.56/);
});
