import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { DjSet } from '../../shared/djset.js';
import { BeatsError, findTools, run } from '../djbeats/fetch.js';

/*
 * Getting a YouTube set's picture for the roof's LED wall (flrnoh fork, see FORK.md "The set's video
 * on the LED wall"): yt-dlp fetches a small copy of its video, without sound, at about the LED wall's
 * own size (192 LEDs across). Only H.264 in MP4 (avc1), the one kind every browser plays (Safari
 * plays no VP9 from a file) and the office needs nothing else to make, no ffmpeg; and only one that
 * comes as a single file (not HLS pieces, which would need ffmpeg to put together).
 */

/** The smallest H.264 picture there is, up to 360 lines. */
export const VIDEO_FORMAT = [144, 240, 360].map((h) => `bv*[height<=${h}][vcodec^=avc1][ext=mp4][protocol=https]`).join('/');
/** The most it fetches (a 144p copy runs to about 50 MB an hour) and the longest it waits for it. */
const MAX_SIZE = '400M';
const FETCH_MS = 20 * 60_000;

/**
 * Fetches `set`'s video into `dir` as `<name>.mp4`, and says where it is. Whatever it leaves on the way
 * (`<name>.dl.*`) is gone afterwards, whether it got there or not.
 */
export async function fetchVideo(set: DjSet, dir: string, name: string, signal: AbortSignal): Promise<string> {
  const { ytdlp } = findTools();
  if (!ytdlp) throw new BeatsError('yt-dlp is not installed on the office');
  if (set.kind !== 'youtube') throw new BeatsError('only YouTube sets have a video');
  const leftovers = () => {
    for (const f of readdirSync(dir)) if (f.startsWith(`${name}.dl.`)) rmSync(path.join(dir, f), { force: true });
  };
  try {
    await run(
      ytdlp,
      ['--no-playlist', '--no-progress', '--no-warnings', '-q', '-f', VIDEO_FORMAT, '--max-filesize', MAX_SIZE, '--match-filter', '!is_live', '-o', path.join(dir, `${name}.dl.%(ext)s`), '--', set.url],
      signal,
      FETCH_MS,
    ).catch((e: Error) => {
      throw signal.aborted ? e : /Requested format is not available/i.test(e.message) ? new BeatsError('YouTube has no small H.264 copy of it') : e;
    });
    const got = readdirSync(dir).find((f) => f === `${name}.dl.mp4`);
    if (!got) throw new BeatsError("it's a live stream, too big, or YouTube wouldn't give its video");
    return path.join(dir, got);
  } catch (e) {
    leftovers();
    throw e;
  }
}
