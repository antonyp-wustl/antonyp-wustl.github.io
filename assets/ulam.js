// Ulam spiral hero: integers laid out on a square spiral from the centre,
// primes drawn as squares. Hover (or tap) any cell to factor its number.
(() => {
  const hero = document.querySelector('.ulam-hero');
  if (!hero) return;
  const canvas = hero.querySelector('canvas');
  const cursor = hero.querySelector('.ulam-cursor');
  const readout = hero.querySelector('.ulam-readout');
  const ctx = canvas.getContext('2d');

  const CELL = 7;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w, h, cols, rows, offX, offY, grid, order, composite, raf;
  let lastW = 0, lastH = 0, hasAnimated = false;
  let PRIME, OTHER;

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    PRIME = css.getPropertyValue('--am-accent').trim() || '#f2b134';
    OTHER = css.getPropertyValue('--am-dot').trim() || 'rgba(233, 228, 214, 0.12)';
  }

  function sieve(n) {
    const c = new Uint8Array(n + 1);
    c[0] = c[1] = 1;
    for (let i = 2; i * i <= n; i++)
      if (!c[i]) for (let j = i * i; j <= n; j += i) c[j] = 1;
    return c;
  }

  function build() {
    w = hero.clientWidth;
    h = hero.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(w / CELL) | 1;   // odd, so 1 sits in the exact centre
    rows = Math.ceil(h / CELL) | 1;
    offX = (w - cols * CELL) / 2;
    offY = (h - rows * CELL) / 2;
    const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    const side = Math.max(cols, rows);
    const N = side * side;

    composite = sieve(N);
    grid = new Int32Array(cols * rows);
    order = [];

    const place = (n, x, y) => {
      const c = cx + x, r = cy + y;
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        grid[r * cols + c] = n;
        order.push(n, c, r);
      }
    };

    // Walk the square spiral: right, up, left, down, with run lengths 1,1,2,2,3,3,...
    const dirs = [[1, 0], [0, -1], [-1, 0], [0, 1]];
    let x = 0, y = 0, n = 1, len = 1, d = 0;
    place(1, 0, 0);
    while (n < N) {
      for (let k = 0; k < 2 && n < N; k++) {
        const [dx, dy] = dirs[d];
        for (let s = 0; s < len && n < N; s++) {
          x += dx; y += dy;
          place(++n, x, y);
        }
        d = (d + 1) % 4;
      }
      len++;
    }
  }

  function drawCell(i) {
    const n = order[i];
    const px = offX + order[i + 1] * CELL;
    const py = offY + order[i + 2] * CELL;
    if (!composite[n]) {
      ctx.fillStyle = PRIME;
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    } else {
      ctx.fillStyle = OTHER;
      ctx.fillRect(px + CELL / 2 - 1, py + CELL / 2 - 1, 2, 2);
    }
  }

  function render(animate) {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, w, h);
    const total = order.length;
    if (!animate) {
      for (let i = 0; i < total; i += 3) drawCell(i);
      return;
    }
    const start = performance.now(), DURATION = 2400;
    let i = 0;
    const frame = (t) => {
      const p = Math.min(1, (t - start) / DURATION);
      const target = Math.floor((p * p * total) / 3) * 3;  // p² keeps the radius growing steadily
      for (; i < target; i += 3) drawCell(i);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function describe(n) {
    if (n === 1) return '1 is a unit';
    if (!composite[n]) return `${n} is prime`;
    const parts = [];
    let m = n;
    for (let p = 2; p * p <= m; p++) {
      let e = 0;
      while (m % p === 0) { m /= p; e++; }
      if (e) parts.push(e > 1 ? `${p}<sup>${e}</sup>` : `${p}`);
    }
    if (m > 1) parts.push(`${m}`);
    return `${n} = ${parts.join(' · ')}`;
  }

  function inspect(e) {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left - offX) / CELL);
    const r = Math.floor((e.clientY - rect.top - offY) / CELL);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return hide();
    readout.innerHTML = describe(grid[r * cols + c]);
    cursor.style.transform = `translate(${offX + c * CELL}px, ${offY + r * CELL}px)`;
    hero.classList.add('inspecting');
  }
  const hide = () => hero.classList.remove('inspecting');

  canvas.addEventListener('pointermove', inspect);
  canvas.addEventListener('pointerdown', inspect);
  canvas.addEventListener('pointerleave', hide);

  // Redraw in the new palette when the light/dark toggle flips the body class.
  let dark = document.body.classList.contains('quarto-dark');
  new MutationObserver(() => {
    const nowDark = document.body.classList.contains('quarto-dark');
    if (nowDark === dark) return;
    dark = nowDark;
    readColors();
    render(false);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  new ResizeObserver(() => {
    if (hero.clientWidth === lastW && hero.clientHeight === lastH) return;
    lastW = hero.clientWidth;
    lastH = hero.clientHeight;
    readColors();
    build();
    render(!hasAnimated && !reduceMotion);   // animate once on load, redraw instantly on resize
    hasAnimated = true;
  }).observe(hero);
})();
