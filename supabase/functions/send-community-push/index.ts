import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import webpush from "npm:web-push@3.6.7";

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return response({ error: "Anmeldung erforderlich" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("WEB_PUSH_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("WEB_PUSH_PRIVATE_KEY");
  const contact = Deno.env.get("WEB_PUSH_CONTACT");
  if (!url || !anon || !service) return response({ error: "Server-Konfiguration fehlt" }, 503);
  if (!vapidPublic || !vapidPrivate || !contact) return response({ error: "Push-Versandschlüssel fehlen" }, 503);
  const actor = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: identityError } = await actor.auth.getUser();
  if (identityError || !user) return response({ error: "Anmeldung ungültig" }, 401);
  const admin = createClient(url, service);
  const { data: profile, error: roleError } = await admin.from("profiles")
    .select("is_primary_head_admin,account_status").eq("id", user.id).single();
  if (roleError || !profile?.is_primary_head_admin || profile.account_status !== "ACTIVE")
    return response({ error: "Nur die Hauptadministration darf versenden" }, 403);
  let body: { action?: string };
  try { body = await request.json(); } catch { return response({ error: "Ungültige Anfrage" }, 400); }
  if (body.action !== "friendly-reminder") return response({ error: "Unbekannter Nachrichtentyp" }, 400);
  const { data: rows, error } = await admin.from("web_push_subscriptions")
    .select("id,endpoint,p256dh,auth,profiles!inner(account_status,is_test_account)")
    .eq("profiles.account_status", "ACTIVE").eq("profiles.is_test_account", false).limit(1000);
  if (error) return response({ error: "Push-Abonnements konnten nicht geladen werden" }, 500);
  webpush.setVapidDetails(contact, vapidPublic, vapidPrivate);
  const payload = JSON.stringify({
    title: "💙 Schön, dass du Teil von Ennstal Connect bist!",
    body: "Servus! 👋 Unsere Community lebt von dir. Schau gerne wieder vorbei, teile Neuigkeiten oder sag Hallo. Wir freuen uns auf dich! 💙",
    url: "/", tag: "ec-friendly-reminder"
  });
  let sent = 0, failed = 0;
  for (const row of rows || []) {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (error) {
      failed++;
      const code = (error as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("web_push_subscriptions").delete().eq("id", row.id);
    }
  }
  return response({ ok: true, sent, failed });
});
