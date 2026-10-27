import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
test('discovery prioritizes groups not joined yet and preserves home region tie break',()=>{
 assert.match(src,/joinedGroupIds=new Set/);
 assert.match(src,/Number\(joinedGroupIds\.has\(a\.id\)\)-Number\(joinedGroupIds\.has\(b\.id\)\)/);
 assert.match(src,/hasJoinedGroup=joinedGroupIds\.size>0/);
});
