export const COMMUNITY_REGIONS = [
  { slug: "ennstal", name: "Ennstal", shortName: "Ennstal" },
  { slug: "leoben-bruck-muerzzuschlag", name: "Leoben – Bruck – Mürzzuschlag", shortName: "LBM" },
  { slug: "salzkammergut", name: "Salzkammergut", shortName: "Salzkammergut" },
];

export const DEFAULT_REGION_SLUG = "ennstal";

export function regionBySlug(slug) {
  return COMMUNITY_REGIONS.find((region) => region.slug === slug) || COMMUNITY_REGIONS[0];
}

export function effectiveRole(member, activeRegionId, regionalAssignments = []) {
  const role = String(member?.role || "MEMBER").toUpperCase();
  if (role === "HEAD_ADMIN") return "HEAD_ADMIN";
  if (role === "ADMIN") return "ADMIN";
  const assignments = regionalAssignments.filter((item) => item.user_id === member?.id && item.active !== false);
  if (assignments.some((item) => item.region_id === activeRegionId)) return "ADMIN";
  if (assignments.length || role === "SUPPORTER") return "SUPPORTER";
  return "MEMBER";
}

export function isHomeRegion(member, activeRegionId) {
  return Boolean(member?.home_region_id && member.home_region_id === activeRegionId);
}
