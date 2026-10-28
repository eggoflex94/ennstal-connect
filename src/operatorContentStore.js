import {supabase} from './supabaseClient.js';
export async function loadPageBlocks(page,region='global') {
 if(!supabase)return [];
 const {data:{session}}=await supabase.auth.getSession();if(!session?.user)return [];
 const {data,error}=await supabase.from('operator_page_blocks').select('*').eq('page_key',page).eq('region_key',region);
 if(error)throw error;return data||[];
}
export async function savePageBlock(page,region,key,content,previous=null) {
 if(!supabase)throw new Error('Keine Verbindung zur Community.');
 const {data:{session}}=await supabase.auth.getSession();if(!session?.user)throw new Error('Bitte erneut anmelden.');
 const payload={page_key:page,region_key:region,block_key:key,content};
 const query=previous?supabase.from('operator_page_blocks').update({content}).eq('page_key',page).eq('region_key',region).eq('block_key',key).eq('updated_at',previous.updated_at):supabase.from('operator_page_blocks').insert(payload);
 const {data,error}=await query.select('*').maybeSingle();
 if(error)throw new Error(error.message);
 if(!data)throw new Error('Dieser Bereich wurde inzwischen geändert. Bitte neu laden und erneut bearbeiten.');
 window.dispatchEvent(new CustomEvent('ec:page-block-saved',{detail:data}));return data;
}
export function appendEditStamp(host,row) {
 const existing=host.querySelector(':scope > .ec-content-edit-stamp');
 if(existing?.dataset.revision===row?.updated_at)return;
 existing?.remove();if(!row?.updated_at)return;
 const stamp=document.createElement('small');stamp.className='ec-content-edit-stamp';stamp.dataset.revision=row.updated_at;
 const date=new Date(row.updated_at).toLocaleString('de-AT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Vienna'});
 stamp.append(document.createTextNode(`Zuletzt bearbeitet am ${date} von `));
 const p=row.editor_profile||{};
 const img=document.createElement('img');img.src=p.is_primary_head_admin?'/operator-crown-gold.svg':['HEAD_ADMIN','ADMIN'].includes(p.role)?'/role-star-red.svg':'/supporter-star.svg';img.alt=p.is_primary_head_admin?'Betreiber':'Rollenabzeichen';stamp.append(img,document.createTextNode(p.nickname||'Betreiber'));host.append(stamp);
}
