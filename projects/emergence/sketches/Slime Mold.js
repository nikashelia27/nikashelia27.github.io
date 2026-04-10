about({
  title: 'Slime Mold',
  text: 'Simple agents follow gradients of diffusing trails and resources, collectively forming efficient networks through local sensing, deposition, and decay. Try giving it food'
});

params({
  wrapEdges:       { label: 'Wrap edges',          type: 'checkbox', value: false },
  agents:          { label: 'Agents',              type: 'range', min: 1000, max: 120000, value: 98069, reinit: true },
  sensorAngle:     { label: 'Sensor angle',        type: 'range', min: 5,    max: 90,     value: 56  },
  sensorDist:      { label: 'Sensor dist',         type: 'range', min: 2,    max: 40,     value: 26  },
  turnSpeed:       { label: 'Turn speed',          type: 'range', min: 1,    max: 60,     value: 60  },
  moveSpeed:       { label: 'Move speed',          type: 'range', min: 1,    max: 10,     value: 10   },
  deposit:         { label: 'Explore deposit',     type: 'range', min: 1,    max: 80,     value: 23  },
  foodDeposit:     { label: 'Food deposit',        type: 'range', min: 1,    max: 120,    value: 42  },
  decay:           { label: 'Explore decay %',     type: 'range', min: 1,    max: 60,     value: 10  },
  diffuse:         { label: 'Explore diffuse %',   type: 'range', min: 0,    max: 100,    value: 28  },
  foodTrailDecay:  { label: 'Food trail decay %',  type: 'range', min: 1,    max: 60,     value: 10  },
  foodTrailDiffuse:{ label: 'Food trail diffuse %',type: 'range', min: 0,    max: 100,    value: 22  },
  jitter:          { label: 'Jitter',              type: 'range', min: 0,    max: 60,     value: 28   },
  brushSize:       { label: 'Brush size',          type: 'range', min: 1,    max: 40,     value: 10  },
  foodStrength:    { label: 'Food attraction',     type: 'range', min: 1,    max: 200,    value: 200 },
  foodFill:        { label: 'Painted food amount', type: 'range', min: 10,   max: 300,    value: 240 },
  foodConsume:     { label: 'Food consume',        type: 'range', min: 1,    max: 200,    value: 11  },
  directFoodGain:  { label: 'Direct food gain',    type: 'range', min: 1,    max: 100,    value: 24  },
  energyDrain:     { label: 'Energy drain',        type: 'range', min: 0,    max: 50,     value: 5   },
  startEnergy:     { label: 'Start energy',        type: 'range', min: 10,   max: 200,    value: 150, reinit: true },
  maxEnergy:       { label: 'Max energy',          type: 'range', min: 20,   max: 300,    value: 220 },
  lowEnergy:       { label: 'Low energy %',        type: 'range', min: 5,    max: 90,     value: 35  },
  shareRadius:     { label: 'Share radius',        type: 'range', min: 2,    max: 24,     value: 8   },
  shareRate:       { label: 'Share rate',          type: 'range', min: 0,    max: 60,     value: 38  },
  shareLoss:       { label: 'Share loss %',        type: 'range', min: 0,    max: 80,     value: 3   },
  donorMin:        { label: 'Donor min %',         type: 'range', min: 10,   max: 100,    value: 65  },
  receiverMax:     { label: 'Receiver max %',      type: 'range', min: 1,    max: 90,     value: 35  },
  leaderSense:     { label: 'Leader sense',        type: 'range', min: 0,    max: 100,    value: 69   },
  spawnMode:       { label: 'Spawn 0=disk 1=scatter 2=ring', type: 'range', min: 0, max: 2, value: 1, reinit: true },

  edgeMargin:      { label: 'Edge margin',         type: 'range', min: 0,    max: 80,     value: 18  },
  edgeTurnBoost:   { label: 'Edge turn boost',     type: 'range', min: 0,    max: 200,    value: 55  },
  visualThickness: { label: 'Visual thickness',    type: 'range', min: 1,    max: 6,      value: 2   },
});

