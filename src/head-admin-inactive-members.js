import { supabase } from './supabaseClient';

const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
let overlay;

function close() { overlay?.remove(); overlay = null; }
async function load() {
  const list = overlay?.querySelector('[data-inactive-list]');
  if (!list) return;
  list.textContent = 'Mitglieder werden geladen…';
  const { data, error } = await supabase.rpc('head_admin_inactive_members');
  if (!overlay || !list.isConnected) return;
  if (error) { list.textContent = 'Laden fehlgeschlagen: ' + error.message; return; }
  list.replaceChildren();
  const rows = data || [];
  overlay.querySelector('[data-inactive-count]').textContent = rows.length + ' Mitglieder';
  if (!rows.length) { list.textContent = 'Keine Mitglieder seit mehr als 30 Tagen inaktiv.'; return; }
  rows.forEach((member) => {
    const article = document.createElement('article');
    article.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 2px;border-bottom:1px solid #374151;flex-wrap:wrap';
    const name = document.createElement('div');
    name.innerHTML = '<strong>' + escapeHtml(member.nickname || 'Mitglied') + '</strong><div style="font-size:13px;color:#aeb8c8">' + escapeHtml(member.inactive_days) + ' Tage inaktiv · Zuletzt: ' + escapeHtml(member.last_active_at ? new Date(member.last_active_at).toLocaleDateString('de-AT') : 'unbekannt') + '</div>';
    const button = document.createElement('button');
    button.textContent = 'Sperren';
    button.type = 'button';
    button.style.cssText = 'background:#b42336;color:#fff;border:0;border-radius:8px;padding:9px 14px;cursor:pointer';
    button.onclick = async () => {
      if (!window.confirm('Mitglied „' + (member.nickname || 'Mitglied') + '“ wegen mehr als 30 Tagen Inaktivität wirklich sperren?')) return;
      button.disabled = true;
      button.textContent = 'Wird gesperrt…';
      const { error: blockError } = await supabase.rpc('head_admin_suspend_inactive_member', { target_user: member.id });
      if (blockError) { window.alert('Sperren fehlgeschlagen: ' + blockError.message); button.disabled = false; button.textContent = 'Sperren'; return; }
      await load();
    };
    article.append(name, button);
    list.append(article);
  });
}

export async function openInactiveMembers() {
  if (!supabase) return;
  close();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return;
  const { data: me } = await supabase.from('profiles').select('role,account_status').eq('id',user.id).maybeSingle();
  if (me?.role !== 'HEAD_ADMIN' || me.account_status !== 'ACTIVE') return;
  overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = '<section role="dialog" aria-modal="true" aria-label="Inaktive Mitglieder" style="background:#171d29;color:#f8fafc;width:min(680px,100%);max-height:85vh;overflow:auto;border-radius:16px;padding:24px;box-shadow:0 16px 70px #0009"><header style="display:flex;justify-content:space-between;gap:16px;align-items:start"><div><h2 style="margin:0 0 6px">Inaktive Mitglieder</h2><p style="color:#b7c2d4;margin:0">Mehr als 30 Tage ohne Aktivität · <span data-inactive-count>…</span></p></div><button type="button" data-inactive-close aria-label="Schließen" style="background:#354052;border:0;border-radius:8px;color:white;padding:8px 12px;cursor:pointer">✕</button></header><div data-inactive-list style="margin-top:20px"></div><footer style="margin-top:16px;font-size:12px;color:#aeb8c8">Sperren erfolgen einzeln mit Bestätigung und werden über die vorhandene Admin-Sperrfunktion protokolliert.</footer></section>';
  overlay.querySelector('[data-inactive-close]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  void load();
}
window.addEventListener('ec:open-inactive-members', () => void openInactiveMembers());
