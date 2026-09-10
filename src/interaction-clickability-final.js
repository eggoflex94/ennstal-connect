const STYLE_ID='ec-interaction-clickability-final-style';
let timer=null;

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
  .modern-main button,.modern-main a,.modern-main [role="button"],.modern-main summary,
  .ec-regional-shell button,.ec-regional-shell a,.ec-regional-shell [role="button"],
  .ec-right-dock button,.ec-right-dock a,.ec-right-dock [role="button"],
  .integrated-profile-view button,.integrated-profile-view a,.integrated-profile-view [role="button"],
  .member-profile-page button,.member-profile-page a,.member-profile-page [role="button"],
  .community-hub button,.community-hub a,.community-hub [role="button"],
  .ec-status-modal button,.ec-status-modal a,.ec-banner-manager button,.ec-banner-manager a,
  .ec-admin-workspace button,.ec-admin-workspace a,.content-editor-overlay button,.content-editor-overlay a,
  .auth-box button,.auth-box a,.auth-box input,.auth-box select{
    pointer-events:auto!important;
    position:relative;
  }

  .modern-main input,.modern-main textarea,.modern-main select,.modern-main input[type="file"],
  .integrated-profile-view input,.integrated-profile-view textarea,.integrated-profile-view select,
  .member-profile-page input,.member-profile-page textarea,.member-profile-page select,
  .ec-status-modal input,.ec-status-modal textarea,.ec-status-modal select,
  .ec-banner-manager input,.ec-banner-manager textarea,.ec-banner-manager select,
  .content-editor-overlay input,.content-editor-overlay textarea,.content-editor-overlay select,
  .auth-box input,.auth-box select{
    pointer-events:auto!important;
    touch-action:auto!important;
  }

  button:not(:disabled)>svg,button:not(:disabled)>img,button:not(:disabled)>i,button:not(:disabled)>b,button:not(:disabled)>span,
  a>svg,a>img,a>i,a>b,a>span,
  [role="button"]>svg,[role="button"]>img,[role="button"]>i,[role="button"]>b,[role="button"]>span{
    pointer-events:none!important;
  }

  .panel::before,.panel::after,.community-card::before,.community-card::after,
  .native-member-card::before,.native-member-card::after,
  .integrated-profile-hero::before,.integrated-profile-hero::after,
  .member-profile-hero::before,.member-profile-hero::after,
  .ec-personal-card::before,.ec-personal-card::after,
  .ec-right-dock::before,.ec-right-dock::after,
  .ec-top-nav::before,.ec-top-nav::after,
  .auth-box::before,.auth-box::after,.auth-box .panel::before,.auth-box .panel::after{
    pointer-events:none!important;
  }

  button:disabled,[aria-disabled="true"]{pointer-events:none!important;}

  @media(max-width:900px),(pointer:coarse){
    .modern-main button,.modern-main a,.modern-main [role="button"],
    .ec-top-nav button,.ec-right-dock button,.ec-right-dock a,
    .integrated-profile-actions button,.profile-primary-button,.profile-secondary-button,
    .native-member-main,.ec-match,.ec-for-you button,.ec-status-pill,.auth-box button{
      min-height:44px;
      touch-action:manipulation!important;
    }
    .auth-box input,.auth-box select,.integrated-profile-form input,.integrated-profile-form textarea,.integrated-profile-form select{
      min-height:46px!important;
      font-size:16px!important;
      touch-action:auto!important;
      user-select:text!important;
      -webkit-user-select:text!important;
    }
    .ec-top-nav button,.ec-right-dock button,.native-member-main,.ec-status-pill,.auth-box button{
      -webkit-tap-highlight-color:rgba(0,0,0,.08);
    }
  }
  `;document.head.appendChild(s);
}

function repair(root=document){
  ensureStyle();
  root.querySelectorAll('button,a,[role="button"],summary,input,textarea,select').forEach(el=>{
    if(el.matches(':disabled,[aria-disabled="true"]'))return;
    el.style.pointerEvents='auto';
  });

  /* Never rewrite button types here. Buttons without an explicit type inside a form
     are native submit buttons; changing them to type=button breaks login/register/save. */
  root.querySelectorAll('form button:not([type])').forEach(button=>{
    if(button.dataset.ecForcedButtonType==='1'){
      button.removeAttribute('type');
      delete button.dataset.ecForcedButtonType;
    }
  });
}

function schedule(retries=6){
  clearTimeout(timer);
  const run=left=>{repair();if(left>0)timer=setTimeout(()=>run(left-1),180);};
  run(retries);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(),{once:true});else schedule();
window.addEventListener('ec:navigate',()=>schedule(4));
window.addEventListener('ec:open-profile',()=>schedule(4));
window.addEventListener('ec:region-change',()=>schedule(3));
window.addEventListener('focus',()=>schedule(2));
window.addEventListener('resize',()=>schedule(2));