define('slime', {
  agentParallel: true,

  init(world) {
    const N      = world.params.agents;
    const mode   = Math.round(world.params.spawnMode);
    const cx     = world.W * 0.5;
    const cy     = world.H * 0.5;
    const r0     = Math.min(world.W, world.H) * 0.18;
    const startE = world.params.startEnergy || 150;

    const px     = new Float32Array(new SharedArrayBuffer(N * 4));
    const py     = new Float32Array(new SharedArrayBuffer(N * 4));
    const ang    = new Float32Array(new SharedArrayBuffer(N * 4));
    const energy = new Float32Array(new SharedArrayBuffer(N * 4));
    const alive  = new Uint8Array(new SharedArrayBuffer(N));
    const drain  = new Float32Array(new SharedArrayBuffer(N * 4));

    for (let i = 0; i < N; i++) {
      if (mode === 1) {
        px[i]  = Math.random() * world.W;
        py[i]  = Math.random() * world.H;
        ang[i] = Math.random() * Math.PI * 2;
      } else if (mode === 2) {
        const a = Math.random() * Math.PI * 2;
        px[i]  = cx + Math.cos(a) * r0;
        py[i]  = cy + Math.sin(a) * r0;
        ang[i] = a + Math.PI;
      } else {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r0;
        px[i]  = cx + Math.cos(a) * d;
        py[i]  = cy + Math.sin(a) * d;
        ang[i] = a;
      }
      energy[i] = startE * (0.4 + Math.random() * 0.6);
      alive[i]  = 1;
      drain[i]  = 0.75 + Math.random() * 0.75;
    }

    const cols           = Math.ceil(world.W / 2);
    const rows           = Math.ceil(world.H / 2);
    const cells          = cols * rows;

    const exploreTrail   = new Float32Array(new SharedArrayBuffer(cells * 4));
    const exploreScratch = new Float32Array(new SharedArrayBuffer(cells * 4));
    const foodTrail      = new Float32Array(new SharedArrayBuffer(cells * 4));
    const foodScratch    = new Float32Array(new SharedArrayBuffer(cells * 4));
    const supportField   = new Float32Array(new SharedArrayBuffer(cells * 4));
    const supportScratch = new Float32Array(new SharedArrayBuffer(cells * 4));
    const walls          = new Uint8Array(new SharedArrayBuffer(cells));
    const food           = new Float32Array(new SharedArrayBuffer(cells * 4));
    const rgbaBuf        = new Uint8Array(cells * 4);

    return [{
      x: 0,
      y: 0,
      state: {
        px, py, ang, energy, alive, drain,
        exploreTrail, exploreScratch,
        foodTrail, foodScratch,
        supportField, supportScratch,
        walls, food, rgbaBuf,
        cols, rows, count: N, W: world.W, H: world.H,
        brushSize: world.params.brushSize || 10
      }
    }];
  },

  _teardown() {
    const bar = document.getElementById('slime-toolbar');
    if (bar) bar.remove();
    if (this._abortCtrl) { this._abortCtrl.abort(); this._abortCtrl = null; }
    if (this._sketchObserver) { this._sketchObserver.disconnect(); this._sketchObserver = null; }
    this._toolbarMounted = false;
    this._currentState = null;
    this._painting = false;
  },

  _setupDOM(state) {
    this._currentState = state;
    if (this._toolbarMounted) return;
    this._toolbarMounted = true;

    const bar = document.createElement('div');
    bar.id = 'slime-toolbar';
    bar.style.cssText = `
      position:absolute; top:8px; left:50%; transform:translateX(-50%);
      display:flex; gap:6px; z-index:9999; pointer-events:auto;
      background:rgba(10,10,10,0.80); border:1px solid #2a2a2a;
      border-radius:3px; padding:5px 8px; font-family:'DM Mono',monospace;
      flex-wrap:wrap;
    `;

    const paintModes = [
      { mode: 0, label: '🧱 Wall',  color: '#aaa'    },
      { mode: 1, label: '🍎 Food',  color: '#c8f135' },
      { mode: 2, label: '🧹 Erase', color: '#ff6666' },
    ];

    for (const m of paintModes) {
      const btn = document.createElement('button');
      btn.className      = 'paint-btn';
      btn.dataset.mode   = m.mode;
      btn.dataset.active = m.mode === 0 ? '1' : '0';
      btn.textContent    = m.label;
      btn.style.cssText  = `
        font-family:'DM Mono',monospace; font-size:10px; cursor:pointer;
        padding:4px 9px; border-radius:2px; border:1px solid #2a2a2a;
        background:${m.mode === 0 ? '#1e1e1e' : 'transparent'};
        color:${m.color}; letter-spacing:1px; transition:background .15s;
      `;
      btn.onclick = () => {
        bar.querySelectorAll('.paint-btn').forEach(b => {
          b.dataset.active = '0';
          b.style.background = 'transparent';
        });
        btn.dataset.active = '1';
        btn.style.background = '#1e1e1e';
      };
      bar.appendChild(btn);
    }

    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;background:#2a2a2a;margin:0 2px;display:inline-block;';
    bar.appendChild(sep);

    const mkClear = (label, fn) => {
      const b = document.createElement('button');
      b.textContent   = label;
      b.style.cssText = `font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;
        padding:4px 9px;border-radius:2px;border:1px solid #2a2a2a;
        background:transparent;color:#555;letter-spacing:1px;`;
      b.onclick = fn;
      bar.appendChild(b);
    };

    mkClear('Clear walls', () => this._currentState && this._currentState.walls.fill(0));
    mkClear('Clear food',  () => this._currentState && this._currentState.food.fill(0));

    const canvasArea = document.querySelector('.canvas-area');
    canvasArea.style.position = 'relative';
    canvasArea.appendChild(bar);

    const sketchLabel = document.getElementById('sSketch');
    const originalName = sketchLabel ? sketchLabel.textContent : null;
    if (sketchLabel) {
      this._sketchObserver = new MutationObserver(() => {
        if (sketchLabel.textContent !== originalName) this._teardown();
      });
      this._sketchObserver.observe(sketchLabel, { childList: true, characterData: true, subtree: true });
    }

    const getPaintMode = () => {
      for (const b of bar.querySelectorAll('.paint-btn')) {
        if (b.dataset.active === '1') return +b.dataset.mode;
      }
      return 0;
    };

    const repaintCell = (idx, s, fillFood) => {
      const { walls, food, exploreTrail, foodTrail, supportField, rgbaBuf } = s;
      const b4 = idx * 4;

      if (walls[idx]) {
        rgbaBuf[b4]   = 80;
        rgbaBuf[b4+1] = 80;
        rgbaBuf[b4+2] = 80;
        rgbaBuf[b4+3] = 255;
      } else if (food[idx] > 0) {
        const f = Math.min(1, food[idx] / Math.max(1, fillFood));
        rgbaBuf[b4]   = Math.round(90 + f * 90);
        rgbaBuf[b4+1] = 255;
        rgbaBuf[b4+2] = Math.round(60 + f * 80);
        rgbaBuf[b4+3] = 255;
      } else {
        const e  = Math.min(1, exploreTrail[idx]);
        const ft = Math.min(1, foodTrail[idx]);
        const sf = Math.min(1, supportField[idx]);
        rgbaBuf[b4]   = Math.round(e * 60);
        rgbaBuf[b4+1] = Math.round(120 + e * 135);
        rgbaBuf[b4+2] = Math.round(e * 60 + ft * 40);
        rgbaBuf[b4+3] = 255;
      }
    };

    this._painting = false;

    const paintAt = (clientX, clientY) => {
      const s = this._currentState;
      if (!s) return;

      const cvs    = document.getElementById('canvas');
      const rect   = cvs.getBoundingClientRect();
      const scaleX = cvs.width / rect.width;
      const scaleY = cvs.height / rect.height;
      const mx     = (clientX - rect.left) * scaleX;
      const my     = (clientY - rect.top)  * scaleY;

      const { cols, rows, walls, food, exploreTrail, foodTrail, supportField } = s;
      const gcx      = Math.floor(mx / 2);
      const gcy      = Math.floor(my / 2);
      const br       = Math.ceil((s.brushSize || 10) / 2);
      const pmode    = getPaintMode();
      const fillFood = (window.world?.params?.foodFill || 120);

      for (let dy = -br; dy <= br; dy++) {
        for (let dx = -br; dx <= br; dx++) {
          if (dx * dx + dy * dy > br * br) continue;
          const gx = gcx + dx;
          const gy = gcy + dy;
          if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;

          const idx = gy * cols + gx;

          if (pmode === 0) {
            walls[idx] = 1;
            food[idx] = 0;
            exploreTrail[idx] = 0;
            foodTrail[idx] = 0;
            supportField[idx] = 0;
          } else if (pmode === 1) {
            food[idx] = fillFood;
            walls[idx] = 0;
          } else {
            walls[idx] = 0;
            food[idx] = 0;
            exploreTrail[idx] = 0;
            foodTrail[idx] = 0;
            supportField[idx] = 0;
          }

          repaintCell(idx, s, fillFood);
        }
      }
    };

    this._abortCtrl = new AbortController();
    const sig = { signal: this._abortCtrl.signal };
    const cvs = document.getElementById('canvas');
    cvs.addEventListener('mousedown',  e => { this._painting = true; paintAt(e.clientX, e.clientY); }, sig);
    cvs.addEventListener('mousemove',  e => { if (this._painting) paintAt(e.clientX, e.clientY); }, sig);
    window.addEventListener('mouseup', () => { this._painting = false; }, sig);
    cvs.addEventListener('touchstart', e => { this._painting = true; paintAt(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { ...sig, passive: false });
    cvs.addEventListener('touchmove',  e => { if (this._painting) paintAt(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { ...sig, passive: false });
    window.addEventListener('touchend', () => { this._painting = false; }, sig);
  },

  postTick(state, params, wrap, W, H) {
    const {
      exploreTrail, exploreScratch,
      foodTrail, foodScratch,
      supportField, supportScratch,
      walls, food, rgbaBuf,
      cols, rows
    } = state;

    const exploreDiffuse = params.diffuse * 0.01;
    const exploreDecay   = 1 - params.decay * 0.01;
    const foodDiffuse    = params.foodTrailDiffuse * 0.01;
    const foodDecay      = 1 - params.foodTrailDecay * 0.01;
    const supportDiffuse = Math.min(0.95, foodDiffuse * 1.15 + 0.05);
    const supportDecay   = Math.max(0, 1 - (params.foodTrailDecay * 0.01 * 1.8 + 0.03));
    const foodFill       = params.foodFill || 120;
    const edgeMargin     = params.edgeMargin || 0;

    state.brushSize = params.brushSize || 10;

    const wrapX = x => ((x % cols) + cols) % cols;
    const wrapY = y => ((y % rows) + rows) % rows;
    const edgeCellsX = Math.ceil(edgeMargin / 2);
    const edgeCellsY = Math.ceil(edgeMargin / 2);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;

        if (!wrap) {
          const inEdgeBand =
            x < edgeCellsX || x >= cols - edgeCellsX ||
            y < edgeCellsY || y >= rows - edgeCellsY;
          if (inEdgeBand) {
            exploreScratch[idx] = 0;
            foodScratch[idx] = 0;
            supportScratch[idx] = 0;
            continue;
          }
        }

        if (walls[idx]) {
          exploreScratch[idx] = 0;
          foodScratch[idx] = 0;
          supportScratch[idx] = 0;
          continue;
        }

        let sumE = 0, nE = 0;
        let sumF = 0, nF = 0;
        let sumS = 0, nS = 0;

        for (let dy = -1; dy <= 1; dy++) {
          let ny = y + dy;
          if (wrap) ny = wrapY(ny);
          else if (ny < 0 || ny >= rows) continue;

          for (let dx = -1; dx <= 1; dx++) {
            let nx = x + dx;
            if (wrap) nx = wrapX(nx);
            else if (nx < 0 || nx >= cols) continue;

            const ni = ny * cols + nx;
            if (walls[ni]) continue;
            sumE += exploreTrail[ni]; nE++;
            sumF += foodTrail[ni];    nF++;
            sumS += supportField[ni]; nS++;
          }
        }

        exploreScratch[idx] = nE ? sumE / nE : 0;
        foodScratch[idx]    = nF ? sumF / nF : 0;
        supportScratch[idx] = nS ? sumS / nS : 0;
      }
    }

    for (let i = 0, len = cols * rows; i < len; i++) {
      const b = i * 4;

      if (!wrap) {
        const x = i % cols;
        const y = Math.floor(i / cols);
        const inEdgeBand =
          x < edgeCellsX || x >= cols - edgeCellsX ||
          y < edgeCellsY || y >= rows - edgeCellsY;
        if (inEdgeBand) {
          exploreTrail[i] = 0;
          foodTrail[i] = 0;
          supportField[i] = 0;
          rgbaBuf[b]   = 0;
          rgbaBuf[b+1] = 0;
          rgbaBuf[b+2] = 0;
          rgbaBuf[b+3] = 255;
          continue;
        }
      }

      if (walls[i]) {
        exploreTrail[i] = 0;
        foodTrail[i] = 0;
        supportField[i] = 0;
        rgbaBuf[b]   = 80;
        rgbaBuf[b+1] = 80;
        rgbaBuf[b+2] = 80;
        rgbaBuf[b+3] = 255;
        continue;
      }

      const ev = (exploreTrail[i] * (1 - exploreDiffuse) + exploreScratch[i] * exploreDiffuse) * exploreDecay;
      const fv = (foodTrail[i]    * (1 - foodDiffuse)    + foodScratch[i]    * foodDiffuse)    * foodDecay;
      const sv = (supportField[i] * (1 - supportDiffuse) + supportScratch[i] * supportDiffuse) * supportDecay;

      exploreTrail[i] = ev < 0 ? 0 : ev;
      foodTrail[i]    = fv < 0 ? 0 : fv;
      supportField[i] = sv < 0 ? 0 : sv;

      if (food[i] > 0) {
        const f = Math.min(1, food[i] / Math.max(1, foodFill));
        rgbaBuf[b]   = Math.round(90 + f * 90);
        rgbaBuf[b+1] = 255;
        rgbaBuf[b+2] = Math.round(60 + f * 80);
        rgbaBuf[b+3] = 255;
      } else {
        const e  = Math.min(1, exploreTrail[i]);
        const ft = Math.min(1, foodTrail[i]);
        const sf = Math.min(1, supportField[i]);
        rgbaBuf[b]   = (e > 0.02) ? Math.round(e * 48) : 0;
      rgbaBuf[b+1] = (e > 0.02) ? Math.round(90 + e * 90) : 0;
      rgbaBuf[b+2] = (e > 0.02) ? Math.round(e * 48 + ft * 30) : 0;
        rgbaBuf[b+3] = 255;
      }
    }

    state.W = W;
    state.H = H;
  },

  response(state, _s, _t, _all, world) {
    const {
      px, py, ang, energy, alive, drain,
      exploreTrail, foodTrail, supportField,
      walls, food, cols, rows, W, H
    } = state;

    const iStart = world.iStart;
    const iEnd   = world.iEnd;
    if (iStart === undefined || iEnd === undefined) return state;

    const sAngle         = world.params.sensorAngle * Math.PI / 180;
    const sDist          = world.params.sensorDist;
    const baseTurnSpeed  = world.params.turnSpeed * Math.PI / 180;
    const baseMoveSpeed  = world.params.moveSpeed;
    const depExplore     = world.params.deposit * 0.01;
    const depFood        = world.params.foodDeposit * 0.01;
    const baseJitter     = world.params.jitter * Math.PI / 180;
    const foodAttr       = (world.params.foodStrength || 120) * 0.01;
    const foodConsume    = (world.params.foodConsume || 6) * 0.01;
    const directFoodGain = (world.params.directFoodGain || 24) * 0.01;
    const energyDrain    = (world.params.energyDrain || 5) * 0.01;
    const maxEnergy      = world.params.maxEnergy || 120;
    const lowEnergyFrac  = (world.params.lowEnergy || 35) * 0.01;
    const shareRate      = (world.params.shareRate || 6) * 0.01;
    const shareLoss      = (world.params.shareLoss || 20) * 0.01;
    const donorMin       = (world.params.donorMin || 65) * 0.01;
    const receiverMax    = (world.params.receiverMax || 35) * 0.01;
    const leaderSense    = (world.params.leaderSense || 30) * 0.01;

    const edgeMargin     = world.params.edgeMargin || 0;
    const edgeTurnBoost  = (world.params.edgeTurnBoost || 0) * 0.01;

    const hungerOf = eNorm => 1 - eNorm;
    const wrapCol = x => ((x % cols) + cols) % cols;
    const wrapRow = y => ((y % rows) + rows) % rows;

    const nearEdge = (x, y) => (
      !world.wrap &&
      (
        x < edgeMargin || x >= W - edgeMargin ||
        y < edgeMargin || y >= H - edgeMargin
      )
    );

    const sample = (x, y, eNorm) => {
      if (nearEdge(x, y)) return -1e9;

      let gx = Math.floor(x / 2);
      let gy = Math.floor(y / 2);

      if (world.wrap) {
        gx = wrapCol(gx);
        gy = wrapRow(gy);
      } else {
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return -1e9;
      }

      const idx = gy * cols + gx;
      if (walls[idx]) return -1e9;

      const hunger = hungerOf(eNorm);
      const foodBias = hunger * hunger;
      const exploreBias = 1 - foodBias * 0.85;

      return (
        exploreTrail[idx] * (0.25 + exploreBias * 1.15) +
        foodTrail[idx]    * (0.10 + foodBias * 2.40) +
        supportField[idx] * (0.04 + foodBias * (1.10 * leaderSense))
      );
    };

    const directFoodAt = (x, y, eNorm) => {
      if (nearEdge(x, y)) return -1e9;

      let gx = Math.floor(x / 2);
      let gy = Math.floor(y / 2);

      if (world.wrap) {
        gx = wrapCol(gx);
        gy = wrapRow(gy);
      } else {
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return -1e9;
      }

      const idx = gy * cols + gx;
      if (walls[idx]) return -1e9;

      const hunger = hungerOf(eNorm);
      const f = food[idx];
      return f > 0 ? ((0.8 + hunger * 2.4) + f * foodAttr) * 2.8 : 0;
    };

    const directFoodRay = (x, y, dir, eNorm) => {
      let best = 0;
      const s1 = directFoodAt(x + Math.cos(dir) * sDist,       y + Math.sin(dir) * sDist,       eNorm);
      const s2 = directFoodAt(x + Math.cos(dir) * (sDist * 2), y + Math.sin(dir) * (sDist * 2), eNorm);
      const s3 = directFoodAt(x + Math.cos(dir) * (sDist * 3), y + Math.sin(dir) * (sDist * 3), eNorm);
      if (s1 > best) best = s1;
      if (s2 > best) best = s2;
      if (s3 > best) best = s3;
      return best;
    };

    for (let i = iStart; i < iEnd; i++) {
      if (!alive[i]) continue;
      if (energy[i] <= 0) {
        alive[i] = 0;
        energy[i] = 0;
        continue;
      }

      const eNorm    = Math.max(0, Math.min(1, energy[i] / Math.max(1, maxEnergy)));
      const hunger   = hungerOf(eNorm);
      const starving = eNorm < lowEnergyFrac;
      const slow     = Math.max(0.08, 0.45 + eNorm * 0.55);

      const moveSpeed = baseMoveSpeed * slow;
      const turnSpeed = baseTurnSpeed * (0.65 + 0.35 * slow + hunger * 0.15);
      const jitter    = baseJitter * (starving ? (1.1 + hunger * 1.6) : (0.75 + (1 - eNorm) * 0.4));

      const a = ang[i];
      const ix = px[i];
      const iy = py[i];

      let fwd = sample(ix + Math.cos(a) * sDist,          iy + Math.sin(a) * sDist,          eNorm)
              + directFoodRay(ix, iy, a, eNorm);
      let lft = sample(ix + Math.cos(a - sAngle) * sDist, iy + Math.sin(a - sAngle) * sDist, eNorm)
              + directFoodRay(ix, iy, a - sAngle, eNorm);
      let rgt = sample(ix + Math.cos(a + sAngle) * sDist, iy + Math.sin(a + sAngle) * sDist, eNorm)
              + directFoodRay(ix, iy, a + sAngle, eNorm);

      let edgeDx = 0;
      let edgeDy = 0;
      if (!world.wrap && edgeMargin > 0) {
        if (ix < edgeMargin) edgeDx += 1 - (ix / edgeMargin);
        else if (ix > W - edgeMargin) edgeDx -= 1 - ((W - ix) / edgeMargin);

        if (iy < edgeMargin) edgeDy += 1 - (iy / edgeMargin);
        else if (iy > H - edgeMargin) edgeDy -= 1 - ((H - iy) / edgeMargin);
      }

      if (edgeDx !== 0 || edgeDy !== 0) {
        const avoidA = Math.atan2(edgeDy, edgeDx);
        const weight = Math.min(1.5, Math.hypot(edgeDx, edgeDy) * edgeTurnBoost);
        const edgeSense = 2.2 * weight;
        const bias = dir => {
          const d = Math.atan2(Math.sin(dir - avoidA), Math.cos(dir - avoidA));
          return Math.cos(d) * edgeSense;
        };
        fwd += bias(a);
        lft += bias(a - sAngle);
        rgt += bias(a + sAngle);
      }

      let na = a;
      if      (fwd >= lft && fwd >= rgt) {}
      else if (lft > rgt)                na = a - turnSpeed;
      else if (rgt > lft)                na = a + turnSpeed;
      else                               na = a + (Math.random() < 0.5 ? -turnSpeed : turnSpeed);

      na += (Math.random() - 0.5) * jitter;

      let nx = ix + Math.cos(na) * moveSpeed;
      let ny = iy + Math.sin(na) * moveSpeed;

      const blockedByEdge = nearEdge(nx, ny);

      if (blockedByEdge) {
        nx = ix;
        ny = iy;

        const ax = ix < W * 0.5 ? 1 : -1;
        const ay = iy < H * 0.5 ? 1 : -1;
        const avoidA = Math.atan2(ay, ax);
        na = avoidA + (Math.random() - 0.5) * 0.9;
      } else {
        const testPos = world.wrap
          ? world.wrapPos(nx, ny)
          : {
              x: Math.max(0, Math.min(W - 0.01, nx)),
              y: Math.max(0, Math.min(H - 0.01, ny))
            };

        const ngx = Math.floor(testPos.x / 2);
        const ngy = Math.floor(testPos.y / 2);

        if (ngx >= 0 && ngx < cols && ngy >= 0 && ngy < rows && walls[ngy * cols + ngx]) {
          nx = ix;
          ny = iy;
          na = Math.random() * Math.PI * 2;
        } else {
          nx = testPos.x;
          ny = testPos.y;
        }
      }

      px[i] = nx;
      py[i] = ny;
      ang[i] = na;

      const gx = Math.floor(nx / 2);
      const gy = Math.floor(ny / 2);

      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        const idx = gy * cols + gx;
        if (!walls[idx]) {
          const onFood = food[idx] > 0;
          const eNormNow = Math.max(0, Math.min(1, energy[i] / Math.max(1, maxEnergy)));
          const hungerNow = 1 - eNormNow;

          const ev = exploreTrail[idx] + depExplore * (0.35 + eNormNow * 0.65);
          exploreTrail[idx] = ev > 1 ? 1 : ev;

          if (onFood) {
            const eaten = Math.min(food[idx], foodConsume);
            food[idx] -= eaten;
            energy[i] += eaten * directFoodGain * maxEnergy;

            const fBoost = depFood * (0.8 + hungerNow * 1.8 + eNormNow * 0.5);
            const fv = foodTrail[idx] + fBoost;
            foodTrail[idx] = fv > 1 ? 1 : fv;

            if (energy[i] > donorMin * maxEnergy) {
              const sv = supportField[idx] + depFood * 0.35;
              supportField[idx] = sv > 1 ? 1 : sv;
            }
          } else {
            const localFoodSignal = foodTrail[idx] * (0.25 + hungerNow * 0.75);
            if (localFoodSignal > 0.02) {
              const fv = foodTrail[idx] + depFood * 0.08 * hungerNow;
              foodTrail[idx] = fv > 1 ? 1 : fv;
            }
          }

          energy[i] -= energyDrain * drain[i];
          if (energy[i] > maxEnergy) energy[i] = maxEnergy;
          if (energy[i] <= 0) {
            energy[i] = 0;
            alive[i] = 0;
            continue;
          }

          const donorThresh = donorMin * maxEnergy;
          const recvThresh  = receiverMax * maxEnergy;

          if (energy[i] > donorThresh) {
            const spareFrac = (energy[i] - donorThresh) / Math.max(1, maxEnergy);
            const signal = shareRate * (0.35 + spareFrac * 0.65);
            const sv = supportField[idx] + signal;
            supportField[idx] = sv > 1 ? 1 : sv;
          }

          if (energy[i] < recvThresh && supportField[idx] > 0.01) {
            const need = recvThresh - energy[i];
            const gained = Math.min(need, supportField[idx] * shareRate * maxEnergy * (1 - shareLoss));
            if (gained > 0) {
              energy[i] += gained;
              supportField[idx] = Math.max(0, supportField[idx] - gained / Math.max(1, maxEnergy));
            }
          }
        }
      } else {
        energy[i] -= energyDrain * drain[i];
        if (energy[i] <= 0) {
          energy[i] = 0;
          alive[i] = 0;
        }
      }
    }

    return state;
  },

  renderGL(glCtx, things, world) {
    this._setupDOM(things[0].state);
    const { rgbaBuf, cols, rows } = things[0].state;
    const scale = Math.max(1, Math.round(world.params.visualThickness || 1));

    if (scale === 1) {
      glCtx.uploadRGBA(rgbaBuf, cols, rows);
      return;
    }

    const outCols = cols * scale;
    const outRows = rows * scale;
    const out = new Uint8Array(outCols * outRows * 4);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const src = (y * cols + x) * 4;
        const r = rgbaBuf[src];
        const g = rgbaBuf[src + 1];
        const b = rgbaBuf[src + 2];
        const a = rgbaBuf[src + 3];

        for (let yy = 0; yy < scale; yy++) {
          const oy = y * scale + yy;
          for (let xx = 0; xx < scale; xx++) {
            const ox = x * scale + xx;
            const dst = (oy * outCols + ox) * 4;
            out[dst]     = r;
            out[dst + 1] = g;
            out[dst + 2] = b;
            out[dst + 3] = a;
          }
        }
      }
    }

    glCtx.uploadRGBA(out, outCols, outRows);
  },

  render(ctx, thing, world) {
    this._setupDOM(thing.state);

    const { exploreTrail, foodTrail, supportField, walls, food, cols, rows } = thing.state;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const baseX = W / cols;
    const baseY = H / rows;
    const scale = Math.max(1, world.params.visualThickness || 1);
    const drawW = Math.ceil(baseX * scale);
    const drawH = Math.ceil(baseY * scale);
    const foodFill = world.params.foodFill || 120;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const rx = x * baseX;
        const ry = y * baseY;

        if (walls[idx]) {
          ctx.fillStyle = "#555";
          ctx.fillRect(rx, ry, drawW, drawH);
          continue;
        }

        if (food[idx] > 0) {
          const f = Math.min(1, food[idx] / Math.max(1, foodFill));
          ctx.fillStyle = `rgb(${Math.round(90 + f * 90)},255,${Math.round(60 + f * 80)})`;
          ctx.fillRect(rx, ry, drawW, drawH);
          continue;
        }

        const e = Math.min(1, exploreTrail[idx]);
        const ft = Math.min(1, foodTrail[idx]);
        const sf = Math.min(1, supportField[idx]);
        if (e < 0.01 && ft < 0.01 && sf < 0.01) continue;

        const r = Math.round(ft * 10 + sf * 6);
        const g = Math.round(e * 110 + ft * 26 + sf * 12);
        const b = Math.round(ft * 6);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(rx, ry, drawW, drawH);
      }
    }
  }
});
