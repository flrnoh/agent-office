import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDjSetUrl, sameDjSet, djSetSeekable, djSetTitle, partyVolume, seekSpot, setClock, DJ_SET_SITES, type DjSet } from '../../shared/djset.js';
import { validTap, type DjBeats, type DjTap } from '../../shared/djbeats.js';
import { ZONES, STAGE_HEIGHT } from '../../shared/venue.js';
import {
  BALLS,
  HOUSE_STYLES,
  WOD_EVERY,
  atDecks,
  atDiveEdge,
  isHouseStyle,
  type BallHit,
  type DjFx,
  type Gig,
  type HouseStyle,
  type VenueDjState,
  type VenueShowServerMsg,
  type VenueShowState,
} from '../../shared/venueshow.js';
import { hitBall } from '../../shared/venueshow-balls.js';
import { DjBeatsJobs, type Hear } from '../djbeats/index.js';
import { LinkPlayer, oembed, type TitleLookup } from '../embeds.js';
import { GigCalendar } from './gigs.js';

/*
 * The SCHALLWERK's show, the office's side (flrnoh fork, see FORK.md "The show"): the DJ booth (one
 * DJ at a time, a set from YouTube, SoundCloud or Mixcloud heard for its beats like the roof's, or
 * the house mix with its style and the drops the DJ calls), who's crowd-surfing and whose lighter is
 * up, the beach balls' last hits, the Wall of Death, and the gig calendar (gigs.ts). Everything said
 * goes to everyone in the house (`toVenue`); the calendar and a gig starting to the whole office.
 */

const OEMBED: Record<DjSet['kind'], string> = {
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
  soundcloud: 'https://soundcloud.com/oembed?format=json&url=',
  mixcloud: 'https://app.mixcloud.com/oembed/?format=json&url=',
};
const oembedTitle: TitleLookup<DjSet> = (set) => oembed(OEMBED[set.kind], set.url);

/** The set on at the house's booth, saved in venue-dj.json, and what the office heard in it. */
export class VenueDjBooth extends LinkPlayer<DjSet> {
  private beats: DjBeatsJobs;
  private tapped: DjTap | null = null;
  /** How hearing the set that's on is going changed: tell the house. */
  onBeats: () => void = () => {};

  constructor(dataDir: string, lookup: TitleLookup<DjSet> = oembedTitle, hear?: Hear) {
    super({ file: path.join(dataDir, 'venue-dj.json'), parse: parseDjSetUrl, same: sameDjSet, lookup });
    this.beats = new DjBeatsJobs(dataDir, (url) => url === super.state().set?.url && this.onBeats(), hear);
    this.beats.want(super.state().set);
  }

  playing() {
    const s = super.state();
    const beats = s.set ? this.beats.statusOf(s.set.url) : undefined;
    return { ...s, ...(beats ? { beats } : {}), ...(s.set && this.tapped ? { tap: this.tapped } : {}) };
  }

  override play(raw: unknown, by: string) {
    const r = super.play(raw, by);
    if ('changed' in r && r.changed) {
      this.tapped = null;
      this.beats.want(super.state().set);
    }
    return r;
  }

  override stop(by: string): boolean {
    this.tapped = null;
    this.beats.want(null);
    return super.stop(by);
  }

  heard(): DjBeats | null {
    const set = super.state().set;
    return set && this.beats.statusOf(set.url)?.status === 'ready' ? this.beats.get(set.url) : null;
  }

  tap(bpm: number, at: number): boolean {
    if (!super.state().set) return false;
    if (bpm === 0) {
      const had = !!this.tapped;
      this.tapped = null;
      return had;
    }
    if (!validTap(bpm, at)) return false;
    this.tapped = { bpm: Math.round(bpm * 10) / 10, at: Math.round(at) };
    return true;
  }
}

