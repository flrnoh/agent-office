// Links to things the office plays in a site's own embedded player (flrnoh fork, see FORK.md): the
// DJ sets on the roof (shared/djset.ts) and streams on the office TV (shared/tv.ts). What both read
// from a pasted link the same way: that it's a plain web link, where in it to begin, and YouTube.

/** A t= or start= value in seconds: 90, 90s, 1h2m3s, 1:02:03. Undefined when it isn't one. */
export function parseStart(raw: string | null | undefined): number | undefined {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return undefined;
  let secs: number | undefined;
  if (/^\d{1,6}(?:\.\d+)?s?$/.test(s)) secs = parseFloat(s);
  else if (/^\d{1,3}(?::\d{1,2}){1,2}$/.test(s)) secs = s.split(':').reduce((a, p) => a * 60 + Number(p), 0);
  else {
    const m = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(s);
    if (m && (m[1] || m[2] || m[3])) secs = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  return secs !== undefined && Number.isFinite(secs) ? Math.min(Math.floor(secs), 48 * 3600) : undefined;
}

/** The t= in a link's query (or the first of `keys` it has) or its #t=…, in whole seconds (0 without one). */
export function startOf(u: URL, ...keys: string[]): number {
  for (const k of keys) {
    const v = parseStart(u.searchParams.get(k));
    if (v !== undefined) return v;
  }
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  return parseStart(hash.get('t')) ?? 0;
}

/** Seconds as Twitch and YouTube write a t=: 1h2m3s. */
export function hms(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${h ? `${h}h` : ''}${h || m ? `${m}m` : ''}${s}s`;
}

/** A pasted link as a URL and its host (lower case, no trailing dot), or why it's no link to play. */
export interface WebLink {
  u: URL;
  host: string;
  /** The path's parts, without empty ones. */
  parts: string[];
}

/**
 * Reads what someone pasted as a plain web link: http(s), no password or port in it, not too long.
 * `hint` says what to paste instead; `where` is where it'd play ("at the DJ booth").
 */
export function readWebLink(raw: unknown, hint: string, where: string): WebLink | { error: string } {
  let s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { error: hint };
  if (s.length > 2048) return { error: 'That link is too long' };
  // youtube.com/watch?v=… without the https:// in front is fine; anything with another scheme isn't.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { error: `That isn't a link. ${hint}` };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: `Only web links play ${where}. ${hint}` };
  if (u.username || u.password || u.port) return { error: `That link looks odd. ${hint}` };
  return { u, host: u.hostname.toLowerCase().replace(/\.$/, ''), parts: u.pathname.split('/').filter(Boolean) };
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * One YouTube video from a link: watch?v=, youtu.be/, live/, shorts/, embed/ or v/, and its t= or
 * start=. Null when the link isn't YouTube's at all (by its exact host), an error when it's YouTube
 * but not one video (a playlist, a channel).
 */
export function youtubeVideo(l: WebLink): { id: string; start: number; url: string } | { error: string } | null {
  const { u, host, parts } = l;
  if (!YOUTUBE_HOSTS.has(host)) return null;
  let id: string | null = null;
  if (host === 'youtu.be') id = parts[0] ?? null;
  else if (parts[0] === 'watch') id = u.searchParams.get('v');
  else if (['live', 'shorts', 'embed', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
  if (!id || !YT_ID.test(id)) return { error: 'Paste a link to one YouTube video (a playlist or channel won’t do)' };
  const start = startOf(u, 't', 'start');
  return { id, start, url: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}` };
}
