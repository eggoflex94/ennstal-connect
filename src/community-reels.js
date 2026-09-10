import { supabase } from './supabaseClient';

const STYLE_ID='ec-community-reels-style';
let navTimer=null;
let currentUser=null;
let currentProfile=null;
let activeRegion=null;
let showAll=false;
let uploadBusy=false;
let observer=null;

const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const fmt=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('de-AT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});};
const profileName=(p)=>p?.nickname||[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'Mitglied';

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
    .ec-top-nav [data-ec-page="reels"] b{font-size:15px}.ec-top-nav [data-ec-page="reels"].is-active{background:linear-gradient(135deg,#0b6dcc,#2897ff)!important;color:#fff!important;box-shadow:0 6px 16px rgba(11,109,204,.22)!important}
    .modern-main.ec-reels-mode>:not(.ec-reels-page){display:none!important}.ec-reels-page{width:min(1060px,100%);margin:0 auto;padding:18px 14px 36px;box-sizing:border-box;color:#213d58}.ec-reels-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px;padding:18px;border:1px solid rgba(25,65,105,.1);border-radius:19px;background:linear-gradient(135deg,#fff,#f3f8fc);box-shadow:0 9px 24px rgba(28,59,88,.05)}.ec-reels-head span{display:block;color:#e85a21;font-size:.63rem;font-weight:900;letter-spacing:.13em}.ec-reels-head h1{margin:4px 0 5px;font-size:1.45rem}.ec-reels-head p{margin:0;color:#708296;font-size:.75rem;line-height:1.45}.ec-reels-filter{display:flex;gap:7px;flex-wrap:wrap}.ec-reels-filter button{border:1px solid #d7e2ec;border-radius:999px;padding:8px 11px;background:#fff;color:#36536f;font-weight:850;font-size:.68rem;cursor:pointer}.ec-reels-filter button.is-active{border-color:#0b6dcc;background:#0b6dcc;color:#fff}
    .ec-reels-upload{margin-bottom:15px;padding:15px;border:1px solid rgba(25,65,105,.1);border-radius:17px;background:#fff;box-shadow:0 8px 22px rgba(25,55,87,.05)}.ec-reels-upload h2{margin:0 0 4px;font-size:.95rem}.ec-reels-upload>p{margin:0 0 12px;color:#768799;font-size:.68rem}.ec-reels-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ec-reels-form label{display:grid;gap:5px;color:#3b526a;font-size:.65rem;font-weight:900}.ec-reels-form .full{grid-column:1/-1}.ec-reels-form input,.ec-reels-form textarea,.ec-reels-form select{width:100%;min-height:44px;box-sizing:border-box;border:1px solid #d3dee8;border-radius:11px;padding:10px 11px;background:#fff;color:#203b55;font:inherit;font-size:14px}.ec-reels-form textarea{min-height:76px;resize:vertical}.ec-reels-form button{grid-column:1/-1;min-height:44px;border:0;border-radius:11px;background:#17324a;color:#fff;font-weight:900;cursor:pointer}.ec-reels-form button:disabled{opacity:.6;cursor:wait}.ec-reels-upload-status{grid-column:1/-1;min-height:16px;color:#47728f;font-size:.64rem;font-weight:800}
    .ec-reels-feed{display:grid;gap:16px;justify-items:center}.ec-reel{position:relative;width:min(470px,100%);overflow:hidden;border-radius:22px;background:#0d1117;box-shadow:0 16px 38px rgba(9,28,47,.18);border:1px solid rgba(18,49,79,.15)}.ec-reel-video-wrap{position:relative;aspect-ratio:9/16;max-height:76vh;background:#080b10}.ec-reel video{display:block;width:100%;height:100%;object-fit:cover;background:#05070a}.ec-reel-overlay{position:absolute;inset:auto 0 0;padding:74px 15px 15px;background:linear-gradient(transparent,rgba(0,0,0,.86));color:#fff;pointer-events:none}.ec-reel-author{display:flex;align-items:center;gap:8px;margin-bottom:7px}.ec-reel-author img{width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.8)}.ec-reel-author strong{font-size:.78rem}.ec-reel-author small{display:block;margin-top:1px;color:#d6e0e8;font-size:.6rem}.ec-reel-caption{margin:0;font-size:.72rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.ec-reel-sound{position:absolute;top:12px;right:12px;z-index:4;width:38px;height:38px;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:17px;cursor:pointer;backdrop-filter:blur(6px)}
    .ec-reel-actions{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff}.ec-reel-actions button{border:0;border-radius:10px;padding:8px 10px;background:#f1f5f8;color:#28465f;font-weight:850;font-size:.67rem;cursor:pointer}.ec-reel-actions button.is-liked{background:#fff0f2;color:#c12645}.ec-reel-actions .ec-report{margin-left:auto}.ec-reel-comments{padding:0 12px 12px;background:#fff}.ec-reel-comments-list{display:grid;gap:6px;max-height:150px;overflow:auto}.ec-reel-comment{padding:7px 8px;border-radius:9px;background:#f7f9fb}.ec-reel-comment strong{font-size:.63rem}.ec-reel-comment span{display:block;margin-top:2px;color:#53697c;font-size:.62rem;line-height:1.35}.ec-reel-comment-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:8px}.ec-reel-comment-form input{min-width:0;border:1px solid #d4dfe8;border-radius:10px;padding:9px 10px;font-size:14px}.ec-reel-comment-form button{border:0;border-radius:10px;padding:8px 11px;background:#0b6dcc;color:#fff;font-weight:900;cursor:pointer}.ec-reels-empty{width:min(600px,100%);padding:22px;border:1px dashed #cad8e4;border-radius:16px;background:#f8fbfd;color:#718397;text-align:center;font-size:.72rem}
    @media(max-width:700px){.ec-reels-page{padding:10px 8px 24px}.ec-reels-head{display:grid;padding:14px;border-radius:16px}.ec-reels-form{grid-template-columns:1fr}.ec-reels-form .full,.ec-reels-form button,.ec-reels-upload-status{grid-column:1}.ec-reel{border-radius:16px;width:100%}.ec-reel-video-wrap{max-height:none;aspect-ratio:9/16}.ec-reels-upload{padding:12px}.ec-reels-form input,.ec-reels-form textarea,.ec-reels-form select{font-size:16px}.ec-reel-comment-form input{font-size:16px}}
  `;document.head.appendChild(s);
}

function ensureNav(){
  const nav=document.querySelector('.ec-top-nav');if(!nav)return false;
  if(nav.querySelector('[data-ec-page="reels"]'))return true;
  const button=el('button',null);button.type='button';button.dataset.ecPage='reels';button.title='Reels';button.setAttribute('aria-label','Reels');button.innerHTML='<b aria-hidden="true">▶</b><span>Reels</span>';
  button.onclick=()=>window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'reels'}}));
  const picker=nav.querySelector('.ec-region-picker');if(picker)nav.insertBefore(button,picker);else nav.appendChild(button);return true;
}

async function loadContext(){
  const {data:{user}}=await supabase.auth.getUser();currentUser=user||null;if(!user)return false;
  const [{data:profile},{data:regions}]=await Promise.all([
    supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,home_region_id,account_status').eq('id',user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name').eq('is_active',true)
  ]);
  currentProfile=profile||null;const slug=localStorage.getItem('ec-active-region');activeRegion=(regions||[]).find(r=>r.slug===slug)||(regions||[]).find(r=>r.id===profile?.home_region_id)||(regions||[])[0]||null;return Boolean(profile);
}

function publicVideo(path){return supabase.storage.from('community-reels').getPublicUrl(path).data.publicUrl;}

async function readVideoDuration(file){
  return new Promise((resolve,reject)=>{const v=document.createElement('video');const url=URL.createObjectURL(file);v.preload='metadata';v.onloadedmetadata=()=>{const d=v.duration;URL.revokeObjectURL(url);resolve(d)};v.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Video konnte nicht gelesen werden.'))};v.src=url;});
}

async function uploadReel(form,status){
  if(uploadBusy||!currentUser||!currentProfile)return;
  const file=form.elements.video.files?.[0];if(!file)return;
  if(!['video/mp4','video/webm','video/quicktime'].includes(file.type)){status.textContent='Bitte MP4, WebM oder MOV auswählen.';return;}
  if(file.size>80*1024*1024){status.textContent='Das Video ist zu groß. Maximal 80 MB.';return;}
  try{const duration=await readVideoDuration(file);if(duration>90){status.textContent='Reels dürfen maximal 90 Sekunden lang sein.';return;}}catch(e){status.textContent=e.message;return;}
  uploadBusy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;status.textContent='Reel wird hochgeladen …';
  const ext=(file.name.split('.').pop()||'mp4').toLowerCase();const path=`${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  try{
    const {error:uploadError}=await supabase.storage.from('community-reels').upload(path,file,{upsert:false,cacheControl:'3600'});if(uploadError)throw uploadError;
    const regionValue=form.elements.scope.value;const regionId=regionValue==='REGIONAL'?activeRegion?.id:null;
    const {error:insertError}=await supabase.from('community_reels').insert({author_id:currentUser.id,region_id:regionId,video_path:path,caption:form.elements.caption.value.trim()||null,status:'ACTIVE'});if(insertError){await supabase.storage.from('community-reels').remove([path]);throw insertError;}
    form.reset();status.textContent='✓ Reel veröffentlicht.';await renderFeed();
  }catch(error){status.textContent=`Upload fehlgeschlagen: ${error?.message||error}`;}finally{uploadBusy=false;button.disabled=false;}
}

async function loadFeed(){
  let query=supabase.from('community_reels').select('id,author_id,region_id,video_path,caption,status,created_at').eq('status','ACTIVE').order('created_at',{ascending:false}).limit(40);
  const {data:reels,error}=await query;if(error)return {error,reels:[]};
  const visible=(reels||[]).filter(r=>showAll||!r.region_id||r.region_id===activeRegion?.id);
  if(!visible.length)return {reels:[],profiles:new Map(),likes:[],comments:[]};
  const authorIds=[...new Set(visible.map(r=>r.author_id))];const reelIds=visible.map(r=>r.id);
  const [{data:profiles},{data:likes},{data:comments}]=await Promise.all([
    supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,role').in('id',authorIds),
    supabase.from('community_reel_likes').select('reel_id,user_id').in('reel_id',reelIds),
    supabase.from('community_reel_comments').select('id,reel_id,author_id,content,created_at').eq('status','ACTIVE').in('reel_id',reelIds).order('created_at',{ascending:true})
  ]);
  return {reels:visible,profiles:new Map((profiles||[]).map(p=>[p.id,p])),likes:likes||[],comments:comments||[]};
}

function observeVideos(root){
  observer?.disconnect();observer=new IntersectionObserver(entries=>entries.forEach(entry=>{const v=entry.target;if(entry.isIntersecting&&entry.intersectionRatio>.65)v.play().catch(()=>{});else v.pause();}),{threshold:[.2,.65,.9]});root.querySelectorAll('video').forEach(v=>observer.observe(v));
}

async function toggleLike(reelId,liked){
  if(!currentUser)return;if(liked)await supabase.from('community_reel_likes').delete().eq('reel_id',reelId).eq('user_id',currentUser.id);else await supabase.from('community_reel_likes').insert({reel_id:reelId,user_id:currentUser.id});await renderFeed();
}

async function addComment(reelId,input){
  const content=input.value.trim();if(!content||!currentUser)return;const {error}=await supabase.from('community_reel_comments').insert({reel_id:reelId,author_id:currentUser.id,content,status:'ACTIVE'});if(error){alert(error.message);return;}input.value='';await renderFeed();
}

async function reportReel(reelId){
  if(!currentUser)return;const reason=prompt('Warum möchtest du dieses Reel melden?');if(reason===null)return;if(reason.trim().length<3){alert('Bitte einen kurzen Grund angeben.');return;}const {error}=await supabase.from('community_reel_reports').upsert({reel_id:reelId,reporter_id:currentUser.id,reason:reason.trim(),status:'OPEN'},{onConflict:'reel_id,reporter_id'});alert(error?error.message:'Danke. Das Reel wurde zur Prüfung gemeldet.');
}

function roleStar(role){const r=String(role||'').toUpperCase();if(['HEAD_ADMIN','ADMIN','GLOBAL_ADMIN','REGIONAL_ADMIN'].includes(r))return'/role-star-red.svg';if(r==='SUPPORTER')return'/supporter-star.svg';return'/role-star-member.svg';}

function makeReelCard(reel,data){
  const author=data.profiles.get(reel.author_id)||{};const reelLikes=data.likes.filter(x=>x.reel_id===reel.id);const liked=reelLikes.some(x=>x.user_id===currentUser?.id);const comments=data.comments.filter(x=>x.reel_id===reel.id);
  const card=el('article','ec-reel');const wrap=el('div','ec-reel-video-wrap');const video=document.createElement('video');video.src=publicVideo(reel.video_path);video.playsInline=true;video.muted=true;video.loop=true;video.preload='metadata';wrap.appendChild(video);
  const sound=el('button','ec-reel-sound','🔇');sound.type='button';sound.title='Ton ein/aus';sound.onclick=()=>{video.muted=!video.muted;sound.textContent=video.muted?'🔇':'🔊';if(video.paused)video.play().catch(()=>{});};wrap.appendChild(sound);
  const overlay=el('div','ec-reel-overlay');const authorRow=el('div','ec-reel-author');const avatar=document.createElement('img');avatar.src=author.avatar_url||'/community-default-avatar.png';avatar.alt='';const authorCopy=el('div');const strong=el('strong');const star=document.createElement('img');star.src=roleStar(author.role);star.alt='';star.style.cssText='width:16px;height:16px;vertical-align:-3px;margin-right:5px';strong.append(star,document.createTextNode(profileName(author)));const small=el('small',null,`${reel.region_id?'Regional':'Global'} · ${fmt(reel.created_at)}`);authorCopy.append(strong,small);authorRow.append(avatar,authorCopy);overlay.appendChild(authorRow);if(reel.caption)overlay.appendChild(el('p','ec-reel-caption',reel.caption));wrap.appendChild(overlay);card.appendChild(wrap);
  const actions=el('div','ec-reel-actions');const like=el('button',liked?'is-liked':'',`${liked?'♥':'♡'} ${reelLikes.length}`);like.type='button';like.onclick=()=>void toggleLike(reel.id,liked);const commentToggle=el('button',null,`💬 ${comments.length}`);commentToggle.type='button';const report=el('button','ec-report','⚑ Melden');report.type='button';report.onclick=()=>void reportReel(reel.id);actions.append(like,commentToggle,report);card.appendChild(actions);
  const commentsBox=el('div','ec-reel-comments');const list=el('div','ec-reel-comments-list');comments.slice(-8).forEach(c=>{const row=el('div','ec-reel-comment');const cp=data.profiles.get(c.author_id);row.append(el('strong',null,profileName(cp)),el('span',null,c.content));list.appendChild(row);});const form=el('form','ec-reel-comment-form');const input=document.createElement('input');input.maxLength=500;input.placeholder='Kommentar schreiben …';const send=el('button',null,'Senden');send.type='submit';form.append(input,send);form.onsubmit=e=>{e.preventDefault();void addComment(reel.id,input)};commentsBox.append(list,form);commentToggle.onclick=()=>{commentsBox.hidden=!commentsBox.hidden;if(!commentsBox.hidden)input.focus();};commentsBox.hidden=true;card.appendChild(commentsBox);return card;
}

async function renderFeed(){
  const page=document.querySelector('.ec-reels-page');if(!page)return;const feed=page.querySelector('.ec-reels-feed');feed.replaceChildren(el('div','ec-reels-empty','Reels werden geladen …'));const data=await loadFeed();if(!document.body.contains(feed))return;feed.replaceChildren();if(data.error){feed.appendChild(el('div','ec-reels-empty',`Reels konnten nicht geladen werden: ${data.error.message}`));return;}if(!data.reels.length){feed.appendChild(el('div','ec-reels-empty',showAll?'Noch keine Reels vorhanden.':'Noch keine globalen oder regionalen Reels für diese Region vorhanden.'));return;}
  // load profiles for commenters not already present
  const commentAuthorIds=[...new Set(data.comments.map(c=>c.author_id).filter(id=>!data.profiles.has(id)))];if(commentAuthorIds.length){const {data:extra}=await supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,role').in('id',commentAuthorIds);(extra||[]).forEach(p=>data.profiles.set(p.id,p));}
  data.reels.forEach(reel=>feed.appendChild(makeReelCard(reel,data)));observeVideos(feed);
}

async function enterReels(){
  ensureStyles();if(!(await loadContext()))return;const main=document.querySelector('.modern-main');if(!main)return;main.classList.add('ec-reels-mode');let page=main.querySelector('.ec-reels-page');if(!page){page=el('section','ec-reels-page');const head=el('header','ec-reels-head');const copy=el('div');copy.innerHTML='<span>COMMUNITY REELS</span><h1>Reels aus deiner Community</h1><p>Kurze Videos aus der Region: Events, Vereine, Freizeit, Betriebe, Ausflugstipps und echte Community-Momente.</p>';const filters=el('div','ec-reels-filter');const regional=el('button',!showAll?'is-active':'',activeRegion?`${activeRegion.name} + Global`:'Regional + Global');const all=el('button',showAll?'is-active':'','Alle Reels');regional.type=all.type='button';regional.onclick=()=>{showAll=false;regional.classList.add('is-active');all.classList.remove('is-active');void renderFeed()};all.onclick=()=>{showAll=true;all.classList.add('is-active');regional.classList.remove('is-active');void renderFeed()};filters.append(regional,all);head.append(copy,filters);
    const upload=el('section','ec-reels-upload');upload.innerHTML='<h2>Eigenes Reel veröffentlichen</h2><p>MP4, WebM oder MOV · maximal 90 Sekunden · maximal 80 MB.</p>';const form=el('form','ec-reels-form');form.innerHTML=`<label class="full">Video auswählen<input type="file" name="video" accept="video/mp4,video/webm,video/quicktime" required></label><label class="full">Beschreibung<textarea name="caption" maxlength="800" placeholder="Worum geht es in deinem Reel?"></textarea></label><label>Sichtbarkeit<select name="scope"><option value="REGIONAL">Aktuelle Region + regional</option><option value="GLOBAL">Global – alle Regionen</option></select></label><div></div><button type="submit">Reel veröffentlichen</button><div class="ec-reels-upload-status" aria-live="polite"></div>`;form.onsubmit=e=>{e.preventDefault();void uploadReel(form,form.querySelector('.ec-reels-upload-status'))};upload.appendChild(form);const feed=el('div','ec-reels-feed');page.append(head,upload,feed);main.appendChild(page);}document.querySelectorAll('.ec-top-nav [data-ec-page]').forEach(b=>b.classList.toggle('is-active',b.dataset.ecPage==='reels'));await renderFeed();
}

function leaveReels(){observer?.disconnect();observer=null;const main=document.querySelector('.modern-main');main?.classList.remove('ec-reels-mode');main?.querySelector('.ec-reels-page')?.remove();}

function boot(retries=12){ensureStyles();if(ensureNav())return;if(retries>0){clearTimeout(navTimer);navTimer=setTimeout(()=>boot(retries-1),180)}}
window.addEventListener('ec:navigate',e=>{const page=e.detail?.page;if(page==='reels')setTimeout(()=>void enterReels(),30);else if(document.querySelector('.ec-reels-page'))leaveReels();setTimeout(()=>boot(3),80)});
window.addEventListener('ec:region-change',()=>{void loadContext().then(()=>{if(document.querySelector('.ec-reels-page'))void enterReels()})});
window.addEventListener('focus',()=>boot(2));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot(),{once:true});else boot();
