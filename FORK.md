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

### Fork maintenance

- `FORK.md` (this file), `.github/workflows/upstream-sync.yml`, `bin/update-office.sh`, and one line at the end of `CLAUDE.md` pointing here.
