import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(process.argv[2]);
const { chromium } = require('playwright');
const assets = new URL('../dist/assets/', import.meta.url);
const cssName = (await fs.readdir(assets)).find(name => /^index-.*\.css$/.test(name));
const css = await fs.readFile(new URL(cssName, assets), 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const name = 'Alexandra-Maria_EnnstalCommunityMitgliedMitEinemSehrLangenNamen_1234567890';
const rows = Array.from({length:10},(_,i)=>`<button type="button" class="ec-dock-detail-row ec-profile-visit-row ec-profile-visit-row-clean" data-profile-id="fixture-${i}"><span class="ec-profile-visit-identity"><strong><a class="ec-profile-native-link ec-dock-profile-link">${name}</a></strong><small>hat dein Profil besucht</small></span><time datetime="2026-09-10T12:30:00Z">10.09.2026, 14:30</time></button>`).join('');
const visits=Array.from({length:10},()=>`<p><button class="profile-activity-link member"><strong>${name}</strong> hat dein Profil besucht</button><time>10.09.2026, 14:30:00</time></p>`).join('');
try {
 for (const [width,mobile] of [[320,true],[390,true],[768,true],[1024,false],[1440,false]]) {
  const context = await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();
  await page.setContent(`<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>
    html,body{margin:0!important;padding:0!important;width:auto!important;min-width:0!important;zoom:1!important}
    .layout-fixture{display:grid;gap:20px;margin:16px;grid-template-columns:minmax(0,1fr);width:calc(100% - 32px)!important;max-width:1000px;box-sizing:border-box}
    .layout-fixture>aside.ec-right-dock.ec-stable-personal-dock.ec-document-flow-dock.ec-final-stable-dock{position:static!important;display:block!important;opacity:1!important;visibility:visible!important;width:min(100%,270px)!important;min-width:0!important;max-width:270px!important;height:auto!important;max-height:none!important;overflow:visible!important;transform:none!important;zoom:1!important;margin:0!important}
    .layout-fixture>.ec-right-dock,.layout-fixture>.profile-page-layout{grid-column:1!important;box-sizing:border-box!important}
    .layout-fixture>.profile-page-layout{padding:0!important;width:100%!important;min-width:0!important}
    </style><body><main class="layout-fixture"><aside class="ec-right-dock ec-stable-personal-dock ec-document-flow-dock ec-final-stable-dock"><h2>Profilbesuche</h2><div class="ec-dock-detail is-open" data-panel="visits">${rows}</div></aside><section class="profile-page-layout"><section class="profile-activity-dashboard"><article class="profile-timeline panel"><h2>Die letzten 10 Besuche</h2><div>${visits}</div></article></section></section></main></body></html>`);
  const failures=await page.evaluate(()=>{
   const failures=[];
   for(const row of document.querySelectorAll('.ec-dock-detail-row,.profile-timeline p')){
    const bounds=row.getBoundingClientRect();
    if(row.scrollWidth>row.clientWidth+1)failures.push('row horizontal overflow');
    for(const child of row.querySelectorAll('strong,a,small,time,.profile-activity-link')){
     const box=child.getBoundingClientRect(),style=getComputedStyle(child);
     if(box.width<1||box.height<1)failures.push('hidden text');
     if(box.left<bounds.left-1||box.right>bounds.right+1||box.top<bounds.top-1||box.bottom>bounds.bottom+1)failures.push('text outside row: '+child.tagName);
     if(child.clientWidth&&child.scrollWidth>child.clientWidth+1)failures.push('clipped width: '+child.tagName);
     if(child.clientHeight&&child.scrollHeight>child.clientHeight+1)failures.push('clipped height: '+child.tagName);
     if(style.whiteSpace==='nowrap'||style.textOverflow==='ellipsis')failures.push('truncation rule: '+child.tagName);
    }
   }
   const panel=document.querySelector('.ec-dock-detail');
   if(panel.scrollHeight>panel.clientHeight+1)failures.push('visits panel clips its last row');
   for(const el of document.querySelectorAll('.layout-fixture,.ec-right-dock,.profile-activity-dashboard,.profile-timeline')){
    const bounds=el.getBoundingClientRect();
    for(const child of el.children){const box=child.getBoundingClientRect();if(box.left<bounds.left-1||box.right>bounds.right+1)failures.push(el.className+': child outside container');}
   }
   return failures;
  });
  assert.deepEqual(failures,[],`layout at ${width}px`);
  const last=page.locator('.ec-dock-detail-row').last(); await last.scrollIntoViewIfNeeded(); await last.click();
  if(process.argv[3]&&(width===390||width===1440)){
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:process.argv[3]+'/'+(mobile?'Profilbesuche-Mobil.png':'Profilbesuche-PC.png'),fullPage:true});
  }
  console.log(`PASS: all 10 visit rows, full names, hints and dates at ${width}px (${mobile?'touch':'desktop'})`);
  await context.close();
 }
} finally {await browser.close();}
