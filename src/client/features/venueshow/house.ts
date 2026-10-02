import * as THREE from 'three';
import { VENUE, ZONES, venueRoomAt, type VenueMode } from '../../../shared/venue';
import { BALLS, DIVE_EDGE, DJ_SPOT, atDiveEdge, type BallHit, type VenueShowState } from '../../../shared/venueshow';
import { advance, effectiveHit, flightOf, flightPos, type Flight } from '../../../shared/venueshow-balls';
import { crowdTarget, findPit, type Jump, type Pit, type Spot } from '../../../shared/venueshow-crowd';
import type { MixFrame } from '../../../shared/venueshow-mix';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import type { Bones, Person } from '../../world/character';
import { Confetti } from '../../world/confetti';
import type { VenueRoom } from '../../world/venue/parts';
import { setVenueLevel, venueLevel } from '../../world/venue/parts';
import { buildBooth, type Booth } from './booth';
import { Crowd, glowTexture } from './crowd';
import { djPose, type VenueDj } from './dj';
import { buildFloor, type Floor } from './floor';
import type { Hearing, VenueShowSound } from './sound';
import { surfPose, unSurf, type Surf } from './surf';

// The SCHALLWERK's show in the house, every frame (flrnoh fork, see FORK.md "The show"): how loud the
// stage is and where its beat is, what the DJ booth plays, how many come and what the crowd does,
// the barrier, the balls, confetti at a drop, who's posed how (the DJ's moves, a crowd-surfer on
// their back, a lighter up), and what's heard where. features/venueshow/index.ts feeds it what the
// office says and what you do.

export interface HouseHost {
  ctx: Ctx;
  personOf(id: string): Person | undefined;
  show(): VenueShowState;
  mode(): VenueMode;
  dj: VenueDj;
  sound: VenueShowSound;
  surf: Surf;
  /** Whose lighter is up, mine included. */
  lit(id: string): boolean;
  /** A gig from the calendar is on. */
  live(): boolean;
}

type PoseKind = 'surf' | 'dj' | 'light';

export class ShowHouse {
  booth: Booth | null = null;
  floor: Floor | null = null;
  readonly crowd = new Crowd();
  readonly confetti = new Confetti(() => 0);
  /** The beat the house moves to now (null: nothing plays), and the DJ's share of the level. */
  frame: MixFrame | null = null;
  private djLevel = 0;
  /** The stage: its level smoothed, its beat (counted from onsets), how long it's been playing. */
  private stage = { slow: 0, fast: 0, beats: 0, bpm: 120, lastOnset: 0, gaps: [] as number[], playedFor: 0, quietFor: 0 };
  /** The crowd's moments (0..1, fading): applause, the chant, cheering. */
  applause = 0;
  chant = 0;
  cheer = 0;
  jumps: Jump[] = [];
  pit: Pit | null = null;
  private pitSound = 0;
  private flights: (Flight | null)[] = new Array(BALLS).fill(null);
  private hits: (BallHit | null)[] = new Array(BALLS).fill(null);
  private posed = new Map<string, PoseKind>();
  private flames = new Map<string, THREE.Object3D>();
  private lastDrop = Infinity;
  private flash: THREE.PointLight;
  private flashT = 0;

  constructor(private h: HouseHost) {
    this.flash = new THREE.PointLight('#ffffff', 0, 9, 2);
    // Nobody aims at a bit of confetti.
    this.confetti.mesh.raycast = () => {};
  }

  build(room: VenueRoom) {
    const group = new THREE.Group();
    group.name = 'venue-show';
    this.booth = buildBooth();
    this.floor = buildFloor();
    group.add(this.booth.group, this.floor.group, this.crowd.group, this.confetti.mesh, this.flash);
    room.group.add(group);
    room.colliders.push(...this.booth.colliders, ...this.floor.colliders);
    room.interactables.push(...this.booth.interactables, ...this.floor.interactables);
  }

  /** A beach ball's hit, from the office (or yours, at once). */
  setBall(i: number, hit: BallHit | null) {
    this.hits[i] = hit;
    this.flights[i] = null;
  }

  /** Where ball `i` is now. */
  ballPos(i: number) {
    const now = store.officeNow();
    let f = this.flights[i];
    if (!f) f = flightOf(effectiveHit(i, this.hits[i] ?? undefined, now));
    f = this.flights[i] = advance(f, now);
    return { ...flightPos(f, now), hit: effectiveHit(i, this.hits[i] ?? undefined, now) };
  }

  /** Someone's camera flash, where they stand. */
  flashAt(x: number, z: number) {
    this.flash.position.set(x, 2.2, z);
    this.flashT = 0.18;
  }

  /** Where you hear the house from. */
  hearing(): Hearing {
    if (store.floor !== VENUE) return 'off';
    const p = this.h.ctx.player.pos;
    return venueRoomAt(p.x, p.z) === 'hall' ? 'hall' : 'muffled';
  }

