-- Use the verified Discord username/tag instead of the global display name.
begin;
create or replace function private.hive_discord_tag(p_identity jsonb)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(
    nullif(p_identity->>'name',''),
    nullif(p_identity->>'full_name',''),
    nullif(p_identity->>'preferred_username','')
  ), '#0$', '');
$$;
revoke all on function private.hive_discord_tag(jsonb) from public, anon, authenticated;

create or replace function private.hive_discord_name()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_name text;
begin
  select left(coalesce(private.hive_discord_tag(i.identity_data), i.provider_id),80)
    into v_name from auth.identities i where i.user_id = auth.uid() and i.provider = 'discord' limit 1;
  if auth.uid() is null or v_name is null then
    raise exception 'Bitte melde dich mit Discord an.' using errcode = '42501';
  end if;
  return v_name;
end;
$$;
revoke all on function private.hive_discord_name() from public, anon, authenticated;

-- Refresh only linked Discord contacts; preserve all other registration fields.
update public.registrations r
set discord_name = left(private.hive_discord_tag(i.identity_data),80)
from auth.identities i
where i.user_id = r.user_id and i.provider = 'discord'
  and private.hive_discord_tag(i.identity_data) is not null
  and r.discord_name is distinct from left(private.hive_discord_tag(i.identity_data),80);
commit;
