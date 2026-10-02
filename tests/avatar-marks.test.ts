// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): a look's beard, tattoos and piercings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEARD_STYLES,
  MAX_PIERCINGS,
  MAX_TATTOOS,
  PIERCING_KINDS,
  TATTOO_MOTIFS,
  TATTOO_SPOTS,
  canTattoo,
  lookFromSeed,
  marksFromParams,
  marksToParams,
  randomLook,
  sameLook,
  sanitizeLook,
  withBeard,
  withPiercing,
  withTattoo,
  withoutPiercing,
  withoutTattoo,
  type Look,
} from '../src/shared/avatar.js';

const base: Look = { skin: 1, hair: 2, style: 3 };

test('the lists have what the studio sells', () => {
  assert.equal(BEARD_STYLES[0], 'None');
  for (const id of ['anchor', 'rose', 'mama', 'skull', 'swallow', 'tribal', 'robot']) assert.ok(TATTOO_MOTIFS.some((m) => m.id === id), id);
  assert.deepEqual(
    TATTOO_SPOTS.map((s) => s.id),
    ['forearm-l', 'forearm-r', 'upperarm-l', 'upperarm-r', 'neck', 'hand-l', 'hand-r'],
  );
  for (const id of ['lobe-stud-l', 'lobe-ring-r', 'helix-l3', 'nose-stud', 'nose-ring', 'septum', 'brow-l', 'brow-r', 'lip-ring']) assert.ok(PIERCING_KINDS.some((k) => k.id === id), id);
  // Ids never hold the wire's separators.
  for (const id of [...TATTOO_MOTIFS, ...TATTOO_SPOTS, ...PIERCING_KINDS].map((x) => x.id)) assert.match(id, /^[a-z0-9-]+$/);
});

test('looks from before stay exactly what they were', () => {
  const seeded = lookFromSeed('abc');
  assert.deepEqual(Object.keys(seeded).sort(), ['hair', 'skin', 'style']);
  const old = { skin: 4, hair: 5, style: 6 };
  assert.deepEqual(sanitizeLook(old, lookFromSeed('x')), old);
  assert.equal(JSON.stringify(sanitizeLook(old, lookFromSeed('x'))), JSON.stringify(old));
  // Defaults are never written out.
  assert.deepEqual(sanitizeLook({ ...old, beard: 0, tattoos: [], piercings: [] }, old), old);
  assert.ok(sameLook(old, { ...old, beard: 0, tattoos: [], piercings: [] }));
});

test('absent marks are none, even when the fallback has some', () => {
  const fallback: Look = { ...base, beard: 5, tattoos: [{ motif: 'rose', spot: 'neck' }], piercings: [{ kind: 'septum', metal: 'gold' }] };
  assert.deepEqual(sanitizeLook({ skin: 1, hair: 2, style: 3 }, fallback), base);
});

test('a wrong beard keeps the fallback’s, a good one is kept', () => {
  const fallback: Look = { ...base, beard: 2 };
  assert.equal(sanitizeLook({ ...base, beard: 99 }, fallback).beard, 2);
  assert.equal(sanitizeLook({ ...base, beard: -1 }, fallback).beard, 2);
  assert.equal(sanitizeLook({ ...base, beard: 1.5 }, fallback).beard, 2);
  assert.equal(sanitizeLook({ ...base, beard: '3' }, fallback).beard, 2);
  assert.equal(sanitizeLook({ ...base, beard: 4 }, fallback).beard, 4);
  assert.equal(sanitizeLook({ ...base, beard: 0 }, fallback).beard, undefined);
  assert.equal(sanitizeLook({ ...base, beard: 99 }, base).beard, undefined);
});

