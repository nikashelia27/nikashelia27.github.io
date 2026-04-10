about({
  title: 'Boids',
  text: 'Agents move by following three local flocking rules: separation, alignment, and cohesion to stay with the group. Together these simple rules create lifelike collective motion.'
});

params({
  wrapEdges: { label: 'Wrap edges', type: 'checkbox', value: true },
  count:      { label: 'Count',          type: 'range', min: 10,  max: 6000, value: 6000, reinit: true },
  radius:     { label: 'Sense radius',   type: 'range', min: 10,  max: 200,  value: 200   },
  sepDist:    { label: 'Sep distance',   type: 'range', min: 5,   max: 80,   value: 80   },
  sepStr:     { label: 'Sep strength',   type: 'range', min: 0,   max: 200,  value: 200   },
  alignStr:   { label: 'Align strength', type: 'range', min: 0,   max: 200,  value: 200   },
  cohStr:     { label: 'Coh strength',   type: 'range', min: 0,   max: 200,  value: 128   },
  speed:      { label: 'Speed',          type: 'range', min: 1,   max: 20,   value: 13    },
  turnSpeed:  { label: 'Turn speed',     type: 'range', min: 1,   max: 100,  value: 100   },
  dotSize:    { label: 'Dot size',       type: 'range', min: 1,   max: 10,   value: 2    },
  cellStep:   { label: 'Grid cell size', type: 'range', min: 10,  max: 120,  value: 10,  reinit: true },
});

