import { supabase } from './supabaseClient';

// Compatibility helpers retained for tested admin-role validation.
// This module no longer mutates React-owned admin cards.
const MUNICIPALITY_STAR='/role-star-green.svg';
const MUNICIPALITY_ROLE_OPTION='<option value="MUNICIPALITY">Gemeinde</option>';
const MUNICIPALITY_FILTER=['municipality','Gemeinden'];

async function setBaseRole(member,role,status){
  const nextRole=String(role||'').trim().toUpperCase();
  if(!['MEMBER','SUPPORTER','ADMIN','MUNICIPALITY'].includes(nextRole))throw new Error('Bitte eine gültige Basisrolle auswählen.');
  const {error}=await supabase.rpc('admin_set_role',{target_user:member.id,new_role:nextRole});
  if(error)throw error;
  if(status)status.textContent='Basisrolle gespeichert.';
}

export { MUNICIPALITY_STAR, MUNICIPALITY_ROLE_OPTION, MUNICIPALITY_FILTER, setBaseRole };
