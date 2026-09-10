import { supabase } from './supabaseClient';

const STYLE_ID='ec-sidebar-banners-style';
let currentPage=sessionStorage.getItem('ec-current-page')||'home';
let refreshTimer=null;

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
  .ec-sidebar-banners{display:grid;gap:10px;margin:12px 0 0;padding:0 2px}.ec-sidebar-banners[hidden]{display:none!important}
  .ec-sidebar-banner{display:block;overflow:hidden;border:1px solid rgba(18,62,112,.12);border-radius:14px;background:#fff;box-shadow:0 8px 22px rgba(14,48,82,.08);text-decoration:none;color:inherit}
  .ec-sidebar-banner img{display:block;width:100%;height:auto;max-height:260px;object-fit:cover}.ec-sidebar-banner-meta{display:flex;justify-content:space-between;gap:8px;padding:7px 9px}.ec-sidebar-banner-meta strong{font-size:.66rem}.ec-sidebar-banner-meta small{font-size:.56rem;color:#7d8c9a}
  .ec-banner-manager{position:fixed;inset:0;z-index:2147483400;display:grid;place-items:center;padding:18px;background:rgba(8,28,52,.72)}.ec-banner-manager-box{width:min(820px,100%);max-height:92vh;overflow:auto;border-radius:20px;background:#fff;padding:20px;box-shadow:0 30px 90px rgba(8,28,52,.35)}
  .ec-banner-manager-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.ec-banner-manager-head h2{margin:4px 0}.ec-banner-manager-head p{margin:0;color:#748597;font-size:.72rem}.ec-banner-manager-close{border:0;background:#eef3f7;border-radius:10px;width:36px;height:36px;font-size:1.2rem;cursor:pointer}
  .ec-banner-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.ec-banner-form label{display:grid;gap:5px;font-size:.65rem;font-weight:850}.ec-banner-form input{border:1px solid #d6e2ec;border-radius:10px;padding:9px}.ec-banner-form .full{grid-column:1/-1}.ec-banner-form button{grid-column:1/-1;border:0;border-radius:11px;padding:10px 14px;background:#0b6dcc;color:#fff;font-weight:900;cursor:pointer}
  .ec-banner-list{display:grid;gap:9px}.ec-banner-row{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px;border:1px solid #e1e8ef;border-radius:12px}.ec-banner-row img{width:90px;height:56px;object-fit:cover;border-radius:8px}.ec-banner-row strong,.ec-banner-row small{display:block}.ec-banner-row small{color:#7a8a99;font-size:.62rem;margin-top:2px}.ec-banner-row-actions{display:flex;gap:6px}.ec-banner-row-actions button{border:0;border-radius:8px;padding:7px 9px;cursor:pointer}.ec-banner-danger{background:#fff0f0;color:#a32626}.ec-banner-toggle{background:#eef5fb;color:#24577f}
  @media(max-width:620px){.ec-banner-form{grid-template-columns:1fr}.ec-banner-form .full,.ec-banner-form button{grid-column:1}.ec-banner-row{grid-template-columns:70px minmax(0,1fr)}.ec-banner-row img{width:70px}.ec-banner-row-actions{grid-column:1/-1}}
  `;document.head.appendChild(s);
}

function publicUrl(path){return supabase.storage.from('sidebar-banners').getPublicUrl(path).data.publicUrl;}
function isCommunity(){return currentPage==='community'||currentPage==='ads';}

async function loadBanners(all=false){
  let q=supabase.from('sidebar_ad_banners').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false});
  if(!all)q=q.eq('is_active',true);
  const {data,error}=await q;return error?[]:(data||[]);
}

async function renderSidebar(){
  ensureStyle();
  const dock=document.querySelector('.ec-right-dock');if(!dock)return false;
  let wrap=dock.querySelector('.ec-sidebar-banners');if(!wrap){wrap=document.createElement('div');wrap.className='ec-sidebar-banners';const logout=dock.querySelector('.ec-logout');if(logout)logout.insertAdjacentElement('afterend',wrap);else dock.appendChild(wrap);}
  wrap.hidden=isCommunity();if(wrap.hidden)return true;
  const banners=await loadBanners();wrap.replaceChildren();
  banners.forEach(b=>{const a=document.createElement(b.link_url?'a':'article');a.className='ec-sidebar-banner';if(b.link_url){a.href=b.link_url;a.target='_blank';a.rel='noopener noreferrer';}const img=document.createElement('img');img.src=publicUrl(b.image_path);img.alt=b.title||'Werbebanner';a.appendChild(img);if(b.title){const meta=document.createElement('div');meta.className='ec-sidebar-banner-meta';meta.innerHTML=`<strong>${b.title}</strong><small>Anzeige</small>`;a.appendChild(meta);}wrap.appendChild(a);});
  wrap.hidden=!wrap.children.length||isCommunity();return true;
}

function schedule(retries=8){clearTimeout(refreshTimer);const run=async left=>{if(await renderSidebar()||left<=0)return;refreshTimer=setTimeout(()=>run(left-1),180)};void run(retries);}

async function canManage(){const {data}=await supabase.rpc('ec_can_manage_sidebar_banners');return data===true;}

async function openManager(){
  if(!(await canManage()))return alert('Keine Berechtigung für Banner-Verwaltung.');
  ensureStyle();document.querySelector('.ec-banner-manager')?.remove();
  const overlay=document.createElement('div');overlay.className='ec-banner-manager';overlay.innerHTML=`<section class="ec-banner-manager-box"><div class="ec-banner-manager-head"><div><span>ADMIN TOOLS</span><h2>Werbebanner verwalten</h2><p>Mehrere Banner hochladen, verlinken, sortieren sowie aktivieren oder deaktivieren. Auf „Community“ werden sie nicht angezeigt.</p></div><button class="ec-banner-manager-close" type="button">×</button></div><form class="ec-banner-form"><label class="full">Bild hochladen<input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label><label>Titel<input name="title" maxlength="100" placeholder="z. B. Partner der Woche"></label><label>Link (optional)<input name="link" type="url" placeholder="https://..."></label><label>Reihenfolge<input name="sort" type="number" value="0"></label><label>Aktiv<input name="active" type="checkbox" checked></label><button type="submit">Banner hochladen</button></form><div class="ec-banner-list"></div></section>`;
  document.body.appendChild(overlay);overlay.querySelector('.ec-banner-manager-close').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  const list=overlay.querySelector('.ec-banner-list');
  const redraw=async()=>{const rows=await loadBanners(true);list.replaceChildren();if(!rows.length){list.textContent='Noch keine Banner vorhanden.';return;}rows.forEach(b=>{const row=document.createElement('div');row.className='ec-banner-row';row.innerHTML=`<img src="${publicUrl(b.image_path)}" alt=""><div><strong>${b.title||'Ohne Titel'}</strong><small>${b.is_active?'Aktiv':'Deaktiviert'} · Reihenfolge ${b.sort_order}</small></div><div class="ec-banner-row-actions"><button type="button" class="ec-banner-toggle">${b.is_active?'Deaktivieren':'Aktivieren'}</button><button type="button" class="ec-banner-danger">Löschen</button></div>`;row.querySelector('.ec-banner-toggle').onclick=async()=>{await supabase.from('sidebar_ad_banners').update({is_active:!b.is_active,updated_at:new Date().toISOString()}).eq('id',b.id);await redraw();schedule(1)};row.querySelector('.ec-banner-danger').onclick=async()=>{if(!confirm('Banner wirklich löschen?'))return;await supabase.from('sidebar_ad_banners').delete().eq('id',b.id);await supabase.storage.from('sidebar-banners').remove([b.image_path]);await redraw();schedule(1)};list.appendChild(row);});};
  overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const file=f.file.files?.[0];if(!file)return;const {data:{user}}=await supabase.auth.getUser();const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${user.id}/${crypto.randomUUID()}.${ext}`;const up=await supabase.storage.from('sidebar-banners').upload(path,file,{upsert:false});if(up.error)return alert(up.error.message);const ins=await supabase.from('sidebar_ad_banners').insert({title:f.title.value.trim(),image_path:path,link_url:f.link.value.trim()||null,is_active:f.active.checked,sort_order:Number(f.sort.value)||0,created_by:user.id});if(ins.error){await supabase.storage.from('sidebar-banners').remove([path]);return alert(ins.error.message);}f.reset();f.active.checked=true;f.sort.value='0';await redraw();schedule(1);};
  await redraw();
}

window.addEventListener('ec:open-banner-manager',()=>void openManager());
window.addEventListener('ec:navigate',e=>{currentPage=e.detail?.page||currentPage;try{sessionStorage.setItem('ec-current-page',currentPage)}catch{}schedule(2)});
window.addEventListener('focus',()=>schedule(1));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(),{once:true});else schedule();
