// flrnoh fork (see FORK.md "The Baumarkt"): HAMMER & CO on its landmark block. Its car park is paved
// for the garage's cars and joins the street; the doors, the aisles and everything to use are
// reachable on foot; the forklift stays in the hall and the bay, steers with its rear wheels, and gets
// to every pallet; pallets go up and come down as the forks do; the office keeps it all; guests and
// party guests may play with all of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_WALK } from '../src/shared/city.js';
import { landmarkBox } from '../src/shared/landmarks.js';
import { CAR, onPavement, paved } from '../src/shared/garage.js';
import {
  AISLES,
  AISLE_SIGN_Z,
  BAY,
  BLOCK,
  CHECKOUTS,
  DRIVEWAY,
  ENTRANCE,
  GARDEN,
  GARDEN_GATE,
  HALL,
  INSIDE,
  LOT,
  MIXER,
  RACKS,
  SOLIDS,
  TOOL_WALL,
  inForkArea,
  rackBox,
  type Box,
} from '../src/shared/baumarkt.js';
import {
  ANNOUNCEMENTS,
  CORRAL,
  FORKLIFT_START,
  FORK_MID,
  LIFT_MAX,
  PALLETS,
  PA_EVERY,
  TOOLS,
  announcementIn,
  corralSlot,
  driveForklift,
  forkMid,
  forkliftFits,
  forksIn,
  freshBaumarkt,
  isHeldId,
  liftStep,
  palletFits,
  type PalletState,
} from '../src/shared/baumarkt-play.js';
import { Baumarkt, Baumaerkte, baumarktMessage, type BaumarktDeps } from '../src/server/baumarkt.js';
import { Garage } from '../src/server/garage.js';
import { GUEST_MSGS, TEAM_ONLY_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';

const inside = (b: Box, x: number, z: number) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

test('it all stands on its own block, inside the sidewalks', () => {
  const block = landmarkBox('baumarkt');
  for (const b of [HALL, BAY, LOT, GARDEN]) assert.ok(b.minX >= block.minX && b.maxX <= block.maxX && b.minZ >= block.minZ && b.maxZ <= block.maxZ, JSON.stringify(b));
  // Clear of the street trees and benches on the block's edge (0.9 m in, see world/town/furniture.ts), the crowns' 1.5 m too.
  assert.ok(HALL.minZ - block.minZ > 0.9 + 1.5 && block.maxX - HALL.maxX > 0.9 + 1.5 && GARDEN.maxZ < block.maxZ - 0.9);
  for (const r of RACKS) assert.ok(inside(INSIDE, r.x, r.z0) && inside(INSIDE, r.x, r.z1));
});

test('the car park is paved for the garage cars, across the sidewalk to the street, but not the hall or the garden', () => {
  // Every corner and the middle of the car park, the bay and the driveway.
  for (const b of [LOT, BAY, DRIVEWAY])
    for (const [x, z] of [
      [b.minX + 0.1, b.minZ + 0.1],
      [b.maxX - 0.1, b.maxZ - 0.1],
      [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
    ])
      assert.ok(paved(x, z), `paved at ${x}, ${z}`);
  // A straight run from the car park down the driveway onto the road: paved all the way.
  const x = (DRIVEWAY.minX + DRIVEWAY.maxX) / 2;
  for (let z = LOT.minZ + 2; z <= BLOCK.maxZ + CITY_WALK + 4; z += 0.25) assert.ok(paved(x, z), `paved at ${x}, ${z}`);
  // A car fits all along it, nose to the street.
  for (let z = LOT.maxZ - 6; z <= BLOCK.maxZ + CITY_WALK + 3; z += 0.5) assert.ok(onPavement({ x, z, rotY: 0 }), `a car fits at z ${z}`);
  assert.ok(DRIVEWAY.maxX - DRIVEWAY.minX > CAR.width + 2);
  assert.ok(!paved((HALL.minX + HALL.maxX) / 2, (HALL.minZ + HALL.maxZ) / 2), 'not in the hall');
  assert.ok(!paved((GARDEN.minX + GARDEN.maxX) / 2, (GARDEN.minZ + GARDEN.maxZ) / 2), 'not in the garden centre');
  // And the office's garage takes a car driven there (the server checks with the same paved()).
  const g = new Garage();
  g.enter('ann', 0, 'driver');
  assert.ok(g.drive('ann', 0, { x, z: LOT.minZ + 8, rotY: 0, speed: 3, steer: 0 }), 'a car in the car park');
  assert.equal(g.drive('ann', 0, { x: (HALL.minX + HALL.maxX) / 2, z: HALL.minZ + 5, rotY: 0, speed: 3, steer: 0 }), undefined, 'not into the hall');
});

/** Where someone (0.3 m round) on foot can get to from (x0, z0): flood fill on a 0.25 m grid round the block. */
function walkable(extra: Box[]) {
  const R = 0.3;
  const solids = [...SOLIDS, ...extra];
  const S = 0.25;
  const x0 = BLOCK.minX - 4;
  const z0 = BLOCK.minZ - 4;
  const nx = Math.ceil((BLOCK.maxX - BLOCK.minX + 8) / S);
  const nz = Math.ceil((BLOCK.maxZ - BLOCK.minZ + 8) / S);
  const free = (x: number, z: number) => !solids.some((b) => x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R);
  const seen = new Uint8Array(nx * nz);
  const cell = (x: number, z: number) => [Math.round((x - x0) / S), Math.round((z - z0) / S)] as const;
  return {
    from(x: number, z: number) {
      const q: number[] = [];
      const [i0, k0] = cell(x, z);
      q.push(i0 + k0 * nx);
      seen[i0 + k0 * nx] = 1;
      while (q.length) {
        const c = q.pop()!;
        const i = c % nx;
        const k = (c - i) / nx;
        for (const [di, dk] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ni = i + di;
          const nk = k + dk;
          if (ni < 0 || nk < 0 || ni >= nx || nk >= nz || seen[ni + nk * nx]) continue;
          if (!free(x0 + ni * S, z0 + nk * S)) continue;
          seen[ni + nk * nx] = 1;
          q.push(ni + nk * nx);
        }
      }
    },
    reached(x: number, z: number) {
      const [i, k] = cell(x, z);
      return seen[i + k * nx] === 1;
    },
  };
}

test('through the sliding doors and the dock on foot: every aisle, the paint counter, the tool wall, the till, the bay, the garden centre and the corral', () => {
  // The garden centre's fence but its gate, as world/baumarkt/outdoor.ts puts it up.
  const t = 0.06;
  const fence: Box[] = [
    { minX: GARDEN.minX, maxX: GARDEN.maxX, minZ: GARDEN.minZ - t, maxZ: GARDEN.minZ + t },
    { minX: GARDEN.minX, maxX: GARDEN.maxX, minZ: GARDEN.maxZ - t, maxZ: GARDEN.maxZ + t },
    { minX: GARDEN.maxX - t, maxX: GARDEN.maxX + t, minZ: GARDEN.minZ, maxZ: GARDEN.maxZ },
    { minX: GARDEN.minX - t, maxX: GARDEN.minX + t, minZ: GARDEN.minZ, maxZ: GARDEN_GATE.z0 },
    { minX: GARDEN.minX - t, maxX: GARDEN.minX + t, minZ: GARDEN_GATE.z1, maxZ: GARDEN.maxZ },
    { minX: CORRAL.x - 2, maxX: CORRAL.x + 2, minZ: CORRAL.z - 0.8, maxZ: CORRAL.z - 0.7 },
    { minX: CORRAL.x - 2, maxX: CORRAL.x + 2, minZ: CORRAL.z + 0.7, maxZ: CORRAL.z + 0.8 },
  ];
  const w = walkable(fence);
  w.from(ENTRANCE.x, BLOCK.maxZ + 3);
  const spots: [string, number, number][] = [
    ['inside the doors', ENTRANCE.x, ENTRANCE.z - 2],
    ...AISLES.map((a) => [`aisle ${a.name}`, a.x, AISLE_SIGN_Z] as [string, number, number]),
    ['the paint shaker', MIXER.x - 1.2, MIXER.z],
    ['the tool wall', TOOL_WALL.x - 1, (TOOL_WALL.z0 + TOOL_WALL.z1) / 2],
    ['the till', CHECKOUTS[0].minX - 0.6, (CHECKOUTS[0].minZ + CHECKOUTS[0].maxZ) / 2],
    ['the back of the hall', (HALL.minX + HALL.maxX) / 2, HALL.minZ + 1],
    ['the delivery bay', (BAY.minX + BAY.maxX) / 2, BAY.maxZ - 4],
    ['the garden centre', (GARDEN.minX + GARDEN.maxX) / 2, (GARDEN.minZ + GARDEN.maxZ) / 2],
    ['the trolley corral', CORRAL.x + 2.6, CORRAL.z],
  ];
  for (const [what, x, z] of spots) assert.ok(w.reached(x, z), `can't walk to ${what} (${x.toFixed(1)}, ${z.toFixed(1)})`);
  // And into the hall from the bay through the dock's door alone (the front doors blocked).
  const back = walkable([...fence, { minX: ENTRANCE.x - 3, maxX: ENTRANCE.x + 3, minZ: HALL.maxZ - 0.5, maxZ: HALL.maxZ + 0.5 }]);
  back.from((BAY.minX + BAY.maxX) / 2, BAY.maxZ - 2);
  assert.ok(back.reached(AISLES[2].x, AISLE_SIGN_Z), 'through the dock');
});

test('the forklift stays in the hall and the bay, and turns about its front axle: its tail swings out', () => {
  assert.ok(inForkArea(FORKLIFT_START.x, FORKLIFT_START.z));
  assert.ok(inForkArea((INSIDE.minX + INSIDE.maxX) / 2, (INSIDE.minZ + INSIDE.maxZ) / 2));
  assert.ok(!inForkArea((LOT.minX + LOT.maxX) / 2, LOT.maxZ - 3), 'not out on the car park');
  assert.ok(!inForkArea((GARDEN.minX + GARDEN.maxX) / 2, (GARDEN.minZ + GARDEN.maxZ) / 2));
  const pallets = freshBaumarkt().pallets;
  assert.ok(forkliftFits(FORKLIFT_START, -1, pallets));
  const rack = rackBox(RACKS[1]);
  assert.ok(!forkliftFits({ x: RACKS[1].x, z: (rack.minZ + rack.maxZ) / 2, rotY: 0 }, -1, pallets), 'not through a rack');
  // Full left lock, rolling forward: the nose comes round left (rotY up), and the back swings out right more than the front moves.
  let p = { x: 60, z: -120, rotY: 0, speed: 2, steer: 0 };
  const start = { ...p };
  for (let i = 0; i < 10; i++) p = driveForklift(p, { gas: 1, turn: 1, brake: false }, 0.05);
  assert.ok(p.rotY > start.rotY + 0.1, 'turns left');
  const along = (q: typeof p, lz: number) => ({ x: q.x + Math.sin(q.rotY) * lz, z: q.z + Math.cos(q.rotY) * lz });
  const front = [along(start, 0.5), along(p, 0.5)];
  const rear = [along(start, -1), along(p, -1)];
  const sideways = (a: { x: number }, b: { x: number }) => b.x - a.x;
  assert.ok(sideways(rear[0], rear[1]) < -0.02, 'the tail swings out to the right');
  assert.ok(Math.abs(sideways(front[0], front[1])) < Math.abs(sideways(rear[0], rear[1])), 'the front stays on its line');
  // Backing up with S, and stopping when you let go.
  let b = { x: 60, z: -120, rotY: 0, speed: 0, steer: 0 };
  for (let i = 0; i < 20; i++) b = driveForklift(b, { gas: -1, turn: 0, brake: false }, 0.05);
  assert.ok(b.speed < 0 && b.z < -120);
  for (let i = 0; i < 60; i++) b = driveForklift(b, { gas: 0, turn: 0, brake: false }, 0.05);
  assert.equal(b.speed, 0);
});

test('forks into a pallet’s pockets and up: it’s on, and rides along; down on the floor: it’s set down where there’s room', () => {
  const pallets: PalletState[] = freshBaumarkt().pallets;
  const pal = pallets[2];
  // Lined up behind it, the forks in its pockets.
  const at = { x: pal.x, z: pal.z + FORK_MID, rotY: Math.PI };
  assert.ok(forksIn(at, pal));
  assert.ok(!forksIn({ ...at, rotY: Math.PI / 2 }, pal), 'not crossways');
  assert.ok(!forksIn({ ...at, z: at.z + 0.6 }, pal), 'not short of it');
  assert.equal(liftStep({ ...at, rotY: Math.PI / 2 }, 0, 0.2, -1, pallets), -1, 'crossways, the forks lift nothing');
  assert.equal(liftStep(at, 0.3, 0.5, -1, pallets), -1, 'already up, they pick nothing off the floor');
  const carrying = liftStep(at, 0, 0.2, -1, pallets);
  assert.equal(carrying, 2);
  assert.equal(pallets[2].y, 0.2);
  // Driven elsewhere and raised high, it comes along.
  const moved = { x: at.x, z: at.z + 3, rotY: Math.PI };
  assert.equal(liftStep(moved, 0.2, LIFT_MAX, carrying, pallets), 2);
  assert.deepEqual([pallets[2].x, pallets[2].z, pallets[2].y].map((v) => +v.toFixed(3)), [+forkMid(moved).x.toFixed(3), +forkMid(moved).z.toFixed(3), LIFT_MAX]);
  // Lowered to the floor: set down there.
  assert.equal(liftStep(moved, 0.2, 0, carrying, pallets), -1);
  assert.equal(pallets[2].y, 0);
  // Not into a rack: lowered over one, it stays on the forks.
  const rack = RACKS[1];
  const over = { x: rack.x, z: rack.z0 + 2 - FORK_MID, rotY: 0 };
  pallets[2] = { x: pallets[2].x, z: pallets[2].z, rotY: 0, y: 0 };
  Object.assign(pallets[2], forkMid({ x: pallets[2].x, z: pallets[2].z - FORK_MID, rotY: 0 }), { y: 0 });
  assert.equal(liftStep(over, 1, 0, 2, pallets), 2, 'no room in the rack: still on the forks');
  assert.ok(!palletFits(forkMid(over), pallets, 2));
});

test('the forklift gets from the bay to every pallet, through the dock (a search over where it fits)', () => {
  const pallets = freshBaumarkt().pallets;
  const S = 0.25;
  const H = 32;
  const key = (x: number, z: number, h: number) => `${Math.round(x / S)},${Math.round(z / S)},${h}`;
  const seen = new Set<string>();
  const q: [number, number, number][] = [[FORKLIFT_START.x, FORKLIFT_START.z, Math.round(((FORKLIFT_START.rotY / (2 * Math.PI)) * H + H) % H)]];
  seen.add(key(...q[0]));
  const reached: { x: number; z: number; rotY: number }[] = [];
  while (q.length) {
    const [x, z, h] = q.pop()!;
    const rotY = (h / H) * 2 * Math.PI;
    reached.push({ x, z, rotY });
    for (const [step, turn] of [
      [S, 0],
      [-S, 0],
      [S, 1],
      [S, -1],
      [-S, 1],
      [-S, -1],
    ]) {
      const nh = (h + turn + H) % H;
      const r = (nh / H) * 2 * Math.PI;
      const nx = x + Math.sin(r) * step;
      const nz = z + Math.cos(r) * step;
      const k = key(nx, nz, nh);
      if (seen.has(k) || !forkliftFits({ x: nx, z: nz, rotY: r }, -1, pallets)) continue;
      seen.add(k);
      q.push([nx, nz, nh]);
    }
  }
  pallets.forEach((pal, i) => {
    const close = reached.some((p) => {
      const m = forkMid(p);
      const turned = Math.abs(Math.atan2(Math.sin(2 * (p.rotY - pal.rotY)), Math.cos(2 * (p.rotY - pal.rotY)))) / 2;
      return Math.hypot(m.x - pal.x, m.z - pal.z) < 0.3 && turned < 0.2;
    });
    assert.ok(close, `the forklift can't get its forks into pallet ${i} (${PALLETS[i].load})`);
  });
  assert.ok(reached.some((p) => p.x > INSIDE.minX + 1) && reached.some((p) => p.x < HALL.minX - 1), 'both sides of the dock');
});

/** A pretend page on a floor, keeping what it's sent and what goes to the others. */
function page(id: string, where: { x: number; z: number } | undefined = { x: ENTRANCE.x, z: ENTRANCE.z - 3 }) {
  const sent: unknown[] = [];
  const others: unknown[] = [];
  const deps: BaumarktDeps = { id, floor: 'f1', where: () => where, send: (m) => sent.push(m), toNeighbors: (m) => others.push(m) };
  return { deps, sent, others };
}

test('the office: one driver, only theirs and only in the hall or the bay, and the pallets as the forks say', () => {
  let now = 1000;
  const all = new Baumaerkte(() => now);
  const ann = page('ann');
  const bob = page('bob');
  baumarktMessage(all, { t: 'bm.fork.enter' }, ann.deps);
  baumarktMessage(all, { t: 'bm.fork.enter' }, bob.deps);
  const b = all.of('f1');
  assert.equal(b.state().fork.driver, 'ann', 'bob was too late');
  assert.equal(b.forkDrive('bob', { ...FORKLIFT_START, speed: 1, steer: 0, lift: 0 }), undefined, 'not his to drive');
  assert.equal(b.forkDrive('ann', { x: (LOT.minX + LOT.maxX) / 2, z: LOT.maxZ - 3, rotY: 0, speed: 1, steer: 0, lift: 0 }), undefined, 'not onto the car park');
  assert.equal(b.forkDrive('ann', { ...FORKLIFT_START, speed: NaN, steer: 0, lift: 0 }), undefined);
  // Up to pallet 2, forks in, up: the office says it's on; everyone hears.
  const pal = b.state().pallets[2];
  const at = { x: pal.x, z: pal.z + FORK_MID, rotY: Math.PI };
  baumarktMessage(all, { t: 'bm.fork.drive', ...at, speed: 0, steer: 0, lift: 0 }, ann.deps);
  baumarktMessage(all, { t: 'bm.fork.drive', ...at, speed: 0, steer: 0, lift: 0.3 }, ann.deps);
  assert.equal(b.state().fork.carrying, 2);
  assert.ok(ann.sent.some((m) => (m as { t: string }).t === 'baumarkt'), 'the driver hears it too');
  // Lifts are clamped, and it comes down where it's driven to.
  const r = b.forkDrive('ann', { ...at, z: at.z + 2, speed: 9, steer: 0, lift: 99 });
  assert.ok(r && r.pose.lift === LIFT_MAX && r.pose.speed < 9);
  b.forkDrive('ann', { ...at, z: at.z + 2, speed: 0, steer: 0, lift: 0 });
  assert.equal(b.state().fork.carrying, -1);
  assert.ok(Math.abs(b.state().pallets[2].z - (pal.z + 2)) < 1e-9);
  // Getting off leaves it where it is, forks and all; leaving the floor lets go of everything.
  baumarktMessage(all, { t: 'bm.fork.leave' }, ann.deps);
  assert.equal(b.state().fork.driver, null);
  baumarktMessage(all, { t: 'bm.fork.enter' }, bob.deps);
  assert.ok(all.leave('f1', 'bob'));
  assert.equal(b.state().fork.driver, null);
  now += 1;
});

test('the office: trolleys, tools and paint', () => {
  let now = 5000;
  const all = new Baumaerkte(() => now);
  const b = all.of('f1');
  const ann = page('ann');
  const far = page('cid', { x: 0, z: 0 });
  baumarktMessage(all, { t: 'bm.trolley.grab', i: 1 }, ann.deps);
  assert.equal(b.state().trolleys[1].by, 'ann');
  assert.ok(!b.trolleyGrab('bob', 1), 'one pusher a trolley');
  assert.ok(b.trolleyPush('ann', 1, { x: LOT.minX + 5, z: LOT.minZ + 6, rotY: 1 }));
  assert.ok(!b.trolleyPush('ann', 1, { x: 0, z: 0, rotY: 0 }), 'it stays at the Baumarkt');
  assert.ok(!b.trolleyPush('bob', 1, { x: LOT.minX + 6, z: LOT.minZ + 6, rotY: 0 }));
  // Let go out there, it stays; by the corral, back into its slot.
  b.trolleyLet('ann');
  assert.equal(b.state().trolleys[1].x, LOT.minX + 5);
  b.trolleyGrab('ann', 1);
  b.trolleyPush('ann', 1, { x: CORRAL.x + 1, z: CORRAL.z + 0.5, rotY: 0 });
  b.trolleyLet('ann');
  assert.deepEqual({ ...b.state().trolleys[1] }, { ...corralSlot(1), by: null });
  // Tools: here, any of them; far off, none. Paint only the colour you mixed.
  baumarktMessage(all, { t: 'bm.hold', item: 'drill' }, ann.deps);
  assert.equal(b.state().held.ann, 'drill');
  assert.ok(ann.others.some((m) => (m as { t: string }).t === 'bm.held'));
  baumarktMessage(all, { t: 'bm.hold', item: 'drill' }, far.deps);
  assert.equal(b.state().held.cid, undefined);
  baumarktMessage(all, { t: 'bm.hold', item: 'banana' as never }, ann.deps);
  assert.equal(b.state().held.ann, 'drill');
  baumarktMessage(all, { t: 'bm.use' }, ann.deps);
  baumarktMessage(all, { t: 'bm.use' }, ann.deps);
  assert.equal(ann.others.filter((m) => (m as { t: string }).t === 'bm.used').length, 1, 'not twice at once');
  now += 300;
  baumarktMessage(all, { t: 'bm.use' }, ann.deps);
  assert.equal(ann.others.filter((m) => (m as { t: string }).t === 'bm.used').length, 2);
  assert.equal(b.hold('ann', 'paint4', () => ({ x: ENTRANCE.x, z: ENTRANCE.z - 3 })), undefined, 'no can before it’s mixed');
  baumarktMessage(all, { t: 'bm.mix', paint: 4 }, ann.deps);
  assert.ok(ann.sent.some((m) => (m as { t: string; paint?: number }).t === 'bm.mixing'));
  baumarktMessage(all, { t: 'bm.mix', paint: 2 }, page('bob').deps);
  assert.equal(b.mix('bob', 2, () => ({ x: ENTRANCE.x, z: ENTRANCE.z - 3 })), undefined, 'one can at a time in the shaker');
  assert.equal(b.hold('ann', 'paint2', () => ({ x: ENTRANCE.x, z: ENTRANCE.z - 3 })), undefined, 'not a colour you didn’t mix');
  assert.equal(b.hold('ann', 'paint4', () => ({ x: ENTRANCE.x, z: ENTRANCE.z - 3 })), 'paint4');
  // Leaving puts it all back.
  assert.ok(b.leave('ann'));
  assert.equal(b.state().held.ann, undefined);
  assert.ok(isHeldId('paint9') && !isHeldId('paint10') && TOOLS.every((t) => isHeldId(t.id)));
});

test('the PA: an announcement now and then, the same for everyone', () => {
  const t = 1_790_000_000_000;
  const a = announcementIn(t);
  assert.deepEqual(a, announcementIn(t + 1));
  const slot = Math.floor(t / PA_EVERY) * PA_EVERY;
  assert.ok(a.at >= slot && a.at < slot + PA_EVERY);
  assert.equal(a.text, ANNOUNCEMENTS[a.index]);
  // Over a day they're not all the same one.
  const seen = new Set<number>();
  for (let k = 0; k < 200; k++) seen.add(announcementIn(t + k * PA_EVERY).index);
  assert.ok(seen.size > ANNOUNCEMENTS.length / 2);
});

test('guests and party guests may use all of it, and see everyone else do it', () => {
  for (const t of ['bm.fork.enter', 'bm.fork.leave', 'bm.fork.drive', 'bm.fork.horn', 'bm.trolley.grab', 'bm.trolley.push', 'bm.trolley.let', 'bm.hold', 'bm.use', 'bm.mix']) {
    assert.ok(GUEST_MSGS.has(t), `guests send ${t}`);
    assert.ok(PARTY_MSGS.has(t), `party guests send ${t}`);
    assert.ok(!TEAM_ONLY_MSGS.has(t));
  }
  for (const t of ['baumarkt', 'bm.fork', 'bm.fork.horn', 'bm.trolley', 'bm.held', 'bm.used', 'bm.mixing']) assert.ok(PARTY_SEES_MSGS.has(t), `party guests see ${t}`);
  assert.ok(new Baumarkt().state().trolleys.length > 0);
});