test('unknown motifs, spots, kinds and metals are dropped; a list that is not one keeps the fallback’s', () => {
  const look = sanitizeLook(
    {
      ...base,
      tattoos: [{ motif: 'anchor', spot: 'forearm-l' }, { motif: 'unicorn', spot: 'neck' }, { motif: 'rose', spot: 'forehead' }, 'skull', null, { motif: 'skull' }, { motif: 'rose', spot: 'neck', extra: 1 }],
      piercings: [{ kind: 'septum', metal: 'gold' }, { kind: 'tongue', metal: 'gold' }, { kind: 'nose-stud', metal: 'platinum' }, { kind: 'brow-l', metal: 'silver' }, 7],
    },
    base,
  );
  assert.deepEqual(look.tattoos, [
    { motif: 'anchor', spot: 'forearm-l' },
    { motif: 'rose', spot: 'neck' },
  ]);
  assert.deepEqual(look.piercings, [
    { kind: 'septum', metal: 'gold' },
    { kind: 'brow-l', metal: 'silver' },
  ]);
  const fallback: Look = { ...base, tattoos: [{ motif: 'mama', spot: 'upperarm-r' }], piercings: [{ kind: 'lip-ring', metal: 'silver' }] };
  const kept = sanitizeLook({ ...base, tattoos: 'lots', piercings: { kind: 'septum' } }, fallback);
  assert.deepEqual(kept.tattoos, fallback.tattoos);
  assert.deepEqual(kept.piercings, fallback.piercings);
  assert.notEqual(kept.tattoos, fallback.tattoos, 'a copy, not the fallback’s own list');
});

test('one a spot (the later wins) and caps', () => {
  const look = sanitizeLook(
    {
      ...base,
      tattoos: [
        { motif: 'anchor', spot: 'neck' },
        { motif: 'rose', spot: 'neck' },
      ],
    },
    base,
  );
  assert.deepEqual(look.tattoos, [{ motif: 'rose', spot: 'neck' }]);
  const many = sanitizeLook({ ...base, tattoos: TATTOO_SPOTS.map((s) => ({ motif: 'star', spot: s.id })), piercings: PIERCING_KINDS.map((k) => ({ kind: k.id, metal: 'gold' })) }, base);
  assert.equal(many.tattoos!.length, MAX_TATTOOS);
  assert.deepEqual(
    many.tattoos!.map((t) => t.spot),
    TATTOO_SPOTS.slice(0, MAX_TATTOOS).map((s) => s.id),
  );
  assert.equal(many.piercings!.length, MAX_PIERCINGS);
});

test('round trip through the URL and through JSON', () => {
  const look: Look = {
    ...base,
    beard: 6,
    tattoos: [
      { motif: 'anchor', spot: 'forearm-l' },
      { motif: 'mama', spot: 'upperarm-r' },
    ],
    piercings: [
      { kind: 'nose-stud', metal: 'gold' },
      { kind: 'helix-r2', metal: 'silver' },
    ],
  };
  const q = new URLSearchParams({ skin: '1', hair: '2', style: '3', ...marksToParams(look) });
  assert.equal(q.get('tat'), 'anchor.forearm-l,mama.upperarm-r');
  const back = new URLSearchParams(q.toString());
  const got = sanitizeLook({ skin: Number(back.get('skin')), hair: Number(back.get('hair')), style: Number(back.get('style')), ...marksFromParams(back) }, lookFromSeed('x'));
  assert.deepEqual(got, look);
  assert.deepEqual(sanitizeLook(JSON.parse(JSON.stringify(look)), lookFromSeed('y')), look);
  // None of them: nothing on the URL, and nothing comes back.
  assert.deepEqual(marksToParams(base), {});
  assert.deepEqual(marksFromParams(new URLSearchParams('skin=1')), {});
  // Junk on the URL is dropped.
  const junk = sanitizeLook({ ...base, ...marksFromParams(new URLSearchParams('beard=abc&tat=x.y,anchor&pierce=septum.tin,septum.gold')) }, base);
  assert.deepEqual(junk, { ...base, piercings: [{ kind: 'septum', metal: 'gold' }] });
});

