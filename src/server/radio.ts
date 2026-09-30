import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { stationById } from '../shared/radio.js';

// ---- Radio through the office (flrnoh fork, see FORK.md) -------------------------------------------
// A page served over https (the office behind its Cloudflare tunnel) can't play an http:// stream:
// the browser blocks it as mixed content. So the office fetches such a stream itself and passes the
// audio on from its own origin, as it comes, without keeping any of it.
//
// It's no open proxy: it only fetches a built-in station, or the stream that is on a floor's jukebox
// right now, and never an address on this machine or its network (checked on every connection,
// after DNS, so a name can't be pointed at one later).

/** How long a station may take to answer, and how long it may go quiet while playing. */
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
/** Streams through the office at once, for everyone together. */
const MAX_STREAMS = 24;
const MAX_PLAYLIST_BYTES = 64 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; agent-office jukebox; +https://github.com/flrnoh/agent-office)';

// ---- Which addresses are off limits -------------------------------------------------------------

const PRIVATE = new net.BlockList();
for (const [a, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) PRIVATE.addSubnet(a, bits, 'ipv4');
for (const [a, bits] of [
  ['::', 96], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64],
  // NAT64 (64:ff9b::/96) wrapped around the private IPv4 ranges, and local-use NAT64 altogether.
  ['64:ff9b::', 104], ['64:ff9b::a00:0', 104], ['64:ff9b::7f00:0', 104], ['64:ff9b::a9fe:0', 112], ['64:ff9b::ac10:0', 108],
  ['64:ff9b::c0a8:0', 112], ['64:ff9b::6440:0', 106], ['64:ff9b:1::', 48],
] as const) PRIVATE.addSubnet(a, bits, 'ipv6');

/** An address on this machine, the local network, or otherwise not out on the internet. IPv4 inside IPv6 counts as its IPv4. */
export function isPrivateAddress(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const kind = net.isIP(addr);
  if (kind === 4) return PRIVATE.check(addr, 'ipv4');
  if (kind === 6) return PRIVATE.check(addr, 'ipv6');
  return true; // not an address at all: don't connect to it
}

type Resolve = (host: string) => Promise<string[]>;
const resolveAll: Resolve = async (host) => (await dns.promises.lookup(host, { all: true })).map((a) => a.address);

/** Whether a stream's host is out on the internet: an address that is, or a name that only resolves to such. */
export async function checkHost(hostname: string, resolve: Resolve = resolveAll): Promise<{ ok: true } | { error: string }> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return isPrivateAddress(host) ? { error: "The jukebox doesn't play from this machine or its network" } : { ok: true };
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    return { error: `Couldn't find ${host}` };
  }
  if (!addrs.length || addrs.some(isPrivateAddress)) return { error: "The jukebox doesn't play from this machine or its network" };
  return { ok: true };
}

/** The same check where it counts: on the address the connection really goes to. */
const safeLookup = ((hostname: string, options: dns.LookupOptions, cb: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new Error(`${hostname} is on this machine or its network`), { code: 'EPRIVATE' }));
    }
    if (options.all) cb(null, list);
    else cb(null, list[0].address, list[0].family);
  });
}) as unknown as net.LookupFunction;

// ---- What may be streamed -----------------------------------------------------------------------

/**
 * What /api/radio may fetch: `?station=<id>` for a built-in station, or `?floor=<id>&u=<url>` for the
 * stream on that floor's jukebox, which has to be the one on it right now. Nothing else.
 */
export function radioTarget(q: URLSearchParams, floorStream: (floor: string) => string | undefined): { url: string } | { status: number; error: string } {
  const station = q.get('station');
  if (station !== null) {
    const s = stationById(station);
    return s ? { url: s.url } : { status: 404, error: "The jukebox doesn't know that station" };
  }
  const floor = q.get('floor');
  if (floor !== null) {
    const current = floorStream(floor);
    if (!current) return { status: 404, error: "The jukebox on that floor isn't playing a stream" };
    if (q.get('u') !== current) return { status: 409, error: 'The jukebox has moved on to something else' };
    return { url: current };
  }
  return { status: 400, error: 'Which station?' };
}

/** Whether a request for /api/radio names something it could stream at all (the handler checks the rest, for everyone). */
export function radioRequestShape(q: URLSearchParams): boolean {
  if (q.has('station')) return !!stationById(q.get('station'));
  return !!q.get('floor') && !!q.get('u');
}

// ---- Fetching -------------------------------------------------------------------------------------

type Upstream = { res: http.IncomingMessage; url: URL };

