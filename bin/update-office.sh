#!/bin/bash
# flrnoh fork (see FORK.md): brings this Mac's office up to the fork's main and restarts it.
# Run it after merging a pull request into flrnoh/agent-office:
#
#   ~/cloude_code/agent-office/bin/update-office.sh
#
# It stops, changing nothing, if the checkout has local changes or isn't on main, or if the new
# version doesn't build. The office runs as the launch agent com.flrnoh.agent-office; restarting it
# is a SIGTERM, which the office treats as a restart: workers are picked back up.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE="gui/$(id -u)/com.flrnoh.agent-office"
PORT="${PORT:-4600}"
cd "$APP_DIR"

say() { printf '  %s\n' "$*"; }
fail() { printf '  ✋ %s\n' "$*" >&2; exit 1; }

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = main ] || fail "The checkout is on '$branch', not main. Switch first: git switch main"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "There are local changes (git status). Commit or stash them first."

git fetch --quiet origin main
before=$(git rev-parse --short HEAD)
after=$(git rev-parse --short origin/main)
if [ "$before" = "$after" ]; then
  say "✅ Already up to date ($before). Nothing to do."
  exit 0
fi
say "⬇️  $before → $after:"
git log --no-merges --format='     · %s' HEAD..origin/main | head -n 20
git merge --quiet --ff-only origin/main || fail "main can't fast-forward to origin/main. Look at it by hand."

say "🔨 Building…"
# npm ci installs exactly the lockfile (so the checkout stays clean) and builds (the prepare script).
if ! npm ci --no-audit --no-fund > /tmp/agent-office-update.log 2>&1; then
  git reset --quiet --hard "$before"
  npm ci --no-audit --no-fund > /dev/null 2>&1 || true
  fail "The new version doesn't build; back on $before, the office keeps running as it was. Log: /tmp/agent-office-update.log"
fi

if launchctl print "$SERVICE" > /dev/null 2>&1; then
  say "🔁 Restarting the office…"
  launchctl kickstart -k "$SERVICE"
  for _ in $(seq 1 60); do
    curl -fs "http://localhost:$PORT/api/health" > /dev/null 2>&1 && { say "✅ The office is running $after."; exit 0; }
    sleep 1
  done
  fail "The office didn't come back within a minute. Log: ~/Library/Logs/agent-office.log"
else
  say "✅ Updated to $after. The office isn't running as a service here: start it yourself."
fi
