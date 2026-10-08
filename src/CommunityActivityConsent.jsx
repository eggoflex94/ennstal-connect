import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function CommunityActivityConsent({ user }) {
  const [choice, setChoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setChoice(null); setError("");
    if (!user?.id) { setLoading(false); return; }
    supabase.from("community_email_preferences").select("activity_emails_enabled").eq("user_id", user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError("Die Einstellung konnte nicht geladen werden. Bitte später erneut versuchen.");
        else if (data) setChoice(data.activity_emails_enabled);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user?.id]);
  async function decide(enabled) {
    setSaving(true); setError("");
    const { error } = await supabase.from("community_email_preferences").upsert({
      user_id: user.id, activity_emails_enabled: enabled, decided_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) setError("Deine Entscheidung konnte nicht gespeichert werden. Bitte versuche es erneut.");
    else setChoice(enabled);
    setSaving(false);
  }
  if (!user?.id || loading || choice !== null) return null;
  return <div role="presentation" style={{ position:"fixed",inset:0,zIndex:99999,background:"rgba(6,17,28,.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto" }}>
    <section role="dialog" aria-modal="true" aria-labelledby="activity-consent-title" aria-describedby="activity-consent-info" style={{background:"#162b3c",color:"#fff",border:"1px solid #5787a0",borderRadius:16,padding:24,maxWidth:540,width:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 14px 60px #0009"}}>
      <h2 id="activity-consent-title">💙 Gemeinsam Ennstal Connect lebendig machen!</h2>
      <div id="activity-consent-info">
        <p>Unsere Community braucht dich! Momentan gibt es noch zu wenige Gruppen, wenig Austausch im Forum und zu wenige Aktivitäten. <strong>Ohne aktive Mitglieder kann eine Community auf Dauer nicht lebendig bleiben.</strong></p>
        <p>Schon kleine Dinge helfen: Eine Gruppe gründen, einen Forumsbeitrag schreiben, ein Foto teilen, Mitgliedern antworten oder regelmäßig vorbeischauen.</p>
        <p>Du kannst außerdem Community-Punkte sammeln, andere Mitglieder kennenlernen und als Verein, Unternehmen, Gemeinde oder Community-Fotograf mitmachen.</p>
        <p><strong>Dürfen wir dir gelegentlich freundliche Community-Neuigkeiten, Tipps und Erinnerungen per E-Mail senden?</strong> Deine Entscheidung ist freiwillig und hat keinen Einfluss auf dein Konto. Du kannst sie später jederzeit ändern.</p>
      </div>
      {error && <p role="alert">{error}</p>}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:20}}>
        <button type="button" disabled={saving} onClick={() => decide(true)}>Ja, Community-E-Mails erhalten</button>
        <button type="button" disabled={saving} onClick={() => decide(false)}>Nein, danke</button>
      </div>
    </section>
  </div>;
}
