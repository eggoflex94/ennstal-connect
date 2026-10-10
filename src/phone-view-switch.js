// Optional desktop layout on phones. Never changes authenticated state or navigation.
const KEY = "ec-phone-view-preference";
const isPhone = () => window.matchMedia("(pointer: coarse) and (max-device-width: 900px)").matches;
const viewport = document.querySelector('meta[name="viewport"]');
const standard = "width=device-width, initial-scale=1, viewport-fit=cover";
const desktop = "width=1200, initial-scale=0.32, viewport-fit=cover";
function apply(mode) {
  if (!viewport || !isPhone()) return;
  viewport.setAttribute("content", mode === "desktop" ? desktop : standard);
  document.documentElement.classList.toggle("ec-phone-desktop-view", mode === "desktop");
  const btn = document.getElementById("ec-phone-view-toggle");
  if (btn) {
    btn.textContent = mode === "desktop" ? "Handyansicht" : "Desktopansicht";
    btn.setAttribute("aria-label", mode === "desktop" ? "Zur Handyansicht wechseln" : "Zur Desktopansicht wechseln");
  }
}
if (isPhone()) {
  let mode = "mobile";
  try { mode = localStorage.getItem(KEY) === "desktop" ? "desktop" : "mobile"; } catch {}
  apply(mode);
  const mount = () => {
    if (document.getElementById("ec-phone-view-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "ec-phone-view-toggle";
    btn.type = "button";
    btn.textContent = mode === "desktop" ? "Handyansicht" : "Desktopansicht";
    btn.addEventListener("click", () => {
      mode = mode === "desktop" ? "mobile" : "desktop";
      try { localStorage.setItem(KEY, mode); } catch {}
      apply(mode);
    });
    document.body.appendChild(btn);
    apply(mode);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
}
