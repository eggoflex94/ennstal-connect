import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile profile photo picker accepts phone image formats and resets same-file selection", async () => {
  const app = await source("src/App.jsx");
  assert.match(app, /accept="image\/\*,\.heic,\.heif"/);
  assert.match(app, /e\.currentTarget\.value = ""/);
  assert.match(app, /25 \* 1024 \* 1024/);
  assert.match(app, /heic\|heif\|avif/);
});

test("mobile avatar file input remains natively interactive", async () => {
  const css = await source("src/file-upload-authority.css");
  assert.match(css, /\.profile-avatar-file-input/);
  assert.match(css, /pointer-events:auto!important/);
  assert.match(css, /min-height:52px!important/);
  assert.match(css, /font-size:16px!important/);
});

test("profile photo editor surfaces image decode errors", async () => {
  const editor = await source("src/ProfilePhotoEditor.jsx");
  assert.match(editor, /loadError/);
  assert.match(editor, /Bild kann nicht geöffnet werden/);
  assert.match(editor, /speichere es auf dem Handy als JPG\/PNG/);
});