  update(t: number, dt: number) {
    const { ctx } = this.h;
    const now = store.officeNow();
    const mode = this.h.mode();
    const show = this.h.show();
    const club = mode === 'club';
    const hearing = this.hearing();
    // ---- What plays: a set, the house mix (club nights, or whenever someone's at the decks), or nothing.
    const housePlays = club || !!show.dj.dj;
    this.frame = this.h.dj.frame(housePlays);
    const party = show.dj.volume;
    this.h.sound.setHouse(!this.h.dj.setPlays() && housePlays ? show.dj.house.style : null, show.dj.house.dropAt, now, hearing, party);
    const f = this.frame;
    this.djLevel = f ? Math.min(1, f.energy * (0.55 + 0.45 * f.beat)) : 0;
    setVenueLevel('dj', this.djLevel);
    // A drop landing: the crowd goes up, confetti from the ceiling.
    if (f && f.part === 'drop' && f.sinceDrop < this.lastDrop && f.sinceDrop < 0.4) {
      this.cheer = 1;
      if (hearing === 'hall') this.h.sound.play('roar', undefined, 0.8);
      this.confetti.rain({ minX: -9, maxX: 15, minZ: -4, maxZ: 3 }, 500, 4, () => 8.5);
    }
    this.lastDrop = f && f.part === 'drop' ? f.sinceDrop : Infinity;
    // ---- The stage: smoothed, its onsets for a beat, applause when a song ends.
    const raw = Math.max(0, venueLevel() - this.djLevel);
    const st = this.stage;
    st.fast += (raw - st.fast) * Math.min(1, dt * 12);
    st.slow += (raw - st.slow) * Math.min(1, dt * (raw > st.slow ? 2.5 : 0.35));
    if (raw > st.slow + 0.12 && t - st.lastOnset > 0.28) {
      const gap = t - st.lastOnset;
      if (gap < 1.6) st.gaps = [...st.gaps.slice(-5), gap];
      st.lastOnset = t;
      const sorted = [...st.gaps].sort((a, b) => a - b);
      if (sorted.length >= 3) st.bpm = Math.min(180, Math.max(70, 60 / sorted[Math.floor(sorted.length / 2)]));
      st.beats = Math.round(st.beats);
    } else st.beats += (dt * st.bpm) / 60;
    if (st.slow > 0.15) {
      st.playedFor += dt;
      st.quietFor = 0;
    } else if (st.slow < 0.04) {
      st.quietFor += dt;
      if (st.playedFor > 12 && st.quietFor > 1.2) {
        // The song's over: applause, and after a long one now and then the crowd wants more.
        this.applause = 1;
        this.cheer = 1;
        if (hearing !== 'off') {
          this.h.sound.play('applause', undefined, Math.min(1, this.crowd.present / 50));
          this.h.sound.play('roar', undefined, Math.min(1, this.crowd.present / 60));
        }
        if (st.playedFor > 45 && Math.random() < 0.5) setTimeout(() => this.zugabe(Math.min(1, this.crowd.present / 60)), 2500);
        st.playedFor = 0;
      }
    }
    this.applause = Math.max(0, this.applause - dt / 5);
    this.chant = Math.max(0, this.chant - dt / 5.5);
    this.cheer = Math.max(0, this.cheer - dt / 3);
    // ---- The crowd.
    const me = store.you;
    const people: Spot[] = [];
    const surfers: Spot[] = [];
    const add = (id: string, x: number, y: number, z: number) => {
      if (show.surfers.includes(id)) surfers.push({ x, z });
      else if (y < 0.6) people.push({ x, z });
    };
    const p = ctx.player.pos;
    const mine = this.h.surf.where();
    if (mine) surfers.push(mine);
    else add(me, p.x, p.y, p.z);
    for (const o of store.peers.values()) if (o.id !== me && o.floor === VENUE) add(o.id, o.x, o.y, o.z);
    this.jumps = this.jumps.filter((j) => now - j.at < 4000);
    const pit = findPit(this.jumps, now);
    if (pit && (this.pitSound -= dt) <= 0 && hearing === 'hall') {
      this.pitSound = 0.9;
      this.h.sound.play('pit', { x: pit.x, y: 1, z: pit.z }, 0.6);
    }
    this.pit = pit;
    const count = crowdTarget({ hour: new Date().getHours() + new Date().getMinutes() / 60, mode, live: this.h.live(), music: !!f, stage: st.slow });
    const inHall = hearing === 'hall';
    const wod = show.wodAt && now - show.wodAt < 10_000 ? show.wodAt : 0;
    this.crowd.update(
      { now, t, dt, mode, count, music: f, stage: st.slow, stageBeats: st.beats, players: people, surfers, pit, wodAt: wod, applause: this.applause, chant: this.chant, cheer: this.cheer, eye: ctx.camera.position },
      inHall,
    );
    const hype = club ? (f ? f.energy * 0.7 + (f.part === 'drop' ? 0.3 : 0) : 0.1) : Math.min(1, st.slow * 1.3);
    this.h.sound.setCrowd(this.crowd.present / 60, Math.max(hype, this.cheer, this.chant * 0.8), hearing);
    // ---- The booth, the barrier, the balls, the edge to dive off, the confetti, a flash.
    const djName = show.dj.dj ? show.dj.dj.name : null;
    this.booth?.update(t, dt, { frame: f, dj: djName, title: this.h.dj.title(), club });
    this.floor?.update(t, dt, !club);
    this.confetti.update(dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.intensity = this.flashT > 0 ? 40 * (this.flashT / 0.18) : 0;
    if (this.floor) {
      const showBalls = club && this.crowd.present >= 18 && inHall;
      this.floor.balls.forEach((b, i) => {
        b.mesh.visible = showBalls;
        b.it.off = !showBalls;
        if (!showBalls) return;
        const q = this.ballPos(i);
        b.mesh.position.set(q.x, q.y, q.z);
        b.mesh.rotation.x += dt * (q.vz || 0.3);
        b.mesh.rotation.z -= dt * (q.vx || 0.2);
        b.it.x = q.x;
        b.it.z = q.z;
        b.it.y = 0;
      });
      const edge = atDiveEdge(p.x, p.y, p.z) && !this.h.surf.active;
      this.floor.dive.off = !edge;
      this.floor.diveMesh.visible = edge;
      this.floor.dive.x = Math.max(DIVE_EDGE.minX, Math.min(DIVE_EDGE.maxX, p.x));
    }
    this.poses(show);
  }

  /** The crowd chants "Zugabe!" (someone started it, or it started itself). */
  zugabe(strength: number) {
    this.chant = 1;
    if (this.hearing() !== 'off') this.h.sound.play('zugabe', undefined, Math.max(0.3, strength));
  }

  /** Who's posed how: the DJ at the decks, crowd-surfers, a lighter up. */
  private poses(show: VenueShowState) {
    const me = store.you;
    const ids = new Set<string>([me, ...[...store.peers.values()].filter((o) => o.floor === VENUE).map((o) => o.id)]);
    for (const id of new Set([...ids, ...this.posed.keys()])) {
      const at = id === me ? this.h.ctx.player.pos : store.peers.get(id);
      const surfing = id === me ? this.h.surf.active : show.surfers.includes(id);
      const atDecks = show.dj.dj?.id === id && !!at && Math.hypot(at.x - DJ_SPOT.x, at.z - DJ_SPOT.z) < 1.3;
      const want: PoseKind | null = !ids.has(id) ? null : surfing ? 'surf' : atDecks ? 'dj' : this.h.lit(id) ? 'light' : null;
      const had = this.posed.get(id) ?? null;
      if (want === had) continue;
      const person = id === me ? this.h.ctx.me : this.h.personOf(id);
      if (!person) {
        this.posed.delete(id);
        continue;
      }
      if (had === 'surf') unSurf(person.bones);
      if (!want) {
        person.setWorkout(null);
        this.posed.delete(id);
        continue;
      }
      this.posed.set(id, want);
      person.setWorkout(want === 'surf' ? surfPose : want === 'dj' ? (b: Bones, _dt: number, t: number) => djPose(b, this.frame, t) : lighterPose);
    }
    // A flame (or a phone's light) in the hand of everyone whose lighter is up.
    for (const [id, fl] of this.flames) {
      if (this.posed.get(id) === 'light') continue;
      fl.removeFromParent();
      this.flames.delete(id);
    }
    for (const [id, kind] of this.posed) {
      if (kind !== 'light' || this.flames.has(id)) continue;
      const person = id === me ? this.h.ctx.me : this.h.personOf(id);
      if (!person) continue;
      const fl = flame();
      person.wear(fl, 'hand');
      this.flames.set(id, fl);
    }
  }

  /** Out of the house: quiet, nothing posed, nothing reported. */
  leave() {
    this.h.sound.setHouse(null, 0, 0, 'off', 1);
    setVenueLevel('dj', 0);
    this.djLevel = 0;
    for (const id of [...this.posed.keys()]) {
      const person = id === store.you ? this.h.ctx.me : this.h.personOf(id);
      if (person) {
        if (this.posed.get(id) === 'surf') unSurf(person.bones);
        person.setWorkout(null);
      }
    }
    this.posed.clear();
    for (const fl of this.flames.values()) fl.removeFromParent();
    this.flames.clear();
    this.jumps = [];
  }
}

/** A lighter with its flame, for a hand. */
let glowTex: THREE.Texture | null = null;
function flame(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.02), new THREE.MeshToonMaterial({ color: '#e63946' }));
  body.position.y = -0.42;
  g.add(body);
  glowTex ??= glowTexture();
  const mat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffb347', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.16, 0.22, 1);
  s.position.y = -0.52;
  g.add(s);
  return g;
}

/** A lighter (or a phone) held up high, swaying a little. */
function lighterPose(b: Bones, _dt: number, t: number) {
  b.armR.rotation.set(-0.15, 0, -(2.5 + 0.12 * Math.sin(t * 1.4)));
}

/** Whether (x, z) is on the floor or the stage, where the crowd keys make sense. */
export const onTheFloor = (x: number, z: number) => x >= ZONES.floor.minX && x <= ZONES.floor.maxX + 4.7 && z >= ZONES.floor.minZ - 1 && z <= ZONES.stage.maxZ;
