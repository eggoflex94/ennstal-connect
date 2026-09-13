import './temporary-supporter-admin.js';

import('./supabaseClient.js').then(({supabase})=>{
  async function render(){
    const home=document.querySelector('.home-page');
    if(!home)return;
    home.querySelector('.ec-global-homepage-sections')?.remove();
    const {data}=await supabase.from('homepage_sections').select('id,title,content,image_url,frame_style').eq('is_visible',true).eq('publication_scope','GLOBAL').order('sort_order',{ascending:true});
    if(!data?.length)return;
    const wrap=document.createElement('div');
    wrap.className='homepage-sections ec-global-homepage-sections';
    for(const row of data){
      const article=document.createElement('article');
      article.className='homepage-frame '+(row.frame_style||'standard');
      if(row.image_url){const img=document.createElement('img');img.src=row.image_url;img.alt='';article.appendChild(img);}
      const body=document.createElement('div');
      const kicker=document.createElement('span');kicker.className='frame-kicker';kicker.textContent='GLOBAL · ENNSTAL CONNECT';
      const title=document.createElement('h2');title.textContent=row.title||'';
      const text=document.createElement('p');text.textContent=row.content||'';
      body.append(kicker,title,text);article.appendChild(body);wrap.appendChild(article);
    }
    const regional=home.querySelector(':scope > .homepage-sections');
    const editor=home.querySelector(':scope > .homepage-editor-toggle');
    if(regional)regional.before(wrap);else if(editor)editor.after(wrap);else home.appendChild(wrap);
  }
  window.addEventListener('ec:navigate',render);
  window.addEventListener('ec:region-change',render);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
});
