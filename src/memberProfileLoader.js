import { supabase } from './supabaseClient.js';

const PROFILE_TTL_MS = 15_000;
const profileCache = new Map();
const inFlight = new Map();

const normalize = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
};

const mergeIntoMember = (member, value) => {
  if (!member || !value) return member || value || null;
  // Keep the directory object itself fresh as well. App.jsx may later reuse the
  // same object from the member directory when community data refreshes. By
  // enriching that object in place, the fully loaded profile is not replaced
  // by an older/partial directory snapshot a moment after opening it.
  Object.assign(member, value);
  return member;
};

export function invalidateMemberProfile(profileId) {
  if (profileId) profileCache.delete(profileId);
  else profileCache.clear();
}

export async function loadMemberProfile(member, { force = false } = {}) {
  if (!member?.id || !supabase) return member || null;
  const id = member.id;
  const cached = profileCache.get(id);
  if (!force && cached && Date.now() - cached.at < PROFILE_TTL_MS) {
    return mergeIntoMember(member, cached.value);
  }
  if (inFlight.has(id)) {
    const value = await inFlight.get(id);
    return value ? mergeIntoMember(member, value) : member;
  }

  const request = (async () => {
    const { data, error } = await supabase.rpc('community_member_profile', { p_user: id });
    if (error) {
      console.warn('Profil konnte nicht frisch geladen werden:', error.message);
      return null;
    }
    const value = normalize(Array.isArray(data) ? data[0] : data);
    if (value?.id) profileCache.set(id, { at: Date.now(), value });
    return value;
  })().finally(() => inFlight.delete(id));

  inFlight.set(id, request);
  const value = await request;
  return value ? mergeIntoMember(member, value) : member;
}
