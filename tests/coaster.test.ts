import test from 'node:test';
import assert from 'node:assert/strict';
import { coasterRoute, HEART } from '../src/shared/coaster-route.js';
import { DS, coasterTrack, poseAt, rideDuration, sAtTime } from '../src/shared/coaster-track.js';
import { coasterSupports } from '../src/shared/coaster-supports.js';
import { ROAD_Z, SIDEWALKS_Z, TOWER, groundFloorKeepouts, inBox, levels, outsideKeepouts, type Box3 } from '../src/shared/coaster-keepout.js';
import { CARS, SEATS, STATION, carOffset } from '../src/shared/coaster.js';
import { ANCHOR, BODY, bungeePlan, bungeePose } from '../src/shared/bungee.js';
import { FLOOR, WALL_HEIGHT, WALL_T, roofDrop } from '../src/shared/layout.js';
import { storeyPlan } from '../src/shared/storey.js';

const STOREYS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Where the train and its riders reach round the track, across it (along B) and up from the heartline
 * (along N): the rails, the spine's bottom, the cars' sides, the riders' heads and hands up.
 */
const ENVELOPE: [number, number][] = [
  [-0.55, -HEART],
  [0.55, -HEART],
  [0, -HEART - 0.62],
  [-0.8, -0.35],
  [0.8, -0.35],
  [-0.8, 0.25],
  [0.8, 0.25],
  [-0.35, 0.95],
  [0.35, 0.95],
  [-0.4, 1.4],
  [0.4, 1.4],
];
/** The glass tube through the ground floor: round, about the heartline (a little above it). */
const TUBE: [number, number][] = Array.from({ length: 16 }, (_, k) => [1.32 * Math.cos((k / 16) * 2 * Math.PI), 0.1 + 1.32 * Math.sin((k / 16) * 2 * Math.PI)]);

function tunnelOf(storeys: number) {
  const z = coasterTrack(storeys).zones.find((q) => q.kind === 'tunnel')!;
  return { from: z.from, to: z.to };
}

/** Every point of the train's envelope (or, in the tunnel, the tube's) every half metre round the track. */
function* envelope(storeys: number): Generator<{ s: number; x: number; y: number; z: number; tube: boolean; under: boolean }> {
  const t = coasterTrack(storeys);
  const tun = tunnelOf(storeys);
  for (let s = 0; s < t.length; s += 0.5) {
    const p = poseAt(t, s);
    const tube = s >= tun.from && s <= tun.to;
    for (const [b, n] of tube ? TUBE : ENVELOPE) {
      yield { s, x: p.x + p.b[0] * b + p.n[0] * n, y: p.y + p.b[1] * b + p.n[1] * n, z: p.z + p.b[2] * b + p.n[2] * n, tube, under: n < -HEART };
    }
  }
}

test('coaster track: a closed, smooth circuit with an upright frame in the station, for every height', () => {
  for (const N of STOREYS) {
    const t = coasterTrack(N);
    assert.ok(t.length > 200 && t.length < 400, `N${N}: ${t.length} m`);
    let worst = 0;
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      const a = [t.tan[3 * i], t.tan[3 * i + 1], t.tan[3 * i + 2]];
      const b = [t.tan[3 * j], t.tan[3 * j + 1], t.tan[3 * j + 2]];
      const n = [t.nor[3 * i], t.nor[3 * i + 1], t.nor[3 * i + 2]];
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      worst = Math.max(worst, Math.acos(Math.min(1, dot)) / DS);
      // An orthonormal frame everywhere.
      assert.ok(Math.abs(Math.hypot(a[0], a[1], a[2]) - 1) < 1e-6 && Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) < 1e-6);
      assert.ok(Math.abs(a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) < 1e-6);
      // No point further than a step and a bit from the next: it's one piece.
      const gap = Math.hypot(t.pos[3 * j] - t.pos[3 * i], t.pos[3 * j + 1] - t.pos[3 * i + 1], t.pos[3 * j + 2] - t.pos[3 * i + 2]);
      assert.ok(gap < DS * 1.05 && gap > DS * 0.95, `N${N}: a gap of ${gap} at ${i * DS}`);
    }
    // No kinks: never tighter than 2.5 m anywhere.
    assert.ok(worst < 1 / 2.5, `N${N}: curvature ${worst.toFixed(3)}`);
    // In the station, level and upright, heading east along the platform.
    const st = poseAt(t, 0);
    assert.ok(Math.abs(st.n[1] - 1) < 1e-3 && Math.abs(st.t[0] - 1) < 1e-3, `N${N}: the station's frame`);
    assert.ok(Math.abs(st.y - HEART - STATION.trackY) < 1e-6 && Math.abs(st.z - STATION.trackZ) < 1e-6);
  }
});

