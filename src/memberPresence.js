export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export function isMemberOnline(profile, now=Date.now()) {
 if(profile?.is_online!==true || profile.hide_online_status)return false;
 const last=Date.parse(profile.last_active_at||profile.last_seen_at||'');
 const age=now-last;
 return Number.isFinite(last)&&age>=0&&age<ONLINE_WINDOW_MS;
}
