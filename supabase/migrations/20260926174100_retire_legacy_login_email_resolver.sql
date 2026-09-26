-- The current application signs in with an email address directly and no
-- longer calls resolve_login_email. Keeping this SECURITY DEFINER resolver
-- exposed would allow nickname-to-email enumeration.
revoke execute on function public.resolve_login_email(text)
from public, anon, authenticated;
