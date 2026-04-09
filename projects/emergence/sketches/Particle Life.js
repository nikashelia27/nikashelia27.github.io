about({
  title: 'Particle Life',
  text: 'Multiple particle types interact through an attraction–repulsion matrix, forming dynamic patterns such as clusters, swarms, and predator–prey cycles from simple pairwise forces.'
});

params({
  wrapEdges: { label: 'Wrap edges', type: 'checkbox', value: true },
  countPerType: { label: 'Per-type count',   type: 'range', min: 20,  max: 1000, value: 300, reinit: true },
  typeCount:    { label: 'Type count',        type: 'range', min: 4,   max: 36,   value: 30,  reinit: true },
  immuneCount:  { label: 'Immune types',      type: 'range', min: 0,   max: 8,    value: 2,   reinit: true },
  mapScale:     { label: 'Map scale',         type: 'range', min: 1,   max: 4,    value: 1,   reinit: true },
  radius:       { label: 'Force radius',      type: 'range', min: 20,  max: 200,  value: 90  },
  forceMult:    { label: 'Force strength',    type: 'range', min: 1,   max: 200,  value: 77  },
  friction:     { label: 'Friction %',        type: 'range', min: 50,  max: 99,   value: 53  },
  minDist:      { label: 'Repel distance',    type: 'range', min: 1,   max: 40,   value: 13  },
  repulse:      { label: 'Repel strength',    type: 'range', min: 1,   max: 100,  value: 5   },
  outerRepel:   { label: 'Outer repel',       type: 'range', min: 0,   max: 100,  value: 5   },
  spinStr:      { label: 'Spin strength',     type: 'range', min: 0,   max: 100,  value: 8   },
  alignStr:     { label: 'Align strength',    type: 'range', min: 0,   max: 100,  value: 1   },
  trailStr:     { label: 'Trail strength',    type: 'range', min: 0,   max: 100,  value: 12  },
  trailDecay:   { label: 'Trail decay %',     type: 'range', min: 80,  max: 99,   value: 80  },
  conversion:   { label: 'Conversion ‰',      type: 'range', min: 0,   max: 100,  value: 1   },
  preset:       { label: 'Preset 0-7',        type: 'range', min: 0,   max: 7,    value: 0,  reinit: true },
  seed:         { label: 'Matrix seed',       type: 'range', min: 0,   max: 999,  value: 42, reinit: true },
  dotSize:      { label: 'Dot size',          type: 'range', min: 1,   max: 10,   value: 1   },
});

const BASE_COLORS = [
  [1.00, 0.22, 0.22], [1.00, 0.55, 0.10], [0.95, 0.92, 0.10], [0.15, 0.90, 0.30],
  [0.10, 0.85, 0.85], [0.20, 0.45, 1.00], [0.65, 0.20, 1.00], [1.00, 0.25, 0.75],
  [1.00, 1.00, 1.00], [0.55, 0.85, 0.20], [0.10, 0.50, 0.90], [0.90, 0.10, 0.55],
  [0.80, 0.60, 0.20], [0.20, 0.80, 0.70], [0.90, 0.45, 0.10], [0.50, 0.20, 0.80],
];

const PTCL_TRAIL_CELL = 10;
const PTCL_OFF_X = [-1, 1,  0, 0];
const PTCL_OFF_Y = [ 0, 0, -1, 1];

function buildSpinBias(N) {
  const s = new Float32Array(N);
  for (let t = 0; t < N; t++)
    s[t] = (t % 2 === 0 ? 1 : -1) * (0.4 + 0.6 * (t / N));
  return s;
}

function buildMatrix(N, preset, seed) {
  const m = new Float32Array(N * N);
  if (preset === 0) {
    let s = (seed | 1) >>> 0;
    for (let i = 0; i < N * N; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      m[i] = s / 2147483648 - 1;
    }
  } else if (preset === 1) {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++)
        m[a*N+b] = b === (a+1)%N ? 0.9 : b === a ? 0.1 : -0.1;
  } else if (preset === 2) {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        if      (b === (a+1)%N)   m[a*N+b] =  0.8;
        else if (b === (a+N-1)%N) m[a*N+b] = -0.7;
        else                       m[a*N+b] =  0.0;
      }
  } else if (preset === 3) {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++)
        m[a*N+b] = a === b ? 0.85 : -0.15;
  } else if (preset === 4) {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        if (b < a) { m[a*N+b] = m[b*N+a]; continue; }
        m[a*N+b] = (a*7+b*13) % 10 < 5 ? 0.7 : -0.5;
      }
  } else if (preset === 5) {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++)
        m[a*N+b] = (a+b) % 2 === 0 ? 0.8 : -0.8;
  } else if (preset === 6) {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        const d = (b - a + N) % N;
        if      (d === 1) m[a*N+b] =  0.9;
        else if (d === 2) m[a*N+b] =  0.4;
        else if (d === 0) m[a*N+b] =  0.2;
        else              m[a*N+b] = -0.3;
      }
  } else {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        const d = Math.abs(b - a);
        m[a*N+b] = d <= 1 ? 0.7 : d <= 3 ? 0.0 : -0.4;
      }
  }
  return m;
}

