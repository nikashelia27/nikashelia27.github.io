about({
  title: 'Lenia',
  text: 'A continuous cellular automaton where smooth fields evolve through convolution and growth functions, producing lifelike, self-organizing patterns that resemble artificial life.'
});
// This one is kind of wonky, I haven't imported well-known self-sustaining lenia lifeforms yet, maybe I will in the future.
params({
  wrapEdges:     { label: 'Wrap edges',    type: 'checkbox', value: true },
  cellSize:      { label: 'Cell size (px)', type: 'range', min: 5, max: 8, value: 5, reinit: true },
  R:             { label: 'Kernel radius',  type: 'range', min: 5, max: 30, value: 20, reinit: true },
  deterministic: { label: 'Deterministic', type: 'checkbox', value: true, reinit: true },
  seed:          { label: 'Seed',           type: 'range', min: 1, max: 10, value: 2, reinit: true },
  mu:            { label: 'mu',             type: 'range', min: 0.05, max: 0.5,  value: 0.1, step: 0.005 },
  sigma:         { label: 'sigma',          type: 'range', min: 0.001, max: 0.05, value: 0.01, step: 0.001 },
  dt:            { label: 'dt',             type: 'range', min: 0.01, max: 0.5,  value: 0.03, step: 0.01 },
  hue:           { label: 'Hue',            type: 'range', min: 0, max: 360, value: 306 },
});

