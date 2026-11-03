// LaTeX → the site's markdown, for the Write page (assets/write.js): paste a chunk
// of a .tex file, or import a whole one, and it becomes a post. Handles what papers
// and notes mostly use: sections, theorem-like environments with labels and \ref,
// proofs, lists, footnotes, emphasis, links and display maths. Anything it doesn't
// know is left as it was, so nothing is lost.
window.AMLatex = (() => {
  // Environment name → Quarto cross-reference prefix.
  const THM = {
    theorem: 'thm', thm: 'thm', lemma: 'lem', lem: 'lem', corollary: 'cor', cor: 'cor',
    proposition: 'prp', prop: 'prp', conjecture: 'cnj', conj: 'cnj',
    definition: 'def', defn: 'def', def: 'def', example: 'exm', ex: 'exm', exercise: 'exr',
  };
  const CALLOUT = { remark: 'Remark', rem: 'Remark', note: 'Note', claim: 'Claim', observation: 'Observation', fact: 'Fact' };
  const DISPLAY = { equation: '', 'equation*': '', displaymath: '', align: 'aligned', 'align*': 'aligned', alignat: 'alignedat', 'alignat*': 'alignedat',
    gather: 'gathered', 'gather*': 'gathered', multline: '', 'multline*': '', flalign: 'aligned', 'flalign*': 'aligned', eqnarray: 'aligned', 'eqnarray*': 'aligned' };

  // Does this text look like LaTeX source rather than markdown?
  const looksLike = (s) => /\\(begin|section|subsection|emph|textbf|textit|item|label|eqref|cite|maketitle)\b|\\\[|\\\(/.test(s)
    && !/^\s*:::|^#{1,6}\s/m.test(s);

  // The {…} argument starting at s[i] (which must be "{"): [content, index after "}"].
  function group(s, i) {
    if (s[i] !== '{') return null;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
    }
    return null;
  }
  // An optional [...] argument at s[i]: [content, index after "]"], or [null, i].
  function optional(s, i) {
    while (s[i] === ' ' || s[i] === '\n') i++;
    if (s[i] !== '[') return [null, i];
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') depth--;
      else if (s[j] === ']' && depth === 0) return [s.slice(i + 1, j), j + 1];
    }
    return [null, i];
  }
  // Replace \name[opt]{a}{b}… everywhere with fn(args, opt). `name` is a regex fragment.
  function command(s, name, nargs, fn) {
    const re = new RegExp('\\\\' + name + '(?![a-zA-Z])', 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(s))) {
      let i = m.index + m[0].length;
      const [opt, k] = optional(s, i);
      i = k;
      const args = [];
      for (let n = 0; n < nargs; n++) {
        while (s[i] === ' ') i++;
        const g = group(s, i);
        if (!g) break;
        args.push(g[0]);
        i = g[1];
      }
      if (args.length < nargs) continue;
      out += s.slice(last, m.index) + fn(args, opt);
      last = re.lastIndex = i;
    }
    return out + s.slice(last);
  }
  // Each \begin{name}[opt] … \end{name}, innermost first so nesting works.
  function environments(s, names, fn) {
    const re = new RegExp(`\\\\begin\\{(${names.map((n) => n.replace('*', '\\*')).join('|')})\\}`, 'g');
    for (let guard = 0; guard < 500; guard++) {
      const starts = [...s.matchAll(re)];
      if (!starts.length) break;
      let done = false;
      for (let k = starts.length - 1; k >= 0 && !done; k--) {
        const m = starts[k], name = m[1];
        const end = s.indexOf(`\\end{${name}}`, m.index);
        if (end < 0) continue;
        const [opt, bodyStart] = optional(s, m.index + m[0].length);
        const body = s.slice(bodyStart, end);
        if (re.test(body)) { re.lastIndex = 0; continue; }      // has a nested one: do that first
        re.lastIndex = 0;
        s = s.slice(0, m.index) + fn(name, body, opt) + s.slice(end + name.length + 6);
        done = true;
      }
      if (!done) break;
    }
    return s;
  }
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const fixLabel = (l) => l.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '');

  function convert(src) {
    let s = src.replace(/\r\n?/g, '\n');
    const meta = {};
    // Comments (but not \%).
    s = s.replace(/(^|[^\\])%.*$/gm, '$1');
    // A whole file: take the title and keep only the document body.
    const pre = s.split('\\begin{document}');
    if (pre.length > 1) {
      const head = pre[0];
      command(head, 'title', 1, ([t]) => { meta.title = t.replace(/\\\\/g, ' ').replace(/\s+/g, ' ').trim(); return ''; });
      s = pre[1].split('\\end{document}')[0];
    }
    command(s, 'title', 1, ([t]) => { meta.title ??= t.replace(/\s+/g, ' ').trim(); return ''; });
    s = s.replace(/\\(maketitle|tableofcontents|noindent|newpage|clearpage|centering|smallskip|medskip|bigskip|qed|qedhere)(?![a-zA-Z])\s*/g, '');
    s = command(s, '(?:title|author|date|thanks|bibliographystyle|bibliography|vspace\\*?|hspace\\*?)', 1, () => '');
    s = command(s, '(?:setlength|addtocounter|setcounter)', 2, () => '');
    let abstract = '';
    s = environments(s, ['abstract'], (_, body) => { abstract = body.trim(); return ''; });
    if (abstract && abstract.length < 400) meta.description = abstract.replace(/\s+/g, ' ');

    // Labels: collect them first so \ref can point to the right Quarto id.
    const ids = new Map();
    let n = 0;

    // Display maths → $$ … $$ {#eq-…}. Pulled out so nothing below touches maths.
    const math = [];
    const keep = (m) => `\u0000${math.push(m) - 1}\u0000`;
    s = environments(s, Object.keys(DISPLAY), (name, body) => {
      let label = '';
      body = body.replace(/\\label\{([^}]*)\}/g, (_, l) => { label ||= l; return ''; }).replace(/\\(nonumber|notag)\b/g, '');
      const inner = DISPLAY[name];
      const arg = name.startsWith('alignat') ? (body.match(/^\s*\{(\d+)\}/) || [])[0] || '' : '';
      if (arg) body = body.slice(body.indexOf(arg) + arg.length);
      body = body.trim();
      const tex = inner ? `\\begin{${inner}}${arg.trim()}\n${body}\n\\end{${inner}}` : body;
      let id = '';
      if (label) { id = 'eq-' + fixLabel(label.replace(/^eq(n|uation)?[:._-]/i, '')); ids.set(label, id); }
      return '\n\n' + keep(`$$\n${tex}\n$$${id ? ` {#${id}}` : ''}`) + '\n\n';
    });
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, b) => '\n\n' + keep(`$$\n${b.trim()}\n$$`) + '\n\n');
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, b) => '\n\n' + keep(`$$\n${b.trim()}\n$$`) + '\n\n');
    s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, b) => keep(`$${b.trim()}$`));
    s = s.replace(/(^|[^\\])\$([^$]+?)\$/g, (_, p, b) => p + keep(`$${b}$`));

    // Theorem-like environments → ::: {#thm-…} with a "## Name" line.
    s = environments(s, [...Object.keys(THM), ...Object.keys(CALLOUT), 'proof'], (name, body, opt) => {
      let label = '';
      body = body.replace(/\\label\{([^}]*)\}/g, (_, l) => { label ||= l; return ''; }).trim();
      if (name === 'proof') return `\n\n::: {.proof}\n${body}\n:::\n\n`;
      if (CALLOUT[name]) return `\n\n::: {.callout-note}\n## ${opt || CALLOUT[name]}\n${body}\n:::\n\n`;
      const type = THM[name];
      const id = `${type}-${label ? fixLabel(label.replace(/^[a-z]+[:._-]/i, '')) : slug(opt || '') || ++n}`;
      if (label) ids.set(label, id);
      return `\n\n::: {#${id}}\n${opt ? `## ${opt}\n` : ''}${body}\n:::\n\n`;
    });

    // Sections. A labelled section gets an id so \ref to it still works.
    const heading = (hashes) => ([t]) => `\n\n${hashes} ${t.trim()}\n\n`;
    for (const [cmd, h] of [['section', '##'], ['subsection', '###'], ['subsubsection', '####']]) {
      s = command(s, cmd + '\\*?', 1, heading(h));
    }
    // (\ref to a section becomes a link with the section's name: the site doesn't number sections.)
    const sections = new Map();
    s = s.replace(/^(#{2,4}) (.*)\n+\\label\{([^}]*)\}/gm, (_, h, t, l) => {
      const id = 'sec-' + fixLabel(l.replace(/^sec(tion)?[:._-]/i, ''));
      sections.set(l, [t, id]);
      return `${h} ${t} {#${id}}`;
    });
    s = command(s, 'paragraph\\*?', 1, ([t]) => `\n\n**${t.trim()}** `);
    s = s.replace(/\\label\{[^}]*\}/g, '');

    // References.
    const ref = (l) => (ids.has(l) ? '@' + ids.get(l) : sections.has(l) ? `[${sections.get(l)[0]}](#${sections.get(l)[1]})` : `[${l}]`);
    s = command(s, '(?:eqref|ref|cref|Cref|autoref)', 1, ([l]) => l.split(',').map((x) => ref(x.trim())).join(', '));
    s = s.replace(/(Theorem|Lemma|Corollary|Proposition|Definition|Example|Exercise|Conjecture|Equation|Eq\.|Thm\.|Lem\.)[~\s]+(@[\w-]+)/g, '$2')
      .replace(/(Section|Sec\.|§)[~\s]*(\[[^\]]+\]\(#sec-)/g, '$2');
    s = command(s, '(?:cite|citep|citet)', 1, ([k], opt) => `[${k}${opt ? ', ' + opt : ''}]`);

    // Lists, innermost first.
    s = environments(s, ['itemize', 'enumerate', 'description'], (name, body) => {
      const items = body.split(/\\item(?![a-zA-Z])/).slice(1);
      return '\n\n' + items.map((it, i) => {
        let [opt, k] = optional(it, 0);
        let text = (opt != null ? it.slice(k) : it).trim().replace(/\n{2,}/g, '\n\n');
        const mark = name === 'enumerate' ? `${i + 1}. ` : '- ';
        if (name === 'description' && opt != null) text = `**${opt}** ${text}`;
        return mark + text.replace(/\n/g, '\n' + ' '.repeat(mark.length));
      }).join('\n') + '\n\n';
    });
    s = environments(s, ['center', 'flushleft', 'flushright', 'quote', 'quotation'], (name, body) =>
      (name.startsWith('quot') ? '\n\n' + body.trim().split('\n').map((l) => '> ' + l).join('\n') + '\n\n' : body));
    s = environments(s, ['figure', 'figure*'], (_, body) => {
      const img = body.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/);
      const at = body.indexOf('\\caption');
      const cap = at >= 0 ? group(body, body.indexOf('{', at)) : null;
      return img ? `\n\n![${cap ? cap[0].trim() : ''}](${img[1]})\n\n` : body;
    });

    // Inline formatting.
    s = command(s, 'footnote', 1, ([t]) => `^[${t.trim()}]`);
    s = command(s, '(?:emph|textit|textsl)', 1, ([t]) => `*${t}*`);
    s = command(s, 'textbf', 1, ([t]) => `**${t}**`);
    s = command(s, 'texttt', 1, ([t]) => '`' + t + '`');
    s = command(s, 'textsc', 1, ([t]) => `[${t}]{.smallcaps}`);
    s = command(s, '(?:underline|text|textrm|textup|mbox)', 1, ([t]) => t);
    s = command(s, 'href', 2, ([u, t]) => `[${t}](${u})`);
    s = command(s, 'url', 1, ([u]) => `<${u}>`);
    s = s.replace(/\{\\(?:em|it) ([^{}]*)\}/g, '*$1*').replace(/\{\\bf ([^{}]*)\}/g, '**$1**');

    // Characters.
    s = s.replace(/``/g, '“').replace(/''/g, '”').replace(/(^|[\s(])`/g, '$1‘').replace(/(\w)'(\w)/g, '$1’$2')
      .replace(/\\%/g, '%').replace(/\\&/g, '&').replace(/\\#/g, '#')
      .replace(/(?<!\\)~/g, ' ').replace(/\\ldots\b|\\dots\b/g, '…').replace(/\\(,|;|:|!)/g, ' ')
      .replace(/\\\\\s*$/gm, '').replace(/\\@/g, '');

    // Tidy whitespace, then put the maths back.
    // (Leading spaces go too, or indented source lines would turn into code blocks;
    // nested list items keep theirs.)
    s = s.split('\n').map((l) => l.replace(/[ \t]+$/, '').replace(/^[ \t]+(?=[^\s\-\d>*])/, '')).join('\n')
      .replace(/\n{3,}/g, '\n\n').trim();
    s = s.replace(/\u0000(\d+)\u0000/g, (_, k) => math[+k]);
    return { meta, body: s + '\n' };
  }

  return { looksLike, convert };
})();
