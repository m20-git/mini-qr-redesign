#!/usr/bin/env bash
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
. /etc/os-release
[[ $ID == debian && $VERSION_ID == 13 ]] || { echo 'Requires Debian 13.' >&2; exit 1; }
[[ $(uname -m) == x86_64 ]] || { echo 'Requires amd64.' >&2; exit 1; }
apt-get update
apt-get install -y ca-certificates curl git nodejs npm caddy fontconfig util-linux
npm install -g pnpm@10.0.0
id miniqr >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/mini-qr-build --shell /usr/sbin/nologin miniqr
runuser -u miniqr -- git clone --depth 1 --branch main https://github.com/m20-git/mini-qr-redesign.git /opt/mini-qr-build/source
install -d -m 0755 /var/www/mini-qr/releases
cat >/usr/local/sbin/update-mini-qr-redesign <<'UPDATE'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root inside the Mini QR container.' >&2; exit 1; }
exec 9>/run/lock/mini-qr-redesign.lock
flock -n 9 || { echo 'Another update is running.' >&2; exit 1; }
runuser -u miniqr -- bash -c '
  set -Eeuo pipefail
  cd /opt/mini-qr-build/source
  git pull --ff-only origin main
  HUSKY=0 pnpm install --frozen-lockfile
  pnpm run build
'
[[ -s /opt/mini-qr-build/source/dist/index.html ]]
release=$(date -u +%Y%m%d%H%M%S%N)
install -d -m 0755 "/var/www/mini-qr/releases/$release"
cp -a /opt/mini-qr-build/source/dist/. "/var/www/mini-qr/releases/$release/"
chmod -R a+rX "/var/www/mini-qr/releases/$release"
ln -s "releases/$release" /var/www/mini-qr/current.next
mv -Tf /var/www/mini-qr/current.next /var/www/mini-qr/current
mapfile -t releases < <(find /var/www/mini-qr/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)
for ((i=2; i<${#releases[@]}; i++)); do
  [[ ${releases[i]} =~ ^[0-9]+$ ]] && rm -rf -- "/var/www/mini-qr/releases/${releases[i]}"
done
runuser -u miniqr -- bash -c 'cd /opt/mini-qr-build/source && pnpm store prune'
echo "Deployed source commit: $(git -c safe.directory=/opt/mini-qr-build/source -C /opt/mini-qr-build/source rev-parse HEAD)"
UPDATE
chmod 0755 /usr/local/sbin/update-mini-qr-redesign
/usr/local/sbin/update-mini-qr-redesign
cat >/etc/caddy/Caddyfile <<'CADDY'
:80 {
    root * /var/www/mini-qr/current
    encode gzip
    try_files {path} /index.html
    file_server
}
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1/ >/dev/null
apt-get clean
