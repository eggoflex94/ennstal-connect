import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBlock,moveBlock,blockKey} from '../src/operatorPageDesign.js';
import {resolvePreviewTarget} from '../src/memberHoverPreview.js';

test('page styles clamp sizes and reject arbitrary CSS, markup and invalid colors',()=>{
 const value=normalizeBlock({width:1000,minHeight:-40,fontSize:900,color:'url(javascript:bad)',fontFamily:'evil',align:'bad',title:'<b>Title</b>',text:'<script>evil()</script>'});
 assert.equal(value.width,100);assert.equal(value.minHeight,0);assert.equal(value.fontSize,48);
 assert.equal(value.color,'#293746');assert.equal(value.fontFamily,'system');assert.equal(value.align,'left');
 assert.equal(value.text,'<script>evil()</script>','rendered as textContent, never HTML');
});
test('moving a section changes only its sibling order and persists deterministic indices',()=>{
 const initial=[{key:'one',order:0},{key:'two',order:1},{key:'three',order:2}];
 assert.deepEqual(moveBlock(initial,'two',-1).map(b=>b.key),['two','one','three']);
 assert.deepEqual(moveBlock(initial,'two',1).map(b=>b.order),[0,1,2]);
 assert.deepEqual(initial.map(b=>b.key),['one','two','three']);
});
test('page block identity survives text changes and editor highlighting',()=>{
 const node={dataset:{},id:'',tagName:'SECTION',classList:['panel','ec-design-selected']};
 assert.equal(blockKey(node,0),'section:panel:0');node.dataset.pageBlock='custom:persisted';
 assert.equal(blockKey(node,4),'custom:persisted');
});
test('support nickname triggers resolve the exact person even outside the loaded directory',()=>{
 const owner={dataset:{memberPreviewId:'contact-id'}};
 const name={textContent:'egga',closest:selector=>selector.includes('ec-member-hover-preview')?null:owner};
 const eventTarget={closest:selector=>{assert.ok(selector.includes('.ec-team-name'));return name;}};
 assert.equal(resolvePreviewTarget(eventTarget,[]).member.id,'contact-id');
});
