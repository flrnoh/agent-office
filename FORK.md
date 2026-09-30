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

Friends who come over to hang out: they walk around, chat, talk, play (arcade, golf, darts, basketball, cars, jukebox, whiteboard, the table games on the roof) and watch the workers' terminals, but can't type in them, hire, send home, touch GitHub, the queue, meetings, settings or accounts, or reach the workers' dev servers. The server enforces it, whatever a guest's browser sends.

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
- Stricter still: **party guests** (below) are guests who don't even watch. They go through the guest rules too, minus watching terminals and the whiteboard, so sorting a new message for guests sorts it for them.

### Party guests

Friends Florian invites to a party on the rooftop bar (role `party`, "Party guest"): they arrive up on the roof, can ride the elevator anywhere, drink, eat, play every game (arcade, golf, darts, axe, basketball, cars, jukebox, DJ sets), chat and talk, but neither see nor change anything of the work: no terminals (not even watching), laptops on a screensaver, blank notes on the wall boards, no queue, meetings, changes, docs, search, services, spend, limits, GitHub or whiteboard. Workers still sit at their desks, by name, "busy". The server enforces it both ways, whatever a party guest's browser does.

- Every FloorView field is sorted too (`VIEW_AS_IS` / `VIEW_BLANKED` in `src/server/party.ts`): a field upstream adds to the floor view breaks the build until someone decides whether party guests may see it.
- `src/server/party.ts`: the rules.
  - What they may send: `PARTY_MSGS` is guests.ts' `GUEST` minus `PARTY_EXCLUDED` (watching a terminal, the whiteboard), so every message is sorted for them once it's sorted for guests.
  - What they get: `partyGate` wraps a party guest's socket, so **every** frame the office sends them (sendTo, broadcast, toFloor, toNeighbors, terminal output, anything upstream adds) is passed (`PARTY_SEES`), redacted (`PARTY_REDACT`: the welcome and floor views, workers, peers, floors, boards, gong, plan, meeting, toasts) or dropped (`PARTY_NEVER`). **A server message type upstream (or another feature of this fork) adds is in none of them, and the server doesn't compile until someone sorts it** (the error names it, as missing from `PARTY_REDACT`). Play or people → `PARTY_SEES`; anything of the work → `PARTY_NEVER`. A type the gate doesn't know is dropped at runtime too. Toasts only get through when they're about play (`PARTY_TOASTS`); their own notes go past the gate (`partyNote`).
  - HTTP: `roleMayFetch` (guests' rules, minus the whiteboard's pictures); `watchesOnly` keeps them out of workers' service tunnels.
- `src/client/party.ts`: the page: `partyRefuses()` at the top of every window of the work, `PARTY_OFF` things in the office, desk lines, the screensaver, the ☰ menu (`partyMenu`), `body.party`, and a reload when the role changes.
- `tests/party.test.ts` (role plumbing, what they send, what they get); `tests/party-e2e.mjs`: against a throwaway office on port 4711 (`npm run build && node tests/party-e2e.mjs`; a shell worker, never a Claude one).
- Hooks in upstream files:
  - `src/shared/protocol.ts`: `AccountRole` has `'party'`, `accountRole()`, `Me.party` (always with `Me.guest`).
  - `src/server/server.ts`: `party` on `Client`; `partyGate(ws, …)` in `onConnection`; party guests arrive on the roof (`onRoof`); the party check before the guest check in `handleMessage`; `warn` goes by `partyNote`; `roleMayFetch` in the HTTP handler; `meOf`, `accountsChanged` (`partyChanged`), the heartbeat and the `accounts.role` toast.
  - `src/server/auth.ts`: `fromAnyCookie`'s `noGuests` uses `watchesOnly`.
  - `src/server/accounts.ts`: `--party` for `accounts invite`, `party` for `accounts role`.
  - `src/client/ui/{boards,bookshelf,changes,meeting,pull,queue,search,services,terminal,whiteboard}.ts`: `partyRefuses()` as the first line of each window's `open…`.
  - `src/client/main.ts`: `interact` and `hintFor` (party lines first), `openShell`/`promptAtDesk`/`hireAtDesk`/`goToNextWaiting`/`startHanging` refuse, the laptop's placeholder, `partyMenu([...])` round the ☰ menu, `watchParty()`.
  - `src/client/ui/bossdesk.ts`: `bossWorker()` is nobody for a party guest (Minesweeper only).
  - `src/client/ui/elevator.ts`: no "Add a project" for a party guest.
  - `src/client/ui/accounts.ts`, `src/client/join.ts` ("invited you to a party on the rooftop bar 🎉"), `src/client/style.css` (`body.party`), `README.md`, `docs/configuration.md`.

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

