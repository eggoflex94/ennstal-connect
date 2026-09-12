import { supabase } from './supabaseClient';
import './head-admin-message-read-receipts.css';

let currentUserId = null;
let enabled = false;
let messageChannel = null;
let refreshTimer = null;
let profileCache = { at: 0, rows: [] };

const displayName = (profile) => profile
  ? (profile.nickname || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Mitglied')
  : '';

function clearReceiptNodes() {
  document.querySelectorAll('.ec-head-admin-read-receipt').forEach((node) => node.remove());
}

function scheduleRefresh(delay = 80) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refreshReceipts(), delay);
}

async function profilesForLookup() {
  if (Date.now() - profileCache.at < 60_000 && profileCache.rows.length) return profileCache.rows;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,nickname,first_name,last_name')
    .eq('account_status', 'ACTIVE');
  if (error) return profileCache.rows;
  profileCache = { at: Date.now(), rows: data || [] };
  return profileCache.rows;
}

async function currentChatMemberId() {
  const name = String(document.querySelector('.chat-box .chat-header .member-mini strong')?.textContent || '').trim();
  if (!name) return null;
  const profiles = await profilesForLookup();
  return profiles.find((profile) => displayName(profile) === name)?.id || null;
}

async function refreshReceipts() {
  if (!enabled || !currentUserId) {
    clearReceiptNodes();
    return;
  }
  const chat = document.querySelector('.chat-box');
  if (!chat) return;
  const otherUserId = await currentChatMemberId();
  if (!otherUserId || !document.querySelector('.chat-box')) return;

  const { data, error } = await supabase
    .from('messages')
    .select('id,sender_id,receiver_id,is_read,created_at')
    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`)
    .order('created_at', { ascending: true });
  if (error) return;

  const rows = data || [];
  const nodes = [...document.querySelectorAll('.chat-box .chat-messages .chat-message')];
  nodes.forEach((node, index) => {
    node.querySelector('.ec-head-admin-read-receipt')?.remove();
    const message = rows[index];
    if (!message || message.sender_id !== currentUserId || !node.classList.contains('mine')) return;
    const receipt = document.createElement('small');
    receipt.className = `ec-head-admin-read-receipt ${message.is_read ? 'is-read' : 'is-sent'}`;
    receipt.textContent = message.is_read ? '✓ Gesehen' : '○ Gesendet';
    receipt.setAttribute('aria-label', message.is_read ? 'Nachricht wurde gesehen' : 'Nachricht wurde noch nicht gesehen');
    node.appendChild(receipt);
  });
}

function removeChannel() {
  if (messageChannel) supabase.removeChannel(messageChannel);
  messageChannel = null;
}

function subscribeToMessageChanges() {
  removeChannel();
  if (!enabled || !currentUserId) return;
  messageChannel = supabase
    .channel(`ec-head-admin-read-receipts-${currentUserId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${currentUserId}` }, () => scheduleRefresh(60))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUserId}` }, () => scheduleRefresh(60))
    .subscribe();
}

async function refreshIdentity() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  currentUserId = session?.user?.id || null;
  enabled = false;
  clearReceiptNodes();
  removeChannel();
  if (!currentUserId) return;

  const { data } = await supabase.from('profiles').select('role').eq('id', currentUserId).maybeSingle();
  enabled = data?.role === 'HEAD_ADMIN';
  if (!enabled) return;
  subscribeToMessageChanges();
  scheduleRefresh(40);
}

if (supabase) {
  void refreshIdentity();
  supabase.auth.onAuthStateChange(() => {
    window.setTimeout(() => void refreshIdentity(), 0);
  });

  document.addEventListener('click', () => {
    if (!enabled) return;
    scheduleRefresh(120);
    window.setTimeout(() => scheduleRefresh(0), 500);
  }, true);
  window.addEventListener('ec:navigate', () => scheduleRefresh(120));
  window.addEventListener('focus', () => scheduleRefresh(80));
}
