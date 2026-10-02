import test from 'node:test';
import assert from 'node:assert/strict';
import { coasterTrack, poseAt } from '../src/shared/coaster-track.js';
import { bracketKeepouts, coasterSupports, topFloor } from '../src/shared/coaster-supports.js';
import { inBox, levels } from '../src/shared/coaster-keepout.js';
import { FLOOR, STOREY, WALL_HEIGHT, WALL_T } from '../src/shared/layout.js';
import { FIN, storeyFins, storeyHoles } from '../src/shared/facade-fins.js';

// flrnoh fork (see FORK.md "Der Brecher"): what holds the coaster up along the building is brackets off
// the top storey, not towers from the street.

const STOREYS = Array.from({ length: 20 }, (_, i) => i + 1);
const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };

test('coaster brackets: off the top storey’s walls, whatever storey that is, between its windows and fins', () => {
  for (const N of STOREYS) {
    const sup = coasterSupports(coasterTrack(N));
    assert.ok(sup.brackets.length >= 16, `${N}: ${sup.brackets.length / 2} brackets`);
    const top = topFloor();
    assert.equal(top, -STOREY);
    const bad: string[] = [];
    for (const b of sup.brackets) {
      const [x, y, z] = b.a;
      const at = `${b.wall} ${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
      // On the top storey's wall, under the roof's slab and over its floor.
      if (y < top + 0.3 || y > top + WALL_HEIGHT - 0.3) bad.push(`not on the top storey: ${at}`);
      const onWall =
        (b.wall === 'south' && Math.abs(z - B.maxZ) < 1e-6 && x > B.minX && x < B.maxX) ||
        (b.wall === 'north' && Math.abs(z - B.minZ) < 1e-6 && x > B.minX && x < 12.6 + 1e-6) ||
        (b.wall === 'east' && Math.abs(x - B.maxX) < 1e-6 && z > B.minZ && z < B.maxZ) ||
        (b.wall === 'west' && Math.abs(x - B.minX) < 1e-6 && z > B.minZ && z < B.maxZ);
      if (!onWall) bad.push(`off the wall: ${at}`);
      // Not on a window, a door or the tube's hole; not on a fin.
      const u = b.wall === 'north' || b.wall === 'south' ? x : z;
      for (const o of storeyHoles(N - 1, b.wall)) if (Math.abs(u - o.u) < o.width / 2 + 0.25 && y > top + o.y0 - 0.25 && y < top + o.y1 + 0.25) bad.push(`on an opening: ${at}`);
      if (b.wall === 'south' && storeyFins(N - 1).some((f) => Math.abs(f - x) < FIN.width / 2 + 0.1)) bad.push(`on a fin: ${at}`);
      // Up and out to the track, never down.
      if (b.b[1] < y + 1) bad.push(`not up to the track: ${at}`);
    }
    assert.deepEqual(bad, [], `${N} storeys`);
  }
});

test('coaster brackets: clear of the building, every storey’s balconies, the facade’s landmarks, the roof’s things', () => {
  for (const N of STOREYS) {
    const track = coasterTrack(N);
    const sup = coasterSupports(track);
    const keep = bracketKeepouts(N);
    const bad = new Set<string>();
    for (const b of sup.brackets) {
      const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]);
      for (let d = 0.2; d < len - 0.6; d += 0.1) {
        const k = d / len;
        const x = b.a[0] + (b.b[0] - b.a[0]) * k;
        const y = b.a[1] + (b.b[1] - b.a[1]) * k;
        const z = b.a[2] + (b.b[2] - b.a[2]) * k;
        if (x > B.minX + 0.02 && x < B.maxX - 0.02 && z > B.minZ + 0.02 && z < B.maxZ - 0.02) bad.add(`into the building from ${b.a.map((v) => v.toFixed(1))}`);
        for (const box of keep) if (inBox(box, x, y, z, 0.05)) bad.add(`${box.name} from ${b.a.map((v) => v.toFixed(1))}`);
      }
      // It meets the track: its top end is right under the rails.
      let near = Infinity;
      for (let s = 0; s < track.length; s += 0.5) {
        const p = poseAt(track, s);
        near = Math.min(near, Math.hypot(p.x - b.b[0], p.y - b.b[1], p.z - b.b[2]));
      }
      if (near > 1.6) bad.add(`off the track at ${b.b.map((v) => v.toFixed(1))}`);
    }
    assert.deepEqual([...bad], [], `${N} storeys`);
  }
});

test('coaster supports: no tower from the street up the building, only low columns and the loop’s portals', () => {
  for (const N of STOREYS) {
    const sup = coasterSupports(coasterTrack(N));
    const { street } = levels(N);
    for (const c of sup.columns) {
      const out = Math.hypot(Math.max(0, B.minX - c.x, c.x - B.maxX), Math.max(0, B.minZ - c.z, c.z - B.maxZ));
      const tall = c.y1 - c.y0;
      assert.ok(Math.abs(c.y0 - street) < 1e-6, `${N}: a column off the street at ${c.x},${c.z}`);
      // Along the building, nothing taller than a couple of storeys; the loop's gate stands out over the road.
      assert.ok(tall <= 13 || out > 5, `${N}: a ${tall.toFixed(1)} m column ${out.toFixed(1)} m from the building at ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
      assert.ok(c.y1 < 0 || out > 5, `${N}: a column up past the roof at ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
    }
  }
});