/** Opens `raw`, following redirects (each one checked again), until something answers. */
async function open(raw: string, headers: Record<string, string>, signal: AbortSignal): Promise<Upstream | { status: number; error: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { status: 400, error: "That isn't a web link" };
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { status: 400, error: 'Only http and https streams can play on the jukebox' };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // Addresses skip the DNS lookup (and so safeLookup): check those here.
    if (net.isIP(host) && isPrivateAddress(host)) return { status: 403, error: "The jukebox doesn't play from this machine or its network" };
    let res: http.IncomingMessage;
    try {
      res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        // Radio servers (Icecast, Shoutcast and their CDNs) often end header lines with a bare LF, which
        // Node's strict parser refuses (HPE_CR_EXPECTED); browsers and curl take it, so the office does too.
        const opts = { headers: { 'user-agent': USER_AGENT, ...headers }, lookup: safeLookup, signal, insecureHTTPParser: true };
        const req = (url.protocol === 'https:' ? https : http).get(url, opts, resolve);
        req.setTimeout(TIMEOUT_MS, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
        req.on('error', reject);
      });
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'EPRIVATE') return { status: 403, error: "The jukebox doesn't play from this machine or its network" };
      if (e.code === 'ETIMEDOUT') return { status: 504, error: `${url.host} took too long to answer` };
      return { status: 502, error: `Couldn't reach ${url.host}${e.code ? ` (${e.code})` : ''}` };
    }
    const status = res.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      res.resume();
      try {
        url = new URL(res.headers.location, url);
      } catch {
        return { status: 502, error: `${url.host} sent the jukebox somewhere that isn't a link` };
      }
      continue;
    }
    return { res, url };
  }
  return { status: 502, error: 'That stream sends the jukebox round in circles' };
}

const AUDIO_TYPES = new Set(['application/ogg', 'application/octet-stream', 'video/ogg', 'video/mp4', 'video/webm']);
const isAudio = (type: string) => !type || type.startsWith('audio/') || AUDIO_TYPES.has(type);

/** Passes streams on, a few at a time. */
export class RadioProxy {
  private streams = 0;

  constructor(private readonly max = MAX_STREAMS) {}

  get open(): number {
    return this.streams;
  }

  async pipe(req: http.IncomingMessage, res: http.ServerResponse, target: string): Promise<void> {
    const fail = (status: number, error: string) => {
      if (res.headersSent || res.destroyed) return void res.destroy();
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ error }));
    };
    if (this.streams >= this.max) return fail(503, 'The office is streaming too much radio already. Try again in a moment.');
    this.streams++;
    const abort = new AbortController();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.streams--;
      abort.abort();
    };
    // Whoever listens goes away (walks off, closes the tab): so does the station.
    res.on('close', release);
    const ask: Record<string, string> = { accept: 'audio/*, application/ogg;q=0.9, */*;q=0.5' };
    // An audio file asks for the part it's at; live radio just starts.
    if (typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range)) ask.range = req.headers.range;
    const up = await open(target, ask, abort.signal);
    if (res.destroyed || released) {
      if (!('error' in up)) up.res.destroy();
      return;
    }
    if ('error' in up) {
      fail(up.status, up.error);
      return release();
    }
    const status = up.res.statusCode ?? 0;
    const type = (up.res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (status !== 200 && status !== 206) {
      up.res.destroy();
      fail(502, `${up.url.host} answered ${status}`);
      return release();
    }
    if (!isAudio(type)) {
      up.res.destroy();
      fail(415, `That link isn't a stream (it's ${type})`);
      return release();
    }
    const headers: Record<string, string> = {
      'content-type': type || 'audio/mpeg',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
    };
    for (const h of ['content-length', 'content-range', 'accept-ranges'] as const) {
      const v = up.res.headers[h];
      if (typeof v === 'string') headers[h] = v;
    }
    res.writeHead(status, headers);
    up.res.on('error', () => res.destroy());
    up.res.on('end', release);
    up.res.pipe(res);
  }
}

// ---- Playlists --------------------------------------------------------------------------------

/** A link to a .pls or .m3u playlist, which a browser can't play: the office looks inside for the stream. */
export function isPlaylistUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    return /\.(pls|m3u)$/i.test(new URL(raw.trim()).pathname);
  } catch {
    return false;
  }
}

/** The first stream a playlist lists. */
export function firstInPlaylist(text: string, base: string): string | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const pls = lines.map((l) => /^File\d+\s*=\s*(.+)$/i.exec(l)?.[1]).find(Boolean);
  const entry = pls ?? lines.find((l) => l && !l.startsWith('#') && !l.startsWith('['));
  if (!entry) return undefined;
  try {
    const u = new URL(entry, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Fetches a playlist (with the same care as a stream) and says which stream it points at. */
export async function resolvePlaylist(raw: string): Promise<{ url: string } | { error: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const up = await open(raw.trim(), { accept: 'audio/x-scpls, audio/x-mpegurl, */*;q=0.5' }, abort.signal);
    if ('error' in up) return { error: up.error };
    if (up.res.statusCode !== 200) {
      up.res.destroy();
      return { error: `${up.url.host} answered ${up.res.statusCode}` };
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of up.res) {
      size += (chunk as Buffer).length;
      if (size > MAX_PLAYLIST_BYTES) {
        up.res.destroy();
        return { error: "That playlist is too big to be one: paste the stream's own link" };
      }
      chunks.push(chunk as Buffer);
    }
    const url = firstInPlaylist(Buffer.concat(chunks).toString('utf8'), up.url.href);
    return url ? { url } : { error: 'No stream in that playlist' };
  } catch {
    return { error: "Couldn't read that playlist" };
  } finally {
    clearTimeout(timer);
  }
}
