import { supabase } from './supabaseClient';

const cap=(value,max)=>Math.min(max,Math.max(0,Number(value)||0));
const bump=(map,key,amount=1)=>{if(!key)return;const id=String(key);map.set(id,(map.get(id)||0)+amount)};

export async function loadMemberScores(userIds=[]){
  const ids=[...new Set((userIds||[]).filter(Boolean).map(String))];
  const scores=new Map();
  if(!supabase||!ids.length)return scores;

  const [profiles,posts,replies,friendOut,friendIn,groups,events,polls,requests]=await Promise.all([
    supabase.from('profiles').select('id,points,total_online_seconds,nickname,avatar_url,bio,location,interests').in('id',ids),
    supabase.from('forum_posts').select('author_id').in('author_id',ids).eq('scope','COMMUNITY').limit(1000),
    supabase.from('forum_replies').select('author_id').in('author_id',ids).limit(1000),
    supabase.from('friendships').select('requester_id,receiver_id').in('requester_id',ids).eq('status','ACCEPTED').limit(1000),
    supabase.from('friendships').select('requester_id,receiver_id').in('receiver_id',ids).eq('status','ACCEPTED').limit(1000),
    supabase.from('community_group_members').select('user_id').in('user_id',ids).limit(1000),
    supabase.from('community_event_rsvps').select('user_id,status').in('user_id',ids).limit(1000),
    supabase.from('community_weekly_poll_votes').select('user_id').in('user_id',ids).limit(1000),
    supabase.from('community_requests').select('author_id').in('author_id',ids).limit(1000)
  ]);

  const postsBy=new Map(),repliesBy=new Map(),friendsBy=new Map(),groupsBy=new Map(),eventsBy=new Map(),pollsBy=new Map(),requestsBy=new Map();
  (posts.data||[]).forEach(r=>bump(postsBy,r.author_id));
  (replies.data||[]).forEach(r=>bump(repliesBy,r.author_id));
  const seen=new Set();
  [...(friendOut.data||[]),...(friendIn.data||[])].forEach(r=>{
    const a=String(r.requester_id||''),b=String(r.receiver_id||''),key=[a,b].sort().join(':');
    if(seen.has(key))return;seen.add(key);
    if(ids.includes(a))bump(friendsBy,a);
    if(ids.includes(b))bump(friendsBy,b);
  });
  (groups.data||[]).forEach(r=>bump(groupsBy,r.user_id));
  (events.data||[]).forEach(r=>bump(eventsBy,r.user_id,r.status==='GOING'?5:r.status==='INTERESTED'?2:0));
  (polls.data||[]).forEach(r=>bump(pollsBy,r.user_id));
  (requests.data||[]).forEach(r=>bump(requestsBy,r.author_id));

  (profiles.data||[]).forEach(p=>{
    let profileBonus=0;
    if(String(p.nickname||'').trim())profileBonus+=2;
    if(String(p.avatar_url||'').trim())profileBonus+=2;
    if(String(p.bio||'').trim())profileBonus+=2;
    if(String(p.location||'').trim())profileBonus+=2;
    if((Array.isArray(p.interests)?p.interests.join(','):String(p.interests||'')).trim())profileBonus+=2;
    const score=
      cap(Math.floor((Number(p.total_online_seconds)||0)/7200),250)+
      cap((postsBy.get(String(p.id))||0)*5,200)+
      cap((repliesBy.get(String(p.id))||0)*2,150)+
      cap((friendsBy.get(String(p.id))||0)*3,90)+
      cap((groupsBy.get(String(p.id))||0)*4,80)+
      cap(eventsBy.get(String(p.id))||0,120)+
      cap((pollsBy.get(String(p.id))||0)*2,40)+
      cap((requestsBy.get(String(p.id))||0)*4,80)+
      profileBonus+
      (Number(p.points)||0);
    scores.set(String(p.id),score);
  });
  return scores;
}
