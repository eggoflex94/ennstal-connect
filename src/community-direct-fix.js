import { supabase } from './supabaseClient';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = (v) => String(v || '').replace(/\s+/g,' ').trim().toLowerCase();
const activeSlug = () => document.documentElement.dataset.ecRegion || localStorage.getItem('ec-active-region') || document.querySelector('.ec-region-picker select')?.value || '';
let timer;
let memberState = null;

function notify(text, isError=false){
  let box=document.querySelector('.ec-direct-toast');
  if(!box){box=document.createElement('div');box.className='ec-direct-toast';document.body.appendChild(box)}
  box.textContent=text;box.classList.toggle('error',isError);box.classList.add('show');
  clearTimeout(box._t);box._t=setTimeout(()=>box.classList.remove('show'),4500);
}

async function context(){
  if(!supabase) return null;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return null;
  const [{data:profile},{data:regions},{data:assignments}]=await Promise.all([
    supabase.from('profiles').select('id,role,home_region_id').eq('id',user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',user.id).eq('active',true)
  ]);
  const list=regions||[];
  const region=list.find(r=>r.slug===activeSlug())||list.find(r=>r.id===profile?.home_region_id)||list[0]||null;
  const role=String(profile?.role||'').toUpperCase();
  const head=role==='HEAD_ADMIN';
  const canRegional=head||role==='ADMIN'||(assignments||[]).some(a=>a.region_id===region?.id&&a.active);
  return {user,profile,regions:list,region,head,canRegional};
}

async function loadMembers(){
  if(memberState) return memberState;
  const [{data:regions,error:re},{data:rpc,error:rpcError}]=await Promise.all([
    supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
    supabase.rpc('community_member_directory')
  ]);
  let profiles=rpcError?null:(rpc||[]).map(x=>typeof x==='string'?JSON.parse(x):x);
  if(!profiles){
    const {data,error}=await supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,role,account_badge,home_region_id,is_online,last_active_at,hide_online_status,account_status,is_test_account').eq('account_status','ACTIVE');
    if(error) throw error; profiles=data||[];
  }
  if(re) throw re;
  memberState={regions:regions||[],profiles:profiles.filter(p=>p.account_status!=='SUSPENDED'&&!p.is_test_account)};
  return memberState;
}

const memberName=p=>p.nickname||[p.first_name,p.last_name].filter(Boolean).join(' ')||'Mitglied';
const online=p=>Boolean(!p.hide_online_status&&p.is_online&&p.last_active_at&&Date.now()-new Date(p.last_active_at).getTime()<300000);

async function mountMembers(){
  const heading=[...document.querySelectorAll('.content-root .page-heading')].find(h=>norm(h.querySelector('h1')?.textContent).startsWith('mitglieder'));
  if(!heading) return;
  const section=heading.parentElement;
  const data=await loadMembers();
  const map=new Map(data.regions.map(r=>[r.id,r]));
  const active=data.regions.find(r=>r.slug===activeSlug())||data.regions[0];
  const title=heading.querySelector('h1'); if(title) title.textContent='Mitglieder';
  const subtitle=heading.querySelector('p'); if(subtitle) subtitle.textContent='Finde Mitglieder aus allen Regionen und filtere die Community nach deinen Wünschen.';
  const oldSearch=heading.querySelector('.search-input'); if(oldSearch) oldSearch.style.display='none';
  section.querySelectorAll('.ec-region-context').forEach(el=>el.style.display='none');
  section.querySelectorAll('.member-grid,.members-grid').forEach(el=>{if(!el.classList.contains('ec-direct-member-grid')) el.style.display='none'});

  let box=section.querySelector('.ec-direct-members');
  if(!box){
    box=document.createElement('section');box.className='ec-direct-members panel';heading.insertAdjacentElement('afterend',box);
    box.innerHTML=`<div class="ec-direct-members-head"><div><span class="eyebrow">MITGLIEDER FINDEN</span><h2>Community durchsuchen</h2><p>Name, Nickname oder Region suchen.</p></div><b>${data.profiles.length} Mitglieder</b></div><div class="ec-direct-member-controls"><input class="ec-direct-q" type="search" placeholder="Mitglied suchen …"><select class="ec-direct-region"><option value="all">Alle Regionen</option>${data.regions.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label><input class="ec-direct-online" type="checkbox"> Nur online</label></div><div class="ec-direct-scope"><button type="button" data-scope="all">Alle Regionen</button><button type="button" data-scope="active">${esc(active?.name||'Aktuelle Region')}</button></div><div class="ec-direct-meta"></div>`;
    const grid=document.createElement('div');grid.className='ec-direct-member-grid';box.insertAdjacentElement('afterend',grid);
  }
  const grid=section.querySelector('.ec-direct-member-grid');
  const q=box.querySelector('.ec-direct-q'), region=box.querySelector('.ec-direct-region'), only=box.querySelector('.ec-direct-online');
  const render=()=>{
    const needle=norm(q.value);const rid=region.value;
    const rows=data.profiles.filter(p=>{
      const hay=norm([p.nickname,p.first_name,p.last_name,map.get(p.home_region_id)?.name].filter(Boolean).join(' '));
      return (rid==='all'||p.home_region_id===rid)&&(!only.checked||online(p))&&(!needle||hay.includes(needle));
    }).sort((a,b)=>memberName(a).localeCompare(memberName(b),'de'));
    box.querySelector('.ec-direct-meta').textContent=`${rows.length} ${rows.length===1?'Mitglied':'Mitglieder'} gefunden${rid==='all'?' · alle Regionen':` · ${map.get(rid)?.name||'Region'}`}${only.checked?' · nur online':''}`;
    grid.innerHTML='';
    rows.forEach(p=>{
      const card=document.createElement('article');card.className='ec-direct-member-card';
      const role=String(p.role||'MEMBER').toUpperCase();card.dataset.theme=role==='HEAD_ADMIN'||role==='ADMIN'?'admin':role==='SUPPORTER'?'supporter':p.account_badge==='BUSINESS'?'business':'member';
      card.innerHTML=`<img src="${esc(p.avatar_url||'/community-default-avatar.png')}" alt=""><div><strong>${esc(memberName(p))}</strong><span>${esc(map.get(p.home_region_id)?.name||'Keine Region')}</span><small class="${online(p)?'on':''}">${p.hide_online_status?'Status verborgen':online(p)?'● Online':'○ Offline'}</small></div><button type="button">Profil öffnen</button>`;
      card.querySelector('button').onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:p.id,nickname:p.nickname||''}}));grid.appendChild(card);
    });
    if(!rows.length) grid.innerHTML='<div class="empty-card">Keine Mitglieder gefunden.</div>';
  };
  q.oninput=render;region.onchange=render;only.onchange=render;
  box.querySelector('[data-scope="all"]').onclick=()=>{region.value='all';render()};
  box.querySelector('[data-scope="active"]').onclick=()=>{region.value=active?.id||'all';render()};
  box.querySelector('[data-scope="active"]').textContent=active?.name||'Aktuelle Region';
  render();
}

