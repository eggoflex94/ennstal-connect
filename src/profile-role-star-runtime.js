// Keep profile role stars deterministic. This runtime does not intercept clicks or form events.
const ROLE_STAR_BY_TEXT = [
  { test: /betreiber|hauptadmin|community admin|global admin|\badmin\b/i, src: '/role-star-red.svg' },
  { test: /supporter/i, src: '/supporter-star.svg' },
  { test: /unternehmenskonto|business/i, src: '/role-star-blue.svg' },
];

function ensureProfileRoleStars() {
  document.querySelectorAll('.ec-clean-profile-role strong').forEach((roleNode) => {
    const text = String(roleNode.textContent || '').trim();
    const config = ROLE_STAR_BY_TEXT.find((entry) => entry.test.test(text));
    const existing = roleNode.querySelector('img.ec-profile-role-star-runtime');

    if (!config) {
      existing?.remove();
      return;
    }

    const anyRoleStar = roleNode.querySelector('img[src*="role-star-red.svg"], img[src*="supporter-star.svg"], img[src*="role-star-blue.svg"]');
    if (anyRoleStar) {
      anyRoleStar.classList.add('ec-profile-role-star-runtime');
      return;
    }

    const img = document.createElement('img');
    img.className = 'ec-profile-role-star-runtime ec-role-star';
    img.src = config.src;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.loading = 'eager';
    img.decoding = 'async';
    roleNode.prepend(img);
  });
}

let queued = false;
function scheduleProfileRoleStars() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    ensureProfileRoleStars();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureProfileRoleStars, { once: true });
} else {
  ensureProfileRoleStars();
}

const observer = new MutationObserver(scheduleProfileRoleStars);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
