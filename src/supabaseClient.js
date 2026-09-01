import { createClient } from "@supabase/supabase-js";

// Supabase configuration is supplied by the Vite/Cloudflare build variables.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Configuration problems must not prevent the public login screen from rendering.
// The app displays a helpful message when a login is attempted instead.
export const isSupabaseConfigured = Boolean(
  supabaseUrl?.startsWith("https://") && supabaseAnonKey
);
export const supabaseUnavailableMessage =
  "Die Anmeldung ist momentan nicht erreichbar. Bitte versuche es später erneut.";

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!supabase) {
  // The missing configuration is deliberately not logged: it may contain deployment details.
} else {

const originalRpc = supabase.rpc.bind(supabase);
supabase.rpc = async (fn, args = {}, options) => {
  if (fn === "accept_friend_request") {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id || !args?.friendship_id) return { data: null, error: new Error("Nicht eingeloggt.") };
    const { data, error } = await supabase.from("friendships")
      .update({ status: "ACCEPTED" })
      .eq("id", args.friendship_id)
      .eq("receiver_id", user.id)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();
    if (error) return { data: null, error };
    if (!data) return { data: null, error: new Error("Freundschaftsanfrage nicht gefunden oder bereits beantwortet.") };
    return { data: null, error: null };
  }

  if (fn === "submit_user_report") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !/schema cache/i.test(rpcResult.error.message || "")) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    const target = args?.target_user;
    const reason = String(args?.reason_text || "").trim();
    if (!user?.id) return { data: null, error: new Error("Nicht eingeloggt.") };
    if (!target || target === user.id) return { data: null, error: new Error("Ungültiger Nutzer.") };
    if (reason.length < 3) return { data: null, error: new Error("Bitte einen Meldegrund angeben.") };
    const { error } = await supabase.from("user_reports").insert({ reporter_id: user.id, reported_user_id: target, reason, status: "PENDING", created_at: new Date().toISOString() });
    return { data: null, error };
  }

  if (fn === "create_user_block") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !/schema cache/i.test(rpcResult.error.message || "")) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    const target = args?.target_user;
    if (!user?.id) return { data: null, error: new Error("Nicht eingeloggt.") };
    if (!target || target === user.id) return { data: null, error: new Error("Ungültiger Nutzer.") };
    const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: target });
    return { data: null, error };
  }

  if (fn === "remove_user_block") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !/schema cache/i.test(rpcResult.error.message || "")) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    const target = args?.target_user;
    if (!user?.id) return { data: null, error: new Error("Nicht eingeloggt.") };
    const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target);
    return { data: null, error };
  }

  if (fn === "admin_warn_user") {
    const { data: { user } } = await supabase.auth.getUser();
    const target = args?.target_user;
    const warning = String(args?.warning_text || "").trim();
    if (!user?.id) return { data: null, error: new Error("Nicht eingeloggt.") };
    if (!target || !warning) return { data: null, error: new Error("Ungültige Verwarnung.") };
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !/schema cache/i.test(rpcResult.error.message || "")) return rpcResult;
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!me || !["ADMIN", "HEAD_ADMIN"].includes(me.role)) return rpcResult;
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, receiver_id: target, content: `⚠️ Offizielle Verwarnung durch die Community-Moderation:\n\n${warning}`, is_read: false, created_at: new Date().toISOString() });
    return { data: null, error };
  }

  if (fn === "admin_get_permissions") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !/schema cache/i.test(rpcResult.error.message || "")) return rpcResult;
    const { data, error } = await supabase.from("user_permissions").select("*").eq("user_id", args?.target_user).maybeSingle();
    if (error) return { data: null, error };
    const { user } = (await supabase.auth.getUser()).data;
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user?.id).maybeSingle();
    if (me?.role !== "HEAD_ADMIN") return { data: null, error: new Error("Nur der Global Admin darf Berechtigungen einsehen.") };
    const copy = { ...(data || {}) }; delete copy.user_id; delete copy.updated_at;
    return { data: copy, error: null };
  }

  return originalRpc(fn, args, options);
};
}
