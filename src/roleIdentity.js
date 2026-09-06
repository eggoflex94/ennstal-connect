export const ROLE_ORDER = { HEAD_ADMIN: 1, ADMIN: 2, SUPPORTER: 3, MEMBER: 4 };

export function roleIdentity(profile = {}) {
  const role = String(profile.role || "MEMBER").toUpperCase();
  const badge = String(profile.account_badge || "").toUpperCase();
  if (role === "HEAD_ADMIN") return { key: "head-admin", label: "Head Admin", mark: "♛", color: "#ffd34d" };
  if (role === "ADMIN") return { key: "admin", label: "Community Admin", mark: "◆", color: "#62b8ff" };
  if (role === "SUPPORTER") return { key: "supporter", label: "Supporter", mark: "★", color: "#55dfa8" };
  if (badge === "BUSINESS" || badge.includes("UNTERNEHM")) return { key: "business", label: "Unternehmenskonto", mark: "★", color: "#54c8ff" };
  return { key: "member", label: "Mitglied", mark: "", color: profile.nickname_color || "#f7fbff" };
}

export const roleClass = (profileOrRole) => roleIdentity(typeof profileOrRole === "string" ? { role: profileOrRole } : profileOrRole).key;
export const roleLabel = (profileOrRole) => roleIdentity(typeof profileOrRole === "string" ? { role: profileOrRole } : profileOrRole).label;
export const roleMark = (profileOrRole) => roleIdentity(typeof profileOrRole === "string" ? { role: profileOrRole } : profileOrRole).mark;
export const isAdminRole = (role) => ["HEAD_ADMIN", "ADMIN"].includes(String(role || "").toUpperCase());
export const isHeadAdminRole = (role) => String(role || "").toUpperCase() === "HEAD_ADMIN";
