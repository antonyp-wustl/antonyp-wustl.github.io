// Adds a "Referenced by" list to every post, note and problem that another one links to.
// Runs after `quarto render` (see post-render in _quarto.yml) and edits the HTML in _site.
//
//   node scripts/backlinks.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

const SITE = '_site';
const KINDS = { posts: 'Post', lectures: 'Lecture', notes: 'Note', problems: 'Problem' };
const FOLDERS = new Set(['posts', 'lectures']);       // one folder per page, with index.html inside

// Every page that can link or be linked: /posts/x/index.html, /lectures/x/index.html, /notes/y.html, /problems/z.html
const pages = [];
for (const dir of Object.keys(KINDS)) {
  const base = join(SITE, dir);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    const rel = FOLDERS.has(dir) ? `${dir}/${name}/index.html` : name.endsWith('.html') ? `${dir}/${name}` : null;
    if (!rel || name.startsWith('_') || !existsSync(join(SITE, rel))) continue;
    const html = readFileSync(join(SITE, rel), 'utf8');
    const title = (html.match(/<h1 class="title"[^>]*>([\s\S]*?)<\/h1>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
    if (!title) continue;                                   // drafts render as an empty placeholder
    pages.push({ rel, kind: KINDS[dir], title, html });
  }
}
const byUrl = new Map(pages.map((p) => [p.rel.replace(/index\.html$/, ''), p]));

// Who links to whom. Only the article body counts: not the menus, listings or citation box.
const refs = new Map();
for (const p of pages) {
  const body = (p.html.split(/<main[^>]*>/)[1] || '').split(/<div id="quarto-appendix"|<\/main>/)[0]
    .replace(/<section class="am-backlinks"[\s\S]*?<\/section>/g, '');
  for (const [, href] of body.matchAll(/<a [^>]*href="([^"]+)"/g)) {
    if (/^([a-z]+:|\/\/|#)/i.test(href)) continue;
    const path = posix.normalize(posix.join(posix.dirname(p.rel), href.split('#')[0].split('?')[0]));
    const target = byUrl.get(path.replace(/index\.html$/, '').replace(/^\//, '')) || byUrl.get(path.replace(/\/?$/, '/'));
    if (!target || target === p) continue;
    if (!refs.has(target)) refs.set(target, new Set());
    refs.get(target).add(p);
  }
}

let changed = 0;
for (const p of pages) {
  let html = p.html.replace(/<section class="am-backlinks"[\s\S]*?<\/section>\n?/g, '');
  const from = [...(refs.get(p) || [])].sort((a, b) => a.title.localeCompare(b.title));
  if (from.length) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const items = from.map((s) => {
      const href = posix.relative(posix.dirname(p.rel), s.rel).replace(/(^|\/)index\.html$/, '$1') || './';
      return `<li><a href="${href}">${esc(s.title)}</a><small>${s.kind}</small></li>`;
    }).join('');
    const section = `<section class="am-backlinks" aria-label="Referenced by"><h2>Referenced by</h2><ul>${items}</ul></section>\n`;
    html = html.includes('<div id="quarto-appendix"')
      ? html.replace('<div id="quarto-appendix"', section + '<div id="quarto-appendix"')
      : html.replace('</main>', section + '</main>');
  }
  if (html !== p.html) { writeFileSync(join(SITE, p.rel), html); changed++; }
}
console.log(`backlinks: ${[...refs.values()].reduce((n, s) => n + s.size, 0)} links between ${pages.length} pages, ${changed} pages updated`);
