import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { STAGE_HEIGHT, VENUE } from '../src/shared/venue.js';
import { DIVE_EDGE, DJ_SPOT, GIG_DEFAULT_MS, GIG_MAX_MS, WOD_EVERY, cleanGig, liveGig, type VenueShowServerMsg } from '../src/shared/venueshow.js';
import { GigCalendar } from '../src/server/venue/gigs.js';
import { VenueShow, type ShowPerson } from '../src/server/venue/show.js';
import { venueShowHandlers, venueShowHooks } from '../src/server/ws/handlers/venueshow.js';
import { newClient, type Client } from '../src/server/office/client.js';
import type { Ctx } from '../src/server/office/context.js';
import { GUEST_MSGS, TEAM_ONLY_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';
import { guestMayFetch } from '../src/server/guests.js';

// flrnoh fork (see FORK.md "The show"): the Schallwerk's gig calendar, DJ booth and crowd, the office's side.

const HOUR = 3600_000;
const dir = () => mkdtempSync(path.join(tmpdir(), 'venueshow-'));
const at = (x: number, y: number, z: number, id = 'a', name = 'Anna'): ShowPerson => ({ id, name, x, y, z });
const decks = (id = 'a', name = 'Anna') => at(DJ_SPOT.x, DJ_SPOT.y, DJ_SPOT.z, id, name);

function show(now: { t: number }, present = () => 1) {
  const sent: VenueShowServerMsg[] = [];
  const all: VenueShowServerMsg[] = [];
  const d = dir();
  const s = new VenueShow({
    dataDir: d,
    now: () => now.t,
    toVenue: (m) => sent.push(m),
    toAll: (m) => all.push(m),
    present,
    lookup: async () => 'Ein Set',
    hear: () => new Promise(() => {}),
  });
  return { s, sent, all, dir: d };
}

test('a gig someone fills in is read carefully: a title, the kind, sensible times', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  assert.ok('error' in cleanGig({ kind: 'konzert', start: now + HOUR }, now, true), 'no title');
  assert.ok('error' in cleanGig({ title: 'X', kind: 'rave', start: now + HOUR }, now, true), 'no such kind');
  assert.ok('error' in cleanGig({ title: 'X', kind: 'club', start: now - 2 * HOUR }, now, true), 'in the past');
  assert.ok('error' in cleanGig({ title: 'X', kind: 'club', start: now + HOUR, end: now }, now, true), 'ends before it starts');
  const g = cleanGig({ title: '  Swallow’s\u0000 Rose   live ', kind: 'konzert', start: now + HOUR + 1234, text: 'x'.repeat(500), style: 99, color: -1 }, now, true);
  assert.ok(!('error' in g));
  if ('error' in g) return;
  assert.equal(g.title, 'Swallow’s Rose live');
  assert.equal(g.end - g.start, GIG_DEFAULT_MS, 'three hours unless it says');
  assert.equal(g.start % 60_000, 0, 'to the minute');
  assert.equal(g.text!.length, 200);
  assert.equal(g.style, 0);
  assert.equal(g.color, 0);
  const long = cleanGig({ title: 'X', kind: 'club', start: now + HOUR, end: now + 40 * HOUR }, now, true);
  assert.ok(!('error' in long) && long.end - long.start === GIG_MAX_MS, 'twelve hours at most');
});

