import { createReadStream, statSync } from 'node:fs';
import type http from 'node:http';

/*
 * Handing the set's video to the browsers on the roof (flrnoh fork, see FORK.md "The set's video on
 * the LED wall"), in the pieces a <video> asks for (HTTP Range), so it can start and jump anywhere
 * in an hour-long set without fetching all of it.
 */

/** The bytes asked for, `start` to `end` inclusive; null: all of it; 'bad': none that can be given. */
export type Wanted = { start: number; end: number } | null | 'bad';

/**
 * Reads a Range header for a file of `size` bytes: `bytes=a-b`, `bytes=a-` or `bytes=-n`. Several
 * ranges at once (which no <video> asks for) get the whole file; one that's malformed, or begins past
 * the end, is 'bad' (416).
 */
export function parseRange(header: string | undefined, size: number): Wanted {
  if (!header) return null;
  const m = /^bytes=(.+)$/.exec(header.trim());
  if (!m) return 'bad';
  if (m[1].includes(',')) return null;
  const r = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(m[1]);
  if (!r || (!r[1] && !r[2])) return 'bad';
  if (!r[1]) {
    // The last n bytes.
    const n = Number(r[2]);
    if (!n || !size) return 'bad';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(r[1]);
  const end = r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || start >= size || end < start) return 'bad';
  return { start, end };
}

/** Sends `file` (an MP4) whole or the range asked for; HEAD gets the headers only. */
export function serveVideo(req: http.IncomingMessage, res: http.ServerResponse, file: string) {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ error: 'no video' }));
    return;
  }
  const head = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' };
  const want = parseRange(req.headers.range, size);
  if (want === 'bad') {
    res.writeHead(416, { ...head, 'content-range': `bytes */${size}` }).end();
    return;
  }
  const { start, end } = want ?? { start: 0, end: size - 1 };
  res.writeHead(want ? 206 : 200, { ...head, 'content-length': String(size ? end - start + 1 : 0), ...(want ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
  if (req.method === 'HEAD' || !size) return res.end();
  const stream = createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
