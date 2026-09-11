import { supabase } from './supabaseClient';

let syncing = false;
let timer = null;

async function currentContext(page) {
  const groupId = page?.dataset?.groupId;
  if (!groupId) return null;
  const [{ data: auth }, { data: group }, { data: posts }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('community_groups').select('*').eq('id', groupId).maybeSingle(),
    supabase.from('group_forum_posts').select('*').eq('group_id', groupId).order('created_at', { ascending: false })
  ]);
  const user = auth?.user;
  if (!user || !group) return null;
  const { data: self } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = String(self?.role || '').toUpperCase();
  const canManageGroup = role === 'HEAD_ADMIN' || role === 'ADMIN' || group.owner_id === user.id || group.created_by === user.id;
  const postList = posts || [];
  const { data: replies } = postList.length ? await supabase.from('group_forum_replies').select('*').in('post_id', postList.map(p => p.id)).order('created_at', { ascending: true }) : { data: [] };
  return { group, user, role, canManageGroup, posts: postList, replies: replies || [] };
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
  location.reload();
}

async function deleteGroup(ctx) {
  if (!confirm(`Gruppe „${ctx.group.name}“ wirklich löschen? Alle Gruppenbeiträge und Antworten werden ebenfalls gelöscht.`)) return;
  const { error } = await supabase.rpc('delete_community_group', { p_group_id: ctx.group.id });
  if (error) return alert(`Gruppe konnte nicht gelöscht werden: ${error.message}`);
  const url = new URL(location.href); url.searchParams.delete('group'); location.href = url.toString();
}

async function editPost(post) {
  const title = prompt('Überschrift bearbeiten:', post.title || '');
  if (title === null) return;
  const content = prompt('Beitrag bearbeiten:', post.content || '');
  if (content === null) return;
  const cleanTitle = title.trim();
  const cleanContent = content.trim();
  if (cleanTitle.length < 2 || !cleanContent) return alert('Überschrift oder Beitrag ist zu kurz.');
  const { error } = await supabase.from('group_forum_posts').update({ title: cleanTitle, content: cleanContent, updated_at: new Date().toISOString() }).eq('id', post.id);
  if (error) return alert(`Beitrag konnte nicht bearbeitet werden: ${error.message}`);
  location.reload();
}

async function deletePost(post) {
  if (!confirm('Diesen Forumsbeitrag inklusive Antworten wirklich löschen?')) return;
  const { error } = await supabase.from('group_forum_posts').delete().eq('id', post.id);
  if (error) return alert(`Beitrag konnte nicht gelöscht werden: ${error.message}`);
  location.reload();
}

async function editReply(reply) {
  const content = prompt('Antwort bearbeiten:', reply.content || '');
  if (content === null) return;
  const clean = content.trim();
  if (!clean) return alert('Die Antwort darf nicht leer sein.');
  const { error } = await supabase.from('group_forum_replies').update({ content: clean }).eq('id', reply.id);
  if (error) return alert(`Antwort konnte nicht bearbeitet werden: ${error.message}`);
  location.reload();
}

async function deleteReply(reply) {
  if (!confirm('Diese Antwort wirklich löschen?')) return;
  const { error } = await supabase.from('group_forum_replies').delete().eq('id', reply.id);
  if (error) return alert(`Antwort konnte nicht gelöscht werden: ${error.message}`);
  location.reload();
}

function bindOnce(button, handler) {
  let running = false;
  button.addEventListener('click', async (event) => {
    event.preventDefault(); event.stopPropagation();
    if (running) return;
    running = true; button.disabled = true;
    try { await handler(); } finally { setTimeout(() => { running = false; if (button.isConnected) button.disabled = false; }, 650); }
  });
}

async function sync() {
  if (syncing) return;
  const page = document.querySelector('.gfp-page');
  if (!page) return;
  syncing = true;
  try {
    const ctx = await currentContext(page);
    if (!ctx) return;

    if (ctx.canManageGroup && !page.querySelector('.gfp-group-actions')) {
      const heroCopy = page.querySelector('.gfp-hero-copy');
      if (heroCopy) {
        const wrap = document.createElement('div');
        wrap.className = 'gfp-group-actions';
        const edit = actionButton('✎ Gruppe bearbeiten');
        const del = actionButton('Gruppe löschen', 'danger');
        bindOnce(edit, () => editGroup(ctx)); bindOnce(del, () => deleteGroup(ctx));
        wrap.append(edit, del); heroCopy.append(wrap);
      }
    }

    page.querySelectorAll('.gfp-post').forEach((node) => {
      const id = node.dataset.postId;
      const post = ctx.posts.find(p => p.id === id);
      if (!post || node.querySelector('.gfp-post-actions')) return;
      const canManagePost = ctx.canManageGroup || post.author_id === ctx.user.id;
      if (!canManagePost) return;
      const wrap = document.createElement('div'); wrap.className = 'gfp-post-actions';
      const edit = actionButton('✎ Bearbeiten'); const del = actionButton('Löschen', 'danger');
      bindOnce(edit, () => editPost(post)); bindOnce(del, () => deletePost(post));
      wrap.append(edit, del);
      const author = node.querySelector('.gfp-author'); author?.append(wrap);

      const postReplies = ctx.replies.filter(r => r.post_id === post.id);
      node.querySelectorAll('.gfp-reply').forEach((replyNode, index) => {
        const reply = postReplies[index];
        if (!reply || replyNode.querySelector('.gfp-reply-actions')) return;
        const canManageReply = ctx.canManageGroup || reply.author_id === ctx.user.id;
        if (!canManageReply) return;
        const actions = document.createElement('span'); actions.className = 'gfp-reply-actions';
        const re = actionButton('Bearbeiten'); const rd = actionButton('Löschen', 'danger');
        bindOnce(re, () => editReply(reply)); bindOnce(rd, () => deleteReply(reply));
        actions.append(re, rd); replyNode.querySelector(':scope > div > div')?.append(actions);
      });
    });
  } finally { syncing = false; }
}

function schedule() { clearTimeout(timer); timer = setTimeout(() => void sync(), 100); }
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', schedule);
window.addEventListener('ec:navigate', schedule);
setTimeout(schedule, 400);

export {};
