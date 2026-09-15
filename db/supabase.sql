-- HIVE comeback: run once in the Supabase SQL Editor of a fresh project.
-- The public anon key is used by the GitHub Pages frontend. Never expose the service_role key.

create extension if not exists pgcrypto with schema extensions;

-- Horde matrix: Blizzard BlizzCon 2026, checked 2026-09-14.
create or replace function public.hive_race_class_allowed(p_race text, p_class text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case
    when p_class = 'Not sure yet' then p_race in ('Orc','Troll','Tauren','Undead','Skyborne','Not sure yet')
    when p_race = 'Not sure yet' then p_class in ('Warrior','Hunter','Rogue','Druid','Shaman','Mage','Warlock','Priest','Paladin')
    when p_race = 'Orc' then p_class in ('Warrior','Hunter','Rogue','Shaman','Mage','Warlock')
    when p_race = 'Troll' then p_class in ('Warrior','Hunter','Rogue','Priest','Shaman','Mage','Warlock')
    when p_race = 'Tauren' then p_class in ('Warrior','Hunter','Shaman','Druid')
    when p_race = 'Undead' then p_class in ('Warrior','Paladin','Rogue','Priest','Mage','Warlock')
    when p_race = 'Skyborne' then p_class in ('Warrior','Hunter','Rogue','Shaman','Druid')
    else false
  end, false);
$$;

