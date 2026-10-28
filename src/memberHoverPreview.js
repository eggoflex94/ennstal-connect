// Read-only nickname previews; opening one never records a profile visit.
export function previewPosition(rect, viewport, width = 190, height = 250) {
  const gap = 12, margin = 10;
  const right = rect.right + gap;
  const left = right + width <= viewport.width - margin ? right : rect.left - width - gap;
  return {
    left: Math.max(margin, Math.min(left, viewport.width - width - margin)),
    top: Math.max(margin, Math.min(rect.top - 12, viewport.height - height - margin))
  };
}

export function privatePreviewMember(member, viewer, friendships = []) {
  const own = member.id === viewer?.id;
  const friend = friendships.some(row => row.status === 'ACCEPTED' &&
    ((row.requester_id === viewer?.id && row.receiver_id === member.id) ||
     (row.receiver_id === viewer?.id && row.requester_id === member.id)));
  const admin = ['HEAD_ADMIN', 'ADMIN'].includes(viewer?.role);
  const visible = field => own || (member.privacy_settings?.[field] || 'PUBLIC') === 'PUBLIC' ||
    (member.privacy_settings?.[field] === 'FRIENDS' && friend);
  return {
    ...member,
    first_name: visible('name') ? member.first_name : '',
    last_name: visible('name') && (own || admin || member.privacy_settings?.last_name !== 'ADMIN_ONLY') ? member.last_name : '',
    birth_date: visible('birth_date') ? member.birth_date : null
  };
}

export function resolvePreviewTarget(node, members) {
  const element = node?.closest?.('[data-member-preview-id], .ec-profile-visitor-name, .ec-profile-visit-name strong, .ec-team-name, .ec-profile-link, .ec-role-person strong, .ec-global-role-identity strong, .ec-identity-name, .ec-online-nickname, .ec-online-friend-name, .ec-profile-native-link');
  if (!element || element.closest('.ec-member-hover-preview, .member-card')) return null;
  const owner = element.closest('[data-member-preview-id], [data-profile-id], [data-member-id]');
  const id = owner?.dataset.memberPreviewId || owner?.dataset.profileId || owner?.dataset.memberId;
  return id ? { element, member: members.find(member => member.id === id) || { id, nickname: element.textContent.replace(/\s*\[[\d.,\s]+\]\s*$/, '').trim() } } : null;
}

// Separate lifecycle so stale network responses cannot reopen a dismissed preview.
export function bindHoverPreview({ document, window, resolve, load, show, hide, delay = 180 }) {
  let active = null, timer, revision = 0;
  const close = () => {
    revision++;
    window.clearTimeout(timer);
    if (active) {
      const described = (active.element.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== 'ec-member-hover-preview');
      if (described.length) active.element.setAttribute('aria-describedby', described.join(' '));
      else active.element.removeAttribute('aria-describedby');
    }
    active = null;
    hide();
  };
  const enter = event => {
    if (event.pointerType === 'touch') return;
    const next = resolve(event.target);
    if (next?.element === active?.element) return;
    close();
    if (!next) return;
    active = next;
    const currentRevision = revision;
    timer = window.setTimeout(async () => {
      try {
        const member = await load({ ...next.member });
        if (currentRevision !== revision || !next.element.isConnected || !member?.id) return;
        const described = next.element.getAttribute('aria-describedby');
        next.element.setAttribute('aria-describedby', [described, 'ec-member-hover-preview'].filter(Boolean).join(' '));
        show(member, next.element.getBoundingClientRect());
      } catch { if (currentRevision === revision) close(); }
    }, delay);
  };
  const leave = event => {
    if (active && active.element.contains(event.target) && !active.element.contains(event.relatedTarget)) close();
  };
  const escape = event => { if (event.key === 'Escape') close(); };
  const listeners = [
    [document, 'pointerover', enter], [document, 'pointerout', leave],
    [document, 'focusin', enter], [document, 'focusout', leave],
    [document, 'keydown', escape], [document, 'pointerdown', close],
    [document, 'click', close], [document, 'scroll', close, true],
    [document, 'visibilitychange', close], [window, 'resize', close], [window, 'blur', close]
  ];
  listeners.forEach(([target, event, handler, capture]) => target.addEventListener(event, handler, capture));
  return () => {
    close();
    listeners.forEach(([target, event, handler, capture]) => target.removeEventListener(event, handler, capture));
  };
}
