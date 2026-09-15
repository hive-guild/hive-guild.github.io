import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  serverModes, serverModeLabel, modePreferenceStats, modePreferenceMultiple,
} from '../dist/raid-roles.js';

// Both surfaces must not only share the calculation but also render it identically.
const appSource = readFileSync(fileURLToPath(new URL('../dist/app.js', import.meta.url)), 'utf8');
const iconPath = (name) => fileURLToPath(new URL(`../dist/assets/icons/${name}`, import.meta.url));

const rowsOf = (entries) => modePreferenceStats(entries).rows;
const byMode = (entries) => Object.fromEntries(rowsOf(entries).map((row) => [row.mode, row.count]));
const shareOf = (entries) => Object.fromEntries(rowsOf(entries).map((row) => [row.mode, row.share]));

test('every play mode has one artwork file used by all three surfaces', () => {
  const icons = Object.fromEntries(
    [...appSource.matchAll(/(PVE|PVP|ANY): "([^"]+)"/g)].map((match) => [match[1], match[2]]),
  );
  assert.deepEqual(icons, { PVE: 'mode-peace.svg', PVP: 'mode-pvp.svg', ANY: 'mode-shrug.svg' });
  for (const file of Object.values(icons)) {
    assert.ok(existsSync(iconPath(file)), `missing artwork ${file}`);
  }
  // The form, the overview and the admin panel all read this one table.
  assert.match(appSource, /const serverModeChoices = serverModes\.map\(\(mode\) => \(\{ \.\.\.mode, icon: serverModeIcons\[mode\.name\] \}\)\);/);
  assert.match(appSource, /icon\.src = iconUrl\(serverModeIcons\[value\]\);/);
  // The replaced AI motifs must not be referenced anywhere anymore.
  assert.ok(!/server-pve-art\.png|server-any-art\.png|server-pvp-art\.png/.test(appSource), 'a removed icon file is still referenced');
});

test('every bar in a chart starts at the same x position', () => {
  const css = readFileSync(fileURLToPath(new URL('../dist/styles.css', import.meta.url)), 'utf8');
  // A fixed label column is what keeps the bars aligned; max-content made short labels shift the
  // bar to the left and faked a different bar length.
  assert.match(css, /\.chart-row-share\{grid-template-columns:72px minmax\(48px,1fr\) 26px 46px;gap:9px\}/);
  assert.match(css, /\.mode-stats \.chart-row-share\{grid-template-columns:32px 84px minmax\(48px,1fr\) 26px 46px\}/);
  assert.ok(!/chart-row-share\{grid-template-columns:[^}]*max-content/.test(css), 'the label column still grows with its content');
  const rows = [...css.matchAll(/\.chart-row-share\{grid-template-columns:([^}]*)\}/g)].map((m) => m[1]);
  for (const row of rows) {
    assert.ok(!/max-content|auto/.test(row), `row definition is content-sized: ${row}`);
  }
  // A media query does not raise specificity, so inside every breakpoint the four-column insight
  // rule must come before the five-column play-mode rule. Otherwise the narrow-viewport rule
  // flattens the mode rows and the bars collapse to a sliver.
  for (const block of css.matchAll(/@media\([^)]*\)\{([^@]*)\}/g)) {
    const body = block[1];
    const insight = body.indexOf('.insight-card .chart-row-share');
    const mode = body.indexOf('.mode-stats .chart-row-share');
    if (insight !== -1 && mode !== -1) {
      assert.ok(insight < mode, 'the plan-mode column rule must come after the insight rule');
      assert.equal([...body.matchAll(/\.mode-stats \.chart-row-share\{grid-template-columns:(\d+)px (\d+)px/g)].length, 1);
    }
  }
  // Locate the 620px block that redefines the chart columns (there are several 620px blocks).
  const at = css.indexOf('.mode-stats .chart-row-share{grid-template-columns:28px 68px');
  assert.ok(at > 0, 'the narrow-viewport play-mode columns are missing');
  const blockStart = css.lastIndexOf('@media(max-width:620px)', at);
  assert.ok(blockStart > 0, 'the play-mode columns are not inside the 620px breakpoint');
  const block = css.slice(blockStart, css.indexOf('\n', at));
  assert.match(block, /\.insight-card \.chart-row-share\{grid-template-columns:56px minmax\(40px,1fr\) 22px 40px/);
  assert.ok(block.indexOf('.insight-card .chart-row-share') < block.indexOf('.mode-stats .chart-row-share'),
    'inside the breakpoint the insight rule must come before the play-mode rule');
});

