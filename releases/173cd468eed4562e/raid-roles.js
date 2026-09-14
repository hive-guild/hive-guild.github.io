// Public presentation only; persisted roles and database contracts stay unchanged.
export const raidRoleOrder = ["Tank", "Healer", "Melee DPS", "Ranged DPS", "Flexible"];
const specRoles = {
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
export function raidRole(entry) {
  const specs = Object.hasOwn(specRoles, entry.class_name) ? specRoles[entry.class_name] : null;
  return specs && Object.hasOwn(specs, entry.spec) ? specs[entry.spec] : "Flexible";
}
export const raidRoleClass = (role) => role.toLowerCase().replaceAll(" ", "-");
