function findAdForm() {
  return [...document.querySelectorAll(".admin-community-tools form")].find((form) =>
    /Werbefläche erstellen/i.test(form.textContent || "")
  ) || null;
}

function makeCompanyOptional() {
  const form = findAdForm();
  if (!form) return;
  const title = form.querySelector('input[name="title"]');
  if (!title) return;

  title.required = false;
  title.removeAttribute("required");
  title.placeholder = "Firma / Verein (optional)";
  title.setAttribute("aria-label", "Firma oder Verein (optional)");
}

// App.jsx currently expects a title internally. If the optional company field
// is left blank, provide a neutral internal label before React handles submit.
// This keeps existing database/RPC contracts intact while making the field truly optional.
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form !== findAdForm()) return;
  const title = form.querySelector('input[name="title"]');
  if (title && !title.value.trim()) title.value = "Werbeanzeige";
}, true);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", makeCompanyOptional, { once: true });
} else {
  makeCompanyOptional();
}

const observer = new MutationObserver(() => makeCompanyOptional());
observer.observe(document.documentElement, { childList: true, subtree: true });
