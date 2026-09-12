import { supabase } from './supabaseClient';

const CONTEXT_TTL_MS = 8000;
const contextCache = new Map();
const contextLoads = new Map();
let syncVersion = 0;

async function currentContext(page, force = false) {
  const embedded = page?.__ecForumState;
  if (embedded?.group && embedded?.user) {
    const role = String(embedded.profiles?.get?.(embedded.user.id)?.role || '').toUpperCase();
    const canManageGroup = role === 'HEAD_ADMIN' || role === 'ADMIN' || embedded.group.owner_id === embedded.user.id || embedded.group.created_by === embedded.user.id;
    return { ...embedded, role, canManageGroup };
  }

  const groupId = page?.dataset?.groupId;
  if (!groupId) return null;
  const cached = contextCache.get(groupId);
  if (!force && cached?.expiresAt > Date.now()) return cached.value;
  if (!force && contextLoads.has(groupId)) return contextLoads.get(groupId);

  const load = (async () => {
    const [{ data: auth }, { data: group }, { data: posts }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('community_groups').select('*').eq('id', groupId).maybeSingle(),
      supabase.from('group_forum_posts').select('*').eq('group_id', groupId).order('created_at', { ascending: false })
    ]);
    const user = auth?.user;
    if (!user || !group) return null;
    const [{ data: self }, repliesResult] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      (posts || []).length
        ? supabase.from('group_forum_replies').select('*').in('post_id', posts.map(p => p.id)).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] })
    ]);
    const role = String(self?.role || '').toUpperCase();
    const canManageGroup = role === 'HEAD_ADMIN' || role === 'ADMIN' || group.owner_id === user.id || group.created_by === user.id;
    const value = { group, user, role, canManageGroup, posts: posts || [], replies: repliesResult.data || [] };
    contextCache.set(groupId, { value, expiresAt: Date.now() + CONTEXT_TTL_MS });
    return value;
  })().finally(() => contextLoads.delete(groupId));
  contextLoads.set(groupId, load);
  return load;
}

function invalidate(groupId) {
  if (groupId) contextCache.delete(groupId);
}

function actionButton(label, cls='') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `gfp-action-button ${cls}`.trim();
  button.textContent = label;
  return button;
}

async function editGroup(ctx) {
  const name = prompt('Gruppenname bearbeiten:', ctx.group.name || '');
  if (name === null) return;
  const description = prompt('Gruppenbeschreibung bearbeiten:', ctx.group.description || '');
  if (description === null) return;
  const cleanName = name.trim();
  const cleanDescription = description.trim();
  if (cleanName.length < 3 || cleanDescription.length < 10) return alert('Gruppenname oder Beschreibung ist zu kurz.');
  const { error } = await supabase.rpc('update_community_group', { p_group_id: ctx.group.id, p_name: cleanName, p_description: cleanDescription, p_image_url: ctx.group.image_url || null });
  if (error) return alert(`Gruppe konnte nicht bearbeitet werden: ${error.message}`);
  invalidate(ctx.group.id);
  window.dispatchEvent(new CustomEvent('ec:group-forum-changed', { detail: { groupId: ctx.group.id } }));
}

