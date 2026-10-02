// The rows of the controls help (openHelp in hud.ts), in the order it shows them: a key or an emoji, and
// what it does. A new control is a new row here.

import { IS_MAC } from './termkeys';

export const HELP_ROWS: readonly (readonly [string, string])[] = [
  ['W A S D', 'Walk (hold Shift to run)'],
  ['Space', 'Jump'],
  ['☕', 'Press E at the coffee machine in the kitchen for a minute of quicker walking and higher jumps. Three cups in a row gives you the jitters'],
  ['🧊', 'Press E at the fridge next to it for a cold bottle, a can or a snack: Helles, Radler, Spezi, Mate, a Brezn, a Leberkässemmel… It comes along wherever you go'],
  ['🎾', 'Across the street to the east, the padel hall: E at its glass doors goes in, E at the doors inside back out. Up the stairs on the gallery, E at the café counter for a coffee, an Apfelschorle or a slice of Käsekuchen. The coffees give you the kitchen machine’s buzz'], // fork
  ['⚽', 'Across the street, between the golf hole and the padel hall, the soccer hall: E at its doors goes in. E at the boards on the halfway line puts you in a team (a bib and a ring in its colour); run onto the ball to take it and dribble. Click (or Space) passes to the teammate you look at, hold to charge a shot where you look (look up to lift it), the right button (or C) lobs or chips; Shift sprints; Q (or Ctrl) slide-tackles: the ball first wins it, the legs first is a foul. E at the boards again leaves the pitch'], // fork
  ['Mouse', 'Look around in first person (click to capture the mouse, Esc to free it)'],
  ['Click / E', "Use what you look at: hire a worker, open its terminal, read a board, call a meeting in the meeting room, watch the TV or put a YouTube or Twitch stream on it, put a song on the jukebox, tee off from the balcony, sit on a couch, a beanbag, a chair or the balcony bench (walk off to get up)"],
  ['👥', 'Click someone under "In the office" to walk over to them (on another floor, you ride the elevator first). The line under their name says what they have open or where they are'],
  ['🛗', 'Every project is a floor: step into the elevator on the north wall and press E (or click the project name, top left) to go to another one or add a project. It goes down to the garage too, and back up from there'],
  ['🤖', 'An agent stands by the issues board, the PR board and the task queue. Press E at one and type what you want: it runs as an agent that knows that board. O there opens its terminal, X sends it home'],
  ['📝', 'The whiteboard on wheels between the desks and the lounge: press E to draw on it with everyone on your floor, live. What you draw stays up on the board'],
  ['🏁', 'The racing rig next to the arcade plays OFFICE GP: ↑ gas, ↓ brake, ← → steer, Space boost, R restart (a gamepad or wheel works too). Three laps, the fastest races and laps go on the building’s tables, and E there watches whoever is racing'],
  ['🕹️', 'The arcade cabinet in the lounge plays BLOCKFALL: arrows (or WASD) move and turn, Space drops, C holds, P pauses. Everyone on the floor sees your game on it, and E there watches whoever is playing. One of your workers needing input pauses it'],
  ['🎉', 'Whenever a pull request merges, the gong next to the PR board rings, confetti rains down all over the floor and every worker gets up on its desk for a quick dance. Walk up to the gong and press E to bang it yourself'],
  ['N', "Next worker that needs you: go to whoever has waited longest (needs input, or done and nobody's looked), and again for the next one. Arrows at the edge of the screen point to the ones out of sight"],
  ['🏀', 'The hoop on the west wall, by the exit door: E at the ball picks it up. Hold E (or the mouse, in first person) and let go when the meter is in the green to sink it. In first person it goes where you look. Q drops it. Everyone on your floor sees your shot'],
  ['🏎️', "The Lambos and Ferraris in the garage: E at one gets you behind the wheel, or beside whoever's driving it. W is the gas, S brakes and reverses, A and D steer, Space brakes, H honks and E gets you out. Everyone on your floor sees you drive by"],
  ['🚐', "Flogge's Bulli, backed into the garage's east corner: only its keyholders take the wheel, but anyone can ride along beside them. It's slow and soft, and its horn goes möp möp"],
  // flrnoh fork: a day at the beach (features/beach).
  ['🍟', 'Down the scenic loop west of town, Sunset Beach: the Kiosk zur Möwe by the road is open. E at its counter and Uschi hands over Pommes rot-weiß, a Currywurst, a Fischbrötchen, ice cream, a coconut… all free. Ice cream gives you brain freeze, and mind the seagulls'],
  ['🏊', 'Walk into the sea off the beach (or jump off the end of the jetty, or its diving board) and you swim: W A S D, Shift faster, Space splashes. Stay inside the buoys. E at the ladder at the jetty’s end climbs out, or swim in until you can stand'],
  ['🚤', 'The jetskis and the motorboat at the jetty: E at one takes the helm (or a free seat). W A S D steer on the open water, Space slows down, H sounds the horn, E gets off onto the jetty when you’re alongside it, else into the water for a swim'],
  // flrnoh fork: the city's shops (features/shops).
  ['🏪', 'The shops on the ground floors round about are open: walk in through any door. A Bäckerei, a café, a pizzeria, an Apotheke, a florist, a bookshop, a kiosk, a bar, a Späti, a Döner, a toy shop, a record shop, a barber and a tattoo studio, all over town. E at the counter: what you order is in your hand (everyone sees it) and comes along. The bar’s drinks go to your head, the Apotheke’s headache pill clears it, the café’s coffees give you the buzz'],
  ['💈', 'At the barber (Friseur) E at a chair: sit down and pick a new hair style, hair colour and beard. At the tattoo studio: a tattoo (motif and where), a piercing (silver or gold), or the laser to take one off. Everyone sees your new look'],
  ['🧸', 'A toy from the toy shop in your hand: click (or E with nothing else to use) to play: the yo-yo, soap bubbles, the squeaky duck, a paper plane that glides off, a water pistol (a splash, nothing more), the teddy for a hug. A book or the paper: E to read it'],
  ['💿', 'In the record shop, E at a crate digs through the records (take one along), E at the listening station puts the headphones on: only you hear it, ✕, Esc or E takes them off'],
  ['🍸', 'The elevator goes up to the rooftop bar: a DJ playing drum and bass under the lights, and the city all around. Press E at the bar for a drink (it goes to your head for a bit) and at the DJ booth to put on a DJ set from YouTube, SoundCloud or Mixcloud for everyone up there (H there blows the air horn)'],
  ['🎯', 'Up on the roof, in the corner past the DJ: a dart board and an axe-throwing lane. E at either steps up to the line. The mouse (or the arrow keys) aims, and your hand wanders more after a few drinks. Hold Space (or the mouse button) and let go in the green: three darts a visit, five axes a round, chalked up for everyone up there. E steps back'],
  ['Drag / wheel', 'Orbit and zoom the camera in third person'],
  ['P', 'Prompt: give a task to a new or existing worker at the desk you face'],
  ['C', 'Changes: what the worker at the desk you face changed — files and diff, commit, discard, open a PR'],
  ['B', 'Open a shared shell (dev servers, git, tests) at an empty desk'],
  ['R', 'Resume a sleeping worker'],
  ['X', 'Send a worker home (frees the desk)'],
  ['L', 'Hang a big sign over the desk you face ("Operations", "Code cleanup"), or change or take down the one there'],
  ['🚧', 'Room to grow: E at the sign on the north wall past the gong knocks through into a back office with 2 more desks, and again for 2 more. The same sign walls a row back up'],
  ['F', 'Hang a picture from the web on a wall. Look at a picture and press E to move, edit or take it down'],
  ['Q', 'Put back the issue card in your hands (E at a note on the issues board, or ✋ Pick it up in an issue; then E at an empty desk, a worker or the queue board), or drop the basketball'],
  ['🐶', 'Walk up to the office dog and press E to pet it. When a worker needs input, it runs to that desk and barks. Name it in ⚙️ Settings'],
  ['O', 'Open a pull request for a worker on its own branch, or see the one it has'],
  ['T', 'Chat'],
  ['G / 1–6', 'Emote: hold G, point at one and let go (or tap G and click one), or press 1–6: wave, thumbs up, clap, dance, point, facepalm. Everyone on your floor sees it'],
  ['/', 'Search the chat and every terminal on your floor, back to before the office last restarted'],
  [IS_MAC ? '⌘K' : 'Ctrl+K', 'Command palette: type a few letters to find a worker, issue, PR, service, board, teammate or action. Enter opens it, Shift+Enter walks you over to it first'],
  ['V', 'Join voice. In voice, hold V to talk (push to talk): you’re muted once you let go. Leave voice from the ☰ menu'],
  ['M', 'Mute or unmute your mic in voice. ⚙️ Settings can have you join muted, for push to talk'],
  ['Tab', 'The ☰ menu, top right: every window, and what shows on screen. Pin what you use most to the top bar'],
  ['Esc', 'Close any window and get back to looking around'],
  ['Ctrl + [', 'Send Esc to a terminal instead, to close a menu like Claude’s /skills or interrupt Claude. ⎋ Esc in the terminal’s header does the same'],
  ['⚙️', 'Settings (in the ☰ menu): switch between first and third person'],
];
