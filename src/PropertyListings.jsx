import React,{useEffect,useState} from "react";
import {supabase} from "./supabaseClient";

const TYPES={APARTMENT:"Wohnung",HOUSE:"Haus",LAND:"Grundstück",COMMERCIAL:"Gewerbe",OTHER:"Sonstiges"};
const empty={title:"",description:"",offer_type:"SALE",property_type:"APARTMENT",location:"",price:"",area_sqm:"",rooms:"",contact_info:"",image_url:""};
export default function PropertyListings({user,canManage=false}){
 const [items,setItems]=useState([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[form,setForm]=useState(empty),[showForm,setShowForm]=useState(false);
 const [query,setQuery]=useState(""),[type,setType]=useState("ALL"),[offer,setOffer]=useState("ALL"),[maxPrice,setMaxPrice]=useState(""),[editing,setEditing]=useState(null);
 async function load(){const {data,error:e}=await supabase.from("property_listings").select("*").order("created_at",{ascending:false}).limit(200);if(e)setError(e.message);else{setItems(data||[]);setError("");}}
 useEffect(()=>{if(user?.id)void load();},[user?.id]);
 const update=(key,value)=>setForm(old=>({...old,[key]:value}));
 async function save(e){e.preventDefault();setBusy(true);setError("");
  const record={title:form.title.trim(),description:form.description.trim(),offer_type:form.offer_type,property_type:form.property_type,location:form.location.trim(),price:Number(form.price),area_sqm:form.area_sqm?Number(form.area_sqm):null,rooms:form.rooms?Number(form.rooms):null,contact_info:form.contact_info.trim(),image_url:form.image_url.trim()||null};
  if(!Number.isFinite(record.price)||record.price<0){setError("Bitte einen gültigen Preis eingeben.");setBusy(false);return;}
  const request=editing?supabase.from("property_listings").update(record).eq("id",editing):supabase.from("property_listings").insert({...record,owner_id:user.id});
  const {error:saveError}=await request;if(saveError)setError(saveError.message);else{setForm(empty);setEditing(null);setShowForm(false);await load();}setBusy(false);
 }
 async function review(item,status){if(!canManage)return;setBusy(true);const {error:e}=await supabase.from("property_listings").update({status}).eq("id",item.id);if(e)setError(e.message);else await load();setBusy(false);}
 async function close(item){if(!window.confirm("Dieses Immobilienangebot schließen?"))return;setBusy(true);const {error:e}=await supabase.from("property_listings").update({status:"CLOSED"}).eq("id",item.id);if(e)setError(e.message);else await load();setBusy(false);}
 const visible=items.filter(item=>(item.status==="ACTIVE"||item.owner_id===user?.id||canManage)&&(type==="ALL"||item.property_type===type)&&(offer==="ALL"||item.offer_type===offer)&&(!maxPrice||item.price<=Number(maxPrice))&&[item.title,item.location,item.description].join(" ").toLocaleLowerCase("de-AT").includes(query.toLocaleLowerCase("de-AT")));
 return <section className="panel" style={{margin:"18px 0",padding:18}} aria-label="Immobilienmarkt">
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}><div><span className="eyebrow">REGIONALER IMMOBILIENMARKT</span><h2>🏡 Immobilien kaufen & mieten</h2><p>Wohnungen, Häuser, Grundstücke und Gewerbeobjekte aus der Region.</p></div><button type="button" className="primary-button" onClick={()=>{setEditing(null);setForm(empty);setShowForm(v=>!v);}}>{showForm?"Abbrechen":"+ Immobilie anbieten"}</button></div>
 {showForm&&<form onSubmit={save} style={{display:"grid",gap:12,margin:"20px 0",padding:16,border:"1px solid #dae5ed",borderRadius:14}}>
 <h3>{editing?"Immobilienangebot bearbeiten":"Neues Immobilienangebot"}</h3>
 <label>Titel<input required minLength={5} maxLength={140} value={form.title} onChange={e=>update("title",e.target.value)} placeholder="z. B. 3-Zimmer-Wohnung in Liezen"/></label>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
 <label>Angebot<select value={form.offer_type} onChange={e=>update("offer_type",e.target.value)}><option value="SALE">Verkauf</option><option value="RENT">Vermietung</option></select></label>
 <label>Objektart<select value={form.property_type} onChange={e=>update("property_type",e.target.value)}>{Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>Ort / Region<input required minLength={2} maxLength={160} value={form.location} onChange={e=>update("location",e.target.value)}/></label>
 <label>Preis in € {form.offer_type==="RENT"?"pro Monat":""}<input type="number" min="0" step="0.01" required value={form.price} onChange={e=>update("price",e.target.value)}/></label>
 <label>Fläche in m²<input type="number" min="1" step="0.01" value={form.area_sqm} onChange={e=>update("area_sqm",e.target.value)}/></label>
 <label>Zimmer<input type="number" min="0.5" step="0.5" value={form.rooms} onChange={e=>update("rooms",e.target.value)}/></label></div>
 <label>Beschreibung<textarea required minLength={15} maxLength={6000} rows={5} value={form.description} onChange={e=>update("description",e.target.value)}/></label>
 <label>Bild-URL (optional, HTTPS)<input type="url" maxLength={1500} value={form.image_url} onChange={e=>update("image_url",e.target.value)} placeholder="https://..."/></label>
 <label>Kontakt (E-Mail, Telefonnummer oder Kontaktweg)<input required minLength={5} maxLength={250} value={form.contact_info} onChange={e=>update("contact_info",e.target.value)}/></label>
 <small>Das Angebot wird erst nach Prüfung und Freigabe durch einen Admin öffentlich sichtbar. Auch Änderungen an bestehenden Angeboten werden erneut geprüft.</small><small>Bitte nur Objekte anbieten, für die du berechtigt bist. Kontaktdaten sind für eingeloggte Mitglieder sichtbar.</small>
 <button type="submit" className="primary-button" disabled={busy}>{busy?"Speichern…":"Zur Admin-Freigabe einreichen"}</button></form>}
 {canManage&&<p role="status"><strong>{items.filter(item=>item.status==="PENDING").length}</strong> Immobilienangebote warten auf Admin-Freigabe.</p>}
 <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}><button type="button" onClick={()=>void load()} disabled={busy}>Angebote aktualisieren</button></div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,margin:"18px 0"}}>
 <label>Suche<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ort, Objekt, Stichwort"/></label>
 <label>Kaufen oder mieten<select value={offer} onChange={e=>setOffer(e.target.value)}><option value="ALL">Alle Angebote</option><option value="SALE">Kaufen</option><option value="RENT">Mieten</option></select></label>
 <label>Objektart<select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">Alle Objektarten</option>{Object.entries(TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>Maximalpreis €<input type="number" min="0" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="Ohne Limit"/></label></div>
 {error&&<p role="alert" style={{color:"#a12727"}}>{error}</p>}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,290px),1fr))",gap:14}}>{visible.map(item=><article key={item.id} style={{border:"1px solid #dbe5ee",borderRadius:15,overflow:"hidden",background:"#fff"}}>
 {item.image_url&&<img src={item.image_url} alt={item.title} loading="lazy" style={{width:"100%",height:180,objectFit:"cover"}}/>}
 <div style={{padding:14,display:"grid",gap:7}}><small>{item.offer_type==="RENT"?"Zur Miete":"Zum Kauf"} · {TYPES[item.property_type]} {item.status==="CLOSED"?"· Beendet":item.status==="PENDING"?"· Wartet auf Freigabe":item.status==="REJECTED"?"· Abgelehnt":""}</small><h3 style={{margin:0}}>{item.title}</h3><strong style={{fontSize:"1.2rem"}}>{Number(item.price).toLocaleString("de-AT",{style:"currency",currency:"EUR"})}{item.offer_type==="RENT"?"/Monat":""}</strong><span>📍 {item.location}</span><span>{item.area_sqm?item.area_sqm+" m²":""}{item.rooms?" · "+item.rooms+" Zimmer":""}</span><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.description}</p><p><b>Kontakt:</b> {item.contact_info}</p>
 {canManage&&item.status==="PENDING"&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" disabled={busy} onClick={()=>void review(item,"ACTIVE")}>✓ Freigeben</button><button type="button" disabled={busy} onClick={()=>void review(item,"REJECTED")}>✕ Ablehnen</button></div>}
 {(item.owner_id===user?.id||canManage)&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{item.status==="ACTIVE"&&<button type="button" disabled={busy} onClick={()=>{setForm({...item,price:String(item.price),area_sqm:item.area_sqm||"",rooms:item.rooms||"",image_url:item.image_url||""});setEditing(item.id);setShowForm(true);window.scrollTo({top:0,behavior:"smooth"});}}>Bearbeiten</button>}{item.status==="ACTIVE"&&<button type="button" disabled={busy} onClick={()=>void close(item)}>Angebot beenden</button>}</div>}</div></article>)}</div>
 {!visible.length&&!error&&<p>Hier sind derzeit keine passenden Immobilienangebote vorhanden.</p>}
 </section>;
}