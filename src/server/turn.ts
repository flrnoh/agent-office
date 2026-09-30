import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Cloudflare TURN for voice and screen sharing (flrnoh fork, see FORK.md).
 *
 * Browsers call each other directly (WebRTC). STUN finds the way through most home routers, but
 * from a phone network, an office network or behind some routers the direct way fails: you're
 * "in voice" and your mic lights up, but nothing arrives. A TURN server relays the audio then.
 * Cloudflare's hands out short-lived credentials; the office fetches them with a TURN key and passes
 * them to every page as it connects (the `ice` of the welcome). Without a key nothing changes.
 *
 * The key: `<office>/.agent-office/turn.json` = {"keyId": "...", "apiToken": "..."} (mode 0600), or
 * the environment's CF_TURN_KEY_ID and CF_TURN_API_TOKEN.
 */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnKey {
  keyId: string;
  apiToken: string;
}

/** Credentials live this long; a page keeps the ones it got as it connected. */
export const TURN_TTL_S = 48 * 3600;
/** Fetched again this often, well before they run out. */
export const TURN_REFRESH_MS = 12 * 3600_000;
/** After a failed fetch, try again this soon. */
export const TURN_RETRY_MS = 5 * 60_000;

const KEY_ID = /^[a-zA-Z0-9]{8,128}$/;
const TOKEN = /^[\w.-]{16,512}$/;

/** The TURN key from the environment or turn.json, or undefined (no TURN, or a broken file: said once on stderr). */
export function readTurnKey(dataDir: string, env: NodeJS.ProcessEnv = process.env): TurnKey | undefined {
  const fromEnv = { keyId: env.CF_TURN_KEY_ID?.trim() ?? '', apiToken: env.CF_TURN_API_TOKEN?.trim() ?? '' };
  if (fromEnv.keyId || fromEnv.apiToken) return checkKey(fromEnv, 'CF_TURN_KEY_ID / CF_TURN_API_TOKEN');
  const file = path.join(dataDir, 'turn.json');
  if (!existsSync(file)) return undefined;
  try {
    if (process.platform !== 'win32' && (statSync(file).mode & 0o077) !== 0) {
      console.warn(`agent-office: ${file} can be read by others — chmod 600 it`);
    }
    const j = JSON.parse(readFileSync(file, 'utf8')) as Partial<TurnKey>;
    return checkKey({ keyId: String(j.keyId ?? '').trim(), apiToken: String(j.apiToken ?? '').trim() }, file);
  } catch (err) {
    console.error(`agent-office: couldn't read ${file}: ${(err as Error).message} — voice runs without TURN`);
    return undefined;
  }
}

function checkKey(k: TurnKey, where: string): TurnKey | undefined {
  if (KEY_ID.test(k.keyId) && TOKEN.test(k.apiToken)) return k;
  console.error(`agent-office: the TURN key in ${where} doesn't look right (key id and API token) — voice runs without TURN`);
  return undefined;
}

/** Only what a browser can use: turn/turns/stun URLs, never port 53 (browsers block it and ICE then waits for a timeout). */
export function usableIce(servers: unknown): IceServer[] {
  if (!Array.isArray(servers)) return [];
  const out: IceServer[] = [];
  for (const s of servers) {
    if (!s || typeof s !== 'object') continue;
    const raw = (s as IceServer).urls;
    const urls = (Array.isArray(raw) ? raw : [raw]).filter(
      (u): u is string => typeof u === 'string' && /^(stun|turns?):[^\s]+$/.test(u) && !/:53(\?|$)/.test(u),
    );
    if (!urls.length) continue;
    const { username, credential } = s as IceServer;
    out.push({ urls, ...(typeof username === 'string' ? { username } : {}), ...(typeof credential === 'string' ? { credential } : {}) });
  }
  return out;
}

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** Asks Cloudflare for a fresh set of ICE servers with TURN credentials. */
export async function fetchTurnIce(key: TurnKey, fetchFn: Fetch = fetch): Promise<IceServer[]> {
  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(key.keyId)}/credentials/generate-ice-servers`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${key.apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: TURN_TTL_S }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Cloudflare answered ${res.status}`);
  const ice = usableIce(((await res.json()) as { iceServers?: unknown })?.iceServers);
  if (!ice.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith('turn')))) throw new Error('no TURN server in the answer');
  return ice;
}

/** Keeps a fresh set of TURN credentials around, and hands out the ICE servers pages should use. */
export class Turn {
  private ice: IceServer[] = [];
  private timer: NodeJS.Timeout | undefined;
  private lastError = '';

  constructor(
    private key: TurnKey | undefined,
    private base: IceServer[],
    private fetchFn: Fetch = fetch,
  ) {}

  get enabled(): boolean {
    return !!this.key;
  }

  /** What a page gets as it connects: the office's own servers, plus TURN once it's there. */
  servers(): IceServer[] {
    return this.ice.length ? [...this.base, ...this.ice] : this.base;
  }

  start() {
    if (this.key) void this.refresh();
  }

  stop() {
    clearTimeout(this.timer);
  }

  async refresh(): Promise<boolean> {
    if (!this.key) return false;
    clearTimeout(this.timer);
    try {
      this.ice = await fetchTurnIce(this.key, this.fetchFn);
      if (this.lastError) console.log('agent-office: TURN for voice is back');
      this.lastError = '';
      this.timer = setTimeout(() => void this.refresh(), TURN_REFRESH_MS);
      this.timer.unref?.();
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== this.lastError) console.warn(`agent-office: couldn't get TURN credentials from Cloudflare (${msg}) — voice from outside may not connect`);
      this.lastError = msg;
      this.timer = setTimeout(() => void this.refresh(), TURN_RETRY_MS);
      this.timer.unref?.();
      return false;
    }
  }
}
