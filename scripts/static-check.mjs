import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', '.vercel', 'coverage']);
const textExtensions = new Set(['.html', '.js', '.json', '.md', '.txt', '.xml', '.mjs', '.svg']);
const forbidden = [
  /data-cc-id/i,
  /Netlify/i,
  /CUNABIT-VERCEL/i,
  /logic unchanged/i,
  /sourceMappingURL/i,
  /\bchatgpt\b/i,
  /\bchat\b/i,
  /\binstructions\b/i,
  /\binstrucciones\b/i,
  /\bAPI[_-]?KEY\b/i,
  /\bSECRET\b/i,
  /BEGIN [A-Z ]+KEY/
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

function extensionOf(file) {
  const index = file.lastIndexOf('.');
  return index === -1 ? '' : file.slice(index).toLowerCase();
}

const problems = [];

for (const file of walk(root)) {
  if (relative(root, file) === join('scripts', 'static-check.mjs')) continue;
  if (!textExtensions.has(extensionOf(file))) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      problems.push(`${relative(root, file)} matches ${pattern}`);
    }
  }
}

JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log('Static checks passed.');
