export const APPROVAL_FIELDS = { first_name: 'Vorname', last_name: 'Nachname', birth_date: 'Geburtsdatum' };
export const APPROVAL_LABELS = { PENDING: 'Prüfung offen', CHANGES_REQUIRED: 'Korrekturen erforderlich', APPROVED: 'Freigegeben', LEGACY_ACTIVE: 'Bestandskonto · noch nicht manuell geprüft' };
export function validRealName(value) { return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80 && /^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u.test(value.trim()); }
export function correctionPayload(record, values) {
  const changes = {};
  for (const field of record.required_fields || []) {
    if (!Object.hasOwn(APPROVAL_FIELDS, field)) throw new Error('Unbekannte Auflage. Bitte neu laden.');
    const value = String(values[field] || '').trim().normalize('NFC');
    if (!value) throw new Error(`Bitte ${APPROVAL_FIELDS[field]} ausfüllen.`);
    if (field !== 'birth_date' && !validRealName(value)) throw new Error('Bitte vollständige Namen ohne Zahlen angeben.');
    if (field === 'birth_date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value))) throw new Error('Bitte ein gültiges Geburtsdatum angeben.');
    changes[field] = value;
  }
  return changes;
}
