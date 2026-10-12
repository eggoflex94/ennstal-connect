// Directory presentation only; this never grants administrative permissions.
export function directoryRegionalRole(regionIds, activeRegionId) {
  const ids = [...(regionIds || [])];
  const assigned = ids.length > 0;
  const here = assigned && (!activeRegionId || ids.includes(activeRegionId));
  return { assigned, here, star: assigned ? (here ? '/role-star-red.svg' : '/supporter-star.svg') : null };
}
