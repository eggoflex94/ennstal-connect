
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

export default function Members() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("profiles")
      .select(`
        id,
        first_name,
        last_name,
        nickname,
        avatar_url,
        role,
        is_online,
        bio
      `);

    if (error) {
      console.error(error);
      setError("Mitglieder konnten nicht geladen werden.");
      setLoading(false);
      return;
    }

    setMembers(data || []);
    setLoading(false);
  }

  const sortedMembers = useMemo(() => {
    const searchValue = search.toLowerCase().trim();

    const filtered = members.filter((member) => {
      const fullName =
        `${member.first_name || ""} ${member.last_name || ""} ${member.nickname || ""}`
          .toLowerCase();

      return fullName.includes(searchValue);
    });

    return [...filtered].sort((a, b) => {
      const getPriority = (role) => {
        const value = String(role || "").toLowerCase();

        if (value === "admin") return 1;
        if (value === "supporter") return 2;

        return 3;
      };

      const priorityA = getPriority(a.role);
      const priorityB = getPriority(b.role);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const nameA = (
        a.nickname ||
        `${a.first_name || ""} ${a.last_name || ""}`
      ).toLowerCase();

      const nameB = (
        b.nickname ||
        `${b.first_name || ""} ${b.last_name || ""}`
      ).toLowerCase();

      return nameA.localeCompare(nameB);
    });
  }, [members, search]);

  function getDisplayName(member) {
    if (member.nickname) return member.nickname;

    const fullName =
      `${member.first_name || ""} ${member.last_name || ""}`.trim();

    return fullName || "Unbekanntes Mitglied";
  }

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Mitglieder</h1>
          <p>
            Entdecke alle Mitglieder unserer Community.
          </p>
        </div>

        <div className="members-count">
          {sortedMembers.length} Mitglieder
        </div>
      </div>

      <div className="members-search-wrapper">
        <input
          type="text"
          placeholder="Mitglied suchen..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="members-search"
        />
      </div>

      {loading && (
        <div className="members-status">
          Mitglieder werden geladen...
        </div>
      )}

      {error && (
        <div className="members-status members-error">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="members-grid">
          {sortedMembers.map((member) => (
            <div className="member-card" key={member.id}>
              <div className="member-avatar-wrapper">
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt={getDisplayName(member)}
                    className="member-avatar"
                  />
                ) : (
                  <div className="member-avatar member-avatar-placeholder">
                    {getDisplayName(member)
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                {member.is_online && (
                  <span className="online-indicator" />
                )}
              </div>

              <div className="member-info">
                <div className="member-name">
                  {getDisplayName(member)}
                </div>

                {member.role &&
                  String(member.role).toLowerCase() !== "member" && (
                    <div
                      className={`member-role member-role-${String(
                        member.role
                      ).toLowerCase()}`}
                    >
                      {String(member.role).toLowerCase() === "admin"
                        ? "Admin"
                        : String(member.role).toLowerCase() === "supporter"
                        ? "Supporter"
                        : member.role}
                    </div>
                  )}

                {member.bio && (
                  <div className="member-bio">
                    {member.bio}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading &&
        !error &&
        sortedMembers.length === 0 && (
          <div className="members-status">
            Keine Mitglieder gefunden.
          </div>
        )}
    </div>
  );
}
