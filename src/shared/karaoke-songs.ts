import type { SongDef } from './karaoke-music.js';

// The karaoke bar's own songs (flrnoh fork, see FORK.md "Karaoke"): five short new songs about life
// in this office, written for it (words and tunes alike), each two verses and a chorus. Syllables are
// split with `|`; each line of a part shares its melody with the same line of the other verse, so
// the two verses have the same number of syllables line by line (tests/karaoke.test.ts checks).

export const SONGS: readonly SongDef[] = [
  {
    id: 'gruener-build',
    title: 'Grüner Build',
    artist: 'Die Häkchen',
    blurb: 'Power-Ballade für die Nacht vor dem Release',
    style: 'ballad',
    bpm: 76,
    intro: ['C', 'G'],
    outro: ['F', 'C'],
    verse: {
      chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
      barsPerLine: 2,
      melody: [
        'r:.5 E4:.5 E4:.5 D4:.5 E4:1 G4:.5 G4:.5 A4:.5 G4:1 E4:1.5 r:1',
        'r:.5 C4:.5 E4:.5 E4:.5 G4:1 A4:.5 A4:.5 G4:.5 F4:2 r:1.5',
        'r:.5 E4:.5 G4:.5 G4:.5 C5:1 B4:.5 A4:.5 G4:.5 A4:1 G4:1.5 r:1',
        'r:.5 A4:.5 G4:.5 F4:.5 A4:1 G4:.5 F4:.5 E4:.5 D4:2 r:1.5',
      ],
    },
    chorus: {
      chords: ['F', 'G', 'C', 'Am', 'F', 'G', 'C', 'C'],
      barsPerLine: 2,
      melody: [
        'C5:1 B4:.5 C5:1.5 r:.5 G4:.5 C5:1 B4:.5 D5:1.5 r:1',
        'E5:.5 D5:.5 C5:.5 D5:1 C5:.5 A4:1 G4:.5 A4:2 r:1.5',
        'F4:.5 A4:.5 C5:1 C5:.5 D5:.5 E5:1.5 D5:.5 C5:2 r:1',
        'C5:1 B4:.5 C5:1.5 r:.5 G4:.5 A4:.5 B4:.5 C5:3',
      ],
    },
    verses: [
      ['Die gan|ze Nacht hab ich ge|war|tet', 'der Bal|ken kroch so lang|sam vor', 'drei|hun|dert Tests, ich hab ge|be|tet', 'und dann: ein Häk|chen wie im Chor'],
      ['Der Lin|ter schweigt, die Ty|pen stim|men', 'kein ro|tes X mehr weit und breit', 'ich seh die grü|nen Lich|ter glim|men', 'jetzt ist die Pipe|line end|lich frei'],
    ],
    refrain: ['Grü|ner Build, oh grü|ner Build', 'du hast mein Herz mit Licht ge|füllt', 'kein Merge war je so schön wie du', 'Grü|ner Build, jetzt geb ich Ruh'],
  },
  {
    id: 'merge-konflikt-blues',
    title: 'Merge-Konflikt-Blues',
    artist: 'Kai & die Konflikte',
    blurb: 'Zwölf Takte Leid zwischen HEAD und Pfeilchen',
    style: 'blues',
    bpm: 96,
    swing: true,
    intro: ['A7', 'E7'],
    outro: ['D7', 'A7'],
    verse: {
      chords: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'],
      barsPerLine: 4,
      melody: [
        'r:.5 E4:.5 G4:.5 A4:.5 C5:1 A4:.5 G4:.5 A4:1 G4:.5 E4:.5 A4:2 r:8',
        'r:.5 A4:.5 D5:.5 D5:.5 C5:.5 D5:1 C5:.5 A4:.5 C5:1 A4:.5 G4:.5 A4:2 r:7.5',
        'r:.5 B4:.5 B4:.5 E5:1 D5:.5 B4:.5 A4:.5 G4:.5 A4:.5 C5:1 B4:.5 A4:2.5 r:6.5',
      ],
    },
    chorus: {
      chords: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'],
      barsPerLine: 4,
      melody: [
        'r:.5 E5:.5 C5:.5 A4:.5 C5:2 r:.5 A4:.5 E5:.5 C5:.5 A4:.5 G4:1 _A4:1 r:7.5',
        'r:.5 D5:.5 D5:.5 D5:1 r:.5 C5:.5 C5:.5 A4:1 r:.5 A4:.5 G4:.5 A4:.5 C5:.5 A4:2 r:6.5',
        'r:.5 B4:.5 B4:.5 B4:.5 E5:1 D5:.5 B4:1 A4:.5 r:.5 A4:.5 C5:.5 A4:.5 G4:.5 E4:.5 A4:3 r:4.5',
      ],
    },
    verses: [
      ['Ich hab ge|pullt und mein Code ist ka|putt', 'ja, ich hab ge|pullt und mein Code ist ka|putt', 'da steht HEAD und Pfeil|chen und mein Tag ist Schutt'],
      ['Kai hat die|sel|be Zei|le um|ge|baut', 'ja, Kai hat die|sel|be Zei|le um|ge|baut', 'wir bei|de ha|ben recht, kei|ner traut sich laut'],
    ],
    refrain: ['Merge-|Kon|flikt-|Blues, oh Merge-|Kon|flikt-|Blues', 'ac|cept mine, ac|cept theirs, was soll ich bloß tun', 'ich lös das mor|gen frü|he, heut will ich nur noch ruhn'],
  },
  {
    id: 'feierabendbier',
    title: 'Feierabendbier auf dem Dach',
    artist: 'Das Dachterrassen-Duo',
    blurb: 'Schlager zum Schunkeln, Aufzug nach oben',
    style: 'schlager',
    bpm: 116,
    intro: ['G', 'D'],
    outro: ['C', 'G'],
    verse: {
      chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'],
      barsPerLine: 2,
      melody: [
        'r:.5 D4:.5 G4:.5 G4:.5 B4:1 A4:.5 G4:.5 A4:.5 B4:.5 A4:2 r:1',
        'r:.5 E4:.5 G4:1 E4:.5 G4:.5 B4:.5 C5:1 B4:2 r:1.5',
        'r:.5 D4:.5 G4:.5 G4:.5 B4:1 A4:.5 G4:.5 A4:.5 B4:.5 D5:2 r:1',
        'r:.5 E5:.5 D5:.5 C5:.5 B4:1 A4:.5 G4:1 A4:2 r:1.5',
      ],
    },
    chorus: {
      chords: ['C', 'D', 'G', 'Em', 'C', 'D', 'G', 'G'],
      barsPerLine: 2,
      melody: [
        'B4:1 C5:.5 D5:.5 E5:1 D5:1 C5:.5 B4:.5 A4:2 r:1',
        'G4:.5 B4:1 A4:.5 G4:1 E4:.5 G4:1 A4:.5 B4:2 r:1',
        'C5:.5 E5:1 C5:.5 C5:.5 D5:1 C5:.5 B4:.5 A4:.5 D5:2 r:1',
        'B4:1 C5:.5 D5:.5 E5:1 D5:1 B4:.5 A4:.5 G4:2 r:1',
      ],
    },
    verses: [
      ['Die Uhr schlägt fünf, der Lap|top klappt zu', 'der Fahr|stuhl fährt nach o|ben', 'die Kis|te Bier, die Son|ne und du', 'da wird nichts mehr ver|scho|ben'],
      ['Der Hund liegt da, die Bre|zeln sind frisch', 'die Stadt liegt uns zu Fü|ßen', 'das Bun|gee|seil hängt ü|ber dem Tisch', 'und lässt die Mu|t’gen grü|ßen'],
    ],
    refrain: ['Fei|er|a|bend|bier auf dem Dach', 'wir blei|ben heu|te lan|ge wach', 'kein Tick|et, kein Call, kein Dead|line-|Krach', 'Fei|er|a|bend|bier auf dem Dach'],
  },
  {
    id: 'strike',
    title: 'Strike!',
    artist: 'Die Zehn Pins',
    blurb: 'Stadionhymne für die Bahn nebenan',
    style: 'anthem',
    bpm: 128,
    intro: ['D', 'A'],
    outro: ['G', 'D'],
    verse: {
      chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'],
      barsPerLine: 2,
      melody: [
        'r:.5 A4:1 A4:.5 F#4:.5 A4:1 F#4:.5 A4:1 B4:.5 A4:2 r:.5',
        'r:.5 F#4:.5 A4:1 F#4:.5 D4:1 E4:.5 F#4:2 r:2',
        'r:.5 A4:.5 D5:1 C#5:.5 D5:1 B4:.5 A4:.5 B4:.5 A4:2 r:1',
        'r:.5 B4:.5 A4:1 G4:.5 F#4:.5 E4:.5 A4:2.5 r:2',
      ],
    },
    chorus: {
      chords: ['D', 'A', 'Bm', 'G', 'G', 'A', 'D', 'D'],
      barsPerLine: 2,
      melody: [
        'D5:1.5 r:.5 A4:.5 A4:.5 D5:1 C#5:.5 A4:2 r:1.5',
        'D5:1.5 r:.5 B4:.5 D5:1 B4:.5 A4:1 G4:.5 F#4:2 r:.5',
        'G4:.5 B4:1 A4:.5 G4:.5 B4:.5 D5:1 C#5:.5 B4:1 A4:.5 B4:.5 C#5:1 r:.5',
        'D5:1 C#5:.5 D5:1 E5:.5 D5:1 A4:.5 B4:.5 C#5:.5 D5:2 r:.5',
      ],
    },
    verses: [
      ['Sechs Bah|nen, Ne|bel, Schwarz|licht an', 'ich schnür die Leih|schuh fest', 'die Ku|gel glänzt, ich ste|he dran', 'und ge|be ihr den Rest'],
      ['Der An|lauf kurz, der Arm ganz lang', 'die Bahn ist frisch ge|ölt', 'die Pins, sie zit|tern, ih|nen bang', 'ich hab sie schon ge|zählt'],
    ],
    refrain: ['Strike! Al|le zehn sind um', 'Strike! Die Hal|le brüllt her|um', 'das X auf der An|zei|ge leuch|tet für mich', 'heu|te schlägt mich kei|ner, nicht mal ich'],
  },
  {
    id: 'kaffee-tango',
    title: 'Tango der leeren Kaffeemaschine',
    artist: 'Los Bohnos',
    blurb: 'Dramatischer Tango, neun Uhr morgens',
    style: 'tango',
    bpm: 112,
    intro: ['Am', 'E7'],
    outro: ['E7', 'Am'],
    verse: {
      chords: ['Am', 'Am', 'Dm', 'E7', 'Am', 'Am', 'E7', 'Am'],
      barsPerLine: 2,
      melody: [
        'E4:.5 A4:.75 A4:.25 A4:1 r:.5 B4:.5 C5:.75 B4:.25 A4:2 r:1.5',
        'D5:.5 C5:.75 B4:.25 A4:.5 G#4:.5 B4:2.5 r:3',
        'E4:.5 A4:.75 A4:.25 C5:1 r:.5 B4:.5 C5:.75 D5:.25 E5:2 r:1.5',
        'E5:.5 D5:.75 C5:.25 B4:1 r:.5 G#4:.5 A4:2.5 r:2',
      ],
    },
    chorus: {
      chords: ['Dm', 'Am', 'E7', 'Am', 'Dm', 'Am', 'E7', 'Am'],
      barsPerLine: 2,
      melody: [
        'D5:.75 A4:.25 D5:.75 A4:.25 r:.5 C5:.5 B4:.5 A4:.5 C5:2 r:2',
        'B4:.75 G#4:.25 B4:1 r:.5 D5:.5 C5:.5 B4:.5 A4:2.5 r:1.5',
        'A4:.5 D5:.75 D5:.25 D5:.75 C5:.25 B4:.5 A4:.5 C5:.75 B4:.25 A4:.5 G#4:.5 A4:2 r:.5',
        'E5:.5 D5:.5 C5:.75 B4:.25 B4:.75 G#4:.25 A4:3 r:2',
      ],
    },
    verses: [
      ['Um neun Uhr früh, ich schlei|che her', 'die Tas|se in der Hand', 'Ma|schi|ne blinkt, der Tank ist leer', 'ich bin am Rand, am Rand'],
      ['Ich klopf, ich fleh, ich schüt|tel dich', 'du gur|gelst nur ganz leis', 'das Stand|up star|tet oh|ne mich', 'mein Kopf ist leer und weiß'],
    ],
    refrain: ['Kaf|fee, Kaf|fee, wo bist du hin', 'oh|ne dich macht nichts mehr Sinn', 'ich tan|ze Tan|go mit dem Fil|ter in der Hand', 'bis wer neu|e Boh|nen fand'],
  },
];

export const SONG_BY_ID: ReadonlyMap<string, SongDef> = new Map(SONGS.map((s) => [s.id, s]));
