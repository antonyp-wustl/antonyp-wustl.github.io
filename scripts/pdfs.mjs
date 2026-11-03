// Builds a LaTeX PDF of every published post and links it from the post's page tools.
// Runs in CI after `quarto render` (needs TeX: it installs TinyTeX if there's none).
// PDFs are cached in .pdf-cache by a hash of the post's files, so only changed posts are rebuilt.
//
//   node scripts/pdfs.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const SITE = '_site', CACHE = '.pdf-cache';
const siteUrl = (readFileSync('_quarto.yml', 'utf8').match(/site-url:\s*(\S+)/)?.[1] || '').replace(/\/$/, '');
mkdirSync(CACHE, { recursive: true });

// LaTeX versions of the site's KaTeX macros (theme/katex-macros.html), so posts typeset the same.
const macros = (() => {
  const js = readFileSync('theme/katex-macros.html', 'utf8');
  const body = js.match(/AM_MACROS\s*=\s*(\{[\s\S]*?\});/)?.[1] || '{}';
  const table = JSON.parse(body.replace(/,\s*\}/, '}'));
  return Object.entries(table).map(([name, value]) => {
    const args = Math.max(0, ...[...value.matchAll(/#(\d)/g)].map((m) => +m[1]));
    return `\\let${name}\\relax\\newcommand{${name}}${args ? `[${args}]` : ''}{${value}}`;
  }).join('\n');
})();

// pdflatex needs to be told about Greek letters and maths symbols typed straight into the text.
const unicode = (() => {
  const greek = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi o pi rho varsigma sigma tau upsilon phi chi psi omega'.split(' ');
  const upper = { 0x393: 'Gamma', 0x394: 'Delta', 0x398: 'Theta', 0x39b: 'Lambda', 0x39e: 'Xi', 0x3a0: 'Pi', 0x3a3: 'Sigma', 0x3a6: 'Phi', 0x3a8: 'Psi', 0x3a9: 'Omega' };
  const map = {};
  greek.forEach((g, k) => { if (g !== 'o') map[0x3b1 + k] = `\\${g}`; });
  Object.entries(upper).forEach(([c, g]) => { map[c] = `\\${g}`; });
  Object.assign(map, { 0x2264: '\\le', 0x2265: '\\ge', 0x2260: '\\ne', 0x221e: '\\infty', 0x2212: '-', 0x2192: '\\to', 0xd7: '\\times',
    0x2208: '\\in', 0x2200: '\\forall', 0x2203: '\\exists', 0x2211: '\\sum', 0x220f: '\\prod', 0x221a: '\\surd', 0x2248: '\\approx', 0x2261: '\\equiv',
    0xb2: '^2', 0xb3: '^3', 0x2102: '\\mathbb{C}', 0x2115: '\\mathbb{N}', 0x211a: '\\mathbb{Q}', 0x211d: '\\mathbb{R}', 0x2124: '\\mathbb{Z}' });
  return Object.entries(map).map(([c, tex]) => `\\DeclareUnicodeCharacter{${(+c).toString(16).toUpperCase().padStart(4, '0')}}{\\ensuremath{${tex}}}`).join('\n');
})();

const listFiles = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? listFiles(p).map((q) => join(n, q)) : [n];
}).sort();

const hasTeX = () => existsSync(join(homedir(), '.TinyTeX')) || spawnSync('pdflatex', ['--version']).status === 0;
let texChecked = false;
const ensureTeX = () => {
  if (texChecked) return;
  texChecked = true;
  if (!hasTeX()) spawnSync('quarto', ['install', 'tinytex', '--no-prompt'], { stdio: 'inherit' });
};

const recipe = ['theme/katex-macros.html', 'theme/shortcodes.lua', 'scripts/pdfs.mjs'].map((f) => readFileSync(f)).join('\n');
let built = 0, reused = 0, failed = 0;

