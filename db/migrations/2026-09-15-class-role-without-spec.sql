-- Class/spec based role derivation without a picked spec.
--
-- A player who picked a class but no spec used to fall back to 'Flexible'. That was wrong for
-- classes whose specs all cover the same role: Mage and Warlock are always ranged damage and Rogue
-- is always melee damage. Only classes with several possible roles stay 'Flexible'.
--
-- The stored role is derived data only: this project has no manual role selection, so a
-- recomputed value never overwrites a deliberate choice. Existing registrations are corrected
-- in place and need no re-save.
begin;

-- 1. Derivation, mirroring dist/raid-roles.js. Always returns a non-null role.
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

-- 2. Replace the role constraint before rewriting any row: the improved derivation produces
--    'Melee DPS' and 'Ranged DPS', which the old constraint rejected. The historic 'Damage' value
--    is accepted until step 3 has rewritten every row. The constraint name is looked up instead
--    of assumed, and the migration runs in one transaction.
do $$
declare v_constraint text;
begin
  for v_constraint in
    select con.conname
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.registrations'::regclass
      and con.contype = 'c'
      and pg_catalog.pg_get_constraintdef(con.oid) like '%role%'
  loop
    execute format('alter table public.registrations drop constraint %I', v_constraint);
  end loop;
end;
$$;

alter table public.registrations add constraint registrations_role_check
  check (role in ('Tank', 'Healer', 'Melee DPS', 'Ranged DPS', 'Damage', 'Flexible'));

-- 3. Correct every stored role that the improved derivation classifies differently. The
--    registration itself, the picked class and the picked spec stay untouched. Rows that still
--    carry a value outside the published set are recomputed in step 5 below.
update public.registrations r
set role = public.hive_role_for_spec(r.class_name, r.spec)
where r.role is distinct from public.hive_role_for_spec(r.class_name, r.spec);

-- 4. No row may keep the retired coarse 'Damage' value.
update public.registrations r
set role = public.hive_role_for_spec(r.class_name, r.spec)
where r.role = 'Damage';

-- 5. Tighten the constraint to exactly the roles the frontend publishes.
alter table public.registrations drop constraint registrations_role_check;
alter table public.registrations add constraint registrations_role_check
  check (role in ('Tank', 'Healer', 'Melee DPS', 'Ranged DPS', 'Flexible'));

-- 6. Public roster: keep the published 11-field shape and order by the improved role grouping.
drop function if exists public.hive_public_roster();
create function public.hive_public_roster()
returns table (name text, race text, class_name text, spec text, role text, server_mode text, raid_vision text, days text[], max_raid_days integer, earliest_start text, latest_end text)
language sql stable security definer set search_path = '' as $$
  select r.name, r.race, r.class_name, r.spec, r.role, r.server_mode, r.raid_vision, r.days, r.max_raid_days, r.earliest_start, r.latest_end
  from public.registrations r
  order by case r.role
      when 'Tank' then 1 when 'Healer' then 2 when 'Melee DPS' then 3 when 'Ranged DPS' then 4 else 5 end,
    r.class_name, r.spec, r.name;
$$;

revoke all on function public.hive_public_roster() from public;
grant execute on function public.hive_public_roster() to anon, authenticated;

-- 7. Check the result; the expected mapping is documented in docs/raid-roles.md.
--    select class_name, spec, role, count(*) from public.registrations group by 1,2,3 order by 1,2;

notify pgrst, 'reload schema';
commit;