define('lenia', {

  init(world) {
    const cs   = world.params.cellSize;
    const cols = nextPow2(Math.floor(world.W / cs));
    const rows = nextPow2(Math.floor(world.H / cs));
    const n    = cols * rows;

    const cells   = new Float32Array(n);
    const next    = new Float32Array(n);
    const vel     = new Float32Array(n);
    const rgbaBuf = new Uint8Array(n * 4);

    const re1 = new Float32Array(n);
    const im1 = new Float32Array(n);
    const re2 = new Float32Array(n);
    const im2 = new Float32Array(n);

    const twR = makeTwiddles(rows);
    const twC = makeTwiddles(cols);

    const kr = new Float32Array(n);
    const ki = new Float32Array(n);
    const R  = Math.round(world.params.R);
    let ksum = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx  = x < cols / 2 ? x : x - cols;
        const cy  = y < rows / 2 ? y : y - rows;
        const d   = Math.sqrt(cx * cx + cy * cy) / R;
        if (d > 1 || d === 0) continue;
        const w = Math.exp(1 - 1 / (4 * d * (1 - d) + 1e-6));
        const ring = (d >= 0.25 && d <= 0.75) ? w : 0;
        kr[y * cols + x] = ring;
        ksum += ring;
      }
    }
    if (ksum > 0) for (let i = 0; i < n; i++) kr[i] /= ksum;

    fft2d(kr, ki, cols, rows, twR, twC, false);

    let rng;
    if (world.params.deterministic) {
      let s = (Math.round(world.params.seed) * 1327217885) >>> 0;
      rng = () => {
        s += 0x6D2B79F5;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    } else {
      rng = Math.random;
    }

    const cx0 = (cols / 2) | 0;
    const cy0 = (rows / 2) | 0;
    const br0 = Math.min(cols, rows) * 0.08;
    for (let b = 0; b < 4; b++) {
      const bx = cx0 + (((rng() - 0.5) * cols * 0.3) | 0);
      const by = cy0 + (((rng() - 0.5) * rows * 0.3) | 0);
      const br = br0 * (0.5 + rng() * 0.5);
      for (let y = (by - br) | 0; y <= (by + br) | 0; y++) {
        for (let x = (bx - br) | 0; x <= (bx + br) | 0; x++) {
          if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
          const dx = x - bx, dy = y - by;
          if (dx * dx + dy * dy <= br * br)
            cells[y * cols + x] = rng();
        }
      }
    }

    return [{ x: 0, y: 0, state: {
      cells, next, vel, rgbaBuf,
      cols, rows, cs,
      kRe: kr, kIm: ki,
      re1, im1, re2, im2,
      twR, twC
    }}];
  },

  sensing() { return null; },

  response(state, sensed, thing, all, world) {
    const { cells, next, vel, cols, rows, kRe, kIm, re1, im1, re2, im2, twR, twC } = state;
    const mu    = world.params.mu;
    const sigma = world.params.sigma;
    const dt    = world.params.dt;
    const n     = cols * rows;

    re1.set(cells);
    im1.fill(0);

    fft2d(re1, im1, cols, rows, twR, twC, false);

    for (let i = 0; i < n; i++) {
      const ar = re1[i], ai = im1[i];
      const br = kRe[i], bi = kIm[i];
      re2[i] = ar * br - ai * bi;
      im2[i] = ar * bi + ai * br;
    }

    fft2d(re2, im2, cols, rows, twR, twC, true);

    const inv = 1 / n;
    const twoSigSq = 2 * sigma * sigma;

    let mass = 0;
    for (let i = 0; i < n; i++) {
      const U    = re2[i] * inv;
      const diff = U - mu;
      const G    = 2 * Math.exp(-(diff * diff) / twoSigSq) - 1
                 - 0.15 * Math.exp(-(diff * diff) / (twoSigSq * 9));
      const v_old = cells[i];
      const refrac = vel[i] > 0 ? vel[i] * 3.0 : vel[i] * 0.5;
      let v = v_old + dt * (G - refrac);
      if (v < 0) v = 0; else if (v > 1) v = 1;
      next[i] = v;
      vel[i] = v - v_old;
      mass += v;
    }

    const massFrac = mass / n;
    const targetLow  = 0.05;
    const targetHigh = 0.20;
    let correction = 0;
    if (massFrac > targetHigh) correction = -(massFrac - targetHigh) * 0.08;
    if (massFrac < targetLow)  correction =  (targetLow - massFrac)  * 0.08;

    for (let i = 0; i < n; i++) {
      let v = next[i] + correction;
      if (v < 0) v = 0; else if (v > 1) v = 1;
      cells[i] = v;
    }

    return state;
  },

  postTick(state) {},

  renderGL(glCtx, things, world) {
    const { cells, rgbaBuf, cols, rows } = things[0].state;
    const hue = world.params.hue / 360;
    const n   = cols * rows;

    for (let i = 0; i < n; i++) {
      const v  = cells[i];
      const h  = (hue + v * 0.15) % 1;
      const s  = 0.7 + v * 0.3;
      const l  = 0.05 + v * 0.7;
      const q  = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p  = 2 * l - q;
      const base = i * 4;
      rgbaBuf[base]     = hue2rgb(p, q, h + 1/3) * 255;
      rgbaBuf[base + 1] = hue2rgb(p, q, h)       * 255;
      rgbaBuf[base + 2] = hue2rgb(p, q, h - 1/3) * 255;
      rgbaBuf[base + 3] = 255;
    }

    glCtx.uploadRGBA(rgbaBuf, cols, rows);
  },

  render(ctx, thing, world) {
    const { cells, cols, rows, cs } = thing.state;
    const hue = world.params.hue / 360;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const img = ctx.createImageData(W, H);
    const d   = img.data;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v  = cells[y * cols + x];
        const h  = (hue + v * 0.15) % 1;
        const s  = 0.7 + v * 0.3;
        const l  = 0.05 + v * 0.7;
        const q  = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p  = 2 * l - q;
        const r  = hue2rgb(p, q, h + 1/3) * 255;
        const g  = hue2rgb(p, q, h)       * 255;
        const b  = hue2rgb(p, q, h - 1/3) * 255;
        const px = x * cs, py = y * cs;
        for (let row = 0; row < cs && py + row < H; row++) {
          const base = ((py + row) * W + px) * 4;
          for (let col = 0; col < cs && px + col < W; col++) {
            const idx = base + col * 4;
            d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
});
function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

function makeTwiddles(n) {
  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    const a = -2 * Math.PI * i / n;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
  }
  return { cos, sin };
}

function fft1d(re, im, n, tw, offset, stride, inverse) {
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const oi = offset + i * stride;
      const oj = offset + j * stride;
      let tmp = re[oi]; re[oi] = re[oj]; re[oj] = tmp;
          tmp = im[oi]; im[oi] = im[oj]; im[oj] = tmp;
    }
  }

  const { cos, sin } = tw;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const oi  = offset + (i + k)        * stride;
        const oj  = offset + (i + k + half) * stride;
        const ti  = k * step;
        const wr  =  cos[ti];
        const wi  = inverse ? -sin[ti] : sin[ti];
        const ur  = re[oi], ui = im[oi];
        const tr  = wr * re[oj] - wi * im[oj];
        const tii = wr * im[oj] + wi * re[oj];
        re[oi] = ur + tr;  im[oi] = ui + tii;
        re[oj] = ur - tr;  im[oj] = ui - tii;
      }
    }
  }
}

function fft2d(re, im, cols, rows, twR, twC, inverse) {
  for (let y = 0; y < rows; y++)
    fft1d(re, im, cols, twC, y * cols, 1, inverse);
  for (let x = 0; x < cols; x++)
    fft1d(re, im, rows, twR, x, cols, inverse);
}
