-- Correct the system notice without changing registration or account access.
do $change$
declare definition text;
begin
  select pg_get_functiondef('public.ec_handle_new_user()'::regprocedure) into definition;
  definition:=replace(definition,
    ' hat sofort ein Profil erhalten. Bitte das Profil auf Echtheit prüfen.',
    ' wartet auf die Account-Freigabe. Der Hauptadmin kann unter Admin-Zentrale → Accounts freigeben die Angaben prüfen, den Account freigeben oder Auflagen senden.');
  execute definition;
end;
$change$;

-- Update only exact recent automatic signup messages for pending accounts.
update public.messages m
set content='Neue Registrierung: '||p.nickname||' wartet auf die Account-Freigabe. Der Hauptadmin kann unter Admin-Zentrale → Accounts freigeben die Angaben prüfen, den Account freigeben oder Auflagen senden.'
from public.profiles p,public.profiles receiver,public.account_approvals a
where m.sender_id=p.id and m.receiver_id=receiver.id and a.user_id=p.id and a.status='PENDING'
  and receiver.role::text in ('HEAD_ADMIN','ADMIN')
  and p.created_at>now()-interval '24 hours'
  and m.created_at between p.created_at-interval '1 minute' and p.created_at+interval '2 minutes'
  and m.content='Neue Registrierung: '||p.nickname||' hat sofort ein Profil erhalten. Bitte das Profil auf Echtheit prüfen.';
