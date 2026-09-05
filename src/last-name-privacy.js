import { supabase } from "./supabaseClient";

const CONTROL_CLASS = "last-name-privacy-control";
let attachRunning = false;

const setStatus = (element, text, isError = false) => {
  if (!element) return;
  element.textContent = text;
  element.style.display = text ? "block" : "none";
  element.style.marginTop = "6px";
  element.style.fontSize = "0.85rem";
  element.style.fontWeight = isError ? "700" : "600";
};

async function attachLastNamePrivacyControl() {
  if (!supabase || attachRunning) return;
  const section = document.querySelector(".profile-form .privacy-settings");
  if (!section || section.querySelector(`.${CONTROL_CLASS}`)) return;

  attachRunning = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("avatar_url,privacy_settings")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !profile) return;
    if (!section.isConnected || section.querySelector(`.${CONTROL_CLASS}`)) return;

    const wrapper = document.createElement("label");
    wrapper.className = CONTROL_CLASS;
    wrapper.append(document.createTextNode("Nachname"));

    const select = document.createElement("select");
    select.name = "privacy_last_name";
    select.innerHTML = '<option value="PUBLIC">Für Mitglieder sichtbar</option><option value="ADMIN_ONLY">Komplett ausblenden · nur Admins sehen ihn</option>';
    select.value = profile.privacy_settings?.last_name === "ADMIN_ONLY" ? "ADMIN_ONLY" : "PUBLIC";

    const help = document.createElement("small");
    help.textContent = "Wenn du den Nachnamen ausblendest, ist ein eigenes Profilfoto Pflicht. Admins sehen deinen vollständigen Nachnamen weiterhin.";
    help.style.display = "block";
    help.style.marginTop = "6px";

    const status = document.createElement("small");
    status.setAttribute("role", "status");
    status.style.display = "none";

    select.addEventListener("change", async () => {
      const previousValue = select.value === "ADMIN_ONLY" ? "PUBLIC" : "ADMIN_ONLY";
      const hideLastName = select.value === "ADMIN_ONLY";
      select.disabled = true;
      setStatus(status, "Wird gespeichert …");

      const { error: saveError } = await supabase.rpc("set_last_name_privacy", {
        p_hidden: hideLastName
      });

      if (saveError) {
        select.value = previousValue;
        setStatus(status, saveError.message || "Die Einstellung konnte nicht gespeichert werden.", true);
        window.alert(saveError.message || "Die Einstellung konnte nicht gespeichert werden.");
      } else {
        setStatus(
          status,
          hideLastName
            ? "Gespeichert: Dein Nachname ist für Mitglieder ausgeblendet und nur für Admins sichtbar."
            : "Gespeichert: Dein Nachname ist wieder für Mitglieder sichtbar."
        );
      }
      select.disabled = false;
    });

    wrapper.append(select, help, status);
    const verification = section.querySelector(".verification-request");
    if (verification) section.insertBefore(wrapper, verification);
    else section.appendChild(wrapper);
  } finally {
    attachRunning = false;
  }
}

const scheduleAttach = () => window.setTimeout(() => void attachLastNamePrivacyControl(), 0);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleAttach, { once: true });
} else {
  scheduleAttach();
}

const observer = new MutationObserver(scheduleAttach);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("pageshow", scheduleAttach);
