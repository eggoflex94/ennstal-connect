import './homepage-post-controls.css';

function run(){
  document.querySelectorAll('.homepage-form').forEach((form)=>{
    if(form.dataset.layoutReady)return;
    form.dataset.layoutReady='1';
    const style=form.querySelector('select[name="frame_style"]');
    const button=form.querySelector('button.primary-button');
    if(!style||!button)return;
    const width=document.createElement('select');width.innerHTML='<option value="ec-home-w-100">100 %</option><option value="ec-home-w-75">75 %</option><option value="ec-home-w-50">50 %</option><option value="ec-home-w-33">33 %</option>';
    const align=document.createElement('select');align.innerHTML='<option value="ec-home-center">Mitte</option><option value="ec-home-left">Links</option><option value="ec-home-right">Rechts</option>';
    const add=(label,control)=>{const wrap=document.createElement('label');wrap.className='ec-home-style-field';const text=document.createElement('span');text.textContent=label;wrap.append(text,control);form.insertBefore(wrap,button);};
    add('Breite',width);add('Position',align);
    const sync=()=>{const base=style.dataset.base||style.value||'standard';style.dataset.base=base.split(' ')[0];const value=style.dataset.base+' '+width.value+' '+align.value;let option=style.querySelector('[data-layout]');if(!option){option=document.createElement('option');option.dataset.layout='1';style.appendChild(option);}option.value=value;option.textContent='Benutzerdefiniert';style.value=value;};
    width.onchange=sync;align.onchange=sync;sync();
  });
}
window.addEventListener('ec:navigate',run);window.addEventListener('ec:region-change',run);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();