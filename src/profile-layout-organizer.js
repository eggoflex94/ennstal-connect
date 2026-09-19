let scheduled=false;
let organizing=false;

const text=(node)=>String(node?.textContent||"").trim().toLowerCase();
const visible=(node)=>node && !node.hidden;

function button(key,label,icon){
  const el=document.createElement("button");
  el.type="button";
  el.dataset.profileEditorTab=key;
  el.innerHTML=`<span aria-hidden="true">${icon}</span><strong>${label}</strong>`;
  return el;
}

function ensureEditorTabs(){
  const form=document.querySelector(".profile-page-layout .profile-form.profile-editor");
  if(!form || form.dataset.profileTabsReady==="1") return;

  form.querySelectorAll('[name="profile_accent"],[name="profile_background_color"]').forEach((input)=>{
    const label=input.closest("label");
    if(label) label.remove();
    else input.remove();
  });

  const header=form.querySelector(".profile-editor-header");
  if(!header) return;

  const nav=document.createElement("nav");
  nav.className="profile-editor-tabbar";
  nav.setAttribute("aria-label","Profil gestalten");
  [
    ["basis","Basisdaten","◎"],
    ["bilder","Bilder","▣"],
    ["about","Über mich","✎"],
    ["inhalte","Inhalte","▤"],
    ["sichtbarkeit","Sichtbarkeit","◉"]
  ].forEach(([key,label,icon])=>nav.appendChild(button(key,label,icon)));
  header.insertAdjacentElement("afterend",nav);

  const panels={};
  for(const key of ["basis","bilder","about","inhalte","sichtbarkeit"]){
    const panel=document.createElement("section");
    panel.className="profile-editor-tabpanel";
    panel.dataset.profileEditorPanel=key;
    panels[key]=panel;
    nav.insertAdjacentElement("afterend",panel);
  }

  const all=[...form.children].filter((node)=>
    node!==header && node!==nav && !node.matches(".profile-editor-tabpanel") &&
    !node.matches(".profile-editor-actions")
  );

  const moveLabel=(inputName,target)=>{
    const input=form.querySelector(`[name="${inputName}"]`);
    const label=input?.closest("label");
    if(label && !target.contains(label)) target.appendChild(label);
  };

  all.forEach((node)=>{
    const t=text(node);
    if(node.matches(".layout-rewards,.privacy-settings,.verification-request,.head-admin-responsibilities-field,.profile-media-delete-actions,.public-profile-preview-button")){
      panels.sichtbarkeit.appendChild(node); return;
    }
    if(node.matches("fieldset")){
      const legend=text(node.querySelector("legend"));
      if(/bilder/.test(legend)){panels.bilder.appendChild(node);return;}
      if(/links|soziale/.test(legend)){panels.inhalte.appendChild(node);return;}
      if(/community-design|unternehmer|layout|darstellung/.test(legend)||node.classList.contains("layout-rewards")){panels.sichtbarkeit.appendChild(node);return;}
      if(/persönliche angaben/.test(legend)){panels.basis.appendChild(node);return;}
      if(/grunddaten/.test(legend)){panels.basis.appendChild(node);return;}
    }
    panels.inhalte.appendChild(node);
  });

  const about=document.createElement("fieldset");
  about.className="profile-editor-section profile-editor-about-group";
  about.innerHTML="<legend>Über mich</legend>";
  panels.about.appendChild(about);
  moveLabel("bio",about);
  const typography=form.querySelector(".profile-typography-grid");
  if(typography) about.appendChild(typography);

  ["nickname","gender","location","interests"].forEach((name)=>moveLabel(name,panels.basis));
  ["instagram_username","snapchat_username","website"].forEach((name)=>moveLabel(name,panels.inhalte));

  const contentIntro=document.createElement("div");
  contentIntro.className="profile-editor-content-note";
  contentIntro.innerHTML="<strong>Deine Profilinhalte</strong><p>Fotos, Videos, Gruppen und geteilte Inhalte werden im sichtbaren Profil kompakt in Reitern zusammengefasst.</p>";
  panels.inhalte.insertAdjacentElement("afterbegin",contentIntro);

  const actions=form.querySelector(".profile-editor-actions");
  if(actions) form.appendChild(actions);

  let active="basis";
  const activate=(key)=>{
    active=key;
    nav.querySelectorAll("button").forEach((btn)=>{
      const on=btn.dataset.profileEditorTab===key;
      btn.classList.toggle("active",on);
      btn.setAttribute("aria-pressed",on?"true":"false");
    });
    Object.entries(panels).forEach(([name,panel])=>{panel.hidden=name!==key;});
  };
  nav.addEventListener("click",(event)=>{
    const btn=event.target.closest("[data-profile-editor-tab]");
    if(btn) activate(btn.dataset.profileEditorTab);
  });
  activate(active);
  form.dataset.profileTabsReady="1";
}

