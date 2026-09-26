-- Allow the Head Admin self-points RPC to persist an intentionally empty reason.
-- The RPC itself still caps the reason at 500 chars, while non-head-admin point
-- adjustments continue to require a sufficiently descriptive reason.

alter table public.point_transactions
  drop constraint if exists point_transactions_reason_check;

alter table public.point_transactions
  add constraint point_transactions_reason_check
  check (
    char_length(btrim(reason)) = 0
    or char_length(btrim(reason)) >= 3
  );
