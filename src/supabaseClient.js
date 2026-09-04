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
const canUseClientFallback = (error) => /schema cache|function\s+.*does not exist|function\s+upper\(user_role\)\s+does not exist/i.test(error?.message || "");
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
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
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
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    const target = args?.target_user;
    if (!user?.id) return { data: null, error: new Error("Nicht eingeloggt.") };
    if (!target || target === user.id) return { data: null, error: new Error("Ungültiger Nutzer.") };
    const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: target });
    return { data: null, error };
  }

  if (fn === "remove_user_block") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
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
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!me || !["ADMIN", "HEAD_ADMIN"].includes(me.role)) return rpcResult;
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, receiver_id: target, content: `⚠️ Offizielle Verwarnung durch die Community-Moderation:\n\n${warning}`, is_read: false, created_at: new Date().toISOString() });
    return { data: null, error };
  }

  if (fn === "admin_get_permissions") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
    const { data, error } = await supabase.from("user_permissions").select("*").eq("user_id", args?.target_user).maybeSingle();
    if (error) return { data: null, error };
    const { user } = (await supabase.auth.getUser()).data;
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user?.id).maybeSingle();
    if (me?.role !== "HEAD_ADMIN") return { data: null, error: new Error("Nur der Global Admin darf Berechtigungen einsehen.") };
    const copy = { ...(data || {}) }; delete copy.user_id; delete copy.updated_at;
    return { data: copy, error: null };
  }

  if (fn === "admin_set_permissions") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user?.id).maybeSingle();
    if (me?.role !== "HEAD_ADMIN") return { data: null, error: new Error("Nur der Global Admin darf Berechtigungen ändern.") };
    const { error } = await supabase.from("user_permissions").upsert({
      user_id: args?.target_user,
      manage_members: !!args?.p_manage_members,
      manage_points: !!args?.p_manage_points,
      manage_messages: !!args?.p_manage_messages,
      manage_media: !!args?.p_manage_media,
      manage_roles: !!args?.p_manage_roles,
      manage_admins: !!args?.p_manage_admins,
      view_profile_visits: !!args?.p_view_profile_visits,
      manage_news: !!args?.p_manage_news,
      manage_groups: !!args?.p_manage_groups,
      manage_events: !!args?.p_manage_events,
      manage_marketplace: !!args?.p_manage_marketplace,
      manage_friend_requests: !!args?.p_manage_friend_requests,
      manage_homepage: !!args?.p_manage_homepage,
      manage_reports: !!args?.p_manage_reports
    }, { onConflict: "user_id" });
    return { data: null, error };
  }

  if (fn === "admin_set_role" || fn === "admin_set_account_status" || fn === "admin_update_member") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user?.id).maybeSingle();
    const needsHeadAdmin = fn !== "admin_set_account_status";
    if (!me || (needsHeadAdmin ? me.role !== "HEAD_ADMIN" : !["ADMIN", "HEAD_ADMIN"].includes(me.role))) return { data: null, error: new Error("Keine Berechtigung.") };
    const target = args?.target_user || args?.p_user_id;
    const changes = fn === "admin_set_role" ? { role: args?.new_role } : fn === "admin_set_account_status" ? { account_status: args?.new_status } : { nickname: args?.p_nickname, first_name: args?.p_first_name, last_name: args?.p_last_name, birth_date: args?.p_birth_date, gender: args?.p_gender, role: args?.p_role, account_status: args?.p_account_status };
    const { error } = await supabase.from("profiles").update(changes).eq("id", target);
    return { data: null, error };
  }

  if (fn === "send_private_message") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id || !args?.target_user || !String(args?.message_text || "").trim()) return { data: null, error: new Error("Nachricht ist ungültig.") };
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, receiver_id: args.target_user, content: String(args.message_text).trim(), is_read: false });
    return { data: null, error };
  }

  if (fn === "mark_messages_read") {
    const rpcResult = await originalRpc(fn, args, options);
    if (!rpcResult.error || !canUseClientFallback(rpcResult.error)) return rpcResult;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("messages").update({ is_read: true }).eq("receiver_id", user?.id).eq("sender_id", args?.from_user);
    return { data: null, error };
  }

  return originalRpc(fn, args, options);
};
}
