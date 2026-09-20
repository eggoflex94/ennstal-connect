import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import MemberCardView from "./MemberCardView.jsx";

function safeArray(value){return Array.isArray(value)?value:[]}
function dateLabel(value){if(!value)return"";try{return new Date(value).toLocaleString("de-AT",{dateStyle:"medium",timeStyle:"short"})}catch{return""}}

export default function ProfileSocialTabs({ member, viewerProfile, friendships = [], onOpenMember, onOpenGroup }) {
  const [data,setData]=useState({friend_count:0,group_count:0,forum_post_count:0,friends:[],groups:[],forum_posts:[]});
  const [active,setActive]=useState("groups");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError("");
    supabase.rpc("ec_profile_social_overview",{p_user_id:member.id}).then(({data:result,error:rpcError})=>{
      if(cancelled)return;
      if(rpcError){setError(rpcError.message||"Profilbereiche konnten nicht geladen werden.");setLoading(false);return}
      const next=result||{};
      setData({
        friend_count:Number(next.friend_count||0),
        group_count:Number(next.group_count||0),
        forum_post_count:Number(next.forum_post_count||0),
        friends:safeArray(next.friends),
        groups:safeArray(next.groups),
        forum_posts:safeArray(next.forum_posts)
      });
      setLoading(false);
    });
    return()=>{cancelled=true};
  },[member.id]);

  const tabs=useMemo(()=>[
    {key:"groups",label:"Gruppen",count:data.group_count,icon:"●"},
    {key:"forum",label:"Forum-Beiträge",count:data.forum_post_count,icon:"▤"},
    {key:"friends",label:"Freunde",count:data.friend_count,icon:"♡"}
  ],[data.group_count,data.forum_post_count,data.friend_count]);

  return <section className="profile-social-browser panel">
    <nav className="profile-social-tabs" aria-label="Profilbereiche">
      {tabs.map(tab=><button key={tab.key} type="button" className={active===tab.key?"active":""} onClick={()=>setActive(tab.key)} aria-pressed={active===tab.key}>
        <span aria-hidden="true">{tab.icon}</span><strong>{tab.label}</strong><b>{tab.count}</b>
      </button>)}
    </nav>

    <div className="profile-social-stage">
      {loading&&<div className="profile-social-empty">Profilbereich wird geladen …</div>}
      {!loading&&error&&<div className="profile-social-empty error">{error}</div>}

      {!loading&&!error&&active==="friends"&&<>
        <header className="profile-social-heading"><div><span className="eyebrow">FREUNDE</span><h2>{data.friend_count} {data.friend_count===1?"Freund":"Freunde"}</h2></div></header>
        {data.friends.length?<div className="profile-social-member-grid">{data.friends.map(friend=>
          <MemberCardView key={friend.id} member={friend} profile={viewerProfile} friendships={friendships} onOpen={onOpenMember}/>
        )}</div>:<div className="profile-social-empty">Noch keine bestätigten Freundschaften.</div>}
      </>}

      {!loading&&!error&&active==="groups"&&<>
        <header className="profile-social-heading"><div><span className="eyebrow">GRUPPEN</span><h2>{data.group_count} {data.group_count===1?"Gruppe":"Gruppen"}</h2></div></header>
        {data.groups.length?<div className="profile-social-card-grid">{data.groups.map(group=><button type="button" className="profile-social-group-card" key={group.id} onClick={()=>onOpenGroup?.(group)}>
          <span className="profile-social-group-image">{group.image_url?<img src={group.image_url} alt=""/>:<b>●</b>}</span>
          <span className="profile-social-group-copy"><strong>{group.name}</strong><small>{group.description||"Community-Gruppe"}</small><em>{Number(group.member_count||0)} Mitglieder</em></span>
        </button>)}</div>:<div className="profile-social-empty">Dieses Mitglied ist aktuell in keiner Gruppe.</div>}
      </>}

      {!loading&&!error&&active==="forum"&&<>
        <header className="profile-social-heading"><div><span className="eyebrow">FORUM</span><h2>{data.forum_post_count} {data.forum_post_count===1?"Beitrag":"Beiträge"}</h2></div></header>
        {data.forum_posts.length?<div className="profile-social-forum-list">{data.forum_posts.map(post=><article className="profile-social-forum-card" key={post.id}>
          <div><strong>{post.title}</strong><time>{dateLabel(post.created_at)}</time></div>
          <p>{post.content}</p>
          {post.is_ai_generated&&<small>✦ KI-Inhalt gekennzeichnet</small>}
        </article>)}</div>:<div className="profile-social-empty">Noch keine Community-Forum-Beiträge vorhanden.</div>}
      </>}
    </div>
  </section>;
}
