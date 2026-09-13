function hideNews(){
  document.querySelectorAll('nav button, nav a').forEach((item)=>{
    const label=String(item.textContent||'').trim();
    if(label.includes('Neuigkeiten'))item.style.display='none';
  });
}
function scheduleHideNews(){
  hideNews();
  setTimeout(hideNews,150);
  setTimeout(hideNews,500);
  setTimeout(hideNews,1200);
}
window.addEventListener('ec:navigate',scheduleHideNews);
window.addEventListener('ec:region-change',scheduleHideNews);
window.addEventListener('focus',scheduleHideNews);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleHideNews,{once:true});else scheduleHideNews();