define('boid', {
  agentParallel: true,

  init(world) {
    const N    = world.params.count;
    const step = world.params.cellStep || 60;

    // All agent data in SharedArrayBuffers so workers can read/write in parallel
    const px  = new Float32Array(new SharedArrayBuffer(N * 4));
    const py  = new Float32Array(new SharedArrayBuffer(N * 4));
    const vx  = new Float32Array(new SharedArrayBuffer(N * 4));
    const vy  = new Float32Array(new SharedArrayBuffer(N * 4));
    const hue = new Float32Array(new SharedArrayBuffer(N * 4));

    // Scratch buffers — zeroed by engine before each parallel dispatch
    const dvx  = new Float32Array(new SharedArrayBuffer(N * 4));
    const dvy  = new Float32Array(new SharedArrayBuffer(N * 4));

    // Flat spatial grid — each cell holds up to maxPerCell agent indices
    const maxPerCell = 48;
    const cols = Math.ceil(world.W / step) + 1;
    const rows = Math.ceil(world.H / step) + 1;
    const gridCount = new Int32Array(new SharedArrayBuffer(cols * rows * 4));
    const gridIdx   = new Int32Array(new SharedArrayBuffer(cols * rows * maxPerCell * 4));

    for (let i = 0; i < N; i++) {
      const angle = Math.random() * Math.PI * 2;
      px[i]  = Math.random() * world.W;
      py[i]  = Math.random() * world.H;
      vx[i]  = Math.cos(angle) * world.params.speed;
      vy[i]  = Math.sin(angle) * world.params.speed;
      hue[i] = Math.random() * 360;
    }

    return [{
      x: 0, y: 0,
      state: {
        px, py, vx, vy, hue,
        dvx, dvy,
        gridCount, gridIdx,
        count: N,
        cols, rows,
        step, maxPerCell,
        W: world.W,
        H: world.H,
      }
    }];
  },

  // postTick runs on main worker after all parallel workers finish.
  // Rebuilds spatial grid and integrates accumulated steering (dvx/dvy) into positions.
  postTick(state, params, wrap, W, H) {
    const { px, py, vx, vy, dvx, dvy, gridCount, gridIdx, count, cols, rows, step, maxPerCell } = state;
    const speed     = params.speed;
    const turnSpeed = params.turnSpeed * 0.001;

    // Integrate steering + normalize to constant speed + move
    for (let i = 0; i < count; i++) {
      let nvx = vx[i] + dvx[i] * turnSpeed;
      let nvy = vy[i] + dvy[i] * turnSpeed;
      const mag = Math.sqrt(nvx * nvx + nvy * nvy);
      if (mag > 0.0001) { nvx = nvx / mag * speed; nvy = nvy / mag * speed; }
      vx[i] = nvx; vy[i] = nvy;

      let nx = px[i] + nvx;
      let ny = py[i] + nvy;
      if (wrap) {
        if (nx < 0) nx += W; else if (nx >= W) nx -= W;
        if (ny < 0) ny += H; else if (ny >= H) ny -= H;
      } else {
        if (nx < 0 || nx >= W) { vx[i] = -nvx; nx = Math.max(0, Math.min(W - 0.01, nx)); }
        if (ny < 0 || ny >= H) { vy[i] = -nvy; ny = Math.max(0, Math.min(H - 0.01, ny)); }
      }
      px[i] = nx; py[i] = ny;
    }

    // Rebuild spatial grid
    gridCount.fill(0);
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(px[i] / step);
      const cy = Math.floor(py[i] / step);
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
      const cell = cy * cols + cx;
      const cnt  = gridCount[cell];
      if (cnt < maxPerCell) {
        gridIdx[cell * maxPerCell + cnt] = i;
        gridCount[cell]++;
      }
    }
    state.W = W; state.H = H;
  },

  // response() runs per-worker on a slice [iStart, iEnd).
  // Reads positions/velocities, writes steering into dvx/dvy scratch buffers.
  response(state, _sensed, _thing, _all, world) {
    const { px, py, vx, vy, dvx, dvy, gridCount, gridIdx, count, cols, rows, step, maxPerCell, W, H } = state;
    const { iStart, iEnd } = world;
    if (iStart === undefined) return state;

    const radius  = world.params.radius;
    const sepDist = world.params.sepDist;
    const sepStr  = world.params.sepStr  * 0.001;
    const alignStr= world.params.alignStr* 0.001;
    const cohStr  = world.params.cohStr  * 0.001;
    const r2      = radius * radius;
    const sd2     = sepDist * sepDist;

    const cellR = Math.ceil(radius / step) + 1;

    for (let i = iStart; i < iEnd; i++) {
      const ix = px[i], iy = py[i];
      const ivx = vx[i], ivy = vy[i];

      let sx=0, sy=0, ax=0, ay=0, cx=0, cy=0;
      let nNeigh=0, nSep=0;

      const gcx = Math.floor(ix / step);
      const gcy = Math.floor(iy / step);

      for (let dy = -cellR; dy <= cellR; dy++) {
        const gy = gcy + dy;
        if (gy < 0 || gy >= rows) continue;
        for (let dx = -cellR; dx <= cellR; dx++) {
          const gx = gcx + dx;
          if (gx < 0 || gx >= cols) continue;
          const cell = gy * cols + gx;
          const cnt  = gridCount[cell];
          const base = cell * maxPerCell;
          for (let k = 0; k < cnt; k++) {
            const j = gridIdx[base + k];
            if (j === i) continue;
            const ex = px[j] - ix, ey = py[j] - iy;
            const d2 = ex*ex + ey*ey;
            if (d2 > r2) continue;

            cx += px[j]; cy += py[j];
            ax += vx[j]; ay += vy[j];
            nNeigh++;

            if (d2 < sd2 && d2 > 0) {
              const d = Math.sqrt(d2);
              sx += (ix - px[j]) / d * (sepDist - d) / sepDist;
              sy += (iy - py[j]) / d * (sepDist - d) / sepDist;
              nSep++;
            }
          }
        }
      }

      let fx = 0, fy = 0;
      if (nNeigh > 0) {
        fx += (cx / nNeigh - ix) * cohStr;
        fy += (cy / nNeigh - iy) * cohStr;
        fx += (ax / nNeigh - ivx) * alignStr;
        fy += (ay / nNeigh - ivy) * alignStr;
      }
      if (nSep > 0) {
        fx += sx * sepStr;
        fy += sy * sepStr;
      }

      dvx[i] = fx;
      dvy[i] = fy;
    }

    return state;
  },

  renderGL(glCtx, things, world) {
    const s     = things[0].state;
    const count = s.count;
    const size  = world.params.dotSize;
    const pos   = new Float32Array(count * 2);
    const col   = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(s.vy[i], s.vx[i]);
      const hf    = ((angle / Math.PI * 180) + 360) % 360 / 360;
      const q = hf < 0.5 ? hf * (1 + 0.85) : hf + 0.85 - hf * 0.85;
      const p = 2 * 0.55 - q;
      const hr = t => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      pos[i*2]   = s.px[i];
      pos[i*2+1] = s.py[i];
      col[i*3]   = hr(hf + 1/3);
      col[i*3+1] = hr(hf);
      col[i*3+2] = hr(hf - 1/3);
    }
    glCtx.drawPoints(pos, col, size);
  },

  render(ctx, thing, world) {
    const s    = thing.state;
    const size = world.params.dotSize;
    for (let i = 0; i < s.count; i++) {
      const angle = Math.atan2(s.vy[i], s.vx[i]);
      const hue   = ((angle / Math.PI * 180) + 360) % 360;
      ctx.fillStyle = `hsl(${hue},85%,55%)`;
      ctx.save();
      ctx.translate(s.px[i], s.py[i]);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(size * 2, 0);
      ctx.lineTo(-size, size);
      ctx.lineTo(-size, -size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
});
