// Radio stations built into the jukebox, like the presets of a DAB radio (flrnoh fork, see FORK.md).
// Every address was checked to answer with audio (HTTP 200, audio/mpeg) when it was added; stations
// move their streams now and then, so check again with curl when one goes quiet.

export interface RadioStation {
  id: string;
  name: string;
  /** A few words on its card in the list. */
  genre: string;
  /** Stands in for a logo on the card. */
  emoji: string;
  url: string;
}

export const RADIO_STATIONS: readonly RadioStation[] = [
  { id: 'bob', name: 'Radio BOB!', genre: 'Rock, national', emoji: '🤘', url: 'https://streams.radiobob.de/bob-national/mp3-192/streams.radiobob.de/' },
  { id: 'bayern3', name: 'BAYERN 3', genre: 'Pop & news, Bayern', emoji: '🦁', url: 'https://dispatcher.rndfnk.com/br/br3/live/mp3/mid' },
  { id: 'antenne-bayern', name: 'Antenne Bayern', genre: 'Hits, Bayern', emoji: '📡', url: 'https://stream.antenne.de/antenne/stream/mp3' },
  { id: 'bayern1', name: 'Bayern 1', genre: 'Oldies & Heimat', emoji: '🥨', url: 'https://dispatcher.rndfnk.com/br/br1/obb/mp3/mid' },
  { id: 'fluxfm', name: 'FluxFM', genre: 'Indie & alternative, Berlin', emoji: '🎸', url: 'https://streams.fluxfm.de/live/mp3-320/audio/' },
  { id: 'radioeins', name: 'radioeins', genre: 'Grown-up pop, rbb', emoji: '1️⃣', url: 'https://dispatcher.rndfnk.com/rbb/radioeins/live/mp3/mid' },
  { id: 'dlf', name: 'Deutschlandfunk', genre: 'News & talk', emoji: '📰', url: 'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3' },
  { id: 'dlf-nova', name: 'Deutschlandfunk Nova', genre: 'Young talk & music', emoji: '🌀', url: 'https://st03.sslstream.dlf.de/dlf/03/128/mp3/stream.mp3' },
  { id: '1live', name: '1LIVE', genre: 'Pop & charts, WDR', emoji: '⚡', url: 'https://wdr-1live-live.icecastssl.wdr.de/wdr/1live/live/mp3/128/stream.mp3' },
  { id: 'swr3', name: 'SWR3', genre: 'Pop & comedy', emoji: '🎧', url: 'https://liveradio.swr.de/sw282p3/swr3/play.mp3' },
  { id: 'egofm', name: 'egoFM', genre: 'Indie & electronic, München', emoji: '🪐', url: 'https://streams.egofm.de/egoFM-hq' },
  { id: 'jazzradio', name: 'Jazz Radio', genre: 'Jazz, Lyon', emoji: '🎷', url: 'https://jazzradio.ice.infomaniak.ch/jazzradio-high.mp3' },
  { id: 'chillhop', name: 'I Love Chillhop', genre: 'Lo-fi & chill beats', emoji: '☕', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
  { id: 'br-klassik', name: 'BR-KLASSIK', genre: 'Classical', emoji: '🎻', url: 'https://dispatcher.rndfnk.com/br/brklassik/live/mp3/mid' },
];

export const stationById = (id: unknown): RadioStation | undefined => (typeof id === 'string' ? RADIO_STATIONS.find((s) => s.id === id) : undefined);

/** The built-in station a pasted link is, if it's one of theirs. */
export const stationByUrl = (url: string | undefined): RadioStation | undefined => (url ? RADIO_STATIONS.find((s) => s.url === url) : undefined);

/**
 * Where the browser should load the jukebox's stream from, and where else to try when that fails.
 * A page served over https can't load an http:// stream (mixed content), so that goes through the
 * office's /api/radio; an https stream plays straight from the station, with the office as fallback.
 */
export function radioSources(s: { url?: string; station?: string }, floor: string | null, pageHttps: boolean): { src: string; fallback?: string } | null {
  if (!s.url) return null;
  const station = stationById(s.station);
  const proxy = station && station.url === s.url ? `/api/radio?station=${encodeURIComponent(station.id)}` : floor ? `/api/radio?floor=${encodeURIComponent(floor)}&u=${encodeURIComponent(s.url)}` : undefined;
  if (s.url.startsWith('http:') && (pageHttps || !proxy)) return proxy ? { src: proxy } : { src: s.url };
  return proxy ? { src: s.url, fallback: proxy } : { src: s.url };
}
