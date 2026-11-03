// Draws a 1200×630 share image (the preview shown when a link is pasted into
// Discord, iMessage, X, ...) for every post: _site/posts/<slug>/card.png.
//
//   quarto render && node scripts/cards.mjs          # every post
//   node scripts/cards.mjs --home                    # regenerate assets/card.png (the site-wide card)
//
// No npm packages: each card is a small HTML page screenshotted by headless
// Chrome, Chromium or Edge. Set CHROME=/path/to/browser if it isn't found.
// The publish workflow runs this after `quarto render`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const W = 1200, H = 630;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const site = path.join(root, '_site');

// ------------------------------------------------------------ find a browser
function findBrowser() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = {
    win32: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
  }[process.platform];
  if (candidates) return candidates.find((p) => fs.existsSync(p));
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
}

// ------------------------------------------------------------ read a rendered post
const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function readPost(file) {
  const html = fs.readFileSync(file, 'utf8');
  const meta = (attr, name) => {
    const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
    return m ? decode(m[1]) : '';
  };
  const h1 = (html.match(/<h1 class="title">([\s\S]*?)<\/h1>/) || [])[1];
  const title = h1 ? decode(h1.replace(/<[^>]+>/g, '')).trim() : meta('property', 'og:title').replace(/ – [^–]*$/, '');
  const categories = [...html.matchAll(/<div class="quarto-category">([^<]*)<\/div>/g)].map((m) => decode(m[1]));
  const series = decode((html.match(/<div id="am-page"[^>]*data-series="([^"]*)"/) || [])[1] || '');
  const iso = meta('name', 'dcterms.date');
  const date = iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return { title, categories: [...new Set(categories)].slice(0, 3), series, date };
}

// ------------------------------------------------------------ the card
// The right-hand side is a patch of the Ulam spiral, primes filled in marigold.
function spiral() {
  const cell = 18, cx = 960, cy = 315, N = 61 * 61;
  const sieve = new Uint8Array(N + 1).fill(1);
  sieve[0] = sieve[1] = 0;
  for (let i = 2; i * i <= N; i++) if (sieve[i]) for (let j = i * i; j <= N; j += i) sieve[j] = 0;
  let x = 0, y = 0, dx = 1, dy = 0, run = 1, step = 0, turns = 0;
  const marks = [];
  for (let n = 1; n <= N; n++) {
    const px = cx + x * cell, py = cy + y * cell;
    if (px > 380 && px < W + cell && py > -cell && py < H + cell) {
      const fade = Math.max(0, Math.min(1, (px - 420) / 420));
      if (sieve[n]) marks.push(`<rect x="${(px - 5.5).toFixed(1)}" y="${(py - 5.5).toFixed(1)}" width="11" height="11" fill="#f2b134" opacity="${(0.25 + 0.75 * fade).toFixed(2)}"/>`);
      else marks.push(`<circle cx="${px}" cy="${py}" r="1.6" fill="#9aa3b8" opacity="${(0.15 + 0.3 * fade).toFixed(2)}"/>`);
    }
    x += dx; y += dy;
    if (++step === run) { step = 0; [dx, dy] = [dy, -dx]; if (++turns % 2 === 0) run++; }
  }
  return marks.join('');
}

function cardHtml({ title, kicker, chips, footer }) {
  const size = title.length < 34 ? 72 : title.length < 60 ? 60 : title.length < 90 ? 50 : 42;
  const logo = fs.readFileSync(path.join(root, 'assets/logo.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #142449; }
  body { position: relative; font-family: "Familjen Grotesk", "Segoe UI", Arial, sans-serif; color: #e9e4d6; }
  svg.bg { position: absolute; inset: 0; }
  .fade { position: absolute; inset: 0; background: linear-gradient(90deg, #142449 0%, #142449 38%, rgba(20,36,73,0.75) 58%, rgba(20,36,73,0) 85%); }
  .text { position: absolute; left: 80px; top: 72px; bottom: 64px; width: 690px; display: flex; flex-direction: column; }
  .kicker { display: flex; align-items: center; gap: 16px; font-size: 22px; font-weight: 600; letter-spacing: 0.02em; color: #f2b134; }
  .kicker svg { width: 44px; height: 44px; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; margin-bottom: 26px; }
  .chip { font-size: 19px; font-weight: 600; padding: 7px 16px; border: 1.5px solid rgba(233,228,214,0.35); border-radius: 999px; color: #c9cede; }
  h1 { font-size: ${size}px; line-height: 1.06; font-weight: 700; letter-spacing: -0.03em; text-wrap: balance; }
  .foot { margin-top: 34px; font-family: "JetBrains Mono", Consolas, monospace; font-size: 20px; color: #9aa3b8; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: #f2b134; }
</style></head><body>
<svg class="bg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${spiral()}</svg>
<div class="fade"></div>
<div class="text">
  <div class="kicker">${logo}${esc(kicker)}</div>
  <div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
  <h1>${esc(title)}</h1>
  <div class="foot">${esc(footer)}</div>
</div>
<div class="bar"></div>
</body></html>`;
}

// ------------------------------------------------------------ screenshot
const browser = findBrowser();
if (!browser) {
  console.error('cards: no Chrome/Chromium/Edge found (set CHROME=/path/to/browser). Skipping share cards.');
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cards-'));

function shoot(html, out) {
  const page = path.join(tmp, path.basename(path.dirname(out)) + '-card.html');
  fs.writeFileSync(page, html);
  const r = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--no-first-run',
    `--user-data-dir=${path.join(tmp, 'profile')}`, '--force-device-scale-factor=1',
    `--window-size=${W},${H}`, '--virtual-time-budget=6000', `--screenshot=${out}`, pathToFileURL(page).href,
  ], { encoding: 'utf8', timeout: 60000 });
  if (!fs.existsSync(out)) throw new Error(`could not draw ${out}\n${r.stderr || r.error || ''}`);
}

if (process.argv.includes('--home')) {
  const out = path.join(root, 'assets/card.png');
  shoot(cardHtml({
    title: 'Notes and essays on mathematics',
    kicker: 'antony-mathematics',
    chips: ['Number theory', 'Analysis', 'Proofs'],
    footer: 'antonyp-wustl.github.io',
  }), out);
  console.log('cards: wrote assets/card.png');
} else {
  const postsDir = path.join(site, 'posts');
  if (!fs.existsSync(postsDir)) { console.error('cards: run `quarto render` first.'); process.exit(1); }
  let n = 0;
  for (const slug of fs.readdirSync(postsDir)) {
    const file = path.join(postsDir, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const post = readPost(file);
    if (!post.title) continue;   // drafts render as an empty placeholder page
    shoot(cardHtml({
      title: post.title,
      kicker: 'antony-mathematics',
      chips: post.series ? [`Series: ${post.series}`, ...post.categories].slice(0, 3) : post.categories,
      footer: [post.date, 'antonyp-wustl.github.io'].filter(Boolean).join('  ·  '),
    }), path.join(postsDir, slug, 'card.png'));
    n++;
  }
  console.log(`cards: drew ${n} share ${n === 1 ? 'image' : 'images'}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
