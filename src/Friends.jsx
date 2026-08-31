import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./app.css";

export default function Friends({ user, openProfile }) {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user?.id) {
      loadAll();
    }
  }, [user]);

  async function loadAll() {
    setLoading(true);

    await Promise.all([
      loadFriends(),
      loadRequests(),
      loadSentRequests(),
      loadBlockedUsers()
    ]);

    setLoading(false);
  }

  // =========================
  // FREUNDE LADEN
  // =========================

  async function loadFriends() {
    try {
      const { data, error } = await supabase
        .from("friendships")
        .select(`
          id,
          requester_id,
          receiver_id,
          status
        `)
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      if (error) throw error;

      const friendIds = data.map((friendship) =>
        friendship.requester_id === user.id
          ? friendship.receiver_id
          : friendship.requester_id
      );

      if (!friendIds.length) {
        setFriends([]);
        return;
      }

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", friendIds)
        .neq("account_status", "SUSPENDED");

      if (profileError) throw profileError;

      const friendsWithFriendship = profiles.map((profile) => {
        const friendship = data.find(
          (item) =>
            item.requester_id === profile.id ||
            item.receiver_id === profile.id
        );

        return {
          ...profile,
          friendship_id: friendship.id
        };
      });

      setFriends(friendsWithFriendship);
    } catch (error) {
      console.error("Fehler beim Laden der Freunde:", error);
    }
  }

  // =========================
  // EINGEHENDE ANFRAGEN
  // =========================

  async function loadRequests() {
    try {
      const { data, error } = await supabase
        .from("friendships")
        .select("*")
        .eq("receiver_id", user.id)
        .eq("status", "pending");

      if (error) throw error;

      if (!data?.length) {
        setRequests([]);
        return;
      }

      const ids = data.map((item) => item.requester_id);

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids)
        .neq("account_status", "SUSPENDED");

      if (profileError) throw profileError;

      const result = profiles.map((profile) => {
        const request = data.find(
          (item) => item.requester_id === profile.id
        );

        return {
          ...profile,
          request_id: request.id
        };
      });

      setRequests(result);
    } catch (error) {
      console.error("Fehler beim Laden der Anfragen:", error);
    }
  }

  // =========================
  // GESENDETE ANFRAGEN
  // =========================

  async function loadSentRequests() {
    try {
      const { data, error } = await supabase
        .from("friendships")
        .select("*")
        .eq("requester_id", user.id)
        .eq("status", "pending");

      if (error) throw error;

      if (!data?.length) {
        setSentRequests([]);
        return;
      }

      const ids = data.map((item) => item.receiver_id);

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);

      if (profileError) throw profileError;

      const result = profiles.map((profile) => ({
        ...profile
      }));

      setSentRequests(result);
    } catch (error) {
      console.error("Fehler bei gesendeten Anfragen:", error);
    }
  }

  // =========================
  // BLOCKIERTE NUTZER LADEN
  // =========================

  async function loadBlockedUsers() {
    try {
      const { data, error } = await supabase
        .from("user_blocks")
        .select("*")
        .eq("blocker_id", user.id);

      if (error) throw error;

      if (!data?.length) {
        setBlockedUsers([]);
        return;
      }

      const ids = data.map((item) => item.blocked_id);

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", ids);

      if (profileError) throw profileError;

      const result = profiles.map((profile) => ({
        ...profile,
        block_id: data.find(
          (item) => item.blocked_id === profile.id
        )?.id
      }));

      setBlockedUsers(result);
    } catch (error) {
      console.error("Fehler beim Laden blockierter Nutzer:", error);
    }
  }

  // =========================
  // FREUNDSCHAFT ANNEHMEN
  // =========================

  async function acceptRequest(requestId) {
    try {
      const { error } = await supabase
        .from("friendships")
        .update({
          status: "accepted"
        })
        .eq("id", requestId);

      if (error) throw error;

      setMessage("Freundschaftsanfrage angenommen.");

      await loadFriends();
      await loadRequests();
    } catch (error) {
      console.error(error);
      setMessage("Fehler beim Annehmen der Anfrage.");
    }
  }

  // =========================
  // FREUNDSCHAFT ABLEHNEN
  // =========================

  async function declineRequest(requestId) {
    try {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", requestId);

      if (error) throw error;

      setMessage("Freundschaftsanfrage abgelehnt.");

      await loadRequests();
    } catch (error) {
      console.error(error);
      setMessage("Fehler beim Ablehnen.");
    }
  }

  // =========================
  // FREUND ENTFERNEN
  // =========================

  async function removeFriend(friendshipId) {
    if (!window.confirm("Möchtest du diesen Freund wirklich entfernen?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId);

      if (error) throw error;

      setMessage("Freund wurde entfernt.");

      await loadFriends();
    } catch (error) {
      console.error(error);
      setMessage("Fehler beim Entfernen.");
    }
  }

  // =========================
  // NUTZER ENTSPERREN
  // =========================

  async function unblockUser(blockId) {
    if (!window.confirm("Möchtest du diesen Nutzer wieder entblocken?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("id", blockId);

      if (error) throw error;

      setMessage("Nutzer wurde wieder freigegeben.");

      await loadBlockedUsers();
    } catch (error) {
      console.error(error);
      setMessage("Fehler beim Entblocken.");
    }
  }

  // =========================
  // MITGLIEDER SUCHEN
  // =========================

  async function searchMembers(value) {
    setSearch(value);

    if (!value || value.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .ilike("nickname", `%${value}%`)
        .neq("id", user.id)
        .neq("account_status", "SUSPENDED")
        .limit(10);

      if (error) throw error;

      // Blockierte Nutzer ausblenden
      const blockedIds = blockedUsers.map((item) => item.id);

      const filtered = data.filter(
        (profile) => !blockedIds.includes(profile.id)
      );

      setSearchResults(filtered);
    } catch (error) {
      console.error(error);
    }
  }

  // =========================
  // FREUNDSCHAFTSANFRAGE SENDEN
  // =========================

  async function sendFriendRequest(receiverId) {
    try {
      const alreadyFriend = friends.some(
        (friend) => friend.id === receiverId
      );

      if (alreadyFriend) {
        setMessage("Dieser Nutzer ist bereits dein Freund.");
        return;
      }

      const alreadyRequested = sentRequests.some(
        (request) => request.id === receiverId
      );

      if (alreadyRequested) {
        setMessage("Du hast bereits eine Anfrage gesendet.");
        return;
      }

      const { error } = await supabase
        .from("friendships")
        .insert({
          requester_id: user.id,
          receiver_id: receiverId,
          status: "pending"
        });

      if (error) throw error;

      setMessage("Freundschaftsanfrage wurde gesendet.");

      await loadSentRequests();
    } catch (error) {
      console.error(error);

      if (error.code === "23505") {
        setMessage("Eine Freundschaftsanfrage besteht bereits.");
      } else {
        setMessage("Fehler beim Senden der Anfrage.");
      }
    }
  }

  // =========================
  // PROFILBILD
  // =========================

  function avatar(profile) {
    return (
      profile.avatar_url ||
      profile.profile_image ||
      "https://via.placeholder.com/100?text=User"
    );
  }

  // =========================
  // ROLLEN LABEL
  // =========================

  function roleLabel(profile) {
    if (profile.role === "HEAD_ADMIN") {
      return <span className="friend-role head-admin">★ HEAD ADMIN</span>;
    }

    if (profile.role === "ADMIN") {
      return <span className="friend-role admin">★ ADMIN</span>;
    }

    if (profile.role === "SUPPORTER") {
      return <span className="friend-role supporter">● SUPPORTER</span>;
    }

    return <span className="friend-role member">Mitglied</span>;
  }

  if (loading) {
    return (
      <div className="friends-page">
        <h1>Freunde</h1>
        <p>Freunde werden geladen...</p>
      </div>
    );
  }

  return (
    <div className="friends-page">

      <div className="friends-header">
        <div>
          <div className="section-kicker">
            COMMUNITY
          </div>

          <h1>Freunde</h1>

          <p>
            Verwalte deine Freundschaften und entdecke Mitglieder.
          </p>
        </div>
      </div>

      {message && (
        <div className="friends-message">
          {message}
        </div>
      )}

      {/* ================= SUCHE ================= */}

      <section className="friends-section">

        <h2>🔎 Mitglieder suchen</h2>

        <input
          className="friend-search"
          type="text"
          placeholder="Mitglied suchen..."
          value={search}
          onChange={(e) => searchMembers(e.target.value)}
        />

        {searchResults.length > 0 && (
          <div className="friend-grid">

            {searchResults.map((profile) => (

              <div
                className={`friend-card ${
                  profile.role === "HEAD_ADMIN"
                    ? "head-admin-card"
                    : profile.role === "ADMIN"
                    ? "admin-card"
                    : profile.role === "SUPPORTER"
                    ? "supporter-card"
                    : ""
                }`}
                key={profile.id}
              >

                <div
                  className="friend-profile-click"
                  onClick={() => openProfile?.(profile)}
                >

                  <img
                    src={avatar(profile)}
                    alt={profile.nickname}
                    className="friend-avatar"
                  />

                  <h3>
                    {profile.nickname || "Mitglied"}
                  </h3>

                  {roleLabel(profile)}

                </div>

                <button
                  className="friend-add-btn"
                  onClick={() =>
                    sendFriendRequest(profile.id)
                  }
                >
                  🤝 Freundschaftsanfrage
                </button>

              </div>

            ))}

          </div>
        )}

      </section>

      {/* ================= FREUNDE ================= */}

      <section className="friends-section">

        <h2>
          👥 Meine Freunde
          <span className="friend-count">
            {friends.length}
          </span>
        </h2>

        {friends.length === 0 ? (

          <div className="empty-state">
            <p>Du hast noch keine Freunde hinzugefügt.</p>
          </div>

        ) : (

          <div className="friend-grid">

            {friends.map((profile) => (

              <div
                className={`friend-card ${
                  profile.role === "HEAD_ADMIN"
                    ? "head-admin-card"
                    : profile.role === "ADMIN"
                    ? "admin-card"
                    : profile.role === "SUPPORTER"
                    ? "supporter-card"
                    : ""
                }`}
                key={profile.id}
              >

                <div
                  className="friend-profile-click"
                  onClick={() => openProfile?.(profile)}
                >

                  <img
                    src={avatar(profile)}
                    alt={profile.nickname}
                    className="friend-avatar"
                  />

                  <h3>
                    {profile.nickname || "Mitglied"}
                  </h3>

                  {roleLabel(profile)}

                </div>

                <div className="friend-actions">

                  <button
                    className="friend-profile-btn"
                    onClick={() => openProfile?.(profile)}
                  >
                    👤 Profil
                  </button>

                  <button
                    className="friend-remove-btn"
                    onClick={() =>
                      removeFriend(profile.friendship_id)
                    }
                  >
                    Freund entfernen
                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </section>

      {/* ================= ANFRAGEN ================= */}

      <section className="friends-section">

        <h2>
          📨 Freundschaftsanfragen
          <span className="friend-count">
            {requests.length}
          </span>
        </h2>

        {requests.length === 0 ? (

          <div className="empty-state">
            <p>Keine offenen Freundschaftsanfragen.</p>
          </div>

        ) : (

          <div className="friend-grid">

            {requests.map((profile) => (

              <div className="friend-card" key={profile.id}>

                <img
                  src={avatar(profile)}
                  alt={profile.nickname}
                  className="friend-avatar"
                />

                <h3>
                  {profile.nickname || "Mitglied"}
                </h3>

                {roleLabel(profile)}

                <div className="friend-actions">

                  <button
                    className="friend-accept-btn"
                    onClick={() =>
                      acceptRequest(profile.request_id)
                    }
                  >
                    ✓ Annehmen
                  </button>

                  <button
                    className="friend-decline-btn"
                    onClick={() =>
                      declineRequest(profile.request_id)
                    }
                  >
                    Ablehnen
                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </section>

      {/* ================= BLOCKIERTE ================= */}

      <section className="friends-section blocked-section">

        <h2>
          🚫 Blockierte Nutzer
          <span className="friend-count">
            {blockedUsers.length}
          </span>
        </h2>

        {blockedUsers.length === 0 ? (

          <div className="empty-state">
            <p>Du hast keine Nutzer blockiert.</p>
          </div>

        ) : (

          <div className="friend-grid">

            {blockedUsers.map((profile) => (

              <div className="friend-card blocked-card" key={profile.id}>

                <img
                  src={avatar(profile)}
                  alt={profile.nickname}
                  className="friend-avatar"
                />

                <h3>
                  {profile.nickname || "Mitglied"}
                </h3>

                <button
                  className="friend-unblock-btn"
                  onClick={() =>
                    unblockUser(profile.block_id)
                  }
                >
                  🔓 Nutzer entblocken
                </button>

              </div>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}