/** Someone in the house, as the show needs them. */
export interface ShowPerson {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface ShowHooks {
  dataDir: string;
  now(): number;
  /** To everyone in the house. */
  toVenue(m: VenueShowServerMsg, except?: string): void;
  /** To everyone in the office. */
  toAll(m: VenueShowServerMsg): void;
  /** How many are in the house now. */
  present(): number;
  lookup?: TitleLookup<DjSet>;
  hear?: Hear;
}

type Result = { error: string } | { ok: true; toast?: string };
const ok = (toast?: string): Result => ({ ok: true, ...(toast ? { toast } : {}) });

export class VenueShow {
  readonly calendar: GigCalendar;
  readonly booth: VenueDjBooth;
  private dj: { id: string; name: string } | null = null;
  private house: { style: HouseStyle; dropAt: number } = { style: 'house', dropAt: 0 };
  private surfers = new Set<string>();
  private lights = new Set<string>();
  private balls: (BallHit | undefined)[] = new Array(BALLS).fill(undefined);
  private wodAt = 0;
  private timer: NodeJS.Timeout | null = null;
  /** The house's volume for everyone in it, and who set it (kept in venue-volume.json). */
  private level = 1;
  private levelBy = '';
  /**
   * The building's seam: a gig from the calendar has started (once each). The building switches the
   * house to the gig's mode here (FORK.md "The show": the integrator wires it to `venue.mode`).
   */
  onGigStart: ((gig: Gig) => void) | null = null;

  constructor(private h: ShowHooks) {
    this.calendar = new GigCalendar(h.dataDir, h.now());
    this.booth = new VenueDjBooth(h.dataDir, h.lookup, h.hear);
    this.booth.onBeats = () => this.djChanged();
    try {
      const saved = JSON.parse(readFileSync(this.levelFile(), 'utf8')) as { volume?: unknown; by?: unknown };
      this.level = partyVolume(saved.volume) ?? 1;
      this.levelBy = typeof saved.by === 'string' ? saved.by.slice(0, 24) : '';
    } catch {
      // none yet: the DJ's own level
    }
  }

  private levelFile() {
    return path.join(this.h.dataDir, 'venue-volume.json');
  }

