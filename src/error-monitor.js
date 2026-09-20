import { supabase } from "./supabaseClient";

const recent = new Map();
const REPORT_COOLDOWN_MS = 30_000;
let layoutTimer = null;

function text(value, max = 3000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function fingerprint(parts) {
  const input = parts.map((part) => text(part, 600).toLowerCase()).join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ec-${(hash >>> 0).toString(16)}`;
}

async function report({ type = "CLIENT", severity = "ERROR", title, message, source = "", stack = "", metadata = {} }) {
  if (!supabase) return;
  const path = `${location.pathname}${location.search}${location.hash}`.slice(0, 500);
  const key = fingerprint([type, title, message, source, path]);
  const last = recent.get(key) || 0;
  if (Date.now() - last < REPORT_COOLDOWN_MS) return;
  recent.set(key, Date.now());

  try {
    await supabase.rpc("record_client_error", {
      p_fingerprint: key,
      p_error_type: text(type, 40),
      p_severity: text(severity, 20),
      p_title: text(title || "Technischer Fehler", 180),
      p_message: text(message || title || "Unbekannter Fehler"),
      p_path: path,
      p_source: text(source, 500),
      p_stack: text(stack, 12000),
      p_metadata: {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        online: navigator.onLine,
        visibility: document.visibilityState,
        userAgent: text(navigator.userAgent, 500),
        ...metadata
      }
    });
  } catch {
    // Error reporting must never create a second user-facing failure.
  }
}

window.addEventListener("error", (event) => {
  const error = event.error;
  void report({
    type: "JAVASCRIPT",
    severity: "ERROR",
    title: error?.name || "JavaScript-Fehler",
    message: error?.message || event.message || "Unbehandelter JavaScript-Fehler",
    source: event.filename || "",
    stack: error?.stack || "",
    metadata: { line: event.lineno || null, column: event.colno || null }
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  void report({
    type: "PROMISE",
    severity: "ERROR",
    title: reason?.name || "Unbehandelte Promise-Ablehnung",
    message: reason?.message || String(reason || "Unbekannte Promise-Ablehnung"),
    stack: reason?.stack || ""
  });
});

window.addEventListener("ec:network-error", (event) => {
  const d = event.detail || {};
  void report({
    type: "NETWORK",
    severity: Number(d.status) >= 500 || d.kind === "timeout" ? "ERROR" : "WARN",
    title: d.kind === "timeout" ? "Server antwortet nicht" : `Netzwerkfehler${d.status ? ` HTTP ${d.status}` : ""}`,
    message: d.message || "Eine Serveranfrage ist fehlgeschlagen.",
    source: d.endpoint || "",
    metadata: { method: d.method || "", status: d.status || null, kind: d.kind || "request" }
  });
});

function layoutIssue(title, message, severity = "ERROR", metadata = {}) {
  void report({ type: "LAYOUT", severity, title, message, source: "layout-monitor", metadata });
}

function checkLayout() {
  if (!document.querySelector(".app")) return;
  const main = document.querySelector(".modern-main");
  const root = document.querySelector(".content-root");
  const sidebar = document.querySelector(".modern-sidebar");

  if (!main || !root || !sidebar) {
    layoutIssue("App-Layout unvollständig", "Ein zentraler App-Bereich fehlt im DOM.", "CRITICAL", {
      main: Boolean(main), contentRoot: Boolean(root), sidebar: Boolean(sidebar)
    });
    return;
  }

  const rect = main.getBoundingClientRect();
  if (rect.width < 180 || rect.height < 180) {
    layoutIssue("Hauptinhalt nicht sichtbar", "Der Hauptinhalt ist vorhanden, hat aber eine unplausibel kleine sichtbare Fläche.", "ERROR", {
      width: Math.round(rect.width), height: Math.round(rect.height)
    });
  }

  const recovery = document.querySelector(".app-recovery");
  if (recovery) {
    layoutIssue("Recovery-Ansicht aktiv", text(recovery.textContent, 1200), "CRITICAL");
  }
}

function scheduleLayoutCheck(delay = 500) {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(checkLayout, delay);
}

window.addEventListener("ec:navigate", () => scheduleLayoutCheck(650));
window.addEventListener("ec:region-change", () => scheduleLayoutCheck(800));
window.addEventListener("resize", () => scheduleLayoutCheck(700));
window.addEventListener("focus", () => scheduleLayoutCheck(350));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleLayoutCheck(450);
});
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => scheduleLayoutCheck(900), { once: true });
} else {
  scheduleLayoutCheck(900);
}
