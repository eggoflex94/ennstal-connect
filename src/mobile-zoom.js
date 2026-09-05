/* Mobile media zoom for Ennstal Connect.
   Keeps the existing React click behaviour untouched for cards/navigation and
   only opens content/media images in a lightweight fullscreen viewer. */

const mobileQuery = window.matchMedia("(max-width: 900px)");
const zoomableSelector = [
  ".hero img",
  ".news-card img",
  ".forum-post img",
  ".homepage-frame img",
  ".content-card img",
  ".group-card img",
  ".profile-modal .modal-avatar",
  ".my-profile-card .my-avatar"
].join(",");

function markZoomableImages() {
  document.querySelectorAll(zoomableSelector).forEach((img) => {
    if (img instanceof HTMLImageElement) {
      img.classList.add("ec-zoomable");
      if (!img.hasAttribute("title")) img.setAttribute("title", "Antippen zum Vergrößern");
    }
  });
}

function closeZoom() {
  document.querySelector(".ec-mobile-zoom-overlay")?.remove();
  document.body.style.removeProperty("overflow");
}

function openZoom(img) {
  if (!mobileQuery.matches || !(img instanceof HTMLImageElement)) return;

  closeZoom();
  const overlay = document.createElement("div");
  overlay.className = "ec-mobile-zoom-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Bild vergrößert anzeigen");

  const enlarged = document.createElement("img");
  enlarged.src = img.currentSrc || img.src;
  enlarged.alt = img.alt || "Vergrößertes Bild";
  enlarged.draggable = false;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "ec-mobile-zoom-close";
  close.setAttribute("aria-label", "Vergrößerung schließen");
  close.textContent = "×";

  overlay.append(enlarged, close);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  close.focus({ preventScroll: true });
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    closeZoom();
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeZoom();
  });
}

document.addEventListener("click", (event) => {
  const img = event.target instanceof Element ? event.target.closest(zoomableSelector) : null;
  if (!img || !mobileQuery.matches) return;

  /* Do not steal clicks from controls/links; their normal app action wins. */
  if (img.closest("button, a, [role='button']")) return;

  event.preventDefault();
  event.stopPropagation();
  openZoom(img);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeZoom();
});

const observer = new MutationObserver(markZoomableImages);
observer.observe(document.documentElement, { childList: true, subtree: true });
markZoomableImages();
