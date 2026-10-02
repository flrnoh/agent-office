import { CARS, type CarState } from '../shared/garage.js';
import { PUMPS, WASH } from '../shared/tankstelle.js';
import { FILL_MS, SHINE_MS, WASH_MS, readyToFill, readyToWash, type TankClientMsg, type TankServerMsg, type TankState } from '../shared/tankstelle-play.js';

// The petrol station's clock (flrnoh fork, see FORK.md "The petrol station"): on each floor, which
// pumps are filling which car, the car in the wash and how far its programme has got, and the cars
// still shiny from it. The office decides when a fill or a wash starts (only for a car standing at
// that pump or on the wash's marking, asked for from inside it or by someone standing there) and
// ends it, so every page shows the same litres and the same phase; a car that's being filled or
// washed doesn't go anywhere (see holds, and car.drive in ws/handlers/car.ts). Nothing is saved.

/** How near the pump (or the wash's terminal) someone on foot has to be to start it (m). */
const REACH = 4.5;

interface Fill {
  car: number;
  liters: number;
  start: number;
  by: string;
}

/** Who's asking, and where they are. */
export interface TankAsker {
  id: string;
  /** The car they're sitting in on this floor, if any. */
  inCar?: number;
  /** Where they stand. */
  x: number;
  z: number;
}

/** One floor's station. */
export class Forecourt {
  private fills = new Map<number, Fill>();
  private washing: { car: number; start: number; by: string } | null = null;
  private shine = new Map<number, number>();

  constructor(
    private now = () => Date.now(),
    private random = Math.random,
  ) {}

  /** Ends the fills and the wash that are done (a washed car starts shining). Says whether anything changed. */
  settle(): boolean {
    const now = this.now();
    let changed = false;
    for (const [pump, f] of this.fills) {
      if (now - f.start < FILL_MS) continue;
      this.fills.delete(pump);
      changed = true;
    }
    if (this.washing && now - this.washing.start >= WASH_MS) {
      this.shine.set(this.washing.car, this.washing.start + WASH_MS + SHINE_MS);
      this.washing = null;
      changed = true;
    }
    for (const [car, until] of this.shine) if (until <= now) this.shine.delete(car);
    return changed;
  }

  state(): TankState {
    this.settle();
    const now = this.now();
    return {
      fills: [...this.fills].map(([pump, f]) => ({ pump, car: f.car, liters: f.liters, elapsed: now - f.start, by: f.by })),
      wash: this.washing && { car: this.washing.car, elapsed: now - this.washing.start, by: this.washing.by },
      shine: [...this.shine].map(([car, until]) => ({ car, left: until - now })),
    };
  }

  /** Whether car `car` is held where it is: being filled, or in the middle of its wash. */
  holds(car: number): boolean {
    this.settle();
    return this.washing?.car === car || [...this.fills.values()].some((f) => f.car === car);
  }

  /** Milliseconds until the next fill or wash ends, if any is going. */
  nextEnd(): number | undefined {
    const now = this.now();
    const ends = [...this.fills.values()].map((f) => f.start + FILL_MS);
    if (this.washing) ends.push(this.washing.start + WASH_MS);
    return ends.length ? Math.max(0, Math.min(...ends) - now) : undefined;
  }

  /** `who` asks to fill car `car` at pump `pump`: started, or why not. */
  fill(who: TankAsker, pump: number, car: number, cars: readonly CarState[]): string | null {
    this.settle();
    const p = cars[car];
    const q = PUMPS[pump];
    if (!p || !q || !Number.isInteger(pump) || !Number.isInteger(car)) return 'Nothing to fill there';
    if (who.inCar !== car && Math.hypot(who.x - q.x, who.z - q.z) > REACH) return 'Walk up to the pump first';
    if (!readyToFill(p, pump)) return '⛽ Stop the car right beside the pump first';
    if (this.fills.has(pump)) return '⛽ That pump is busy';
    if (this.holds(car)) return '⛽ That car is already being filled';
    // The Bulli's tank is bigger, and nobody's ever quite empty.
    const tank = CARS[car]?.kind === 'bulli' ? 60 : 80;
    const liters = Math.round(tank * (0.3 + this.random() * 0.55) * 100) / 100;
    this.fills.set(pump, { car, liters, start: this.now(), by: who.id });
    return null;
  }

  /** `who` asks to wash car `car`: started, or why not. */
  wash(who: TankAsker, car: number, cars: readonly CarState[]): string | null {
    this.settle();
    const p = cars[car];
    if (!p || !Number.isInteger(car)) return 'Nothing to wash there';
    const t = WASH.terminal;
    if (who.inCar !== car && Math.hypot(who.x - t.x, who.z - t.z) > REACH && Math.hypot(who.x - p.x, who.z - p.z) > REACH) return 'Walk up to the car wash first';
    if (this.washing) return '🧽 The car wash is busy: please wait';
    if (!readyToWash(p)) return '🧽 Drive onto the marking in the car wash and stop first';
    if (this.holds(car)) return '⛽ Finish filling up first';
    this.washing = { car, start: this.now(), by: who.id };
    return null;
  }
}

/** Every floor's station, made when somebody first uses it. */
export class Forecourts {
  private floors = new Map<string, Forecourt>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** `changed(floorId)`: a fill or the wash on that floor has just ended (tell everyone there). */
  constructor(
    private changed: (floorId: string) => void = () => {},
    private make = () => new Forecourt(),
  ) {}

  of(floorId: string): Forecourt {
    let f = this.floors.get(floorId);
    if (!f) this.floors.set(floorId, (f = this.make()));
    return f;
  }

  /** What someone arriving on a floor is sent. */
  view(floorId: string | undefined): TankState | undefined {
    return floorId ? this.floors.get(floorId)?.state() : undefined;
  }

  /** Whether car `car` on `floorId` is being filled or washed (the office then takes no moves for it). */
  holds(floorId: string | undefined, car: number): boolean {
    return !!floorId && !!this.floors.get(floorId)?.holds(car);
  }

  /** Wakes up when the next thing on that floor ends, settles it, and says so. */
  private schedule(floorId: string) {
    clearTimeout(this.timers.get(floorId));
    const f = this.floors.get(floorId);
    const ms = f?.nextEnd();
    if (!f || ms === undefined) return void this.timers.delete(floorId);
    const t = setTimeout(() => {
      this.timers.delete(floorId);
      if (f.settle()) this.changed(floorId);
      this.schedule(floorId);
    }, ms + 30);
    t.unref?.();
    this.timers.set(floorId, t);
  }

  stop() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** A `tank.*` message from `who` on `floorId`, with that floor's cars: the new state for the floor, or why not. */
  message(floorId: string, who: TankAsker, msg: TankClientMsg, cars: readonly CarState[]): { ok: TankServerMsg } | { refused: string } {
    const f = this.of(floorId);
    const car = Math.trunc(Number(msg.car));
    const why = msg.t === 'tank.fill' ? f.fill(who, Math.trunc(Number(msg.pump)), car, cars) : f.wash(who, car, cars);
    if (why) return { refused: why };
    this.schedule(floorId);
    return { ok: { t: 'tankstelle', state: f.state() } };
  }
}
