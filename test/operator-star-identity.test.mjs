import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/roleIdentity.js',import.meta.url),'utf8');
const contacts=readFileSync(new URL('../src/support-contacts-modern.js',import.meta.url),'utf8');
test('shared role identity uses operator star for head admin only',()=>{assert.match(src,/role === "HEAD_ADMIN".*operator-star-gold.svg/);assert.match(src,/role === "ADMIN".*role-star-red.svg/);assert.match(contacts,/makeRoleIcon\(profile/);});
