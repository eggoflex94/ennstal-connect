import { supabase } from './supabaseClient';

if (supabase && !supabase.__ecHeadAccessReliability) {
  const rpc = supabase.rpc.bind(supabase);

  supabase.rpc = async (fn, args = {}, options) => {
    if (fn !== 'ec_is_head_admin') return rpc(fn, args, options);

    const result = await rpc(fn, args, options);
    if (!result?.error && result?.data === true) return result;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.id) return result;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role,account_status')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileError && profile?.account_status === 'ACTIVE' && String(profile?.role || '').toUpperCase() === 'HEAD_ADMIN') {
        return { data: true, error: null };
      }
    } catch (error) {
      console.warn('Head-Admin-Zugriff konnte nicht zusätzlich geprüft werden:', error?.message || error);
    }

    return result;
  };

  Object.defineProperty(supabase, '__ecHeadAccessReliability', {
    value: true,
    enumerable: false,
    configurable: false,
  });
}
