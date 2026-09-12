// Profile/navigation stability authority.
// React owns navigation; this module only prevents an old ?profile= route from
// reopening on every directory refresh and presents the visible bio in one
// stable lower profile block.

let routeObserver = null;
let profileObserver = null;
let bioTimer = null;

function clearProfileQuery(expectedId = '') {
  const url = new URL(window.location.href);
  const routedId = url.searchParams.get('profile') || '';
  if (!routedId) return false;
  if (expectedId && routedId !== expectedId) return false;
  url.searchParams.delete('profile');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

function settleSharedProfileRoute() {
  const routedId = new URLSearchParams(window.location.search).get('profile');
  if (!routedId) {
    routeObserver?.disconnect();
    routeObserver = null;
    return;
  }
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (page?.dataset.profileId === routedId) {
    clearProfileQuery(routedId);
    routeObserver?.disconnect();
    routeObserver = null;
  }
}

function installAboutStyles() {
  if (document.getElementById('ec-member-about-stability-style')) return;
  const style = document.createElement('style');
  style.id = 'ec-member-about-stability-style';
  style.textContent = `
    .member-profile-hero .member-profile-bio{display:none!important}
    .member-profile-hero .profile-bio-image{display:none!important}
    .ec-member-about-block{display:block!important;width:100%!important;max-width:100%!important;margin:20px 0!important;padding:22px 26px!important;box-sizing:border-box!important;border:1px solid rgba(26,111,201,.28)!important;border-radius:20px!important;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(239,247,255,.96))!important;box-shadow:0 12px 32px rgba(31,73,112,.08)!important;overflow:hidden!important}
    .ec-member-about-block .ec-member-about-eyebrow{display:block!important;margin:0 0 6px!important;color:#1263c9!important;font-size:12px!important;font-weight:900!important;letter-spacing:.15em!important}
    .ec-member-about-block h2{margin:0 0 14px!important;color:#20364c!important;font-size:1.35rem!important;line-height:1.2!important}
    .ec-member-about-block .ec-member-about-copy{margin:0!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;line-height:1.7!important}
    .ec-member-about-block .ec-member-about-image{display:block!important;width:auto!important;max-width:min(100%,460px)!important;max-height:420px!important;margin:0 0 16px!important;border-radius:16px!important;object-fit:contain!important}
  `;
  document.head.appendChild(style);
}

function syncAboutBlock() {
  clearTimeout(bioTimer);
  bioTimer = setTimeout(() => {
    installAboutStyles();
    const page = document.querySelector('.member-profile-page[data-profile-id]');
    if (!page) {
      document.querySelectorAll('.ec-member-about-block').forEach((node) => node.remove());
      return;
    }

    const profileId = page.dataset.profileId || '';
    document.querySelectorAll('.ec-member-about-block').forEach((node) => {
      if (node.dataset.profileId !== profileId || node.parentElement !== page) node.remove();
    });

    const hero = page.querySelector('.member-profile-hero');
    const sourceBio = hero?.querySelector('.member-profile-bio');
    const sourceImage = hero?.querySelector('.profile-bio-image');
    const bioVisible = Boolean(sourceBio && sourceBio.style.display !== 'none' && String(sourceBio.textContent || '').trim());
    const imageVisible = Boolean(sourceImage && sourceImage.style.display !== 'none' && sourceImage.src);
    let block = page.querySelector(`:scope > .ec-member-about-block[data-profile-id="${CSS.escape(profileId)}"]`);

    if (!bioVisible && !imageVisible) {
      block?.remove();
      return;
    }

    if (!block) {
      block = document.createElement('section');
      block.className = 'ec-member-about-block panel';
      block.dataset.profileId = profileId;
      const actions = page.querySelector('.member-profile-actions');
      if (actions) actions.insertAdjacentElement('afterend', block);
      else page.appendChild(block);
    }

    block.replaceChildren();
    const eyebrow = document.createElement('span');
    eyebrow.className = 'ec-member-about-eyebrow';
    eyebrow.textContent = 'ÜBER MICH';
    const title = document.createElement('h2');
    title.textContent = 'Das bin ich';
    block.append(eyebrow, title);

    if (imageVisible) {
      const image = document.createElement('img');
      image.className = 'ec-member-about-image';
      image.src = sourceImage.currentSrc || sourceImage.src;
      image.alt = sourceImage.alt || 'Bild zum Über-mich-Bereich';
      block.appendChild(image);
    }
    if (bioVisible) {
      const copy = document.createElement('p');
      copy.className = `ec-member-about-copy ${sourceBio.className || ''}`.trim();
      copy.textContent = sourceBio.textContent || '';
      copy.style.color = sourceBio.style.color || '';
      block.appendChild(copy);
    }
  }, 160);
}

function startProfileObserver() {
  const root = document.querySelector('.content-root') || document.getElementById('root');
  if (!root || profileObserver) return;
  profileObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.('.member-profile-page,.member-profile-hero,.member-profile-bio,.member-profile-actions') || node.querySelector?.('.member-profile-page,.member-profile-hero,.member-profile-bio,.member-profile-actions'))
    ));
    if (relevant) syncAboutBlock();
  });
  profileObserver.observe(root, { childList: true, subtree: true });
  syncAboutBlock();
}

function boot() {
  settleSharedProfileRoute();
  const routedId = new URLSearchParams(window.location.search).get('profile');
  if (routedId && !routeObserver) {
    const root = document.getElementById('root') || document.documentElement;
    routeObserver = new MutationObserver(settleSharedProfileRoute);
    routeObserver.observe(root, { childList: true, subtree: true });
  }
  startProfileObserver();
}

window.addEventListener('ec:open-profile', () => {
  // Any explicit in-app profile navigation must stop an old shared-profile URL
  // from reopening on the next members refresh.
  clearProfileQuery();
  syncAboutBlock();
});
window.addEventListener('ec:navigate', syncAboutBlock);
window.addEventListener('focus', syncAboutBlock);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
