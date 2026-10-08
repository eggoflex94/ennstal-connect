import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const bytes = key => Uint8Array.from(atob((key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0));
export default function PushSettings({ user }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const supported = Boolean(publicKey && typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  async function enable() {
    setBusy(true);
    try {
      if (await Notification.requestPermission() !== "granted") throw Error("Benachrichtigungen wurden nicht erlaubt.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) });
      const info = subscription.toJSON();
      const { error } = await supabase.from("web_push_subscriptions").upsert({
        user_id: user.id, endpoint: info.endpoint, p256dh: info.keys.p256dh, auth: info.keys.auth,
      }, { onConflict: "endpoint" });
      if (error) throw error;
      setStatus("Handy-Benachrichtigungen sind aktiviert. 💙");
    } catch (err) { setStatus(err.message || "Aktivierung fehlgeschlagen."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { error } = await supabase.from("web_push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", subscription.endpoint);
        if (error) throw error;
        await subscription.unsubscribe();
      }
      setStatus("Benachrichtigungen auf diesem Gerät deaktiviert.");
    } catch (err) { setStatus(err.message || "Deaktivierung fehlgeschlagen."); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Handy-Benachrichtigungen" style={{ margin: "12px 0", padding: 12 }}>
    <strong>🔔 Handy-Benachrichtigungen</strong>
    <p>Community-Nachrichten freiwillig aufs Handy bekommen? Du kannst das jederzeit abschalten.</p>
    {supported ? <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}><button type="button" onClick={enable} disabled={busy}>Aktivieren</button><button type="button" onClick={disable} disabled={busy}>Deaktivieren</button></div> : <p>Die Push-Funktion ist für dieses Gerät derzeit noch nicht verfügbar.</p>}
    {status && <p role="status">{status}</p>}
  </section>;
}