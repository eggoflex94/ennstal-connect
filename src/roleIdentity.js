export const ROLE_ORDER = { HEAD_ADMIN: 1, ADMIN: 2, SUPPORTER: 3, MEMBER: 4 };

export function roleIdentity(profile = {}) {
  const role = String(profile.role || "MEMBER").toUpperCase();
  const badge = String(profile.account_badge || "").toUpperCase();

  // Head Admin and Admin intentionally share the same red team identity.
  // The Head Admin remains clearly distinguishable by the role label and
  // its first position wherever team members are sorted by ROLE_ORDER.
  if (role === "HEAD_ADMIN") return { key: "head-admin", label: "Head Admin", mark: "★", color: "#ef4444" };
  if (role === "ADMIN") return { key: "admin", label: "Community Admin", mark: "★", color: "#ef4444" };
  if (role === "SUPPORTER") return { key: "supporter", label: "Supporter", mark: "★", color: "#45d89f" };
  if (badge === "BUSINESS" || badge.includes("UNTERNEHM")) return { key: "business", label: "Unternehmenskonto", mark: "★", color: "#45c7ff" };
  return { key: "member", label: "Mitglied", mark: "", color: profile.nickname_color || "#f7fbff" };
}

export const roleClass = (profileOrRole) => roleIdentity(typeof profileOrRole === "string" ? { role: profileOrRole } : profileOrRole).key;
export const roleLabel = (profileOrRole) => roleIdentity(typeof profileOrRole === "string" ? { role: profileOrRole } : profileOrRole).label;
export const roleMark = (profileOrRole) => roleIdentity(typeof profileOrRole === "string" ? { role: profileOrRole } : profileOrRole).mark;
export const isAdminRole = (role) => ["HEAD_ADMIN", "ADMIN"].includes(String(role || "").toUpperCase());
export const isHeadAdminRole = (role) => String(role || "").toUpperCase() === "HEAD_ADMIN";
