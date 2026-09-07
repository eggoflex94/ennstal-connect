import { supabase } from "./supabaseClient";

let shown = false;

const features = [
  { icon: "⌂", title: "Regionale Startseite", text: "Deine Heimatregion bestimmt die regionale Startseite, Ansprechpartner und Inhalte. Die aktive Region kannst du jederzeit wechseln." },
  { icon: "♟", title: "Mitglieder & Rollen", text: "Finde Mitglieder aus deiner Region. Admins, regionale Admins und Supporter werden einheitlich mit ihrem Rollenstern gekennzeichnet." },
  { icon: "✉", title: "Nachrichten & Freunde", text: "Schreibe Mitgliedern, verwalte Freundschaftsanfragen und öffne Profile direkt über Nicknames. Freunde online werden im persönlichen Bereich angezeigt." },
  { icon: "▤", title: "Forum & Moderation", text: "Tausche dich regional aus. Forum- und Gruppenmoderation wird nur dort angezeigt, wo tatsächlich Rechte vergeben sind." },
  { icon: "●", title: "Gruppen & gemeinsame Aktivitäten", text: "Gründe Gruppen, tritt Gruppen bei und zeige Gruppen, Mitfahrgelegenheiten, Wanderungen und gemeinsame Vorhaben im Profil." },
  { icon: "▣", title: "Events & Community", text: "Entdecke regionale Veranstaltungen, Neuigkeiten, Profil-Aktualisierungen und weitere Community-Aktivitäten." },
  { icon: "✦", title: "Belohnungen", text: "Aktive Community-Nutzung schaltet automatisch zusätzliche Profil- und Layoutgestaltung frei – ohne Punktesystem." },
  { icon: "◉", title: "Privatsphäre & Sicherheit", text: "Du bestimmst Sichtbarkeit, Online-Status und persönliche Daten. Meldungen, Blockierungen und Hilfefunktionen sind direkt erreichbar." }
];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function removeCurrent() {
  document.querySelectorAll(".ec-onboarding,.ec-first-region").forEach((node) => node.remove());
}

async function completeOnboarding() {
  const { error } = await supabase.rpc("member_complete_onboarding");
  if (error) {
    alert(`Einführung konnte nicht abgeschlossen werden: ${error.message}`);
    return false;
  }
  return true;
}

function featureOverview() {
  removeCurrent();
  const overlay = el("div", "ec-onboarding ec-onboarding-overview");
  const box = el("section", "ec-onboarding-box ec-onboarding-overview-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "ec-onboarding-title");

  const head = el("div", "ec-onboarding-overview-head");
  head.append(
    el("span", "eyebrow", "WILLKOMMEN BEI ENNSTAL CONNECT"),
    el("h2", null, "Das kannst du in der Community machen"),
    el("p", null, "Die wichtigsten Funktionen auf einen Blick. Alles ist regional aufgebaut und bleibt über deinen persönlichen Bereich schnell erreichbar.")
  );
  head.querySelector("h2").id = "ec-onboarding-title";

  const grid = el("div", "ec-onboarding-feature-grid");
  features.forEach((feature) => {
    const card = el("article", "ec-onboarding-feature");
    card.append(el("span", "ec-onboarding-feature-icon", feature.icon));
    const text = el("div");
    text.append(el("strong", null, feature.title), el("p", null, feature.text));
    card.append(text);
    grid.append(card);
  });

  const actions = el("div", "ec-onboarding-actions");
  const done = el("button", "primary-button", "Community öffnen");
  done.type = "button";
  done.onclick = async () => {
    done.disabled = true;
    const ok = await completeOnboarding();
    done.disabled = false;
    if (ok) overlay.remove();
  };
  actions.append(done);
  box.append(head, grid, actions);
  overlay.append(box);
  document.body.append(overlay);
  done.focus();
}

function regionPicker(regions, profile) {
  removeCurrent();
  const overlay = el("div", "ec-first-region");
  const box = el("section", "ec-first-region-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "ec-first-region-title");

  box.append(
    el("span", "eyebrow", "DEIN ERSTER SCHRITT"),
    el("h2", null, "Wähle deine Heimatregion"),
    el("p", "ec-first-region-intro", "Deine Heimatregion legt fest, welche regionale Startseite, Ansprechpartner und lokalen Inhalte du zuerst siehst. Du kannst die aktive Region später jederzeit wechseln.")
  );
  box.querySelector("h2").id = "ec-first-region-title";

  const choices = el("div", "ec-first-region-grid");
  let selected = regions.find((region) => region.id === profile?.home_region_id)?.slug || "";

  regions.forEach((region) => {
    const button = el("button", "ec-first-region-choice");
    button.type = "button";
    button.dataset.regionSlug = region.slug;
    if (region.slug === selected) button.classList.add("is-selected");
    button.append(
      el("strong", null, region.name),
      el("small", null, region.description || "Regionale Community, Termine und Ansprechpartner")
    );
    button.onclick = () => {
      selected = region.slug;
      choices.querySelectorAll(".ec-first-region-choice").forEach((item) => item.classList.toggle("is-selected", item === button));
      save.disabled = false;
    };
    choices.append(button);
  });

  const actions = el("div", "ec-onboarding-actions");
  const save = el("button", "primary-button", "Region übernehmen");
  save.type = "button";
  save.disabled = !selected;
  save.onclick = async () => {
    if (!selected) return;
    save.disabled = true;
    save.textContent = "Region wird gespeichert …";
    const region = regions.find((item) => item.slug === selected);
    const { error } = await supabase.rpc("ec_change_home_region", { p_region_slug: selected });
    if (error) {
      save.disabled = false;
      save.textContent = "Region übernehmen";
      alert(`Heimatregion konnte nicht gespeichert werden: ${error.message}`);
      return;
    }
    localStorage.setItem("ec-active-region", selected);
    if (region) window.dispatchEvent(new CustomEvent("ec:region-change", { detail: region }));
    overlay.remove();
    setTimeout(featureOverview, 180);
  };
  actions.append(save);
  box.append(choices, actions);
  overlay.append(box);
  document.body.append(overlay);
  (choices.querySelector(".is-selected") || choices.querySelector("button"))?.focus();
}

async function start() {
  if (shown) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const [{ data: profile }, { data: status, error: statusError }, { data: regions, error: regionError }] = await Promise.all([
    supabase.from("profiles").select("id,account_status,home_region_id").eq("id", user.id).maybeSingle(),
    supabase.rpc("member_onboarding_status"),
    supabase.from("regions").select("id,slug,name,description,sort_order").eq("is_active", true).order("sort_order")
  ]);

  if (profile?.account_status !== "ACTIVE") return;
  if (statusError || status?.[0]?.completed) return;
  shown = true;

  if (regionError || !regions?.length) {
    setTimeout(featureOverview, 700);
    return;
  }
  setTimeout(() => regionPicker(regions, profile), 700);
}

void start();
