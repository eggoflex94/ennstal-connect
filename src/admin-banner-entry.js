import { supabase } from './supabaseClient';

const STYLE_ID='ec-admin-banner-entry-style';
let mounted=false;

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');
  s.id=STYLE_ID;
  s.textContent=`
    .ec-admin-banner-entry{margin:18px 0;padding:18px;border:1px solid rgba(18,62,112,.14);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(244,249,255,.94));box-shadow:0 14px 34px rgba(18,62,112,.08)}
    .ec-admin-banner-entry-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.ec-admin-banner-entry-head span{display:block;color:#0b63c7;font-size:.66rem;font-weight:900;letter-spacing:.13em}.ec-admin-banner-entry-head h3{margin:5px 0 4px;color:#213e59;font-size:1.05rem}.ec-admin-banner-entry-head p{margin:0;color:#718295;font-size:.72rem;line-height:1.45}
    .ec-admin-banner-entry button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:78px;padding:16px 18px;border:1px solid rgba(18,62,112,.11);border-radius:18px;background:#fff;color:#1d344b;text-align:left;cursor:pointer;box-shadow:0 8px 20px rgba(18,62,112,.06);transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}.ec-admin-banner-entry button:hover{transform:translateY(-1px);border-color:rgba(11,99,199,.35);box-shadow:0 12px 26px rgba(18,62,112,.1)}
    .ec-admin-banner-entry-copy strong{display:block;font-size:.9rem}.ec-admin-banner-entry-copy small{display:block;margin-top:4px;color:#748598;font-size:.66rem;line-height:1.4}.ec-admin-banner-entry-arrow{font-size:1.5rem;color:#8aa0b5}
    @media(max-width:620px){.ec-admin-banner-entry{padding:14px;border-radius:18px}.ec-admin-banner-entry button{min-height:68px;padding:13px 14px;border-radius:15px}}
  `;
  document.head.appendChild(s);
}

async function mount(){
  if(mounted||!supabase)return;
  const root=document.querySelector('.admin-page');
  if(!root)return;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data:profile}=await supabase.from('profiles').select('role,account_status').eq('id',user.id).maybeSingle();
  if(profile?.role!=='HEAD_ADMIN'||profile?.account_status!=='ACTIVE')return;
  ensureStyle();
  if(root.querySelector('.ec-admin-banner-entry')){mounted=true;return;}
  const card=document.createElement('section');
  card.className='ec-admin-banner-entry';
  card.innerHTML='<div class="ec-admin-banner-entry-head"><div><span>HEAD ADMIN · WERBUNG</span><h3>Werbebanner verwalten</h3><p>Banner hochladen, global oder regional ausspielen, sortieren sowie aktivieren und deaktivieren.</p></div></div><button type="button"><span class="ec-admin-banner-entry-copy"><strong>🖼 Werbebanner öffnen</strong><small>Mehrere Banner verwalten · nur für Head Admin</small></span><span class="ec-admin-banner-entry-arrow">›</span></button>';
  card.querySelector('button').onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-banner-manager'));
  const anchor=root.querySelector('.ec-admin-modern')||root.firstElementChild;
  if(anchor)anchor.insertAdjacentElement('afterend',card);else root.prepend(card);
  mounted=true;
}

function schedule(retries=10){const run=left=>{void mount();if(!mounted&&left>0)setTimeout(()=>run(left-1),180)};run(retries)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(),{once:true});else schedule();
window.addEventListener('ec:navigate',()=>{mounted=false;schedule(5)});
window.addEventListener('focus',()=>{if(!mounted)schedule(2)});
