import { supabase } from './supabaseClient';

export async function loadMemberScores(userIds = []) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const scores = new Map();
  if (!supabase || !ids.length) return scores;

  const { data, error } = await supabase.rpc('ec_member_scores', { p_user_ids: ids });
  if (error) {
    console.warn('Gesamtpunkte konnten nicht geladen werden:', error.message);
    return scores;
  }

  (data || []).forEach((row) => {
    if (row?.user_id) scores.set(String(row.user_id), Number(row.score || 0));
  });
  return scores;
}