for (const slug of readdirSync('posts')) {
  const dir = join('posts', slug), src = join(dir, 'index.qmd');
  if (slug.startsWith('_') || !existsSync(src)) continue;
  const text = readFileSync(src, 'utf8');
  if (/^draft:\s*true\b/m.test(text.split(/\r?\n---/)[0])) continue;
  if (!existsSync(join(SITE, dir, 'index.html'))) continue;

  const hash = createHash('sha256').update(recipe);
  for (const f of listFiles(dir)) hash.update(f).update(readFileSync(join(dir, f)));
  const cached = join(CACHE, `${slug}-${hash.digest('hex').slice(0, 16)}.pdf`);

  if (existsSync(cached)) reused++;
  else {
    ensureTeX();
    const work = join(tmpdir(), 'am-pdf', slug);
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    for (const f of listFiles(dir)) {
      mkdirSync(join(work, f, '..'), { recursive: true });
      copyFileSync(join(dir, f), join(work, f));
    }
    // Interactive cells have nothing to show on paper.
    const paper = text.replace(/(```\{ojs\}[\s\S]*?```\s*)+/g, '*[Interactive figure: open the web version of this page to use it.]*\n\n');
    writeFileSync(join(work, 'index.qmd'), paper);
    copyFileSync('theme/shortcodes.lua', join(work, 'shortcodes.lua'));
    const url = `${siteUrl}/posts/${slug}/`;
    writeFileSync(join(work, 'header.tex'), [
      '\\usepackage{amssymb,amscd}',
      '\\makeatletter\\@ifpackageloaded{microtype}{\\microtypesetup{expansion=false}}{}',
      // Number theorems 1, 2, 3 as on the website, not 0.1, 0.2 within (unnumbered) sections.
      '\\AtBeginDocument{\\@for\\am@c:=theorem,lemma,corollary,proposition,conjecture,definition,example,exercise\\do{\\@ifundefined{c@\\am@c}{}{\\counterwithout{\\am@c}{section}}}}',
      '\\makeatother',
      macros,
      unicode,
      '\\usepackage{fancyhdr}\\pagestyle{fancy}\\fancyhf{}\\renewcommand{\\headrulewidth}{0pt}',
      `\\lfoot{\\footnotesize\\url{${url}}}\\rfoot{\\footnotesize\\thepage}`,
    ].join('\n'));
    writeFileSync(join(work, '_quarto.yml'), [
      'project: { type: default }',
      'shortcodes: [shortcodes.lua]',
      'author: "Antony"',
      'date-format: "D MMMM YYYY"',
      'format:',
      '  pdf:',
      '    documentclass: article',
      '    papersize: letter',
      '    geometry: [margin=1.1in]',
      '    fontsize: 11pt',
      '    fontfamily: lmodern',
      '    colorlinks: true',
      '    toc: false',
      '    number-sections: false',
      '    include-in-header: header.tex',
      '    pdf-engine: pdflatex',
    ].join('\n') + '\n');
    const r = spawnSync('quarto', ['render', 'index.qmd', '--to', 'pdf'], { cwd: work, encoding: 'utf8' });
    const out = join(work, 'index.pdf');
    if (r.status !== 0 || !existsSync(out)) {
      failed++;
      console.log(`pdf: ${slug} failed\n${(r.stderr || r.stdout || '').split('\n').slice(-25).join('\n')}`);
      continue;
    }
    copyFileSync(out, cached);
    built++;
  }

  copyFileSync(cached, join(SITE, dir, `${slug}.pdf`));
  const page = join(SITE, dir, 'index.html');
  const html = readFileSync(page, 'utf8').replace(/<meta name="am-pdf"[^>]*>\n?/, '');
  writeFileSync(page, html.replace('</head>', `<meta name="am-pdf" content="${slug}.pdf">\n</head>`));
}

// Drop cached PDFs of posts that changed or were deleted, keeping the cache small.
const keep = new Set(readdirSync(join(SITE, 'posts')).map((s) => existsSync(join(SITE, 'posts', s, `${s}.pdf`)) && s).filter(Boolean));
for (const f of readdirSync(CACHE)) {
  const slug = f.replace(/-[0-9a-f]{16}\.pdf$/, '');
  const live = join(SITE, 'posts', slug, `${slug}.pdf`);
  if (!keep.has(slug) || readFileSync(live).compare(readFileSync(join(CACHE, f))) !== 0) rmSync(join(CACHE, f));
}
console.log(`pdfs: ${built} built, ${reused} from cache, ${failed} failed`);
