// Publishes scheduled posts, notes and problems whose date has arrived.
// A scheduled file has `draft: true` and `scheduled: true` in its front matter (the Write page
// sets both when you pick a future date). Once the date is today or earlier, both lines go.
//
//   node scripts/schedule.mjs            prints what it published; exits 0 either way
//
// The publish workflow runs this every morning and commits the result.

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const today = process.env.TODAY || new Date().toISOString().slice(0, 10);   // UTC date on the runner
const files = [];
for (const dir of ['posts', 'notes', 'problems']) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const f = dir === 'posts' ? join(dir, name, 'index.qmd') : join(dir, name);
    if (f.endsWith('.qmd') && existsSync(f)) files.push(f);
  }
}

const published = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  const fm = m[1];
  if (!/^scheduled:\s*true\s*$/m.test(fm) || !/^draft:\s*true\b/m.test(fm)) continue;
  const date = fm.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1];
  if (!date || date > today) continue;
  const next = fm.replace(/^(scheduled|draft):.*(\r?\n|$)/gm, '').replace(/\r?\n$/, '');
  writeFileSync(f, text.replace(fm, next));
  published.push(f);
}

console.log(published.length ? `Published: ${published.join(', ')}` : `Nothing scheduled for ${today} or earlier.`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `published=${published.length}\n`);
