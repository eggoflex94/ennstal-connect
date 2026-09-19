import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop avatar picker and alignment button are separate interactive controls", async () => {
  const app = await source("src/App.jsx");
  assert.ok(app.includes('<div className="profile-upload-field profile-upload-field-avatar">'));
  assert.ok(app.includes('className="profile-avatar-file-input"'));
  assert.ok(app.includes('>Profilbild ausrichten</button>'));
  assert.ok(!app.includes('<label className="profile-upload-field profile-upload-field-avatar">'));
});

test("existing profile photo alignment downloads from Storage", async () => {
  const app = await source("src/App.jsx");
  assert.ok(app.includes('storage.from("profile-avatars").download(existingPath)'));
  assert.ok(app.includes('storagePathFromPublicUrl(profile.avatar_url)'));
});

test("realigned profile photos are saved to a fresh Storage path", async () => {
  const app = await source("src/App.jsx");
  assert.ok(app.includes('const newPath = `${user.id}/${crypto.randomUUID()}.${extension}`;'));
  assert.ok(app.includes('upsert: false'));
  assert.ok(app.includes('getPublicUrl(newPath)'));
  assert.ok(app.includes('remove([oldPath])'));
});
