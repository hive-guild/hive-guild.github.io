// Development helper: validates db/supabase.sql and the role migration against a real PostgreSQL
// engine (PGlite/WASM) without touching the live project. Requires @electric-sql/pglite:
//   npm install --no-save --no-package-lock @electric-sql/pglite
//   node scripts/validate-sql.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { classNames, raidClassSpecs, raidRole } from '../dist/raid-roles.js';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const db = new PGlite();
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// Supabase specifics that the plain engine does not provide.
await db.exec(`
  create schema if not exists auth;
  create schema if not exists extensions;
  create role anon;
  create role authenticated;
  create table if not exists auth.users (id uuid primary key);
  create table if not exists auth.identities (
    id text primary key,
    user_id uuid references auth.users(id) on delete cascade,
    provider text not null,
    provider_id text,
    identity_data jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`);

// pgcrypto ships with Supabase but not with every local build. The role mapping under test never
// calls it, so a documented stand-in keeps the harness usable in both environments. The extension
// statement is removed because a failing statement aborts the whole batch.
let schema = read('../db/supabase.sql');
try {
  await db.exec('create extension if not exists pgcrypto with schema extensions;');
  console.log('ok   pgcrypto available');
} catch {
  schema = schema.replace(/create extension[^;]*pgcrypto[^;]*;/, '-- pgcrypto stand-in, see scripts/validate-sql.mjs');
  await db.exec(`
    create or replace function extensions.digest(text, text) returns bytea language sql immutable
      as $$ select convert_to(md5($1), 'UTF8') $$;
    create or replace function extensions.gen_random_bytes(int) returns bytea language sql volatile
      as $$ select convert_to(md5(random()::text), 'UTF8') $$;
  `);
  console.log('note pgcrypto unavailable locally; using stand-in digest/gen_random_bytes');
}
await db.exec(`
  create or replace function public.gen_random_uuid() returns uuid language sql volatile
    as $$ select (md5(random()::text || clock_timestamp()::text))::uuid $$;
`);

// 1. The committed schema must load on a fresh database.
try {
  await db.exec(schema);
  console.log('ok   fresh db/supabase.sql loads without error');
} catch (error) {
  console.error(`FAIL db/supabase.sql: ${error.message}`);
  await db.close();
  process.exit(1);
}

const insert = async (class_name, spec, role, race = 'Orc') => db.query(
  `insert into public.registrations (edit_token_hash, name, race, class_name, spec, role, days, max_raid_days, earliest_start, latest_end, raid_vision, discord_name)
   values (md5(random()::text) || md5(random()::text), 'Probe', $4, $1, $2, $3, array['Mon'], 1, '19:00', '22:00', 'Test', 'probe') returning id`,
  [class_name, spec, role, race],
);

// 2. Historic rows exactly as an older database holds them: the coarse 'Damage' value and
//    automatic 'Flexible' fallbacks. They are staged inside a transaction that keeps the legacy
//    constraint open, mirroring the state the migration runs against in production.
const legacy = [
  ['Mage', 'Not sure yet', 'Flexible', 'Undead'],
  ['Warlock', 'Not sure yet', 'Flexible', 'Orc'],
  ['Rogue', 'Not sure yet', 'Flexible', 'Orc'],
  ['Hunter', 'Survival', 'Damage', 'Orc'],
  ['Warrior', 'Fury', 'Damage', 'Orc'],
  ['Priest', 'Shadow', 'Damage', 'Troll'],
  ['Paladin', 'Holy', 'Damage', 'Undead'],
  ['Druid', 'Restoration', 'Healer', 'Tauren'],
  ['Shaman', 'Enhancement', 'Damage', 'Orc'],
  ['Druid', 'Not sure yet', 'Flexible', 'Tauren'],
  ['Warrior', 'Not sure yet', 'Flexible', 'Orc'],
  ['Hunter', 'Not sure yet', 'Flexible', 'Orc'],
];
try {
  await db.exec('begin');
  await db.exec("alter table public.registrations drop constraint registrations_role_check");
  await db.exec("alter table public.registrations add constraint registrations_role_check check (role in ('Tank','Healer','Damage','Flexible'))");
  for (const [class_name, spec, role, race] of legacy) await insert(class_name, spec, role, race);
  await db.exec('commit');
  console.log(`ok   staged ${legacy.length} historic rows on the old constraint`);
} catch (error) {
  await db.exec('rollback').catch(() => {});
  console.error(`FAIL staging historic rows: ${error.message}`);
  await db.close();
  process.exit(1);
}

