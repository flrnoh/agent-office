# flrnoh/agent-office: Florian's own office

This repository is a fork of [AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office) (webdevcody's). It is Florian's own version: changed to his liking, and still taking in what the upstream community builds. Where this file and `CLAUDE.md` disagree, this file wins.

## How the two stay together

- **`main` here is Florian's office.** It runs on his Mac as the launch agent `com.flrnoh.agent-office`, public at https://buero.florian-obermeier.com (Cloudflare tunnel).
- **Own changes** go in as a branch and a pull request into this fork's `main`, as usual. Squash-merging those is fine. Here the pull requests to merge are Florian's and his workers' (the "only webdevcody's" rule in `CLAUDE.md` is upstream's).
- **Upstream's changes** come in through a sync pull request (branch `sync/upstream-<sha>`). The `Upstream sync` workflow (`.github/workflows/upstream-sync.yml`) offers one every Monday, or on demand from the Actions tab:
  - ✅ merges cleanly, builds, tests pass: ready to merge.
  - ⚠️ merges cleanly, but the build or tests fail: usually something new to sort for guests (below).
  - Conflicts: an issue lists the files, to resolve by hand, keeping both sides.
- **Merge sync pull requests with "Create a merge commit", never squash or rebase.** Only a merge commit tells git that upstream's commits are in; after a squash the next sync brings all of them again, conflicting everywhere. (This overrides the squash rule in `CLAUDE.md` for sync pull requests.)
- **After merging anything**, bring the Mac's office up to date and restart it:
  ```bash
  ~/cloude_code/agent-office/bin/update-office.sh
  ```
- **Never push to or open pull requests on upstream.** The `upstream` remote's push URL is disabled on purpose; nothing from this fork goes back.
- **No other ties to upstream.** The only link is reading its public repository for the sync. Upstream's `Release` workflow is switched off in this repository's Actions settings (it would publish releases here on every merge); its file stays, so syncs don't conflict over it. The office itself doesn't call upstream at runtime: the built-in updater is off (no `AGENT_OFFICE_SELF_UPDATE`) and would only follow this fork, and the image proxy names this fork in its user agent. Upstream's install scripts and hosting docs (`install.sh`, `deploy/`, `docs/*`) still point at upstream: they're not used here, and are left alone so syncs stay conflict-free.

## Keeping conflicts rare

- Put new things in **files of their own** (like `src/server/guests.ts`) and touch upstream's files only for the few lines that hook them in.
- Keep those hook lines short and recognisable, so a conflict shows at a glance what to keep.
- List every change of this fork below, with the upstream files it touches.

## This fork's changes

### Guest role (#1, #2)

Friends who come over to hang out: they walk around, chat, talk, play (arcade, golf, darts, basketball, cars, jukebox, whiteboard) and watch the workers' terminals, but can't type in them, hire, send home, touch GitHub, the queue, meetings, settings or accounts, or reach the workers' dev servers. The server enforces it, whatever a guest's browser sends.

- `src/server/guests.ts`: the rules. Every message a page can send is sorted into `GUEST`, `QUIET` or `TEAM_ONLY`. **A message type upstream adds is in none of them, and the server doesn't compile until someone sorts it** (the error names it). Play or looking → `GUEST`; anything that acts on the machine, a worker, GitHub or the office's settings → `TEAM_ONLY`.
- `tests/guests.test.ts`: fails when upstream adds an `/api` route nobody has looked at. New routes are refused to guests anyway; look whether a guest's page needs one to draw the office.
- Hooks in upstream files:
  - `src/shared/protocol.ts`: `AccountRole` has `'guest'`, `accountRole()`, `Me.guest`.
  - `src/server/server.ts`: `guest`/`lastGuestNoteAt` on `Client`; the guest check at the top of `handleMessage`; `guestMayFetch` in the HTTP handler; `meOf`, `accountsChanged` and the heartbeat pass role changes on; `accounts.invite`/`accounts.role` take any role.
  - `src/server/auth.ts`: `fromAnyCookie(req, { noGuests })` keeps guests out of workers' service tunnels.
  - `src/server/accounts.ts`: `--guest` for `accounts invite` and `accounts role`.
  - `src/client/ui/terminal.ts`: `watchOnly`: no keys, keypad, say box, Esc, models, changes or file drops for guests.
  - `src/client/main.ts`: guests at desks and boards (`GUEST_ONLY_WATCH`, `deskHint`, `hintFor`), no sign-ins window.
  - `src/client/ui/accounts.ts`, `src/client/join.ts`, `src/client/ui/signins.ts`, `src/client/style.css`: picking and showing the role.

### In-progress issues leave the wall board

Issues someone is on (assigned, labelled in progress, or a queued task running for it) disappear from the cork board on the wall, so nobody hands the same issue out twice. The detailed board still lists them under 🚧 In progress.

- `src/client/inprogress.ts`: the rule, shared by both boards; `tests/inprogress.test.ts`.
- Hooks in upstream files: `src/client/world/boards.ts` (the wall board's filter), `src/client/ui/boards.ts` (the 🚧 column uses the same rule), `src/client/main.ts` (redraw the wall when a queued task starts or stops on an issue).

### Fog stays outside

In fog the office itself stays clear: the haze only counts the part of the way from your eye to what you see that runs outdoors, not the stretch through the office on your floor (walls included) or its built-out back office. Inside, the room is clear and the street through the windows foggy; from the balcony, the room through the glass only gets the few meters of fog in front of it. The garage, balcony, fire escape and street stay foggy; the roof and other maps are unchanged.

- `src/client/world/fogbox.ts`: the rooms' boxes, the ray/box math (TypeScript and the same in GLSL), its uniforms and `setFogRooms`; `tests/fogbox.test.ts`.
- Hooks in upstream files:
  - `src/client/world/sky.ts`: the haze's varying is the whole world position (`vSkyFogAt`, was `vSkyFogY`), `FOGBOX_PARS` and `fogBoxUniforms` go into every fogged shader, and `HAZE` scales `vFogDepth` by `skyFogOutdoors(...)`.
  - `src/client/main.ts`: `setFogRooms(...)` each frame before `sky.update`.

### Floors in any order

Admins put the floors in whatever order they like: in the elevator, drag a floor by its ⠿ grip to another place, or move it a floor up or down with ↑ and ↓ (the keyboard's way). The numbers change at once, the order is saved in floors.json, and everyone's building restacks, with a toast saying who did it. The roof, the garage and floors still being cloned stay where they are; guests and other teammates see no grip.

- `src/shared/floor-order.ts`: the rule (`reorderById`, `reorderMap`, `moveId`), shared by the server and the page; `tests/floor-order.test.ts`.
- `src/client/ui/floor-order.ts`, `src/client/ui/floor-order.css`: the grip, ↑ ↓, drag and drop and the drop line.
- Hooks in upstream files:
  - `src/shared/protocol.ts`: the `floor.order` message.
  - `src/server/building.ts`: `Building.reorder()`.
  - `src/server/server.ts`: the `floor.order` case (admins only; reorders floors.json and the open floors, then `floorsChanged`).
  - `src/server/guests.ts`: `floor.order` is `TEAM_ONLY`.
  - `src/client/ui/elevator.ts`: `floorOrder(...)`, `order.row(...)` round the admin's floor row, and no re-render mid-drag.
  - `src/client/main.ts`: `syncStack` moves you with the street when your floor changes place while you're down there (`streetFloor`).
  - `docs/features.md`: one sentence on the elevator.

### A working fridge

The fridge in the kitchen, next to the coffee machine: **E** opens its door on drinks (Helles, Radler, cola, Spezi, Zitronenlimo, Sprudel, mate, an energy drink) and snacks (Brezn, crisps, a chocolate bar, an apple, a Leberkässemmel). What you grab is held like a drink from the rooftop bar, so everyone sees it, but it comes along to every floor. The beers go through the bar's booze (Radler lighter, and not past its limit), the caffeinated ones top up the coffee's buzz a little, snacks go in a few bites, and a Brezn, a Leberkässemmel or a Sprudel soaks some of it up. The door, the crown cap, the can and the bites have their sounds.

- Own files: `src/shared/fridge.ts` (the items), `src/server/held.ts` (what the server lets you hold where), `src/client/ui/fridge.ts` (the open fridge), `src/client/world/fridgeitems.ts` (the bottles, cans and snacks in your hand); `tests/fridge.test.ts`.
- Hooks in upstream files:
  - `src/shared/rooftop.ts`: `Glass` and `DrinkId` take the fridge's, and `DRINK_BY_ID` has them too.
  - `src/server/server.ts`: `act`'s drink goes through `heldDrink`; leaving a floor keeps a fridge item (`keepsHeld`).
  - `src/client/world/kitchen.ts`: the fridge's interactable (`Kitchen.fridge`); `src/client/world/office.ts`: `InteractKind` has `'fridge'`, and it's pushed with the coffee machine.
  - `src/client/world/character.ts`: `drinkGlass` hands the fridge's things to `fridgeItem`.
  - `src/client/booze.ts`: a snack is held for less long; `putDown` keeps a fridge item. `src/client/caffeine.ts`: `top()`.
  - `src/client/sound.ts`: `fridgeDoor`, `opener` and `hiss`, in a section of their own.
  - `src/client/main.ts`: E at the fridge (`showFridge`, `grabFromFridge`), its hint, its `REACH`, bites in `drinking`.
  - `src/client/ui/hud.ts` (a help line), `docs/features.md`.

### Working at the boss desk

At the boss's PC up in the loft you can work, not only play: sitting in the boss's chair, **E** offers a Claude worker, a shell or Minesweeper. The boss desk (`BOSS_DESK`, id `boss`, flag `boss`) is a real place for a worker, but only hired at by hand: it isn't in `SEATS`, so `nextFreeSeat`, the queue, bean bag counts and the castle's seats never see it, and workers hiring workers (`/office/workers`) can't pick it. Nobody is drawn sitting there (the chair is yours): the desk has no `DeskView`, so `syncWorkers` skips its worker, and its terminal plays on the boss's monitor, with Minesweeper back on it once it's gone home. Guests only play (or watch a terminal that's up there). Office map only: the server refuses it on other maps.

- `src/client/ui/bossdesk.ts`: the chooser, the hint's words, and the monitor showing the boss desk's terminal. `tests/bossdesk.test.ts`.
- Hooks in upstream files:
  - `src/shared/layout.ts`: `DeskDef.boss`/`DeskDef.y`, `BOSS_DESK` (after `LOFT`), and in `DESK_BY_ID`.
  - `src/shared/maps/index.ts`: `BOSS_DESK` in the office plan's `byId`.
  - `src/server/server.ts`: `worker.spawn` refuses the boss desk off the office map.
  - `src/server/office-workers.ts`: `readHireRequest` refuses `desk: 'boss'`.
  - `src/server/dog.ts`: the dog doesn't bark at or nap by the boss desk (it doesn't do stairs).
  - `src/client/main.ts`: `bossDesk` next to `arcade` (made, stopped, updated), `useSeat` opens it, the seat hint, and `standAt`/`burstOver` go up to the loft (`desk.y`).
  - `tests/maps.test.ts`: the built-in maps have every office seat but the boss desk.
  - `docs/features.md`: the boss desk line.

### Radio stations on the jukebox

The jukebox is also a DAB-style radio: a list of stations (Radio BOB!, BAYERN 3, Antenne Bayern, Bayern 1, FluxFM, radioeins, Deutschlandfunk, DLF Nova, 1LIVE, SWR3, egoFM, Jazz Radio, I Love Chillhop, BR-KLASSIK) to click, for everyone on the floor, and the toast names the station. The box for your own stream stays; a `.pls`/`.m3u` link plays the first stream it lists.

An `http://` stream can't play on the https office (mixed content), so it goes through `/api/radio`, which passes the audio on as it comes. That is no open proxy: it streams only a built-in station (`?station=`) or the stream on that floor's jukebox right now (`?floor=&u=`), never an address on this machine or its network (checked after DNS, on every connection and redirect), at most 24 at once, and drops the station when the listener goes. https streams play straight from the station, with the office as fallback. When the browser won't start the radio before a click, a toast says to click.

- `src/shared/radio.ts`: the stations (each checked with curl for HTTP 200 and `audio/mpeg`) and where the page loads a stream from (`radioSources`).
- `src/server/radio.ts`: the proxy, what it may fetch (`radioTarget`), the address check, playlists; `tests/radio.test.ts`.
- Hooks in upstream files:
  - `src/shared/jukebox.ts`: `JukeboxState.station`; `trackTitle` names the station.
  - `src/shared/protocol.ts`: `station` on `jukebox.play`.
  - `src/server/jukebox.ts`: `play({ station })`, the station saved and loaded.
  - `src/server/server.ts`: the `/api/radio` route; `jukebox.play` passes `station` and resolves playlists.
  - `src/server/guests.ts`: guests may fetch `/api/radio` for a station or a floor's stream (`tests/guests.test.ts` lists the route).
  - `src/client/ui/jukebox.ts`: the station list. `src/client/style.css`: `.jb-radio`.
  - `src/client/main.ts`: `radioSources` in `playJukebox`, the click-to-hear toast. `src/client/sound.ts`: `fallback` and `onMusicBlocked`.
  - `docs/features.md`: the jukebox line.

### DJ sets on the roof

Anyone on the roof, guests too, can paste a YouTube, SoundCloud or Mixcloud link at the DJ booth (**E** there opens its window; **H** there is now the air horn). It plays for everyone up there, from the same moment, in place of the synthesized house DJ, until someone sends the house DJ back. The office keeps what's on in `dj.json` in its data folder; each browser plays it in the site's own embedded player, off the page, turned up or down for how far it stands from the booth. A browser that can't play it (embedding turned off, blocked) falls back to the house DJ by itself.

- `src/shared/djset.ts`: reading a pasted link (only those three sites, by exact host), `tests/djset.test.ts`.
- `src/server/djset.ts`: the booth (`DjBooth`: what's on, saved; its title from the site's oEmbed) and `djMessage` (dj.play/dj.stop: only from the roof, not too often).
- `src/client/djset.ts`: the embedded players and keeping them in step; `src/client/ui/djbooth.ts`: the booth's window.
- Hooks in upstream files:
  - `src/shared/protocol.ts`: `dj.play`/`dj.stop` (ClientMsg), `dj` (ServerMsg), `FloorView.dj`.
  - `src/server/server.ts`: `djBooth`, `roofView` carries `dj`, the `dj.play`/`dj.stop` case.
  - `src/server/guests.ts`: `dj.play`, `dj.stop` in `GUEST`.
  - `src/client/sound.ts`: `djSetVolume()`.
  - `src/client/main.ts`: `djSets`/`houseDj()` (by `sound.onMusicError`), the `dj` message and `msg.dj` on arrival, `setPlace` (`djSets.setUp`, `houseDj()`), E at the booth opens `showDjBooth()`, H at the booth in `officeKey`, the booth's hint.
  - `src/client/ui/hud.ts`, `docs/features.md`, `docs/controls.md`, `docs/how-it-works.md`: words.

### Streams on the office TV

The lounge TV plays streams by itself too: **E** at the TV opens its window, where anyone on the floor, guests too, pastes a YouTube link (a video, a live one, shorts, with its `t=`) or a Twitch one (a channel, live; a past broadcast, from its `t=`). Everyone on that floor sees it on the TV, from the same moment (a video is put back in step when it drifts more than 3 s; a live channel just plays live), louder the closer they stand (music and master volume, silent from 30 m or off the floor). **Watch full screen** opens it big, with the player's own controls (pausing it there is yours; closing puts it back in step). **Stop stream** turns it off. Screen sharing is as it was, and goes first: while someone shares, the TV shows their screen and the stream waits, carrying on from where everyone is once they stop. The window also offers **Watch <name>'s screen** and **Share your screen**. Each floor keeps what's on in `.agent-office/tv.json`; the toast says "📺 <who> put on <title>".

How it gets onto the TV: a browser can't draw another site's player into WebGL, so the player is a real iframe laid over the page and bent each frame with a CSS `matrix3d` onto where the TV's screen is (the projective transform of its four corners, `client/tvquad.ts`). It shows while you're in the room in front of the TV, within 26 m, with the screen in view and no wall or other box between (a line against the floor's colliders, a few times a second); `pointer-events: none`, so it never steals mouse-look. Otherwise the TV shows a card with the title and how it's going ("click anywhere to start it", "can't play here: …", "it has ended"). People walking in front of the TV don't hide it (it's on top of the scene). Twitch's player gets `parent=<this page's host>`; YouTube's the `strict-origin-when-cross-origin` referrer. Both start muted and are turned up to your volume.

- `src/shared/embeds.ts`: what the DJ's and the TV's links share (plain web link check, `t=`, YouTube's one video). `src/shared/tv.ts`: reading a TV link (only YouTube and Twitch, by exact host; clips refused), `tests/tv.test.ts`.
- `src/server/embeds.ts`: `LinkPlayer` (what's on, saved, its title from oEmbed, not too often per person), shared with the DJ booth. `src/server/tv.ts`: `OfficeTv` (tv.json) and `tvMessage` (tv.play/tv.stop: on a floor of the office map, rate limited, told to the floor).
- `src/client/embeds.ts`: `EmbedPlayer` (keeping a site's player in step on the office clock, its volume, blocked/failed/ended/held) and YouTube's player, shared with the DJ sets. `src/client/tv.ts`: `TvStreams` (Twitch's player, laying the iframe over the TV or the big player, the TV's card), `src/client/tvquad.ts` (the matrix and the line of sight), `src/client/ui/tv.ts` (the TV's window and the big player).
- The DJ sets now use these shared files (`src/shared/djset.ts`, `src/server/djset.ts`, `src/client/djset.ts` keep only their own parts); they behave as before, except that a set whose title arrived before you went up no longer gets stuck loading.
- Hooks in upstream files:
  - `src/shared/protocol.ts`: `tv.play`/`tv.stop` (ClientMsg), `tv` (ServerMsg), `FloorView.tv`.
  - `src/server/floor.ts`: `Floor.tv` (an `OfficeTv` in the floor's data folder).
  - `src/server/server.ts`: `floorView` carries `tv`; the `tv.play`/`tv.stop` case.
  - `src/server/guests.ts`: `tv.play`, `tv.stop` in `GUEST`.
  - `src/client/sound.ts`: `tvVolume()`.
  - `src/client/main.ts`: `tvStreams`/`tvPicture()` (the TV's picture: a share, the stream's card, or idle; also from `refreshShares`), the `tv` message and `msg.tv` on arrival, `setOn`/`frame` after the scene's drawn, E at the TV opens `showTv()`, the couch's E (`watchTvBig`), the TV's hint, the idle screen's words, `window.__tv`.
  - `src/client/ui/hud.ts`, `docs/features.md`, `docs/controls.md`: words.

### Fork maintenance

- `FORK.md` (this file), `.github/workflows/upstream-sync.yml`, `bin/update-office.sh`, and one line at the end of `CLAUDE.md` pointing here.
- `src/server/decor.ts`: the image proxy's user agent names this fork.
