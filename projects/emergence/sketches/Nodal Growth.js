about({
  title: 'Nodes',
  text: 'Nodes move, connect, and form dynamic networks based on local rules. Connections stretch, break, and reproduce, creating evolving structures through simple interactions.'
});

params({
  wrapEdges:             { label: 'Wrap edges',               type: 'checkbox', value: false },
  maxPoints:             { label: 'Max points',               type: 'range', min: 100,  max: 4000, value: 1405, step: 1, reinit: true },
  moveSpeed:             { label: 'Move speed',               type: 'range', min: 0.5,  max: 6,    value: 6,  step: 0.1 },
  attractionRange:       { label: 'Attraction range',         type: 'range', min: 30,   max: 300,  value: 215,  step: 5 },
  springStrength:        { label: 'Spring strength',          type: 'range', min: 0.01, max: 0.3,  value: 0.16, step: 0.01 },
  edgeDeathChance:       { label: 'Edge death chance',        type: 'range', min: 0,    max: 1,    value: 0.007,    step: 0.001 },
  intersectionChance:    { label: 'Intersection spawn chance',type: 'range', min: 0,    max: 1,    value: 0.006,    step: 0.001 },
  grievePeriod:          { label: 'Grieve period (ticks)',    type: 'range', min: 0,    max: 300,  value: 28,   step: 1 },
  griefDeathMin:         { label: 'Grief death threshold (min)', type: 'range', min: 1, max: 100,  value: 5,    step: 1 },
  griefDeathMax:         { label: 'Grief death threshold (max)', type: 'range', min: 1, max: 100,  value: 5,   step: 1 },
  reproductionChance:    { label: 'Reproduction chance',      type: 'range', min: 0,    max: 1,    value: 0.003,    step: 0.001 },
  maxChildren:           { label: 'Max children per node',    type: 'range', min: 0,    max: 50,   value: 1,   step: 1 },
  mutationRate:          { label: 'Mutation rate',            type: 'range', min: 0,    max: 1,    value: 0.5,  step: 0.01 },
  nodeLimitMin:          { label: 'Node limit (min)',         type: 'range', min: 1,    max: 20,   value: 2,    step: 1 },
  nodeLimitMax:          { label: 'Node limit (max)',         type: 'range', min: 1,    max: 20,   value: 2,    step: 1 },
  restLengthMin:         { label: 'Preferred length (min)',   type: 'range', min: 5,    max: 400,  value: 20,   step: 1 },
  restLengthMax:         { label: 'Preferred length (max)',   type: 'range', min: 5,    max: 400,  value: 44,   step: 1 },
  initialNodes:          { label: 'Initial nodes',             type: 'range', min: 0,    max: 200,  value: 4,   step: 1, reinit: true },
});

