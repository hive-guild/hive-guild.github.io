import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  serverModes, serverModeLabel, modePreferenceStats, modePreferenceMultiple,
} from '../dist/raid-roles.js';

// Both surfaces must not only share the calculation but also render it identically.
const appSource = readFileSync(fileURLToPath(new URL('../dist/app.js', import.meta.url)), 'utf8');

const rowsOf = (entries) => modePreferenceStats(entries).rows;
const byMode = (entries) => Object.fromEntries(rowsOf(entries).map((row) => [row.mode, row.count]));
const shareOf = (entries) => Object.fromEntries(rowsOf(entries).map((row) => [row.mode, row.share]));

test('the statistic only offers the play modes the project actually stores', () => {
  assert.deepEqual(serverModes.map((mode) => mode.name), ['PVE', 'PVP', 'ANY']);
  assert.equal(serverModeLabel('ANY'), 'Mir egal');
  assert.equal(serverModeLabel('PVE'), 'PVE');
  // Unknown values are labelled as-is instead of being invented.
  assert.equal(serverModeLabel('RP'), 'RP');
});

test('there is no "not specified" category because a mode is mandatory', () => {
  const stats = modePreferenceStats([{ server_mode: 'PVE' }, { server_mode: 'PVP' }]);
  assert.deepEqual(stats.rows.map((row) => row.mode), ['PVE', 'PVP', 'ANY']);
  assert.equal(stats.uncounted, 0);
  // Unknown or missing modes are never turned into a category of their own.
  const withUnusable = modePreferenceStats([{ server_mode: 'PVE' }, { server_mode: null }, {}, { server_mode: 'RP' }]);
  assert.deepEqual(withUnusable.rows.map((row) => row.mode), ['PVE', 'PVP', 'ANY']);
});

test('counts players once per mode and shares them over all considered players', () => {
  const entries = [
    { server_mode: 'PVE' }, { server_mode: 'PVE' }, { server_mode: 'PVP' },
    { server_mode: 'ANY' }, { server_mode: 'PVP' }, { server_mode: 'PVE' },
    { server_mode: 'PVE' }, { server_mode: 'PVE' }, { server_mode: 'PVP' },
    { server_mode: 'ANY' }, { server_mode: 'PVP' },
  ];
  assert.deepEqual(byMode(entries), { PVE: 5, PVP: 4, ANY: 2 });
  assert.deepEqual(shareOf(entries), { PVE: 45, PVP: 36, ANY: 18 });
  // A single mode per player, so the shares describe the complete group.
  assert.equal(modePreferenceMultiple, false);
  const sum = rowsOf(entries).reduce((total, row) => total + row.share, 0);
  assert.ok(Math.abs(sum - 100) <= 1, `expected roughly 100 %, got ${sum}`);
});

test('records without a usable mode stay out of the shares and are reported', () => {
  const entries = [
    { server_mode: 'PVE' }, { server_mode: null }, { server_mode: '' },
    { server_mode: 'RP' }, {}, { name: 'ohne Modus' }, { server_mode: 'PVP' }, { server_mode: 'PVE' },
  ];
  const stats = modePreferenceStats(entries);
  // Five of eight cannot be counted, so 2/8 and 1/8 are the honest shares.
  assert.deepEqual(byMode(entries), { PVE: 2, PVP: 1, ANY: 0 });
  assert.deepEqual(shareOf(entries), { PVE: 25, PVP: 13, ANY: 0 });
  assert.equal(stats.total, 8);
  assert.equal(stats.uncounted, 5);
  // The app tells the reader about them instead of hiding them.
  assert.match(appSource, /liegt kein Spielmodus vor/);
});

test('an empty roster yields zeroes instead of NaN or a division by zero', () => {
  for (const entries of [[], null, undefined]) {
    const stats = modePreferenceStats(entries);
    assert.equal(stats.total, 0);
    assert.equal(stats.uncounted, 0);
    assert.deepEqual(stats.rows.map((row) => row.count), [0, 0, 0]);
    assert.deepEqual(stats.rows.map((row) => row.share), [0, 0, 0]);
    assert.ok(stats.rows.every((row) => Number.isFinite(row.share)));
  }
});

test('the same roster always produces the same values', () => {
  const roster = [
    { name: 'A', server_mode: 'PVP' }, { name: 'B', server_mode: 'ANY' }, { name: 'C', server_mode: 'PVE' },
    { name: 'D' }, { name: 'E', server_mode: 'PVP' }, { name: 'F', server_mode: 'PVE' },
  ];
  assert.deepEqual(rowsOf(roster), modePreferenceStats(structuredClone(roster)).rows);
});

// Both surfaces must not only share the calculation but also render it identically.
test('overview and admin panel render the statistic through one shared function and one source', () => {
  const calls = [...appSource.matchAll(/renderModePreferences\(\$\((?<target>"[^"]+")\)\s*,\s*(?<entries>[A-Za-z0-9_.[\]]+)\)/g)]
    .map((match) => ({ target: match.groups.target, entries: match.groups.entries }));
  assert.deepEqual(calls, [
    { target: '"#public-mode-stats"', entries: '[]' },
    { target: '"#public-mode-stats"', entries: 'publicEntries' },
    { target: '"#mode-stats"', entries: 'state.entries' },
  ]);
  // The public call uses the complete roster, never the filtered rows.
  assert.match(appSource, /renderModePreferences\(\$\("#public-mode-stats"\), publicEntries\)/);
  // Both surfaces read the same calculation from the shared module.
  assert.equal([...appSource.matchAll(/modePreferenceStats\(/g)].length, 1);
});

test('the public statistic describes the unfiltered roster and says so', () => {
  assert.match(appSource, /The statistic describes the complete roster, independently of role and class filters/);
  assert.match(appSource, /never the current role\/class filter/);
  // The admin card names its scope in the markup.
  const html = readFileSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)), 'utf8');
  assert.match(html, /id="mode-stats"/);
  assert.match(html, /id="public-mode-stats"/);
  assert.match(html, /unabhängig von Rollen- und Klassenfiltern/);
  assert.match(html, /id="public-roster-scope"/);
});

test('the statistic never publishes more than counts and shares', () => {
  const stats = modePreferenceStats([{ name: 'Secret', discord_name: 'secret#1', server_mode: 'PVE' }]);
  assert.deepEqual(Object.keys(stats).sort(), ['multiple', 'rows', 'total', 'uncounted']);
  for (const row of stats.rows) assert.deepEqual(Object.keys(row).sort(), ['count', 'mode', 'share']);
  assert.ok(!JSON.stringify(stats).includes('Secret'));
});

test('the registration form previews the same role the roster would show', () => {
  // The live preview must not contradict the derivation, e.g. for a class without a spec.
  assert.match(appSource, /const derivedRole = \(\) => raidRole\(\{ class_name: choice\("class"\), spec: choice\("spec"\) \}\);/);
  assert.match(appSource, /const role = choice\("class"\) \? derivedRole\(\) : "–";/);
  // The old second spec table is gone; the picker reads the central one.
  assert.equal([...appSource.matchAll(/specs: Object\.entries\(raidClassSpecs\[name\]\)/g)].length, 1);
  assert.ok(!/specs: \[\["/.test(appSource), 'app.js still contains a duplicated spec table');
});
