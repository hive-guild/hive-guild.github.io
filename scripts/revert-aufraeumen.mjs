// Undo the "cleanup" commit in one step: restore the four touched files, bring the deleted image
// back and drop the undo tag again. It stops before committing, so the result can be reviewed with
// "git status" and then committed and published with the printed commands.
//
//   node scripts/revert-aufraeumen.mjs
//
// If the cleanup was already committed, the faster route is a plain git revert of that commit. This
// script exists for the case where the working tree still carries the change.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TAG = 'aufraeumen-vorher';

// Everything the cleanup commit touches, in one place.
const RESTORE = [
  '.github/workflows/deploy.yml',
  'dist/app.js',
  'dist/index.html',
  'dist/styles.css',
  'package.json',
];
const RESTORE_DELETED = ['dist/assets/icons/server-pvp-art.png'];

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// This script ships inside the commit it undoes, so restoring that commit would delete the script
// halfway through. Keep its source in memory and write it back before finishing.
const SELF = fileURLToPath(import.meta.url);
const selfSource = readFileSync(SELF);

let tagCommit;
try {
  tagCommit = git('rev-list', '-n', '1', TAG);
} catch {
  console.error(`The tag "${TAG}" is missing, so there is nothing to restore from.`);
  console.error('Recreate it with:  git tag -f aufraeumen-vorher <commit-before-the-cleanup>');
  process.exit(1);
}
console.log(`Restoring from ${TAG} (${tagCommit.slice(0, 12)})`);

// The versioned pages are rebuilt, never restored: the tag carries the old release folder only.
const htmlBefore = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const release = htmlBefore.match(/releases\/([a-f0-9]{16})\//)?.[1] ?? '';

for (const file of [...RESTORE, ...RESTORE_DELETED]) {
  try {
    git('checkout', TAG, '--', file);
    console.log(`  restored  ${file}`);
  } catch (error) {
    console.error(`  FAILED    ${file}: ${error.stderr?.trim() || error.message}`);
    process.exitCode = 1;
  }
}

// The tag has done its job; keeping it would hide a stale pointer in the history.
try {
  git('tag', '-d', TAG);
  console.log(`  removed   tag ${TAG}`);
} catch {
  console.log(`  note      tag ${TAG} is gone already`);
}

// Put this script back, then rebuild: the versioned release folders are not part of the commit, so
// the pages need a fresh build for the restored sources.
writeFileSync(SELF, selfSource);
console.log('  kept      scripts/revert-aufraeumen.mjs');

const png = new URL('../dist/assets/icons/server-pvp-art.png', import.meta.url);
if (existsSync(png)) {
  console.log(`  verified  server-pvp-art.png is back (${Math.round(readFileSync(png).length / 1024)} KB)`);
}

console.log('\nNothing is committed yet. To finish the revert:');
console.log('  node scripts/build-pages.mjs');
console.log('  node --test tests/*.test.mjs');
console.log('  git add -A && git commit -m "Revert the cleanup"');
console.log('  git push hive-pages main && python scripts/publish-pages.py');
if (release) console.log(`\nThe page currently points at release ${release}; the build above writes a fresh one.`);