test('sameLook sees the marks, whatever their order', () => {
  const a: Look = { ...base, tattoos: [{ motif: 'anchor', spot: 'neck' }] };
  assert.ok(!sameLook(base, a));
  assert.ok(!sameLook(a, { ...base, tattoos: [{ motif: 'rose', spot: 'neck' }] }));
  assert.ok(!sameLook(base, { ...base, beard: 1 }));
  assert.ok(!sameLook({ ...base, piercings: [{ kind: 'septum', metal: 'gold' }] }, { ...base, piercings: [{ kind: 'septum', metal: 'silver' }] }));
  const two = [
    { motif: 'anchor', spot: 'neck' },
    { motif: 'rose', spot: 'hand-l' },
  ];
  assert.ok(sameLook({ ...base, tattoos: two }, { ...base, tattoos: [...two].reverse() }));
});

test('the shops’ helpers', () => {
  let look = withTattoo(base, { motif: 'anchor', spot: 'forearm-l' });
  assert.deepEqual(look.tattoos, [{ motif: 'anchor', spot: 'forearm-l' }]);
  assert.equal(base.tattoos, undefined, 'never changes the look it got');
  look = withTattoo(look, { motif: 'rose', spot: 'forearm-l' });
  assert.deepEqual(look.tattoos, [{ motif: 'rose', spot: 'forearm-l' }], 'over the old one');
  assert.deepEqual(withTattoo(look, { motif: 'unicorn', spot: 'neck' }), look, 'unknown motif: unchanged');
  for (const s of TATTOO_SPOTS.slice(1, MAX_TATTOOS)) look = withTattoo(look, { motif: 'star', spot: s.id });
  assert.equal(look.tattoos!.length, MAX_TATTOOS);
  const last = TATTOO_SPOTS[MAX_TATTOOS].id;
  assert.ok(!canTattoo(look, last));
  assert.deepEqual(withTattoo(look, { motif: 'skull', spot: last }), look, 'full: unchanged');
  assert.ok(canTattoo(look, 'forearm-l'), 'going over one still fits');
  look = withoutTattoo(look, 'forearm-l');
  assert.equal(look.tattoos!.length, MAX_TATTOOS - 1);
  for (const t of [...look.tattoos!]) look = withoutTattoo(look, t.spot);
  assert.ok(!('tattoos' in look), 'none left: no empty list');

  let p = withPiercing(base, { kind: 'septum', metal: 'silver' });
  p = withPiercing(p, { kind: 'septum', metal: 'gold' });
  assert.deepEqual(p.piercings, [{ kind: 'septum', metal: 'gold' }]);
  assert.deepEqual(withPiercing(p, { kind: 'tongue', metal: 'gold' }), p);
  assert.deepEqual(withPiercing(p, { kind: 'nose-stud', metal: 'brass' as 'gold' }), p);
  for (const k of PIERCING_KINDS) p = withPiercing(p, { kind: k.id, metal: 'silver' });
  assert.equal(p.piercings!.length, MAX_PIERCINGS);
  assert.deepEqual(withoutPiercing(withoutPiercing(base, 'septum'), 'nose-ring'), base);

  assert.equal(withBeard(base, 3).beard, 3);
  assert.deepEqual(withBeard({ ...base, beard: 3 }, 0), base);
  assert.deepEqual(withBeard(base, 42), base);
  const kept = withBeard({ ...base, tattoos: [{ motif: 'anchor', spot: 'neck' }] }, 2);
  assert.deepEqual(kept.tattoos, [{ motif: 'anchor', spot: 'neck' }], 'a shave keeps the tattoos');
});

test('randomLook may have a beard but never tattoos or piercings', () => {
  for (let i = 0; i < 200; i++) {
    const l = randomLook();
    assert.deepEqual(sanitizeLook(l, base), l);
    assert.ok(!l.tattoos && !l.piercings);
  }
});
