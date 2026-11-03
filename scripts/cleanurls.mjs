// Drops ".html" from every address on the built site: /about.html becomes /about and
// /posts/x/index.html becomes /posts/x/. GitHub Pages serves /about from about.html by
// itself, so only the links need changing. Runs in CI after everything else has written
// to _site; local preview keeps the .html links (its server needs them).
//
//   node scripts/cleanurls.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

const SITE = '_site';
const config = readFileSync('_quarto.yml', 'utf8');
const SITE_URL = (config.match(/^\s*site-url:\s*(\S+)/m)?.[1] || '').replace(/\/?$/, '/');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === 'site_libs' ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]);
const files = walk(SITE).map((f) => relative(SITE, f).split(sep).join('/'));
const isPage = (rel) => existsSync(join(SITE, rel)) && statSync(join(SITE, rel)).isFile();

// "about.html#x" -> "about#x", "../index.html" -> "../", but only for pages that exist here.
const shorten = (url, fromDir) => {
  let abs = false, path = url;
  if (SITE_URL && url.startsWith(SITE_URL)) { abs = true; path = url.slice(SITE_URL.length - 1); }
  else if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url;
  const [, base, rest = ''] = path.match(/^([^?#]*)(.*)$/);
  if (!base.endsWith('.html') || base.endsWith('404.html')) return url;
  const target = base.startsWith('/') ? base.slice(1) : posix.normalize(posix.join(fromDir, base));
  if (target.startsWith('..') || !isPage(target)) return url;
  let short = base.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  if (short === '' && !abs) short = './';
  return (abs ? SITE_URL.slice(0, -1) : '') + short + rest;
};

// The address a page itself should be known by.
const canonical = (rel) => SITE_URL + rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');

let changed = 0;
for (const rel of files) {
  const ext = posix.extname(rel);
  if (!['.html', '.xml', '.json'].includes(ext)) continue;
  const fromDir = posix.dirname(rel);
  const before = readFileSync(join(SITE, rel), 'utf8');
  let text = before;
  if (ext === '.html') {
    text = text.replace(/(\s(?:href|content|action)=")([^"]*)"/g, (_, attr, url) => `${attr}${shorten(url, fromDir)}"`);
    if (rel !== '404.html' && text.includes('</head>') && !text.includes('<meta name="am-clean-urls"')) {
      const link = SITE_URL && !text.includes('rel="canonical"') ? `<link rel="canonical" href="${canonical(rel)}">\n` : '';
      text = text.replace('</head>', `<meta name="am-clean-urls" content="1">\n${link}</head>`);
    }
  } else if (ext === '.xml') {
    text = text.replace(/(<(loc|link|guid|id)>)([^<]*)(<\/\2>)/g, (_, open, tag, url, close) => open + shorten(url, fromDir) + close)
      .replace(/(\shref=")([^"]*)"/g, (_, attr, url) => `${attr}${shorten(url, fromDir)}"`);
  } else {
    // search.json and listings.json: any string that is a path to a page
    text = text.replace(/"([^"\s]*\.html(?:[?#][^"\s]*)?)"/g, (_, url) => `"${shorten(url, fromDir)}"`);
  }
  if (text !== before) { writeFileSync(join(SITE, rel), text); changed++; }
}
console.log(`cleanurls: rewrote ${changed} files`);
