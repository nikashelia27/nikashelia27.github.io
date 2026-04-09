about({
  title: 'Cyclic Cellular Automaton',
  text: 'Cells cycle through discrete states, switching to the next state when enough neighbors already have it. This simple rule generates traveling waves and spiral patterns.'
});

params({
  wrapEdges:  { label: 'Wrap edges', type: 'checkbox', value: true },
  cellSize:   { label: 'Cell size', type: 'range', min: 1,  max: 12,  value: 3,  reinit: true },
  states:     { label: 'States', type: 'range', min: 3,  max: 40,  value: 6, reinit: true },
  threshold:  { label: 'Threshold', type: 'range', min: 1,  max: 8,   value: 2  },
  neighbors:  { label: 'Neighborhood 0=Moore 1=Von Neumann', type: 'range', min: 0, max: 1, value: 0 },
  mutation:   { label: 'Mutation x1000', type: 'range', min: 0, max: 20, value: 1 },
  hue:        { label: 'Hue', type: 'range', min: 0,  max: 360, value: 220 },
  hueSpread:  { label: 'Hue spread', type: 'range', min: 10, max: 360, value: 140 },
  saturation: { label: 'Saturation', type: 'range', min: 0,  max: 100, value: 90 },
  brightness: { label: 'Brightness', type: 'range', min: 10, max: 100, value: 85 },
});

function ccaHsl(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hr = t => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hr(h + 1 / 3) * 255),
    Math.round(hr(h) * 255),
    Math.round(hr(h - 1 / 3) * 255)
  ];
}

define('cca', {

  init(world) {
    const cs   = world.params.cellSize;
    const cols = Math.floor(world.W / cs);
    const rows = Math.floor(world.H / cs);
    const N    = Math.round(world.params.states);
    const n    = cols * rows;

    const cells   = new Uint8Array(new SharedArrayBuffer(n));
    const next    = new Uint8Array(new SharedArrayBuffer(n));
    const changed = new Uint8Array(new SharedArrayBuffer(n));
    const rgbaBuf = new Uint8Array(n * 4);
    cells.fill(0);
    const seedCount = Math.max(12, Math.floor((cols * rows) / 900));
    for (let k = 0; k < seedCount; k++) {
      const cx  = (Math.random() * cols) | 0;
      const cy  = (Math.random() * rows) | 0;
      const rad = 4 + ((Math.random() * Math.max(6, Math.min(cols, rows) * 0.08)) | 0);
      const val = (Math.random() * N) | 0;
      for (let y = Math.max(0, cy - rad); y < Math.min(rows, cy + rad + 1); y++) {
        for (let x = Math.max(0, cx - rad); x < Math.min(cols, cx + rad + 1); x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= rad * rad) {
            cells[y * cols + x] = val;
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.04) cells[i] = (Math.random() * N) | 0;
    }

    return [{ x: 0, y: 0, state: { cells, next, changed, rgbaBuf, cols, rows, cs, N } }];
  },

  sensing() { return null; },

  response(state, sensed, thing, all, world) {
    const { cells, next, changed, cols, rows, N } = state;

    const threshold = world.params.threshold;
    const moore     = world.params.neighbors < 0.5;
    const wrap      = !!world.params.wrapEdges;
    const mutation  = world.params.mutation / 100000;

    const rowStart  = world.rowStart !== undefined ? world.rowStart : 0;
    const rowEnd    = world.rowEnd   !== undefined ? world.rowEnd   : rows;

    const at = (x, y) => {
      if (wrap) {
        x = (x + cols) % cols;
        y = (y + rows) % rows;
        return cells[y * cols + x];
      }
      if (x < 0 || x >= cols || y < 0 || y >= rows) return -1;
      return cells[y * cols + x];
    };
    for (let y = rowStart; y < rowEnd; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const s = cells[i];
        const successor = (s + 1) % N;
        let score = 0;
        if (at(x, y - 1) === successor) score += 1.0;
        if (at(x, y + 1) === successor) score += 1.0;
        if (at(x - 1, y) === successor) score += 1.0;
        if (at(x + 1, y) === successor) score += 1.0;
        if (moore) {
          if (at(x - 1, y - 1) === successor) score += 0.6;
          if (at(x + 1, y - 1) === successor) score += 0.6;
          if (at(x - 1, y + 1) === successor) score += 0.6;
          if (at(x + 1, y + 1) === successor) score += 0.6;
        }
        let ns = score >= threshold ? successor : s;
        if (mutation > 0 && Math.random() < mutation) {
          ns = (Math.random() * N) | 0;
        }
        next[i] = ns;
        changed[i] = ns !== s ? 1 : 0;
      }
    }
    if (world.rowStart === undefined) cells.set(next);
    return state;
  },
  postTick(state) {
    state.cells.set(state.next);
  },

  renderGL(glCtx, things, world) {
    const { cells, changed, cols, rows, N, rgbaBuf } = things[0].state;
    const hue  = world.params.hue;
    const hs   = world.params.hueSpread;
    const sat  = world.params.saturation / 100;
    const bri  = world.params.brightness / 100;
    const n    = cols * rows;

    for (let i = 0; i < n; i++) {
      const t = N > 1 ? cells[i] / (N - 1) : 0;
      const h = ((hue + t * hs) % 360 + 360) % 360;
      const activity = changed[i];
      const sat2 = activity ? Math.min(1, sat * 1.15) : sat * 0.55;
      const light = activity
        ? Math.min(1, bri * (0.78 + 0.18 * t))
        : Math.max(0.08, bri * (0.18 + 0.20 * t));
      const [r, g, b] = ccaHsl(h / 360, sat2, light);
      const base = i * 4;
      rgbaBuf[base]     = r;
      rgbaBuf[base + 1] = g;
      rgbaBuf[base + 2] = b;
      rgbaBuf[base + 3] = 255;
    }
    glCtx.uploadRGBA(rgbaBuf, cols, rows);
  },
  render(ctx, thing, world) {
    const { cells, changed, cols, rows, cs, N } = thing.state;
    const hue = world.params.hue;
    const hs  = world.params.hueSpread;
    const sat = world.params.saturation / 100;
    const bri = world.params.brightness / 100;
    const W   = ctx.canvas.width;
    const H   = ctx.canvas.height;
    const img = ctx.createImageData(W, H);
    const d   = img.data;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const t = N > 1 ? cells[i] / (N - 1) : 0;
        const h = ((hue + t * hs) % 360 + 360) % 360;
        const activity = changed[i];
        const sat2 = activity ? Math.min(1, sat * 1.15) : sat * 0.55;
        const light = activity
          ? Math.min(1, bri * (0.78 + 0.18 * t))
          : Math.max(0.08, bri * (0.18 + 0.20 * t));
        const [r, g, b] = ccaHsl(h / 360, sat2, light);
        const px = x * cs;
        const py = y * cs;
        for (let row = 0; row < cs && py + row < H; row++) {
          const base = ((py + row) * W + px) * 4;
          for (let col = 0; col < cs && px + col < W; col++) {
            const idx = base + col * 4;
            d[idx]     = r;
            d[idx + 1] = g;
            d[idx + 2] = b;
            d[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(img, 0, 0);
  }

});
