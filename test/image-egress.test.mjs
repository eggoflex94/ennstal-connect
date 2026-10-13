import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { publicImageVariant } from '../src/imageDelivery.js';
import { fittedImageSize, prepareImageUpload } from '../src/prepareImageUpload.js';
const base = 'https://eqfvhgiyrofjscvimvrc.supabase.co/storage/v1/object/public/profile-avatars/test.jpg';

test('preview URLs use a bounded browser variant without paid server transforms', () => {
  assert.equal(new URL(publicImageVariant(base,200)).searchParams.get('ec_w'),'256');
  assert.equal(new URL(publicImageVariant(base,9000)).searchParams.get('ec_w'),'1920');
  for (const src of ['/role-star-red.svg','blob:local','https://other.test/photo.jpg',base.replace('/public/','/sign/')+'?token=secret',base+'?token=secret']) assert.equal(publicImageVariant(src,256),src);
  assert.ok(!publicImageVariant(base).includes('/render/image/'));
});

test('upload dimensions preserve aspect ratio, never enlarge, and GIFs stay animated', async () => {
  assert.deepEqual(fittedImageSize(4000,2000),{width:1920,height:960});
  assert.deepEqual(fittedImageSize(500,1000,1024),{width:500,height:1000});
  assert.throws(()=>fittedImageSize(0,2000));
  const gif = new File(['GIF89a'], 'animation.gif',{type:'image/gif'});
  assert.equal(await prepareImageUpload(gif),gif);
});

async function worker() {
  const callbacks = {}, data = new Map(); let calls = 0;
  const cache = {
    async match(key){return data.get(String(key.url || key))?.clone();},
    async put(key,response){data.set(String(key.url || key),response.clone());},
    async delete(key){return data.delete(String(key.url || key));},
    async keys(){return [...data.keys()].map(url=>new Request(url));}
  };
  const context = { URL,Headers,Request,Response,Map,Promise,Date,console,caches:{open:async()=>cache},fetch:async()=>{calls++;return new Response('image-data',{headers:{'content-type':'image/jpeg'}});},self:{addEventListener:(name,fn)=>callbacks[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}} };
  vm.runInNewContext(await readFile(new URL('../public/ec-public-image-cache.js',import.meta.url),'utf8'),context);
  return {
    get calls(){return calls;}, data, context,
    async request(url,options){let reply;const tasks=[];callbacks.fetch({request:new Request(url,options),respondWith:p=>{reply=p;},waitUntil:p=>tasks.push(p)});if(!reply)return null;const response=await reply;await Promise.all(tasks);return response;}
  };
}

test('public images are downloaded once and reused from the bounded local cache',async()=>{
  const runtime = await worker();
  assert.equal(await (await runtime.request(base)).text(),'image-data');
  assert.equal(await (await runtime.request(base)).text(),'image-data');
  assert.equal(runtime.calls,1);
  const cached = runtime.data.get(base);
  assert.equal(cached.headers.get('x-ec-bytes'),'10');
});

test('image cache never intercepts login, APIs, scripts, private files, uploads or videos',async()=>{
  const runtime = await worker();
  for(const url of ['https://ennstal-connect.com/','https://ennstal-connect.com/assets/app.js',base.replace('/public/','/sign/')+'?token=secret',base.replace('test.jpg','reel.mp4'),base+'?token=secret']) assert.equal(await runtime.request(url),null);
  assert.equal(await runtime.request(base,{method:'POST'}),null);
  assert.equal(await runtime.request(base,{headers:{Authorization:'Bearer private'}}),null);
  assert.equal(runtime.calls,0);
});

test('generated previews preserve aspect ratio, are cached, and reuse the original download',async()=>{
  const runtime = await worker(); let closed = 0; const dimensions = [];
  runtime.context.createImageBitmap = async()=>({width:4000,height:2000,close(){closed++;}});
  runtime.context.OffscreenCanvas = class {
    constructor(width,height){this.width=width;this.height=height;dimensions.push([width,height]);}
    getContext(){return {drawImage(){}};}
    async convertToBlob(){return new Blob(['preview'],{type:'image/webp'});}
  };
  const variant = publicImageVariant(base,256);
  assert.equal(await (await runtime.request(variant)).text(),'preview');
  assert.deepEqual(dimensions,[[256,128]]);
  assert.equal(await (await runtime.request(variant)).text(),'preview');
  assert.equal(await (await runtime.request(base)).text(),'image-data');
  assert.equal(runtime.calls,1); assert.equal(closed,1);
});

test('image cache expires old entries and evicts excess files',async()=>{
  const runtime = await worker();
  for(let i=0;i<129;i++) await runtime.request(base.replace('test.jpg',`test-${i}.jpg`));
  assert.equal(runtime.data.size,128);
  assert.equal(runtime.data.has(base.replace('test.jpg','test-0.jpg')),false);
  runtime.data.set(base,new Response('old',{headers:{'content-type':'image/jpeg','x-ec-saved-at':String(Date.now()-8*24*60*60*1000)}}));
  const before = runtime.calls;
  assert.equal(await (await runtime.request(base)).text(),'image-data');
  assert.equal(runtime.calls,before+1);
});

test('new raster uploads are resized and encoded as WebP before storage',async()=>{
  const oldImage=globalThis.Image, oldDocument=globalThis.document;
  const drawn=[];
  globalThis.Image=class {naturalWidth=4000;naturalHeight=2000;set src(value){queueMicrotask(()=>this.onload());}};
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(...args){drawn.push(args.slice(-2));}}),toBlob:callback=>callback(new Blob(['webp'],{type:'image/webp'}))})};
  try {
    const file=new File(['x'.repeat(2000)],'cover.png',{type:'image/png'});
    const output=await prepareImageUpload(file);
    assert.equal(output.type,'image/webp'); assert.equal(output.name,'cover.webp');
    assert.ok(output.size<file.size); assert.deepEqual(drawn,[[1920,960]]);
  } finally {
    if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  }
});
