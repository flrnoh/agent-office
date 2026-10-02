import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, openSync, readdirSync, readSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DjSet } from '../../shared/djset.js';
import type { DjBeats } from '../../shared/djbeats.js';
import { analyse, FeatureStream, RATE } from './analyse.js';

/*
 * Getting a DJ set's audio to hear it (flrnoh fork, see FORK.md): yt-dlp fetches the audio from
 * YouTube, SoundCloud or Mixcloud into a throwaway folder, ffmpeg (or, without it, macOS' own
 * afconvert) turns it into mono 16-bit samples, and analyse.ts listens to them. The audio is
 * deleted as soon as it's been heard; only what was heard (a few dozen kB) is kept.
 */

/** The programs it needs, where they are on this machine (null: not there). */
export interface BeatTools {
  ytdlp: string | null;
  ffmpeg: string | null;
  afconvert: string | null;
}

/** Where Homebrew and the like put them; a launch agent's PATH has none of these. */
const DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(process.env.HOME ?? '', '.local/bin')];

function which(name: string, env?: string): string | null {
  if (env && existsSync(env)) return env;
  for (const dir of [...DIRS, ...(process.env.PATH ?? '').split(path.delimiter)]) {
    const p = path.join(dir, name);
    if (dir && existsSync(p)) return p;
  }
  return null;
}

export function findTools(): BeatTools {
  return { ytdlp: which('yt-dlp', process.env.AGENT_OFFICE_YTDLP), ffmpeg: which('ffmpeg', process.env.AGENT_OFFICE_FFMPEG), afconvert: which('afconvert') };
}

/** The longest set it listens to: a longer one is heard up to here. */
const MAX_SECONDS = 4 * 3600;
/** The most it waits for the download, and for the decoding. */
const FETCH_MS = 12 * 60_000;
const DECODE_MS = 6 * 60_000;

/** A failure worth saying as it is (it's shown at the booth). */
export class BeatsError extends Error {}

/** Runs a program to the end; rejects with the last of what it said on stderr (also the set's video's, djvideo/). */
export function run(cmd: string, args: string[], signal: AbortSignal, ms: number, onOut?: (b: Buffer) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // yt-dlp finds deno (for YouTube) and ffmpeg on the PATH: give it Homebrew's too.
    const env = { ...process.env, PATH: [...DIRS, process.env.PATH ?? ''].join(path.delimiter) };
    const p = spawn(cmd, args, { stdio: ['ignore', onOut ? 'pipe' : 'ignore', 'pipe'], env });
    let err = '';
    const stop = () => p.kill('SIGKILL');
    const timer = setTimeout(stop, ms);
    signal.addEventListener('abort', stop, { once: true });
    p.stderr!.on('data', (b: Buffer) => (err = (err + b.toString()).slice(-2000)));
    if (onOut) p.stdout!.on('data', onOut);
    p.on('error', (e) => reject(e));
    p.on('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      if (signal.aborted) return reject(new BeatsError('stopped'));
      if (code === 0) return resolve();
      reject(new Error(`${path.basename(cmd)} exited with ${code}: ${err.trim().split('\n').pop() ?? ''}`));
    });
  });
}

/** Where a WAV file's samples start, and how many bytes of them there are. */
function wavData(file: string): { offset: number; length: number } {
  const fd = openSync(file, 'r');
  try {
    const head = Buffer.alloc(64 * 1024);
    const n = readSync(fd, head, 0, head.length, 0);
    if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
    for (let at = 12; at + 8 <= n; ) {
      const id = head.toString('ascii', at, at + 4);
      const size = head.readUInt32LE(at + 4);
      if (id === 'data') return { offset: at + 8, length: size };
      at += 8 + size + (size % 2);
    }
    throw new Error('no samples in the WAV file');
  } finally {
    closeSync(fd);
  }
}

/** Fetches a set's audio, hears it, and throws the audio away. */
export async function hearSet(set: DjSet, tools: BeatTools, signal: AbortSignal): Promise<DjBeats> {
  if (!tools.ytdlp) throw new BeatsError('yt-dlp is not installed on the office');
  if (!tools.ffmpeg && !tools.afconvert) throw new BeatsError('ffmpeg is not installed on the office');
  if (set.kind === 'soundcloud' && set.id.includes('/sets/')) throw new BeatsError('a SoundCloud playlist plays track by track');
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-office-dj-'));
  try {
    // Without ffmpeg only what afconvert can read: AAC (m4a) or MP3.
    const format = tools.ffmpeg ? 'bestaudio/best' : 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio[ext=mp3]/bestaudio[acodec=mp3]/best[ext=mp4]';
    await run(
      tools.ytdlp,
      ['--no-playlist', '--no-progress', '--no-warnings', '-q', '-f', format, '--max-filesize', '600M', '--match-filter', '!is_live', '-o', path.join(dir, 'audio.%(ext)s'), '--', set.url],
      signal,
      FETCH_MS,
    );
    const got = readdirSync(dir).find((f) => f.startsWith('audio.') && !f.endsWith('.part'));
    if (!got) throw new BeatsError("it's a live stream, or the site wouldn't give its audio");
    const audio = path.join(dir, got);
    const fs = new FeatureStream();
    const enough = () => fs.seconds() >= MAX_SECONDS;
    if (tools.ffmpeg) {
      const inner = new AbortController();
      const stop = () => inner.abort();
      signal.addEventListener('abort', stop, { once: true });
      await run(tools.ffmpeg, ['-nostdin', '-v', 'error', '-i', audio, '-vn', '-ac', '1', '-ar', String(RATE), '-t', String(MAX_SECONDS), '-f', 's16le', '-'], inner.signal, DECODE_MS, (b) => fs.pushBytes(b)).finally(() =>
        signal.removeEventListener('abort', stop),
      );
    } else {
      const wav = path.join(dir, 'audio.wav');
      await run(tools.afconvert!, ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', audio, wav], signal, DECODE_MS).catch((e: Error) => {
        throw signal.aborted ? e : new BeatsError(`its audio needs ffmpeg to read (${e.message.slice(0, 80)})`);
      });
      const { offset, length } = wavData(wav);
      for await (const chunk of createReadStream(wav, { start: offset, end: offset + length - 1, highWaterMark: 1 << 20 })) {
        if (signal.aborted) throw new BeatsError('stopped');
        fs.pushBytes(chunk as Buffer);
        if (enough()) break;
      }
    }
    if (fs.seconds() < 20) throw new BeatsError('there was hardly any audio');
    return analyse(fs.finish(), set.url);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
