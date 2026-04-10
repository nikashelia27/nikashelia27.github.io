about({
  title: 'Resonant Neurons',
  text: 'Each cell integrates input, fires when excited, and recovers over time, producing traveling waves, spirals, and rhythmic activity.'
});

params({
  wrapEdges: { label: 'Wrap edges', type: 'checkbox', value: true },
  cellSize:      { label: 'Cell size',        type: 'range', min: 1,   max: 12,  value: 3   },
  coupling:      { label: 'Coupling',         type: 'range', min: 0,   max: 400, value: 300  },
  leak:          { label: 'Leak',             type: 'range', min: 0,   max: 100, value: 63   },
  recovery:      { label: 'Recovery',         type: 'range', min: 0,   max: 100, value: 85  },
  threshold:     { label: 'Threshold',        type: 'range', min: 10,  max: 255, value: 77  },
  refractory:    { label: 'Refractory',       type: 'range', min: 1,   max: 80,  value: 5   },
  noise:         { label: 'Noise',            type: 'range', min: 0,   max: 100, value: 77   },
  pacemaker:     { label: 'Pacemaker %',      type: 'range', min: 0,   max: 100, value: 0  },
  paceRate:      { label: 'Pace rate',        type: 'range', min: 10,  max: 300, value: 10 },
  inhibition:    { label: 'Inhibition',       type: 'range', min: 0,   max: 100, value: 11   },
  adapt:         { label: 'Adaptation',       type: 'range', min: 0,   max: 900, value: 150  },
  hue:           { label: 'Hue',              type: 'range', min: 0,   max: 360, value: 269 },
  hueSpread:     { label: 'Hue spread',       type: 'range', min: 0,   max: 180, value: 19  }
});

function hsl(h, s, l) {
  const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  return [hue2rgb(p,q,h+1/3), hue2rgb(p,q,h), hue2rgb(p,q,h-1/3)]
    .map(v => Math.round(v*255));
}
function hue2rgb(p, q, t) {
  if (t<0) t+=1; if (t>1) t-=1;
  if (t<1/6) return p+(q-p)*6*t;
  if (t<1/2) return q;
  if (t<2/3) return p+(q-p)*(2/3-t)*6;
  return p;
}