function fontOptions(current='modern'){return [['modern','Modern'],['montserrat','Montserrat'],['arial','Arial'],['opensans','Open Sans'],['serif','Serif']].map(([v,l])=>`<option value="${v}"${v===current?' selected':''}>${l}</option>`).join('')}

async function uploadHomeImage(file,userId){
  if(!file||!file.size) return null;if(!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');if(file.size>5242880) throw new Error('Maximal 5 MB.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase(),path=`${userId}/homepage/${crypto.randomUUID()}.${ext}`;
  for(const bucket of ['community-media','profile-avatars']){const {error}=await supabase.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});if(!error)return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl||null;if(!/bucket not found/i.test(error.message||''))throw error}
  return null;
}

async function mountHomeEditor(ctx){
  const home=document.querySelector('.home-page');if(!home||!ctx?.canRegional)return;
  document.querySelectorAll('.homepage-editor-toggle,.ec-core-home-editor,.ec-home-final-editor,.ec-homepage-modern-editor').forEach(el=>el.style.display='none');
  let editor=home.querySelector('.ec-direct-home-editor');
  if(!editor){
    editor=document.createElement('details');editor.className='ec-direct-home-editor panel';editor.open=true;
    editor.innerHTML=`<summary>Startseite für <b class="ec-direct-region-name">${esc(ctx.region?.name||'Region')}</b> gestalten</summary><div class="ec-direct-home-body"><div class="ec-direct-home-title"><div><span class="eyebrow">STARTSEITE VERWALTEN</span><h2>Inhalt & Design</h2><p>Hier kannst du Schrift, Größe, Farben, Bild und Veröffentlichung direkt einstellen.</p></div><strong>${ctx.head?'GLOBAL ADMIN':'REGIONAL ADMIN'}</strong></div><form><div class="ec-direct-home-grid"><label>Veröffentlichung<select name="publication_scope">${ctx.head?`<option value="REGION">Nur ${esc(ctx.region?.name||'Region')}</option><option value="GLOBAL">🌍 Global – alle Regionen</option>`:`<option value="REGION">Nur ${esc(ctx.region?.name||'Region')}</option>`}</select></label><label>Rahmen<select name="frame_style"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select></label><label class="wide">Überschrift<input name="title" required></label><label class="wide">Text<textarea name="content" rows="8" required></textarea></label><label>Titel Schriftart<select name="title_font_family">${fontOptions()}</select></label><label>Titel Größe<input name="title_font_size" type="number" min="18" max="64" value="32"></label><label>Titel Farbe<input name="title_color" type="color" value="#0f172a"></label><label>Text Schriftart<select name="font_family">${fontOptions()}</select></label><label>Text Größe<input name="font_size" type="number" min="12" max="48" value="18"></label><label>Text Farbe<input name="text_color" type="color" value="#334155"></label><label>Bild hochladen<input name="image" type="file" accept="image/*"></label><label>oder Bild-URL<input name="image_url" placeholder="https://…"></label></div><div class="ec-direct-preview"><span>LIVE-VORSCHAU</span><h3>Deine Überschrift</h3><p>Dein Text erscheint hier sofort als Vorschau.</p></div><button class="primary-button" type="submit">Speichern & veröffentlichen</button></form></div>`;
    home.querySelector('.page-heading')?.insertAdjacentElement('afterend',editor);
  }
  editor.querySelector('.ec-direct-region-name').textContent=ctx.region?.name||'Region';
  const form=editor.querySelector('form');
  const update=()=>{const d=new FormData(form),h=editor.querySelector('.ec-direct-preview h3'),p=editor.querySelector('.ec-direct-preview p');h.textContent=String(d.get('title')||'')||'Deine Überschrift';p.textContent=String(d.get('content')||'')||'Dein Text erscheint hier sofort als Vorschau.';h.style.fontSize=`${Number(d.get('title_font_size')||32)}px`;h.style.color=String(d.get('title_color')||'#0f172a');p.style.fontSize=`${Number(d.get('font_size')||18)}px`;p.style.color=String(d.get('text_color')||'#334155')};
  form.oninput=update;form.onchange=update;
  form.onsubmit=async e=>{e.preventDefault();const d=new FormData(form),title=String(d.get('title')||'').trim(),content=String(d.get('content')||'').trim();if(title.length<3||content.length<3)return notify('Bitte Überschrift und Text ausfüllen.',true);const scope=String(d.get('publication_scope')||'REGION');if(scope==='GLOBAL'&&!ctx.head)return notify('Global darf nur der Head Admin veröffentlichen.',true);const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Wird gespeichert …';try{const uploaded=await uploadHomeImage(form.elements.image?.files?.[0],ctx.user.id);const {data:last}=await supabase.from('homepage_sections').select('sort_order').order('sort_order',{ascending:false}).limit(1);const payload={title,content,image_url:uploaded||String(d.get('image_url')||'').trim()||null,frame_style:String(d.get('frame_style')||'standard'),publication_scope:scope,title_font_family:String(d.get('title_font_family')||'modern'),title_font_size:Number(d.get('title_font_size')||32),title_color:String(d.get('title_color')||'#0f172a'),font_family:String(d.get('font_family')||'modern'),font_size:Number(d.get('font_size')||18),text_color:String(d.get('text_color')||'#334155'),created_by:ctx.user.id,updated_by:ctx.user.id,sort_order:Number(last?.[0]?.sort_order||0)+10,is_visible:true,region_id:ctx.region?.id};const {error}=await supabase.from('homepage_sections').insert(payload);if(error)throw error;form.reset();update();notify(scope==='GLOBAL'?'✓ Global veröffentlicht.':`✓ Startseite für ${ctx.region?.name||'die Region'} gespeichert.`)}catch(error){notify(`Speichern fehlgeschlagen: ${error?.message||error}`,true)}finally{btn.disabled=false;btn.textContent='Speichern & veröffentlichen'}};
}

async function mountNextEvent(ctx){
  if(!ctx?.region||!document.querySelector('.home-page'))return;
  const {data,error}=await supabase.from('community_events').select('id,title,event_at,status,region_id').eq('region_id',ctx.region.id).eq('status','ACTIVE').gte('event_at',new Date().toISOString()).order('event_at',{ascending:true}).limit(1);if(error)return;
  const event=data?.[0]||null;
  const candidates=[...document.querySelectorAll('.home-page *')].filter(el=>norm(el.textContent).includes('nächster termin'));
  const target=candidates.sort((a,b)=>a.children.length-b.children.length)[0]?.closest('button,article,section,div');if(!target)return;
  target.innerHTML=`<span class="ec-direct-next-label">NÄCHSTER TERMIN · ${esc(ctx.region.name)}</span><strong>${esc(event?.title||`Derzeit kein kommender Termin in ${ctx.region.name}`)}</strong><time>${event?.event_at?new Date(event.event_at).toLocaleString('de-AT'):''}</time>`;target.classList.add('ec-direct-next-event');
}

async function apply(){
  try{await mountMembers()}catch(e){console.warn('Mitgliedersuche:',e)}
  try{const ctx=await context();if(!ctx)return;await mountHomeEditor(ctx);await mountNextEvent(ctx)}catch(e){console.warn('Startseite/Termin:',e)}
}
function schedule(ms=120){clearTimeout(timer);timer=setTimeout(()=>void apply(),ms)}
new MutationObserver(()=>schedule(180)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>{memberState=null;schedule(20)});
window.addEventListener('focus',()=>schedule(80));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(100),{once:true});else schedule(100);
