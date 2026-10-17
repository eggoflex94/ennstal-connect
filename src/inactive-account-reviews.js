import { supabase } from './supabaseClient';

const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
export async function openInactiveAccountReviews(){
  document.querySelector('.ec-inactive-review-overlay')?.remove();
  const overlay=element('div','ec-inactive-review-overlay');
  Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'2147483000',background:'rgba(0,0,0,.68)',display:'grid',placeItems:'center',padding:'16px'});
  const panel=element('section','ec-inactive-review-panel');
  Object.assign(panel.style,{width:'min(760px,100%)',maxHeight:'85vh',overflowY:'auto',background:'#18212d',color:'#fff',padding:'24px',borderRadius:'16px',boxShadow:'0 18px 80px #0008'});
  const heading=element('h2',null,'Inaktivitätsmeldungen für Hauptadmins');
  const info=element('p',null,'Nur Hauptadmins entscheiden. Eine Sperre passiert niemals automatisch. Nichts tun verändert keine Punkte. Sperren nutzt die bestehende Punkte- und Sperrlogik (Schwelle −10).');
  const close=element('button',null,'Schließen');close.type='button';close.onclick=()=>overlay.remove();
  const status=element('p',null,'Lade Hinweise …');status.setAttribute('role','status');
  const list=element('div');
  panel.append(heading,info,close,status,list);overlay.append(panel);document.body.append(overlay);
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
  async function refresh(){
    const {error:scanError}=await supabase.rpc('ec_refresh_inactive_account_reviews');
    if(scanError){status.textContent='Inaktivitätsprüfung nicht verfügbar: '+scanError.message;return;}
    const {data,error}=await supabase.rpc('ec_list_inactive_account_reviews');
    if(error){status.textContent='Hinweise konnten nicht geladen werden: '+error.message;return;}
    list.replaceChildren();
    status.textContent=(data||[]).length+' offene Inaktivitäts-Hinweise';
    for(const item of data||[]){
      const card=element('article');Object.assign(card.style,{border:'1px solid #637083',borderRadius:'12px',padding:'16px',marginTop:'12px'});
      card.append(element('strong',null,item.display_name||'Mitglied'),element('p',null,`${item.days_inactive} Tage inaktiv · Punkte: ${item.points??0} · Zuletzt: ${new Date(item.inactive_since).toLocaleDateString('de-AT')}`));
      const actions=element('div');Object.assign(actions.style,{display:'flex',gap:'10px',flexWrap:'wrap'});
      for(const [decision,label] of [['IGNORE','Nichts tun'],['SUSPEND','Wegen Inaktivität sperren']]){
        const button=element('button',null,label);button.type='button';button.style.padding='10px 14px';button.style.borderRadius='8px';
        button.onclick=async()=>{
          if(decision==='SUSPEND'&&!confirm(`${item.display_name} wegen 30 Tagen Inaktivität sperren? Der Punktestand wird bei Bedarf bis auf −10 gesenkt.`))return;
          actions.querySelectorAll('button').forEach(b=>b.disabled=true);
          const {data:message,error:actionError}=await supabase.rpc('ec_decide_inactive_account_review',{p_review_id:item.id,p_decision:decision});
          if(actionError){status.textContent=actionError.message;actions.querySelectorAll('button').forEach(b=>b.disabled=false);return;}
          status.textContent=message||'Entscheidung gespeichert';card.remove();void refresh();
        };
        actions.append(button);
      }
      card.append(actions);list.append(card);
    }
  }
  void refresh();
}
