import React,{useEffect,useState} from "react";
import {supabase} from "./supabaseClient";
export default function KaufpunkteMarket({user,profile}) {
 const [market,setMarket]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[visible,setVisible]=useState(false);
 const isHead=Boolean(profile?.is_primary_head_admin);
 async function load(){if(!user)return;const {data,error}=await supabase.rpc("kaufpunkte_my_marketplace");if(error)setError(error.message);else{setMarket(data);setError("");}}
 useEffect(()=>{void load();},[user?.id]);
 async function buy(sku,title,price){if(!window.confirm(title+" für "+price+" [k] Kaufpunkte kaufen?"))return;setBusy(true);const {error}=await supabase.rpc("kaufpunkte_buy",{p_sku:sku});if(error)setError(error.message);else await load();setBusy(false);}
 async function changePrice(sku,current){const raw=window.prompt("Neuer Preis in Kaufpunkten [k]",String(current));if(raw===null)return;const price=Number(raw);if(!Number.isSafeInteger(price)||price<0){setError("Bitte eine gültige ganze Zahl angeben.");return;}setBusy(true);const {error}=await supabase.rpc("kaufpunkte_set_price",{p_sku:sku,p_price:price});if(error)setError(error.message);else await load();setBusy(false);}
 if(!user)return null;
 return <section className="panel" style={{margin:"16px 0",padding:18}} aria-label="Kaufpunkte-Marktplatz">
 <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center"}}>
 <div><span className="eyebrow">NEU · MARKTPLATZ</span><h2 style={{margin:"4px 0"}}>🛍️ Kaufpunkte-Marktplatz</h2><p>Gestalte dein Profil mit Kaufpunkten. Gekaufte Designs bleiben dein Eigentum.</p></div>
 <button type="button" onClick={()=>setVisible(v=>!v)}>{visible?"Marktplatz schließen":"Marktplatz ansehen"}</button>
 </div>
 <p><strong>{Number(market?.normal_points??profile?.points??0).toLocaleString("de-AT")} Punkte · {Number(market?.balance??profile?.purchase_points??0).toLocaleString("de-AT")} [k]</strong> Kaufpunkte</p>
 {visible&&<><p>Kaufpunkte erhältst du zusätzlich zu deinen normalen Punkten. Jeder Kauf reduziert nur dein [k]-Guthaben.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
 {(market?.catalog||[]).map(item=>{const owned=item.kind!=="SUPPORTER" && (market.owned||[]).includes(item.sku);return <article key={item.sku} style={{border:"1px solid #5b8091",padding:14,borderRadius:12}}>
 {item.kind==="LAYOUT" && <div className={"ec-market-preview "+item.sku} style={{border:"2px solid #6cc7de",borderRadius:14,padding:12,marginBottom:12,background:"linear-gradient(135deg,#18384e,#356b89)",color:"#fff",minHeight:100}}><div style={{display:"flex",gap:10,alignItems:"center"}}><img src={profile?.avatar_url||"/default-avatar.svg"} alt="" style={{width:42,height:42,borderRadius:"50%"}}/><div><strong>{profile?.nickname||"Dein Profil"}</strong><small style={{display:"block"}}>Mitglied · Profilrahmen</small></div></div></div>}
 <strong>{item.kind==="LAYOUT"?"🎨":item.kind==="SUPPORTER"?"⭐":"👀"} {item.title}</strong><p>{item.description}</p><p><strong>{item.price} [k]</strong></p>
 <button type="button" disabled={busy||owned||Number(market.balance)<item.price} onClick={()=>buy(item.sku,item.title,item.price)}>{owned?"Bereits erworben":Number(market.balance)<item.price?"Nicht genug [k]":"Jetzt kaufen"}</button>
 {isHead&&<p><button type="button" disabled={busy} onClick={()=>changePrice(item.sku,item.price)}>Preis bearbeiten</button></p>}</article>})}</div></>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}