test('every role counter tile carries the same coloured top border', () => {
  const css = readFileSync(fileURLToPath(new URL('../dist/styles.css', import.meta.url)), 'utf8');
  const tiles = [...css.matchAll(/\.public-stat\.(role-[a-z-]+)\{([^}]*)\}/g)]
    .map((match) => ({ role: match[1], body: match[2] }));
  const roles = tiles.map((tile) => tile.role).sort();
  // All five groups the overview renders, including the two DPS groups.
  assert.deepEqual(roles, ['role-flexible', 'role-healer', 'role-melee-dps', 'role-ranged-dps', 'role-tank']);
  for (const { role, body } of tiles) {
    assert.match(body, /border-top:2px solid #/, `${role} has no coloured top border`);
    assert.match(body, /--stat-accent:#/, `${role} has no accent for the hover transition`);
  }
  // The hover and the transition use that accent instead of a blanket border colour.
  assert.match(css, /button\.public-stat:not\(:disabled\):hover\{border-top-color:var\(--stat-accent,var\(--text\)\)/);
  assert.match(css, /button\.public-stat\{[^}]*transition:border-top-color \.2s,background-color \.2s,filter \.2s/);
  // A blanket !important tint must not override the designed tile background.
  assert.ok(!/\.public-stat\.role-(melee|ranged)-dps[^{]*\{[^}]*!important/.test(css), 'tile background is overridden with !important');
});

test('the imported emoji assets stay local, script-free and self-contained', () => {
  for (const file of ['mode-peace.svg', 'mode-shrug.svg']) {
    const svg = readFileSync(iconPath(file), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, file);
    assert.ok(!/<script/i.test(svg), `${file} contains a script`);
    assert.ok(!/onload=/i.test(svg), `${file} contains an inline handler`);
    // Only the SVG namespace may appear as an absolute reference.
    const refs = [...svg.matchAll(/https?:\/\/[^"'\s>]+/g)].map((match) => match[0]);
    assert.deepEqual([...new Set(refs)], ['http://www.w3.org/2000/svg'], file);
  }
});

test('the "noch nicht sicher" artwork stays the single question-mark asset', () => {
  // The question mark is the Twemoji glyph now, transparent and centred. One file serves every
  // place that shows it.
  assert.ok(existsSync(iconPath('role-flexible.png')), 'role-flexible.png is missing');
  assert.ok(!existsSync(iconPath('role-flexible.jpg')), 'the retired JPEG is still shipped');
  assert.ok(!/role-flexible\.jpg/.test(appSource), 'app.js still points at the retired JPEG');
  // The tile shows the question mark once: the role preview is skipped on these tiles, so the
  // flexible artwork appears in the data and the fallbacks only.
  assert.match(appSource, /if \(option\.role && option\.icon !== "role-flexible\.png"\) \{/);
  assert.ok(!/if \(option\.role\) \{\s*\n\s*const roleIcon/.test(appSource), 'the preview is back on the flexible tile');
});

test('every icon the role map names is actually shipped', () => {
  // The artwork itself is back at its pre-session state, so this only guards the references.
  const map = appSource.match(/const roleIcons = \{([^}]*)\};/);
  assert.ok(map, 'no role icon map');
  const files = [...map[1].matchAll(/"([a-z0-9-]+\.(?:jpg|png))"/g)].map((m) => m[1]);
  assert.ok(files.length >= 5, 'the role icon map lost entries');
  for (const file of new Set(files)) {
    assert.ok(existsSync(iconPath(file)), `${file} is referenced but missing`);
  }
});

test('Skyborne ships its own portrait and no placeholder artwork', () => {
  assert.ok(existsSync(iconPath('race-skyborne.png')), 'race-skyborne.png is missing');
  assert.match(appSource, /\{ name: "Skyborne", icon: "race-skyborne\.png" \}/);
  assert.ok(!/elf-ear/.test(appSource), 'app.js still points at the retired placeholder');
  assert.ok(!existsSync(iconPath('elf-ear.svg')), 'the retired placeholder is still shipped');
  const html = readFileSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)), 'utf8');
  assert.ok(!/Elf ear|elf-ear\.html/.test(html), 'the footer still credits the removed placeholder');
  assert.match(html, /Skyborne: offizielles Forever-Charakterbild/);
});

test('the race portraits keep their pre-session tile treatment', () => {
  const css = readFileSync(fileURLToPath(new URL('../dist/styles.css', import.meta.url)), 'utf8');
  // The framed plate on the roster tile is back, and the form tile has its own backdrop again.
  assert.match(css, /\.public-race-icon\{[^}]*object-fit:contain[^}]*background:#121720[^}]*border:1px solid #46404a\}/);
  assert.match(css, /\.choice-icon\[src\*="race-"\]\{object-fit:contain;border-radius:4px;background:radial-gradient\(/);
  // Neither the rolled back edge mask nor the overlay override may linger.
  assert.ok(!/mask-image:radial-gradient\(115%/.test(css), 'the rolled-back race mask is still in the stylesheet');
  assert.ok(!/race-"\][^{]*box-shadow:none/.test(css), 'the removed frame override is still in the stylesheet');
});

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
  // Every mode row carries the same artwork the registration form uses.
  assert.match(appSource, /chartRow\(serverModeLabel\(row\.mode\), row\.count, 0, row\.share\)/);
  assert.match(appSource, /image\.src = iconUrl\(serverModeIcons\[row\.mode\]\)/);
  // The percentage column only exists where a row reports a share, so a bar without one keeps the
  // compact three-column layout and never renders a stray "0 %" cell.
  assert.match(appSource, /if \(share !== null\) \{\n    row\.classList\.add\("chart-row-share"\);/);
  assert.match(appSource, /const width = share === null\n    \? Math\.max\(0, Math\.min\(100, \(count \/ Math\.max\(max, 1\)\) \* 100\)\)/);
  // Day and time bars report their share of the whole roster, like the mode statistic does.
  assert.match(appSource, /chartRow\(dayLabels\[day\], dayCounts\[index\], Math\.max\(\.\.\.dayCounts, 1\), attendanceShare\(dayCounts\[index\]\)\)/);
  assert.match(appSource, /chartRow\(time, counts\[index\], Math\.max\(\.\.\.counts, 1\), attendanceShare\(counts\[index\]\)\)/);
  assert.match(appSource, /const attendanceShare = \(count\) => entries\.length \? Math\.round\(\(count \/ entries\.length\) \* 100\) : 0;/);
  assert.ok(!/chartRow\([^)]*,[^)]*,[^)]*,[^)]*,/.test(appSource), 'chartRow called with too many arguments');
  // No extra explanation lines below the bars; the card heads name the scope instead.
  assert.ok(!/mode-total/.test(appSource), 'stale caption element still rendered');
  assert.ok(!/ergeben die Anteile zusammen/.test(appSource), 'removed share explanation still rendered');
  assert.ok(!/zusätzliche Tage oder längere Zeitfenster/.test(appSource), 'removed alternative summary still rendered');
});

test('the availability cards carry only their labels, slots and shares', () => {
  // Labels the operator asked for, on both the overview and the admin panel.
  const html = readFileSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)), 'utf8');
  assert.equal([...html.matchAll(/section-index">PERFECT MATCH</g)].length, 2);
  assert.ok(!/GEMEINSAME VERFÜGBARKEIT/.test(html), 'old availability label still present');
  // The extra summary lines below the slots are gone.
  assert.ok(!/gemeinsam maximal/.test(appSource), 'removed availability summary still rendered');
  assert.match(appSource, /\/\/ The slots above already carry the day and the time window; no extra summary line\.\n    target\.append\(slots\);/);
  // The alternative card keeps its own label and no long summary either.
  assert.equal([...html.matchAll(/section-index">GUTE OPTIONEN</g)].length, 2);
  assert.ok(!/zusätzliche Tage oder längere Zeitfenster/.test(appSource), 'removed alternative summary still rendered');
});

test('the public statistic describes the unfiltered roster and says so', () => {
  assert.match(appSource, /The statistic describes the complete roster, independently of role and class filters/);
  assert.match(appSource, /never the current role\/class filter/);
  // The scope badge counts votes and keeps the singular correct.
  assert.match(appSource, /#public-roster-scope"\)\.textContent = `\$\{publicEntries\.length\} \$\{publicEntries\.length === 1 \? "Vote" : "Votes"\}`/);
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
  // The field appears as soon as the role is certain: with a spec, or with a class whose specs all
  // cover one role. An ambiguous class stays hidden until its spec is picked.
  assert.match(appSource, /const panel = \$\("#role-result"\);\n  if \(!chosenSpec && !uniqueClassRole\(className\)\) \{\n    panel\.hidden = true;\n    return;\n  \}\n  panel\.hidden = false;/);
  assert.match(appSource, /import \{\n  raidRole, raidRoleOrder, raidRoleClass, raidClassSpecs, classNames, serverModes,\n  serverModeLabel, modePreferenceStats, uniqueClassRole,\n\} from "\.\/raid-roles\.js";/);
  // It starts hidden in the markup as well, so nothing flashes before the first update.
  const html = readFileSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)), 'utf8');
  assert.match(html, /<div id="role-result" class="role-result" aria-live="polite" hidden>/);
  // The old second spec table is gone; the picker reads the central one.
  assert.equal([...appSource.matchAll(/specs: Object\.entries\(raidClassSpecs\[name\]\)/g)].length, 1);
  assert.ok(!/specs: \[\["/.test(appSource), 'app.js still contains a duplicated spec table');
});
