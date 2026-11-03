// The Write page (write.qmd): log in with a GitHub token, write a post or a note
// with a live preview, and commit it straight to the repo. Every push to main
// runs .github/workflows/publish.yml, which rebuilds and deploys the site.
//
// Nothing here needs a server. The token lives only in this browser, encrypted
// with a passphrase (PBKDF2 + AES-GCM), and is sent only to api.github.com.
(() => {
  const host = document.getElementById('am-write');
  if (!host) return;
  const { owner, repo, branch } = host.dataset;
  const API = 'https://api.github.com';
  const R = `/repos/${owner}/${repo}`;
  const LIVE = host.dataset.site ? host.dataset.site.replace(/\/?$/, '/') : /\.github\.io$/.test(repo) ? `https://${repo}/` : '';
  const RAW = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
  // The login helper (worker/auth.js) behind "Log in with GitHub". Without it, only the
  // key-and-passphrase login is offered.
  const AUTH = (host.dataset.auth || '').replace(/\/$/, '');
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
    name: 'antony-mathematics editor',
    description: 'Lets the Write page on the site publish posts.',
    target_name: owner,
    expires_in: '366',
    contents: 'write',
    actions: 'read',
  });

  // -------------------------------------------------------------- small helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el = host) => el.querySelector(sel);
  const $$ = (sel, el = host) => [...el.querySelectorAll(sel)];
  const safe = (area) => ({
    get: (k) => { try { return area().getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { area().setItem(k, v); return true; } catch (_) { return false; } },
    del: (k) => { try { area().removeItem(k); } catch (_) { /* storage blocked */ } },
    keys: () => { try { return Object.keys(area()); } catch (_) { return []; } },
  });
  const local = safe(() => localStorage), tab = safe(() => sessionStorage);
  const KEY = { auth: 'am-write:auth', session: 'am-write:session', remember: 'am-write:remember', who: 'am-write:who', cache: 'am-write:meta', draft: 'am-write:draft:' };
  const today = () => new Date().toLocaleDateString('en-CA');            // YYYY-MM-DD in local time
  const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\$[^$]*\$/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const fmtDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const ago = (t) => {
    const s = Math.round((Date.now() - new Date(t)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const enc = new TextEncoder(), dec = new TextDecoder();
  const toB64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));

  // -------------------------------------------------------------- the token, sealed with a passphrase
  async function keyFrom(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(secret, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), enc.encode(secret));
    return { salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  }
  async function unseal(rec, pass) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) },
      await keyFrom(pass, fromB64(rec.salt)), fromB64(rec.ct));
    return dec.decode(pt);
  }
  const savedAuth = () => { try { return JSON.parse(local.get(KEY.auth)); } catch (_) { return null; } };

  // "Stay logged in": the token is also kept encrypted with a key that this browser
  // generates and can't export (it lives in IndexedDB), so this device opens the editor
  // without the passphrase until you log out. A copy of the browser's files alone is no use.
  function deviceStore(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('am-write', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('keys');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('keys', mode);
        const req = fn(tx.objectStore('keys'));
        tx.oncomplete = () => { open.result.close(); resolve(req.result); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }
  async function remember(secret) {
    try {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));
      await deviceStore('readwrite', (s) => s.put(key, 'device'));
      local.set(KEY.remember, JSON.stringify({ iv: toB64(iv), ct: toB64(new Uint8Array(ct)) }));
    } catch (_) { /* private window or storage blocked: just ask next time */ }
  }
  async function recall() {
    try {
      const rec = JSON.parse(local.get(KEY.remember));
      if (!rec) return null;
      const key = await deviceStore('readonly', (s) => s.get('device'));
      if (!key) return null;
      return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct)));
    } catch (_) { return null; }
  }
  function forgetDevice() {
    local.del(KEY.remember);
    deviceStore('readwrite', (s) => s.delete('device')).catch(() => {});
  }

  // -------------------------------------------------------------- the session
  // What a login leaves: { token } for a key, or for "Log in with GitHub" also a refresh
  // token and expiry times (those tokens last 8 hours and are renewed quietly).
  let token = null, me = null, session = null;
  const parseSession = (s) => {
    if (!s) return null;
    try { const o = JSON.parse(s); return o && o.token ? o : null; } catch (_) { return { token: s }; }    // older: the bare token
  };
  const fromGitHub = (t) => ({
    via: 'github', token: t.token, refresh: t.refresh || '',
    expires: +t.expires_in ? Date.now() + t.expires_in * 1000 : 0,
    refreshExpires: +t.refresh_expires_in ? Date.now() + t.refresh_expires_in * 1000 : 0,
  });
  async function startSession(s, stay) {
    session = s;
    token = s.token;
    const str = JSON.stringify(s);
    tab.set(KEY.session, str);
    if (stay) await remember(str);
  }
  let refreshing = null;
  function refreshSession() {
    if (!AUTH || !session?.refresh) return Promise.resolve(false);
    refreshing ||= (async () => {
      try {
        const res = await fetch(AUTH + '/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: session.refresh }) });
        if (!res.ok) return false;
        await startSession(fromGitHub(await res.json()), !!local.get(KEY.remember));
        return true;
      } catch (_) {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // -------------------------------------------------------------- GitHub API
  async function gh(path, opts = {}, retried = false) {
    if (session?.expires && session.expires - Date.now() < 5 * 60e3) await refreshSession();
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      method: opts.method || 'GET',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 401 && !retried && await refreshSession()) return gh(path, opts, true);
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch (_) { /* not JSON */ }
      const err = new Error(msg);
      err.status = res.status;
      if (res.status === 401) { tab.del(KEY.session); forgetDevice(); token = null; session = null; }
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  const explain = (e) => {
    if (e.status === 401) return AUTH ? 'GitHub has logged you out. Log in again.' : 'GitHub didn’t accept the token. It may have expired: make a new one and connect again.';
    if ((e.status === 403 || e.status === 404) && session?.via === 'github') return `Your GitHub login can’t write to ${repo}. Check that the site’s GitHub App is installed on that repository (GitHub → Settings → Applications).`;
    if (e.status === 403 || e.status === 404) return `The token can’t write to ${repo}. Check that it has access to that repository with “Contents: Read and write”.`;
    if (e instanceof TypeError) return 'Couldn’t reach GitHub. Check your connection and try again.';
    return e.message || String(e);
  };

  // Commit several files (or deletions) at once with the Git Data API.
  async function commitFiles(message, files) {
    const shas = {};
    const tree = await Promise.all(files.map(async (f) => {
      if (f.delete) return { path: f.path, mode: '100644', type: 'blob', sha: null };
      const blob = await gh(`${R}/git/blobs`, { method: 'POST', body: { content: f.b64 ?? toB64(enc.encode(f.text)), encoding: 'base64' } });
      shas[f.path] = blob.sha;
      return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    for (let attempt = 0; ; attempt++) {
      const head = (await gh(`${R}/git/ref/heads/${branch}`)).object.sha;
      const base = await gh(`${R}/git/commits/${head}`);
      const t = await gh(`${R}/git/trees`, { method: 'POST', body: { base_tree: base.tree.sha, tree } });
      const c = await gh(`${R}/git/commits`, { method: 'POST', body: { message, tree: t.sha, parents: [head] } });
      try {
        await gh(`${R}/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: c.sha } });
        return { commit: c.sha, shas };
      } catch (e) {
        if (e.status !== 422 || attempt >= 2) throw e;      // someone pushed in between: rebuild on the new head
      }
    }
  }

  // -------------------------------------------------------------- repo contents
  let files = null;                       // every file in the repo: [{ path, sha }]
  let entries = null;                     // posts, notes and problems with their front matter
  const isPost = (p) => /^posts\/[^_/][^/]*\/index\.qmd$/.test(p);
  const isNote = (p) => /^notes\/[^_/][^/]*\.qmd$/.test(p);
  const isProblem = (p) => /^problems\/[^_/][^/]*\.qmd$/.test(p);
  const kindOf = (p) => (isPost(p) ? 'post' : isNote(p) ? 'note' : 'problem');
  // Where pictures go: next to a post, or in notes/media/ and problems/media/.
  const mediaDir = (d) => (d.kind === 'post' ? (d.path ? d.path.replace(/index\.qmd$/, '') : null) : `${d.kind}s/media/`);
  const readBlob = async (sha) => dec.decode(fromB64((await gh(`${R}/git/blobs/${sha}`)).content));

  async function loadEntries(force) {
    if (entries && !force) return entries;
    const t = await gh(`${R}/git/trees/${branch}?recursive=1`);
    files = t.tree.filter((x) => x.type === 'blob').map((x) => ({ path: x.path, sha: x.sha }));
    let cache = {};
    try { cache = JSON.parse(local.get(KEY.cache)) || {}; } catch (_) { /* start fresh */ }
    const wanted = files.filter((f) => isPost(f.path) || isNote(f.path) || isProblem(f.path));
    const fresh = {};
    entries = await Promise.all(wanted.map(async (f) => {
      let m = cache[f.sha];
      if (!m || !('v2' in m)) {
        const { meta } = splitDoc(await readBlob(f.sha));
        m = { v2: 1, title: meta.title || '', date: meta.date || '', draft: meta.draft === true, scheduled: meta.scheduled === true,
          categories: [].concat(meta.categories || []), series: meta.series || '', source: meta.source || '', difficulty: meta.difficulty || 0 };
      }
      fresh[f.sha] = m;
      return { ...m, path: f.path, sha: f.sha, kind: kindOf(f.path) };
    }));
    local.set(KEY.cache, JSON.stringify(fresh));
    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return entries;
  }

  // -------------------------------------------------------------- front matter
  const ORDER = ['title', 'subtitle', 'description', 'author', 'date', 'date-modified', 'categories', 'series', 'source', 'difficulty', 'draft', 'scheduled'];
  function splitDoc(text) {
    text = text.replace(/\r\n/g, '\n');
    const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (!m) return { meta: {}, body: text };
    let meta;
    try { meta = jsyaml.load(m[1], { schema: jsyaml.JSON_SCHEMA }) || {}; } catch (e) { return { meta: {}, body: text, error: e.message }; }
    return { meta, body: text.slice(m[0].length).replace(/^\n+/, '') };
  }
  function joinDoc(meta, body) {
    const out = {};
    ORDER.concat(Object.keys(meta)).forEach((k) => {
      const v = meta[k];
      if (k in out || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
      out[k] = v;
    });
    const yaml = Object.keys(out).length ? jsyaml.dump(out, { schema: jsyaml.JSON_SCHEMA, lineWidth: -1, flowLevel: 1 }) : '';
    return `---\n${yaml}---\n\n${body.replace(/\s+$/, '')}\n`;
  }

  // -------------------------------------------------------------- preview: Quarto markdown → HTML
  const THM = { thm: 'Theorem', lem: 'Lemma', cor: 'Corollary', prp: 'Proposition', cnj: 'Conjecture', def: 'Definition', exm: 'Example', exr: 'Exercise' };
  const THM_CLASS = { thm: '', lem: 'lemma', cor: 'corollary', prp: 'proposition', cnj: 'conjecture', def: 'definition', exm: 'example', exr: 'exercise' };
  const CALLOUT = { note: 'Note', tip: 'Tip', warning: 'Warning', important: 'Important', caution: 'Caution' };
  const FENCE = /^(:{3,})\s*(\{[^}]*\}|[\w-]+)\s*$/;

  function parseAttrs(s) {
    const a = { id: '', classes: [], kv: {} };
    s.replace(/^\{|\}$/g, '').replace(/([\w-]+)="([^"]*)"|([\w-]+)=(\S+)|#([\w-]+)|\.([\w-]+)|([\w-]+)/g, (m, k1, v1, k2, v2, id, cls, word) => {
      if (k1 || k2) a.kv[k1 || k2] = v1 ?? v2;
      else if (id) a.id = id;
      else a.classes.push(cls || word);
    });
    return a;
  }

  // Pictures: unsent ones show from memory, sent ones from the repo.
  let imageResolver = (href) => href;
  if (window.marked) {
    marked.use({
      gfm: true,
      renderer: {
        image(href, title, text) {
          return `<img src="${esc(imageResolver(href))}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''} class="img-fluid">`;
        },
      },
    });
  }

  function renderQmd(src, resolveImg) {
    const math = [], notes = [], labels = {}, counters = {}, codes = [];
    const tok = (kind, i) => `AMQ${kind}${i}QMA`;

    // Number theorems and equations in order of appearance, as Quarto does.
    src.replace(/\{#(thm|lem|cor|prp|cnj|def|exm|exr|eq)-([\w-]+)/g, (m, t, n) => {
      counters[t] = (counters[t] || 0) + 1;
      labels[`${t}-${n}`] = { type: t, num: counters[t] };
    });

    // Leave code alone; pull maths and footnotes out so marked can't mangle them.
    const parts = src.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = footnotes(parts[i]
        .replace(/\{\{<\s*([\w-]+)\s*([\s\S]*?)>\}\}/g, (m, name, args) => tok('S', codes.push(shortcode(name, args)) - 1))
        .replace(/^(#{1,6}[ \t].*?)[ \t]*\{[#.][^}]*\}[ \t]*$/gm, '$1')      // heading attributes like {#sec-intro}
        // [](../other-post/#thm-x): the site fills in the theorem's name; show its label here
        .replace(/\[\]\(([^)\s]*#((?:thm|lem|cor|prp|cnj|def|exm|exr)-[\w-]+))\)/g, '[$2 ↗]($1)')
        .replace(/\$\$([\s\S]+?)\$\$([ \t]*\{#(eq-[\w-]+)\})?/g, (m, tex, _, id) => tok('M', math.push({ tex, display: true, id }) - 1))
        .replace(/(^|[^\\$])\$(?![\s$])((?:\\.|[^$\\\n]|\n(?![ \t]*\n))+?)(?<!\s)\$(?!\d)/g, (m, pre, tex) => pre + tok('M', math.push({ tex, display: false }) - 1)))
        .replace(/(^|[\s(\[;])\[?-?@((?:thm|lem|cor|prp|cnj|def|exm|exr|eq)-[\w-]+)\]?/g, (m, pre, id) => {
          const l = labels[id];
          if (!l) return `${pre}<strong class="am-w-badref">?@${esc(id)}</strong>`;
          return `${pre}<a href="#${id}" class="quarto-xref">${l.type === 'eq' ? `(${l.num})` : `${THM[l.type]}&nbsp;${l.num}`}</a>`;
        })
        .replace(/(!\[[^\]]*\]\([^)]*\))\{[^}]*\}/g, '$1');      // drop Quarto image attributes like {width=50%}
    }
    function footnotes(s) {
      let out = '', i = 0;
      for (let j; (j = s.indexOf('^[', i)) !== -1;) {
        let depth = 0, k = j + 1;
        for (; k < s.length; k++) {
          if (s[k] === '[') depth++;
          else if (s[k] === ']' && --depth === 0) break;
        }
        if (k >= s.length) break;
        out += s.slice(i, j) + tok('F', notes.push(s.slice(j + 2, k)));
        i = k + 1;
      }
      return out + s.slice(i);
    }

    const inline = (s) => marked.parseInline(s);
    const withTitle = (html, title) => (html.startsWith('<p>') ? `<p>${title}${html.slice(3)}` : `<p>${title}</p>${html}`);

    function renderDiv(a, inner) {
      const type = a.id.split('-')[0];
      const callout = a.classes.map((c) => c.match(/^callout-(\w+)$/)?.[1]).find((c) => CALLOUT[c]);
      if (a.classes.includes('hint')) return `<div class="hint"><p class="am-hint-label">Hint</p>${renderBlocks(inner)}</div>`;
      const proofish = ['proof', 'remark', 'solution'].find((c) => a.classes.includes(c));
      let name = a.kv.name || a.kv.title || '';
      if (THM[type] || proofish || callout) {
        const h = inner.match(/^\s*#{1,6}[ \t]+(.+)\n?/);
        if (h) { name = h[1]; inner = inner.slice(h[0].length); }
      }
      const body = renderBlocks(inner);
      if (THM[type] && labels[a.id]) {
        const title = `${THM[type]} ${labels[a.id].num}${name ? ` (${inline(name)})` : ''}`;
        return `<div id="${esc(a.id)}" class="theorem ${THM_CLASS[type]}">${withTitle(body, `<span class="theorem-title"><strong>${title}</strong></span> `)}</div>`;
      }
      if (proofish) {
        const label = name ? inline(name) : proofish[0].toUpperCase() + proofish.slice(1);
        const cls = proofish === 'proof' ? 'proof' : `proof ${proofish}`;
        return `<div class="${cls}">${withTitle(body, `<span class="proof-title"><em>${label}</em>. </span>`)}</div>`;
      }
      if (callout) {
        return `<div class="callout callout-style-default callout-${callout} callout-titled">
          <div class="callout-header d-flex align-content-center"><div class="callout-icon-container"><i class="callout-icon"></i></div>
          <div class="callout-title-container flex-fill">${name ? inline(name) : CALLOUT[callout]}</div></div>
          <div class="callout-body-container callout-body">${body}</div></div>`;
      }
      return `<div${a.id ? ` id="${esc(a.id)}"` : ''} class="${esc(a.classes.join(' '))}">${body}</div>`;
    }

    function renderBlocks(text) {
      const lines = text.split('\n');
      let out = '', buf = [];
      const flush = () => { if (buf.length) out += marked.parse(buf.join('\n')); buf = []; };
      for (let i = 0; i < lines.length;) {
        const open = lines[i].match(FENCE);
        if (!open) { buf.push(lines[i++]); continue; }
        let depth = 1, j = i + 1;
        for (; j < lines.length; j++) {
          if (FENCE.test(lines[j])) depth++;
          else if (/^:{3,}\s*$/.test(lines[j]) && --depth === 0) break;
        }
        flush();
        out += renderDiv(parseAttrs(open[2]), lines.slice(i + 1, j).join('\n'));
        i = j + 1;
      }
      flush();
      return out;
    }

    imageResolver = resolveImg;
    let html = renderBlocks(parts.join(''));
    if (notes.length) {
      html += `<section class="footnotes footnotes-end-of-document"><hr><ol>${notes.map((n, i) => `<li id="am-w-fn${i + 1}">${inline(n)}</li>`).join('')}</ol></section>`;
    }
    return html
      .replace(/<p>\s*AMQS(\d+)QMA\s*<\/p>/g, (m, i) => codes[i])
      .replace(/AMQS(\d+)QMA/g, (m, i) => codes[i])
      .replace(/AMQF(\d+)QMA/g, (m, n) => `<sup><a href="#am-w-fn${n}" class="footnote-ref">${n}</a></sup>`)
      .replace(/AMQM(\d+)QMA/g, (m, i) => renderMath(math[i], labels));
  }

  // Shortcodes: the same HTML theme/shortcodes.lua writes, so the site's script can draw them.
  function shortcode(name, args) {
    const pos = [], kv = {};
    args.replace(/([\w-]+)=(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g, (m, k, vq, v, q, bare) => {
      if (k) kv[k] = vq ?? v; else pos.push(q ?? bare);
    });
    const cap = kv.caption ? `<figcaption>${esc(kv.caption)}</figcaption>` : '';
    const id = String(pos[0] || '').replace(/[^\w]/g, '');
    if (name === 'plot') {
      const params = Object.keys(kv).filter((k) => !['x', 'y', 'caption'].includes(k)).sort().map((k) => `${k}=${kv[k]}`).join(' ');
      return `<figure class="am-plot" data-fn="${esc(pos[0] || '')}" data-x="${esc(kv.x || '')}" data-y="${esc(kv.y || '')}" data-params="${esc(params)}">${cap}</figure>`;
    }
    if (name === 'desmos') return `<figure class="am-embed"><iframe src="https://www.desmos.com/calculator/${id}?embed" title="Desmos graph" loading="lazy"></iframe>${cap}</figure>`;
    if (name === 'geogebra') return `<figure class="am-embed"><iframe src="https://www.geogebra.org/material/iframe/id/${id}" title="GeoGebra applet" loading="lazy"></iframe>${cap}</figure>`;
    return `<p class="am-w-badref">Unknown shortcode “${esc(name)}”</p>`;
  }

  function renderMath(m, labels) {
    let tex = m.tex;
    if (m.id && labels[m.id]) tex += `\\tag{${labels[m.id].num}}`;
    const cls = m.display ? 'math display' : 'math inline';
    if (!window.katex?.renderToString) return `<span class="${cls}">${esc(tex)}</span>`;
    const html = window.katex.renderToString(tex, { displayMode: m.display, throwOnError: false, macros: { ...(window.AM_MACROS || {}) } });
    return `<span class="${cls}"${m.id ? ` id="${esc(m.id)}"` : ''}>${html}</span>`;
  }

  // KaTeX: Quarto only loads it on pages that contain maths, so load the site's copy if it isn't here.
  const katexReady = new Promise((resolve) => {
    if (window.katex) return resolve();
    const tag = document.querySelector('script[src*="katex"]');
    if (tag) return addEventListener('load', resolve);
    const css = document.createElement('link');
    Object.assign(css, { rel: 'stylesheet', href: '/assets/vendor/katex/katex.min.css',
      integrity: 'sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+' });
    const js = document.createElement('script');
    Object.assign(js, { src: '/assets/vendor/katex/katex.min.js', onload: resolve, onerror: resolve,
      integrity: 'sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg' });
    document.head.append(css, js);
  });

  // -------------------------------------------------------------- views
  function show(html) {
    host.innerHTML = html;
    window.scrollTo(0, 0);
  }

  function viewLoading(text) {
    show(`<div class="am-w-center"><p class="am-loading">${esc(text)}</p></div>`);
  }

  const GITHUB_MARK = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
  const savedWho = () => { try { return JSON.parse(local.get(KEY.who)) || savedAuth(); } catch (_) { return savedAuth(); } };

  // `mode` 'key' shows the older key-and-passphrase login even when "Log in with GitHub" is set up.
  function viewGate(error, mode) {
    const auth = savedAuth();
    if (AUTH && mode !== 'key') {
      const who = savedWho();
      show(`<section class="am-w-gate"><div class="am-w-card">
        <p class="am-w-kicker">Write</p>
        <h1>${who?.name ? `Welcome back, ${esc(who.name.split(' ')[0])}` : 'Log in to write'}</h1>
        <p>Sign in with your GitHub account, then write and publish straight to the site. This device stays logged in until you log out.</p>
        <a class="am-button am-w-github" href="${esc(AUTH)}/login">${GITHUB_MARK}Log in with GitHub</a>
        <p class="am-w-error" role="alert"${error ? '' : ' hidden'}>${esc(error || '')}</p>
        <p class="am-w-fine"><button type="button" class="am-w-link" data-act="use-key">${auth ? 'Log in with your passphrase instead' : 'Use a GitHub key instead'}</button></p>
      </div></section>`);
      return;
    }
    const other = AUTH ? '<p class="am-w-fine"><button type="button" class="am-w-link" data-act="use-github">← Log in with GitHub instead</button></p>' : '';
    if (auth) {
      show(`<section class="am-w-gate"><div class="am-w-card">
        <p class="am-w-kicker">Write</p>
        <h1>Welcome back${auth.name ? `, ${esc(auth.name.split(' ')[0])}` : ''}</h1>
        <form class="am-w-form" data-form="unlock">
          <input type="text" name="username" autocomplete="username" value="${esc(auth.login || '')}" hidden>
          <label>Passphrase<input type="password" name="pass" autocomplete="current-password" required autofocus></label>
          <label class="am-w-check"><input type="checkbox" name="stay" checked>Stay logged in on this device</label>
          <button class="am-button" type="submit">Log in</button>
        </form>
        <p class="am-w-error" role="alert"${error ? '' : ' hidden'}>${esc(error || '')}</p>
        <p class="am-w-fine"><button type="button" class="am-w-link" data-act="forget">Forget this device</button> to connect a different token.</p>
        ${other}
      </div></section>`);
      $('[name=pass]').focus();
      return;
    }
    show(`<section class="am-w-gate"><div class="am-w-card am-w-card-wide">
      <p class="am-w-kicker">Write · first time on this device</p>
      <h1>Connect the site to GitHub</h1>
      <p>Posts are saved straight to <a href="https://github.com/${owner}/${repo}">${esc(repo)}</a>, and the site rebuilds itself a minute or two later. To do that, this page needs a key from GitHub.</p>
      <ol class="am-w-steps">
        <li><a class="am-button am-button-ghost" href="${esc(TOKEN_URL)}" target="_blank" rel="noopener">Create a key on GitHub ↗</a>
          <p>Under <b>Repository access</b> choose <i>Only select repositories</i> → <b>${esc(repo)}</b>. Under <b>Permissions</b> set <b>Contents</b> to <i>Read and write</i> and <b>Actions</b> to <i>Read-only</i> (this one only shows build progress). Then press <b>Generate token</b> and copy it.</p></li>
        <li><label>Paste the key<input type="password" name="token" form="am-w-connect" autocomplete="off" spellcheck="false" placeholder="github_pat_…" required></label></li>
        <li><label>Choose a passphrase<input type="password" name="pass" form="am-w-connect" autocomplete="new-password" minlength="6" required></label>
          <label>Type it again<input type="password" name="pass2" form="am-w-connect" autocomplete="new-password" minlength="6" required></label>
          <p>You’ll type this to log in on this device. The key is locked with it and never leaves your browser except to talk to GitHub.</p></li>
      </ol>
      <form id="am-w-connect" class="am-w-form" data-form="connect">
        <input type="text" name="username" autocomplete="username" value="${esc(owner)}" hidden>
        <label class="am-w-check"><input type="checkbox" name="stay" checked>Stay logged in on this device</label>
        <button class="am-button" type="submit">Connect</button>
      </form>
      <p class="am-w-error" role="alert"${error ? '' : ' hidden'}>${esc(error || '')}</p>
      ${other}
    </div></section>`);
  }

  async function connect(form) {
    const f = new FormData(form);
    const err = $('.am-w-error');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    if (f.get('pass') !== f.get('pass2')) return fail('The two passphrases don’t match.');
    token = String(f.get('token')).trim();
    form.querySelector('button').disabled = true;
    try {
      me = await gh('/user');
      await gh(R);
      const sealed = await seal(token, String(f.get('pass')));
      local.set(KEY.auth, JSON.stringify({ v: 1, login: me.login, name: me.name || '', ...sealed }));
      local.set(KEY.who, JSON.stringify({ login: me.login, name: me.name || '' }));
      await startSession({ token }, !!f.get('stay'));
      route();
    } catch (e) {
      token = null;
      form.querySelector('button').disabled = false;
      fail(explain(e));
    }
  }

  async function unlock(form) {
    const auth = savedAuth();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const f = new FormData(form);
    try {
      token = await unseal(auth, String(f.get('pass')));
    } catch (_) {
      return viewGate('That passphrase doesn’t match.', 'key');
    }
    try {
      me = await gh('/user');
      await startSession({ token }, !!f.get('stay'));
      route();
    } catch (e) {
      viewGate(explain(e), 'key');
    }
  }

  // Back from GitHub with #login=… (or #login-error=…) from the login helper.
  async function finishGitHubLogin(fragment) {
    history.replaceState(null, '', location.pathname + location.search);      // the token leaves the address bar at once
    if (fragment.startsWith('login-error=')) return viewGate(decodeURIComponent(fragment.slice(12)));
    viewLoading('Logging in…');
    const t = Object.fromEntries(new URLSearchParams(decodeURIComponent(fragment.slice(6))));
    if (!t.token) return viewGate('GitHub didn’t send a login. Try again.');
    await startSession(fromGitHub(t), true);
    try {
      me = await gh('/user');
      local.set(KEY.who, JSON.stringify({ login: me.login, name: me.name || '' }));
      const can = (await gh(R)).permissions;
      if (can && !can.push) throw Object.assign(new Error(`${me.login} can’t edit ${repo}, so this login can’t publish. Log in with the account that owns the site.`), { status: 0 });
    } catch (e) {
      tab.del(KEY.session); forgetDevice(); token = null; session = null;
      return viewGate(explain(e));
    }
    return true;
  }

  function logout() {
    tab.del(KEY.session);
    forgetDevice();
    token = null; me = null; entries = null; session = null;
    location.hash = '';
    viewGate();
  }

  // ---------------------------------------------------------- home: everything you've written
  const unsent = () => local.keys().filter((k) => k.startsWith(KEY.draft)).map((k) => {
    try { return { key: k, ...JSON.parse(local.get(k)) }; } catch (_) { return null; }
  }).filter(Boolean);

  async function viewHome() {
    viewLoading('Loading your writing…');
    let list;
    try { list = await loadEntries(true); } catch (e) { return showError(e); }
    const drafts = unsent();
    const pending = new Set(drafts.map((d) => d.path).filter(Boolean));
    const item = (e) => `<li><a href="#edit=${encodeURIComponent(e.path)}">
        <span class="am-w-item-title">${e.title ? esc(e.title) : `<i>Note, ${esc(fmtDate(e.date))}</i>`}</span>
        <span class="am-w-item-meta">${e.source ? esc(e.source) + ' · ' : ''}${esc(fmtDate(e.date))}${e.categories.length ? ' · ' + e.categories.map(esc).join(', ') : ''}
          ${e.draft && e.scheduled ? `<span class="am-w-badge am-w-badge-warn">Goes live ${esc(fmtDate(e.date))}</span>` : e.draft ? '<span class="am-w-badge">Draft</span>' : ''}${pending.has(e.path) ? '<span class="am-w-badge am-w-badge-warn">Unsent changes</span>' : ''}</span>
      </a></li>`;
    const of = (k) => list.filter((e) => e.kind === k);
    const NAMES = { post: 'post', note: 'note', problem: 'problem' };
    const fresh = drafts.filter((d) => !d.path);
    show(`<div class="am-w-home">
      <header class="am-w-head">
        <div><p class="am-w-kicker">Write</p><h1>Hello${me?.name ? ', ' + esc(me.name.split(' ')[0]) : ''}</h1>
          <p class="am-w-build" data-build hidden></p></div>
        <div class="am-w-head-actions">
          <a class="am-button" href="#new=post">New post</a>
          <a class="am-button am-button-ghost" href="#new=note">New note</a>
          <a class="am-button am-button-ghost" href="#new=problem">New problem</a>
          <button type="button" class="am-button am-button-ghost" data-act="import" title="Turn a .tex, .md or .qmd file into a new post (or drop one anywhere on this page)">Import a file…</button>
          <input type="file" accept=".tex,.md,.qmd,.markdown,.txt" hidden data-import>
          <button type="button" class="am-w-link" data-act="logout">Log out</button>
        </div>
      </header>
      ${fresh.length ? `<section><h2>Not sent yet</h2><ul class="am-w-list">${fresh.map((d) => `<li><a href="#draft=${encodeURIComponent(d.key.slice(KEY.draft.length))}">
        <span class="am-w-item-title">${esc(d.meta?.title || 'Untitled ' + NAMES[d.kind])}</span>
        <span class="am-w-item-meta">${NAMES[d.kind][0].toUpperCase() + NAMES[d.kind].slice(1)} · saved on this device ${esc(ago(d.savedAt))}</span></a></li>`).join('')}</ul></section>` : ''}
      <section><h2>Posts</h2><ul class="am-w-list">${of('post').map(item).join('') || '<li class="am-w-empty">No posts yet.</li>'}</ul></section>
      <section><h2>Notebook</h2><ul class="am-w-list">${of('note').map(item).join('') || '<li class="am-w-empty">No notes yet.</li>'}</ul></section>
      <section><h2>Problems</h2><ul class="am-w-list">${of('problem').map(item).join('') || '<li class="am-w-empty">No problems yet.</li>'}</ul></section>
    </div>`);
    lastBuild();
  }

  async function lastBuild() {
    const el = $('[data-build]');
    try {
      const run = (await gh(`${R}/actions/runs?branch=${branch}&per_page=1`)).workflow_runs[0];
      if (!run || !el) return;
      const state = run.status !== 'completed' ? '<span class="am-w-dot am-w-dot-busy"></span>Rebuilding the site now'
        : run.conclusion === 'success' ? `<span class="am-w-dot am-w-dot-ok"></span>Site last rebuilt ${esc(ago(run.updated_at))}`
        : `<span class="am-w-dot am-w-dot-bad"></span>The last rebuild failed. <a href="${esc(run.html_url)}" target="_blank" rel="noopener">See why ↗</a>`;
      el.innerHTML = state;
      el.hidden = false;
    } catch (_) { /* the token has no Actions permission: skip it */ }
  }

  function showError(e) {
    if (!token) return viewGate(explain(e));
    show(`<div class="am-w-center"><p class="am-w-error">${esc(explain(e))}</p><p><a class="am-button am-button-ghost" href="#">Try again</a></p></div>`);
  }

  // ---------------------------------------------------------- the editor
  let doc = null;           // what's open: { id, kind, path, sha, isNew, meta, body, images, original, slugTouched }
  let previewTimer = 0, saveTimer = 0;

  async function openEditor(spec) {
    viewLoading('Opening…');
    try { await loadEntries(); } catch (e) { return showError(e); }
    let d;
    if (spec.path) {
      const f = files.find((x) => x.path === spec.path);
      if (!f) return showError(new Error(`${spec.path} isn’t in the repository any more.`));
      const text = await readBlob(f.sha).catch((e) => showError(e));
      if (text == null) return;
      const parsed = splitDoc(text);
      if (parsed.error) return showError(new Error(`Couldn’t read the front matter of ${spec.path}: ${parsed.error}`));
      d = { id: spec.path, kind: kindOf(spec.path), path: spec.path, sha: f.sha, isNew: false, meta: parsed.meta, body: parsed.body };
    } else if (spec.draft) {
      const saved = JSON.parse(local.get(KEY.draft + spec.draft) || 'null');
      if (!saved) { location.hash = ''; return; }
      d = { ...saved, id: spec.draft, isNew: true };
    } else {
      const kind = ['note', 'problem'].includes(spec.kind) ? spec.kind : 'post';
      const meta = { post: { title: '', date: today(), categories: [], draft: true }, note: { date: today(), categories: [] },
        problem: { title: '', date: today(), categories: [], source: '', difficulty: 2 } }[kind];
      const body = kind === 'problem' ? 'State the problem here.\n\n::: {.hint}\nA first nudge.\n:::\n\n::: {.solution}\nThe full solution.\n:::\n' : '';
      d = { id: 'new-' + Date.now().toString(36), kind, path: '', isNew: true, meta, body };
    }
    d.images = new Map();
    d.original = d.isNew ? null : joinDoc(d.meta, d.body);
    doc = d;
    renderEditor();

    // Unsent changes from last time?
    const saved = !d.isNew && JSON.parse(local.get(KEY.draft + d.id) || 'null');
    if (saved && joinDoc(saved.meta, saved.body) !== d.original) {
      const bar = $('[data-restore]');
      bar.hidden = false;
      $('[data-restore-when]').textContent = ago(saved.savedAt);
      bar.addEventListener('click', (e) => {
        const act = e.target.closest('button')?.dataset.restore;
        if (act === 'yes') { doc.meta = saved.meta; doc.body = saved.body; renderEditor(); changed(); }
        if (act === 'no') { local.del(KEY.draft + doc.id); bar.hidden = true; }
      });
    }
  }

  const allCategories = () => [...new Set((entries || []).flatMap((e) => e.categories))].sort();
  const allSeries = () => [...new Set((entries || []).map((e) => e.series).filter(Boolean))].sort();

  function renderEditor() {
    const d = doc, m = d.meta, post = d.kind === 'post', problem = d.kind === 'problem';
    const live = stateOf(d) === 'live';
    const slugged = d.isNew && (post || problem);
    const cats = new Set([].concat(m.categories || []));
    const chips = [...new Set([...allCategories(), ...cats])];
    show(`<div class="am-w-editor${post ? '' : ' am-w-is-note'}">
      <div class="am-w-top">
        <a class="am-w-link" href="#">← All writing</a>
        <span class="am-w-status" aria-live="polite" data-status></span>
        <span class="am-w-top-actions">
          <button type="button" class="am-button am-button-ghost" data-act="draft" title="Save it without putting it on the site"></button>
          <button type="button" class="am-button" data-act="publish"></button>
          <details class="am-w-more"><summary aria-label="More actions">⋯</summary><div>
            ${d.isNew ? '' : `<a href="https://github.com/${owner}/${repo}/blob/${branch}/${esc(d.path)}" target="_blank" rel="noopener">Open on GitHub ↗</a>`}
            ${!live || !LIVE ? '' : `<a href="${esc(liveUrl(d.path))}" target="_blank" rel="noopener">View on the site ↗</a>`}
            ${live ? '<button type="button" data-act="unpublish">Take off the site…</button>' : ''}
            ${d.isNew ? '' : '<button type="button" data-act="history">Earlier versions…</button>'}
            <button type="button" data-act="delete">${d.isNew ? 'Discard' : 'Delete…'}</button>
          </div></details>
        </span>
      </div>
      <p class="am-w-restore" data-restore hidden>You have changes from <span data-restore-when></span> that weren’t sent.
        <button type="button" class="am-w-link" data-restore="yes">Bring them back</button> · <button type="button" class="am-w-link" data-restore="no">Throw them away</button></p>
      <div class="am-w-history" data-history hidden></div>

      <div class="am-w-fields">
        <input class="am-w-title" data-field="title" placeholder="${d.kind === 'note' ? 'Title (optional for notes)' : problem ? 'Problem name' : 'Title'}" value="${esc(m.title || '')}" aria-label="Title">
        ${post ? `<input class="am-w-subtitle" data-field="subtitle" placeholder="Subtitle (optional)" value="${esc(m.subtitle || '')}" aria-label="Subtitle">
        <textarea class="am-w-desc" data-field="description" rows="2" placeholder="One or two sentences for the home page and the archive" aria-label="Description">${esc(m.description || '')}</textarea>` : ''}
        <div class="am-w-row">
          <label title="Pick a future date to have it go live by itself that morning">Date<input type="date" data-field="date" value="${esc(m.date || today())}"></label>
          ${post ? `<label>Series<input data-field="series" list="am-w-series" value="${esc(m.series || '')}" placeholder="none"><datalist id="am-w-series">${allSeries().map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>` : ''}
          ${problem ? `<label>Source<input data-field="source" value="${esc(m.source || '')}" placeholder="IMO 2019 P1, Putnam 2003 A2…"></label>
          <label>Difficulty<select data-field="difficulty">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${+m.difficulty === n ? ' selected' : ''}>${n} · ${['warm-up', 'easy', 'medium', 'hard', 'very hard'][n - 1]}</option>`).join('')}</select></label>` : ''}
          ${slugged ? `<label class="am-w-grow">Address<span class="am-w-addr">/${post ? 'posts' : 'problems'}/<input data-field="slug" value="${esc(d.slug || slugify(m.title || ''))}" spellcheck="false" placeholder="from-the-title">${post ? '/' : '.html'}</span></label>` : ''}
          ${live ? `<label class="am-w-check"><input type="checkbox" data-field="revised"${m['date-modified'] === today() ? ' checked' : ''}>Mark as revised today</label>` : ''}
        </div>
        <div class="am-w-cats" role="group" aria-label="Categories">
          <span class="am-w-cats-label">Categories</span>
          ${chips.map((c) => `<button type="button" class="am-chip${cats.has(c) ? ' active' : ''}" data-cat="${esc(c)}" aria-pressed="${cats.has(c)}">${esc(c)}</button>`).join('')}
          <input data-field="newcat" placeholder="+ new category" aria-label="Add a category">
        </div>
      </div>

      <div class="am-w-tabs" role="tablist"><button type="button" role="tab" data-tab="src" aria-selected="true">Write</button><button type="button" role="tab" data-tab="preview" aria-selected="false">Preview</button></div>
      <div class="am-w-panes" data-show="src">
        <div class="am-w-src">
          <div class="am-w-toolbar" role="toolbar" aria-label="Formatting">
            <button type="button" data-md="bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button type="button" data-md="italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <button type="button" data-md="heading" title="Section heading">H</button>
            <button type="button" data-md="link" title="Link (Ctrl+K)">Link</button>
            <span class="am-w-sep"></span>
            <button type="button" data-md="math" title="Inline maths (Ctrl+M)">$x$</button>
            <button type="button" data-md="display" title="Display maths (Ctrl+Shift+M)">$$</button>
            <select data-md="env" aria-label="Insert a theorem-like block" title="Theorem, lemma, definition…">
              <option value="">Theorem…</option>
              ${Object.entries(THM).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
            <button type="button" data-md="proof" title="Proof">Proof</button>
            <button type="button" data-md="callout" title="Callout box">Box</button>
            <button type="button" data-md="footnote" title="Side note">Note</button>
            ${problem ? '<button type="button" data-md="hint" title="Another hint">Hint</button><button type="button" data-md="solution" title="Solution (starts folded)">Solution</button>' : ''}
            <select data-md="figure" aria-label="Insert an interactive figure" title="Interactive figure">
              <option value="">Figure…</option>
              <option value="plot">Graph with a slider</option>
              <option value="desmos">Desmos graph</option>
              <option value="geogebra">GeoGebra applet</option>
            </select>
            <span class="am-w-sep"></span>
            <button type="button" data-md="image" title="Add a picture (or drop / paste one)">Picture</button>
            <input type="file" accept="image/*" multiple hidden data-file>
          </div>
          <textarea data-field="body" spellcheck="true" placeholder="${post ? 'Start writing. Maths goes between $ signs: $e^{i\\pi} + 1 = 0$.' : problem ? 'The statement, then hints, then the solution.' : 'A quick thought, a neat proof, a problem…'}" aria-label="Text">${esc(d.body)}</textarea>
          <div class="am-w-drop" hidden>Drop pictures, or a .tex or .md file</div>
        </div>
        <article class="am-w-preview" aria-label="Preview">
          <header class="am-w-pv-head"></header>
          <div class="am-w-pv-body"></div>
        </article>
      </div>
      <p class="am-w-hint">Markdown and LaTeX, exactly as in a <code>.qmd</code> file: <code>::: {#thm-name}</code> blocks (a <code>## Name</code> line inside names the theorem), <code>@thm-name</code> references, <code>^[side notes]</code>, and the site’s macros like <code>\\R</code>. Pasted LaTeX (theorems, <code>\\ref</code>, <code>align</code>, lists…) is converted for you. <kbd>Ctrl</kbd>+<kbd>S</kbd> saves.</p>
    </div>`);
    syncSaveButton();
    setStatus(d.isNew ? 'New, not saved yet' : 'Up to date');
    katexReady.then(updatePreview);
  }

  const liveUrl = (path) => LIVE + (isPost(path) ? path.replace(/index\.qmd$/, '') : path.replace(/\.qmd$/, ''));
  const setStatus = (text, cls = '') => { const el = $('[data-status]'); if (el) { el.textContent = text; el.className = 'am-w-status ' + cls; } };
  const isFuture = (iso) => !!iso && iso > today();
  // Where a page stands on GitHub (not counting unsent edits): new, draft, scheduled or live.
  function stateOf(d) {
    if (d.isNew || !d.original) return 'new';
    const fm = d.original.split('\n---')[0];
    return !/^draft: true$/m.test(fm) ? 'live' : /^scheduled: true$/m.test(fm) ? 'scheduled' : 'draft';
  }
  // Two buttons: the main one puts it on the site (or schedules it, for a future date);
  // the other saves it as a draft. A live page only has "Update"; taking it down is in ⋯.
  function syncSaveButton() {
    const state = stateOf(doc), date = $('[data-field=date]').value;
    const scheduledFor = state === 'scheduled' && (doc.original.match(/^date: ['"]?([\d-]+)/m) || [])[1];
    $('[data-act=publish]').textContent = state === 'live' ? 'Update'
      : isFuture(date) ? (scheduledFor === date ? 'Update' : `Schedule for ${fmtDate(date)}`)
      : state === 'scheduled' ? 'Publish now' : 'Publish';
    const draft = $('[data-act=draft]');
    draft.hidden = state === 'live';
    draft.textContent = state === 'scheduled' ? 'Unschedule' : state === 'draft' ? 'Save draft' : 'Save as draft';
  }

  // Read the form back into doc.meta / doc.body. `target` ('live' or 'draft') is
  // where a save is sending it; without one the page keeps its current state.
  function collect(target) {
    const d = doc, m = { ...d.meta };
    const val = (f) => $(`[data-field=${f}]`)?.value.trim();
    m.title = val('title') || undefined;
    if (d.kind === 'post') {
      m.subtitle = val('subtitle') || undefined;
      m.description = val('description') || undefined;
      m.series = val('series') || undefined;
    }
    if (d.kind === 'problem') {
      m.source = val('source') || undefined;
      m.difficulty = +val('difficulty') || undefined;
    }
    m.date = val('date') || today();
    m.categories = $$('.am-w-cats .am-chip.active').map((b) => b.dataset.cat);
    // Publishing with a future date schedules it: kept as a draft until the daily
    // rebuild (scripts/schedule.mjs) sees the date arrive and publishes it.
    if (target) {
      delete m.scheduled;
      if (target === 'draft') m.draft = true;
      else if (isFuture(m.date)) { m.draft = true; m.scheduled = true; }
      else delete m.draft;
    }
    const rev = $('[data-field=revised]');
    if (rev) { if (rev.checked) m['date-modified'] = today(); else if (m['date-modified'] === today()) delete m['date-modified']; }
    d.meta = m;
    d.body = $('[data-field=body]').value;
    if (d.isNew && d.kind !== 'note') d.slug = slugify(val('slug') || '') || slugify(m.title || '');
    return d;
  }

  function autosave() {
    collect();
    const d = doc;
    const text = joinDoc(d.meta, d.body);
    if (!d.isNew && text === d.original) { local.del(KEY.draft + d.id); setStatus('Up to date'); return; }
    if (d.isNew && !d.body.trim() && !d.meta.title) return;
    const ok = local.set(KEY.draft + d.id, JSON.stringify({ kind: d.kind, path: d.isNew ? '' : d.path, meta: d.meta, body: d.body, slug: d.slug, savedAt: new Date().toISOString() }));
    setStatus(ok ? 'Saved on this device · not on the site yet' : 'Not saved anywhere yet', 'am-w-status-warn');
  }

  function updatePreview() {
    if (!doc) return;
    const d = collect();
    const dir = d.kind === 'post' ? (d.isNew ? '' : d.path.replace(/index\.qmd$/, '')) : `${d.kind}s/`;
    const resolveImg = (href) => {
      if (/^([a-z]+:|\/\/|\/)/i.test(href)) return href;
      const local = d.images.get(d.kind === 'post' ? href : href.replace(/^media\//, ''));
      if (local) return local.url;
      return dir ? RAW + dir + href : href;
    };
    const head = $('.am-w-pv-head'), body = $('.am-w-pv-body');
    const title = d.meta.title || (d.kind === 'note' ? `Note, ${fmtDate(d.meta.date)}` : 'Untitled');
    const lvl = +d.meta.difficulty;
    try {
      head.innerHTML = `<h1 class="title">${renderQmd(title, resolveImg).replace(/^<p>|<\/p>\s*$/g, '')}</h1>
        ${d.meta.subtitle ? `<p class="subtitle lead">${renderQmd(d.meta.subtitle, resolveImg).replace(/^<p>|<\/p>\s*$/g, '')}</p>` : ''}
        <p class="am-w-pv-meta">${d.meta.source ? `<span class="am-problem-source">${esc(d.meta.source)}</span>` : ''}
          ${lvl ? `<span class="am-level">${'<i class="on"></i>'.repeat(lvl)}${'<i></i>'.repeat(5 - lvl)}</span>` : ''}
          ${esc(fmtDate(d.meta.date))}${(d.meta.categories || []).map((c) => ` <span class="am-chip">${esc(c)}</span>`).join('')}</p>`;
      body.innerHTML = renderQmd(d.body, resolveImg) || '<p class="am-w-empty">The preview shows up here.</p>';
      window.AM?.renderFigures?.(body);
    } catch (e) {
      body.innerHTML = `<p class="am-w-error">Preview error: ${esc(e.message)}</p>`;
    }
  }

  function changed() {
    clearTimeout(previewTimer);
    clearTimeout(saveTimer);
    previewTimer = setTimeout(updatePreview, 200);
    saveTimer = setTimeout(autosave, 700);
    setStatus('Editing…');
  }

  // ---- toolbar
  function insert(before, after = '', placeholder = '') {
    const ta = $('[data-field=body]');
    ta.focus();
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || placeholder;
    const text = before + sel + after;
    if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, s, e, 'end');
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    changed();
  }
  function insertBlock(text, selectWord) {
    const ta = $('[data-field=body]');
    const { selectionStart: s, value } = ta;
    const lead = s === 0 || value[s - 1] === '\n' ? (value[s - 2] === '\n' || s === 0 ? '' : '\n') : '\n\n';
    const full = lead + text + '\n';
    ta.focus();
    if (!document.execCommand('insertText', false, full)) ta.setRangeText(full, s, ta.selectionEnd, 'end');
    const at = s + lead.length + text.indexOf(selectWord);
    ta.setSelectionRange(at, at + selectWord.length);
    changed();
  }
  const ACTIONS = {
    bold: () => insert('**', '**', 'bold'),
    italic: () => insert('*', '*', 'italic'),
    link: () => insert('[', '](https://)', 'link text'),
    math: () => insert('$', '$', 'x'),
    display: () => insertBlock('$$\nx\n$$', 'x'),
    heading: () => insertBlock('## Heading', 'Heading'),
    proof: () => insertBlock('::: {.proof}\nProof goes here.\n:::', 'Proof goes here.'),
    callout: () => insertBlock('::: {.callout-note}\n## Title\nText.\n:::', 'Title'),
    footnote: () => insert('^[', ']', 'side note'),
    hint: () => insertBlock('::: {.hint}\nA nudge.\n:::', 'A nudge.'),
    solution: () => insertBlock('::: {.solution}\nThe full solution.\n:::', 'The full solution.'),
    image: () => $('[data-file]').click(),
  };
  function env(type) {
    insertBlock(`::: {#${type}-label}\nStatement.\n:::`, 'label');
  }
  const FIGURES = {
    plot: ['{{< plot "sin(a*x)" a=1..4 x=-6..6 >}}', 'sin(a*x)'],
    desmos: ['{{< desmos GRAPH-ID >}}', 'GRAPH-ID'],
    geogebra: ['{{< geogebra APPLET-ID >}}', 'APPLET-ID'],
  };

  // Big photos are scaled to at most 1600 px wide and re-encoded; small images and SVGs are left alone.
  async function shrink(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 300e3) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / bmp.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
      const blob = await new Promise((r) => canvas.toBlob(r, type, 0.85));
      if (!blob || blob.size >= file.size) return file;
      const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg');
      return new File([blob], name, { type });
    } catch (_) {
      return file;
    }
  }

  // ---- pictures
  async function addImages(list) {
    const ta = $('[data-field=body]');
    for (const original of list) {
      if (!original.type.startsWith('image/')) continue;
      const f = await shrink(original);
      const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] || f.type.split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      const base = slugify(f.name.replace(/\.[^.]+$/, '')) || 'picture';
      const generic = /^(image|picture|screenshot|img)(-\d+)?$/.test(base);
      let name = `${generic ? 'picture-' + Date.now().toString(36) : base}.${ext}`;
      const dir = mediaDir(doc);
      for (let n = 2; doc.images.has(name) || (dir && files.some((x) => x.path === dir + name)); n++) name = name.replace(/(-\d+)?\.(\w+)$/, `-${n}.$2`);
      const b64 = toB64(new Uint8Array(await f.arrayBuffer()));
      doc.images.set(name, { b64, url: URL.createObjectURL(f) });
      const mb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
      ta.focus();
      ta.setSelectionRange(ta.selectionEnd, ta.selectionEnd);     // don't turn selected text into the caption
      insert('![', `](${doc.kind === 'post' ? '' : 'media/'}${name})`, 'Describe the picture');
      // Say so after the autosave note has had its turn.
      const note = f !== original ? [`Picture shrunk from ${mb(original.size)} to ${mb(f.size)}`, 'am-w-status-ok']
        : f.size > 3e6 ? [`That picture is ${mb(f.size)}. Smaller files load faster.`, 'am-w-status-warn'] : null;
      if (note) setTimeout(() => setStatus(...note), 900);
    }
  }

  // ---- LaTeX: pasted LaTeX becomes the site's markdown (assets/latex.js). The original
  // goes in first and is then replaced, so Ctrl+Z brings back exactly what was pasted.
  function pasteLatex(tex) {
    const ta = $('[data-field=body]');
    const { meta, body } = AMLatex.convert(tex);
    const s = ta.selectionStart;
    ta.focus();
    const typed = document.execCommand('insertText', false, tex);
    if (typed) { ta.setSelectionRange(s, s + tex.length); document.execCommand('insertText', false, body); }
    else ta.setRangeText(body, s, ta.selectionEnd, 'end');
    fillFrom(meta);
    changed();
    setTimeout(() => setStatus('Converted from LaTeX. Ctrl+Z puts it back as you pasted it.', 'am-w-status-ok'), 900);
  }
  // A title or abstract found in LaTeX fills empty fields.
  function fillFrom(meta) {
    for (const [field, value] of [['title', meta.title], ['description', meta.description]]) {
      const el = $(`[data-field=${field}]`);
      if (!el || !value || el.value.trim()) continue;
      el.value = value;
      if (field === 'title' && doc.isNew && !doc.slugTouched) { const s = $('[data-field=slug]'); if (s) s.value = slugify(value); }
    }
  }
  // A .tex, .md or .qmd file, read into { meta, body }.
  async function readTextFile(file) {
    const text = (await file.text()).replace(/\r\n/g, '\n');
    if (/\.tex$/i.test(file.name) || (!/\.(q?md|markdown|txt)$/i.test(file.name) && AMLatex.looksLike(text))) return AMLatex.convert(text);
    const parsed = splitDoc(text);
    return { meta: parsed.meta, body: parsed.body };
  }
  const isTextFile = (f) => /\.(tex|q?md|markdown|txt)$/i.test(f.name);
  // From the home page: a file becomes a new post, opened in the editor (nothing is sent yet).
  async function importFile(file) {
    if (!isTextFile(file)) return alert('That isn’t a file the editor can open. Try a .tex, .md or .qmd file.');
    let got;
    try { got = await readTextFile(file); } catch (e) { return alert(`Couldn’t read ${file.name}: ${e.message}`); }
    const title = got.meta.title || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    const meta = { ...got.meta, title, date: today(), categories: [].concat(got.meta.categories || []), draft: true };
    delete meta.scheduled;
    const id = 'new-' + Date.now().toString(36);
    local.set(KEY.draft + id, JSON.stringify({ kind: 'post', path: '', meta, body: got.body, slug: slugify(title), savedAt: new Date().toISOString() }));
    location.hash = '#draft=' + encodeURIComponent(id);
  }

  // ---- save to GitHub
  let saving = false;
  async function save(target) {
    if (saving) return;
    // Ctrl+S keeps it where it is: live pages stay live, drafts stay drafts.
    target ||= ['live', 'scheduled'].includes(stateOf(doc)) ? 'live' : 'draft';
    const d = collect(target);
    const post = d.kind === 'post';
    if (d.kind !== 'note' && !d.meta.title) { setStatus(`Give the ${d.kind} a title first`, 'am-w-status-bad'); $('[data-field=title]').focus(); return; }
    if (!d.body.trim()) { setStatus('There’s nothing to save yet', 'am-w-status-bad'); return; }
    if (!d.isNew && joinDoc(d.meta, d.body) === d.original && ![...d.images.values()].some((i) => i.b64)) {
      setStatus('Up to date: nothing has changed', 'am-w-status-ok');
      return;
    }
    saving = true;
    clearTimeout(saveTimer);
    $$('[data-act=publish], [data-act=draft]').forEach((b) => { b.disabled = true; });
    setStatus('Saving to GitHub…');
    try {
      await loadEntries(true);
      let path = d.path;
      if (d.isNew) {
        if (post) {
          if (!d.slug) throw new Error('The address can’t be empty.');
          path = `posts/${d.slug}/index.qmd`;
          if (files.some((f) => f.path.startsWith(`posts/${d.slug}/`))) throw new Error(`There’s already a post at /posts/${d.slug}/. Change the address.`);
        } else if (d.kind === 'problem') {
          if (!d.slug) throw new Error('The address can’t be empty.');
          path = `problems/${d.slug}.qmd`;
          if (files.some((f) => f.path === path)) throw new Error(`There’s already a problem at /problems/${d.slug}. Change the address.`);
        } else {
          const stem = `notes/${d.meta.date}-${slugify(d.meta.title || '') || new Date().toTimeString().slice(0, 5).replace(':', '')}`;
          path = `${stem}.qmd`;
          for (let n = 2; files.some((f) => f.path === path); n++) path = `${stem}-${n}.qmd`;
        }
      } else {
        const now = files.find((f) => f.path === d.path);
        if (now && now.sha !== d.sha && !confirm('This file was changed on GitHub after you opened it (maybe from another device). Save anyway and replace those changes?')) {
          throw new Error('Not saved. Reload the page to get the latest version.');
        }
      }
      const text = joinDoc(d.meta, d.body);
      const dir = mediaDir({ kind: d.kind, path });
      const out = [{ path, text }, ...[...d.images].filter(([, img]) => img.b64).map(([name, img]) => ({ path: dir + name, b64: img.b64 }))];
      const title = d.meta.title || `note from ${d.meta.date}`;
      const verb = d.meta.scheduled ? `Schedule for ${d.meta.date}` : d.isNew ? (d.meta.draft ? 'Draft' : 'Publish') : d.meta.draft ? 'Update draft' : 'Update';
      const { commit, shas } = await commitFiles(`${verb}: ${title}`, out);

      local.del(KEY.draft + d.id);
      const wasNew = d.isNew;
      Object.assign(d, { path, sha: shas[path], isNew: false, id: path, original: text, slug: undefined });
      d.images.forEach((img) => { img.b64 = null; });     // sent: keep showing them from memory
      if (wasNew) history.replaceState(null, '', '#edit=' + encodeURIComponent(path));
      renderEditor();
      setStatus('Saved to GitHub', 'am-w-status-ok');
      track(commit, path, !d.meta.draft, d.meta.scheduled && d.meta.date);
    } catch (e) {
      setStatus(explain(e), 'am-w-status-bad');
    } finally {
      saving = false;
      $$('[data-act=publish], [data-act=draft]').forEach((b) => { b.disabled = false; });
    }
  }

  async function remove() {
    const d = collect();
    if (d.isNew) {
      if (!confirm('Throw this away?')) return;
      local.del(KEY.draft + d.id);
      doc = null;
      location.hash = '';
      return;
    }
    const title = d.meta.title || 'this note';
    if (!confirm(`Delete “${title}”? It disappears from the site after the next rebuild. (It stays in the GitHub history, so it can be recovered.)`)) return;
    try {
      setStatus('Deleting…');
      await loadEntries(true);
      const gone = isPost(d.path) ? files.filter((f) => f.path.startsWith(d.path.replace(/index\.qmd$/, ''))) : files.filter((f) => f.path === d.path);
      const { commit } = await commitFiles(`Delete: ${title}`, gone.map((f) => ({ path: f.path, delete: true })));
      local.del(KEY.draft + d.id);
      doc = null;
      entries = null;
      location.hash = '';
      track(commit, null, false);
    } catch (e) {
      setStatus(explain(e), 'am-w-status-bad');
    }
  }

  // ---- earlier versions, from the repo's history
  async function showHistory() {
    const box = $('[data-history]');
    box.hidden = false;
    box.innerHTML = '<p class="am-loading">Loading the history…</p>';
    try {
      const commits = await gh(`${R}/commits?path=${encodeURIComponent(doc.path)}&sha=${branch}&per_page=30`);
      const when = (iso) => new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      box.innerHTML = `<div class="am-w-history-head"><strong>Earlier versions</strong><button type="button" class="am-w-link" data-act="close-history">Close</button></div>
        <p class="am-w-fine">Pick one to load it into the editor. Nothing changes on the site until you save.</p>
        <ol>${commits.map((c, i) => `<li><button type="button" data-version="${esc(c.sha)}" data-when="${esc(c.commit.author.date)}">
          <span>${esc(c.commit.message.split('\n')[0])}</span>
          <span class="am-w-item-meta">${esc(when(c.commit.author.date))}${i === 0 ? ' · current' : ''}</span></button></li>`).join('')}</ol>`;
    } catch (e) {
      box.innerHTML = `<p class="am-w-error">${esc(explain(e))}</p>`;
    }
  }
  async function loadVersion(sha, when) {
    try {
      const f = await gh(`${R}/contents/${doc.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(sha)}`);
      const parsed = splitDoc(dec.decode(fromB64(f.content)));
      if (parsed.error) throw new Error(parsed.error);
      doc.meta = parsed.meta;
      doc.body = parsed.body;
      renderEditor();
      autosave();
      setStatus(`Showing the version from ${fmtDate(when.slice(0, 10))}. Save to bring it back.`, 'am-w-status-warn');
    } catch (e) {
      setStatus(explain(e), 'am-w-status-bad');
    }
  }

  // ---- follow the rebuild after a save
  let toastRun = 0;
  async function track(sha, path, visible, scheduledFor) {
    const run = ++toastRun;
    let toast = document.querySelector('.am-w-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'am-w-toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }
    const say = (html, cls = '') => {
      if (run !== toastRun) return;
      toast.className = 'am-w-toast ' + cls;
      toast.innerHTML = `${html}<button type="button" class="am-w-toast-x" aria-label="Close">×</button>`;
      toast.querySelector('button').onclick = () => { toastRun++; toast.remove(); };
    };
    say('<span class="am-w-dot am-w-dot-busy"></span>Saved. Waiting for the site to start rebuilding…');
    const started = Date.now();
    while (run === toastRun && Date.now() - started < 10 * 60e3) {
      await sleep(4000);
      let r;
      try { r = (await gh(`${R}/actions/runs?head_sha=${sha}`)).workflow_runs[0]; } catch (e) {
        if (e.status === 403 || e.status === 404) return say('<span class="am-w-dot am-w-dot-ok"></span>Saved. The site updates in a minute or two.', 'am-w-toast-ok');
        continue;
      }
      if (!r) continue;
      if (r.status !== 'completed') {
        say(`<span class="am-w-dot am-w-dot-busy"></span>Rebuilding the site… ${Math.round((Date.now() - new Date(r.run_started_at || r.created_at)) / 1000)} s`);
        continue;
      }
      if (r.conclusion === 'success') {
        const link = path && visible && LIVE ? ` <a href="${esc(liveUrl(path))}" target="_blank" rel="noopener">View it ↗</a>` : '';
        return say(`<span class="am-w-dot am-w-dot-ok"></span>${path ? (scheduledFor ? `Scheduled. It goes live on ${esc(fmtDate(scheduledFor))}.` : visible ? 'Live on the site.' : 'Saved as a draft. It’s hidden on the site.') : 'Deleted from the site.'}${link}`, 'am-w-toast-ok');
      }
      return say(`<span class="am-w-dot am-w-dot-bad"></span>The rebuild failed. <a href="${esc(r.html_url)}" target="_blank" rel="noopener">See why ↗</a>`, 'am-w-toast-bad');
    }
  }

  // -------------------------------------------------------------- events (delegated, so re-rendering is free)
  host.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.dataset.form === 'connect') connect(e.target);
    if (e.target.dataset.form === 'unlock') unlock(e.target);
  });
  host.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-tab]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'forget') {
      if (confirm('Forget the saved key on this device? You’ll need to paste a key again to log in here.')) { local.del(KEY.auth); local.del(KEY.who); logout(); }
    }
    if (act === 'logout') logout();
    if (act === 'use-key') viewGate(null, 'key');
    if (act === 'use-github') viewGate();
    if (act === 'import') $('[data-import]').click();
    if (act === 'publish') save('live');
    if (act === 'draft') save('draft');
    if (act === 'unpublish') {
      t.closest('details').open = false;
      if (confirm('Take this off the site? It stays here as a draft, and you can publish it again any time.')) save('draft');
    }
    if (act === 'delete') { t.closest('details').open = false; remove(); }
    if (act === 'history') { t.closest('details').open = false; showHistory(); }
    if (act === 'close-history') $('[data-history]').hidden = true;
    if (t.dataset.version) loadVersion(t.dataset.version, t.dataset.when);
    if (t.dataset.md && ACTIONS[t.dataset.md]) ACTIONS[t.dataset.md]();
    if (t.dataset.cat) {
      const on = t.classList.toggle('active');
      t.setAttribute('aria-pressed', on);
      changed();
    }
    if (t.dataset.tab) {
      $('.am-w-panes').dataset.show = t.dataset.tab;
      $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b === t));
      if (t.dataset.tab === 'preview') updatePreview();
    }
  });
  host.addEventListener('input', (e) => {
    const f = e.target.dataset.field;
    if (!f || !doc || f === 'newcat') return;
    if (f === 'title' && doc.isNew && doc.kind !== 'note' && !doc.slugTouched) {
      const s = $('[data-field=slug]');
      if (s) s.value = slugify(e.target.value);
    }
    if (f === 'slug') doc.slugTouched = true;
    if (f === 'date') syncSaveButton();
    changed();
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.md === 'env' && t.value) { env(t.value); t.value = ''; }
    if (t.dataset.md === 'figure' && t.value) { const [text, sel] = FIGURES[t.value]; insertBlock(text, sel); t.value = ''; }
    if (t.dataset.file !== undefined && t.files?.length) { addImages([...t.files]); t.value = ''; }
    if (t.dataset.import !== undefined && t.files?.length) { importFile(t.files[0]); t.value = ''; }
    if (t.dataset.field === 'revised') changed();
  });
  host.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.dataset?.field === 'newcat' && e.key === 'Enter') {
      e.preventDefault();
      const name = t.value.trim();
      if (!name) return;
      let chip = $$('.am-w-cats .am-chip').find((c) => c.dataset.cat.toLowerCase() === name.toLowerCase());
      if (!chip) {
        t.insertAdjacentHTML('beforebegin', `<button type="button" class="am-chip" data-cat="${esc(name)}" aria-pressed="false">${esc(name)}</button>`);
        chip = t.previousElementSibling;
      }
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
      t.value = '';
      changed();
      return;
    }
    if (!doc || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); save(); return; }
    if (t.dataset?.field !== 'body') return;
    const map = { b: 'bold', i: 'italic', k: 'link', m: e.shiftKey ? 'display' : 'math' };
    if (map[k]) { e.preventDefault(); ACTIONS[map[k]](); }
  });
  host.addEventListener('paste', (e) => {
    if (e.target.dataset?.field !== 'body') return;
    const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); addImages(imgs); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (text && window.AMLatex?.looksLike(text)) { e.preventDefault(); pasteLatex(text); }
  });
  let dragDepth = 0;
  host.addEventListener('dragenter', (e) => {
    if (!doc || !e.dataTransfer?.types.includes('Files')) return;
    dragDepth++;
    const zone = $('.am-w-drop');
    if (zone) zone.hidden = false;
  });
  host.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; const z = $('.am-w-drop'); if (z) z.hidden = true; } });
  host.addEventListener('dragover', (e) => { if ((doc || $('[data-import]')) && e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  host.addEventListener('drop', async (e) => {
    const list = [...(e.dataTransfer?.files || [])];
    if (!list.length || !(doc || $('[data-import]'))) return;
    e.preventDefault();
    dragDepth = 0;
    const zone = $('.am-w-drop');
    if (zone) zone.hidden = true;
    if (!doc) return importFile(list[0]);              // on the home page: a new post from the file
    // In the editor: pictures are added, and a text file's contents go in at the cursor.
    for (const f of list.filter(isTextFile)) {
      try {
        const got = await readTextFile(f);
        insert(got.body.replace(/\s+$/, '') + '\n');
        fillFrom(got.meta);
      } catch (err) { setStatus(`Couldn’t read ${f.name}: ${err.message}`, 'am-w-status-bad'); }
    }
    addImages(list.filter((f) => !isTextFile(f)));
  });
  // Keep the preview roughly level with the text being written.
  host.addEventListener('scroll', (e) => {
    if (e.target.dataset?.field !== 'body') return;
    const ta = e.target, pv = $('.am-w-preview');
    const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  }, true);
  addEventListener('beforeunload', (e) => {
    if (doc && [...doc.images.values()].some((i) => i.b64)) { e.preventDefault(); e.returnValue = ''; }
  });

  // -------------------------------------------------------------- routing: #new=post, #new=note, #edit=<path>, #draft=<id>
  async function route() {
    if (!window.marked || !window.jsyaml || !window.crypto?.subtle) {
      return show('<div class="am-w-center"><p class="am-w-error">The editor couldn’t load. It needs a modern browser and an https:// address.</p></div>');
    }
    if (/^#login(-error)?=/.test(location.hash) && (await finishGitHubLogin(location.hash.slice(1))) !== true) return;
    if (!token) {
      session = parseSession(tab.get(KEY.session));
      token = session?.token || null;
    }
    if (!token && local.get(KEY.remember)) {
      viewLoading('Logging in…');
      session = parseSession(await recall());
      token = session?.token || null;
      if (token) tab.set(KEY.session, JSON.stringify(session));
    }
    if (!token) return viewGate();
    if (!me) {
      try { me = await gh('/user'); } catch (e) { return viewGate(explain(e)); }
    }
    const h = decodeURIComponent(location.hash.slice(1));
    const [key, val] = [h.split('=')[0], h.slice(h.indexOf('=') + 1)];
    if (doc && [...doc.images.values()].some((i) => i.b64) && !(key === 'edit' && val === doc.path)) {
      if (!confirm('You have pictures that haven’t been saved yet. Leave anyway?')) return;
    }
    if (key === 'edit' && doc && doc.path === val) return;      // just saved: already open
    doc = null;
    if (key === 'new') return openEditor({ kind: val });
    if (key === 'edit' && val) return openEditor({ path: val });
    if (key === 'draft' && val) return openEditor({ draft: val });
    return viewHome();
  }
  addEventListener('hashchange', route);
  route();
})();