function buildPreyOf(N, matrix) {
  const preyOf = new Uint8Array(N);
  for (let a = 0; a < N; a++) {
    let bestVal = -Infinity, bestType = (a + 1) % N;
    for (let b = 0; b < N; b++) {
      if (b === a) continue;
      if (matrix[a*N+b] > bestVal) { bestVal = matrix[a*N+b]; bestType = b; }
    }
    preyOf[a] = bestType;
  }
  return preyOf;
}
function makeTrailField(LW, LH) {
  const tc = Math.ceil(LW / PTCL_TRAIL_CELL) + 1;
  const tr = Math.ceil(LH / PTCL_TRAIL_CELL) + 1;
  return { tc, tr, val: new Float32Array(tc * tr), ttype: new Float32Array(tc * tr) };
}
define('particle', {
  agentParallel: true, 
  init(world) {
    const N   = world.params.typeCount;
    const ic  = Math.min(world.params.immuneCount, N - 1);
    const cpt = world.params.countPerType;
    const LW  = world.W * world.params.mapScale;
    const LH  = world.H * world.params.mapScale;
    const MAX = Math.min(cpt * N * 3, 40000);
    const px    = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const py    = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const vx    = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const vy    = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const type  = new Uint8Array(new SharedArrayBuffer(MAX));
    const alive = new Uint8Array(new SharedArrayBuffer(MAX));
    const dvx   = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const dvy   = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const avx   = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const avy   = new Float32Array(new SharedArrayBuffer(MAX * 4));
    const aCnt  = new Uint16Array(new SharedArrayBuffer(MAX * 2));
    const posBuf = new Float32Array(MAX * 2);
    const colBuf = new Float32Array(MAX * 3);
    const matrix   = buildMatrix(N, world.params.preset, world.params.seed);
    const preyOf   = buildPreyOf(N, matrix);
    const spinBias = buildSpinBias(N);
    const immune   = new Uint8Array(N);
    for (let t = N - ic; t < N; t++) immune[t] = 1;
    const cellSize  = Math.max(world.params.radius, 20);
    const gridCols  = Math.ceil(LW / cellSize) + 1;
    const gridRows  = Math.ceil(LH / cellSize) + 1;
    const gHeads    = new Int32Array(new SharedArrayBuffer(gridCols * gridRows * 4));
    const gNexts    = new Int32Array(new SharedArrayBuffer(MAX * 4));
    gHeads.fill(-1);
    const grid = { cols: gridCols, rows: gridRows, cellSize, heads: gHeads, nexts: gNexts };
    const trail = makeTrailField(LW, LH);
    let count = 0;
    for (let t = 0; t < N; t++)
      for (let i = 0; i < cpt; i++) {
        px[count] = Math.random() * LW;
        py[count] = Math.random() * LH;
        type[count] = t;
        alive[count] = 1;
        count++;
      }
    for (let i = 0; i < count; i++) {
      const cx = (px[i] / cellSize) | 0;
      const cy = (py[i] / cellSize) | 0;
      const ci = cy * gridCols + cx;
      gNexts[i] = gHeads[ci];
      gHeads[ci] = i;
    }

    return [{x: 0, y: 0, state: {
      px, py, vx, vy, type, alive,
      dvx, dvy, avx, avy, aCnt,
      matrix, preyOf, spinBias, immune,
      count, MAX, N, ic,
      posBuf, colBuf,
      grid, trail, LW, LH,
    }}];
  },
  sensing() { return null; },
  response(state, sensed, thing, all, world) {
    const {
      px, py, vx, vy, type, alive,
      dvx, dvy, avx, avy, aCnt,
      matrix, preyOf, spinBias, immune,
      grid, count, LW, LH, N,
    } = state;
    const iStart = world.iStart !== undefined ? world.iStart : 0;
    const iEnd   = world.iEnd   !== undefined ? world.iEnd   : count;
    const wrap       = world.params.wrapEdges;
    const r          = world.params.radius;
    const r2         = r * r;
    const fm         = world.params.forceMult  * 0.001;
    const md         = world.params.minDist;
    const md2        = md * md;
    const rp         = world.params.repulse    * 0.1;
    const outerR     = world.params.outerRepel * 0.001;
    const spinStr    = world.params.spinStr    * 0.0008;
    const alignStr   = world.params.alignStr   * 0.0006;
    const convChance = world.params.conversion * 0.001;
    const halfLW     = LW * 0.5;
    const halfLH     = LH * 0.5;
    const { cols, rows, cellSize, heads, nexts } = grid;
    const gridR  = Math.ceil(r / cellSize);
    const cellR2 = (r + cellSize) * (r + cellSize);
    for (let i = iStart; i < iEnd; i++) {
      if (!alive[i]) continue;
      const xi = px[i], yi = py[i], ti = type[i];
      const spinI = spinBias[ti] * spinStr;
      const gcx = (xi / cellSize) | 0;
      const gcy = (yi / cellSize) | 0;
      for (let gy = gcy - gridR; gy <= gcy + gridR; gy++) {
        for (let gx = gcx - gridR; gx <= gcx + gridR; gx++) {
          const wgx = ((gx % cols) + cols) % cols;
          const wgy = ((gy % rows) + rows) % rows;
          let cdx = (wgx + 0.5) * cellSize - xi;
          let cdy = (wgy + 0.5) * cellSize - yi;
          if (wrap) {
            if (cdx >  halfLW) cdx -= LW; else if (cdx < -halfLW) cdx += LW;
            if (cdy >  halfLH) cdy -= LH; else if (cdy < -halfLH) cdy += LH;
          }
          if (cdx*cdx + cdy*cdy > cellR2) continue;

          let j = heads[wgy * cols + wgx];
          while (j !== -1) {
            if (j === i) { j = nexts[j]; continue; }
            if (!alive[j]) { j = nexts[j]; continue; }

            let dx = px[j] - xi, dy = py[j] - yi;
            if (wrap) {
              if (dx >  halfLW) dx -= LW; else if (dx < -halfLW) dx += LW;
              if (dy >  halfLH) dy -= LH; else if (dy < -halfLH) dy += LH;
            }
            const d2 = dx*dx + dy*dy;
            if (d2 === 0 || d2 > r2) { j = nexts[j]; continue; }

            const d    = Math.sqrt(d2);
            const invD = 1.0 / d;
            const nx   = dx * invD;
            const ny   = dy * invD;
            const tj   = type[j];

            if (d2 < md2) {
              const f = rp * (md - d) / md;
              dvx[i] -= nx * f;
              dvy[i] -= ny * f;
            } else {
              const fall  = 1.0 - d / r;
              const fij   = matrix[ti*N+tj] * fall * fm;
              dvx[i] += nx * fij - ny * spinI * fij;
              dvy[i] += ny * fij + nx * spinI * fij;
              if (outerR > 0 && fall < 0.5) {
                const of = outerR * (0.5 - fall);
                dvx[i] -= nx * of;
                dvy[i] -= ny * of;
              }
              if (alignStr > 0 && ti === tj) {
                avx[i] += vx[j]; avy[i] += vy[j]; aCnt[i]++;
              }
              if (convChance > 0 && d2 < md2 * 4 && Math.random() < convChance) {
                if (preyOf[ti] === tj && !immune[tj]) type[j] = ti;
              }
            }
            j = nexts[j];
          }
        }
      }
    }
    return state;
  },
  postTick(state, params, wrap, W, H) {
    const {
      px, py, vx, vy, type, alive,
      dvx, dvy, avx, avy, aCnt,
      grid, trail, count, LW, LH,
    } = state;

    const fr       = params.friction   * 0.01;
    const r        = params.radius;
    const maxV     = r * 0.08;
    const maxV2    = maxV * maxV;
    const alignStr = params.alignStr   * 0.0006;
    const trailStr = params.trailStr   * 0.0005;
    const trailDec = params.trailDecay * 0.01;
    if (alignStr > 0) {
      for (let i = 0; i < count; i++) {
        if (!alive[i] || aCnt[i] === 0) continue;
        const inv = alignStr / aCnt[i];
        dvx[i] += (avx[i] * inv - vx[i]) * alignStr;
        dvy[i] += (avy[i] * inv - vy[i]) * alignStr;
      }
    }
    const { tc, tr, val: tv, ttype: tt } = trail;
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const cx = (px[i] / PTCL_TRAIL_CELL) | 0;
      const cy = (py[i] / PTCL_TRAIL_CELL) | 0;
      if (cx < 0 || cx >= tc || cy < 0 || cy >= tr) continue;
      const ci = cy * tc + cx;
      tv[ci] = tv[ci] + 0.08 > 1.0 ? 1.0 : tv[ci] + 0.08;
      tt[ci] = tt[ci] * 0.7 + type[i] * 0.3;
    }
    const tLen = tc * tr;
    for (let c = 0; c < tLen; c++) tv[c] *= trailDec;
    if (trailStr > 0) {
      for (let i = 0; i < count; i++) {
        if (!alive[i]) continue;
        const ti = type[i];
        const cx = (px[i] / PTCL_TRAIL_CELL) | 0;
        const cy = (py[i] / PTCL_TRAIL_CELL) | 0;
        let sx = 0, sy = 0;
        for (let o = 0; o < 4; o++) {
          const nx_ = cx + PTCL_OFF_X[o];
          const ny_ = cy + PTCL_OFF_Y[o];
          if (nx_ < 0 || nx_ >= tc || ny_ < 0 || ny_ >= tr) continue;
          const ci = ny_ * tc + nx_;
          const strength = tv[ci];
          if (strength < 0.05) continue;
          const trailT = (tt[ci] + 0.5) | 0;
          if (trailT !== ti) continue;
          sx += PTCL_OFF_X[o] * strength;
          sy += PTCL_OFF_Y[o] * strength;
        }
        dvx[i] += sx * trailStr;
        dvy[i] += sy * trailStr;
      }
    }
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      let nvx = (vx[i] + dvx[i]) * fr;
      let nvy = (vy[i] + dvy[i]) * fr;
      const v2 = nvx*nvx + nvy*nvy;
      if (v2 > maxV2) {
        const scale = maxV / Math.sqrt(v2);
        nvx *= scale; nvy *= scale;
      }
      vx[i] = nvx; vy[i] = nvy;
      px[i] += nvx; py[i] += nvy;
      if (wrap) {
        if (px[i] < 0)   px[i] += LW; else if (px[i] >= LW) px[i] -= LW;
        if (py[i] < 0)   py[i] += LH; else if (py[i] >= LH) py[i] -= LH;
      } else {
        if (px[i] < 0)        { px[i] = 0;      vx[i] *= -0.5; }
        else if (px[i] >= LW) { px[i] = LW - 1; vx[i] *= -0.5; }
        if (py[i] < 0)        { py[i] = 0;      vy[i] *= -0.5; }
        else if (py[i] >= LH) { py[i] = LH - 1; vy[i] *= -0.5; }
      }
    }
    const { cols, cellSize, heads, nexts } = grid;
    heads.fill(-1);
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const cx = (px[i] / cellSize) | 0;
      const cy = (py[i] / cellSize) | 0;
      const ci = cy * cols + cx;
      nexts[i] = heads[ci];
      heads[ci] = i;
    }
  },

  renderGL(glCtx, things, world) {
    const { px, py, type, alive, count, posBuf, colBuf, LW, LH, N, ic } = things[0].state;
    const size   = world.params.dotSize;
    const scaleX = world.W / LW;
    const scaleY = world.H / LH;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const t  = type[i];
      const c  = BASE_COLORS[t % BASE_COLORS.length];
      const im = t >= (N - ic);
      posBuf[n*2]   = px[i] * scaleX;
      posBuf[n*2+1] = py[i] * scaleY;
      colBuf[n*3]   = im ? c[0] * 0.7 + 0.3 : c[0];
      colBuf[n*3+1] = im ? c[1] * 0.7 + 0.3 : c[1];
      colBuf[n*3+2] = im ? c[2] * 0.7 + 0.3 : c[2];
      n++;
    }
    glCtx.drawPoints(posBuf.subarray(0, n*2), colBuf.subarray(0, n*3), size);
  },

  render(ctx, thing, world) {
    const { px, py, type, alive, count, LW, LH, N, ic } = thing.state;
    const size   = world.params.dotSize;
    const scaleX = world.W / LW;
    const scaleY = world.H / LH;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const t  = type[i];
      const c  = BASE_COLORS[t % BASE_COLORS.length];
      const im = t >= (N - ic);
      ctx.fillStyle = `rgb(${(im?c[0]*0.7+0.3:c[0])*255|0},${(im?c[1]*0.7+0.3:c[1])*255|0},${(im?c[2]*0.7+0.3:c[2])*255|0})`;
      ctx.beginPath();
      ctx.arc(px[i] * scaleX, py[i] * scaleY, size, 0, Math.PI * 2);
      ctx.fill();
    }
  },

});
