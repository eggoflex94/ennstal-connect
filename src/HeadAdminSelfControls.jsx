import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export default function HeadAdminSelfControls({ profile, user, regions = [], onChanged, showNotice }) {
  const [assignments, setAssignments] = useState([]);
  const [regionId, setRegionId] = useState("");
  const [pointDelta, setPointDelta] = useState("");
  const [pointReason, setPointReason] = useState("");
  const [busy, setBusy] = useState(false);

  const isHeadAdmin = String(profile?.role || "").toUpperCase() === "HEAD_ADMIN";
  const activeRegions = useMemo(() => regions.filter((region) => region?.id), [regions]);
  const globalEnabled = assignments.some((item) => item.scope === "GLOBAL" && item.active !== false);
  const regionalIds = useMemo(
    () => new Set(assignments.filter((item) => item.scope === "REGIONAL" && item.active !== false).map((item) => item.region_id)),
    [assignments]
  );

  useEffect(() => {
    if (!isHeadAdmin || !user?.id) return;
    let cancelled = false;
    supabase
      .from("community_photographer_assignments")
      .select("id,scope,region_id,active")
      .eq("user_id", user.id)
      .eq("active", true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) showNotice?.(error.message);
        setAssignments(data || []);
      });
    return () => { cancelled = true; };
  }, [isHeadAdmin, user?.id]);

  useEffect(() => {
    if (!regionId && activeRegions.length) {
      setRegionId(profile?.home_region_id && activeRegions.some((region) => region.id === profile.home_region_id)
        ? profile.home_region_id
        : activeRegions[0].id);
    }
  }, [regionId, activeRegions, profile?.home_region_id]);

  if (!isHeadAdmin || !user?.id || profile?.id !== user.id) return null;

  const reloadAssignments = async () => {
    const { data, error } = await supabase
      .from("community_photographer_assignments")
      .select("id,scope,region_id,active")
      .eq("user_id", user.id)
      .eq("active", true);
    if (error) throw error;
    setAssignments(data || []);
  };

  const toggleGlobal = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_community_photographer_assignment", {
        p_target_user: user.id,
        p_scope: "GLOBAL",
        p_region_id: null,
        p_enabled: !globalEnabled
      });
      if (error) throw error;
      await reloadAssignments();
      await onChanged?.();
      showNotice?.(!globalEnabled ? "Community-Fotograf wurde für alle Regionen aktiviert." : "Globale Fotografenfreigabe wurde entfernt.");
    } catch (error) {
      showNotice?.(error?.message || "Fotografenstatus konnte nicht geändert werden.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRegional = async () => {
    if (busy || !regionId) return;
    const enabled = !regionalIds.has(regionId);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_community_photographer_assignment", {
        p_target_user: user.id,
        p_scope: "REGIONAL",
        p_region_id: regionId,
        p_enabled: enabled
      });
      if (error) throw error;
      await reloadAssignments();
      await onChanged?.();
      const regionName = activeRegions.find((region) => region.id === regionId)?.name || "Region";
      showNotice?.(enabled ? `Community-Fotograf für ${regionName} aktiviert.` : `Fotografenfreigabe für ${regionName} entfernt.`);
    } catch (error) {
      showNotice?.(error?.message || "Regionale Fotografenfreigabe konnte nicht geändert werden.");
    } finally {
      setBusy(false);
    }
  };

  const adjustOwnPoints = async (event) => {
    event.preventDefault();
    if (busy) return;
    const delta = Number(pointDelta);
    const reason = pointReason.trim();
    if (!Number.isInteger(delta) || delta === 0) {
      return showNotice?.("Bitte eine ganze Punktezahl ungleich 0 eingeben.");
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("head_admin_adjust_own_points", {
        p_delta: delta,
        p_reason: reason
      });
      if (error) throw error;
      setPointDelta("");
      setPointReason("");
      await onChanged?.();
      const score = Number(data?.score ?? 0);
      showNotice?.(`Eigene Punkte wurden um ${delta > 0 ? "+" : ""}${delta} geändert. Gesamt-Score: ${score}.`);
    } catch (error) {
      showNotice?.(error?.message || "Eigene Punkte konnten nicht geändert werden.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="head-admin-self-controls panel">
    <header>
      <span className="eyebrow">NUR HEAD ADMIN</span>
      <h2>Eigene Zusatzfunktionen</h2>
      <p>Community-Fotografenstatus und eigene manuelle Punkte verwalten. Alle Änderungen werden protokolliert.</p>
    </header>

    <div className="head-admin-self-grid">
      <section>
        <div className="head-admin-self-title">
          <img src="/community-photographer-camera.svg" alt=""/>
          <div><strong>Community-Fotograf</strong><small>Global oder regional für dein eigenes Konto</small></div>
        </div>
        <div className="head-admin-self-actions">
          <button type="button" className={globalEnabled ? "secondary-button is-active" : "secondary-button"} disabled={busy} onClick={() => void toggleGlobal()}>
            {globalEnabled ? "✓ Global aktiv · entfernen" : "Global für alle Regionen vergeben"}
          </button>
          <label>
            <span>Region</span>
            <select value={regionId} onChange={(event) => setRegionId(event.target.value)} disabled={busy}>
              {activeRegions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
          </label>
          <button type="button" className={regionalIds.has(regionId) ? "secondary-button is-active" : "secondary-button"} disabled={busy || !regionId} onClick={() => void toggleRegional()}>
            {regionalIds.has(regionId) ? "✓ Regional aktiv · entfernen" : "Für ausgewählte Region vergeben"}
          </button>
        </div>
      </section>

      <section>
        <div className="head-admin-self-title">
          <span className="head-admin-self-points-icon" aria-hidden="true">★</span>
          <div><strong>Eigene Punkte</strong><small>Manuelle Plus- oder Minuspunkte · ohne Punkteobergrenze · Begründung optional</small></div>
        </div>
        <form className="head-admin-self-points-form" onSubmit={adjustOwnPoints}>
          <label>
            <span>Punkteänderung</span>
            <input type="number" step="1" value={pointDelta} onChange={(event) => setPointDelta(event.target.value)} placeholder="+250 oder -150" disabled={busy}/>
          </label>
          <label className="head-admin-self-reason">
            <span>Begründung (optional)</span>
            <input maxLength="500" value={pointReason} onChange={(event) => setPointReason(event.target.value)} placeholder="Optionaler Grund" disabled={busy}/>
          </label>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Wird gespeichert …" : "Punkte buchen"}</button>
        </form>
      </section>
    </div>
  </section>;
}
