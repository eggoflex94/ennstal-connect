import { supabase } from "./supabaseClient";

let shown = false;
const interests = ["Wandern","Sport","Natur","Freizeit","Events","Musik","Familie","Kulinarik","Fotografie","Vereine","Technik","Regionale Tipps"];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function ensureStyle(){
  if(document.getElementById('ec-onboarding-v2-style')) return;
  const style=document.createElement('style');
  style.id='ec-onboarding-v2-style';
  style.textContent=`
    .ec-onboarding-v2{position:fixed;inset:0;z-index:2147483200;display:grid;place-items:center;padding:18px;background:rgba(8,28,52,.7);backdrop-filter:blur(5px)}
    .ec-onboarding-v2-box{width:min(720px,100%);max-height:92vh;overflow:auto;border-radius:22px;background:#fff;box-shadow:0 30px 90px rgba(8,28,52,.34);color:#203b55}
    .ec-onboarding-v2-head{padding:22px 24px 14px;background:linear-gradient(135deg,#eff7ff,#fff)}
    .ec-onboarding-v2-head .eyebrow{display:block;color:#0c6ed1;font-size:.66rem;font-weight:900;letter-spacing:.13em}.ec-onboarding-v2-head h2{margin:6px 0 5px;font-size:1.42rem}.ec-onboarding-v2-head p{margin:0;color:#6e8192;font-size:.76rem;line-height:1.5}
    .ec-onboarding-v2-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:16px}.ec-onboarding-v2-progress span{height:5px;border-radius:999px;background:#dfe9f2}.ec-onboarding-v2-progress span.is-active{background:#0c6ed1}
    .ec-onboarding-v2-body{padding:20px 24px}.ec-onboarding-v2-step{display:none}.ec-onboarding-v2-step.is-active{display:block}.ec-onboarding-v2-step h3{margin:0 0 7px;font-size:1.02rem}.ec-onboarding-v2-step>p{margin:0 0 15px;color:#728394;font-size:.74rem;line-height:1.5}
    .ec-onboarding-v2-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ec-onboarding-v2-option{display:flex;align-items:flex-start;gap:9px;padding:12px;border:1px solid #dce6ef;border-radius:13px;background:#fff;cursor:pointer}.ec-onboarding-v2-option:hover{background:#f7fbff}.ec-onboarding-v2-option input{margin-top:2px}.ec-onboarding-v2-option strong{display:block;font-size:.75rem}.ec-onboarding-v2-option small{display:block;margin-top:2px;color:#788a9b;font-size:.64rem;line-height:1.35}
    .ec-onboarding-v2-field{display:grid;gap:6px;margin-bottom:12px}.ec-onboarding-v2-field span{font-size:.67rem;font-weight:900}.ec-onboarding-v2-field input,.ec-onboarding-v2-field textarea{width:100%;box-sizing:border-box;border:1px solid #d6e2ec;border-radius:11px;padding:10px 11px;font:inherit;color:#23425f;background:#fff}.ec-onboarding-v2-field textarea{min-height:90px;resize:vertical}
    .ec-onboarding-v2-recs{display:grid;gap:8px}.ec-onboarding-v2-rec{display:grid;grid-template-columns:36px minmax(0,1fr);gap:9px;align-items:center;padding:9px;border:1px solid #e0e8ef;border-radius:12px;background:#fbfdff}.ec-onboarding-v2-rec img,.ec-onboarding-v2-rec b{width:36px;height:36px;border-radius:10px}.ec-onboarding-v2-rec img{object-fit:cover}.ec-onboarding-v2-rec b{display:grid;place-items:center;background:#edf4fb;color:#0b6dcc}.ec-onboarding-v2-rec strong{display:block;font-size:.72rem}.ec-onboarding-v2-rec small{display:block;color:#7b8c9c;font-size:.62rem;margin-top:2px}
    .ec-onboarding-v2-actions{display:flex;gap:10px;padding:14px 24px 22px;border-top:1px solid #edf1f5}.ec-onboarding-v2-actions button{border:0;border-radius:11px;padding:10px 16px;font-weight:900;cursor:pointer}.ec-onboarding-v2-back{background:#eef3f7;color:#496176}.ec-onboarding-v2-next{margin-left:auto;background:#0b6dcc;color:#fff}.ec-onboarding-v2-skip{background:transparent;color:#7c8b99}.ec-onboarding-v2-error{margin-top:10px;color:#b3261e;font-size:.67rem;font-weight:800}
    @media(max-width:620px){.ec-onboarding-v2-box{border-radius:16px}.ec-onboarding-v2-head,.ec-onboarding-v2-body,.ec-onboarding-v2-actions{padding-left:16px;padding-right:16px}.ec-onboarding-v2-options{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function completeOnboarding() {
  const { error } = await supabase.rpc("member_complete_onboarding");
  if (error) throw error;
}

async function getRecommendations(profile){
  const terms=String(profile.interests||'').toLowerCase().split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
  const [members,groups,events]=await Promise.all([
    supabase.rpc('community_member_directory'),
    supabase.from('community_groups').select('id,name,description,region_id').limit(20),
    supabase.from('community_events').select('id,title,description,location,event_at,region_id,status').eq('status','ACTIVE').order('event_at',{ascending:true}).limit(20)
  ]);
  const directory=(members.data||[]).map(row=>{try{return typeof row==='string'?JSON.parse(row):row}catch{return null}}).filter(Boolean).filter(m=>m.id!==profile.id);
  const score=(text)=>terms.reduce((n,t)=>n+(String(text||'').toLowerCase().includes(t)?2:0),0);
  const people=directory.map(m=>({m,s:score(`${m.interests||''} ${m.location||''}`)+(m.home_region_id===profile.home_region_id?2:0)})).sort((a,b)=>b.s-a.s).slice(0,3).map(x=>x.m);
  const groupRows=(groups.data||[]).map(g=>({g,s:score(`${g.name||''} ${g.description||''}`)+(g.region_id===profile.home_region_id?2:0)})).sort((a,b)=>b.s-a.s).slice(0,2).map(x=>x.g);
  const eventRows=(events.data||[]).map(e=>({e,s:score(`${e.title||''} ${e.description||''} ${e.location||''}`)+(e.region_id===profile.home_region_id?2:0)})).sort((a,b)=>b.s-a.s).slice(0,2).map(x=>x.e);
  return {people,groupRows,eventRows};
}

function renderRecommendations(box,rec){
  const target=box.querySelector('.ec-onboarding-v2-recs');
  target.replaceChildren();
  const add=(icon,title,text,img='')=>{const row=el('div','ec-onboarding-v2-rec');if(img){const i=document.createElement('img');i.src=img;i.alt='';row.appendChild(i)}else row.appendChild(el('b',null,icon));const copy=el('div');copy.append(el('strong',null,title),el('small',null,text));row.appendChild(copy);target.appendChild(row)};
  rec.people.forEach(m=>add('',m.nickname||'Mitglied','Passt zu deiner Region oder deinen Interessen',m.avatar_url||'/community-default-avatar.png'));
  rec.groupRows.forEach(g=>add('●',g.name||'Gruppe','Passende Community-Gruppe'));
  rec.eventRows.forEach(e=>add('▣',e.title||'Event',`${e.event_at?new Date(e.event_at).toLocaleDateString('de-AT'):'Kommendes Event'}${e.location?` · ${e.location}`:''}`));
  if(!target.children.length)add('✓','Du bist startklar','Empfehlungen werden besser, sobald mehr Mitglieder, Gruppen und Events aktiv sind.');
}

async function showWizard(user, profile, regions){
  ensureStyle();
  let step=0;
  const overlay=el('div','ec-onboarding-v2');
  const box=el('section','ec-onboarding-v2-box');
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','ec-onboarding-v2-title');
  box.innerHTML=`<header class="ec-onboarding-v2-head"><span class="eyebrow">WILLKOMMEN BEI ENNSTAL CONNECT</span><h2 id="ec-onboarding-v2-title">In 4 Schritten zu deiner Community</h2><p>Richte deinen Einstieg einmal kurz ein – danach zeigen wir dir passendere Menschen, Gruppen und Veranstaltungen.</p><div class="ec-onboarding-v2-progress">${[0,1,2,3].map(i=>`<span data-p="${i}"></span>`).join('')}</div></header><div class="ec-onboarding-v2-body"><div class="ec-onboarding-v2-step" data-step="0"><h3>1. Heimatregion bestätigen</h3><p>Deine Heimatregion bestimmt, welche regionalen Inhalte du zuerst siehst.</p><div class="ec-onboarding-v2-options">${regions.map(r=>`<label class="ec-onboarding-v2-option"><input type="radio" name="region" value="${r.slug}" ${r.id===profile.home_region_id?'checked':''}><span><strong>${r.name}</strong><small>${r.description||'Regionale Community, Termine und Ansprechpartner'}</small></span></label>`).join('')}</div></div><div class="ec-onboarding-v2-step" data-step="1"><h3>2. Interessen auswählen</h3><p>Damit Mitglieder, Gruppen und Events besser zu dir passen.</p><div class="ec-onboarding-v2-options">${interests.map(i=>`<label class="ec-onboarding-v2-option"><input type="checkbox" value="${i}" ${String(profile.interests||'').toLowerCase().includes(i.toLowerCase())?'checked':''}><span><strong>${i}</strong><small>Für persönlichere Empfehlungen</small></span></label>`).join('')}</div></div><div class="ec-onboarding-v2-step" data-step="2"><h3>3. Profil vervollständigen</h3><p>Ein paar Informationen helfen anderen, Gemeinsamkeiten mit dir zu entdecken.</p><label class="ec-onboarding-v2-field"><span>Spitzname</span><input name="nickname" maxlength="50"></label><label class="ec-onboarding-v2-field"><span>Kurz über dich</span><textarea name="bio" maxlength="1000"></textarea></label></div><div class="ec-onboarding-v2-step" data-step="3"><h3>4. Dein persönlicher Start</h3><p>Hier sind erste Vorschläge passend zu deinen Angaben.</p><div class="ec-onboarding-v2-recs"></div></div><div class="ec-onboarding-v2-error" hidden></div></div><footer class="ec-onboarding-v2-actions"><button type="button" class="ec-onboarding-v2-skip">Später</button><button type="button" class="ec-onboarding-v2-back">Zurück</button><button type="button" class="ec-onboarding-v2-next">Weiter</button></footer>`;
  overlay.appendChild(box);document.body.appendChild(overlay);
  box.querySelector('[name="nickname"]').value=profile.nickname||'';box.querySelector('[name="bio"]').value=profile.bio||'';
  const back=box.querySelector('.ec-onboarding-v2-back'),next=box.querySelector('.ec-onboarding-v2-next'),skip=box.querySelector('.ec-onboarding-v2-skip'),error=box.querySelector('.ec-onboarding-v2-error');
  const paint=()=>{box.querySelectorAll('.ec-onboarding-v2-step').forEach((n,i)=>n.classList.toggle('is-active',i===step));box.querySelectorAll('[data-p]').forEach((n,i)=>n.classList.toggle('is-active',i<=step));back.style.visibility=step===0?'hidden':'visible';next.textContent=step===3?'Community öffnen':'Weiter'};
  const save=async()=>{
    const selected=box.querySelector('[name="region"]:checked')?.value;if(!selected)throw new Error('Bitte wähle deine Heimatregion.');
    const selectedInterests=[...box.querySelectorAll('[data-step="1"] input:checked')].map(n=>n.value).join(', ');
    const nickname=box.querySelector('[name="nickname"]').value.trim();if(!nickname)throw new Error('Bitte gib einen Spitznamen an.');
    const bio=box.querySelector('[name="bio"]').value.trim();
    const region=regions.find(r=>r.slug===selected);const {error:regionError}=await supabase.rpc('ec_change_home_region',{p_region_slug:selected});if(regionError)throw regionError;
    const {error:profileError}=await supabase.from('profiles').update({nickname,bio,interests:selectedInterests}).eq('id',user.id);if(profileError)throw profileError;
    localStorage.setItem('ec-active-region',selected);if(region)window.dispatchEvent(new CustomEvent('ec:region-change',{detail:region}));
    return {...profile,id:user.id,nickname,bio,interests:selectedInterests,home_region_id:region?.id||profile.home_region_id};
  };
  next.onclick=async()=>{error.hidden=true;try{if(step<2){step++;paint();return}if(step===2){next.disabled=true;const updated=await save();renderRecommendations(box,await getRecommendations(updated));step=3;paint();next.disabled=false;return}next.disabled=true;await completeOnboarding();overlay.remove();window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'home'}}))}catch(e){error.textContent=e?.message||'Onboarding konnte nicht gespeichert werden.';error.hidden=false;next.disabled=false}};
  back.onclick=()=>{if(step>0){step--;paint()}};skip.onclick=()=>overlay.remove();paint();next.focus();
}

async function start() {
  if (shown || !supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const [{ data: profile }, { data: status, error: statusError }, { data: regions, error: regionError }] = await Promise.all([
    supabase.from("profiles").select("id,account_status,home_region_id,nickname,bio,interests").eq("id", user.id).maybeSingle(),
    supabase.rpc("member_onboarding_status"),
    supabase.from("regions").select("id,slug,name,description,sort_order").eq("is_active", true).order("sort_order")
  ]);
  if (profile?.account_status !== "ACTIVE" || statusError || status?.[0]?.completed || regionError || !regions?.length) return;
  shown = true;
  setTimeout(() => showWizard(user, profile, regions), 700);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});else void start();
supabase?.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_IN')setTimeout(()=>void start(),500)});
