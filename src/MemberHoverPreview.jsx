import {directoryCardMember} from './memberCardPresentation.js';
import {supabase} from './supabaseClient.js';
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import MemberCardView from './MemberCardView.jsx';
import { loadMemberProfile } from './memberProfileLoader.js';
import { bindHoverPreview, previewPosition, privatePreviewMember, resolvePreviewTarget } from './memberHoverPreview.js';

export default function MemberHoverPreview({ members, profile, friendships, page, regions, activeRegion }) {
  const [preview, setPreview] = useState(null);
  const [context,setContext]=useState({regionalAssignments:[],foundingHighlights:{}});
  useEffect(()=>{
    let disposed=false;
    const refresh=async()=>{
      const [assignments,founders]=await Promise.all([supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),supabase.rpc('ec_active_founding_members')]);
      if(!disposed)setContext(current=>({regionalAssignments:assignments.error?current.regionalAssignments:assignments.data||[],foundingHighlights:founders.error?current.foundingHighlights:Object.fromEntries((founders.data||[]).map(row=>[row.member_id,row.expires_at]))}));
    };
    void refresh();const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);
    return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[profile?.id,activeRegion?.id]);
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
      <MemberCardView member={directoryCardMember(privatePreviewMember(preview.member, profile, friendships),{regions,activeRegion,regionalAssignments:context.regionalAssignments})} profile={profile} friendships={friendships} foundingHighlightUntil={context.foundingHighlights[preview.member.id]} interactive={false} />
    </div>, document.querySelector('.app') || document.body
  );
}
