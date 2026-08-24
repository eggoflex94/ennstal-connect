import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eqfvhigyrofjscvimvrc.supabase.co";

const supabaseAnonKey = "sb_publishable_Z0no3Kon-_LxYhEsDdwlrA_u5wU_lIs";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);
