import test from 'node:test';
import assert from 'node:assert/strict';
import {
  raidRole, raidRoleOrder, classNames, raidClassSpecs, uniqueClassRole, specRaidRole, hasOpenSpec,
} from '../dist/raid-roles.js';

const role = (class_name, spec = 'Not sure yet', extra = {}) => raidRole({ class_name, spec, ...extra });

test('a picked spec decides the role', () => {
  for (const [class_name, spec, expected] of [
    ['Druid','Feral (Bear)','Tank'], ['Druid','Feral (Cat)','Melee DPS'], ['Druid','Balance','Ranged DPS'], ['Druid','Restoration','Healer'],
    ['Shaman','Enhancement','Melee DPS'], ['Shaman','Elemental','Ranged DPS'], ['Shaman','Restoration','Healer'],
    ['Hunter','Survival','Melee DPS'], ['Hunter','Beast Mastery','Ranged DPS'], ['Hunter','Marksmanship','Ranged DPS'],
    ['Priest','Shadow','Ranged DPS'], ['Priest','Holy','Healer'], ['Priest','Discipline','Healer'],
    ['Paladin','Retribution','Melee DPS'], ['Paladin','Protection','Tank'], ['Paladin','Holy','Healer'],
    ['Warrior','Arms','Melee DPS'], ['Warrior','Fury','Melee DPS'], ['Warrior','Protection','Tank'],
    ...['Assassination','Combat','Subtlety'].map(s => ['Rogue',s,'Melee DPS']),
    ...['Arcane','Fire','Frost'].map(s => ['Mage',s,'Ranged DPS']),
    ...['Affliction','Demonology','Destruction'].map(s => ['Warlock',s,'Ranged DPS']),
  ]) assert.equal(role(class_name, spec), expected, `${class_name}/${spec}`);
});

test('a class without a picked spec uses its only possible role', () => {
  // The reported bug: a Mage without a spec belongs to Ranged DPS, not Flexible.
  assert.equal(role('Mage'), 'Ranged DPS');
  assert.equal(role('Warlock'), 'Ranged DPS');
  assert.equal(role('Rogue'), 'Melee DPS');
  // Explicit "noch nicht sicher" and an empty value mean the same thing.
  assert.equal(role('Mage', 'Not sure yet'), 'Ranged DPS');
  assert.equal(role('Mage', ''), 'Ranged DPS');
  assert.equal(role('Mage', '   '), 'Ranged DPS');
  assert.equal(role('Mage', undefined), 'Ranged DPS');
  assert.equal(role('Mage', null), 'Ranged DPS');
  // Hunter is deliberately *not* in this group: Survival fights in melee in this build.
  assert.equal(role('Hunter'), 'Flexible');
  assert.equal(role('Hunter', 'Survival'), 'Melee DPS');
  assert.equal(role('Hunter', 'Beast Mastery'), 'Ranged DPS');
});

test('a class with several possible roles and no spec stays Flexible', () => {
  for (const class_name of ['Warrior', 'Hunter', 'Druid', 'Shaman', 'Priest', 'Paladin', 'Not sure yet']) {
    assert.equal(role(class_name), 'Flexible', class_name);
    assert.equal(role(class_name, 'Not sure yet'), 'Flexible', `${class_name}/open`);
  }
});

test('missing and unusable class or spec values fall back without throwing', () => {
  // Without any usable class there is nothing to derive from.
  for (const entry of [
    {}, { spec: 'Frost' },
    { class_name: 'Evoker', spec: 'Devastation' },
    { class_name: 'Unknown', spec: 'Shadow' },
    { class_name: 'toString', spec: 'constructor' },
    { class_name: 'hasOwnProperty', spec: 'hasOwnProperty' },
    { class_name: '__proto__', spec: '__proto__' },
    { class_name: 'Not sure yet', spec: 'Not sure yet' },
    { class_name: 42, spec: 'Frost' },
  ]) {
    assert.equal(raidRole(entry), 'Flexible', JSON.stringify(entry));
  }
  assert.equal(raidRole(), 'Flexible');
  assert.equal(raidRole(null), 'Flexible');
  assert.equal(raidRole('Mage'), 'Flexible');
  assert.equal(raidRole(42), 'Flexible');
  // A usable class survives an unusable spec and still classifies correctly.
  for (const entry of [{ class_name: 'Mage' }, { class_name: 'Mage', spec: 'Frostmourne' }, { class_name: 'Mage', spec: 42 }]) {
    assert.equal(raidRole(entry), 'Ranged DPS', JSON.stringify(entry));
  }
  // Every reachable value is one the project publishes.
  for (const entry of [{ class_name: 'Mage' }, { class_name: 'Evoker' }, {}, { class_name: 'Druid' }]) {
    assert.ok(raidRoleOrder.includes(raidRole(entry)), JSON.stringify(entry));
  }
});

