// Public profile identity for the single designated platform operator.
// Never infer operator status from HEAD_ADMIN: other head admins retain the red role badge.
export const OPERATOR_PROFILE_ID = '0016da9f-eb6d-43e4-870c-05709a5d56d4';
export function isOperatorProfile(profile){return Boolean(profile && (profile.is_primary_head_admin === true || String(profile.id || profile.user_id || '') === OPERATOR_PROFILE_ID));}
export const operatorStarSrc = '/operator-star-gold.svg';
