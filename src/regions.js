export const COMMUNITY_REGIONS = [
  { slug: "ennstal", name: "Ennstal", shortName: "Ennstal" },
  { slug: "leoben-bruck-muerzzuschlag", name: "Leoben – Bruck – Mürzzuschlag", shortName: "LBM" },
  { slug: "salzkammergut", name: "Salzkammergut", shortName: "Salzkammergut" },
];

export const DEFAULT_REGION_SLUG = "ennstal";
export const ALL_REGIONS = "all";

export function regionBySlug(slug) {
  return COMMUNITY_REGIONS.find((region) => region.slug === slug) || COMMUNITY_REGIONS[0];
}

export function regionalAssignmentsFor(member, regionalAssignments = []) {
  return regionalAssignments.filter((item) => item.user_id === member?.id && item.active !== false);
}

export function effectiveRole(member, activeRegionId, regionalAssignments = []) {
  const role = String(member?.role || "MEMBER").toUpperCase();
  if (role === "HEAD_ADMIN") return "HEAD_ADMIN";
  if (role === "ADMIN") return "ADMIN";
  const assignments = regionalAssignmentsFor(member, regionalAssignments);
  if (assignments.some((item) => item.region_id === activeRegionId)) return "ADMIN";
  if (assignments.length || role === "SUPPORTER") return "SUPPORTER";
  return "MEMBER";
}

export function rolePresentation(member, activeRegionId, regionalAssignments = [], regions = []) {
  const baseRole = String(member?.role || "MEMBER").toUpperCase();
  const assignments = regionalAssignmentsFor(member, regionalAssignments);
  const assignmentHere = assignments.find((item) => item.region_id === activeRegionId);

  if (baseRole === "HEAD_ADMIN") {
    return { effectiveRole: "HEAD_ADMIN", cardRole: "HEAD_ADMIN", profileLabel: "Hauptadmin", regionalAdmin: false };
  }
  if (baseRole === "ADMIN") {
    return { effectiveRole: "ADMIN", cardRole: "ADMIN", profileLabel: "Global Admin", regionalAdmin: false };
  }
  if (assignmentHere) {
    const region = regions.find((item) => item.id === assignmentHere.region_id);
    return {
      effectiveRole: "ADMIN",
      cardRole: "ADMIN",
      profileLabel: `Regional Admin ${region?.name || ""}`.trim(),
      regionalAdmin: true,
      adminRegionId: assignmentHere.region_id,
    };
  }
  if (assignments.length) {
    const homeAssignment = assignments[0];
    const region = regions.find((item) => item.id === homeAssignment.region_id);
    return {
      effectiveRole: "SUPPORTER",
      cardRole: "SUPPORTER",
      profileLabel: `Regional Admin ${region?.name || ""}`.trim(),
      regionalAdmin: true,
      adminRegionId: homeAssignment.region_id,
    };
  }
  if (baseRole === "SUPPORTER") {
    return { effectiveRole: "SUPPORTER", cardRole: "SUPPORTER", profileLabel: "Supporter", regionalAdmin: false };
  }
  return { effectiveRole: "MEMBER", cardRole: "MEMBER", profileLabel: "Mitglied", regionalAdmin: false };
}

export function isHomeRegion(member, activeRegionId) {
  return Boolean(member?.home_region_id && member.home_region_id === activeRegionId);
}

export function memberVisibleInDirectory(member, viewerHomeRegionId, regionFilter = null) {
  if (!member) return false;
  if (regionFilter === ALL_REGIONS) return true;
  const targetRegion = regionFilter || viewerHomeRegionId;
  return Boolean(targetRegion && member.home_region_id === targetRegion);
}

export function filterMembersByRegion(members = [], viewerHomeRegionId, regionFilter = null) {
  return members.filter((member) => memberVisibleInDirectory(member, viewerHomeRegionId, regionFilter));
}

export function contentVisibleInRegion(item, activeRegionId) {
  return Boolean(item && activeRegionId && item.region_id === activeRegionId);
}
