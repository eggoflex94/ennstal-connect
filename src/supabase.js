import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
let supabaseConfigError = "";

if (!supabaseUrl || !supabaseAnonKey) {
  supabaseConfigError =
    "Supabase ist noch nicht eingerichtet. Bitte überprüfe die Umgebungsvariablen.";
} else {
  supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
  );
}

export {
  supabase,
  supabaseConfigError
};