function profileContentSections(page){
  return [...page.children].filter((node)=>{
    if(node.matches(".back-button,.ec-mp-card,.ec-mp-actions,.member-profile-actions,.profile-highlights,.member-admin-tools,.head-admin-media-tools,.feature-unlocks,.member-business-tool,.profile-content-tabs-runtime")) return false;
    return node.matches(".personal-profile-sections,.ec-profile-photo-album,.public-photo-folder,.member-groups,.public-friends,.ec-profile-shared-items,.business-profile-extended,.ec-business-profile-extended");
  });
}

function category(node){
  if(node.matches(".ec-profile-photo-album,.public-photo-folder")) return "fotos";
  if(node.matches(".member-groups")) return "gruppen";
  if(node.matches(".public-friends")) return "freunde";
  if(node.matches(".ec-profile-shared-items")) return "geteilt";
  if(node.matches(".business-profile-extended,.ec-business-profile-extended")) return "business";
  return "inhalte";
}

function ensureProfileContentTabs(){
  document.querySelectorAll(".member-profile-page").forEach((page)=>{
    const sections=profileContentSections(page);
    if(!sections.length) return;

    let tabs=page.querySelector(":scope > .profile-content-tabs-runtime");
    if(!tabs){
      tabs=document.createElement("section");
      tabs.className="profile-content-tabs-runtime";
      tabs.innerHTML=`
        <nav class="profile-content-tabbar" aria-label="Profilinhalte">
          <button type="button" data-profile-content-tab="inhalte">▤ Inhalte</button>
          <button type="button" data-profile-content-tab="fotos">▣ Fotos</button>
          <button type="button" data-profile-content-tab="gruppen">● Gruppen</button>
          <button type="button" data-profile-content-tab="geteilt">↗ Geteilt</button>
          <button type="button" data-profile-content-tab="freunde">♡ Freunde</button>
          <button type="button" data-profile-content-tab="business">★ Unternehmen</button>
        </nav>
        <div class="profile-content-tab-stage"></div>`;
      const anchor=page.querySelector(":scope > .profile-highlights") || page.querySelector(":scope > .ec-mp-actions") || page.querySelector(":scope > .member-profile-actions") || page.querySelector(":scope > .ec-mp-card");
      anchor?.insertAdjacentElement("afterend",tabs);
      tabs.addEventListener("click",(event)=>{
        const btn=event.target.closest("[data-profile-content-tab]");
        if(!btn) return;
        tabs.dataset.activeTab=btn.dataset.profileContentTab;
        refreshProfileTabs(page);
      });
    }
    refreshProfileTabs(page);
  });
}

function refreshProfileTabs(page){
  const tabs=page.querySelector(":scope > .profile-content-tabs-runtime");
  if(!tabs) return;
  const sections=profileContentSections(page);
  const counts={inhalte:0,fotos:0,gruppen:0,geteilt:0,freunde:0,business:0};
  sections.forEach((node)=>{counts[category(node)]++;});
  let active=tabs.dataset.activeTab||"inhalte";
  if(!counts[active]) active=Object.keys(counts).find((key)=>counts[key])||"inhalte";
  tabs.dataset.activeTab=active;

  tabs.querySelectorAll("[data-profile-content-tab]").forEach((btn)=>{
    const key=btn.dataset.profileContentTab;
    btn.hidden=!counts[key];
    const on=key===active;
    btn.classList.toggle("active",on);
    btn.setAttribute("aria-pressed",on?"true":"false");
  });

  sections.forEach((node)=>{
    node.classList.toggle("profile-tab-hidden",category(node)!==active);
  });
}

function organize(){
  if(organizing) return;
  organizing=true;
  try{
    ensureEditorTabs();
    ensureProfileContentTabs();
  }finally{
    organizing=false;
  }
}

function schedule(){
  if(scheduled) return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;organize();});
}

document.addEventListener("DOMContentLoaded",schedule);
window.addEventListener("popstate",schedule);
const observer=new MutationObserver((mutations)=>{
  if(mutations.some((m)=>m.addedNodes.length||m.removedNodes.length)) schedule();
});
observer.observe(document.documentElement,{childList:true,subtree:true});
schedule();
