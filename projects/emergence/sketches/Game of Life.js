about({
  title: 'Game of Life',
  text: 'Cells on a grid live, die, or are born based on the number of neighboring cells. Simple rules create complex, evolving patterns.'
});

params({
  wrapEdges: { label: 'Wrap edges', type: 'checkbox', value: true },
  cellSize: { label: 'Cell size (px)',  type: 'range', min: 2,  max: 30, value: 7  },
  density:  { label: 'Init density %', type: 'range', min: 5,  max: 95, value: 47 }
});

define('cell', {

  init(world) {
    const cs   = world.params.cellSize;
    const cols = Math.floor(world.W / cs);
    const rows = Math.floor(world.H / cs);
    const things = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        things.push({ x, y, state: { alive: Math.random()*100 < world.params.density } });
    return things;
  },

  sensing(thing, all, world) {
    const cs   = world.params.cellSize;
    const cols = Math.floor(world.W / cs);
    const rows = Math.floor(world.H / cs);
    const r = 1, result = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx===0 && dy===0) continue;
        let nx = thing.x+dx, ny = thing.y+dy;
        if (world.wrap) {
          nx = ((nx%cols)+cols)%cols;
          ny = ((ny%rows)+rows)%rows;
        }
        if (nx<0||nx>=cols||ny<0||ny>=rows) continue;
        const t = all[ny*cols+nx];
        if (t) result.push(t);
      }
    return result;
  },

  response(state, sensed) {
    const n = sensed.filter(t => t.state.alive).length;
    return { alive: state.alive ? (n===2||n===3) : n===3 };
  },

  render(ctx, thing, world) {
    if (!thing.state.alive) return;
    const cs = world.params.cellSize;
    ctx.fillStyle = '#c8f135';
    ctx.fillRect(thing.x*cs+1, thing.y*cs+1, cs-1, cs-1);
  }

});