import {isOperatorProfile,operatorStarSrc} from './operator-identity.js';
import {directoryRegionalRole} from './directoryRegionalRole.js';

// Shared display data only. This does not change account permissions.
export function directoryCardMember(member,{regions=[],activeRegion,regionalAssignments=[]}={}){
  const role=String(member?.role||'MEMBER').toUpperCase();
  const ids=new Set((member.regional_admin_regions||member.regional_admin_region_ids||[]).map(r=>typeof r==='string'?r:r?.id).filter(Boolean));
  regionalAssignments.filter(a=>a.user_id===member.id&&a.active!==false).forEach(a=>ids.add(a.region_id));
  const regional=directoryRegionalRole(ids,activeRegion?.id);
  const byId=Object.fromEntries(regions.map(r=>[r.id,r]));
  const home=byId[member.home_region_id];
  const homeLabel=home?.short_name||home?.name||'Hauptregion';
  const assigned=[...ids].map(id=>byId[id]).filter(Boolean).map(r=>r.short_name||r.name).join(', ')||homeLabel;
  const operator=isOperatorProfile(member);
  const admin=['HEAD_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(role);
  const star=operator?operatorStarSrc:admin?'/role-star-red.svg':regional.assigned?regional.star:role==='MUNICIPALITY'?'/role-star-green.svg':member.account_badge==='BUSINESS'?'/role-star-blue.svg':role==='SUPPORTER'?'/supporter-star.svg':null;
  return {...member,directory_admin:operator||admin||(regional.assigned&&regional.here),directory_supporter:!admin&&!operator&&regional.assigned&&!regional.here,directory_role_star:star,
    directory_responsibility_label:operator?'':role==='HEAD_ADMIN'?'Hauptadmin · alle Regionen':role==='ADMIN'?`Global Admin · Region ${homeLabel}`:regional.assigned?`Regional Admin · Region ${assigned}`:member.directory_responsibility_label||''};
}
