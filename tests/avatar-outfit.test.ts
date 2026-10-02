// flrnoh fork (see FORK.md "Shops to walk into", the boutique and the optician): what a look wears.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVIATOR,
  GLASSES,
  HEADWEAR,
  LEG_COLORS,
  TINTS,
  TOP_COLORS,
  TOP_STYLES,
  hairShows,
  lookFromSeed,
  marksFromParams,
  marksToParams,
  outfitFromParams,
  outfitToParams,
  sameLook,
  sanitizeLook,
  withBeard,
  withOutfit,
  withPiercing,
  withTattoo,
  type Look,
} from '../src/shared/avatar.js';

const base: Look = { skin: 1, hair: 2, style: 3 };

test('the lists have what the boutique and the optician sell, the old look first', () => {
  assert.equal(TOP_STYLES[0], 'T-shirt');
  for (const t of ['Hoodie', 'Shirt', 'Blazer', 'Leather jacket', 'Dress']) assert.ok(TOP_STYLES.includes(t), t);
  assert.equal(LEG_COLORS[0], '#3d405b', 'the trousers everyone wore before');
  assert.deepEqual(HEADWEAR, ['None', 'Cap', 'Beanie', 'Hat', 'Sun hat']);
  assert.deepEqual(GLASSES, ['None', 'Round', 'Square', 'Nerd', 'Aviator', 'Cat-eye']);
  assert.deepEqual(TINTS, ['Clear', 'Dark', 'Mirrored']);
  assert.equal(GLASSES[AVIATOR], 'Aviator');
  for (const c of TOP_COLORS) assert.match(c, /^#[0-9a-f]{6}$/i, 'a shirt color the server takes');
});

test('looks from before stay exactly what they were', () => {
  const old = { skin: 4, hair: 5, style: 6 };
  assert.equal(JSON.stringify(sanitizeLook(old, lookFromSeed('x'))), JSON.stringify(old));
  // Defaults are never written out, and count as the same look.
  const zeros = { ...old, top: 0, legs: 0, hat: 0, specs: 0, tint: 0 };
  assert.deepEqual(sanitizeLook(zeros, old), old);
  assert.ok(sameLook(old, zeros));
  assert.deepEqual(Object.keys(lookFromSeed('abc')).sort(), ['hair', 'skin', 'style']);
  assert.deepEqual(outfitToParams(old), {});
  assert.deepEqual(marksToParams(old), {});
});

test('an outfit is checked: absent is the default, a wrong one keeps the fallback’s, a good one is kept', () => {
  const fallback: Look = { ...base, top: 2, legs: 3, hat: 1, specs: 2, tint: 1 };
  assert.deepEqual(sanitizeLook({ ...base }, fallback), base, 'absent is the default, not the fallback’s');
  const bad = sanitizeLook({ ...base, top: 99, legs: -1, hat: 1.5, specs: 'x', tint: 7 }, fallback);
  assert.deepEqual([bad.top, bad.legs, bad.hat, bad.specs, bad.tint], [2, 3, 1, 2, 1]);
  const good = sanitizeLook({ ...base, top: 5, legs: 9, hat: 4, specs: 5, tint: 2 }, base);
  assert.deepEqual([good.top, good.legs, good.hat, good.specs, good.tint], [5, 9, 4, 5, 2]);
  // No tint without glasses.
  assert.equal(sanitizeLook({ ...base, tint: 2 }, base).tint, undefined);
  assert.ok(!sameLook(base, good));
});

test('the outfit goes over the wire and back, with the marks', () => {
  const look: Look = { ...base, beard: 3, tattoos: [{ motif: 'rose', spot: 'neck' }], top: 4, legs: 2, hat: 3, specs: 4, tint: 2 };
  const q = marksToParams(look);
  assert.deepEqual(outfitToParams(look), { top: '4', legs: '2', hat: '3', specs: '4', tint: '2' });
  const back = sanitizeLook({ skin: 1, hair: 2, style: 3, ...marksFromParams(new URLSearchParams(q)) }, base);
  assert.deepEqual(back, look);
  assert.ok(sameLook(back, look));
  // Through JSON (the profile message, the browser's saved profile) too.
  assert.deepEqual(sanitizeLook(JSON.parse(JSON.stringify(look)), base), look);
  assert.deepEqual(outfitFromParams(new URLSearchParams('')), {});
});

test('changing the outfit keeps the rest; the barber and the studio keep the outfit', () => {
  const look: Look = { ...base, beard: 2, top: 1, specs: 1 };
  const hatted = withOutfit(look, { hat: 2 });
  assert.deepEqual(hatted, { ...look, hat: 2 });
  assert.deepEqual(withOutfit(hatted, { hat: 0 }), look, 'taking it off writes no hat: 0');
  assert.equal(withBeard(hatted, 5).hat, 2);
  assert.equal(withTattoo(hatted, { motif: 'anchor', spot: 'forearm-l' }).top, 1);
  assert.equal(withPiercing(hatted, { kind: 'septum', metal: 'gold' }).specs, 1);
  // Aviators are sunglasses: picked with clear lenses they come dark; a tint picked stays.
  assert.equal(withOutfit(base, { specs: AVIATOR }).tint, 1);
  assert.equal(withOutfit({ ...base, specs: 1, tint: 2 }, { specs: AVIATOR }).tint, 2);
  assert.equal(withOutfit(base, { specs: 1 }).tint, undefined);
  // Taking the glasses off takes the tint with them.
  assert.equal(withOutfit({ ...base, specs: 2, tint: 1 }, { specs: 0 }).tint, undefined);
});

test('hair that pokes up hides under a hat, the rest shows', () => {
  for (const s of ['Spiky', 'Bun', 'Curly']) {
    assert.ok(hairShows({}, s));
    assert.ok(!hairShows({ hat: 1 }, s));
  }
  for (const s of ['Short', 'Long', 'Ponytail', 'Bald']) assert.ok(hairShows({ hat: 3 }, s));
});
