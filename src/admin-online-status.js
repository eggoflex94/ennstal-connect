import { supabase } from "./supabaseClient";

let timer = null;
let loading = false;

async function addAdminOnlineStatusControl() {
  if (loading || !supabase) return false;
  const form = document.querySelector(".profile-form");
  if (!form) return false;
  if (form.querySelector("[name='hide_online_status']")) return true;
  loading = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase.from("profiles")
      .select("role,hide_online_status")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || !["ADMIN", "HEAD_ADMIN"].includes(profile.role) || !form.isConnected || form.querySelector("[name='hide_online_status']")) return false;
    const label = document.createElement("label");
    label.className = "online-status-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "hide_online_status";
    checkbox.checked = !!profile.hide_online_status;
    label.append(checkbox, document.createTextNode(" Online- und „zuletzt aktiv“-Status verbergen"));
    form.insertBefore(label, form.querySelector("button"));
    return true;
  } finally {
    loading = false;
  }
}

function schedule() {
  clearTimeout(timer);
  const tries = [0, 150, 500, 1200];
  tries.forEach((delay) => setTimeout(() => void addAdminOnlineStatusControl(), delay));
}
window.addEventListener('ec:navigate', schedule);
window.addEventListener('focus', schedule);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
else schedule();
