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
  assert.match(editor, /applyPan\(nextX, nextY\)/);
  assert.match(editor, /setX\(clampPanX\(nextX\)\)/);
  assert.match(editor, /setY\(clampPanY\(nextY\)\)/);
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
  assert.match(editor, /const PAN_X_LIMIT = 120/);
  assert.match(editor, /const PAN_Y_UP_LIMIT = 260/);
  assert.match(editor, /const PAN_Y_DOWN_LIMIT = 160/);
  assert.match(editor, /min=\{-PAN_Y_UP_LIMIT\} max=\{PAN_Y_DOWN_LIMIT\}/);
  assert.match(editor, /clampPanY/);
});





test("profile photo editor keeps panning independent from zoom", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.doesNotMatch(editor, /minimumZoomForPan/);
  assert.match(editor, /const applyPan =/);
  assert.doesNotMatch(editor, /setZoom\(\(current\) => Math\.max\(current, requiredZoom\)\)/);
  assert.match(editor, /applyPan\(nextX, nextY\)/);
  assert.match(editor, /applyPan\(Number\(e\.target\.value\), y\)/);
  assert.match(editor, /applyPan\(x, Number\(e\.target\.value\)\)/);
});

test("profile photo editor keeps expanded vertical range", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /PAN_Y_UP_LIMIT = 260/);
  assert.match(editor, /PAN_Y_DOWN_LIMIT = 160/);
  assert.match(editor, /min=\{-PAN_Y_UP_LIMIT\} max=\{PAN_Y_DOWN_LIMIT\}/);
  assert.match(editor, /\* 300/);
});


test("profile photo zoom-out never exposes a flat white or light canvas background", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /function drawSoftBackdrop/);
  assert.match(editor, /backdropScale = coverScale \* 1\.12/);
  assert.match(editor, /drawSoftBackdrop\(ctx, source, rotation, size, coverScale\)/);
  assert.doesNotMatch(editor, /fillStyle = "#f3f6f8"/);
});


test("whole photo mode always shows the complete image without white letterboxing", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /if \(mode === "contain"\)/);
  assert.match(editor, /const scale = containScale;/);
  assert.match(editor, /Zoom\/pan are intentionally ignored here/);
  assert.match(editor, /brightness\(\.56\) saturate\(1\.12\)/);
  assert.match(editor, /fillStyle = "rgba\(10, 24, 36, 0\.22\)"/);
  assert.match(editor, /Das komplette Foto wird zentriert und ohne Zuschnitt angezeigt/);
});


test("whole photo mode keeps full image visible while allowing vertical positioning", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /const scale = containScale \* 0\.88/);
  assert.match(editor, /const freeY = Math\.max\(0, \(size - renderedH\) \/ 2\)/);
  assert.match(editor, /const offsetY = .*\* freeY/);
  assert.match(editor, /<span>Oben \/ unten<\/span>/);
  assert.match(editor, /onChange=\{e => applyPan\(x, Number\(e\.target\.value\)\)\}/);
});
