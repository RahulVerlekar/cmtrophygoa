import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const source = new URL('../public/', import.meta.url);
const output = new URL('../dist/', import.meta.url);
const commit = process.env.CF_PAGES_COMMIT_SHA;

if (process.env.CF_PAGES && !commit) throw new Error('CF_PAGES_COMMIT_SHA is required for a Pages build.');
if (commit && !/^[a-f0-9]{7,64}$/i.test(commit)) throw new Error('Invalid Pages commit SHA.');

const version = commit ? commit.slice(0, 8) : 'development';
rmSync(output, { recursive: true, force: true });
cpSync(source, output, { recursive: true });

for (const path of ['index.html', 'register/index.html', 'rules/index.html']) {
  const file = new URL(path, output);
  const html = readFileSync(file, 'utf8');
  if (!html.includes('Version: development')) throw new Error(`Missing version marker in ${path}.`);
  const built = html
    .replace('Version: development', `Version: ${version}`)
    .replace(/((?:src|href)="\/[^"?#]+\.(?:js|css))(?:\?[^"]*)?"/g, `$1?v=${version}"`);
  writeFileSync(file, built);
}
console.log(`Built site version ${version}.`);
