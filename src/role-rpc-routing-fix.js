import { supabase } from './supabaseClient';

if (supabase && !supabase.__ecRoleRoutingFixed) {
  const rpc = supabase.rpc.bind(supabase);
  const routes = {
    admin_set_role: 'ec_role_set_direct',
    ec_set_regional_admin: 'ec_regional_admin_set_direct',
    ec_set_regional_moderator: 'ec_regional_moderator_set_direct',
    ec_set_global_admin: 'ec_global_admin_set_direct',
    ec_demote_global_to_regional_admin: 'ec_global_to_regional_set_direct',
    admin_set_forum_moderator: 'ec_forum_moderator_set_direct'
  };
  supabase.rpc = (fn, args = {}, options) => rpc(routes[fn] || fn, args, options);
  Object.defineProperty(supabase, '__ecRoleRoutingFixed', { value: true });
}
