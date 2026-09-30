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
- Stricter still: **party guests** (below) are guests who don't even watch. They go through the guest rules too, minus watching terminals and the whiteboard, so sorting a new message for guests sorts it for them.

### Party guests

Friends Florian invites to a party on the rooftop bar (role `party`, "Party guest"): they arrive up on the roof, can ride the elevator anywhere, drink, eat, play every game (arcade, golf, darts, axe, basketball, cars, jukebox, DJ sets), chat and talk, but neither see nor change anything of the work: no terminals (not even watching), laptops on a screensaver, blank notes on the wall boards, no queue, meetings, changes, docs, search, services, spend, limits, GitHub or whiteboard. Workers still sit at their desks, by name, "busy". The server enforces it both ways, whatever a party guest's browser does.

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

### Fork maintenance

- `FORK.md` (this file), `.github/workflows/upstream-sync.yml`, `bin/update-office.sh`, and one line at the end of `CLAUDE.md` pointing here.
- `src/server/decor.ts`: the image proxy's user agent names this fork.