  start() {
    this.timer ??= setInterval(() => this.tick(), 5000);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---- What's going on -----------------------------------------------------------------------------

  djState(): VenueDjState {
    return { dj: this.dj, ...this.booth.playing(), house: { ...this.house }, volume: this.level, ...(this.levelBy ? { volumeBy: this.levelBy } : {}) };
  }

  state(): VenueShowState {
    return { dj: this.djState(), surfers: [...this.surfers], lights: [...this.lights], balls: this.balls.map((b) => b ?? null), wodAt: this.wodAt };
  }

  gigsMsg(now = this.h.now()): VenueShowServerMsg {
    return { t: 'gigs', gigs: this.calendar.upcoming(now), live: this.calendar.live(now)?.id ?? null };
  }

  private djChanged() {
    this.h.toVenue({ t: 'venuedj', state: this.djState() });
  }

  /** Every few seconds: a gig starting, gigs going. */
  tick(now = this.h.now()) {
    const { started, changed } = this.calendar.tick(now);
    if (changed) this.h.toAll(this.gigsMsg(now));
    if (started) {
      this.h.toAll({ t: 'gig.started', gig: started });
      this.onGigStart?.(started);
    }
  }

  // ---- The DJ booth ------------------------------------------------------------------------------------

  /** Take the decks: only standing at them, only while nobody else has them. */
  take(p: ShowPerson): Result {
    if (this.dj?.id === p.id) return ok();
    if (!atDecks(p.x, p.z, p.y + 0.3)) return { error: 'Erst rauf aufs DJ-Pult' };
    if (this.dj) return { error: `Am Pult steht gerade ${this.dj.name}` };
    this.dj = { id: p.id, name: p.name.slice(0, 24) };
    this.djChanged();
    return ok(`🎧 ${this.dj.name} übernimmt das Pult`);
  }

  /** Give the decks back (the set plays on); false when they weren't theirs. */
  leave(id: string): boolean {
    if (this.dj?.id !== id) return false;
    this.dj = null;
    this.djChanged();
    return true;
  }

  isDj = (id: string) => this.dj?.id === id;

  /** A set on, by the DJ. `titled` resolves once the site has said what it's called. */
  play(p: ShowPerson, url: unknown): Result & { titled?: Promise<void> } {
    if (!this.isDj(p.id)) return { error: 'Nur wer am Pult steht, legt auf' };
    const parsed = parseDjSetUrl(url);
    if ('error' in parsed) return parsed;
    if (sameDjSet(this.booth.state().set, parsed)) return { error: 'Das läuft schon' };
    if (!this.booth.allow(p.id, this.h.now())) return { error: 'Langsam, gib dem Set einen Moment' };
    const r = this.booth.play(url, p.name);
    if ('error' in r) return r;
    if (!r.changed) return { error: 'Das läuft schon' };
    this.djChanged();
    const { startedAt } = this.booth.state();
    const titled = r.titled.then(() => {
      const now = this.booth.state();
      if (!now.set || now.startedAt !== startedAt) return;
      if (now.set.title) this.djChanged();
    });
    return { ok: true, toast: `🎧 ${p.name} legt auf: ${djSetTitle(parsed)} (${DJ_SET_SITES[parsed.kind]})`, titled };
  }

  /** Back to the house mix, by the DJ. */
  stopSet(p: ShowPerson): Result {
    if (!this.isDj(p.id)) return { error: 'Nur wer am Pult steht, legt auf' };
    if (!this.booth.allow(p.id, this.h.now())) return { error: 'Langsam, gib dem Set einen Moment' };
    if (!this.booth.stop(p.name)) return ok();
    this.djChanged();
    return ok(`🏠 ${p.name} spielt wieder den Hausmix`);
  }

  /** Skip to `at` seconds into the set that's on, by the DJ. */
  seek(p: ShowPerson, at: unknown): Result {
    if (!this.isDj(p.id)) return { error: 'Nur wer am Pult steht, spult im Set' };
    const set = this.booth.state().set;
    if (!set) return { error: 'Erst ein Set auflegen' };
    if (!djSetSeekable(set)) return { error: 'Ein SoundCloud-Set läuft nur von vorn, da lässt sich nicht spulen' };
    const spot = seekSpot(at);
    if (spot === null || !this.booth.allow(`seek:${p.id}`, this.h.now(), 400)) return ok();
    if (!this.booth.seek(spot, this.h.now())) return ok();
    this.djChanged();
    return ok(`⏩ ${p.name} spult das Set auf ${setClock(spot)}`);
  }

  /** The house's volume, for everyone in it (the team's: guests.ts); false when it's no volume or already that. */
  setVolume(v: unknown, by: string): boolean {
    const level = partyVolume(v);
    if (level === null || (level === this.level && by === this.levelBy)) return false;
    this.level = level;
    this.levelBy = by.slice(0, 24);
    try {
      writeFileSync(this.levelFile(), JSON.stringify({ volume: level, by: this.levelBy }), { mode: 0o600 });
    } catch {
      // disk issues shouldn't take the office down
    }
    this.djChanged();
    return true;
  }

  tap(p: ShowPerson, bpm: unknown, at: unknown): Result {
    if (!this.isDj(p.id)) return { error: 'Nur wer am Pult steht, tippt das Tempo' };
    if (typeof bpm !== 'number' || typeof at !== 'number' || !this.booth.allow(`tap:${p.id}`, this.h.now())) return { error: 'Langsam' };
    if (!this.booth.tap(bpm, at)) return { error: 'Das ist kein Tempo' };
    this.djChanged();
    return ok();
  }

  houseStyle(p: ShowPerson, style: unknown): Result {
    if (!this.isDj(p.id)) return { error: 'Nur wer am Pult steht, wählt den Hausmix' };
    if (!isHouseStyle(style)) return { error: 'Den Stil gibt’s nicht' };
    if (style === this.house.style) return ok();
    this.house = { ...this.house, style };
    this.djChanged();
    return ok(`🎛️ Hausmix: ${HOUSE_STYLES[style].name}`);
  }

  /** A button on the desk: the horn (relayed by the caller), a drop (the house mix builds from the next bar), a Wall of Death. */
  fx(p: ShowPerson, fx: DjFx): Result {
    if (!this.isDj(p.id)) return { error: 'Nur wer am Pult steht' };
    const now = this.h.now();
    if (fx === 'drop') {
      if (now - this.house.dropAt < 16_000) return { error: 'Der letzte Drop läuft noch' };
      this.house = { ...this.house, dropAt: now };
      this.djChanged();
      return ok();
    }
    if (fx === 'wod') return this.wod(p, true);
    return ok();
  }

  // ---- The crowd ----------------------------------------------------------------------------------------

  /** A Wall of Death: from the stage, or the DJ; not too often in the house. */
  wod(p: ShowPerson, fromBooth = false): Result {
    const now = this.h.now();
    const onStage = p.x >= ZONES.stage.minX && p.x <= ZONES.stage.maxX && p.z >= ZONES.stage.minZ && p.z <= ZONES.stage.maxZ && p.y > STAGE_HEIGHT - 0.4;
    if (!onStage && !(fromBooth && this.isDj(p.id))) return { error: 'Die Wall of Death ruft man von der Bühne (oder vom DJ-Pult)' };
    if (now - this.wodAt < WOD_EVERY) return { error: 'Die letzte Wall of Death ist gerade erst vorbei' };
    this.wodAt = now;
    this.h.toVenue({ t: 'show.wod', at: now, by: p.name });
    return ok(`💀 ${p.name}: WALL OF DEATH!`);
  }

  /** Off the stage onto the crowd (only from the stage's front edge), or down at the back. */
  surf(p: ShowPerson, on: boolean): Result {
    if (on === this.surfers.has(p.id)) return ok();
    if (on && !atDiveEdge(p.x, p.y + 0.2, p.z)) return { error: 'Stagediven geht nur vorne von der Bühne' };
    if (on) this.surfers.add(p.id);
    else this.surfers.delete(p.id);
    this.h.toVenue({ t: 'show.surf', id: p.id, on });
    return ok();
  }

  /** A lighter up or down (kept for whoever comes in later). */
  light(id: string, on: boolean): boolean {
    if (on === this.lights.has(id)) return false;
    if (on) this.lights.add(id);
    else this.lights.delete(id);
    return true;
  }

  /** A beach ball hit; null when it's out of reach (or no such ball). */
  ball(p: ShowPerson, i: unknown, v: { vx: unknown; vy: unknown; vz: unknown }): BallHit | null {
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= BALLS) return null;
    const n = (x: unknown) => (typeof x === 'number' ? x : 0);
    const hit = hitBall(i as number, this.balls[i as number], this.h.now(), p, { vx: n(v.vx), vy: n(v.vy), vz: n(v.vz) });
    if (!hit) return null;
    this.balls[i as number] = hit;
    this.h.toVenue({ t: 'show.ball', i: i as number, ball: hit, by: p.id });
    return hit;
  }

  /**
   * Someone left the house (or the office): the decks, their surf and their lighter go; the last one
   * out takes the set off, so the next night starts with the house mix.
   */
  gone(id: string) {
    if (this.dj?.id === id) {
      this.dj = null;
      this.djChanged();
    }
    if (this.surfers.delete(id)) this.h.toVenue({ t: 'show.surf', id, on: false });
    if (this.lights.delete(id)) this.h.toVenue({ t: 'show.act', id, act: 'unlight', x: 0, z: 0 });
    if (this.h.present() === 0 && this.booth.state().set) this.booth.stop('');
  }
}
