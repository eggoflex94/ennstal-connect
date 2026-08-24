import { createClient } from "@supabase/supabase-js";

const url = "https://eqfvhgiyrofjscvimvrc.supabase.co";

const key = "sb_publishable_Z0no3Kon-_LxYhEsDdwlrA_u5wU_lIs";

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
