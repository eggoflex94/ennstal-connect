// Keep profile role stars deterministic without intercepting any interaction events.
const ROLE_STAR_BY_TEXT = [
  { test: /betreiber|hauptadmin|community admin|global admin|\badmin\b/i, src: '/role-star-red.svg' },
  { test: /supporter/i, src: '/supporter-star.svg' },
  { test: /unternehmenskonto|business/i, src: '/role-star-blue.svg' },
];

function roleStarFor(node) {
  if (node.classList?.contains('head-admin') || node.classList?.contains('admin')) return '/role-star-red.svg';
  if (node.classList?.contains('supporter')) return '/supporter-star.svg';
  if (node.classList?.contains('business')) return '/role-star-blue.svg';
  const text = String(node.textContent || '').trim();
  return ROLE_STAR_BY_TEXT.find((entry) => entry.test.test(text))?.src || '';
}

function ensureRoleStar(node) {
  const src = roleStarFor(node);
  const existing = node.querySelector('img.ec-profile-role-star-runtime');

  if (!src) {
    existing?.remove();
    return;
  }

  // Hide the old text-only star when the real role asset is present.
  const textStar = node.querySelector('.profile-role-icon');
  if (textStar) textStar.setAttribute('aria-hidden', 'true');

  if (existing) {
    if (existing.getAttribute('src') !== src) existing.setAttribute('src', src);
    return;
  }

  const anyRoleStar = node.querySelector('img[src*="role-star-red.svg"], img[src*="supporter-star.svg"], img[src*="role-star-blue.svg"]');
  if (anyRoleStar) {
    anyRoleStar.classList.add('ec-profile-role-star-runtime');
    return;
  }

  const img = document.createElement('img');
  img.className = 'ec-profile-role-star-runtime ec-role-star';
  img.src = src;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.loading = 'eager';
  img.decoding = 'async';
  node.prepend(img);
}

function ensureProfileRoleStars() {
  document.querySelectorAll('.profile-view .profile-role-badge, .ec-clean-profile-role strong').forEach(ensureRoleStar);
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
window.addEventListener('ec:open-profile', scheduleProfileRoleStars);
window.addEventListener('ec:profile-updated', scheduleProfileRoleStars);
