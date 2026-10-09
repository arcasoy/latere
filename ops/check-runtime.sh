#!/usr/bin/env bash
set -euo pipefail

[ "$(uname -s)" = "Linux" ] || exit 0
for package in fonts-liberation ffmpeg; do
  if [ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true)" != "install ok installed" ]; then
    echo "Missing runtime package: $package. As root, run apt-get update && apt-get install -y fonts-liberation ffmpeg, then retry deploy.sh --force." >&2
    exit 1
  fi
done
ffprobe -version >/dev/null
