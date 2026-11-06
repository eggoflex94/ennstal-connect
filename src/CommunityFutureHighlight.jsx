import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const QUESTION = "Soll Ennstal Connect online bleiben und weiterkämpfen oder offline gehen?";
const INTRO = "Liebe Mitglieder! Ennstal Connect wurde geschaffen, um Menschen aus dem Ennstal und der Obersteiermark zu verbinden. In diese Community sind viel Zeit, Energie und Herzblut geflossen. Wir haben aktuell 49 registrierte Profile, aber nur wenig öffentlichen Austausch im Forum. Deshalb möchte ich euch alle um eine ehrliche Entscheidung bitten: Hat Ennstal Connect eine Zukunft? Niemandem wird ein Vorwurf gemacht – eure Stimme und eure Begründung helfen dabei, den richtigen Weg zu finden.";

export default function CommunityFutureHighlight({ user }) {
  const [myVote, setMyVote] = useState(null);
  const [counts, setCounts] = useState({ online: 0, offline: 0 });
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!supabase || !user?.id) { setLoading(false); return; }
    let cancelled = false;
    const refresh = async () => {
      const [mineResult, totalsResult] = await Promise.all([
        supabase.from("community_future_votes").select("choice,reason").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("community_future_vote_totals")
      ]);
      if (cancelled) return;
      if (mineResult.error || totalsResult.error) setError("Die Abstimmung konnte nicht geladen werden.");
      if (mineResult.data) {
        setMyVote(mineResult.data);
        setChoice(mineResult.data.choice);
        setReason(mineResult.data.reason);
      }
      if (totalsResult.data?.[0]) setCounts({ online: Number(totalsResult.data[0].online_count), offline: Number(totalsResult.data[0].offline_count) });
      setLoading(false);
    };
    void refresh();
    return () => { cancelled = true; };
  }, [user?.id]);

  const online = counts.online;
  const offline = counts.offline;
  const total = online + offline;
  async function submit(event) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (!user?.id) return setError("Bitte melde dich zum Abstimmen an.");
    if (!["ONLINE", "OFFLINE"].includes(choice)) return setError("Bitte wähle eine der beiden Möglichkeiten.");
    if (reason.trim().length < 10) return setError("Bitte begründe deine Entscheidung in mindestens 10 Zeichen.");
    setSaving(true);
    const { error: saveError } = await supabase.from("community_future_votes").upsert({
      user_id: user.id, choice, reason: reason.trim(), updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (saveError) {
      setError("Deine Stimme konnte nicht gespeichert werden: " + saveError.message);
    } else {
      const { data: totalsData, error: reloadError } = await supabase.rpc("community_future_vote_totals");
      if (reloadError) setError("Gespeichert, aber die Ergebnisse konnten nicht aktualisiert werden.");
      else if (totalsData?.[0]) setCounts({ online: Number(totalsData[0].online_count), offline: Number(totalsData[0].offline_count) });
      setMyVote({ choice, reason: reason.trim() });
      setSuccess("Danke! Deine Stimme und deine Begründung wurden gespeichert.");
    }
    setSaving(false);
  }
  const buttonStyle = (selected) => ({
    flex: "1 1 230px", padding: "14px", borderRadius: "13px", cursor: "pointer",
    border: selected ? "2px solid #f97316" : "1px solid #b9c5d4",
    background: selected ? "#fff0e5" : "#fff", color: "#192435",
    fontSize: "1rem", fontWeight: 700, textAlign: "left"
  });
  return <section aria-labelledby="ec-future-heading" style={{
    background: "linear-gradient(135deg,#450a0a,#7f1d1d 55%,#3f1018)", color: "white",
    border: "5px solid #ef4444", boxShadow: "0 0 0 4px rgba(127,29,29,.20), 0 18px 42px rgba(127,29,29,.32)",
    borderRadius: "20px", padding: "clamp(18px,4vw,36px)",
    marginBottom: "32px", position: "relative", width: "100%", boxSizing: "border-box", isolation: "isolate"
  }}>
    <div style={{display:"inline-block", background:"#dc2626", color:"#ffffff", fontWeight:900,
      borderRadius:"8px",padding:"11px 17px",marginBottom:"16px",fontSize:"clamp(.9rem,2vw,1.05rem)",letterSpacing:".04em",boxShadow:"0 3px 14px rgba(0,0,0,.3)"}}>
      🚨 WICHTIG – ALLE MITGLIEDER: BITTE JETZT ABSTIMMEN!
    </div>
    <h1 id="ec-future-heading" style={{fontSize:"clamp(1.7rem,4vw,2.5rem)",color:"white",margin:"0 0 14px"}}>
      Zukunft von Ennstal Connect – eure Entscheidung zählt!
    </h1>
    <p style={{whiteSpace:"pre-line",lineHeight:1.7,fontSize:"1.02rem",maxWidth:"850px"}}>{INTRO}</p>
    <p style={{fontWeight:800,fontSize:"1.12rem",color:"#fecaca"}}>{QUESTION}</p>
    <form onSubmit={submit} style={{background:"#f8fafc",color:"#162236",padding:"20px",borderRadius:"16px"}}>
      <div style={{display:"flex",gap:"12px",flexWrap:"wrap",marginBottom:"18px"}}>
        <button type="button" aria-pressed={choice==="ONLINE"} onClick={()=>setChoice("ONLINE")} style={buttonStyle(choice==="ONLINE")}>
          💚 Online lassen und weiterkämpfen
          <span style={{display:"block",fontSize:".85rem",fontWeight:400,marginTop:"5px"}}>Gemeinsam verbessern und wieder aktiver werden</span>
        </button>
        <button type="button" aria-pressed={choice==="OFFLINE"} onClick={()=>setChoice("OFFLINE")} style={buttonStyle(choice==="OFFLINE")}>
          🔴 Offline gehen und aufgeben
          <span style={{display:"block",fontSize:".85rem",fontWeight:400,marginTop:"5px"}}>Die Community nicht weiter betreiben</span>
        </button>
      </div>
      <label htmlFor="community-future-reason" style={{display:"block",fontWeight:700,marginBottom:"8px"}}>
        Deine Begründung – warum hast du so entschieden? (Pflichtfeld)
      </label>
      <textarea id="community-future-reason" rows={4} maxLength={2000} value={reason}
        onChange={(event)=>setReason(event.target.value)}
        placeholder="Was müsste sich ändern? Warum möchtest du weitermachen oder schließen?"
        style={{width:"100%",boxSizing:"border-box",border:"1px solid #94a3b8",borderRadius:"10px",padding:"12px",background:"#fff",color:"#162236"}}/>
      <div style={{display:"flex",flexWrap:"wrap",gap:"12px",alignItems:"center",marginTop:"12px"}}>
        <button type="submit" disabled={saving || loading || !choice || reason.trim().length < 10}
          style={{background:"#b91c1c",color:"#fff",border:0,borderRadius:"10px",fontWeight:800,padding:"13px 21px",cursor:"pointer"}}>
          {saving ? "Wird gespeichert…" : myVote ? "Stimme und Begründung aktualisieren" : "Verbindlich abstimmen"}
        </button>
        <span style={{fontSize:".86rem",color:"#475569"}}>Eine Stimme pro Mitglied. Du kannst deine Wahl ändern.</span>
      </div>
      {error && <p role="alert" style={{color:"#b91c1c",fontWeight:700}}>{error}</p>}
      {success && <p role="status" style={{color:"#166534",fontWeight:700}}>{success}</p>}
      <div style={{borderTop:"1px solid #cbd5e1",marginTop:"19px",paddingTop:"15px"}}>
        <strong>Aktueller Stand: {total} Stimme{total===1?"":"n"}</strong>
        <div style={{display:"flex",gap:"12px",flexWrap:"wrap",marginTop:"9px"}}>
          <span>💚 Online lassen: {online} ({total?Math.round(online/total*100):0} %)</span>
          <span>🔴 Offline gehen: {offline} ({total?Math.round(offline/total*100):0} %)</span>
        </div>
        <p style={{fontSize:".82rem",color:"#475569",marginTop:"10px"}}>
          Deine Begründung wird für die Auswertung gespeichert. Bitte keine privaten Daten anderer Personen angeben.
        </p>
      </div>
    </form>
    <p style={{marginTop:"15px",fontWeight:700}}>Auch wenn du bisher nur still mitgelesen hast: Bitte stimme ab. Nur mit eurer ehrlichen Rückmeldung können wir entscheiden, wie es weitergeht. ❤️</p>
  </section>;
}
