about({
  title: 'Reaction–Diffusion System',
  text: 'Interacting substances spread and transform over time, producing complex spatial patterns from simple local equations.'
});

params({
  wrapEdges: { label: 'Wrap edges', type: 'checkbox', value: true },
  cellSize:  { label: 'Cell size',    type: 'range', min: 1,  max: 8,   value: 3,   reinit: true },
  preset:    { label: 'Preset 0-7',   type: 'range', min: 0,  max: 7,   value: 3,   reinit: true },
  feed:      { label: 'Feed ×1000',   type: 'range', min: 1,  max: 100, value: 36  },
  kill:      { label: 'Kill ×1000',   type: 'range', min: 1,  max: 100, value: 57  },
  dU:        { label: 'Diffuse U',    type: 'range', min: 1,  max: 50,  value: 15  },
  dV:        { label: 'Diffuse V',    type: 'range', min: 1,  max: 50,  value: 5   },
  dt:        { label: 'Time step',    type: 'range', min: 1,  max: 15,  value: 15   },
  steps:     { label: 'Steps/tick',   type: 'range', min: 1,  max: 20,  value: 20   },
  hue:       { label: 'Hue',          type: 'range', min: 0,  max: 360, value: 219 },
  hueSpread: { label: 'Hue spread',   type: 'range', min: 0,  max: 180, value: 180 },
});

const RD_PRESETS = [
  [37, 60], 
  [29, 57],
  [39, 58],
  [26, 51], 
  [22, 51], 
  [54, 63], 
  [18, 51], 
  [40, 60],
];

function rdHsl(h, s, l) {
  const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const hr = t => {
    if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;
    return p;
  };
  return [Math.round(hr(h+1/3)*255), Math.round(hr(h)*255), Math.round(hr(h-1/3)*255)];
}

define('rd', {

  init(world) {
    const preset = RD_PRESETS[world.params.preset] || RD_PRESETS[0];
    const cs   = world.params.cellSize;
    const cols = Math.floor(world.W / cs);
    const rows = Math.floor(world.H / cs);
    const n    = cols * rows;

    const U     = new Float32Array(new SharedArrayBuffer(n * 4));
    const V     = new Float32Array(new SharedArrayBuffer(n * 4));
    const nextU = new Float32Array(new SharedArrayBuffer(n * 4));
    const nextV = new Float32Array(new SharedArrayBuffer(n * 4));
    const rgbaBuf = new Uint8Array(n * 4);

    U.fill(1.0);
    V.fill(0.0);

    const seedCount = 30;
    const sr = 2;
    for (let s = 0; s < seedCount; s++) {
      const sx = (Math.random() * cols) | 0;
      const sy = (Math.random() * rows) | 0;
      for (let dy = -sr; dy <= sr; dy++) {
        for (let dx = -sr; dx <= sr; dx++) {
          const x = ((sx+dx) % cols + cols) % cols;
          const y = ((sy+dy) % rows + rows) % rows;
          const i = y * cols + x;
          U[i] = 0.5;
          V[i] = 0.25;
        }
      }
    }

    return [{ x: 0, y: 0, state: {
      U, V, nextU, nextV, rgbaBuf, cols, rows, cs,
      initFeed: preset[0], initKill: preset[1],
    }}];
  },

  sensing() { return null; },

  response(state, sensed, thing, all, world) {
    const { U, V, nextU, nextV, cols, rows } = state;

    const f     = world.params.feed  / 1000;
    const k     = world.params.kill  / 1000;
    const Du    = world.params.dU    / 100;
    const Dv    = world.params.dV    / 100;
    const dt    = world.params.dt    / 10;
    const steps = world.params.steps | 0;

    const rowStart = world.rowStart !== undefined ? world.rowStart : 0;
    const rowEnd   = world.rowEnd   !== undefined ? world.rowEnd   : rows;

    for (let step = 0; step < steps; step++) {
      for (let y = rowStart; y < rowEnd; y++) {
        const ym = y === 0       ? rows - 1 : y - 1;
        const yp = y === rows-1  ? 0        : y + 1;
        for (let x = 0; x < cols; x++) {
          const xm = x === 0      ? cols - 1 : x - 1;
          const xp = x === cols-1 ? 0        : x + 1;
          const i  = y * cols + x;
          const u  = U[i], v = V[i];
          const lapU = U[ym*cols+x] + U[yp*cols+x] + U[y*cols+xm] + U[y*cols+xp] - 4*u;
          const lapV = V[ym*cols+x] + V[yp*cols+x] + V[y*cols+xm] + V[y*cols+xp] - 4*v;
          const uvv  = u * v * v;
          let nu = u + dt * (Du * lapU - uvv + f * (1 - u));
          let nv = v + dt * (Dv * lapV + uvv - (f + k) * v);
          nextU[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
          nextV[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
        }
      }
      U.set(nextU); V.set(nextV);
    }

    return state;
  },

  postTick(state) {
  },

  renderGL(glCtx, things, world) {
    const { V, cols, rows, rgbaBuf } = things[0].state;
    const hue = world.params.hue;
    const hs  = world.params.hueSpread;
    const n   = cols * rows;

    for (let i = 0; i < n; i++) {
      const v = V[i];
      const b = i * 4;
      if (v < 0.02) {
        rgbaBuf[b]=6; rgbaBuf[b+1]=8; rgbaBuf[b+2]=12; rgbaBuf[b+3]=255;
        continue;
      }
      const h = ((hue + (1-v)*hs) % 360 + 360) % 360;
      const s = 0.6 + v*0.4;
      const l = 0.05 + v*0.55;
      const [rr,gg,bb] = rdHsl(h/360, s, l);
      rgbaBuf[b]=rr; rgbaBuf[b+1]=gg; rgbaBuf[b+2]=bb; rgbaBuf[b+3]=255;
    }

    glCtx.uploadRGBA(rgbaBuf, cols, rows);
  },

  render(ctx, thing, world) {
    const { V, cols, rows, cs } = thing.state;
    const hue = world.params.hue;
    const hs  = world.params.hueSpread;
    const W   = ctx.canvas.width;
    const H   = ctx.canvas.height;
    const img = ctx.createImageData(W, H);
    const d   = img.data;
    for (let i = 0; i < d.length; i+=4) { d[i]=6; d[i+1]=8; d[i+2]=12; d[i+3]=255; }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = V[y*cols+x];
        if (v < 0.02) continue;
        const h = ((hue+(1-v)*hs)%360+360)%360;
        const [rr,gg,bb] = rdHsl(h/360, 0.6+v*0.4, 0.05+v*0.55);
        const px=x*cs, py=y*cs;
        for (let row=0; row<cs&&py+row<H; row++) {
          const base=((py+row)*W+px)*4;
          for (let col=0; col<cs&&px+col<W; col++) {
            const idx=base+col*4;
            d[idx]=rr; d[idx+1]=gg; d[idx+2]=bb; d[idx+3]=255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
});
