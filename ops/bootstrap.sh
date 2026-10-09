#!/usr/bin/env bash
# Provision a fresh Debian/Ubuntu box to serve latere.space. Run as root:
#
#   curl -fsSL <raw url of this file> -o bootstrap.sh
#   bash bootstrap.sh git@github.com:arcasoy/latere.git
#
# Idempotent — safe to re-run after fixing something. It stops short of the two
# steps that need a human at a browser: the Cloudflare tunnel login and filling
# in /etc/latere/latere.env. It prints both at the end.
set -euo pipefail

REPO_URL=${1:-}
REPO=/srv/latere
DATA=/srv/latere-data
ENV_FILE=/etc/latere/latere.env
USER_NAME=latere

[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
[ -n "$REPO_URL" ] || { echo "usage: bash bootstrap.sh <git-remote-url>"; exit 1; }

echo "==> packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg sudo unzip fonts-liberation ffmpeg

echo "==> cloudflared"
if ! command -v cloudflared >/dev/null; then
  arch=$(dpkg --print-architecture)
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb"
  dpkg -i /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
fi

echo "==> service user"
id -u "$USER_NAME" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$USER_NAME"
install -d -o "$USER_NAME" -g "$USER_NAME" "$DATA"

echo "==> mise + node"
sudo -u "$USER_NAME" bash -lc '
  set -e
  command -v ~/.local/bin/mise >/dev/null || curl -fsSL https://mise.run | sh
'

echo "==> checkout"
if [ ! -d "$REPO/.git" ]; then
  install -d -o "$USER_NAME" -g "$USER_NAME" "$REPO"
  sudo -u "$USER_NAME" git clone --depth 1 "$REPO_URL" "$REPO"
fi
chown -R "$USER_NAME:$USER_NAME" "$REPO"

echo "==> credentials"
install -d -m 0750 -o root -g "$USER_NAME" /etc/latere
if [ ! -f "$ENV_FILE" ]; then
  install -m 0640 -o root -g "$USER_NAME" \
    "$REPO/.env.example" "$ENV_FILE"
  NEEDS_ENV=1
fi

echo "==> build"
sudo -u "$USER_NAME" bash -lc "cd $REPO && ~/.local/bin/mise install && ~/.local/bin/mise exec -- npm ci --silent && ~/.local/bin/mise exec -- npm run build"

echo "==> units"
install -m 0644 "$REPO"/ops/latere.service /etc/systemd/system/
install -m 0644 "$REPO"/ops/latere-deploy.service /etc/systemd/system/
install -m 0644 "$REPO"/ops/latere-deploy.timer /etc/systemd/system/
install -m 0644 "$REPO"/ops/latere-collect.service /etc/systemd/system/
install -m 0644 "$REPO"/ops/latere-collect.timer /etc/systemd/system/
install -m 0440 "$REPO"/ops/sudoers.latere /etc/sudoers.d/latere
visudo -c -q
chmod +x "$REPO"/ops/deploy.sh
systemctl daemon-reload
systemctl enable --now latere-deploy.timer latere-collect.timer

cat <<EOF

Provisioned. Two steps left, both needing a browser:

  1. Fill in $ENV_FILE (it is a copy of .env.example), then start the service:
       systemctl enable --now latere.service
       systemctl status latere.service

  2. Point latere.space at this box through a tunnel:
       cloudflared tunnel login
       cloudflared tunnel create latere
       cp $REPO/ops/cloudflared.yml.example /etc/cloudflared/config.yml
       # edit it: put the tunnel id in both places
       cloudflared tunnel route dns latere latere.space
       cloudflared service install
     Then in Zero Trust, keep the Access application on latere.space and
     delete the Worker's custom domain so DNS resolves to the tunnel.

EOF
[ "${NEEDS_ENV:-}" = "1" ] && echo "latere.service was NOT started — $ENV_FILE is still the template."
exit 0