define('cells', {

  MAX_CONN:   20,
  MAX_SPAWNS: 256,
  DAMPING:    0.88,
  BOUNCE:     0.6,
  MARGIN:     15,

  COLOR_BG:           [0,   0,   0,   255],
  COLOR_EDGE:         [180, 200, 255, 255],
  COLOR_NODE_SEEKING: [255, 255, 100, 255],
  COLOR_NODE_DONE:    [100, 220, 255, 255],
  COLOR_NODE_GRIEVE:  [255, 120,  50, 255],
  NODE_RADIUS: 2,

  drawLine(buf, cols, rows, x1, y1, x2, y2, r, g, b) {
    let dx = Math.abs(x2-x1), sx = x1<x2?1:-1;
    let dy = Math.abs(y2-y1), sy = y1<y2?1:-1;
    let err = dx-dy, cx = x1, cy = y1;
    while (true) {
      if (cx>=0&&cx<cols&&cy>=0&&cy<rows) {
        const idx=(cy*cols+cx)*4;
        buf[idx]=r; buf[idx+1]=g; buf[idx+2]=b; buf[idx+3]=255;
      }
      if (cx===x2&&cy===y2) break;
      const e2=2*err;
      if (e2>-dy){err-=dy;cx+=sx;}
      if (e2<dx) {err+=dx;cy+=sy;}
    }
  },

  drawDot(buf, cols, rows, cx, cy, radius, r, g, b) {
    const r2=radius*radius;
    for (let dy=-radius;dy<=radius;dy++) {
      for (let dx=-radius;dx<=radius;dx++) {
        if (dx*dx+dy*dy>r2) continue;
        const px=cx+dx, py=cy+dy;
        if (px<0||px>=cols||py<0||py>=rows) continue;
        const idx=(py*cols+px)*4;
        buf[idx]=r; buf[idx+1]=g; buf[idx+2]=b; buf[idx+3]=255;
      }
    }
  },

  init(world) {
    const maxPoints  = world.params.maxPoints || 1200;
    const MAX_CONN   = this.MAX_CONN;
    const MAX_SPAWNS = this.MAX_SPAWNS;

    const shared = {
      px:              new Float32Array(new SharedArrayBuffer(maxPoints * 4)),
      py:              new Float32Array(new SharedArrayBuffer(maxPoints * 4)),
      vx:              new Float32Array(new SharedArrayBuffer(maxPoints * 4)),
      vy:              new Float32Array(new SharedArrayBuffer(maxPoints * 4)),
      alive:           new Uint8Array  (new SharedArrayBuffer(maxPoints)),
      count:           new Int32Array  (new SharedArrayBuffer(4)),
      freeList:        new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      freeCount:       new Int32Array  (new SharedArrayBuffer(4)),
      neighbors:       new Int32Array  (new SharedArrayBuffer(maxPoints * MAX_CONN * 4)).fill(-1),
      connCount:       new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      ufParent:        new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      ufSize:          new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      clusterSize:     new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      prefRestLength:  new Float32Array(new SharedArrayBuffer(maxPoints * 4)),
      prefMaxConn:     new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      attractBias:     new Float32Array(new SharedArrayBuffer(maxPoints * 4)),
      childCount:      new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      grieveTimer:     new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      grieveCount:     new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      grieveThreshold: new Int32Array  (new SharedArrayBuffer(maxPoints * 4)),
      intersectCooldown: new Int32Array(new SharedArrayBuffer(maxPoints * 4)),
      spawnX:          new Float32Array(new SharedArrayBuffer(MAX_SPAWNS * 4)),
      spawnY:          new Float32Array(new SharedArrayBuffer(MAX_SPAWNS * 4)),
      spawnCount:      new Int32Array  (new SharedArrayBuffer(4)),
      domMounted:      new Uint8Array  (new SharedArrayBuffer(1)),
    };

    // Pre-fill spawn queue with initial nodes at center
    const initialNodes = Math.min(world.params.initialNodes || 0, 200);
    const cx = 0.5, cy = 0.5; // normalized — response uses world.W/H
    shared._initNodes = initialNodes; // pass to first response tick

    return [{ x:0, y:0, state:{ maxPoints, MAX_CONN, shared, _initNodes: initialNodes } }];
  },

  sensing() { return null; },

  response(state, _s, _t, _a, world) {

    const MAX_CONN = state.MAX_CONN;
    const DAMPING  = 0.88, BOUNCE = 0.6, MARGIN = 15;
    const s = state.shared;
    const { px, py, vx, vy, alive, neighbors, connCount,
            ufParent, ufSize, clusterSize, spawnX, spawnY,
            prefRestLength, prefMaxConn, attractBias, childCount,
            grieveTimer, grieveCount, grieveThreshold,
            intersectCooldown, freeList, freeCount } = s;

    const nodeLimitMin  = Math.max(1, Math.min(world.params.nodeLimitMin || 2, MAX_CONN));
    const nodeLimitMax  = Math.max(nodeLimitMin, Math.min(world.params.nodeLimitMax || 2, MAX_CONN));
    const restLengthMin = world.params.restLengthMin || 40;
    const restLengthMax = Math.max(restLengthMin, world.params.restLengthMax || 40);
    const connectD      = (restLengthMin + restLengthMax) * 0.25;
    const connectD2     = connectD * connectD;
    const attract       = world.params.attractionRange || 140;
    const attract2      = attract * attract;
    const springK       = world.params.springStrength || 0.08;
    const maxSpeed      = world.params.moveSpeed || 2.2;
    const attractScale  = 0.0012 * (maxSpeed / 2.2);
    const edgeDeathChance    = world.params.edgeDeathChance || 0;
    const intersectionChance = world.params.intersectionChance || 0;
    const grievePeriod  = world.params.grievePeriod !== undefined ? world.params.grievePeriod : 60;
    const griefDeathMin = world.params.griefDeathMin || 5;
    const griefDeathMax = Math.max(griefDeathMin, world.params.griefDeathMax || 10);
    const reproChance   = world.params.reproductionChance || 0;
    const maxChildren   = world.params.maxChildren !== undefined ? world.params.maxChildren : 10;
    const mutationRate  = world.params.mutationRate || 0.1;
    function ufFind(i) {
      while (ufParent[i]!==i){ufParent[i]=ufParent[ufParent[i]];i=ufParent[i];}
      return i;
    }
    function ufUnion(i,j) {
      const ri=ufFind(i),rj=ufFind(j); if(ri===rj) return;
      if(ufSize[ri]<ufSize[rj]){ufParent[ri]=rj;ufSize[rj]+=ufSize[ri];}
      else {ufParent[rj]=ri;ufSize[ri]+=ufSize[rj];}
    }
    function effectiveMax(i) { return grieveTimer[i]>0 ? prefMaxConn[i]-1 : prefMaxConn[i]; }
    function hasEdge(i,j) {
      const base=i*MAX_CONN;
      for(let k=0;k<connCount[i];k++) if(neighbors[base+k]===j) return true;
      return false;
    }
    function addEdge(i,j) {
      if(hasEdge(i,j)) return;
      neighbors[i*MAX_CONN+connCount[i]]=j;
      neighbors[j*MAX_CONN+connCount[j]]=i;
      connCount[i]++; connCount[j]++;
      ufUnion(i,j);
    }
    // its grief cause their friend nodes die and if it grieves too much it dies tooo :(
    function startGrief(i) {
      if(!alive[i]) return;
      if(grievePeriod>0) grieveTimer[i]=grievePeriod;
      grieveCount[i]++;
      if(grieveCount[i]>=grieveThreshold[i]) killNode(i);
    }
    function removeEdge(i,j) {
      for(let pass=0;pass<2;pass++) {
        const a=pass===0?i:j, b=pass===0?j:i;
        const base=a*MAX_CONN;
        for(let k=0;k<connCount[a];k++) {
          if(neighbors[base+k]===b) {
            for(let m=k;m<connCount[a]-1;m++) neighbors[base+m]=neighbors[base+m+1];
            neighbors[base+connCount[a]-1]=-1;
            connCount[a]--; break;
          }
        }
      }
      const dx=px[j]-px[i], dy=py[j]-py[i];
      const d=Math.hypot(dx,dy)||1;
      const pop=Math.min((prefRestLength[i]+prefRestLength[j])*0.5*6/d, maxSpeed*3);
      vx[i]-=(dx/d)*pop; vy[i]-=(dy/d)*pop;
      vx[j]+=(dx/d)*pop; vy[j]+=(dy/d)*pop;
      startGrief(i); startGrief(j);
    }
    function killNode(i) {
      if(!alive[i]) return;
      alive[i]=0;
      const base=i*MAX_CONN;
      for(let k=0;k<connCount[i];k++) {
        const j=neighbors[base+k];
        if(j<0||!alive[j]) continue;
        const bj=j*MAX_CONN;
        for(let m=0;m<connCount[j];m++) {
          if(neighbors[bj+m]===i) {
            for(let n=m;n<connCount[j]-1;n++) neighbors[bj+n]=neighbors[bj+n+1];
            neighbors[bj+connCount[j]-1]=-1;
            connCount[j]--; break;
          }
        }
        startGrief(j);
      }
      for(let k=0;k<MAX_CONN;k++) neighbors[base+k]=-1;
      connCount[i]=0; ufParent[i]=i; ufSize[i]=1;
      const fc=Atomics.load(freeCount,0);
      freeList[fc]=i;
      Atomics.store(freeCount,0,fc+1);
    }
    function allocNode() {
      const fc=Atomics.load(freeCount,0);
      if(fc>0) {
        Atomics.store(freeCount,0,fc-1);
        const recycled=freeList[fc-1];
        const cur=Atomics.load(s.count,0);
        for(let n=0;n<cur;n++) {
          if(!alive[n]) continue;
          const nb=n*MAX_CONN;
          for(let k=0;k<connCount[n];k++) {
            if(neighbors[nb+k]===recycled) {
              for(let m=k;m<connCount[n]-1;m++) neighbors[nb+m]=neighbors[nb+m+1];
              neighbors[nb+connCount[n]-1]=-1;
              connCount[n]--; k--;
            }
          }
        }
        return recycled;
      }
      const i=Atomics.load(s.count,0);
      if(i>=state.maxPoints) return -1;
      Atomics.store(s.count,0,i+1);
      return i;
    }
    function initSlot(i, x, y, dvx, dvy, restLen, maxConn, bias, threshold, grieve) {
      px[i]=x; py[i]=y; vx[i]=dvx; vy[i]=dvy;
      alive[i]=1; connCount[i]=0;
      ufParent[i]=i; ufSize[i]=1; clusterSize[i]=1;
      grieveTimer[i]=grieve||0; grieveCount[i]=0;
      grieveThreshold[i]=threshold;
      childCount[i]=0; intersectCooldown[i]=0;
      attractBias[i]=bias; prefRestLength[i]=restLen; prefMaxConn[i]=maxConn;
      const base=i*MAX_CONN;
      for(let k=0;k<MAX_CONN;k++) neighbors[base+k]=-1;
    }
    function mutatef(v,mn,mx) {
      if(mutationRate<=0) return v;
      const range=(mx-mn)||1;
      return Math.max(mn,Math.min(mx,v+(Math.random()-0.5)*range*mutationRate));
    }
    if(state._initNodes > 0) {
      const n = state._initNodes;
      state._initNodes = 0;
      const cx = world.W * 0.5, cy = world.H * 0.5;
      for(let k=0;k<n;k++) {
        const i=allocNode(); if(i<0) break;
        const angle=Math.random()*Math.PI*2;
        const r=Math.random()*30;
        initSlot(i, cx+Math.cos(angle)*r, cy+Math.sin(angle)*r,
          (Math.random()-0.5)*2, (Math.random()-0.5)*2,
          restLengthMin+Math.random()*(restLengthMax-restLengthMin),
          nodeLimitMin+Math.floor(Math.random()*(nodeLimitMax-nodeLimitMin+1)),
          0.9+Math.random()*0.2,
          griefDeathMin+Math.floor(Math.random()*(griefDeathMax-griefDeathMin+1)), 0);
      }
    }
    const pending=Math.min(Atomics.load(s.spawnCount,0),256);
    for(let sp=0;sp<pending;sp++) {
      const i=allocNode(); if(i<0) break;
      initSlot(i, spawnX[sp], spawnY[sp],
        (Math.random()-0.5)*2, (Math.random()-0.5)*2,
        restLengthMin+Math.random()*(restLengthMax-restLengthMin),
        nodeLimitMin+Math.floor(Math.random()*(nodeLimitMax-nodeLimitMin+1)),
        0.9+Math.random()*0.2,
        griefDeathMin+Math.floor(Math.random()*(griefDeathMax-griefDeathMin+1)), 0);
    }
    if(pending>0) Atomics.store(s.spawnCount,0,0);

    const count=Atomics.load(s.count,0);
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      if(grieveTimer[i]>0) { grieveTimer[i]--; if(grieveTimer[i]===0){vx[i]=0;vy[i]=0;} }
      if(intersectCooldown[i]>0) intersectCooldown[i]--;
    }
    for(let i=0;i<count;i++) { ufParent[i]=i; ufSize[i]=1; }
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      const base=i*MAX_CONN;
      for(let k=0;k<connCount[i];k++) {
        const j=neighbors[base+k];
        if(j>i&&alive[j]) ufUnion(i,j);
      }
    }
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      clusterSize[i]=ufSize[ufFind(i)];
    }
    const connectedThisTick=new Uint8Array(count);
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      const iMax=effectiveMax(i);
      const iSeeking=connCount[i]<iMax;
      const iCluster=clusterSize[i];
      let nearestJ=-1, nearestD2=Infinity;
      for(let j=0;j<count;j++) {
        if(j===i||!alive[j]) continue;
        if(!iSeeking||hasEdge(i,j)||connCount[j]>=effectiveMax(j)) continue;
        if(clusterSize[j]<iCluster) continue;
        const dx=px[j]-px[i], dy=py[j]-py[i];
        const d2=dx*dx+dy*dy;
        if(d2>attract2||d2<1) continue;
        if(d2<nearestD2){nearestD2=d2;nearestJ=j;}
      }
      if(nearestJ>=0) {
        const dx=px[nearestJ]-px[i], dy=py[nearestJ]-py[i];
        const d=Math.sqrt(nearestD2);
        const f=(attract-d)/attract*attractScale;
        vx[i]+=dx*f; vy[i]+=dy*f;
      }
      if(!connectedThisTick[i]) {
        for(let j=i+1;j<count;j++) {
          if(!alive[j]||connectedThisTick[j]||hasEdge(i,j)) continue;
          if(connCount[i]>=iMax||connCount[j]>=effectiveMax(j)) continue;
          const dx=px[j]-px[i], dy=py[j]-py[i];
          if(dx*dx+dy*dy>=connectD2) continue;
          addEdge(i,j);
          clusterSize[i]=ufSize[ufFind(i)];
          clusterSize[j]=clusterSize[i];
          connectedThisTick[i]=1; connectedThisTick[j]=1;
          break;
        }
      }
    }
    for(let i=0;i<count;i++) {
      if(!alive[i]||connCount[i]<prefMaxConn[i]) continue; // i must be satisfied :D
      for(let j=i+1;j<count;j++) {
        if(!alive[j]) continue; 
        if(ufFind(i)!==ufFind(j)) continue;
        const dx=px[j]-px[i], dy=py[j]-py[i];
        const d=Math.hypot(dx,dy)||1;
        const thr=(prefRestLength[i]+prefRestLength[j])*0.5*0.9;
        if(d>=thr) continue;
        const force=(thr-d)*springK;
        const fx=(dx/d)*force, fy=(dy/d)*force;
        vx[i]-=fx; vy[i]-=fy; vx[j]+=fx; vy[j]+=fy;
      }
    }
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      const base=i*MAX_CONN;
      for(let k=0;k<connCount[i];k++) {
        const j=neighbors[base+k];
        if(j<=i||!alive[j]) continue;
        const dx=px[j]-px[i], dy=py[j]-py[i];
        const d=Math.hypot(dx,dy)||1;
        const edgeRest=(prefRestLength[i]+prefRestLength[j])*0.5;
        const force=(d-edgeRest)*springK;
        const fx=(dx/d)*force, fy=(dy/d)*force;
        vx[i]+=fx; vy[i]+=fy; vx[j]-=fx; vy[j]-=fy;
      }
    }
    if(edgeDeathChance>0||intersectionChance>0) {
      const eA=[], eB=[];
      for(let i=0;i<count;i++) {
        if(!alive[i]) continue;
        const base=i*MAX_CONN;
        for(let k=0;k<connCount[i];k++) {
          const j=neighbors[base+k];
          if(j>i&&alive[j]&&intersectCooldown[i]===0&&intersectCooldown[j]===0)
            {eA.push(i);eB.push(j);}
        }
      }
      const toRemoveEdge = []; 
      const toSpawnIntersect = []; 
      const usedIntersect = new Uint8Array(eA.length); 
      for(let p=0;p<eA.length;p++) {
        for(let q=p+1;q<eA.length;q++) {
          const a=eA[p],b=eB[p],c=eA[q],d=eB[q];
          if(a===c||a===d||b===c||b===d) continue;
          const ax=px[a],ay=py[a],bx=px[b],by=py[b];
          const cx=px[c],cy=py[c],dx2=px[d],dy2=py[d];
          const d1x=bx-ax,d1y=by-ay,d2x=dx2-cx,d2y=dy2-cy;
          const cross=d1x*d2y-d1y*d2x;
          if(Math.abs(cross)<0.0001) continue;
          const tx=cx-ax,ty=cy-ay;
          const t=(tx*d2y-ty*d2x)/cross;
          const u=(tx*d1y-ty*d1x)/cross;
          if(t<0||t>1||u<0||u>1) continue;
          const ix=ax+t*(bx-ax), iy=ay+t*(by-ay);
          if(intersectionChance>0&&Math.random()<intersectionChance) {
            if(!usedIntersect[p]&&!usedIntersect[q]) {
              usedIntersect[p]=1; usedIntersect[q]=1;
              toSpawnIntersect.push({
                ix, iy, a, b, c, d,
                ax, ay, bx, by, cx, cy, dx2, dy2
              });
            }
            continue;
          }
          if(edgeDeathChance>0) {
            if(!usedIntersect[p]&&Math.random()<edgeDeathChance) toRemoveEdge.push([a,b]);
            if(!usedIntersect[q]&&Math.random()<edgeDeathChance) toRemoveEdge.push([c,d]);
          }
        }
      }
      for(const [i,j] of toRemoveEdge) {
        if(alive[i]&&alive[j]&&hasEdge(i,j)) removeEdge(i,j);
      }
      for(const sp of toSpawnIntersect) {
        const {ix,iy,a,b,c,d,ax,ay,bx,by,cx,cy,dx2,dy2} = sp;
        if(!alive[a]||!alive[b]||!alive[c]||!alive[d]) continue;
        if(!hasEdge(a,b)||!hasEdge(c,d)) continue;
        const ni=allocNode();
        if(ni<0) continue;
        const da=Math.hypot(ax-ix,ay-iy), db=Math.hypot(bx-ix,by-iy);
        const dc=Math.hypot(cx-ix,cy-iy), dd=Math.hypot(dx2-ix,dy2-iy);
        const avgRest=Math.max(restLengthMin, mutatef((da+db+dc+dd)*0.25, restLengthMin, restLengthMax));
        const avgConn=Math.max(4, Math.round(mutatef((prefMaxConn[a]+prefMaxConn[b]+prefMaxConn[c]+prefMaxConn[d])*0.25, nodeLimitMin, nodeLimitMax)));
        const avgBias=mutatef((attractBias[a]+attractBias[b]+attractBias[c]+attractBias[d])*0.25, 0.9, 1.1);
        const avgThresh=Math.max(1, Math.round(mutatef((grieveThreshold[a]+grieveThreshold[b]+grieveThreshold[c]+grieveThreshold[d])*0.25, griefDeathMin, griefDeathMax)));
        initSlot(ni, ix, iy,
          (vx[a]+vx[b]+vx[c]+vx[d])*0.25,
          (vy[a]+vy[b]+vy[c]+vy[d])*0.25,
          avgRest, avgConn, avgBias, avgThresh, grievePeriod||60);
        removeEdge(a,b); removeEdge(c,d);
        for(const ep of [a,b,c,d]) {
          if(!alive[ep]) continue;
          prefMaxConn[ep]++;
          addEdge(ni, ep);
          prefMaxConn[ep]--;
        }

        intersectCooldown[ni]=grievePeriod||60;
      }
    }
    if(reproChance>0) {
      const cur=Atomics.load(s.count,0);
      for(let i=0;i<cur;i++) {
        if(!alive[i]||connCount[i]<prefMaxConn[i]) continue;
        if(childCount[i]>=maxChildren) continue;
        if(Math.random()>reproChance) continue;
        const base=i*MAX_CONN;
        const edgeCount=connCount[i];
        if(edgeCount===0) continue;
        const k=Math.floor(Math.random()*edgeCount);
        const j=neighbors[base+k];
        if(j<0||!alive[j]) continue;
        const mx=(px[i]+px[j])*0.5;
        const my=(py[i]+py[j])*0.5;
        const ci=allocNode(); if(ci<0) break;
        const avgRest=Math.max(restLengthMin, mutatef((prefRestLength[i]+prefRestLength[j])*0.5, restLengthMin, restLengthMax));
        const avgConn=Math.max(2, Math.round(mutatef((prefMaxConn[i]+prefMaxConn[j])*0.5, nodeLimitMin, nodeLimitMax)));
        const avgBias=(attractBias[i]+attractBias[j])*0.5;
        const avgThresh=Math.max(1, Math.round(mutatef((grieveThreshold[i]+grieveThreshold[j])*0.5, griefDeathMin, griefDeathMax)));

        initSlot(ci, mx, my,
          (vx[i]+vx[j])*0.5, (vy[i]+vy[j])*0.5,
          avgRest, avgConn, avgBias, avgThresh, 0);
        removeEdge(i, j);
        if(alive[i]) { prefMaxConn[i]++; addEdge(ci, i); prefMaxConn[i]--; }
        if(alive[j]) { prefMaxConn[j]++; addEdge(ci, j); prefMaxConn[j]--; }

        childCount[i]++;
      }
    }
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      vx[i]*=DAMPING; vy[i]*=DAMPING;
      const speed=Math.hypot(vx[i],vy[i]);
      if(speed>maxSpeed){const inv=maxSpeed/speed;vx[i]*=inv;vy[i]*=inv;}
      px[i]+=vx[i]; py[i]+=vy[i];
      if(world.params.wrapEdges) {
        const w=world.wrapPos(px[i],py[i]); px[i]=w.x; py[i]=w.y;
      } else {
        if(px[i]<MARGIN){px[i]=MARGIN;vx[i]*=-BOUNCE;}
        if(px[i]>world.W-MARGIN){px[i]=world.W-MARGIN;vx[i]*=-BOUNCE;}
        if(py[i]<MARGIN){py[i]=MARGIN;vy[i]*=-BOUNCE;}
        if(py[i]>world.H-MARGIN){py[i]=world.H-MARGIN;vy[i]*=-BOUNCE;}
      }
    }

    return state;
  },

  _setupDOM(state) {
    const s=state.shared;
    if(s.domMounted[0]) return;
    const cvs=document.getElementById('canvas');
    if(!cvs) return;
    cvs.addEventListener('mousedown',(e)=>{
      const rect=cvs.getBoundingClientRect();
      const x=(e.clientX-rect.left)*(cvs.width/rect.width);
      const y=(e.clientY-rect.top)*(cvs.height/rect.height);
      const slot=Atomics.load(s.spawnCount,0);
      if(slot>=256) return;
      s.spawnX[slot]=x; s.spawnY[slot]=y;
      Atomics.store(s.spawnCount,0,slot+1);
    });
    s.domMounted[0]=1;
  },

  renderGL(glCtx, things, world) {
    const state=things[0].state;
    this._setupDOM(state);
    const s=state.shared;
    const MAX_CONN=state.MAX_CONN;
    const count=Atomics.load(s.count,0);
    const {px,py,alive,neighbors,connCount,prefMaxConn,grieveTimer}=s;
    const cols=world.W, rows=world.H;
    const buf=new Uint8Array(cols*rows*4);
    const [br,bg,bb]=this.COLOR_BG;
    for(let i=0;i<buf.length;i+=4){buf[i]=br;buf[i+1]=bg;buf[i+2]=bb;buf[i+3]=255;}
    const [er,eg,eb]=this.COLOR_EDGE;
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      const base=i*MAX_CONN;
      for(let k=0;k<connCount[i];k++) {
        const j=neighbors[base+k];
        if(j<=i||!alive[j]) continue;
        this.drawLine(buf,cols,rows,Math.floor(px[i]),Math.floor(py[i]),Math.floor(px[j]),Math.floor(py[j]),er,eg,eb);
      }
    }
    const [sr,sg,sb]=this.COLOR_NODE_SEEKING;
    const [dr,dg,db]=this.COLOR_NODE_DONE;
    const [gr,gg,gb]=this.COLOR_NODE_GRIEVE;
    for(let i=0;i<count;i++) {
      if(!alive[i]) continue;
      const grieving=grieveTimer[i]>0;
      const satisfied=!grieving&&connCount[i]>=prefMaxConn[i];
      this.drawDot(buf,cols,rows,Math.floor(px[i]),Math.floor(py[i]),this.NODE_RADIUS,
        grieving?gr:satisfied?dr:sr,
        grieving?gg:satisfied?dg:sg,
        grieving?gb:satisfied?db:sb);
    }
    glCtx.uploadRGBA(buf,cols,rows);
  }
});