### The casino

Diagonally across the street from the office (x -46..-20, z 36..56, where two neighbours stood) there's a casino: a burgundy block with a neon CASINO sign ringed with chaser bulbs, an awning over a red carpet, and glass doors that slide apart. **E** at the doors goes in; **E** at the doors inside comes back out onto the street of the floor you came from. Inside is a place of its own like the roof (`CASINO = '@casino'` is your `floor` while you're in there), so people from every floor meet at its tables, guests too. Play chips only: nothing to buy, nothing to cash out. Everyone starts with 1,000; once a day (office clock, local midnight) anyone below 1,000 is topped back up to it. Phase 1 has the slot machines (eight, along the west wall); roulette, two blackjack tables and poker are placeholders that say "Coming soon".

- Own files:
  - `src/shared/casino.ts`: `CASINO`, the building's box, the room, the door, where you land coming in and going out, `CASINO_TABLES` (every table and machine: id, kind, position, seats), the chip rules (`START_CHIPS`, `MIN_BET`/`MAX_BET`, `validBet`), and the generic table protocol (`CasinoClientMsg`, `CasinoServerMsg`).
  - `src/shared/casino-slots.ts`: symbols, weighted reel strips, paytable (RTP 94.99%, exact), `SlotsView`/`SlotsResult`.
  - `src/server/casino/`: `index.ts` (`Casino`: who's inside, seating, rate limits, `crypto.randomInt`, the 250 ms tick, sending views), `wallets.ts` (`casino.json` in the data folder, 0600, written atomically, keyed by `account:<id>` or `name:<name>`), `game.ts` (the `CasinoGame` interface), `slots.ts` (`SlotMachine`), `soon.ts` (`ComingSoon`).
  - `src/client/casino.ts` (`CasinoPlace`: in and out, the room, the chip counter, the table windows, hints, lighting inside), `src/client/world/casino/` (`exterior.ts`, also the block the roof's city shows; `interior.ts`; `parts.ts`), `src/client/ui/casino/` (`registry.ts`, `slots.ts`, `soon.ts`, `reels.ts`, `casino.css`).
  - `tests/casino-wallet.test.ts`, `tests/casino-slots.test.ts`, `tests/casino-tables.test.ts`.
- The protocol: you go in and out with `floor.go` (`CASINO`; back with your floor's id and `at` in front of the doors). At a table it's always the same three messages, whatever the game: `casino.sit {table}`, `casino.stand`, `casino.act {table, action, data}`; the office answers with `casino.wallet {chips, nextTopUpAt?}`, `casino.table {table, state}` (the game's own view, per viewer: hide hole cards there) and `casino.result {table, text, delta?, data?}`. All three are `GUEST`.
- **Phase 2 (roulette, blackjack, poker):** no new messages, no new hooks. Server: a class implementing `CasinoGame` (`src/server/casino/game.ts`) with the table's id, made for its tables in `GAMES` (`src/server/casino/index.ts`: `roulette: (t) => new Roulette(t),` in place of the `ComingSoon`). Chips only move through `ctx.stake` (checks whole chips, limits, the balance) and `ctx.pay`; randomness through `ctx.random`; timed things (a betting window, the dealer's turn) in `tick`; `ctx.changed()` sends the view to everyone inside. Client: a window `(ctx: CasinoUiContext) => CasinoUi` registered with `registerCasinoUi(kind, open)` (`src/client/ui/casino/registry.ts`) in a file imported from `client/casino.ts`, like `ui/casino/slots.ts`; the 3D tables are in `world/casino/interior.ts` (`setTable` gets every table's state, for animating a wheel or dealt cards).
- Hooks in upstream files:
  - `src/shared/protocol.ts`: `CasinoClientMsg`/`CasinoServerMsg` in `ClientMsg`/`ServerMsg`.
  - `src/server/server.ts`: `casino` (made, stopped), `casinoView`/`casinoPlayer`/`goToCasino`, `floor.go` to `CASINO`, back into the casino after a reload (`inCasino` in `onConnection`), `casino.leave` in `leave` and on close, and casino messages handed to it at the top of `handleMessage`.
  - `src/server/guests.ts`: `casino.sit`, `casino.stand`, `casino.act` in `GUEST`.
  - `src/client/world/office.ts`: `InteractKind` has `'casino' | 'casino-table'`, `Interactable.table`; the exterior built with the street, its door in `doors`, `setStreet` in `setLevel`, `update` in `update`.
  - `src/client/world/outside.ts`: the two neighbours across the street to the west are gone, `neighbourBoxes()` has the casino (golf balls and the scenic loop's trees keep clear of it), and one far-side street lamp moved from x -34 to -37, out of the doorway.
  - `src/client/world/city.ts`: the roof's city leaves the casino's lot free and draws `cityCasino()` there.
  - `src/client/main.ts`: `casino` (a `CasinoPlace`) and `casinoTrip`; `setPlace`, `usable`, `aimedAt`, `REACH`, `hintFor`, `interact`, `renderProject`, the message router, `arrived()` after welcome and floor.enter, `update` and `mood` in the frame, and the garage ride from inside.
  - `src/client/sound.ts`: `casino(kind)`, a section of its own. `src/client/ui/whereabouts.ts`, `src/client/ui/hud.ts`: "🎰 in the casino".
  - `docs/features.md`: the casino line.
### Speakers all over the office

Small speakers hang from the ceiling round the office and play whatever the jukebox plays, so it's heard all over the floor, not only in the lounge: over both desk clusters, by the boards, between the whiteboard and the elevator, in the lounge, the kitchen, by the balcony doors, in the meeting room and the loft (smaller, under their low ceilings), and one per row of the back office once it's built out. Their LED glows green and the woofer pumps with the beat while music plays; red when the floor has them off. You hear them inside the office on your floor, a little on the balcony and fire escape, and not in the garage, the street or on the roof.

They're one PA, not a source per speaker (no piling up, no phasing): the tune goes into the jukebox's panner as before and into a speaker bus (a bit thinner, like small boxes), whose level is the nearest speaker's by distance, lightly panned towards the nearest two. A radio stream stays one audio element, at the louder of the jukebox where you stand and the speakers. **⚙️ → Sound & voice → Speakers** is your own volume (default 40 %, saved with the other settings); muting the jukebox mutes them too. The jukebox's window has quick steps (✕ ▁ ▁▃ ▁▃▅), and for the team a switch that turns them off on the floor for everyone (saved in jukebox.json).

- Own files: `src/client/speakers.ts` (where they hang, the level math, the steps), `src/client/world/speakers.ts` (the boxes), `src/client/ui/speakers.ts` and `src/client/ui/speakers.css` (the row in the jukebox's window); `tests/speakers.test.ts`.
- Hooks in upstream files:
  - `src/client/sound.ts`: the tune goes into `musicSrc` (which feeds the jukebox's panner and the speakers), a speakers section (`setSpeakerVolume`, `setSpeakerRoom`, `hearSpeakers`), `hearStream` uses `streamVolume`.
  - `src/client/state.ts`: `Settings.speakers`/`speakersMuted`, loaded and saved. `src/client/ui/settings.ts`: the Speakers row.
  - `src/client/ui/jukebox.ts`: `openJukebox(..., speakerControl)` puts the speakers' row in.
  - `src/client/main.ts`: `officeSpeakers` built and updated each frame, `sound.setSpeakerRoom(...)` before `sound.update`, `setSpeakerVolume` next to `setMusicVolume`, `showJukebox` passes the control.
  - `src/shared/jukebox.ts`: `JukeboxState.speakersOff`. `src/server/jukebox.ts`: `setSpeakers()`, kept through new tunes, saved and loaded.
  - `src/shared/protocol.ts`: the `jukebox.speakers` message. `src/server/server.ts`: its case (toast to the floor). `src/server/guests.ts`: `jukebox.speakers` is `TEAM_ONLY`.
  - `docs/features.md`: the speakers line.

### Flogge's own car

Florian's own car stands in the garage: **Flogge's Bulli**, a split-window camper van (teal below, cream above with the V down its nose, round headlights, whitewalls, a surfboard on the roof rack, FLOGGE on the plates front and back), backed into the east corner of the back wall under a sign of its own, with lines round its spot. Only its keyholders take the wheel; everyone else hears "That's Flogge's Bulli — ask him for a ride" and may sit in the passenger seat. The server enforces it at `car.enter`, whatever a page sends. It's slower and softer than the supercars (about 45 km/h flat out, gentle brakes, a slow big wheel), rocks on its springs, and its horn is an old buzzy "möp möp".

Who holds the keys is set, not written in: `.agent-office/car-keys.json` lists account ids, set with `agent-office car keys <name>...` (`agent-office car` shows them, `agent-office car keys --admins` goes back to the default), picked up while the office runs. With nobody named, every admin (and the shared office password) holds them. Each page learns whether it may drive from `Me.bulli`.

Driving somewhere comes next: `src/shared/destinations.ts` is where named places to drive to (the supermarket, first) go, with the steps for adding one: its own lot in `PAVEMENT` (or off the scenic loop), listed there, drawn, and named in the drive hint.

- Own files: `src/shared/bulli.ts` (its driving, seats, heights, who may take which seat), `src/server/carkeys.ts` (the keys and the `agent-office car` command), `src/client/world/bulli.ts` (the van, its plates, its springs, its corner), `src/shared/destinations.ts`; `tests/bulli.test.ts`.
- Hooks in upstream files:
  - `src/shared/garage.ts`: `CarKind` has `'bulli'`, `CarDef.owned`/`plate`, the Bulli in `CARS` (last, so no other car's index moves), `DriveTuning`, `drive(..., t)`, `steerLimit(..., t)`, `tuningOf`, `seatsOf`, `hipsOf`, `heightOf`.
  - `src/server/garage.ts`: `drive` clamps to the car's own `tuningOf`.
  - `src/shared/protocol.ts`: `Me.bulli`.
  - `src/server/server.ts`: `carKeys`, `keysOf` in `meOf`, `Client.bulli` (passed on like `admin`/`guest` in `accountsChanged` and the heartbeat), and the refusal in the `car.enter` case.
  - `src/server/cli.ts`: the `car` command; `src/server/config.ts`: its line in the help.
  - `src/client/world/cars.ts`: the Bulli's model and corner in `Fleet`, `CarModel.sway` and `wobble` in `update`, per-car seats and heights in `seatAt` and `show`.
  - `src/client/driving.ts`: `tuningOf` and `seatsOf` for the car you're in.
  - `src/client/main.ts`: `carIcon`, `mayDrive`, passenger seat for non-keyholders in `getIn`, `hipsOf`, the car hints, no "got in first" toast when refused; `sound.honk` takes the car's kind.
  - `src/client/sound.ts`: `honk(at, kind)` and `bulliHorn`, in a section of their own.
  - `src/client/ui/whereabouts.ts`, `src/client/ui/hud.ts`, `docs/features.md`, `docs/configuration.md`: words.

### Racing rig

A racing rig in the lounge, next to the arcade cabinet: out between the lounge and the meeting room's glass (x 14.2–15.6, z 5.9–8.0), a bucket seat on an aluminium frame, a wheel, pedals and a TV on a stand, facing the glass so the lounge sees its screen. **E** there sits you down (hands on the wheel, for everyone to see), the camera glides up to the TV, and you race OFFICE GP: a pseudo-3D arcade racer, three laps against five CPU cars (CLAUDE, CODEX, GROK, GEMINI, OPENCODE) after a 3-2-1 countdown, lap timer, best lap, off-road slowdown, bumps, a boost meter. Arrows or WASD, Space boost, R restart, a gamepad or wheel through the Gamepad API. One driver a floor; everyone else sees the race on the rig's TV (the driver's page sends a compact frame ten times a second, the office passes it on, each page draws it) and can press **E** to watch up close. Esc or ✕ gets you out of the seat; leaving the floor or the office frees it. The building's fastest races and laps are kept in the office's `.agent-office/rig.json` and shown on the TV when nobody's racing. The office only takes a result whose laps could have been driven (none quicker than a lap flat out on the boost) and no quicker than its own clock saw since the green.

- Own files: `src/shared/racing.ts` (the track, the race, the CPU cars, the autopilot), `src/shared/rig.ts` (where the rig stands, its seat, frames, results and tables), `src/server/rig.ts` (one driver a floor, relaying, checking results, the tables), `src/client/world/rig.ts` (the model), `src/client/ui/rig.ts` (sitting, driving, watching, the TV), `src/client/ui/rigscreen.ts` (drawing the race); `tests/rig.test.ts`.
- Hooks in upstream files:
  - `src/shared/protocol.ts`: `rig.play`, `rig.leave`, `rig.frame`, `rig.finish` (ClientMsg), `rig`, `rig.frame` (ServerMsg), `FloorView.rig`.
  - `src/server/guests.ts`: the four `rig.*` messages in `GUEST`.
  - `src/server/server.ts`: `rigs`/`rigChanged`/`rigLeft`, `floorView` carries `rig`, the `rig.*` cases, and `rigLeft` when someone leaves a floor or the office.
  - `src/shared/layout.ts`: the rig's seat (`RIG_SEAT`) in `SEATING`. `src/shared/nav.ts`: the rig in the office's obstacles.
  - `src/client/world/office.ts`: `InteractKind` has `'rig'`, `OfficeWorld.rig`, built next to the cabinet with its collider and interactable.
  - `src/client/world/character.ts`: `wheel`, hands on the wheel while sitting.
  - `src/client/state.ts`: `store.rig`/`store.rigFrame`, from the floor view and the `rig`/`rig.frame` messages.
  - `src/client/sound.ts`: `rig()`, the TV's beeps, fanfare and knocks, in a section of its own (the engine goes through `setEngines`).
  - `src/client/main.ts`: `rig` next to `cabinet` (made, stopped, updated), `sitInRig`, E at the rig, its hint, its `REACH`, the engine in `setEngines`, `wheel` for you and everyone else, no first-person hands while zoomed.
  - `src/client/ui/hud.ts`, `docs/features.md`: words.

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

### Games on the roof

Four table games on the rooftop bar: a pool table (eight-ball, simplified) and a kicker on the open deck west of the dance floor, south of the darts and axes, and an air hockey table and a table tennis table side by side in the middle of the deck, north of the sun loungers. **E** at a table steps up to it: the camera glides to your end and the mouse plays (✕ or Esc steps back). The first two up play each other, someone alone plays the computer, and with both sides taken **E** watches. Guests play too.

The first player's page (the table's host) runs the game, the computer included, and sends a snapshot of the table about 25 times a second through the office to everyone on the roof; the other player's page sends its moves to the host the same way. The office only checks who may send what (only the host snapshots, only the other player moves, only on the roof, a rate limit each, plain numbers only), relays to the roof, and keeps who's at which table, the score and the last snapshot for whoever comes up later. When the host leaves (steps back, goes downstairs, closes the page), the other player runs the table against the computer; somebody new at a table starts a new game.

- Own files:
  - `src/shared/tablegames/`: the games, pure and shared: `tables.ts` (where the tables stand, the wire types, the checks), `game.ts` (what a game is), `hockey.ts`, `pingpong.ts`, `kicker.ts`, `pool.ts` (physics, rules, the computer), `index.ts`.
  - `src/server/tablegames.ts`: the seats (`RoofTables`: join, leave, host handover, snapshot and move checks) and `tableMessage`.
  - `src/client/tablegames/models.ts` (the four tables in 3D, and what's on them), `play.ts` (stepping up, running and drawing the games, the computer, the camera, the bar at the top, sounds), `tablegames.css`.
  - `tests/tablegames.test.ts` (physics and rules), `tests/tablegames-server.test.ts` (sessions and relaying).
- Hooks in upstream files:
  - `src/shared/protocol.ts`: `table.join`/`table.leave`/`table.input`/`table.sync` (ClientMsg), `tables`/`table.sync`/`table.input` (ServerMsg), `FloorView.tables`.
  - `src/server/server.ts`: `roofTables`, `toRoof`, `leftTable` (off the roof in `leave`, and on disconnect), `roofView` carries `tables`, the four `table.*` cases.
  - `src/server/guests.ts`: the four `table.*` messages in `GUEST`.
  - `src/client/world/office.ts`: `InteractKind` has `'table'`, `Interactable.table`.
  - `src/client/world/rooftop.ts`: `buildRoofTables()` added to the roof (its group, colliders, interactables), `Rooftop.tables`.
  - `src/client/sound.ts`: `tableGame()`, in a section of its own.
  - `src/client/main.ts`: `tables` (made next to the thrower), E at a table, its hint, `tables.update` after the cabinet, `REACH.table`, no hands or own body while the camera's at a table, `__office.tables`.
  - `docs/features.md`, `docs/controls.md`: words.

### Fork maintenance

- `FORK.md` (this file), `.github/workflows/upstream-sync.yml`, `bin/update-office.sh`, and one line at the end of `CLAUDE.md` pointing here.
- `src/server/decor.ts`: the image proxy's user agent names this fork.
