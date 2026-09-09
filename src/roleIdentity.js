export const ROLE_ORDER = { HEAD_ADMIN: 1, ADMIN: 2, SUPPORTER: 3, MEMBER: 4 };

export function roleIdentity(profile = {}) {
  const role = String(profile.role || "MEMBER").toUpperCase();
  const badge = String(profile.account_badge || "").toUpperCase();
  if (role === "HEAD_ADMIN") return { key:"head-admin", label:"Hauptadmin", mark:"", icon:"/role-star-red.svg", color:"#ef4444" };
  if (role === "ADMIN") return { key:"admin", label:"Admin", mark:"", icon:"/role-star-red.svg", color:"#ef4444" };
  if (role === "SUPPORTER") return { key:"supporter", label:"Supporter", mark:"", icon:"/supporter-star.svg", color:"#ffd400" };
  if (badge === "BUSINESS" || badge.includes("UNTERNEHM")) return { key:"business", label:"Unternehmenskonto", mark:"", icon:"/role-star-blue.svg", color:"#45c7ff" };
  return { key:"member", label:"Mitglied", mark:"", icon:null, color:profile.nickname_color || "#f7fbff" };
}
export const roleClass=p=>roleIdentity(typeof p==="string"?{role:p}:p).key;
export const roleLabel=p=>roleIdentity(typeof p==="string"?{role:p}:p).label;
export const roleMark=p=>roleIdentity(typeof p==="string"?{role:p}:p).mark;
export const roleIcon=p=>roleIdentity(typeof p==="string"?{role:p}:p).icon;
export const isAdminRole=role=>["HEAD_ADMIN","ADMIN"].includes(String(role||"").toUpperCase());
export const isHeadAdminRole=role=>String(role||"").toUpperCase()==="HEAD_ADMIN";

export function verifiedState(profile={}){
  return profile.is_verified===true || profile.verified===true || String(profile.account_status||"").toUpperCase()==="VERIFIED" || String(profile.verification_status||"").toUpperCase()==="VERIFIED";
}
function eagerImage(src,alt,title,className){
  const img=document.createElement("img");
  img.src=src;img.alt=alt;img.title=title||alt;img.className=className;img.loading="eager";img.decoding="async";img.fetchPriority="high";
  return img;
}
export function makeRoleIcon(profile,size="normal"){
  const ident=roleIdentity(profile); if(!ident.icon)return null;
  return eagerImage(ident.icon,ident.label,ident.label,`ec-role-star ec-role-star-${size}`);
}
export function makeVerifiedBadge(profile,size="small"){
  if(!verifiedState(profile))return null;
  return eagerImage("/badge-verified.svg","Verifiziert","Verifiziert",`ec-status-badge ec-status-badge-${size}`);
}
export function makeFriendBadge(size="normal"){
  return eagerImage("/badge-friendship.png","Befreundet","Befreundet",`ec-status-badge ec-status-badge-${size}`);
}