async function deleteGroup(ctx) {
  if (!confirm(`Gruppe „${ctx.group.name}“ wirklich löschen? Alle Gruppenbeiträge und Antworten werden ebenfalls gelöscht.`)) return;
  const { error } = await supabase.rpc('delete_community_group', { p_group_id: ctx.group.id });
  if (error) return alert(`Gruppe konnte nicht gelöscht werden: ${error.message}`);
  invalidate(ctx.group.id);
  const url = new URL(location.href); url.searchParams.delete('group'); history.pushState({ ...(history.state || {}), ecGroup: null }, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
}

async function editPost(ctx, post) {
  const title = prompt('Überschrift bearbeiten:', post.title || '');
  if (title === null) return;
  const content = prompt('Beitrag bearbeiten:', post.content || '');
  if (content === null) return;
  const cleanTitle = title.trim();
  const cleanContent = content.trim();
  if (cleanTitle.length < 2 || !cleanContent) return alert('Überschrift oder Beitrag ist zu kurz.');
  const { error } = await supabase.from('group_forum_posts').update({ title: cleanTitle, content: cleanContent, updated_at: new Date().toISOString() }).eq('id', post.id);
  if (error) return alert(`Beitrag konnte nicht bearbeitet werden: ${error.message}`);
  invalidate(ctx.group.id);
  window.dispatchEvent(new CustomEvent('ec:group-forum-changed', { detail: { groupId: ctx.group.id } }));
}

async function deletePost(ctx, post) {
  if (!confirm('Diesen Forumsbeitrag inklusive Antworten wirklich löschen?')) return;
  const { error } = await supabase.from('group_forum_posts').delete().eq('id', post.id);
  if (error) return alert(`Beitrag konnte nicht gelöscht werden: ${error.message}`);
  invalidate(ctx.group.id);
  window.dispatchEvent(new CustomEvent('ec:group-forum-changed', { detail: { groupId: ctx.group.id } }));
}

async function editReply(ctx, reply) {
  const content = prompt('Antwort bearbeiten:', reply.content || '');
  if (content === null) return;
  const clean = content.trim();
  if (!clean) return alert('Die Antwort darf nicht leer sein.');
  const { error } = await supabase.from('group_forum_replies').update({ content: clean }).eq('id', reply.id);
  if (error) return alert(`Antwort konnte nicht bearbeitet werden: ${error.message}`);
  invalidate(ctx.group.id);
  window.dispatchEvent(new CustomEvent('ec:group-forum-changed', { detail: { groupId: ctx.group.id } }));
}

async function deleteReply(ctx, reply) {
  if (!confirm('Diese Antwort wirklich löschen?')) return;
  const { error } = await supabase.from('group_forum_replies').delete().eq('id', reply.id);
  if (error) return alert(`Antwort konnte nicht gelöscht werden: ${error.message}`);
  invalidate(ctx.group.id);
  window.dispatchEvent(new CustomEvent('ec:group-forum-changed', { detail: { groupId: ctx.group.id } }));
}

function bindOnce(button, handler) {
  let running = false;
  button.addEventListener('click', async (event) => {
    event.preventDefault(); event.stopPropagation();
    if (running) return;
    running = true; button.disabled = true;
    try { await handler(); } finally { running = false; if (button.isConnected) button.disabled = false; }
  });
}

async function sync(page = document.querySelector('.gfp-page')) {
  if (!page) return;
  const version = ++syncVersion;
  const ctx = await currentContext(page);
  if (version !== syncVersion || !page.isConnected || !ctx) return;

  if (ctx.canManageGroup && !page.querySelector('.gfp-group-actions')) {
    const heroCopy = page.querySelector('.gfp-hero-copy');
    if (heroCopy) {
      const wrap = document.createElement('div'); wrap.className = 'gfp-group-actions';
      const edit = actionButton('✎ Gruppe bearbeiten'); const del = actionButton('Gruppe löschen', 'danger');
      bindOnce(edit, () => editGroup(ctx)); bindOnce(del, () => deleteGroup(ctx));
      wrap.append(edit, del); heroCopy.append(wrap);
    }
  }

  page.querySelectorAll('.gfp-post').forEach((node) => {
    const id = node.dataset.postId;
    const post = ctx.posts.find(p => p.id === id);
    if (!post || node.querySelector('.gfp-post-actions')) return;
    if (!(ctx.canManageGroup || post.author_id === ctx.user.id)) return;
    const wrap = document.createElement('div'); wrap.className = 'gfp-post-actions';
    const edit = actionButton('✎ Bearbeiten'); const del = actionButton('Löschen', 'danger');
    bindOnce(edit, () => editPost(ctx, post)); bindOnce(del, () => deletePost(ctx, post));
    wrap.append(edit, del); node.querySelector('.gfp-author')?.append(wrap);

    const postReplies = ctx.replies.filter(r => r.post_id === post.id);
    node.querySelectorAll('.gfp-reply').forEach((replyNode, index) => {
      const replyId = replyNode.dataset.replyId;
      const reply = (replyId && ctx.replies.find(r => r.id === replyId)) || postReplies[index];
      if (!reply || replyNode.querySelector('.gfp-reply-actions')) return;
      if (!(ctx.canManageGroup || reply.author_id === ctx.user.id)) return;
      const actions = document.createElement('span'); actions.className = 'gfp-reply-actions';
      const re = actionButton('Bearbeiten'); const rd = actionButton('Löschen', 'danger');
      bindOnce(re, () => editReply(ctx, reply)); bindOnce(rd, () => deleteReply(ctx, reply));
      actions.append(re, rd); replyNode.querySelector(':scope > div > div')?.append(actions);
    });
  });
}

window.addEventListener('ec:group-page-rendered', (event) => void sync(event.detail?.page));
window.addEventListener('ec:navigate', () => { syncVersion++; });
window.addEventListener('popstate', () => { syncVersion++; });
queueMicrotask(() => void sync());

export {};
