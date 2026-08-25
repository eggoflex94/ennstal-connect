import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("Supabase URL geladen:", supabaseUrl);

if (!supabaseUrl) {
  throw new Error(
    "VITE_SUPABASE_URL wurde nicht geladen."
  );
}

if (!supabaseUrl.startsWith("https://")) {
  throw new Error(
    `VITE_SUPABASE_URL ist ungültig: ${supabaseUrl}`
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_ANON_KEY wurde nicht geladen."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
