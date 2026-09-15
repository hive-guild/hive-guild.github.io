// Single source of truth for the public role grouping, the automatic role of a class/spec
// combination and the play-mode statistic. The database mirrors only the derived role
// (db/supabase.sql -> public.hive_role_for_spec), never this mapping itself.

// Duration grouping shown in overview, counters, filters, sorting and admin roster.
export const raidRoleOrder = ["Tank", "Healer", "Melee DPS", "Ranged DPS", "Flexible"];

// The stored UI label for "no spec yet"; it is a placeholder, never a spec on its own.
export const OPEN_SPEC = "Not sure yet";

// Specs per class for the Forever (classic) build of the Horde classes used by this project.
// Every spec name already persisted by the project stays valid.
const classSpecs = {
  Warrior: { Arms: "Melee DPS", Fury: "Melee DPS", Protection: "Tank" },
  Hunter: { "Beast Mastery": "Ranged DPS", Marksmanship: "Ranged DPS", Survival: "Melee DPS" },
  Rogue: { Assassination: "Melee DPS", Combat: "Melee DPS", Subtlety: "Melee DPS" },
  Druid: { Balance: "Ranged DPS", "Feral (Bear)": "Tank", "Feral (Cat)": "Melee DPS", Restoration: "Healer" },
  Shaman: { Elemental: "Ranged DPS", Enhancement: "Melee DPS", Restoration: "Healer" },
  Mage: { Arcane: "Ranged DPS", Fire: "Ranged DPS", Frost: "Ranged DPS" },
  Warlock: { Affliction: "Ranged DPS", Demonology: "Ranged DPS", Destruction: "Ranged DPS" },
  Priest: { Discipline: "Healer", Holy: "Healer", Shadow: "Ranged DPS" },
  Paladin: { Holy: "Healer", Protection: "Tank", Retribution: "Melee DPS" },
};

export const raidClassSpecs = classSpecs;
export const classNames = Object.freeze(Object.keys(classSpecs));
const specRoles = Object.freeze(Object.fromEntries(
  Object.entries(classSpecs).map(([className, specs]) => [className, Object.freeze({ ...specs })]),
));

// All distinct roles a class can cover. Exactly one distinct role means the class is unambiguous
// even while the player has not picked a spec yet (Mage, Warlock and Rogue). Hunter is not among
// them in this build, because Survival fights in melee.
const classRoles = Object.freeze(Object.fromEntries(
  Object.entries(classSpecs).map(([className, specs]) => [className, Object.freeze([...new Set(Object.values(specs))])]),
));

// Player picked "noch nicht sicher" or left the field empty.
export function hasOpenSpec(spec) {
  const value = typeof spec === "string" ? spec.trim() : "";
  return value === "" || value === OPEN_SPEC;
}

// The only possible role of a whole class, otherwise null.
export function uniqueClassRole(className) {
  if (typeof className !== "string" || !Object.hasOwn(classRoles, className)) return null;
  const roles = classRoles[className];
  return roles.length === 1 ? roles[0] : null;
}

// Role the player picked through the spec, otherwise null.
export function specRaidRole(className, spec) {
  if (typeof className !== "string" || !Object.hasOwn(specRoles, className)) return null;
  if (typeof spec !== "string" || !Object.hasOwn(specRoles[className], spec)) return null;
  return specRoles[className][spec];
}

// Precedence: an explicitly set manual role wins, then the chosen spec, then a class with only a
// single possible role, otherwise Flexible. Legacy automatic "Flexible" values are ignored on
// purpose so players who already registered profit without saving their class or spec again.
export function raidRole(entry) {
  const player = entry && typeof entry === "object" ? entry : {};
  const manual = player.role_manual ?? player.role_locked;
  if (manual === true && typeof player.role === "string" && player.role) return player.role;
  const bySpec = specRaidRole(player.class_name, player.spec);
  if (bySpec) return bySpec;
  return uniqueClassRole(player.class_name) ?? "Flexible";
}

export const raidRoleClass = (role) => String(role).toLowerCase().replaceAll(" ", "-");

// Play-mode choices of the registration form. "ANY" is the stored value of "Mir egal".
export const serverModes = Object.freeze([
  Object.freeze({ name: "PVE" }),
  Object.freeze({ name: "PVP" }),
  Object.freeze({ name: "ANY", label: "Mir egal" }),
]);
// The play mode is a required field of the registration form and the server rejects any other
// value, so every registration has exactly one mode. There is deliberately no "not specified"
// category: it could only ever be empty.
export const serverModeLabel = (value) => serverModes.find((mode) => mode.name === value)?.label || value;

// One registration carries exactly one play mode, so the shares add up to 100%.
// The flag keeps the rendering honest should the project ever allow a multi selection.
export const modePreferenceMultiple = false;

// Counts every player at most once per mode. The shares always relate to all considered players,
// so a record that cannot be counted is reported instead of silently inflating the percentages.
export function modePreferenceStats(entries = []) {
  const players = Array.isArray(entries) ? entries : [];
  const rows = serverModes.map((mode) => ({ mode: mode.name, count: 0 }));
  const byMode = new Map(rows.map((row) => [row.mode, row]));
  let uncounted = 0;
  for (const entry of players) {
    const counted = entry && typeof entry.server_mode === "string" ? byMode.get(entry.server_mode) : undefined;
    if (counted) counted.count += 1;
    else uncounted += 1;
  }
  const total = players.length;
  const share = (count) => total ? Math.round((count / total) * 100) : 0;
  return {
    total,
    multiple: modePreferenceMultiple,
    uncounted,
    rows: rows.map((row) => ({ ...row, share: share(row.count) })),
  };
}
