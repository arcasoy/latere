#!/usr/bin/env bash
# Bring /srv/latere to origin/main and restart the console. Idempotent: run it as
# often as you like; it exits early when there is nothing new.
#
# Run by latere-deploy.timer once a minute, and by hand to force a deploy now:
#   sudo -u latere /srv/latere/ops/deploy.sh --force
set -euo pipefail

REPO=/srv/latere
APP=$REPO
BRANCH=${GTM_BRANCH:-main}

cd "$REPO"

git fetch --depth 1 origin "$BRANCH" --quiet

local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse FETCH_HEAD)

if [ "$local_sha" = "$remote_sha" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi

echo "[deploy] ${local_sha:0:8} -> ${remote_sha:0:8}"
git reset --hard FETCH_HEAD --quiet

cd "$APP"
# `npm ci` and not `install`: the lockfile is the deploy's contract, and a
# resolution that drifts on the box is a difference nobody reviewed.
mise exec -- npm ci --silent
mise exec -- npm run build

# Restarting is the one step that needs root, granted narrowly in sudoers by
# ops/sudoers.latere rather than by giving the service user a shell.
sudo /bin/systemctl restart latere.service
echo "[deploy] restarted at $(git rev-parse --short HEAD)"
