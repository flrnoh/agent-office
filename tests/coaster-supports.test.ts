import test from 'node:test';
import assert from 'node:assert/strict';
import { coasterTrack, poseAt } from '../src/shared/coaster-track.js';
import { bracketKeepouts, coasterSupports, inTrack, topFloor, undersideAt, type P3 } from '../src/shared/coaster-supports.js';
import { ROAD_Z, inBox, levels } from '../src/shared/coaster-keepout.js';
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

/** How far `q` is from the segment `a`–`b`. */
function toSegment(q: P3, a: P3, b: P3): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const k = len2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / len2)) : 0;
  return Math.hypot(q[0] - a[0] - ab[0] * k, q[1] - a[1] - ab[1] * k, q[2] - a[2] - ab[2] * k);
}

test('coaster supports: every piece carries track, and a portal is two posts and one beam', () => {
  for (const N of STOREYS) {
    const track = coasterTrack(N);
    const sup = coasterSupports(track);
    const { street } = levels(N);
    const under: P3[] = [];
    for (let s = 0; s < track.length; s += 0.25) under.push(undersideAt(track, s));
    const meets = (q: P3, r: number) => under.some((u) => Math.hypot(u[0] - q[0], u[1] - q[1], u[2] - q[2]) < r);
    const bad: string[] = [];
    // Every strut, beam, bracket and tie reaches the track (or, a yoke's arm, holds the end of a bar
    // that does): nothing that holds nothing up.
    const all = [...sup.struts, ...sup.brackets];
    const direct = all.filter((b) => under.some((u) => toSegment(u, b.a, b.b) < b.w / 2 + 0.6));
    const same = (p: P3, q: P3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.05;
    for (const b of all) {
      // (never off a portal's beam: a beam carries the track and nothing else)
      const onColumns = (d: (typeof all)[number]) => sup.columns.some((c) => same([c.x, d.a[1], c.z], d.a) && Math.abs(c.y1 - d.a[1]) < 0.6);
      if (direct.includes(b) || direct.some((d) => !onColumns(d) && [d.a, d.b].some((e) => same(e, b.a) || same(e, b.b)))) continue;
      bad.push(`a strut holding nothing from ${b.a.map((v) => v.toFixed(1))} to ${b.b.map((v) => v.toFixed(1))}`);
    }
    // A beam is a strut that lies level from one column's top to another's: a portal.
    const top = (c: (typeof sup.columns)[number]): P3 => [c.x, c.y1, c.z];
    const atTop = (p: P3) => sup.columns.findIndex((c) => Math.hypot(c.x - p[0], c.z - p[2]) < 0.05 && Math.abs(c.y1 - p[1]) < 0.6);
    const beams = new Map<number, number>();
    for (const b of sup.struts) {
      const i = atTop(b.a);
      const j = atTop(b.b);
      if (i < 0 && j < 0) continue;
      if (i < 0 || j < 0) {
        bad.push(`a beam off one column only at ${b.a.map((v) => v.toFixed(1))}`);
        continue;
      }
      for (const k of [i, j]) beams.set(k, (beams.get(k) ?? 0) + 1);
      // Level, over the road high enough for the bus and the trucks, and never through the track.
      if (Math.abs(b.a[1] - b.b[1]) > 1e-6) bad.push('a sloping beam');
      if (b.a[1] - b.w / 2 - street < 5.5 && Math.min(b.a[2], b.b[2]) < ROAD_Z.max && Math.max(b.a[2], b.b[2]) > ROAD_Z.min) bad.push(`a beam ${(b.a[1] - b.w / 2 - street).toFixed(2)} m over the road`);
      const len = Math.hypot(b.b[0] - b.a[0], b.b[2] - b.a[2]);
      for (let d = 0; d <= len; d += 0.25) {
        const q: P3 = [b.a[0] + ((b.b[0] - b.a[0]) * d) / len, b.a[1] + b.w / 2 - 0.03, b.a[2] + ((b.b[2] - b.a[2]) * d) / len];
        if (inTrack(track, q)) bad.push(`a beam through the track at ${q.map((v) => v.toFixed(1))}`);
      }
    }
    // Every column holds the track up itself or carries a beam, and no column carries more than one.
    sup.columns.forEach((c, i) => {
      const n = beams.get(i) ?? 0;
      if (n > 1) bad.push(`${n} beams on the column at ${c.x},${c.z}`);
      if (!n && !meets(top(c), 1)) bad.push(`a column holding nothing at ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
    });
    assert.ok(beams.size <= 6, `${N}: ${beams.size / 2} portals`);
    assert.deepEqual(bad, [], `${N} storeys`);
  }
});

test('coaster photo camera: on its own slim post on the plaza, clear of everything, the photo taken from it', async () => {
  const { outsideKeepouts, SIDEWALKS_Z, TOWER } = await import('../src/shared/coaster-keepout.js');
  for (const N of STOREYS) {
    const track = coasterTrack(N);
    const { photo } = coasterSupports(track);
    const { post, cam, aim } = photo;
    const { street } = levels(N);
    const bad: string[] = [];
    // The camera sits on top of the post.
    if (Math.abs(post.x - cam[0]) > 1e-6 || Math.abs(post.z - cam[2]) > 1e-6 || cam[1] - post.y1 < 0 || cam[1] - post.y1 > 0.3) bad.push('the camera off its post');
    if (Math.abs(post.y0 - street) > 1e-6) bad.push('the post off the street');
    // Like any column: off the road and the sidewalks, clear of the keep-outs and the building, and of the track.
    const r = post.w / 2;
    if (post.z + r > ROAD_Z.min && post.z - r < ROAD_Z.max) bad.push('in the road');
    if (SIDEWALKS_Z.some((w) => post.z + r > w.min && post.z - r < w.max)) bad.push('on a sidewalk');
    if (post.x + r > TOWER.minX && post.x - r < TOWER.maxX && post.z + r > TOWER.minZ && post.z - r < TOWER.maxZ) bad.push('in the building');
    for (const k of outsideKeepouts(N)) if (post.x + r > k.minX && post.x - r < k.maxX && post.y1 > k.minY && post.y0 < k.maxY && post.z + r > k.minZ && post.z - r < k.maxZ) bad.push(k.name);
    for (let y = post.y0 + 0.3; y < cam[1] + 0.3; y += 0.2) if (inTrack(track, [post.x, y, post.z])) bad.push(`the track through it at ${y.toFixed(1)}`);
    // It looks at the train as the photo's taken: the middle car within a few metres, ahead of it.
    const d = Math.hypot(aim[0] - cam[0], aim[1] - cam[1], aim[2] - cam[2]);
    if (d < 3 || d > 9) bad.push(`aimed ${d.toFixed(1)} m away`);
    assert.deepEqual([...new Set(bad)], [], `${N} storeys`);
  }
});

test('coaster photo: taken from in front of the lens, nothing of the camera itself in the picture', async () => {
  const THREE = await import('three');
  const g = globalThis as unknown as { document?: unknown };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) }) }) };
  const { buildSupports, PHOTO_CAMERA } = await import('../src/client/world/coaster/supports.js');
  for (const N of [1, 3, 8, 20]) {
    const sup = coasterSupports(coasterTrack(N));
    const view = buildSupports(sup);
    view.group.updateMatrixWorld(true);
    const cam = view.group.getObjectByName(PHOTO_CAMERA);
    assert.ok(cam, 'the photo camera is drawn, by its name (ride.ts hides it for the picture)');
    const { shot, aim } = sup.photo;
    const dir = new THREE.Vector3(aim[0] - shot[0], aim[1] - shot[1], aim[2] - shot[2]).normalize();
    const from = new THREE.Vector3(...shot);
    // Every bit of the camera behind where the picture's taken from (past the near plane, 0.1 m).
    const v = new THREE.Vector3();
    let ahead = -Infinity;
    cam!.traverse((o) => {
      const m = o as import('three').Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) ahead = Math.max(ahead, v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(from).dot(dir));
    });
    assert.ok(ahead < -0.1, `${N}: the camera reaches ${ahead.toFixed(2)} m ahead of where the picture's taken`);
    view.dispose();
  }
});
