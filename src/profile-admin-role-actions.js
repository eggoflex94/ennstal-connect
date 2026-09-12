import { supabase } from './supabaseClient';

let roleActionBusy = false;

function profileTargetId() {
  return document.querySelector('.member-profile-page[data-profile-id]')?.dataset?.profileId || '';
}

async function currentRole() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.id) return { role: '', error: authError || new Error('Nicht eingeloggt.') };
  const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { role: String(data?.role || '').toUpperCase(), error };
}

async function handleRoleAction(button, action) {
  if (!supabase || roleActionBusy) return;
  const targetId = profileTargetId();
  const nextRole = String(action.split(':')[1] || '').toUpperCase();
  if (!targetId || !['MEMBER', 'SUPPORTER', 'ADMIN'].includes(nextRole)) {
    window.alert('Rollenänderung konnte nicht vorbereitet werden.');
    return;
  }

  roleActionBusy = true;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Rolle wird aktualisiert …';

  try {
    const actor = await currentRole();
    if (actor.error) throw actor.error;
    if (actor.role !== 'HEAD_ADMIN') throw new Error('Nur der Head Admin darf Rollen vergeben oder entfernen.');

    const { error } = await supabase.rpc('admin_set_role', {
      target_user: targetId,
      new_role: nextRole
    });
    if (error) throw error;

    window.alert(nextRole === 'ADMIN'
      ? 'Community Admin wurde erfolgreich vergeben.'
      : nextRole === 'MEMBER'
        ? 'Die Admin-/Supporter-Rolle wurde erfolgreich entfernt.'
        : 'Supporter-Rolle wurde erfolgreich vergeben.');
    window.location.reload();
  } catch (error) {
    console.error('Profilrolle konnte nicht aktualisiert werden:', error);
    window.alert(error?.message || 'Profilrolle konnte nicht aktualisiert werden.');
    button.disabled = false;
    button.textContent = original;
  } finally {
    roleActionBusy = false;
  }
}

function onRoleClick(event) {
  const button = event.target?.closest?.('.ec-profile-admin-overlay [data-admin-action^="role:"]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void handleRoleAction(button, button.dataset.adminAction || '');
}

document.addEventListener('click', onRoleClick, true);
