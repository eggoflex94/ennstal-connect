/* Navigation runtime without full-page DOM observation.
   Touch devices keep the complete desktop navigation DOM. */
const MOBILE_QUERY='(max-width: 760px)';
const TOUCH_QUERY='(pointer: coarse)';
let queued=false;
function directPageButtons(nav){return[...nav.children].filter(node=>node.matches?.('button[data-ec-page]'))}
function enableMobileNav(nav){let rail=nav.querySelector(':scope > .ec-mobile-nav-rail');if(!rail){rail=document.createElement('div');rail.className='ec-mobile-nav-rail';rail.setAttribute('role','group');rail.setAttribute('aria-label','Hauptbereiche');nav.prepend(rail)}directPageButtons(nav).forEach(button=>rail.appendChild(button));nav.classList.add('ec-mobile-nav-ready')}
function disableMobileNav(nav){const rail=nav.querySelector(':scope > .ec-mobile-nav-rail');if(!rail)return;const picker=nav.querySelector(':scope > .ec-region-picker');[...rail.children].forEach(button=>nav.insertBefore(button,picker||rail));rail.remove();nav.classList.remove('ec-mobile-nav-ready')}
function sync(){queued=false;const nav=document.querySelector('.ec-top-nav');if(!nav)return;if(window.matchMedia(TOUCH_QUERY).matches){disableMobileNav(nav);return}if(window.matchMedia(MOBILE_QUERY).matches)enableMobileNav(nav);else disableMobileNav(nav)}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(sync)}
window.addEventListener('resize',schedule,{passive:true});
window.addEventListener('orientationchange',schedule,{passive:true});
window.addEventListener('ec:navigate',schedule);
window.addEventListener('ec:region-change',schedule);
window.addEventListener('focus',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{schedule();setTimeout(schedule,250);setTimeout(schedule,900)},{once:true});else{schedule();setTimeout(schedule,250);setTimeout(schedule,900)}