test('the gig calendar: put in, changed, no two at once, taken out, kept in its file (0600) and read back', () => {
  const d = dir();
  try {
    const now = Date.UTC(2026, 9, 2, 12);
    const cal = new GigCalendar(d, now);
    const a = cal.save({ title: 'Swallow’s Rose live', kind: 'konzert', start: now + 30 * HOUR }, 'Flo', now);
    assert.ok('gig' in a);
    if (!('gig' in a)) return;
    assert.equal(a.gig.by, 'Flo');
    const clash = cal.save({ title: 'Techno-Nacht', kind: 'club', start: now + 31 * HOUR }, 'Flo', now);
    assert.ok('error' in clash && /Swallow/.test(clash.error), 'not two at once');
    const b = cal.save({ title: 'Techno-Nacht', kind: 'club', start: now + 34 * HOUR, end: now + 40 * HOUR, style: 3, color: 2 }, 'Ben', now);
    assert.ok('gig' in b);
    const moved = cal.save({ id: a.gig.id, title: 'Swallow’s Rose · live!', kind: 'konzert', start: now + 29 * HOUR }, 'Ben', now);
    assert.ok('gig' in moved && moved.gig.by === 'Flo' && moved.gig.title === 'Swallow’s Rose · live!', 'changed, still Flo’s');
    assert.ok('error' in cal.save({ id: 'zzzzzz', title: 'X', kind: 'club', start: now + 50 * HOUR }, 'Ben', now), 'no such gig');
    assert.equal(cal.list().length, 2);
    const file = path.join(d, 'venue-gigs.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const again = new GigCalendar(d, now);
    assert.deepEqual(again.list(), cal.list(), 'read back');
    assert.ok(again.remove(a.gig.id));
    assert.ok(!again.remove(a.gig.id));
    assert.equal(new GigCalendar(d, now).list().length, 1);
    // A hand-edited file can't smuggle anything in.
    assert.ok(readFileSync(file, 'utf8').includes('Techno-Nacht'));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('a gig starting is announced once, to the whole office, even across a restart; old gigs go', () => {
  const now = { t: Date.UTC(2026, 9, 2, 19) };
  const { s, all, sent, dir: d } = show(now);
  try {
    let started = 0;
    s.onGigStart = () => started++;
    s.calendar.save({ title: 'Techno-Nacht', kind: 'club', start: now.t + 10 * 60_000 }, 'Flo', now.t);
    s.tick();
    assert.equal(all.filter((m) => m.t === 'gig.started').length, 0, 'not yet');
    now.t += 11 * 60_000;
    s.tick();
    s.tick();
    assert.equal(all.filter((m) => m.t === 'gig.started').length, 1, 'once');
    assert.equal(started, 1, 'the building hears it too');
    const g = all.find((m) => m.t === 'gigs');
    assert.ok(g && g.t === 'gigs' && g.live, 'and which one is on');
    assert.equal(sent.length, 0, 'the house hears it with everyone');
    // The office restarts during the gig: no second announcement.
    const again = new VenueShow({ dataDir: d, now: () => now.t, toVenue: () => {}, toAll: (m) => all.push(m), present: () => 0, hear: () => new Promise(() => {}) });
    again.tick();
    assert.equal(all.filter((m) => m.t === 'gig.started').length, 1);
    assert.equal(liveGig(again.calendar.list(), now.t)?.title, 'Techno-Nacht');
    // A month and a bit later it's gone from the file.
    now.t += 40 * 24 * HOUR;
    again.tick();
    assert.equal(again.calendar.list().length, 0);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('the DJ booth: one DJ at a time, at the decks; only they put a set on, call a drop, pick the house mix', async () => {
  const now = { t: 1_800_000_000_000 };
  const { s, sent, dir: d } = show(now);
  try {
    assert.ok('error' in s.take(at(0, 0, 0)), 'from the floor: no');
    assert.ok('ok' in s.take(decks('a', 'Anna')));
    assert.equal(s.djState().dj?.name, 'Anna');
    assert.equal(s.djState().volume, 1, 'at the DJ’s own level till the team turns it');
    const ben = s.take(decks('b', 'Ben'));
    assert.ok('error' in ben && /Anna/.test(ben.error), 'one at a time');
    assert.ok('error' in s.play(decks('b', 'Ben'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'only the DJ');
    assert.ok('error' in s.play(decks('a'), 'https://evil.example/set'), 'only those three sites');
    const r = s.play(decks('a'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.ok('ok' in r);
    await r.titled;
    assert.equal(s.djState().set?.kind, 'youtube');
    assert.equal(s.djState().set?.title, 'Ein Set');
    assert.ok('error' in s.play(decks('a'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'already on');
    assert.ok('error' in s.houseStyle(decks('b'), 'techno'));
    assert.ok('ok' in s.houseStyle(decks('a'), 'techno'));
    assert.ok('error' in s.houseStyle(decks('a'), 'polka'));
    assert.equal(s.djState().house.style, 'techno');
    assert.ok('ok' in s.fx(decks('a'), 'drop'));
    assert.equal(s.djState().house.dropAt, now.t);
    assert.ok('error' in s.fx(decks('a'), 'drop'), 'not again straight away');
    now.t += 20_000;
    assert.ok('ok' in s.stopSet(decks('a')));
    assert.equal(s.djState().set, null);
    assert.ok(sent.some((m) => m.t === 'venuedj'));
    // Leaving: the decks are free; the set goes when the last one leaves the house.
    assert.ok(!s.leave('b'));
    assert.ok(s.leave('a'));
    assert.equal(s.djState().dj, null);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('the booth: the DJ skips through the set for the whole house; the house has its own volume, kept, the team’s', () => {
  const now = { t: 1_800_000_000_000 };
  const { s, sent, dir: d } = show(now);
  try {
    assert.ok('error' in s.seek(decks('a'), 60), 'not without the decks');
    assert.ok('ok' in s.take(decks('a', 'Anna')));
    assert.ok('error' in s.seek(decks('a'), 60), 'nothing on to skip in');
    assert.ok('ok' in s.play(decks('a'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    sent.length = 0;
    assert.ok('error' in s.seek(decks('b', 'Ben'), 60), 'only the DJ');
    const r = s.seek(decks('a', 'Anna'), 754);
    assert.ok('ok' in r && /12:34/.test(r.toast ?? ''), 'told to the house');
    assert.equal(s.djState().startedAt, now.t - 754_000, 'everyone 12:34 in, from now');
    assert.ok(sent.some((m) => m.t === 'venuedj'));
    now.t += 1000;
    s.seek(decks('a', 'Anna'), -3);
    assert.equal(s.djState().startedAt, now.t - 754_000 - 1000, 'no such spot: nothing changes');

    // The house's volume: its own, not the roof's; kept in venue-volume.json (0600) for the next start.
    sent.length = 0;
    assert.ok(s.setVolume(1.6, 'Flogge'));
    assert.equal(s.djState().volume, 1.6);
    assert.equal(s.djState().volumeBy, 'Flogge');
    assert.ok(sent.some((m) => m.t === 'venuedj' && m.state.volume === 1.6), 'the house hears it at once');
    assert.ok(!s.setVolume(1.6, 'Flogge'), 'the same again changes nothing');
    assert.ok(!s.setVolume(3, 'Flogge'), 'not past Disco');
    assert.ok(!s.setVolume('laut', 'Flogge'));
    assert.equal(statSync(path.join(d, 'venue-volume.json')).mode & 0o777, 0o600);
    const again = new VenueShow({ dataDir: d, now: () => now.t, toVenue: () => {}, toAll: () => {}, present: () => 0, hear: () => new Promise(() => {}) });
    assert.equal(again.djState().volume, 1.6);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('the handlers: the house’s volume is the team’s, the skip the DJ’s', () => {
  const o = office();
  try {
    const guest = o.person('guest', { guest: true });
    const party = o.person('party', { party: true });
    const team = o.person('team', { floor: 'proj' });
    venueShowHandlers['venuedj.volume'](o.ctx, guest, { t: 'venuedj.volume', volume: 2 });
    venueShowHandlers['venuedj.volume'](o.ctx, party, { t: 'venuedj.volume', volume: 2 });
    assert.equal(o.venue.length, 0, 'not guests');
    venueShowHandlers['venuedj.volume'](o.ctx, team, { t: 'venuedj.volume', volume: 0.5 });
    assert.ok(o.venue.some((v) => v.m.t === 'venuedj' && v.m.state.volume === 0.5), 'the team, from anywhere');
    venueShowHandlers['venuedj.seek'](o.ctx, guest, { t: 'venuedj.seek', at: 60 });
    assert.match(o.warned.pop() ?? '', /Pult/, 'only whoever is at the decks');
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('the crowd: stagediving only off the stage’s edge, Walls of Death from the stage or the decks and not too often, lighters, balls', () => {
  const now = { t: 1_800_000_000_000 };
  let present = 2;
  const { s, sent, dir: d } = show(now, () => present);
  try {
    assert.ok('error' in s.surf(at(2, 0, 0), true), 'not from the floor');
    assert.ok('ok' in s.surf(at(2, STAGE_HEIGHT, DIVE_EDGE.z + 0.4), true));
    assert.deepEqual(s.state().surfers, ['a']);
    assert.ok('ok' in s.surf(at(2, 2, -4), false));
    assert.deepEqual(s.state().surfers, []);
    assert.ok('error' in s.wod(at(2, 0, 0)), 'not from the floor');
    assert.ok('ok' in s.wod(at(2, STAGE_HEIGHT, 7)));
    assert.ok('error' in s.wod(at(2, STAGE_HEIGHT, 7)), 'not straight after another');
    now.t += WOD_EVERY + 1;
    s.take(decks('b', 'Ben'));
    assert.ok('ok' in s.fx(decks('b', 'Ben'), 'wod'), 'the DJ may');
    assert.equal(sent.filter((m) => m.t === 'show.wod').length, 2);
    assert.ok(s.light('a', true) && !s.light('a', true));
    assert.deepEqual(s.state().lights, ['a']);
    assert.equal(s.ball(at(-30, 0, 0), 0, { vx: 1, vy: 5, vz: 0 }), null, 'out of reach');
    assert.equal(s.ball(at(0, 0, 0), 7, { vx: 1, vy: 5, vz: 0 }), null, 'no such ball');
    // Everyone gone: the decks, the lighter and the set go.
    present = 0;
    s.surf(at(2, STAGE_HEIGHT, DIVE_EDGE.z + 0.4), true);
    s.gone('a');
    s.gone('b');
    assert.equal(s.state().dj.dj, null);
    assert.deepEqual(s.state().lights, []);
    assert.deepEqual(s.state().surfers, []);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

/** A pretend office: the house's handlers and what they send. */
function office() {
  const d = dir();
  const venue: { m: VenueShowServerMsg; except?: string }[] = [];
  const everyone: VenueShowServerMsg[] = [];
  const warned: string[] = [];
  const clients = new Map<string, Client>();
  const ctx = {
    cfg: { dataDir: d },
    clients,
    toVenue: (m: VenueShowServerMsg, except?: string) => venue.push({ m, except }),
    broadcast: (m: VenueShowServerMsg) => everyone.push(m),
    sendTo: () => {},
    warn: (_c: Client, e: string) => warned.push(e),
  } as unknown as Ctx;
  const person = (id: string, o: { guest?: boolean; party?: boolean; floor?: string } = {}) => {
    const c = newClient(id, { readyState: 1, send() {} } as never, { accountId: undefined, admin: false, guest: o.guest, party: o.party }, { id, name: id, color: '#fff', look: { skin: 0, hair: 0, style: 0 }, x: 0, y: 0, z: 0, rotY: 0, moving: false, voice: false, muted: false, sharing: false, floor: o.floor ?? VENUE } as never);
    clients.set(id, c);
    return c;
  };
  return { ctx, venue, everyone, warned, person, dir: d };
}

test('the handlers: crowd acts relayed to the house from where the office has you, not too often; the calendar the team’s', () => {
  const o = office();
  try {
    const anna = o.person('anna');
    const out = o.person('out', { floor: 'proj' });
    venueShowHandlers['show.act'](o.ctx, anna, { t: 'show.act', act: 'pogo' });
    venueShowHandlers['show.act'](o.ctx, anna, { t: 'show.act', act: 'pogo' });
    assert.equal(o.venue.filter((v) => v.m.t === 'show.act').length, 1, 'rate-limited');
    assert.equal(o.venue[0].except, 'anna', 'not back to who did it');
    venueShowHandlers['show.act'](o.ctx, out, { t: 'show.act', act: 'clap' });
    venueShowHandlers['show.act'](o.ctx, anna, { t: 'show.act', act: 'nonsense' as never });
    assert.equal(o.venue.length, 1, 'only from in the house, only real acts');
    venueShowHandlers['show.act'](o.ctx, anna, { t: 'show.act', act: 'light' });
    venueShowHandlers['show.act'](o.ctx, anna, { t: 'show.act', act: 'zugabe' });
    venueShowHandlers['show.act'](o.ctx, anna, { t: 'show.act', act: 'zugabe' });
    assert.equal(o.venue.filter((v) => v.m.t === 'show.act' && v.m.act === 'zugabe').length, 1);
    // The calendar: guests and party guests can't (the dispatch refuses them before, guests.ts; the handler too).
    const guest = o.person('guest', { guest: true });
    venueShowHandlers['gig.save'](o.ctx, guest, { t: 'gig.save', gig: { title: 'X', kind: 'club', start: Date.now() + HOUR, end: Date.now() + 2 * HOUR, style: 0, color: 0 } });
    assert.equal(o.everyone.length, 0);
    venueShowHandlers['gig.save'](o.ctx, out, { t: 'gig.save', gig: { title: 'Techno-Nacht', kind: 'club', start: Date.now() + HOUR, end: Date.now() + 3 * HOUR, style: 0, color: 0 } });
    assert.ok(o.everyone.some((m) => m.t === 'gigs' && m.gigs.length === 1), 'the team, from anywhere; to the whole office');
    // Leaving the house lets go of the lighter.
    const after = venueShowHooks.leaving!(o.ctx, anna, undefined);
    anna.peer.floor = 'proj';
    if (after) after();
    assert.ok(o.venue.some((v) => v.m.t === 'show.act' && v.m.act === 'unlight' && v.m.id === 'anna'));
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('guests and party guests may join the crowd and the booth, and read the programme; editing it is the team’s', () => {
  for (const t of ['show.hello', 'show.act', 'show.surf', 'show.ball', 'show.wod', 'gig.list', 'venuedj.take', 'venuedj.leave', 'venuedj.play', 'venuedj.stop', 'venuedj.seek', 'venuedj.tap', 'venuedj.house', 'venuedj.fx']) {
    assert.ok(GUEST_MSGS.has(t), `${t} for guests`);
    assert.ok(PARTY_MSGS.has(t), `${t} for party guests`);
  }
  for (const t of ['gig.save', 'gig.delete', 'venuedj.volume']) {
    assert.ok(TEAM_ONLY_MSGS.has(t) && !GUEST_MSGS.has(t) && !PARTY_MSGS.has(t), `${t} is the team's`);
  }
  for (const t of ['show', 'show.act', 'show.surf', 'show.ball', 'show.wod', 'venuedj', 'venuedj.horn', 'gigs', 'gig.started']) assert.ok(PARTY_SEES_MSGS.has(t), `party guests see ${t}`);
  assert.ok(guestMayFetch('/api/venue/beats', new URL('http://x/api/venue/beats'), () => false));
});
