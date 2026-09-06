import { supabase } from './supabaseClient';

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const norm = (value) => String(value || '').replace(/[★♛♥✓]/g, '').trim().toLowerCase();
let currentUserId = null;
let profileNames = new Map();

function legacyNav(label) {
  return qa('.modern-nav button,.modern-nav a').find((el) => !el.closest('.ec-sidebar-refactor') && norm(el.textContent).includes(norm(label)));
}

function findMemberCard(nickname) {
  const wanted = norm(nickname);
  if (!wanted) return null;
  return qa('.member-card').find((card) => {
    const shown = norm(q('.ec-pro-nickname,.member-nickname', card)?.textContent || '');
    return shown === wanted || shown.includes(wanted);
  }) || null;
}

function revealContent() {
  if (!matchMedia('(max-width:900px)').matches) return;
  requestAnimationFrame(() => q('.modern-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function openSidebarProfile(profileId) {
  if (!profileId) return;
  if (profileId === currentUserId) {
    legacyNav('Mein Profil')?.click();
    revealContent();
    return;
  }
  const nickname = profileNames.get(profileId);
  if (!nickname) return;
  const open = () => {
    const card = findMemberCard(nickname);
    if (!card) return false;
    card.click();
    revealContent();
    return true;
  };
  if (open()) return;
  legacyNav('Mitglieder')?.click();
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (open() || tries >= 30) window.clearInterval(timer);
  }, 75);
}

function restoreFriendBadges() {
  qa('.member-card').forEach((card) => {
    const oldFriend = q('.friend-indicator', card);
    const stack = q('.ec-pro-role-stack', card);
    if (!oldFriend || !stack || q('.ec-pro-friend-badge', stack)) return;
    const badge = document.createElement('img');
    badge.src = '/badge-friend.svg';
    badge.alt = 'Befreundet';
    badge.title = 'Befreundet';
    badge.className = 'ec-pro-friend-badge';
    stack.appendChild(badge);
  });
}

function cleanSidebar() {
  const sidebar = q('.ec-sidebar-refactor');
  if (!sidebar) return;
  qa('.modern-nav > *').forEach((node) => {
    if (node === sidebar) return;
    node.classList.add('ec-force-hide-legacy');
  });
  restoreFriendBadges();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest?.('.ec-sidebar-refactor [data-profile]');
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  openSidebarProfile(target.dataset.profile);
}, true);

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  currentUserId = user?.id || null;
  if (user) {
    const { data } = await supabase.from('profiles').select('id,nickname').eq('account_status', 'ACTIVE');
    profileNames = new Map((data || []).map((profile) => [profile.id, profile.nickname || '']));
  }
  cleanSidebar();
}

const observer = new MutationObserver(() => requestAnimationFrame(cleanSidebar));
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    observer.observe(document.body, { childList: true, subtree: true });
  }, { once: true });
} else {
  init();
  observer.observe(document.body, { childList: true, subtree: true });
}
