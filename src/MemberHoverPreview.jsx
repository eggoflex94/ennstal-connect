import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import MemberCardView from './MemberCardView.jsx';
import { loadMemberProfile } from './memberProfileLoader.js';
import { bindHoverPreview, previewPosition, privatePreviewMember, resolvePreviewTarget } from './memberHoverPreview.js';

export default function MemberHoverPreview({ members, profile, friendships, page }) {
  const [preview, setPreview] = useState(null);
  const latestMembers=useRef(members);latestMembers.current=members;
  useEffect(() => bindHoverPreview({
    document, window,
    resolve: node => resolvePreviewTarget(node, latestMembers.current),
    load: loadMemberProfile,
    show: (member, rect) => setPreview({ member, position: previewPosition(rect, { width: window.innerWidth, height: window.innerHeight }) }),
    hide: () => setPreview(null)
  }), [profile?.id, page]);

  if (!preview) return null;
  return createPortal(
    <div id="ec-member-hover-preview" className="ec-member-hover-preview" role="tooltip" style={preview.position}>
      <MemberCardView member={privatePreviewMember(preview.member, profile, friendships)} profile={{id:profile?.id}} friendships={friendships} interactive={false} />
    </div>, document.body
  );
}
