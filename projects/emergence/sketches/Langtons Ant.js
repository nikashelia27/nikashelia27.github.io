about({
  title: 'Langton’s Ant',
  text: 'Ants move on a grid, turning based on the current cell’s state, flipping it, and moving forward. These simple rules produce chaotic motion that can organize into repeating structures.'
});

params({
  wrapEdges: { label: 'Wrap edges', type: 'checkbox', value: true },
  cellSize:     { label: 'Cell size',    type: 'range', min: 1,  max: 8,   value: 2,   reinit: true },
  antCount:     { label: 'Ant count',    type: 'range', min: 1,  max: 16,  value: 3,   reinit: true },
  stepsPerTick: { label: 'Steps/tick',   type: 'range', min: 1,  max: 500, value: 500  },
  preset:       { label: 'Rule preset',  type: 'range', min: 0,  max: 7,   value: 5,   reinit: true },
});
const ANT_RULES = [
  'RL',           // 0 — Classic: ~10k steps of chaos then infinite highway
  'RLR',          // 1 — Fills a growing wedge
  'LLRR',         // 2 — Symmetric plane filler
  'LRRL',         // 3 — Diagonal highway
  'RRLL',         // 4 — Complex symmetric growth
  'LLLRRR',       // 5 — 6-color complex
  'RLLR',         // 6 — Square spiral
  'RLLLRLLLRLL',  // 7 — Very complex, slow structure
];

function antHsl(h, s, l) {
  if (s === 0) { const v=Math.round(l*255); return [v,v,v]; }
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const hr=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
  const hh=h/360;
  return [Math.round(hr(hh+1/3)*255),Math.round(hr(hh)*255),Math.round(hr(hh-1/3)*255)];
}

function buildColorTable(numStates) {
  const table = [];
  for (let s = 0; s < numStates; s++) {
    if (s === 0) { table.push([10, 10, 14]); continue; }
    const h = (s / numStates) * 360;
    table.push(antHsl(h, 0.85, 0.55));
  }
  return table;
}
const ANT_DX = [0, 1,  0, -1];
const ANT_DY = [-1, 0, 1,  0];
define('ant', {
  init(world) {
    const cs   = world.params.cellSize;
    const cols = Math.floor(world.W / cs);
    const rows = Math.floor(world.H / cs);
    const n    = cols * rows;
    const ruleStr  = ANT_RULES[world.params.preset] || ANT_RULES[0];
    const numStates = ruleStr.length;
    const grid    = new Uint8Array(n);
    const rgbaBuf = new Uint8Array(n * 4);
    const colorTable = buildColorTable(numStates);
    const antCount = world.params.antCount;
    const antX   = new Int32Array(antCount);
    const antY   = new Int32Array(antCount);
    const antDir = new Uint8Array(antCount);
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    for (let i = 0; i < antCount; i++) {
      antX[i]   = cx + ((Math.random() - 0.5) * 10 | 0);
      antY[i]   = cy + ((Math.random() - 0.5) * 10 | 0);
      antDir[i] = (Math.random() * 4) | 0;
    }

    return [{x: 0, y: 0, state: {
      grid, rgbaBuf, cols, rows, cs,
      antX, antY, antDir, antCount,
      ruleStr, numStates, colorTable,
      totalSteps: 0,
    }}];
  },

  sensing() { return null; },

  response(state, sensed, thing, all, world) {
    const { grid, cols, rows, antX, antY, antDir, ruleStr, numStates, antCount } = state;
    const steps = world.params.stepsPerTick | 0;
    const wrap  = world.wrap;
    for (let step = 0; step < steps; step++) {
      for (let a = 0; a < antCount; a++) {
        const x = antX[a], y = antY[a];
        const ci = y * cols + x;
        const cellState = grid[ci];
        const rule = ruleStr[cellState];
        let dir = antDir[a];
        if      (rule === 'R') dir = (dir + 1) & 3;
        else if (rule === 'L') dir = (dir + 3) & 3;
        else if (rule === 'U') dir = (dir + 2) & 3;
        antDir[a] = dir;
        grid[ci] = (cellState + 1) % numStates;
        let nx = x + ANT_DX[dir];
        let ny = y + ANT_DY[dir];
        if (wrap) {
          nx = ((nx % cols) + cols) % cols;
          ny = ((ny % rows) + rows) % rows;
        } else {
          if (nx < 0) nx = 0; else if (nx >= cols) nx = cols - 1;
          if (ny < 0) ny = 0; else if (ny >= rows) ny = rows - 1;
        }
        antX[a] = nx;
        antY[a] = ny;
      }
    }
    state.totalSteps += steps;
    return state;
  },
  renderGL(glCtx, things, world) {
    const { grid, cols, rows, rgbaBuf, colorTable, antX, antY, antCount } = things[0].state;
    const n = cols * rows;

    for (let i = 0; i < n; i++) {
      const c = colorTable[grid[i]];
      const b = i * 4;
      rgbaBuf[b]=c[0]; rgbaBuf[b+1]=c[1]; rgbaBuf[b+2]=c[2]; rgbaBuf[b+3]=255;
    }
    for (let a = 0; a < antCount; a++) {
      const b = (antY[a] * cols + antX[a]) * 4;
      rgbaBuf[b]=255; rgbaBuf[b+1]=255; rgbaBuf[b+2]=0; rgbaBuf[b+3]=255;
    }
    glCtx.uploadRGBA(rgbaBuf, cols, rows);
  },
  render(ctx, thing, world) {
    const { grid, cols, rows, cs, colorTable, antX, antY, antCount } = thing.state;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const img = ctx.createImageData(W, H);
    const d   = img.data;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c  = colorTable[grid[y*cols+x]];
        const px = x*cs, py = y*cs;
        for (let row = 0; row < cs && py+row < H; row++) {
          const base = ((py+row)*W+px)*4;
          for (let col = 0; col < cs && px+col < W; col++) {
            const idx = base+col*4;
            d[idx]=c[0]; d[idx+1]=c[1]; d[idx+2]=c[2]; d[idx+3]=255;
          }
        }
      }
    }
    for (let a = 0; a < antCount; a++) {
      const px = antX[a]*cs, py = antY[a]*cs;
      for (let row = 0; row < cs && py+row < H; row++) {
        const base = ((py+row)*W+px)*4;
        for (let col = 0; col < cs && px+col < W; col++) {
          const idx = base+col*4;
          d[idx]=255; d[idx+1]=255; d[idx+2]=0; d[idx+3]=255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
});
