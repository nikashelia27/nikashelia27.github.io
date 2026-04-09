about({
  title: 'Tree Generation',
  text: 'Tips grow step by step, wandering with noise and an upward bias, and occasionally split into new branches. Repeating this local rule creates tree-like structures.'
});

params({
  wrapEdges: { label: 'Wrap edges', type: 'checkbox', value: true },
  splitChance: { label: 'Branch split %',  type: 'range', min: 1,  max: 30,  value: 8   },
  growSpeed:   { label: 'Grow speed',      type: 'range', min: 1,  max: 5,   value: 3   },
  maxGen:      { label: 'Max generations', type: 'range', min: 3,  max: 12,  value: 8   },
  wobble:      { label: 'Wobble',          type: 'range', min: 0,  max: 40,  value: 12  },
  upward:      { label: 'Upward bias',     type: 'range', min: 0,  max: 200, value: 40  },
  tipHue:      { label: 'Tip hue',         type: 'range', min: 0,  max: 360, value: 100 },
  rootHue:     { label: 'Root hue',        type: 'range', min: 0,  max: 360, value: 30  }
});
define('segment', {
  init(world) {
    const x = world.W / 2;
    const y = world.H - 20;

    return [{
      x,
      y,
      state: {
        tip: true,
        angle: -Math.PI / 2,
        gen: 0,
        age: 0,
        prevX: x,
        prevY: y
      }
    }];
  },

  sensing() {
    return null;
  },
  response(state, sensed, thing, all, world) {
    const { angle, gen, age } = state;
    const maxGen = world.params.maxGen;
    if (!state.tip) return { ...state, age: age + 1 };
    if (gen >= maxGen) return { ...state, tip: false };
    if (thing.x < 0 || thing.x > world.W || thing.y < 0 || thing.y > world.H) {
      return { ...state, tip: false };
    }
    const wobble = (world.params.wobble / 180) * Math.PI;
    const bias = world.params.upward / 1000;
    const newAngle =
      angle +
      (Math.random() - 0.5) * wobble -
      bias * Math.sin(angle + Math.PI / 2);
    const step = world.params.growSpeed;
    const oldX = thing.x;
    const oldY = thing.y;
    const newX = oldX + Math.cos(newAngle) * step;
    const newY = oldY + Math.sin(newAngle) * step;
    all.push({
      x: newX,
      y: newY,
      type: 'segment',
      state: {
        tip: false,
        angle: newAngle,
        gen,
        age: 0,
        prevX: oldX,
        prevY: oldY
      }
    });
    thing.x = newX;
    thing.y = newY;

    if (Math.random() * 100 < world.params.splitChance) {
      const spread = (15 + Math.random() * 20) * (Math.PI / 180);

      all.push({
        x: newX,
        y: newY,
        type: 'segment',
        state: {
          tip: true,
          angle: newAngle + spread,
          gen: gen + 1,
          age: 0,
          prevX: newX,
          prevY: newY
        }
      });
      return {
        tip: true,
        angle: newAngle - spread,
        gen: gen + 1,
        age: 0,
        prevX: newX,
        prevY: newY
      };
    }
    return {
      tip: true,
      angle: newAngle,
      gen,
      age: age + 1,
      prevX: newX,
      prevY: newY
    };
  },
  render(ctx, thing, world) {
    const { gen, tip, prevX, prevY } = thing.state;
    const maxGen = world.params.maxGen;
    const ratio = gen / maxGen;
    const hue = world.params.rootHue + (world.params.tipHue - world.params.rootHue) * ratio;
    const thick = Math.max(0.5, 3.5 * (1 - ratio * 0.7));
    const light = tip ? 80 : 55;
    const x0 = prevX ?? thing.x;
    const y0 = prevY ?? thing.y;
    ctx.strokeStyle = `hsl(${hue}, 70%, ${light}%)`;
    ctx.lineWidth = thick * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(thing.x, thing.y);
    ctx.stroke();
    if (tip) {
      ctx.fillStyle = `hsl(${hue}, 70%, ${light}%)`;
      ctx.beginPath();
      ctx.arc(thing.x, thing.y, thick * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
});
