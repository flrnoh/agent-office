# Controls

Back to the [README](../README.md).

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk (hold Shift to run); on the ladder, W and S climb; in a car, W is the gas, S brakes and reverses, A and D steer; in the sea, swim (Shift faster); on a jetski or the motorboat, steer |
| Space | Jump (you can land on desks, couches and the cars in the garage); in a car, brake; swimming, splash; on a jetski or the motorboat, slow down |
| Mouse drag / wheel | Orbit / zoom the camera |
| E | Interact: hire a worker, open its terminal, read a board, take an issue's note off the board, prompt a board agent, call a meeting in the meeting room, draw on the whiteboard, read the docs at the bookshelf, watch the TV (or put a YouTube or Twitch stream on it), sit down (or get up), ride the elevator, climb the ladder (or get off it), slide down a fire pole, grab a coffee, take a smoke break, tee off at the golf tee, pet the dog, pick up the basketball (then hold E and let go to shoot), order a drink at the rooftop bar, open the DJ booth (put on a set from YouTube, SoundCloud or Mixcloud), step up to the dart board or the axe lane on the roof (then hold Space and let go to throw), play pool, kicker, air hockey or table tennis at a table on the roof (or watch, when both sides are taken), jump off the bungee jetty on the roof, step onto a padel court in the padel hall (pick a place, or watch), join a team at the halfway boards in the soccer hall (or leave the pitch), get into one of the cars in the garage (behind the wheel, or beside whoever's driving) or out of it, knock through the north wall past the gong for 2 more desks (at the **🚧 Room to grow** sign). In the [castle](maps.md#the-castle): sit on the throne, where E is for whoever's first in line (or the Hand of the King, with nobody waiting), and speak to the Hand to send out a new worker |
| K | On the castle's throne: speak to the Hand of the King, to send out a new worker |
| P | Prompt: give a task to a new worker, or to the one at this desk |
| C | Changes: the files the worker at this desk changed and their diff; commit, discard or open a PR |
| B | Open a shared shell at an empty desk |
| R | Resume a sleeping worker (or restart a shell) |
| X | Send a worker home (frees the desk; a worker with its own worktree asks what to do with it). In the [castle](maps.md#the-castle), the Kingsguard takes it down to the dungeon |
| L | Hang a big sign over the desk you face (*Operations*, *Code cleanup*), in one of seven colors; again to change it or take it down |
| O | Open a pull request for a worker on its own branch, or see the one it has (a worker across several projects gets one in each) |
| N | Go to the worker that has waited longest on someone; again for the next one |
| F | Hang a picture from the web on a wall (scroll to size it, click to hang it); falling on the bungee rope, a salto |
| Q | Put back the issue card you're carrying, or drop the basketball; on the pitch in the soccer hall, a slide tackle (so does **Ctrl**) |
| H | These controls; in a car, honk the horn; on a jetski or the motorboat, its horn; at the DJ booth on the roof, blow the air horn |
| T / Enter | Chat |
| G / 1–6 | Emote: hold G for the wheel (point and let go) or press 1–6 to wave, give a thumbs up, clap, dance, point or facepalm; everyone on your floor sees it |
| / | Search the chat and every terminal on your floor |
| Ctrl + K (⌘K on a Mac) | Command palette: find a worker, issue, PR, service, board, teammate or action; Enter opens it, Shift+Enter walks you there first |
| V | Join voice; in voice, hold to talk (you're muted when you let go) |
| M | Mute / unmute in voice |
| Tab | The ☰ menu: every window, and what shows on screen (in the soccer hall: the match's stats and the Hall of Fame instead; **Tab**, **✕** or **Esc** closes them) |
| Esc | Close any window (a terminal too) and get back to looking around |
| Ctrl + [ | Send Esc to a terminal instead, to close a menu like Claude's `/skills` or interrupt Claude. **⎋ Esc** in the terminal's header does the same |

On a padel court in the padel hall: your player runs for the ball by itself; **W A S D** / arrows steer yourself while held; the **mouse** aims (the ring on the court); **click** or **Space** swings (on time, as the ball comes past, is hard and true); hold **Shift** for a lob; a high ball near the net is smashed. Serving, click or **Space** drops the ball and hits it into the service box across (the ring shows where). **✕** or **Esc** steps off the court.

On the pitch in the soccer hall (after **E** at the boards on the halfway line): **W A S D** runs (**Shift** sprints), and running onto the ball takes it: it stays just ahead of your feet as you run (further ahead at a sprint, easier to lose), and stopping traps it at your feet. **Click** (a tap of the **left mouse button**, or **Space**) passes along the ground to the teammate nearest the line you look along (led if they're running; with nobody there, it rolls about 8 m the way you look). **Hold** it to charge a shot (full after about a second: the meter under the crosshair, and a line on the floor from the ball shows where it goes) and let go to shoot where you look, rising the higher you look (first person). The **right mouse button** (or **C**) does the same in the air: a tap lobs to a teammate over whoever's in between, a hold chips a shot. A kick pressed a moment before the ball's in reach waits for it. Running into someone who has the ball tackles them; **Q** (or **Ctrl**) slides in feet first the way you face: reach the ball first and you win it, the man's legs first and it's a foul (a free kick, in your own penalty area a penalty; a second foul in a match is a yellow card, a third a red one). Space doesn't jump on the pitch, and Q doesn't put back or drop anything there. **E** at the halfway boards again leaves the pitch.

In the cinema behind the office: **E** at the counter for popcorn, nachos or a cola; **E** at a seat sits you down (walk off to get up); **E** at Saal 1's screen shows the programme; **E** at the lectern in Saal 2 puts on your own film for everyone in there, and **E** at its screen watches it full screen.

At Sunset Beach, on the scenic loop west of town: **E** at the kiosk's counter for the menu; walk into the sea (or jump off the jetty) to swim, and **E** at the ladder at the jetty's end climbs out; **E** at a jetski or the motorboat gets on, **E** aboard gets off (onto the jetty when you're alongside it, else into the water).

In the soccer hall, after a goal everyone sees an instant replay of it (the last seconds from a TV camera, the end in slow motion): **Space** or **Esc** skips it.

You can also click a nearby desk to interact with it, or click a worker in the Workers panel (**🤖 Workers**, top right) to open its terminal.

On a phone, use the 2D view at `/lite` instead: a terminal there has a row of keys under it (**1** **2** **3**, the arrows, Enter, Tab, Esc, Ctrl+C) and a box to send a prompt. See [Features](features.md).

## In a terminal

The prompt edits the way it does in your own terminal (iTerm2's *Natural Text Editing*, or VS Code's), in Claude Code, Codex, OpenCode and a shell alike:

| Key | Action |
| --- | --- |
| Shift + Enter | A new line in an agent's prompt, without sending it (in a shell it runs the line, like Enter) |
| Ctrl + ⌫ / ⌥ + ⌫ | Delete the word before the cursor |
| ⌘ + ⌫ | Delete to the start of the line (Mac) |
| ⌘ + ⌦ | Delete to the end of the line (Mac) |
| ⌘ + ← / → | Jump to the start / end of the line (Mac) |
