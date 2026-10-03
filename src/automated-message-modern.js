import { supabase } from './supabaseClient';

// Offizielle Systemkonten werden nicht für Direktnachrichten verwendet.
// Automated message presentation is React-owned; this module never rewrites message DOM.
async function loadAutomatedMessageViewer(){
  const {data:{session}}=await supabase.auth.getSession();
  const user=session?.user;
  if(!user)return null;
  const {data}=await supabase.from("profiles").select("id,role").eq("id",user.id).maybeSingle();
  return data||null;
}

export { loadAutomatedMessageViewer };
