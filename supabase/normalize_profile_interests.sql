-- Keep profile interests human-readable even when older clients send a JSON array
-- into the legacy text column.
create or replace function public.ec_normalize_profile_interests()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parsed jsonb;
  normalized text;
begin
  if new.interests is null then
    return new;
  end if;

  new.interests := btrim(new.interests);

  if new.interests ~ '^\[.*\]$' then
    begin
      parsed := new.interests::jsonb;
      if jsonb_typeof(parsed) = 'array' then
        select string_agg(value, ', ' order by ord)
          into normalized
        from jsonb_array_elements_text(parsed) with ordinality as item(value, ord);
        new.interests := coalesce(normalized, '');
      end if;
    exception when others then
      null;
    end;
  end if;

  new.interests := nullif(btrim(new.interests), '');
  return new;
end;
$$;

revoke all on function public.ec_normalize_profile_interests() from public, anon, authenticated;

drop trigger if exists ec_profiles_normalize_interests on public.profiles;
create trigger ec_profiles_normalize_interests
before insert or update of interests on public.profiles
for each row
execute function public.ec_normalize_profile_interests();
