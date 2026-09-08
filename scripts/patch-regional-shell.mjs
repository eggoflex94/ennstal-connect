import fs from 'node:fs';

const path = new URL('../src/regional-shell.js', import.meta.url);
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const old = /function applyRegionalDirectory\(\)\{[\s\S]*?\}\n\n\nasync function safe/;
if (!old.test(source)) throw new Error('[regional shell patch] applyRegionalDirectory anchor not found');

const replacement = `function applyRegionalDirectory(){
  if(!activeRegion||!profiles.length)return;
  document.documentElement.dataset.ecRegion=activeRegion.slug;
  const isMembersPage=/^Mitglieder\\b/i.test(document.querySelector('.content-root .page-heading h1')?.textContent||'');
  document.querySelectorAll('.member-card').forEach(card=>{
    const p=profileForCard(card);if(!p)return;
    const theme=themeFor(p),label=roleLabel(p);
    card.dataset.memberId=p.id;card.dataset.homeRegionId=p.home_region_id||'';card.dataset.roleTheme=theme;card.dataset.effectiveRole=label;
    card.classList.remove('role-theme-admin','role-theme-supporter','role-theme-business','role-theme-member');card.classList.add(\`role-theme-\${theme}\`);
    if(isMembersPage) card.hidden=false;
    const badge=card.querySelector('.ec-card-badge-role');if(badge){badge.title=label;badge.setAttribute('aria-label',label)}
    const star=card.querySelector('.ec-card-badge-role-img');if(star)star.src=theme==='admin'?'/role-star-red.svg':theme==='supporter'?'/supporter-star.svg':theme==='business'?'/role-star-blue.svg':'/role-star-member.svg';
  });
  if(isMembersPage) document.querySelectorAll('.ec-region-context').forEach(el=>el.remove());
}


async function safe`;

source = source.replace(old, replacement);
fs.writeFileSync(path, source, 'utf8');
console.log('[regional shell patch] member cards are no longer force-filtered by active region');