test('coaster track: seen from above it is the same however tall the building is', () => {
  const a = coasterRoute(2);
  for (const N of [1, 5, 8]) {
    const b = coasterRoute(N);
    for (const m of ['crest', 'photo', 'loop', 'loopEnd', 'tunnel', 'tunnelEnd', 'vlift']) {
      const at = (r: typeof a, u: number) => {
        let i = 0;
        while (r.u[i] < u) i++;
        return [r.pts[3 * i], r.pts[3 * i + 2]];
      };
      const [x0, z0] = at(a, a.marks[m]);
      const [x1, z1] = at(b, b.marks[m]);
      assert.ok(Math.hypot(x1 - x0, z1 - z0) < 0.25, `${m} for ${N} storeys is at ${x1},${z1}, not ${x0},${z0}`);
    }
  }
});

test('coaster ride: the riders feel no more than 5 g, no less than -1.5 g, little sideways, and it never stalls', () => {
  for (const N of STOREYS) {
    const t = coasterTrack(N);
    for (let i = 0; i < t.n; i++) {
      const at = `N${N} at ${(i * DS).toFixed(1)} m`;
      assert.ok(t.gN[i] < 5 && t.gN[i] > -1.5, `${at}: ${t.gN[i].toFixed(2)} g`);
      assert.ok(Math.abs(t.gB[i]) < 2, `${at}: ${t.gB[i].toFixed(2)} g sideways`);
      assert.ok(Math.abs(t.gT[i]) < 1.6, `${at}: ${t.gT[i].toFixed(2)} g along`);
      const s = i * DS;
      if (s > 2 && s < t.length - 2) assert.ok(t.speed[i] > 0.8, `${at}: ${t.speed[i]} m/s`);
      assert.ok(t.speed[i] < 22, `${at}: ${t.speed[i]} m/s`);
    }
    assert.ok(t.duration > 40 && t.duration < 90, `N${N}: ${t.duration} s`);
  }
  // Taller buildings, longer rides.
  for (let N = 2; N <= 8; N++) assert.ok(rideDuration(N) >= rideDuration(N - 1) - 0.5);
});

test('coaster ride: where the train is follows from the time since it went, the same everywhere', () => {
  const t = coasterTrack(3);
  assert.equal(sAtTime(t, -1), 0);
  assert.equal(sAtTime(t, 0), 0);
  assert.equal(sAtTime(t, t.duration + 1), 0);
  let last = 0;
  for (let k = 0.05; k < t.duration; k += 0.05) {
    const s = sAtTime(t, k);
    assert.ok(s >= last - 1e-9, `backwards at ${k}`);
    // No faster than the train goes (with a little room for the interpolation).
    assert.ok(s - last < 0.05 * 21 + 0.01, `a jump at ${k}`);
    last = s;
  }
  assert.ok(last > t.length - 1, 'back round in the station');
  // The cars sit in a row along the track, the front one ahead.
  assert.ok(carOffset(0) > carOffset(CARS - 1));
  assert.equal(SEATS, CARS * 2);
});

test('coaster track: clear of the tower, every storey’s balconies, the facade’s landmarks, the bungee and the halls', () => {
  for (const N of STOREYS) {
    const keep = outsideKeepouts(N);
    const { street } = levels(N);
    const hits = new Set<string>();
    for (const p of envelope(N)) {
      if (p.tube) continue;
      for (const k of keep) {
        // A jumper on the bungee gets a metre to spare; the rest a little.
        const pad = k.name === 'bungee jumper' ? 0.9 : k.name === 'bungee jetty' ? 0.5 : 0.1;
        if (inBox(k, p.x, p.y, p.z, pad)) hits.add(`${k.name} at ${p.s} m (${p.x.toFixed(1)}, ${(p.y - street).toFixed(1)} over the street, ${p.z.toFixed(1)})`);
      }
      if (p.x > TOWER.minX && p.x < TOWER.maxX && p.z > TOWER.minZ && p.z < TOWER.maxZ && p.y < TOWER.maxY) hits.add(`the tower at ${p.s} m`);
    }
    assert.deepEqual([...hits], [], `${N} storeys`);
  }
});

test('coaster track: 5.5 m and more over the street, wherever it crosses it', () => {
  for (const N of STOREYS) {
    const { street } = levels(N);
    let lowest = Infinity;
    let crossed = 0;
    for (const p of envelope(N)) {
      if (p.z < ROAD_Z.min || p.z > ROAD_Z.max) continue;
      crossed++;
      lowest = Math.min(lowest, p.y - street);
    }
    assert.ok(crossed > 100, 'it goes over the street');
    assert.ok(lowest >= 5.5, `${N} storeys: ${lowest.toFixed(2)} m over the street`);
  }
});

