// Horde combinations announced at BlizzCon 2026; checked 2026-09-14.
// Sources and the full matrix: ../docs/race-class-combinations.md
export const UNKNOWN_CHOICE = "Not sure yet";
export const hordeRaceClasses = Object.freeze({
  Orc: Object.freeze(["Warrior", "Hunter", "Rogue", "Shaman", "Mage", "Warlock"]),
  Troll: Object.freeze(["Warrior", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock"]),
  Tauren: Object.freeze(["Warrior", "Hunter", "Shaman", "Druid"]),
  Undead: Object.freeze(["Warrior", "Paladin", "Rogue", "Priest", "Mage", "Warlock"]),
  Skyborne: Object.freeze(["Warrior", "Hunter", "Rogue", "Shaman", "Druid"]),
});

const knownClasses = new Set(Object.values(hordeRaceClasses).flat());

export function isRaceClassAllowed(race, className) {
  if (!Object.hasOwn(hordeRaceClasses, race) && race !== UNKNOWN_CHOICE) return false;
  if (className === UNKNOWN_CHOICE) return true;
  if (!knownClasses.has(className)) return false;
  return race === UNKNOWN_CHOICE || hordeRaceClasses[race].includes(className);
}

export function selectionForRace(race, className = "", spec = "") {
  return isRaceClassAllowed(race, className)
    ? { className, spec }
    : { className: "", spec: "" };
}
