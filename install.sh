#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/mini-qr-redesign"
REPO_URL="https://github.com/m20-git/mini-qr-redesign.git"

if [[ $EUID -ne 0 ]]; then
  echo "Bitte als root ausführen."
  exit 1
fi

echo "==> Docker installieren"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "==> Repository klonen bzw. aktualisieren"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> Mini QR Redesign bauen und starten"
docker compose up -d --build

IP=$(hostname -I | awk '{print $1}')
echo
echo "==> Installation abgeschlossen"
echo "==> Erreichbar unter: http://${IP}"
