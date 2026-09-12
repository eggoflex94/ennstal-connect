// Legacy dock stabilizer disabled.
// The regional shell owns the dock structure, admin-central-hub owns the shared
// Admin-Zentrale, and profile-admin-fast-entry owns profile-level Admin Tools.
// Keeping a second polling owner here caused buttons to disappear/reappear and
// added unnecessary Supabase/DOM work.
export {};
