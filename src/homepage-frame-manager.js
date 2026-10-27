import { supabase } from './supabaseClient';
import './homepage-frame-manager.css';
const BLOCKS=[['next-activity','Nächste Aktivität','.ec-next-activity'],['community','Community-Aktuelles','.ec-growth-hub'],['join','Wer macht mit?','.ec-join-activities'],['welcome','Willkommen','.ec-new-member-start'],['discover','Menschen & Gruppen','.ec-discover']];
const orderOf=(key)=>BLOCKS.findIndex(item=>item[0]===key)*10;
export async function manageHomepageFrames(home,ctx){
  const old=home.querySelector(':scope > .ec-managed-home');if(old){old.querySelectorAll('[data-home-block]').forEach(node=>home.appendChild(node));old.remove()}
  const nodes=BLOCKS.map(([key,title,selector])=>({key,title,node:home.querySelector(':scope > '+selector)})).filter(item=>item.node);
  if(!nodes.length)return;
  const scope='REGION:'+ctx.region.id;
  const {data:rows,error}=await supabase.from('homepage_frame_layout').select('scope_key,block_key,sort_order,width_percent,is_visible').in('scope_key',['GLOBAL',scope]);
  const config=new Map();
  if(!error) for(const row of [...(rows||[]).filter(r=>r.scope_key==='GLOBAL'),...(rows||[]).filter(r=>r.scope_key===scope)])config.set(row.block_key,row);
  let canEdit=String(ctx.profile?.role||'').toUpperCase()==='HEAD_ADMIN';
  if(!canEdit){const {data:ok}=await supabase.rpc('has_permission',{permission_name:'manage_homepage'});canEdit=Boolean(ok)}
  const sorted=nodes.sort((a,b)=>(config.get(a.key)?.sort_order??orderOf(a.key))-(config.get(b.key)?.sort_order??orderOf(b.key)));
  const shell=document.createElement('section');shell.className='ec-managed-home';shell.setAttribute('aria-label','Startseiten-Rahmen');
  const heading=home.querySelector(':scope > .page-heading');heading?.insertAdjacentElement('afterend',shell)||home.prepend(shell);
  for(const item of sorted){
    item.node.dataset.homeBlock=item.key;
    const layout=config.get(item.key);
    item.node.classList.add('ec-managed-frame');
    item.node.style.setProperty('--ec-block-width',(layout?.width_percent||100)+'%');
    item.node.hidden=layout?.is_visible===false;
    shell.appendChild(item.node);
  }
  if(!canEdit||error)return;
  const controls=document.createElement('details');controls.className='ec-home-layout-admin';
  controls.innerHTML='<summary>✎ Startseite bearbeiten · Rahmen & Anordnung</summary><p>Rahmen ein- oder ausblenden, Breite einstellen und die Reihenfolge verschieben. Änderungen werden regional gespeichert.</p>';
  const list=document.createElement('div');list.className='ec-home-layout-list';
  const save=async(item,patch)=>{
    const current=config.get(item.key)||{block_key:item.key,scope_key:scope,sort_order:orderOf(item.key),width_percent:100,is_visible:true};
    const payload={...current,...patch,scope_key:scope,updated_by:ctx.user.id,updated_at:new Date().toISOString()};
    const {error:saveError}=await supabase.from('homepage_frame_layout').upsert(payload,{onConflict:'scope_key,block_key'});
    if(saveError){window.alert('Startseite konnte nicht gespeichert werden: '+saveError.message);return}
    config.set(item.key,payload);
    void manageHomepageFrames(home,ctx);
  };
  sorted.forEach((item,index)=>{
    const state=config.get(item.key)||{};
    const row=document.createElement('div');row.className='ec-home-layout-row';
    const label=document.createElement('strong');label.textContent=item.title;
    const toggle=document.createElement('label');toggle.textContent='Sichtbar ';const checked=document.createElement('input');checked.type='checkbox';checked.checked=state.is_visible!==false;checked.onchange=()=>void save(item,{is_visible:checked.checked});toggle.append(checked);
    const select=document.createElement('select');select.setAttribute('aria-label','Rahmenbreite für '+item.title);for(const n of [50,75,100]){const opt=document.createElement('option');opt.value=n;opt.textContent=n+' %';select.append(opt)}select.value=String(state.width_percent||100);select.onchange=()=>void save(item,{width_percent:Number(select.value)});
    const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='Nach oben';up.disabled=index===0;up.onclick=()=>void save(item,{sort_order:(config.get(sorted[index-1].key)?.sort_order??orderOf(sorted[index-1].key))-1});
    const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='Nach unten';down.disabled=index===sorted.length-1;down.onclick=()=>void save(item,{sort_order:(config.get(sorted[index+1].key)?.sort_order??orderOf(sorted[index+1].key))+1});
    row.append(label,toggle,select,up,down);list.append(row);
  });
  controls.append(list);shell.before(controls);
}
