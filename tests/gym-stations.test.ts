import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GYM_STATIONS, type GymServerMsg, type JuiceBarView } from '../src/shared/gym.js';
import { EXERCISES, comfyWeight } from '../src/shared/gym-strength.js';
import { Gym, type GymPlayer } from '../src/server/gym/index.js';
import type { CardioView } from '../src/shared/gym-cardio.js';
import type { WellnessView } from '../src/shared/gym-wellness.js';

const comfyWeightLevel1 = (machine: string) => comfyWeight(EXERCISES[machine], 1);

// The gym floor (flrnoh fork): who's on what, the generic sit/act/stand protocol, and each game
// paying out fitness points and energy through the profiles.

function withGym(run: (gym: Gym, clock: { t: number }, seat: (id: string, owner: string, name: string) => Peer) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gym-'));
  const clock = { t: Date.UTC(2026, 0, 1, 12, 0, 0) };
  const gym = new Gym(dir, { now: () => clock.t, random: () => 0, manualTick: true });
  try {
    run(gym, clock, (id, owner, name) => new Peer(gym, id, owner, name));
  } finally {
    gym.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

class Peer {
  msgs: GymServerMsg[] = [];
  player: GymPlayer;
  constructor(gym: Gym, id: string, owner: string, name: string) {
    this.player = { id, owner, name, send: (m) => this.msgs.push(m) };
    gym.enter(this.player);
  }
  last<T extends GymServerMsg['t']>(t: T): Extract<GymServerMsg, { t: T }> | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i] as Extract<GymServerMsg, { t: T }>;
    return undefined;
  }
  station<S>(id: string): S | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      if (m.t === 'gym.station' && m.station === id) return m.state as S;
    }
    return undefined;
  }
}

test('walking in shows your fitness and every station', () => {
  withGym((gym, _clock, seat) => {
    const ada = seat('c1', 'account:1', 'Ada');
    assert.ok(ada.last('gym.profile'), 'a profile');
    const stations = new Set(ada.msgs.filter((m) => m.t === 'gym.station').map((m) => (m as { station: string }).station));
    for (const s of GYM_STATIONS) assert.ok(stations.has(s.id), s.id);
    assert.ok(stations.has('juicebar'));
  });
});

test('a strength set earns volume and fitness points', () => {
  withGym((gym, _clock, seat) => {
    const ada = seat('c1', 'account:1', 'Ada');
    gym.message('c1', { t: 'gym.sit', station: 'bench' });
    const weight = comfyWeightLevel1('bench');
    gym.message('c1', { t: 'gym.act', station: 'bench', action: 'set', data: { weight, target: 5 } });
    const res = ada.last('gym.result');
    assert.equal(res?.station, 'bench');
    assert.ok((res?.xp ?? 0) > 0, 'it paid out XP');
    assert.ok((ada.last('gym.profile')?.profile.xp ?? 0) > 0, 'the profile grew');
    assert.ok((ada.last('gym.profile')?.profile.totals.volume ?? 0) > 0, 'volume banked');
  });
});

test('a single-person machine turns the next person away', () => {
  withGym((gym, _clock, seat) => {
    seat('c1', 'account:1', 'Ada');
    const bo = seat('c2', 'account:2', 'Bo');
    gym.message('c1', { t: 'gym.sit', station: 'treadmill-1' });
    gym.message('c2', { t: 'gym.sit', station: 'treadmill-1' });
    assert.match(bo.last('gym.result')?.text ?? '', /using that/i);
  });
});

test('the wellness area gives energy back over time, to several at once', () => {
  withGym((gym, clock, seat) => {
    const ada = seat('c1', 'account:1', 'Ada');
    const bo = seat('c2', 'account:2', 'Bo');
    gym.fitness.addStamina('account:1', -50);
    gym.fitness.addStamina('account:2', -50);
    gym.message('c1', { t: 'gym.sit', station: 'hottub' });
    gym.message('c2', { t: 'gym.sit', station: 'hottub' });
    const before = gym.fitness.stamina('account:1');
    clock.t += 10_000;
    gym.tick();
    assert.ok(gym.fitness.stamina('account:1') > before, 'energy came back');
    const view = ada.station<WellnessView>('hottub');
    assert.deepEqual(new Set(view?.occupants), new Set(['Ada', 'Bo']));
    // Both got a profile update with more energy.
    assert.ok((bo.last('gym.profile')?.profile.stamina ?? 0) > 0);
  });
});

test('a cardio session runs on the clock and banks when you stop', () => {
  withGym((gym, clock, seat) => {
    const ada = seat('c1', 'account:1', 'Ada');
    gym.message('c1', { t: 'gym.sit', station: 'bike-1' });
    gym.message('c1', { t: 'gym.act', station: 'bike-1', action: 'start', data: { intensity: 'steady' } });
    for (let i = 0; i < 5; i++) {
      clock.t += 1000;
      gym.tick();
    }
    const running = ada.station<CardioView>('bike-1');
    assert.ok((running?.meters ?? 0) > 0, 'distance piled up');
    assert.equal(running?.running, true);
    gym.message('c1', { t: 'gym.act', station: 'bike-1', action: 'stop' });
    const res = ada.last('gym.result');
    assert.match(res?.text ?? '', /ride/i);
    assert.equal(ada.station<CardioView>('bike-1')?.running, false);
  });
});

test('the juice bar shows the leaderboard and pours a top-up', () => {
  withGym((gym, _clock, seat) => {
    const ada = seat('c1', 'account:1', 'Ada');
    gym.fitness.addXp('account:1', 500);
    gym.fitness.addStamina('account:1', -40);
    gym.message('c1', { t: 'gym.sit', station: 'juicebar' });
    const view = ada.station<JuiceBarView>('juicebar');
    assert.ok(view?.board.some((r) => r.you), 'you are on the board');
    const before = gym.fitness.stamina('account:1');
    gym.message('c1', { t: 'gym.act', station: 'juicebar', action: 'order', data: { smoothie: 'recovery' } });
    assert.ok(gym.fitness.stamina('account:1') > before, 'the smoothie topped you up');
  });
});

test('leaving the gym stands you up and banks the wellness time', () => {
  withGym((gym, clock, seat) => {
    seat('c1', 'account:1', 'Ada');
    gym.fitness.addStamina('account:1', -30);
    gym.message('c1', { t: 'gym.sit', station: 'massage-1' });
    clock.t += 30_000;
    gym.tick();
    gym.leave('c1');
    assert.ok(gym.fitness.profile('account:1').totals.relaxSecs > 0, 'the massage was banked');
  });
});
