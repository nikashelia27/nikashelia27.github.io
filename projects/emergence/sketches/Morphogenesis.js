about({
  title: 'Morphogenesis',
  text: 'A system of growing and dividing cells'
})

params({
  wrapEdges:   { label: "Wrap edges",          type: "checkbox", value: true },
  cells:       { label: "Initial cells",       type: "range", min: 8,   max: 1020, value: 69,  reinit: true },
  cellRadius:  { label: "Cell radius",         type: "range", min: 4,   max: 22,  value: 4,  reinit: true },
  springDist:  { label: "Spring distance",     type: "range", min: 8,   max: 80,  value: 11 },
  spring:      { label: "Elasticity",          type: "range", min: 0,   max: 100, value: 0 },
  adhesion:    { label: "Adhesion",            type: "range", min: 0,   max: 100, value: 100 },
  repulsion:   { label: "Repulsion",           type: "range", min: 0,   max: 100, value: 16 },
  motility:    { label: "Motility",            type: "range", min: 0,   max: 100, value: 0 },
  chemotaxis:  { label: "Chemotaxis",          type: "range", min: 0,   max: 100, value: 21 },
  secrete:     { label: "Morphogen secretion", type: "range", min: 0,   max: 100, value: 0 },
  diffuse:     { label: "Morphogen diffusion", type: "range", min: 0,   max: 100, value: 0 },
  decay:       { label: "Morphogen decay",     type: "range", min: 0,   max: 100, value: 0  },
  growth:      { label: "Growth",              type: "range", min: 0,   max: 100, value: 100 },
  divideAt:    { label: "Divide at percent",   type: "range", min: 110, max: 260, value: 156 },
  maxCells:    { label: "Max cells",           type: "range", min: 10,  max: 2000, value: 1047 },
  damping:     { label: "Damping",             type: "range", min: 70,  max: 99,  value: 73 },
  hue:         { label: "Hue",                 type: "range", min: 0,   max: 360, value: 150 },
  hueSpread:   { label: "Hue spread",          type: "range", min: 0,   max: 180, value: 65 }
});

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function hslToRgb(h, s, l) {
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

function addParticle(state, x, y, r, hue, gene) {
  state.x.push(x);
  state.y.push(y);
  state.vx.push(0);
  state.vy.push(0);
  state.fx.push(0);
  state.fy.push(0);
  state.r.push(r);
  state.h.push(hue);
  state.gene.push(gene);
  state.alive.push(1);
  state.age.push(0);
  const a = Math.random() * Math.PI * 2;
  state.px.push(Math.cos(a));
  state.py.push(Math.sin(a));
  state.phase.push(Math.random() * Math.PI * 2);
}

function fieldIndex(cols, x, y) {
  return y * cols + x;
}

define("morpho", {
  init(world) {
    const state = {
      x: [], y: [], vx: [], vy: [], fx: [], fy: [],
      r: [], h: [], gene: [], alive: [], age: [],
      px: [], py: [], phase: [],
      tick: 0,
      W: world.W, H: world.H,
      fieldCell: 8
    };

    const N = Math.round(world.params.cells);
    const baseR = world.params.cellRadius;
    const cx = world.W * 0.5;
    const cy = world.H * 0.5;
    const spawnR = Math.min(world.W, world.H) * 0.01;
    const minDist = baseR * 1.9;

    let tries = 0;
    while (state.x.length < N && tries < N * 120) {
      tries++;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * spawnR;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      let ok = true;
      for (let i = 0; i < state.x.length; i++) {
        const dx = x - state.x[i];
        const dy = y - state.y[i];
        if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
      }
      if (!ok) continue;
      const hue = ((world.params.hue + (state.x.length / Math.max(1, N - 1)) * world.params.hueSpread) % 360 + 360) % 360;
      const gene = Math.random() < 0.5 ? 0 : 1;
      addParticle(state, x, y, baseR * (0.9 + Math.random() * 0.2), hue, gene);
    }

    const cols = Math.ceil(world.W / state.fieldCell);
    const rows = Math.ceil(world.H / state.fieldCell);
    state.cols = cols;
    state.rows = rows;
    state.field = new Float32Array(cols * rows);
    state.scratch = new Float32Array(cols * rows);
    state.inhib = new Float32Array(cols * rows);
    state.inhibScratch = new Float32Array(cols * rows);

    return [{ x: 0, y: 0, state }];
  },

  sensing() { return null; },

  response(state, sensed, thing, all, world) {
    const x = state.x, y = state.y, vx = state.vx, vy = state.vy;
    const fx = state.fx, fy = state.fy, r = state.r, h = state.h;
    const gene = state.gene, alive = state.alive, age = state.age;
    const px = state.px, py = state.py, phase = state.phase;
    const field = state.field, scratch = state.scratch;
    const inhib = state.inhib, inhibScratch = state.inhibScratch;
    const cols = state.cols, rows = state.rows, cell = state.fieldCell;
    const W = world.W, H = world.H;

    state.tick++;

    const springDist = world.params.springDist;
    const springK = world.params.spring * 0.010;
    const adhesionK = world.params.adhesion * 0.0028;
    const repulsionK = world.params.repulsion * 0.020;
    const motility = world.params.motility * 0.010;
    const chemotaxis = world.params.chemotaxis * 0.030;
    const secrete = world.params.secrete * 0.080;
    const diffuse = world.params.diffuse * 0.010;
    const decay = 1 - world.params.decay * 0.004;
    const growth = world.params.growth * 0.00055;
    const divideAt = world.params.cellRadius * (world.params.divideAt * 0.01);
    const damping = world.params.damping * 0.01;
    const maxCells = Math.round(world.params.maxCells);
    const wrap = !!world.params.wrapEdges;

    for (let i = 0; i < field.length; i++) { field[i] = 0; inhib[i] = 0; }

    for (let i = 0; i < x.length; i++) {
      if (!alive[i]) continue;
      const gx = Math.floor(x[i] / cell);
      const gy = Math.floor(y[i] / cell);
      const rr = Math.max(1, Math.ceil(r[i] / cell));
      const amount = secrete * (gene[i] === 0 ? 1.0 : 0.65);
      const inhibAmount = secrete * (gene[i] === 0 ? 0.35 : 0.65);
      for (let oy = -rr; oy <= rr; oy++) {
        let sy = gy + oy;
        if (wrap) sy = (sy % rows + rows) % rows;
        else if (sy < 0 || sy >= rows) continue;
        for (let ox = -rr; ox <= rr; ox++) {
          let sx = gx + ox;
          if (wrap) sx = (sx % cols + cols) % cols;
          else if (sx < 0 || sx >= cols) continue;
          const d2 = ox * ox + oy * oy;
          if (d2 > rr * rr) continue;
          const falloff = (1 - d2 / Math.max(1, rr * rr));
          field[fieldIndex(cols, sx, sy)] += amount * falloff;
          inhib[fieldIndex(cols, sx, sy)] += inhibAmount * (0.35 + falloff * 0.65);
        }
      }
    }

    const inhibDiffuse = Math.min(0.95, diffuse * 2.8 + 0.10);
    const inhibDecay = Math.max(0.75, decay - 0.01);

    for (let y0 = 0; y0 < rows; y0++) {
      const ym = wrap ? (y0 - 1 + rows) % rows : y0 - 1;
      const yp = wrap ? (y0 + 1) % rows : y0 + 1;
      for (let x0 = 0; x0 < cols; x0++) {
        const xm = wrap ? (x0 - 1 + cols) % cols : x0 - 1;
        const xp = wrap ? (x0 + 1) % cols : x0 + 1;

        let sumA = field[fieldIndex(cols, x0, y0)] * 0.50;
        let sumI = inhib[fieldIndex(cols, x0, y0)] * 0.50;
        let w = 0.50;

        if (ym >= 0) { sumA += field[fieldIndex(cols, x0, ym)] * 0.125; sumI += inhib[fieldIndex(cols, x0, ym)] * 0.125; w += 0.125; }
        if (yp < rows) { sumA += field[fieldIndex(cols, x0, yp)] * 0.125; sumI += inhib[fieldIndex(cols, x0, yp)] * 0.125; w += 0.125; }
        if (xm >= 0) { sumA += field[fieldIndex(cols, xm, y0)] * 0.125; sumI += inhib[fieldIndex(cols, xm, y0)] * 0.125; w += 0.125; }
        if (xp < cols) { sumA += field[fieldIndex(cols, xp, y0)] * 0.125; sumI += inhib[fieldIndex(cols, xp, y0)] * 0.125; w += 0.125; }
        if (ym >= 0 && xm >= 0) { sumA += field[fieldIndex(cols, xm, ym)] * 0.03125; sumI += inhib[fieldIndex(cols, xm, ym)] * 0.03125; w += 0.03125; }
        if (ym >= 0 && xp < cols) { sumA += field[fieldIndex(cols, xp, ym)] * 0.03125; sumI += inhib[fieldIndex(cols, xp, ym)] * 0.03125; w += 0.03125; }
        if (yp < rows && xm >= 0) { sumA += field[fieldIndex(cols, xm, yp)] * 0.03125; sumI += inhib[fieldIndex(cols, xm, yp)] * 0.03125; w += 0.03125; }
        if (yp < rows && xp < cols) { sumA += field[fieldIndex(cols, xp, yp)] * 0.03125; sumI += inhib[fieldIndex(cols, xp, yp)] * 0.03125; w += 0.03125; }

        const idx = fieldIndex(cols, x0, y0);
        scratch[idx] = (field[idx] * (1 - diffuse) + (sumA / w) * diffuse) * decay;
        inhibScratch[idx] = (inhib[idx] * (1 - inhibDiffuse) + (sumI / w) * inhibDiffuse) * inhibDecay;
      }
    }

    for (let i = 0; i < field.length; i++) { field[i] = scratch[i]; inhib[i] = inhibScratch[i]; }

    const sampleField = (sx, sy) => {
      let gx = Math.floor(sx / cell);
      let gy = Math.floor(sy / cell);
      if (wrap) {
        gx = (gx % cols + cols) % cols;
        gy = (gy % rows + rows) % rows;
      } else {
        gx = clamp(gx, 0, cols - 1);
        gy = clamp(gy, 0, rows - 1);
      }
      return field[fieldIndex(cols, gx, gy)];
    };

    for (let i = 0; i < x.length; i++) {
      fx[i] = 0;
      fy[i] = 0;
      if (!alive[i]) continue;

      age[i]++;
      phase[i] += 0.05 + Math.random() * 0.02;

      const sampleInhib = (sx, sy) => {
        let gx = Math.floor(sx / cell);
        let gy = Math.floor(sy / cell);
        if (wrap) {
          gx = (gx % cols + cols) % cols;
          gy = (gy % rows + rows) % rows;
        } else {
          gx = clamp(gx, 0, cols - 1);
          gy = clamp(gy, 0, rows - 1);
        }
        return inhib[fieldIndex(cols, gx, gy)];
      };

      const local = sampleField(x[i], y[i]);
      const localInhib = sampleInhib(x[i], y[i]);
      const gradX = sampleField(x[i] + cell, y[i]) - sampleField(x[i] - cell, y[i]);
      const gradY = sampleField(x[i], y[i] + cell) - sampleField(x[i], y[i] - cell);
      const gradIX = sampleInhib(x[i] + cell, y[i]) - sampleInhib(x[i] - cell, y[i]);
      const gradIY = sampleInhib(x[i], y[i] + cell) - sampleInhib(x[i], y[i] - cell);

      px[i] = px[i] * 0.985 + (Math.random() - 0.5) * 0.028 + gradX * 0.0012 - gradIX * 0.0009;
      py[i] = py[i] * 0.985 + (Math.random() - 0.5) * 0.028 + gradY * 0.0012 - gradIY * 0.0009;
      const pl = Math.hypot(px[i], py[i]) || 1;
      px[i] /= pl;
      py[i] /= pl;

      const chemoSign = gene[i] === 0 ? 1 : -0.35;
      fx[i] += (gradX - gradIX * 1.35) * chemotaxis * chemoSign;
      fy[i] += (gradY - gradIY * 1.35) * chemotaxis * chemoSign;

      fx[i] += px[i] * motility;
      fy[i] += py[i] * motility;

      const crowdBias = Math.sin(phase[i]) * 0.03;

      const targetA = gene[i] === 0 ? 1.3 : 0.9;
      const band = Math.max(0, 1 - Math.abs(local - targetA) / 1.2);
      const hollowBias = Math.max(0, localInhib - 0.55);
      const edgeGrow = band * (1.15 - Math.min(1, localInhib * 0.45));
      const growDrive = edgeGrow - hollowBias * 1.65;

      r[i] += growth * (0.10 + growDrive * 0.55 + crowdBias);
      if (local < 0.18) r[i] -= growth * 0.16;
      if (localInhib > 0.9) r[i] -= growth * (0.34 + localInhib * 0.22);
      r[i] = clamp(r[i], world.params.cellRadius * 0.45, divideAt * 1.05);
    }

    for (let i = 0; i < x.length; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < x.length; j++) {
        if (!alive[j]) continue;

        let dx = x[j] - x[i];
        let dy = y[j] - y[i];

        if (wrap) {
          if (dx > W * 0.5) dx -= W;
          if (dx < -W * 0.5) dx += W;
          if (dy > H * 0.5) dy -= H;
          if (dy < -H * 0.5) dy += H;
        }

        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;

        const rest = (r[i] + r[j]) * 1.00;
        const touch = (r[i] + r[j]) * 1.10;
        const bond = Math.max(touch, springDist);

        if (d < bond) {
          const springForce = (d - rest) * springK * 1.8;
          const sameGene = gene[i] === gene[j] ? 1.0 : 0.65;
          fx[i] += nx * springForce * sameGene;
          fy[i] += ny * springForce * sameGene;
          fx[j] -= nx * springForce * sameGene;
          fy[j] -= ny * springForce * sameGene;
        }

        if (d < touch) {
          const overlap = touch - d;
          const rf = overlap * repulsionK * 0.42;
          fx[i] -= nx * rf;
          fy[i] -= ny * rf;
          fx[j] += nx * rf;
          fy[j] += ny * rf;
        } else if (d < bond * 1.55) {
          const af = (1 - d / (bond * 1.55)) * adhesionK * 0.75;
          fx[i] += nx * af;
          fy[i] += ny * af;
          fx[j] -= nx * af;
          fy[j] -= ny * af;
        }
      }
    }

    for (let i = 0; i < x.length; i++) {
      if (!alive[i]) continue;

      vx[i] = (vx[i] + fx[i] * 0.42) * damping;
      vy[i] = (vy[i] + fy[i] * 0.42) * damping;

      x[i] += vx[i];
      y[i] += vy[i];

      if (wrap) {
        if (x[i] < 0) x[i] += W;
        if (x[i] >= W) x[i] -= W;
        if (y[i] < 0) y[i] += H;
        if (y[i] >= H) y[i] -= H;
      } else {
        const m = r[i] + 4;
        if (x[i] < m) { x[i] = m; vx[i] *= -0.35; }
        if (x[i] > W - m) { x[i] = W - m; vx[i] *= -0.35; }
        if (y[i] < m) { y[i] = m; vy[i] *= -0.35; }
        if (y[i] > H - m) { y[i] = H - m; vy[i] *= -0.35; }
      }
    }

    let liveCount = 0;
    for (let i = 0; i < alive.length; i++) if (alive[i]) liveCount++;

    const babies = [];
    for (let i = 0; i < x.length; i++) {
      if (!alive[i]) continue;
      if (liveCount + babies.length >= maxCells) break;
      if (age[i] < 80) continue;
      if (r[i] < divideAt) continue;

      const a = Math.atan2(py[i], px[i]) + (Math.random() - 0.5) * 0.8;
      const sep = r[i] * 0.95;
      const nx = Math.cos(a), ny = Math.sin(a);

      r[i] *= 0.72;
      x[i] -= nx * sep * 0.5;
      y[i] -= ny * sep * 0.5;
      age[i] = 0;
      h[i] = ((h[i] + 8 + Math.random() * 10) % 360 + 360) % 360;

      babies.push({
        x: x[i] + nx * sep,
        y: y[i] + ny * sep,
        r: r[i] * (0.96 + Math.random() * 0.08),
        h: ((h[i] + world.params.hueSpread * 0.3 + Math.random() * 14) % 360 + 360) % 360,
        g: Math.random() < 0.10 ? 1 - gene[i] : gene[i]
      });
    }

    for (const b of babies) {
      addParticle(state, b.x, b.y, b.r, b.h, b.g);
    }

    for (let i = 0; i < x.length; i++) {
      if (!alive[i]) continue;
      if (r[i] < world.params.cellRadius * 0.38 && age[i] > 40) alive[i] = 0;
    }

    if (state.tick % 120 === 0) {
      const nx = [], ny = [], nvx = [], nvy = [], nfx = [], nfy = [];
      const nr = [], nh = [], ng = [], na = [], nage = [], npx = [], npy = [], nphase = [];
      for (let i = 0; i < x.length; i++) {
        if (!alive[i]) continue;
        nx.push(x[i]); ny.push(y[i]); nvx.push(vx[i]); nvy.push(vy[i]);
        nfx.push(0); nfy.push(0); nr.push(r[i]); nh.push(h[i]); ng.push(gene[i]);
        na.push(1); nage.push(age[i]); npx.push(px[i]); npy.push(py[i]); nphase.push(phase[i]);
      }
      state.x = nx; state.y = ny; state.vx = nvx; state.vy = nvy; state.fx = nfx; state.fy = nfy;
      state.r = nr; state.h = nh; state.gene = ng; state.alive = na; state.age = nage;
      state.px = npx; state.py = npy; state.phase = nphase;
    }

    state.W = W;
    state.H = H;
    return state;
  },

  render(ctx, thing, world) {
    const s = thing.state;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const field = s.field, cols = s.cols, rows = s.rows, cell = s.fieldCell;

    ctx.fillStyle = "#070a09";
    ctx.fillRect(0, 0, W, H);

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const v = field[fieldIndex(cols, gx, gy)];
        const iv = s.inhib[fieldIndex(cols, gx, gy)];
        const dv = v - iv * 0.55;
        if (Math.abs(dv) < 0.08) continue;
        if (dv >= 0) {
          const a = Math.min(0.22, dv * 0.016);
          ctx.fillStyle = "rgba(70,160,130," + a.toFixed(3) + ")";
        } else {
          const a = Math.min(0.18, (-dv) * 0.014);
          ctx.fillStyle = "rgba(180,90,120," + a.toFixed(3) + ")";
        }
        ctx.fillRect(gx * cell, gy * cell, cell + 1, cell + 1);
      }
    }

    for (let i = 0; i < s.x.length; i++) {
      if (!s.alive[i]) continue;

      const hue = (((s.h[i] % 360) + 360) % 360) / 360;
      const vitality = clamp(s.r[i] / world.params.cellRadius, 0.45, 1.8);
      const sat = 0.42 + s.gene[i] * 0.12;
      const lum = 0.20 + vitality * 0.10;
      const edgeLum = 0.46 + vitality * 0.08;
      const rgb = hslToRgb(hue, sat, lum);
      const edge = hslToRgb(hue, 0.24, edgeLum);

      ctx.beginPath();
      ctx.arc(s.x[i], s.y[i], s.r[i], 0, Math.PI * 2);
      ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
      ctx.fill();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgb(" + edge[0] + "," + edge[1] + "," + edge[2] + ")";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.x[i] - s.r[i] * 0.18, s.y[i] - s.r[i] * 0.14, Math.max(1.2, s.r[i] * 0.26), 0, Math.PI * 2);
      ctx.fillStyle = s.gene[i] === 0 ? "rgba(230,255,240,0.22)" : "rgba(255,235,245,0.22)";
      ctx.fill();
    }
  },

  renderGL: null
});