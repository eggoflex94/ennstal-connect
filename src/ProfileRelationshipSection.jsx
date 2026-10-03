import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileRelationshipSection.css";

const STATUS_OPTIONS = [
  ["SINGLE","Single"],
  ["RELATIONSHIP","In einer Beziehung"],
  ["ENGAGED","Verlobt"],
  ["MARRIED","Verheiratet"],
  ["OPEN_RELATIONSHIP","In einer offenen Beziehung"],
  ["COMPLICATED","Es ist kompliziert"],
  ["SEPARATED","Getrennt lebend"],
  ["DIVORCED","Geschieden"],
  ["WIDOWED","Verwitwet"],
];

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);
const PARTNER_STATUSES = new Set(["RELATIONSHIP","ENGAGED","MARRIED","OPEN_RELATIONSHIP","COMPLICATED"]);

const personName = (person) => person?.nickname || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Mitglied";

export default function ProfileRelationshipSection({ member, currentUserId }) {
  const mine = member?.id === currentUserId;
  const [rows, setRows] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [members, setMembers] = useState([]);
  const [relatedPeople, setRelatedPeople] = useState([]);
  const [statusType, setStatusType] = useState("RELATIONSHIP");
  const [partnerUserId, setPartnerUserId] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const needsPartner = PARTNER_STATUSES.has(statusType);

  async function load() {
    if (!supabase || !member?.id) return;
    const relationshipQuery = supabase
      .from("profile_relationships")
      .select("id,owner_id,status_type,partner_user_id,partner_name,confirmation_status,created_at,updated_at")
      .eq("owner_id", member.id)
      .order("created_at", { ascending: true });

    const confirmedForPartnerQuery = supabase
      .from("profile_relationships")
      .select("id,owner_id,status_type,partner_user_id,partner_name,confirmation_status,created_at,updated_at")
      .eq("partner_user_id", member.id)
      .eq("confirmation_status", "ACCEPTED")
      .order("created_at", { ascending: true });

    const tasks = [relationshipQuery, confirmedForPartnerQuery];
    if (mine) {
      tasks.push(
        supabase
          .from("profile_relationships")
          .select("id,owner_id,status_type,partner_user_id,partner_name,confirmation_status,created_at,updated_at")
          .eq("partner_user_id", currentUserId)
          .eq("confirmation_status", "PENDING")
          .order("created_at", { ascending: false })
      );
      tasks.push(
        supabase
          .from("profiles")
          .select("id,nickname,first_name,last_name,avatar_url")
          .eq("account_status", "ACTIVE")
          .neq("id", currentUserId)
          .order("nickname")
          .limit(500)
      );
    }

    const result = await Promise.all(tasks);
    const ownResult = result[0];
    const confirmedPartnerResult = result[1];
    const ownRows = ownResult.error ? [] : (ownResult.data || []);
    const confirmedPartnerRows = confirmedPartnerResult.error ? [] : (confirmedPartnerResult.data || []);
    setRows([
      ...ownRows.map((row) => ({ ...row, perspective: "OWNER" })),
      ...confirmedPartnerRows.map((row) => ({ ...row, perspective: "PARTNER" })),
    ]);

    let pendingRows = [];
    if (mine) {
      pendingRows = result[2]?.error ? [] : (result[2]?.data || []);
      setIncoming(pendingRows);
      if (!result[3]?.error) setMembers(result[3]?.data || []);
    }

    const ids = [...new Set([
      ...ownRows.map((row) => row.partner_user_id),
      ...confirmedPartnerRows.map((row) => row.owner_id),
      ...pendingRows.map((row) => row.owner_id),
    ].filter(Boolean))];
    if (ids.length) {
      const { data: people, error: peopleError } = await supabase
        .from("profiles")
        .select("id,nickname,first_name,last_name,avatar_url")
        .in("id", ids);
      if (!peopleError) setRelatedPeople(people || []);
    } else {
      setRelatedPeople([]);
    }
  }

  useEffect(() => {
    void load();
  }, [member?.id, currentUserId]);

  const peopleById = useMemo(() => new Map([...members, ...relatedPeople].map((person) => [person.id, person])), [members, relatedPeople]);

  async function addRelationship(event) {
    event.preventDefault();
    if (!mine || saving) return;
    const externalName = partnerName.trim();
    if (needsPartner && !partnerUserId && externalName.length < 2) {
      setNotice("Bitte verlinke ein Ennstal-Connect-Mitglied oder gib den Namen der Person ein.");
      return;
    }
    setSaving(true);
    const payload = {
      owner_id: currentUserId,
      status_type: statusType,
      partner_user_id: needsPartner && partnerUserId ? partnerUserId : null,
      partner_name: needsPartner && !partnerUserId ? externalName || null : null,
      confirmation_status: needsPartner && partnerUserId ? "PENDING" : "NOT_REQUIRED",
    };
    const { error } = await supabase.from("profile_relationships").insert(payload);
    if (error) setNotice(error.message);
    else {
      setNotice(partnerUserId ? "Beziehungsstatus gespeichert. Die verlinkte Person muss die Verknüpfung zuerst bestätigen." : "Beziehungsstatus gespeichert.");
      setPartnerUserId("");
      setPartnerName("");
      await load();
    }
    setSaving(false);
  }

  async function removeRelationship(id) {
    if (!mine) return;
    const { error } = await supabase.from("profile_relationships").delete().eq("id", id).eq("owner_id", currentUserId);
    if (error) setNotice(error.message);
    else {
      setNotice("Eintrag entfernt.");
      await load();
    }
  }

  async function respond(id, accept) {
    const { error } = await supabase.rpc("respond_profile_relationship", {
      p_relationship_id: id,
      p_accept: Boolean(accept),
    });
    if (error) setNotice(error.message);
    else {
      setNotice(accept ? "Verknüpfung bestätigt." : "Verknüpfung abgelehnt.");
      await load();
    }
  }

  const visibleRows = rows.filter((row) => mine || row.confirmation_status === "ACCEPTED" || row.confirmation_status === "NOT_REQUIRED");

  return <section className="profile-relationship-section">
    <div className="profile-relationship-heading">
      <span>BEZIEHUNGSSTATUS</span>
      <h2>Beziehung & Verknüpfungen</h2>
      <p>Mehrere Angaben sind möglich. Verlinkte Ennstal-Connect-Mitglieder werden erst nach deren Bestätigung öffentlich angezeigt.</p>
    </div>

    {notice && <div className="profile-relationship-notice">{notice}</div>}

    {visibleRows.length > 0 ? <div className="profile-relationship-list">
      {visibleRows.map((row) => {
        const linkedUserId = row.perspective === "PARTNER" ? row.owner_id : row.partner_user_id;
        const linked = peopleById.get(linkedUserId);
        const pending = row.confirmation_status === "PENDING";
        const rejected = row.confirmation_status === "REJECTED";
        return <article className="profile-relationship-card" key={row.id}>
          <div>
            <strong>{STATUS_LABELS[row.status_type] || row.status_type}</strong>
            {linkedUserId && row.confirmation_status === "ACCEPTED" && <button type="button" className="profile-relationship-person" onClick={() => window.dispatchEvent(new CustomEvent("ec:open-profile", { detail: { profileId: linkedUserId } }))}>
              mit {personName(linked)}
            </button>}
            {!row.partner_user_id && row.partner_name && <span>mit {row.partner_name}</span>}
            {mine && pending && <small>Bestätigung der verlinkten Person ausstehend</small>}
            {mine && rejected && <small>Verknüpfung wurde abgelehnt</small>}
          </div>
          {mine && row.perspective === "OWNER" && <button type="button" className="profile-relationship-remove" onClick={() => removeRelationship(row.id)}>Entfernen</button>}
        </article>;
      })}
    </div> : <p className="profile-relationship-empty">Noch kein Beziehungsstatus angegeben.</p>}

    {mine && incoming.length > 0 && <div className="profile-relationship-requests">
      <h3>Offene Bestätigungen</h3>
      {incoming.map((row) => <article key={row.id}>
        <div>
          <strong>{STATUS_LABELS[row.status_type] || row.status_type}</strong>
          <span>{personName(peopleById.get(row.owner_id))} möchte dich in diesem Beziehungsstatus verlinken.</span>
        </div>
        <div className="profile-relationship-request-actions">
          <button type="button" onClick={() => respond(row.id, true)}>✓ Bestätigen</button>
          <button type="button" onClick={() => respond(row.id, false)}>Ablehnen</button>
        </div>
      </article>)}
    </div>}

    {mine && <form className="profile-relationship-form" onSubmit={addRelationship}>
      <label>Status
        <select value={statusType} onChange={(event) => {
          setStatusType(event.target.value);
          setPartnerUserId("");
          setPartnerName("");
        }}>
          {STATUS_OPTIONS.map(([value,label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>

      {needsPartner && <>
        <label>Person auf Ennstal Connect verlinken
          <select value={partnerUserId} onChange={(event) => {
            setPartnerUserId(event.target.value);
            if (event.target.value) setPartnerName("");
          }}>
            <option value="">Keine Verknüpfung auswählen</option>
            {members.map((person) => <option value={person.id} key={person.id}>{personName(person)}</option>)}
          </select>
          <small>Bei einer Verknüpfung muss die andere Person zuerst bestätigen.</small>
        </label>
        <label>Oder Name außerhalb von Ennstal Connect
          <input value={partnerName} onChange={(event) => {
            setPartnerName(event.target.value);
            if (event.target.value) setPartnerUserId("");
          }} placeholder="Name der Person" />
        </label>
      </>}

      <button className="profile-primary-button" type="submit" disabled={saving}>{saving ? "Wird gespeichert …" : "Beziehungsstatus hinzufügen"}</button>
    </form>}
  </section>;
}
