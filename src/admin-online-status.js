import { supabase } from "./supabaseClient";

// The profile editor is intentionally kept small. This inserts the optional
// visibility control only for admins and keeps its value in the normal form.
async function addAdminOnlineStatusControl() {
  const form = document.querySelector(".profile-form");
  if (!form || form.querySelector("[name='hide_online_status']") || !supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles")
    .select("role,hide_online_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["ADMIN", "HEAD_ADMIN"].includes(profile.role) || form.querySelector("[name='hide_online_status']")) return;

  const label = document.createElement("label");
  label.className = "online-status-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "hide_online_status";
  checkbox.checked = !!profile.hide_online_status;
  label.append(checkbox, document.createTextNode(" Online- und „zuletzt aktiv“-Status verbergen"));
  const genderLabel = [...form.querySelectorAll("label")].find((item) => item.textContent?.trim() === "Geschlecht *");
  form.insertBefore(label, genderLabel || form.querySelector("button"));
}

const observer = new MutationObserver(() => { void addAdminOnlineStatusControl(); });
observer.observe(document.documentElement, { childList: true, subtree: true });
void addAdminOnlineStatusControl();
