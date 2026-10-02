import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WALL_HEIGHT } from '../src/shared/layout.js';
import { INTERIORS } from '../src/shared/interiors.js';
import { storeyPlan } from '../src/shared/storey.js';
import { bands, drips, fins } from '../src/client/world/facade/skin.js';
import { B } from '../src/client/world/facade/frame.js';
import type { NightParts } from '../src/client/world/outside.js';

// A facade for creatives (flrnoh fork, see FORK.md): what goes on the building's outside stays out of
// its windows, doors and balconies.

const night = { bulbs: [] } as unknown as NightParts;
const boxes = (g: THREE.Group) => {
  g.updateMatrixWorld(true);
  return g.children.map((m) => new THREE.Box3().setFromObject(m));
};

test('the fins on the street side keep clear of every storey\'s windows, doors and decks', () => {
  for (let k = 0; k < 16; k++) {
    const plan = storeyPlan(k);
    const holes = [...plan.windows, ...plan.balconies.map((b) => b.door)].filter((o) => o.wall === 'south');
    const g = new THREE.Group();
    fins(g, 0, holes, plan.balconies, k, night);
    assert.ok(g.children.length > 10, `storey ${k} has fins`);
    for (const b of boxes(g)) {
      for (const o of holes) assert.ok(b.max.x <= o.u - o.width / 2 || b.min.x >= o.u + o.width / 2, `storey ${k}: a fin over the opening at ${o.u}`);
      for (const bal of plan.balconies.filter((x) => x.wall === 'south')) assert.ok(b.max.x <= bal.rect.minX || b.min.x >= bal.rect.maxX, `storey ${k}: a fin through the deck at ${bal.rect.minX}..${bal.rect.maxX}`);
      assert.ok(b.min.z >= B.maxZ - 1e-6, 'outside the wall');
      assert.ok(b.min.y >= 0 && b.max.y <= WALL_HEIGHT, 'within the storey');
    }
  }
});

test("a storey's band never rises above its floor (a balcony's threshold), and it's in its interior's color", () => {
  for (const style of INTERIORS) {
    const g = new THREE.Group();
    bands(g, 10, style, new THREE.MeshBasicMaterial());
    for (const b of boxes(g)) assert.ok(b.max.y <= 10 + 1e-6, `${style.id}: the band reaches ${b.max.y}`);
    const mat = (g.children[0] as THREE.Mesh).material as THREE.MeshToonMaterial;
    assert.equal(`#${mat.color.getHexString()}`, new THREE.Color(style.accent ?? style.paint?.trim ?? '#e8a87c').getHexString().replace(/^/, '#'));
  }
});

test('paint drips off the top, never down over the top storey\'s windows', () => {
  const top = 3 * 7.1 + WALL_HEIGHT;
  const windows = storeyPlan(3).windows;
  const g = new THREE.Group();
  drips(g, top, windows);
  assert.ok(g.children.length > 20);
  for (const b of boxes(g)) {
    for (const o of windows.filter((w) => w.wall === 'south')) {
      const over = b.max.x > o.u - o.width / 2 && b.min.x < o.u + o.width / 2;
      if (over) assert.ok(b.min.y >= top - WALL_HEIGHT + o.y1, `a drip down over the window at ${o.u}`);
    }
  }
});

test('FLOGGE OFFICE on the roof leaves the bungee jetty its way out', async () => {
  const { BUNGEE } = await import('../src/shared/bungee.js');
  const { rooftopLetters } = await import('../src/client/world/facade/landmarks.js');
  // The letters' canvases need a page; their frame doesn't, so stub the canvas.
  const g = globalThis as unknown as { document?: unknown };
  const had = g.document;
  g.document ??= { createElement: () => ({ getContext: () => new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) }) }) };
  try {
    const { group } = rooftopLetters({ bulbs: [] } as unknown as NightParts);
    const box = new THREE.Box3().setFromObject(group);
    assert.ok(box.max.x < BUNGEE.x - 1.2, `the letters reach x ${box.max.x.toFixed(1)}`);
    assert.ok(box.min.x > B.minX, 'and stay on the building');
  } finally {
    g.document = had;
  }
});
