-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- Change the default for future functions created by postgres in the exposed
-- public schema so every RPC must be granted explicitly.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