test('every class and spec resolves to a role published by the project', () => {
  for (const class_name of classNames) {
    assert.ok(raidRoleOrder.includes(role(class_name)), `${class_name} without spec`);
    for (const spec of Object.keys(raidClassSpecs[class_name])) {
      assert.ok(raidRoleOrder.includes(role(class_name, spec)), `${class_name}/${spec}`);
    }
  }
  // A single distinct role per class is exactly the "unambiguous without a spec" case.
  for (const class_name of classNames) {
    const expected = uniqueClassRole(class_name) ?? 'Flexible';
    assert.equal(role(class_name), expected, class_name);
  }
});

test('an explicitly set manual role wins over the derived one', () => {
  assert.equal(raidRole({ class_name: 'Mage', spec: 'Not sure yet', role: 'Flexible', role_manual: true }), 'Flexible');
  assert.equal(raidRole({ class_name: 'Druid', spec: 'Balance', role: 'Healer', role_manual: true }), 'Healer');
  assert.equal(raidRole({ class_name: 'Druid', spec: 'Balance', role: 'Healer', role_locked: true }), 'Healer');
  // A manual flag without a usable role still falls back to the derivation.
  assert.equal(raidRole({ class_name: 'Mage', spec: 'Not sure yet', role: '', role_manual: true }), 'Ranged DPS');
  assert.equal(raidRole({ class_name: 'Mage', spec: 'Not sure yet', role_manual: true }), 'Ranged DPS');
});

test('legacy automatic roles never block the improved classification', () => {
  // Previously the automatically stored value was Flexible or the old coarse Damage.
  for (const legacy of ['Flexible', 'Damage']) {
    assert.equal(raidRole({ class_name: 'Mage', spec: 'Not sure yet', role: legacy }), 'Ranged DPS', legacy);
    assert.equal(raidRole({ class_name: 'Priest', spec: 'Shadow', role: legacy }), 'Ranged DPS', legacy);
    assert.equal(raidRole({ class_name: 'Druid', spec: 'Not sure yet', role: legacy }), 'Flexible', legacy);
  }
});

test('existing registrations are classified without being modified', () => {
  const rows = [
    { class_name: 'Priest', spec: 'Shadow', role: 'Damage' },
    { class_name: 'Warrior', spec: 'Fury', role: 'Damage' },
    { class_name: 'Mage', spec: 'Not sure yet', role: 'Flexible' },
    { class_name: 'Unknown', spec: 'Shadow', role: 'Damage' },
    { class_name: 'Druid', spec: 'Feral', role: 'Flexible' },
    { class_name: 'toString', spec: 'constructor', role: 'Damage' },
  ];
  const original = structuredClone(rows);
  const counts = raidRoleOrder.map((name) => rows.filter((row) => raidRole(row) === name).length);
  // Melee: Warrior/Fury. Ranged: Priest/Shadow and the Mage without a spec. Flexible: the unknown
  // class, the free-text "Feral" spec and the prototype-pollution probe.
  assert.deepEqual(counts, [0, 0, 1, 2, 3]);
  assert.deepEqual(rows, original);
});

test('the already registered Mage from the live roster moves to Ranged DPS', () => {
  // Regression guard for the reported case: class picked, spec still "Not sure yet".
  const burley = { class_name: 'Mage', spec: 'Not sure yet', role: 'Flexible' };
  assert.equal(raidRole(burley), 'Ranged DPS');
  assert.equal(burley.role, 'Flexible');
});

test('the helpers expose the same decisions the derivation uses', () => {
  assert.equal(specRaidRole('Mage', 'Frost'), 'Ranged DPS');
  assert.equal(specRaidRole('Mage', 'Frostmourne'), null);
  assert.equal(specRaidRole('Evoker', 'Frost'), null);
  assert.equal(uniqueClassRole('Mage'), 'Ranged DPS');
  assert.equal(uniqueClassRole('Druid'), null);
  assert.equal(uniqueClassRole('Evoker'), null);
  assert.equal(hasOpenSpec('Not sure yet'), true);
  assert.equal(hasOpenSpec('  '), true);
  assert.equal(hasOpenSpec('Frost'), false);
});
