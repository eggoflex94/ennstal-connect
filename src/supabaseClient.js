import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL wurde nicht geladen.");
if (!supabaseUrl.startsWith("https://")) throw new Error(`VITE_SUPABASE_URL ist ungültig: ${supabaseUrl}`);
if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY wurde nicht geladen.");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const originalRpc = supabase.rpc.bind(supabase);
supabase.rpc = async (fn, args = {}, options) => {
  if (fn === "accept_friend_request") {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id || !args?.friendship_id) return { data: null, error: new Error("Nicht eingeloggt.") };
    const { data, error } = await supabase.from("friendships")
      .update({ status: "ACCEPTED", updated_at: new Date().toISOString() })
      .eq("id", args.friendship_id).eq("receiver_id", user.id).eq("status", "PENDING")
      .select("id").maybeSingle();
    if (error) return { data: null, error };
    if (!data) return { data: null, error: new Error("Freundschaftsanfrage nicht gefunden oder bereits beantwortet.") };
    return { data: null, error: null };
  }

  if (fn === "submit_user_report") {
    const { data: { user } } = await supabase.auth.getUser();
    const target = args?.target_user;
    const reason = String(args?.reason_text || "").trim();
    if (!user?.id) return { data: null, error: new Error("Nicht eingeloggt.") };
    if (!target || target === user.id) return { data: null, error: new Error("Ungültiger Nutzer.") };
    if (reason.length < 3) return { data: null, error: new Error("Bitte einen Meldegrund angeben.") };
    const { error } = await supabase.from("user_reports").insert({ reporter_id: user.id, reported_user_id: target, reason, status: "PENDING", penalty_points: 0, created_at: new Date().toISOString() });
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
