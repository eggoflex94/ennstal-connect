import('./supabaseClient.js').then(({supabase})=>{
  window.__ecHomeSupabase=supabase;
  const addScope=()=>document.querySelectorAll('.homepage-form').forEach((form)=>{
    if(form.querySelector('[name="publication_scope"]'))return;
    const button=form.querySelector('button.primary-button');if(!button)return;
    const label=document.createElement('label');label.className='ec-home-style-field';
    label.innerHTML='<span>Sichtbarkeit</span><select name="publication_scope"><option value="REGION">Nur diese Region</option><option value="GLOBAL">Global - alle Regionen</option></select>';
    form.insertBefore(label,button);
  });
  window.addEventListener('ec:navigate',addScope);window.addEventListener('ec:region-change',addScope);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addScope,{once:true});else addScope();
});