define('neuron', {

  init(world) {
    const cs   = world.params.cellSize;
    const hexW = cs * 2;
    const hexH = Math.sqrt(3) * cs;
    const cols = Math.floor(world.W / (hexW * 0.75)) + 2;
    const rows = Math.floor(world.H / hexH) + 2;
    const n    = cols * rows;

    const v        = new Float32Array(new SharedArrayBuffer(n * 4));
    const nextV    = new Float32Array(new SharedArrayBuffer(n * 4));
    const rec      = new Float32Array(new SharedArrayBuffer(n * 4));
    const nextR    = new Float32Array(new SharedArrayBuffer(n * 4));
    const ref      = new Uint8Array(new SharedArrayBuffer(n));
    const nextF    = new Uint8Array(new SharedArrayBuffer(n));
    const fire     = new Uint8Array(new SharedArrayBuffer(n));
    const nextFire = new Uint8Array(new SharedArrayBuffer(n));
    const phase    = new Float32Array(new SharedArrayBuffer(n * 4));
    const pace     = new Uint8Array(new SharedArrayBuffer(n));
    const rgbaBuf  = new Uint8Array(n * 4);

    for (let i = 0; i < n; i++) {
      v[i]     = Math.random() * 40;
      rec[i]   = Math.random() * 20;
      phase[i] = Math.random() * Math.PI * 2;
      pace[i]  = (Math.random() * 100 < world.params.pacemaker) ? 1 : 0;
    }

    return [{
      x: 0, y: 0,
      state: { v, nextV, rec, nextR, ref, nextF, fire, nextFire, phase, pace, cols, rows, cs, tick: 0, rgbaBuf }
    }];
  },

  sensing() { return null; },

  response(state, sensed, thing, all, world) {
    const HEX_NEIGHBORS = [
      [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1]],
      [[-1,0],[1,0],[0,-1],[0,1],[1,-1],[1,1]]
    ];
    const clamp255 = x => x < 0 ? 0 : x > 255 ? 255 : x;

    const { v, nextV, rec, nextR, ref, nextF, fire, nextFire, phase, pace, cols, rows } = state;

    const wrap       = world.wrap;
    const coupling   = world.params.coupling / 100;
    const leak       = world.params.leak / 100;
    const recovery   = world.params.recovery / 100;
    const threshold  = world.params.threshold;
    const refractory = world.params.refractory;
    const noiseScale = 255 * world.params.noise / 100;
    const inhibition = world.params.inhibition / 100;
    const adapt      = world.params.adapt / 100;
    const paceRate   = world.params.paceRate;

    state.tick++;

    const rowStart = world.rowStart !== undefined ? world.rowStart : 0;
    const rowEnd   = world.rowEnd   !== undefined ? world.rowEnd   : rows;

    for (let row = rowStart; row < rowEnd; row++) {
      const offsets = HEX_NEIGHBORS[row & 1];
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        let neighborSum = 0, firingNeighbors = 0;
        for (const [dc, dr] of offsets) {
          let nc = col + dc, nr = row + dr;
          if (wrap) {
            nc = ((nc % cols) + cols) % cols;
            nr = ((nr % rows) + rows) % rows;
          } else {
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          }
          const ni = nr * cols + nc;
          neighborSum     += v[ni];
          firingNeighbors += fire[ni];
        }
        const avgNeighbor = neighborSum / 6;
        let membrane = v[i], fatigue = rec[i], refLeft = ref[i];
        phase[i] += (Math.PI * 2) / paceRate;
        if (phase[i] > Math.PI * 2) phase[i] -= Math.PI * 2;
        const osc       = pace[i] ? (Math.sin(phase[i]) * 0.5 + 0.5) * 18 : 0;
        const stoch     = noiseScale > 0 ? (Math.random() - 0.5) * noiseScale : 0;
        const diffuse   = (avgNeighbor - membrane) * coupling;
        const inhibPush = firingNeighbors * inhibition * 18;
        const adaptThr  = threshold + fatigue * adapt * 1.8;
        if (refLeft > 0) {
          nextF[i]    = refLeft - 1;
          nextFire[i] = 0;
          membrane   *= 0.82;
          membrane   -= fatigue * 0.08;
          fatigue     = Math.max(0, fatigue - recovery * 0.35);
          nextV[i]    = clamp255(membrane);
          nextR[i]    = clamp255(fatigue);
          continue;
        }
        membrane += diffuse + osc + stoch;
        membrane -= membrane * leak;
        membrane -= inhibPush * 0.35;
        membrane -= fatigue * 0.22;
        if (membrane >= adaptThr) {
          nextFire[i] = 1;
          nextF[i]    = refractory;
          nextV[i]    = 255;
          nextR[i]    = clamp255(fatigue + 50 + firingNeighbors * 6);
        } else {
          nextFire[i] = 0;
          nextF[i]    = 0;
          nextV[i]    = clamp255(membrane);
          nextR[i]    = clamp255(Math.max(0, fatigue - recovery * 2.2) + firingNeighbors * inhibition * 2.5);
        }
      }
    }
    return state;
  },
  postTick(state) {
    state.v.set(state.nextV);
    state.rec.set(state.nextR);
    state.ref.set(state.nextF);
    state.fire.set(state.nextFire);
  },

  renderGL(glCtx, things, world) {
    const thing  = things[0];
    const { v, rec, ref, fire, cols, rows, rgbaBuf } = thing.state;
    const hue    = world.params.hue;
    const hs     = world.params.hueSpread;
    const maxRef = world.params.refractory;
    const n      = cols * rows;
    for (let i = 0; i < n; i++) {
      const membrane = v[i];
      const fatigue  = rec[i];
      const refLeft  = ref[i];
      const base     = i * 4;
      if (membrane < 6 && refLeft === 0) {
        rgbaBuf[base]=6; rgbaBuf[base+1]=8; rgbaBuf[base+2]=12; rgbaBuf[base+3]=255;
        continue;
      }
      let rr, gg, bb;
      if (refLeft > 0 && !fire[i]) {
        const t = refLeft / Math.max(1, maxRef);
        const h = ((hue + hs * 0.9) % 360 + 360) % 360;
        [rr,gg,bb] = hsl(h/360, 0.35 + t*0.4, 0.20 + t*0.25);
      } else {
        const energy = fire[i] ? 1 : (membrane / 255);
        const cool   = fatigue / 255;
        const h = ((hue + energy*hs - cool*(hs*0.6)) % 360 + 360) % 360;
        const s = Math.max(0.2, 0.55 + energy*0.35 - cool*0.25);
        const l = Math.max(0.05, 0.08 + energy*0.42);
        [rr,gg,bb] = hsl(h/360, s, l);
      }
      rgbaBuf[base]=rr; rgbaBuf[base+1]=gg; rgbaBuf[base+2]=bb; rgbaBuf[base+3]=255;
    }
    glCtx.uploadRGBA(rgbaBuf, cols, rows);
  },

  render(ctx, thing, world) {
    const { v, rec, ref, fire, cols, rows, cs } = thing.state;
    const hue    = world.params.hue;
    const hs     = world.params.hueSpread;
    const W      = ctx.canvas.width;
    const H      = ctx.canvas.height;
    const hexW   = cs * 2;
    const hexH   = Math.sqrt(3) * cs;
    const maxRef = world.params.refractory;
    const GAP    = 0.6;
    if (cs <= 4) {
      const img = ctx.createImageData(W, H);
      const d   = img.data;
      for (let i = 0; i < d.length; i += 4) { d[i]=6; d[i+1]=8; d[i+2]=12; d[i+3]=255; }
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const membrane = v[i], fatigue = rec[i], refLeft = ref[i];
          if (membrane < 6 && refLeft === 0) continue;
          const px = Math.round(col * hexW * 0.75 + cs);
          const py = Math.round(row * hexH + hexH * 0.5 + (col & 1) * hexH * 0.5);
          let rr, gg, bb;
          if (refLeft > 0 && !fire[i]) {
            const t = refLeft / Math.max(1, maxRef);
            const h = ((hue + hs * 0.9) % 360 + 360) % 360;
            [rr,gg,bb] = hsl(h/360, 0.35 + t*0.4, 0.20 + t*0.25);
          } else {
            const energy = fire[i] ? 1 : (membrane / 255);
            const cool   = fatigue / 255;
            const h = ((hue + energy*hs - cool*(hs*0.6)) % 360 + 360) % 360;
            [rr,gg,bb] = hsl(h/360, Math.max(0.2, 0.55+energy*0.35-cool*0.25), Math.max(0.05, 0.08+energy*0.42));
          }
          const r2 = Math.max(1, Math.ceil(cs + GAP));
          for (let dy = -r2; dy <= r2; dy++) {
            for (let dx = -r2; dx <= r2; dx++) {
              if (dx*dx+dy*dy > r2*r2) continue;
              const x = px+dx, y = py+dy;
              if (x<0||x>=W||y<0||y>=H) continue;
              const idx = (y*W+x)*4;
              d[idx]=rr; d[idx+1]=gg; d[idx+2]=bb; d[idx+3]=255;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      return;
    }
    ctx.fillStyle = '#06080c';
    ctx.fillRect(0, 0, W, H);
    const drawR = cs + GAP;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const membrane = v[i], fatigue = rec[i], refLeft = ref[i];
        if (membrane < 6 && refLeft === 0) continue;
        const px = Math.round(col * hexW * 0.75 + cs);
        const py = Math.round(row * hexH + hexH * 0.5 + (col & 1) * hexH * 0.5);
        let color;
        if (refLeft > 0 && !fire[i]) {
          const t = refLeft / Math.max(1, maxRef);
          const h = ((hue + hs*0.9) % 360 + 360) % 360;
          color = `hsl(${h},${35+t*40}%,${20+t*25}%)`;
        } else {
          const energy = fire[i] ? 1 : (membrane/255);
          const cool   = fatigue/255;
          const h = ((hue + energy*hs - cool*(hs*0.6)) % 360 + 360) % 360;
          color = `hsl(${h},${Math.max(20,55+energy*35-cool*25)}%,${Math.max(5,8+energy*42)}%)`;
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI/180*(60*k-30);
          const vx = px + drawR*Math.cos(a), vy = py + drawR*Math.sin(a);
          k===0 ? ctx.moveTo(vx,vy) : ctx.lineTo(vx,vy);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }
});
