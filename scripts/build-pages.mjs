import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseFiles = ['app.js', 'config.js', 'race-classes.js', 'raid-roles.js', 'availability.js', 'styles.css', 'vendor/supabase-auth.js', 'vendor/supabase-auth.LICENSE'];
const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

export function buildPages(dist = fileURLToPath(new URL('../dist/', import.meta.url))) {
  const files = releaseFiles.map((name) => [name, readText(join(dist, name))]);
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
  const release = join(dist, 'releases', version);
  // Keep previous releases: a cached HTML document must retain its matching modules and CSS.
  for (const [name, source] of files) {
    const output = join(release, name);
    mkdirSync(dirname(output), { recursive: true });
    const content = name === 'styles.css' ? source.replace(/url\((["']?)(?:\.\/)?assets\//g, 'url($1../../assets/') : source;
    writeFileSync(output, content, 'utf8');
  }
  let html = readText(join(dist, 'index.html'));
  if (!html.includes('<head>') || html.includes('<base ')) throw new Error('Unexpected canonical HTML structure');
  const stylesheet = /href="\.\/(?:releases\/[a-f0-9]+\/)?styles\.css"/;
  const script = /src="\.\/(?:releases\/[a-f0-9]+\/)?app\.js"/;
  if (!stylesheet.test(html) || !script.test(html)) throw new Error('Missing versionable app or stylesheet');
  html = html.replace(stylesheet, `href="./releases/${version}/styles.css"`).replace(script, `src="./releases/${version}/app.js"`);
  writeFileSync(join(dist, 'index.html'), html, 'utf8');
  mkdirSync(join(dist, 'anmeldung'), { recursive: true });
  writeFileSync(join(dist, 'anmeldung/index.html'), html.replace('<head>', '<head>\n    <base href="../" />'), 'utf8');
  return version;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built root and /anmeldung/ with matching frontend release ${buildPages()}.`);
}
