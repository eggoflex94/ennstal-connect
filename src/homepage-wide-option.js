function addWideOptions(){
  document.querySelectorAll('select[data-frame-width], select[name="layout_width"]').forEach((select)=>{
    if(select.querySelector('option[value="120"]'))return;
    const option=document.createElement('option');
    option.value='120';
    option.textContent='Quer breit';
    select.insertBefore(option,select.firstChild);
  });
}
function scheduleWideOptions(){addWideOptions();setTimeout(addWideOptions,80);setTimeout(addWideOptions,250);}
document.addEventListener('click',(event)=>{if(event.target.closest('[data-frame-edit]'))scheduleWideOptions();});
window.addEventListener('ec:navigate',scheduleWideOptions);
window.addEventListener('ec:region-change',scheduleWideOptions);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleWideOptions,{once:true});else scheduleWideOptions();