// 3. Run the migration twice: it must be idempotent.
for (const attempt of [1, 2]) {
  try {
    await db.exec(read('../db/migrations/2026-09-15-class-role-without-spec.sql'));
    console.log(`ok   migration applies (attempt ${attempt})`);
  } catch (error) {
    failures.push(`migration failed on attempt ${attempt}: ${error.message}`);
    console.log(`FAIL migration attempt ${attempt}: ${error.message}`);
  }
}

// 4. SQL results must equal the JavaScript implementation for every class/spec pair.
const pairs = [[null, null], ['Not sure yet', 'Not sure yet'], ['Evoker', 'Devastation'], ['', '']];
for (const class_name of classNames) {
  pairs.push([class_name, 'Not sure yet'], [class_name, ''], [class_name, null]);
  for (const spec of Object.keys(raidClassSpecs[class_name])) pairs.push([class_name, spec]);
}
for (const [class_name, spec] of pairs) {
  const { rows } = await db.query('select public.hive_role_for_spec($1, $2) as role', [class_name, spec]);
  const expected = raidRole({ class_name, spec });
  check(rows[0].role === expected, `sql/js mismatch for ${class_name}/${spec}: sql=${rows[0].role} js=${expected}`);
}
console.log(`ok   hive_role_for_spec matches dist/raid-roles.js for ${pairs.length} class/spec combinations`);

// 5. Every stored role was corrected and the constraint accepts the new values.
const { rows: stored } = await db.query('select class_name, spec, role from public.registrations order by class_name, spec');
for (const row of stored) {
  const expected = raidRole({ class_name: row.class_name, spec: row.spec });
  check(row.role === expected, `stored role not corrected for ${row.class_name}/${row.spec}: ${row.role} != ${expected}`);
}
const corrected = stored.filter((row) => row.role !== 'Flexible' && (row.class_name === 'Mage' || row.class_name === 'Warlock' || row.class_name === 'Rogue'));
check(corrected.length === 3, `expected 3 corrected single-role rows, got ${corrected.length}`);
console.log(`ok   ${stored.length} stored roles recomputed (${corrected.map((row) => `${row.class_name}=${row.role}`).join(', ')})`);

// 6. A role outside the published set must still be rejected.
try {
  await insert('Mage', 'Frost', 'Healer');
  await db.query("update public.registrations set role = 'Nonsense' where class_name = 'Mage'");
  failures.push('constraint accepted an invalid role');
  console.log('FAIL constraint accepted an invalid role');
} catch {
  console.log('ok   role constraint rejects unpublished values');
}

// 7. Public roster keeps its published shape and orders by the improved grouping.
const { rows: roster } = await db.query('select * from public.hive_public_roster()');
const { rows: count } = await db.query('select count(*)::int as n from public.registrations');
check(roster.length === count[0].n, `roster returned ${roster.length} of ${count[0].n} rows`);
check(Object.keys(roster[0]).length === 11, `roster exposes ${Object.keys(roster[0]).length} fields, expected 11`);
const order = ['Tank', 'Healer', 'Melee DPS', 'Ranged DPS', 'Damage', 'Flexible'];
const ranks = roster.map((row) => order.indexOf(row.role));
check(ranks.every((rank, index) => index === 0 || ranks[index - 1] <= rank), 'roster is not ordered by role group');
// No personal field beyond the eleven documented ones.
check(!('discord_name' in roster[0]) && !('user_id' in roster[0]) && !('knows_us' in roster[0]), 'roster leaks a private field');
console.log(`ok   hive_public_roster: ${roster.length} rows, ${Object.keys(roster[0]).length} fields, grouped order`);

await db.close();
if (failures.length) {
  console.error(`\n${failures.length} SQL check(s) failed:`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('\nAll SQL checks passed.');
