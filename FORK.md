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

### Fork maintenance

- `FORK.md` (this file), `.github/workflows/upstream-sync.yml`, `bin/update-office.sh`, and one line at the end of `CLAUDE.md` pointing here.