test('coaster tunnel: through the ground floor under its ceiling, in and out through the walls only where the tube goes', () => {
  for (const N of STOREYS) {
    const { ground } = levels(N);
    const inner = groundFloorKeepouts(N);
    const hits = new Set<string>();
    let inside = 0;
    for (const p of envelope(N)) {
      if (!p.tube) continue;
      const y = p.y - ground;
      const room = p.x > FLOOR.minX && p.x < FLOOR.maxX && p.z > FLOOR.minZ && p.z < FLOOR.maxZ;
      if (room) {
        inside++;
        if (y > WALL_HEIGHT - 0.02) hits.add(`the ceiling at ${p.s} m`);
        if (y < 3.8) hits.add(`too low at ${p.s} m (${y.toFixed(2)})`);
        for (const k of inner) if (inBox(k, p.x, y, p.z)) hits.add(`${k.name} at ${p.s} m`);
      }
      // Through the walls, only at the two portals: the south wall at the tube's line in, the north wall out.
      const inWall = (p.z > FLOOR.maxZ && p.z < FLOOR.maxZ + WALL_T + 0.8) || (p.z < FLOOR.minZ && p.z > FLOOR.minZ - WALL_T) || p.x < FLOOR.minX || p.x > FLOOR.maxX;
      if (inWall && p.x > FLOOR.minX - WALL_T && p.x < FLOOR.maxX + WALL_T && p.z > FLOOR.minZ - WALL_T && p.z < FLOOR.maxZ + WALL_T + 0.8) {
        const south = p.z > 0 && Math.abs(p.x - 4.8) < 1.5;
        const north = p.z < 0 && Math.abs(p.x + 16) < 1.5;
        if (!south && !north) hits.add(`a wall at ${p.s} m (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      }
    }
    assert.ok(inside > 600, `${N}: the tube's ${inside} points in the room`);
    assert.deepEqual([...hits], [], `${N} storeys`);
  }
});

test('coaster supports: on the ground or the deck, clear of everything, never on a sidewalk or in the road', () => {
  for (const N of STOREYS) {
    const keep = outsideKeepouts(N);
    const { street } = levels(N);
    const sup = coasterSupports(coasterTrack(N));
    assert.ok(sup.columns.length > 15, `${N}: ${sup.columns.length} columns`);
    const bad: string[] = [];
    for (const c of sup.columns) {
      const b: Box3 = { name: 'column', minX: c.x - c.w / 2, maxX: c.x + c.w / 2, minY: c.y0, maxY: c.y1, minZ: c.z - c.w / 2, maxZ: c.z + c.w / 2 };
      for (const k of keep) if (b.minX < k.maxX && b.maxX > k.minX && b.minY < k.maxY && b.maxY > k.minY && b.minZ < k.maxZ && b.maxZ > k.minZ) bad.push(`${k.name} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
      const onDeck = Math.abs(c.y0) < 1e-6;
      if (onDeck) {
        // On the roof: inside its edge.
        if (!(c.x > FLOOR.minX && c.x < FLOOR.maxX && c.z > FLOOR.minZ && c.z < FLOOR.maxZ)) bad.push(`off the deck at ${c.x},${c.z}`);
        continue;
      }
      if (Math.abs(c.y0 - street) > 1e-6) bad.push(`not on the street at ${c.x},${c.z}`);
      if (b.maxX > TOWER.minX && b.minX < TOWER.maxX && b.maxZ > TOWER.minZ && b.minZ < TOWER.maxZ) bad.push(`in the tower at ${c.x},${c.z}`);
      if (b.maxZ > ROAD_Z.min && b.minZ < ROAD_Z.max) bad.push(`in the road at ${c.x},${c.z}`);
      if (SIDEWALKS_Z.some((w) => b.maxZ > w.min && b.minZ < w.max) && Math.abs(c.x) < 110) bad.push(`on a sidewalk at ${c.x},${c.z}`);
    }
    assert.deepEqual(bad, [], `${N} storeys`);
  }
});

test('coaster keep-outs: the bungee box holds every jump, and the balconies are every storey’s', () => {
  for (const N of [1, 3, 8]) {
    const drop = roofDrop(N);
    const box = outsideKeepouts(N).find((k) => k.name === 'bungee jumper')!;
    const plan = bungeePlan(drop);
    for (let t = plan.jump + 0.3; t < plan.winch; t += 0.05) {
      const p = bungeePose(drop, t);
      // The ankles, and the head hanging BODY under them.
      for (const y of [p.y, p.y - BODY]) if (y < ANCHOR.y - 0.5) assert.ok(inBox(box, p.x, y, p.z, 0.3), `${N}: the jumper at ${p.x.toFixed(2)},${y.toFixed(2)},${p.z.toFixed(2)}`);
    }
    const balconies = outsideKeepouts(N).filter((k) => k.name.startsWith('balcony'));
    const expected = Array.from({ length: N }, (_, k) => storeyPlan(k).balconies.length).reduce((a, b) => a + b, 0);
    assert.equal(balconies.length, expected);
  }
});
