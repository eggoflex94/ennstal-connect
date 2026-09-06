const selectors=[".ec-legal-entry",".ec-privacy-entry",".ec-help-entry",".ec-notification-bell-wrap"];
let scheduled=false;
function cleanup(){scheduled=false;for(const selector of selectors){const nodes=[...document.querySelectorAll(selector)];nodes.slice(1).forEach(node=>node.remove());}}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(cleanup);}
const observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",cleanup,{once:true});else cleanup();