revoke all on function public.hive_race_class_allowed(text, text) from public;
grant execute on function public.hive_race_class_allowed(text, text) to anon, authenticated;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  edit_token_hash text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  knows_us text not null default '' check (char_length(knows_us) <= 200),
  race text not null check (char_length(race) between 1 and 80),
  class_name text not null check (char_length(class_name) between 1 and 80),
  spec text not null check (char_length(spec) between 1 and 80),
  role text not null check (role in ('Tank', 'Healer', 'Melee DPS', 'Ranged DPS', 'Flexible')),
  days text[] not null check (cardinality(days) between 1 and 7),
  max_raid_days integer not null check (max_raid_days between 1 and 4),
  earliest_start text not null check (earliest_start in ('18:30', '19:00', '19:30', '20:00')),
  latest_end text not null check (latest_end in ('22:00', '22:30', '23:00')),
  raid_vision text not null check (char_length(raid_vision) between 1 and 1000),
  discord_name text not null check (char_length(discord_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_race_class_check check (public.hive_race_class_allowed(race, class_name))
);

create index if not exists registrations_role_class_idx on public.registrations (role, class_name);
create index if not exists registrations_created_at_idx on public.registrations (created_at desc);

create table if not exists public.hive_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.registrations enable row level security;
alter table public.hive_admins enable row level security;
revoke all on public.registrations from anon, authenticated;
revoke all on public.hive_admins from anon, authenticated;
grant select, update, delete on public.registrations to authenticated;

create or replace function public.hive_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hive_admins a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function public.hive_is_admin() from public;
grant execute on function public.hive_is_admin() to authenticated;

drop policy if exists hive_admin_select on public.registrations;
create policy hive_admin_select on public.registrations
  for select to authenticated using (public.hive_is_admin());

drop policy if exists hive_admin_update on public.registrations;
create policy hive_admin_update on public.registrations
  for update to authenticated using (public.hive_is_admin()) with check (public.hive_is_admin());

drop policy if exists hive_admin_delete on public.registrations;
create policy hive_admin_delete on public.registrations
  for delete to authenticated using (public.hive_is_admin());

create or replace function public.hive_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hive_registrations_updated_at on public.registrations;
create trigger hive_registrations_updated_at
  before update on public.registrations
  for each row execute function public.hive_set_updated_at();

-- Mirrors dist/raid-roles.js. A picked spec wins; without a spec a class whose specs all cover the
-- same role is still unambiguous (Mage/Warlock -> Ranged DPS, Rogue -> Melee DPS); everything else
-- stays Flexible. There is deliberately no manual role stored in this project, so the stored value
-- is always replaceable by the derived one.
create or replace function public.hive_role_for_spec(p_class text, p_spec text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_class = 'Warrior' and p_spec in ('Arms','Fury') then 'Melee DPS'
    when p_class = 'Warrior' and p_spec = 'Protection' then 'Tank'
    when p_class = 'Hunter' and p_spec in ('Beast Mastery','Marksmanship') then 'Ranged DPS'
    when p_class = 'Hunter' and p_spec = 'Survival' then 'Melee DPS'
    when p_class = 'Rogue' then 'Melee DPS'
    when p_class = 'Druid' and p_spec = 'Balance' then 'Ranged DPS'
    when p_class = 'Druid' and p_spec = 'Feral (Bear)' then 'Tank'
    when p_class = 'Druid' and p_spec = 'Feral (Cat)' then 'Melee DPS'
    when p_class = 'Druid' and p_spec = 'Restoration' then 'Healer'
    when p_class = 'Shaman' and p_spec = 'Elemental' then 'Ranged DPS'
    when p_class = 'Shaman' and p_spec = 'Enhancement' then 'Melee DPS'
    when p_class = 'Shaman' and p_spec = 'Restoration' then 'Healer'
    when p_class = 'Mage' then 'Ranged DPS'
    when p_class = 'Warlock' then 'Ranged DPS'
    when p_class = 'Priest' and p_spec in ('Discipline','Holy') then 'Healer'
    when p_class = 'Priest' and p_spec = 'Shadow' then 'Ranged DPS'
    when p_class = 'Paladin' and p_spec = 'Holy' then 'Healer'
    when p_class = 'Paladin' and p_spec = 'Protection' then 'Tank'
    when p_class = 'Paladin' and p_spec = 'Retribution' then 'Melee DPS'
    else 'Flexible'
  end;
$$;

revoke all on function public.hive_role_for_spec(text, text) from public;

create or replace function public.hive_assert_entry(p_entry jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_days text[];
  v_max_days integer;
begin
  if jsonb_typeof(p_entry) <> 'object' then
    raise exception 'Ungültige Anmeldung.';
  end if;
  if char_length(trim(coalesce(p_entry->>'name', ''))) not between 1 and 80
    or char_length(trim(coalesce(p_entry->>'knows_us', ''))) > 200
    or char_length(trim(coalesce(p_entry->>'race', ''))) not between 1 and 80
    or char_length(trim(coalesce(p_entry->>'class_name', ''))) not between 1 and 80
    or char_length(trim(coalesce(p_entry->>'spec', ''))) not between 1 and 80
    or char_length(trim(coalesce(p_entry->>'raid_vision', ''))) not between 1 and 1000
    or char_length(trim(coalesce(p_entry->>'discord_name', ''))) not between 1 and 80 then
    raise exception 'Bitte prüfe die Pflichtfelder und Textlängen.';
  end if;
  if (p_entry->>'race') not in ('Orc', 'Troll', 'Tauren', 'Undead', 'Skyborne', 'Not sure yet') then
    raise exception 'Bitte wähle eine gültige Rasse.';
  end if;
  if public.hive_role_for_spec(p_entry->>'class_name', p_entry->>'spec') is null then
    raise exception 'Bitte wähle eine gültige Klasse und Spec.';
  end if;
  if jsonb_typeof(p_entry->'days') <> 'array' then
    raise exception 'Bitte wähle mindestens einen Raidtag.';
  end if;
  v_days := array(select jsonb_array_elements_text(p_entry->'days'));
  if cardinality(v_days) not between 1 and 7
    or not (v_days <@ array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[])
    or cardinality(v_days) <> cardinality(array(select distinct unnest(v_days))) then
    raise exception 'Bitte wähle gültige Raidtage.';
  end if;
  begin
    v_max_days := (p_entry->>'max_raid_days')::integer;
  exception when others then
    raise exception 'Bitte wähle die maximale Zahl der Raidtage.';
  end;
  if v_max_days not between 1 and 4 then
    raise exception 'Die Zahl der Raidtage muss zwischen 1 und 4 liegen.';
  end if;
  if not coalesce((p_entry->>'earliest_start') in ('18:30', '19:00', '19:30', '20:00'), false) then
    raise exception 'Bitte wähle eine gültige früheste Startzeit.';
  end if;
  if not coalesce((p_entry->>'latest_end') in ('22:00', '22:30', '23:00'), false) then
    raise exception 'Bitte wähle eine gültige späteste Endzeit.';
  end if;
end;
$$;

revoke all on function public.hive_assert_entry(jsonb) from public;

-- Only the registration RPC writes to this private rate-limit table. The gateway
-- normally supplies cf-connecting-ip; the rightmost forwarded IP is a fallback.
-- A project-wide ceiling still applies if an IP header is absent or untrusted.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- The HMAC key is generated inside Supabase, never committed with this SQL file.
create table if not exists private.hive_rate_secret (
  id integer primary key check (id = 1),
  secret bytea not null
);
alter table private.hive_rate_secret enable row level security;
revoke all on private.hive_rate_secret from public, anon, authenticated;
insert into private.hive_rate_secret (id, secret)
values (1, extensions.gen_random_bytes(32))
on conflict (id) do nothing;

create table if not exists private.hive_registration_rate_limits (
  ip_digest bytea,
  request_at timestamptz not null default now()
);
alter table private.hive_registration_rate_limits enable row level security;
revoke all on private.hive_registration_rate_limits from public, anon, authenticated;
create index if not exists hive_registration_rate_limits_time_idx
  on private.hive_registration_rate_limits (request_at desc);
create index if not exists hive_registration_rate_limits_ip_time_idx
  on private.hive_registration_rate_limits (ip_digest, request_at desc);

create or replace function private.hive_check_registration_rate()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip inet;
  v_ip_text text;
  v_secret bytea;
  v_ip_digest bytea;
  v_global_count integer;
  v_ip_count integer;
begin
  -- Supabase's managed edge supplies cf-connecting-ip. Ignore a caller's own
  -- first X-Forwarded-For value, which they could prepend themselves.
  v_ip_text := nullif(trim(v_headers->>'cf-connecting-ip'), '');
  if v_ip_text is null then
    v_ip_text := nullif(trim(regexp_replace(coalesce(v_headers->>'x-forwarded-for', ''), '^.*,', '')), '');
  end if;
  begin
    v_ip := v_ip_text::inet;
  exception when invalid_text_representation then
    v_ip := null;
  end;
  select secret into strict v_secret from private.hive_rate_secret where id = 1;
  if v_ip is not null then
    v_ip_digest := extensions.hmac(pg_catalog.convert_to(pg_catalog.host(v_ip), 'UTF8'), v_secret, 'sha256');
  end if;

  -- Serialize creates so concurrent requests cannot pass the count together.
  perform pg_catalog.pg_advisory_xact_lock(260914, 42);
  delete from private.hive_registration_rate_limits
    where request_at < now() - interval '1 day';

  select count(*) into v_global_count
  from private.hive_registration_rate_limits
  where request_at >= now() - interval '10 minutes';
  if v_global_count >= 50 then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object('code', 'HIVE_RATE_LIMIT', 'message', 'Gerade kommen sehr viele Anmeldungen rein. Bitte versuche es in ein paar Minuten erneut.')::text,
      detail = jsonb_build_object('status', 429)::text;
  end if;

  select count(*) into v_ip_count
  from private.hive_registration_rate_limits
  where request_at >= now() - interval '10 minutes'
    and ip_digest is not distinct from v_ip_digest;
  if (v_ip is null and v_ip_count >= 15)
     or (v_ip is not null and v_ip_count >= 8) then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object('code', 'HIVE_RATE_LIMIT', 'message', 'Von deiner Verbindung gab es gerade viele Anmeldungen. Bitte versuche es in ein paar Minuten erneut.')::text,
      detail = jsonb_build_object('status', 429)::text;
  end if;

  insert into private.hive_registration_rate_limits (ip_digest) values (v_ip_digest);
end;
$$;

revoke all on function private.hive_check_registration_rate() from public, anon, authenticated;

create or replace function public.hive_create_registration(p_entry jsonb, p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Ungültiger Bearbeitungsschlüssel.';
  end if;
  perform public.hive_assert_entry(p_entry);
  perform private.hive_check_registration_rate();
  insert into public.registrations (
    edit_token_hash, name, knows_us, race, class_name, spec, role, days,
    max_raid_days, earliest_start, latest_end, raid_vision, discord_name
  ) values (
    encode(extensions.digest(p_token, 'sha256'), 'hex'),
    trim(p_entry->>'name'), trim(p_entry->>'knows_us'),
    trim(p_entry->>'race'), trim(p_entry->>'class_name'),
    trim(p_entry->>'spec'), public.hive_role_for_spec(p_entry->>'class_name', p_entry->>'spec'),
    array(select jsonb_array_elements_text(p_entry->'days')),
    (p_entry->>'max_raid_days')::integer,
    p_entry->>'earliest_start', p_entry->>'latest_end',
    trim(p_entry->>'raid_vision'), trim(p_entry->>'discord_name')
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.hive_create_registration(jsonb, text) from public;
grant execute on function public.hive_create_registration(jsonb, text) to anon, authenticated;

create or replace function public.hive_get_registration(p_id uuid, p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(r) - 'edit_token_hash'
  from public.registrations r
  where r.id = p_id
    and r.edit_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function public.hive_get_registration(uuid, text) from public;
grant execute on function public.hive_get_registration(uuid, text) to anon, authenticated;

create or replace function public.hive_update_registration(p_id uuid, p_token text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.registrations;
begin
  perform public.hive_assert_entry(p_entry);
  update public.registrations set
    name = trim(p_entry->>'name'),
    knows_us = trim(p_entry->>'knows_us'),
    race = trim(p_entry->>'race'),
    class_name = trim(p_entry->>'class_name'),
    spec = trim(p_entry->>'spec'),
    role = public.hive_role_for_spec(p_entry->>'class_name', p_entry->>'spec'),
    days = array(select jsonb_array_elements_text(p_entry->'days')),
    max_raid_days = (p_entry->>'max_raid_days')::integer,
    earliest_start = p_entry->>'earliest_start',
    latest_end = p_entry->>'latest_end',
    raid_vision = trim(p_entry->>'raid_vision'),
    discord_name = trim(p_entry->>'discord_name')
  where id = p_id
    and edit_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  returning * into v_entry;
  if not found then
    raise exception 'Bearbeitungslink ungültig oder Eintrag entfernt.';
  end if;
  return to_jsonb(v_entry) - 'edit_token_hash';
end;
$$;

revoke all on function public.hive_update_registration(uuid, text, jsonb) from public;
grant execute on function public.hive_update_registration(uuid, text, jsonb) to anon, authenticated;

create or replace function public.hive_delete_registration(p_id uuid, p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.registrations
  where id = p_id
    and edit_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  return found;
end;
$$;

revoke all on function public.hive_delete_registration(uuid, text) from public;
grant execute on function public.hive_delete_registration(uuid, text) to anon, authenticated;

-- Public roster: expose only these five fields. The registrations table stays private.
create or replace function public.hive_public_roster()
returns table (name text, race text, class_name text, spec text, role text)
language sql stable security definer
set search_path = ''
as $$
  select r.name, r.race, r.class_name, r.spec, r.role
  from public.registrations r
  order by
    case r.role
      when 'Tank' then 1
      when 'Healer' then 2
      when 'Melee DPS' then 3
      when 'Ranged DPS' then 4
      else 5
    end,
    r.class_name, r.spec, r.name;
$$;

revoke all on function public.hive_public_roster() from public;
grant execute on function public.hive_public_roster() to anon, authenticated;

-- After creating your admin user in Supabase Authentication → Users, run:
-- insert into public.hive_admins (user_id) values ('YOUR_AUTH_USER_UUID');

-- Discord owns every new signup. Existing rows are retained, never claimed by name.
begin;
alter table public.registrations add column user_id uuid references auth.users(id) on delete set null;
create unique index registrations_user_id_unique on public.registrations(user_id) where user_id is not null;

create or replace function private.hive_discord_name()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_name text;
begin
  select left(coalesce(nullif(i.identity_data->>'preferred_username',''), nullif(i.identity_data->'custom_claims'->>'global_name',''), nullif(i.identity_data->>'full_name',''), nullif(i.identity_data->>'name',''), i.provider_id),80)
    into v_name from auth.identities i where i.user_id = auth.uid() and i.provider = 'discord' limit 1;
  if auth.uid() is null or v_name is null then
    raise exception 'Bitte melde dich mit Discord an.' using errcode = '42501';
  end if;
  return v_name;
end;
$$;
revoke all on function private.hive_discord_name() from public, anon, authenticated;

create or replace function public.hive_get_my_registration()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.hive_discord_name();
  return (select to_jsonb(r) - 'edit_token_hash' - 'user_id' from public.registrations r where user_id = auth.uid());
end;
$$;

create or replace function public.hive_save_my_registration(p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entry jsonb; v_saved public.registrations; v_id uuid;
begin
  v_entry := p_entry || jsonb_build_object('discord_name',private.hive_discord_name());
  perform public.hive_assert_entry(v_entry);
  -- Serialize a participant's saves: concurrent tabs cannot create duplicates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 260915));
  select id into v_id from public.registrations where user_id = auth.uid();
  if v_id is null then
    v_id := public.hive_create_registration(v_entry, encode(extensions.gen_random_bytes(32),'hex'));
    update public.registrations set user_id = auth.uid() where id = v_id;
  else
    update public.registrations set
      name = trim(v_entry->>'name'), knows_us = trim(coalesce(v_entry->>'knows_us','')),
      race = v_entry->>'race', class_name = v_entry->>'class_name', spec = v_entry->>'spec',
      role = public.hive_role_for_spec(v_entry->>'class_name',v_entry->>'spec'),
      days = array(select jsonb_array_elements_text(v_entry->'days')),
      max_raid_days = (v_entry->>'max_raid_days')::integer,
      earliest_start = v_entry->>'earliest_start', latest_end = v_entry->>'latest_end',
      raid_vision = trim(v_entry->>'raid_vision'), discord_name = v_entry->>'discord_name'
    where id = v_id and user_id = auth.uid();
  end if;
  select * into strict v_saved from public.registrations where id = v_id and user_id = auth.uid();
  return to_jsonb(v_saved) - 'edit_token_hash' - 'user_id';
end;
$$;

create or replace function public.hive_delete_my_registration()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.hive_discord_name();
  delete from public.registrations where user_id = auth.uid();
  return found;
end;
$$;

-- Retire all public bearer-link operations; internal create remains available to the owner RPC.
revoke all on function public.hive_create_registration(jsonb,text) from public,anon,authenticated;
revoke all on function public.hive_get_registration(uuid,text) from public,anon,authenticated;
revoke all on function public.hive_update_registration(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.hive_delete_registration(uuid,text) from public,anon,authenticated;
revoke all on function public.hive_get_my_registration() from public,anon;
revoke all on function public.hive_save_my_registration(jsonb) from public,anon;
revoke all on function public.hive_delete_my_registration() from public,anon;
grant execute on function public.hive_get_my_registration() to authenticated;
grant execute on function public.hive_save_my_registration(jsonb) to authenticated;
grant execute on function public.hive_delete_my_registration() to authenticated;
commit;

-- Optional for historic rows and old clients; the current form requires a choice.
begin;
alter table public.registrations add column server_mode text
  constraint registrations_server_mode_check check (server_mode in ('PVE','PVP'));

create or replace function public.hive_save_my_registration(p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entry jsonb; v_saved public.registrations; v_id uuid;
begin
  v_entry := p_entry || jsonb_build_object('discord_name',private.hive_discord_name());
  perform public.hive_assert_entry(v_entry);
  -- Older cached clients may omit this new field; never erase an existing choice.
  if v_entry ? 'server_mode' and not coalesce(v_entry->>'server_mode' in ('PVE','PVP'), false) then
    raise exception 'Bitte wähle PVE oder PVP als bevorzugten Server.' using errcode = '23514';
  end if;
  -- Serialize a participant's saves: concurrent tabs cannot create duplicates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 260915));
  select id into v_id from public.registrations where user_id = auth.uid();
  if v_id is null then
    v_id := public.hive_create_registration(v_entry, encode(extensions.gen_random_bytes(32),'hex'));
    update public.registrations set user_id = auth.uid(), server_mode = v_entry->>'server_mode' where id = v_id;
  else
    update public.registrations set
      name = trim(v_entry->>'name'), knows_us = trim(coalesce(v_entry->>'knows_us','')),
      server_mode = case when v_entry ? 'server_mode' then v_entry->>'server_mode' else server_mode end,
      race = v_entry->>'race', class_name = v_entry->>'class_name', spec = v_entry->>'spec',
      role = public.hive_role_for_spec(v_entry->>'class_name',v_entry->>'spec'),
      days = array(select jsonb_array_elements_text(v_entry->'days')),
      max_raid_days = (v_entry->>'max_raid_days')::integer,
      earliest_start = v_entry->>'earliest_start', latest_end = v_entry->>'latest_end',
      raid_vision = trim(v_entry->>'raid_vision'), discord_name = v_entry->>'discord_name'
    where id = v_id and user_id = auth.uid();
  end if;
  select * into strict v_saved from public.registrations where id = v_id and user_id = auth.uid();
  return to_jsonb(v_saved) - 'edit_token_hash' - 'user_id';
end;
$$;

-- The owner explicitly approved adding server preference to the public projection.
-- A changed RETURNS TABLE signature requires recreating this one function.
drop function public.hive_public_roster();
create function public.hive_public_roster()
returns table (name text, race text, class_name text, spec text, role text, server_mode text)
language sql stable security definer set search_path = '' as $$
  select r.name, r.race, r.class_name, r.spec, r.role, r.server_mode
  from public.registrations r
  order by case r.role when 'Tank' then 1 when 'Healer' then 2 when 'Melee DPS' then 3 when 'Ranged DPS' then 4 else 5 end,
    r.class_name, r.spec, r.name;
$$;
revoke all on function public.hive_public_roster() from public;
grant execute on function public.hive_public_roster() to anon, authenticated;
notify pgrst, 'reload schema';
commit;

-- Add an explicit no-preference choice without changing existing responses.
begin;
alter table public.registrations drop constraint registrations_server_mode_check;
alter table public.registrations add constraint registrations_server_mode_check
  check (server_mode in ('PVE','PVP','ANY'));
create or replace function public.hive_save_my_registration(p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_entry jsonb; v_saved public.registrations; v_id uuid;
begin
  v_entry := p_entry || jsonb_build_object('discord_name',private.hive_discord_name());
  perform public.hive_assert_entry(v_entry);
  -- Older cached clients may omit this new field; never erase an existing choice.
  if v_entry ? 'server_mode' and not coalesce(v_entry->>'server_mode' in ('PVE','PVP','ANY'), false) then
    raise exception 'Bitte wähle PVE, PVP oder Mir egal als bevorzugten Server.' using errcode = '23514';
  end if;
  -- Serialize a participant's saves: concurrent tabs cannot create duplicates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 260915));
  select id into v_id from public.registrations where user_id = auth.uid();
  if v_id is null then
    v_id := public.hive_create_registration(v_entry, encode(extensions.gen_random_bytes(32),'hex'));
    update public.registrations set user_id = auth.uid(), server_mode = v_entry->>'server_mode' where id = v_id;
  else
    update public.registrations set
      name = trim(v_entry->>'name'), knows_us = trim(coalesce(v_entry->>'knows_us','')),
      server_mode = case when v_entry ? 'server_mode' then v_entry->>'server_mode' else server_mode end,
      race = v_entry->>'race', class_name = v_entry->>'class_name', spec = v_entry->>'spec',
      role = public.hive_role_for_spec(v_entry->>'class_name',v_entry->>'spec'),
      days = array(select jsonb_array_elements_text(v_entry->'days')),
      max_raid_days = (v_entry->>'max_raid_days')::integer,
      earliest_start = v_entry->>'earliest_start', latest_end = v_entry->>'latest_end',
      raid_vision = trim(v_entry->>'raid_vision'), discord_name = v_entry->>'discord_name'
    where id = v_id and user_id = auth.uid();
  end if;
  select * into strict v_saved from public.registrations where id = v_id and user_id = auth.uid();
  return to_jsonb(v_saved) - 'edit_token_hash' - 'user_id';
end;
$$;

notify pgrst, 'reload schema';
commit;

-- Owner-approved public raid vision; no registration data is modified.
begin;
drop function public.hive_public_roster();
create function public.hive_public_roster()
returns table (name text, race text, class_name text, spec text, role text, server_mode text, raid_vision text)
language sql stable security definer set search_path = '' as $$
  select r.name, r.race, r.class_name, r.spec, r.role, r.server_mode, r.raid_vision
  from public.registrations r
  order by case r.role when 'Tank' then 1 when 'Healer' then 2 when 'Melee DPS' then 3 when 'Ranged DPS' then 4 else 5 end,
    r.class_name, r.spec, r.name;
$$;
revoke all on function public.hive_public_roster() from public;
grant execute on function public.hive_public_roster() to anon, authenticated;
notify pgrst, 'reload schema';
commit;

-- Owner-approved public raid availability; no registration data is modified.
begin;
drop function public.hive_public_roster();
create function public.hive_public_roster()
returns table (name text, race text, class_name text, spec text, role text, server_mode text, raid_vision text, days text[], max_raid_days integer, earliest_start text, latest_end text)
language sql stable security definer set search_path = '' as $$
  select r.name, r.race, r.class_name, r.spec, r.role, r.server_mode, r.raid_vision, r.days, r.max_raid_days, r.earliest_start, r.latest_end
  from public.registrations r
  order by case r.role when 'Tank' then 1 when 'Healer' then 2 when 'Melee DPS' then 3 when 'Ranged DPS' then 4 else 5 end,
    r.class_name, r.spec, r.name;
$$;
revoke all on function public.hive_public_roster() from public;
grant execute on function public.hive_public_roster() to anon, authenticated;
notify pgrst, 'reload schema';
commit;

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
