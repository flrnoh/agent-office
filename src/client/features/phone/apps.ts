/**
 * flrnoh fork (see FORK.md "The phone"): the apps on your phone. A feature adds its own
 * (features/waymo's robotaxis, the bus departures, the map) and the phone shows them on its home
 * screen, in the order they were added; opening one hands it the screen to draw on.
 */

export interface PhoneHost {
  /** Away with the phone. */
  close(): void;
  /** Back to the home screen. */
  home(): void;
}

export interface PhoneApp {
  id: string;
  name: string;
  /** An emoji, or a few letters, on its colored tile. */
  icon: string;
  color: string;
  /** A little count or dot on its tile (your robotaxi on its way), if anything. */
  badge?(): string | null;
  /** Draws the app into `screen`; what it gives back runs when it's left. */
  open(screen: HTMLElement, phone: PhoneHost): (() => void) | void;
}

const apps: PhoneApp[] = [];

/** Puts an app on the phone. */
export function addPhoneApp(app: PhoneApp) {
  if (apps.some((a) => a.id === app.id)) throw new Error(`Phone app ${app.id} is already there`);
  apps.push(app);
}

export const phoneApps = (): readonly PhoneApp[] => apps;
