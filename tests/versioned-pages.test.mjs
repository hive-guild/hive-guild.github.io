import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';

function fixture(t) {
  const parent = resolve(tmpdir());
  const root = mkdtempSync(join(parent, 'hive-pages-test-'));
  t.after(() => {
    if (dirname(resolve(root)) !== parent || !basename(root).startsWith('hive-pages-test-')) throw new Error('Unsafe fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, 'vendor'));
  const files = {
    'index.html': '<!doctype html><head><link rel="stylesheet" href="./styles.css"><script type="module" src="./app.js"></script></head><body>HIVE</body>',
    'app.js': 'import { config } from "./config.js";\nimport "./race-classes.js";\nimport "./vendor/supabase-auth.js";\n',
    'raid-roles.js': 'export const raidRole = () => "Flexible";\n',
    'availability.js': 'export const commonAvailability = () => ({});\n',
    'config.js': 'export const config = "public-config";\n',
    'race-classes.js': 'export const races = ["Orc"];\n',
    'styles.css': '.hero{background:url("assets/hero.png")}\n.icon{background:url(./assets/icon.svg)}\n',
    'vendor/supabase-auth.js': 'export const AuthClient = {};\n',
    'vendor/supabase-auth.LICENSE': 'Test license\n',
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

test('both page entrypoints load one immutable release, including transitive modules', (t) => {
  const root = fixture(t);
  const version = buildPages(root);
  for (const page of ['index.html', 'anmeldung/index.html']) {
    const html = readFileSync(join(root, page), 'utf8');
    assert.ok(html.includes(`./releases/${version}/app.js`));
    assert.ok(html.includes(`./releases/${version}/styles.css`));
    assert.ok(!html.includes('src="./app.js"'));
  }
  assert.ok(readFileSync(join(root, 'anmeldung/index.html'), 'utf8').includes('<base href="../" />'));
  for (const file of ['app.js', 'config.js', 'race-classes.js', 'raid-roles.js', 'availability.js', 'vendor/supabase-auth.js']) {
    assert.ok(existsSync(join(root, 'releases', version, file)), file);
  }
});

test('an update changes asset addresses while cached HTML retains its old matching files', (t) => {
  const root = fixture(t);
  const first = buildPages(root);
  const oldCss = readFileSync(join(root, 'releases', first, 'styles.css'), 'utf8');
  const oldModule = readFileSync(join(root, 'releases', first, 'race-classes.js'), 'utf8');
  writeFileSync(join(root, 'styles.css'), '.hero{color:red}\n');
  const second = buildPages(root);
  assert.notEqual(first, second);
  writeFileSync(join(root, 'race-classes.js'), 'export const races = ["Orc", "Troll"];\n');
  const third = buildPages(root);
  assert.notEqual(second, third);
  assert.equal(readFileSync(join(root, 'releases', first, 'styles.css'), 'utf8'), oldCss);
  assert.equal(readFileSync(join(root, 'releases', first, 'race-classes.js'), 'utf8'), oldModule);
});

test('release identity is reproducible across Windows and GitHub Actions line endings', (t) => {
  const root = fixture(t);
  const first = buildPages(root);
  const path = join(root, 'app.js');
  writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'));
  assert.equal(buildPages(root), first);
  assert.equal(buildPages(root), first);
});

test('versioned CSS keeps image URLs valid on both organization and legacy project sites', (t) => {
  const root = fixture(t);
  const version = buildPages(root);
  const css = readFileSync(join(root, 'releases', version, 'styles.css'), 'utf8');
  const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m => m[1]);
  for (const site of ['https://hive-guild.github.io/', 'https://flyleaf1502.github.io/hive/']) {
    const cssURL = `${site}releases/${version}/styles.css`;
    assert.equal(new URL(urls[0], cssURL).href, `${site}assets/hero.png`);
    assert.equal(new URL(urls[1], cssURL).href, `${site}assets/icon.svg`);
  }
});
