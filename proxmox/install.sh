#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

CTID=''
STAGE='preflight'
trap 'rc=$?; echo "ERROR: stage=$STAGE, exit=$rc, CT=${CTID:-not-created}" >&2; echo "No container is deleted automatically. Inspect it with pct status/pct enter." >&2; exit "$rc"' ERR
[[ $EUID -eq 0 ]] || { echo 'Run as root on the Proxmox host.' >&2; exit 1; }
for cmd in pct pveam pvesm pvesh pveversion curl; do
  command -v "$cmd" >/dev/null || { echo "Missing Proxmox host command: $cmd" >&2; exit 1; }
done
[[ -d /etc/pve && $(uname -m) == x86_64 ]] || { echo 'Requires an amd64 Proxmox VE host.' >&2; exit 1; }
[[ -r /dev/tty && -w /dev/tty ]] || { echo 'An interactive terminal is required.' >&2; exit 1; }

ask() {
  local answer
  read -r -p "$2 [$3]: " answer </dev/tty
  printf -v "$1" '%s' "${answer:-$3}"
}
choose() {
  local target=$1 title=$2 index
  shift 2
  local options=("$@")
  ((${#options[@]})) || { echo "No available option for $title" >&2; exit 1; }
  echo "$title"
  for index in "${!options[@]}"; do printf '  %s) %s\n' "$((index + 1))" "${options[index]}"; done
  ask index 'Select number' 1
  [[ $index =~ ^[1-9][0-9]*$ ]] && ((index <= ${#options[@]})) || { echo 'Invalid selection.' >&2; exit 1; }
  printf -v "$target" '%s' "${options[index - 1]}"
}

mapfile -t ROOT_STORES < <(pvesm status --content rootdir | awk 'NR>1 && $3=="active" {print $1}')
mapfile -t TEMPLATE_STORES < <(pvesm status --content vztmpl | awk 'NR>1 && $3=="active" {print $1}')
BRIDGES=()
[[ ! -d /sys/class/net/vmbr0/bridge ]] || BRIDGES+=(vmbr0)
for item in /sys/class/net/*/bridge; do
  [[ -d $item ]] || continue
  name=${item%/bridge}; name=${name##*/}
  [[ $name == vmbr0 ]] || BRIDGES+=("$name")
done
choose ROOT_STORAGE 'Container root filesystem storage' "${ROOT_STORES[@]}"
choose TEMPLATE_STORAGE 'Template storage' "${TEMPLATE_STORES[@]}"
choose BRIDGE 'Network bridge (DHCP and Internet access required)' "${BRIDGES[@]}"
NEXT_ID=$(pvesh get /cluster/nextid --output-format json)
ask CTID 'New container ID' "$NEXT_ID"
[[ $CTID =~ ^[1-9][0-9]{2,8}$ ]] || { echo 'Invalid container ID.' >&2; exit 1; }
pvesh get /cluster/nextid --vmid "$CTID" --output-format json >/dev/null
ask VLAN 'Optional VLAN tag; 0 means untagged' 0
[[ $VLAN =~ ^[0-9]{1,4}$ ]] && ((10#$VLAN <= 4094)) || { echo 'Invalid VLAN tag.' >&2; exit 1; }
NET="name=eth0,bridge=$BRIDGE,ip=dhcp,ip6=manual,type=veth,firewall=1"
((10#$VLAN == 0)) || NET+=",tag=$((10#$VLAN))"
printf '\nCreate CT %s: Debian 13, unprivileged, 2 cores, 2048 MiB RAM, 512 MiB swap, 6 GiB root disk.\nStorage: %s; template storage: %s; bridge: %s; VLAN: %s\n' "$CTID" "$ROOT_STORAGE" "$TEMPLATE_STORAGE" "$BRIDGE" "$VLAN"
ask ACCEPT 'Create this container? Type yes' no
[[ $ACCEPT == yes ]] || { echo 'Cancelled.'; exit 0; }

STAGE='download Debian 13 template'
pveam update
TEMPLATE=$(pveam available --section system | awk '$2 ~ /^debian-13-standard_.*_amd64\.tar\.(zst|xz|gz)$/ {print $2}' | sort -V | tail -n 1)
[[ -n $TEMPLATE ]] || { echo 'No Debian 13 amd64 template found. Update Proxmox or check its template catalog.' >&2; exit 1; }
VOLUME="$TEMPLATE_STORAGE:vztmpl/$TEMPLATE"
if ! pveam list "$TEMPLATE_STORAGE" | awk -v wanted="$VOLUME" '$1==wanted {found=1} END {exit !found}'; then
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi
STAGE='create container'
pct create "$CTID" "$VOLUME" --hostname mini-qr-redesign --ostype debian \
  --unprivileged 1 --cores 2 --memory 2048 --swap 512 \
  --rootfs "$ROOT_STORAGE:6" --net0 "$NET" --onboot 0 --tags mini-qr-redesign
pct start "$CTID"
STAGE='wait for container networking'
READY=0
for ((attempt=0; attempt<60; attempt++)); do
  if pct exec "$CTID" -- bash -c 'ip -4 -o addr show dev eth0 scope global | grep -q "inet " && getent ahostsv4 github.com >/dev/null' 2>/dev/null; then
    READY=1
    break
  fi
  sleep 2
done
[[ $READY == 1 ]] || { echo 'No IPv4/DNS connectivity. Check DHCP, VLAN, gateway and firewall.' >&2; exit 1; }
STAGE='install and build application inside container'
pct exec "$CTID" -- bash -s <<'CONTAINER'
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
. /etc/os-release
[[ $ID == debian && $VERSION_ID == 13 ]] || { echo 'Requires Debian 13.' >&2; exit 1; }
apt-get update
apt-get upgrade -y
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
CONTAINER
STAGE='verify installation'
pct set "$CTID" --onboot 1
IP=$(pct exec "$CTID" -- bash -c "ip -4 -o addr show dev eth0 scope global | awk '{print \$4}' | cut -d/ -f1" | head -n 1)
printf '\nMini QR Redesign installed: http://%s\nContainer: %s\nEnter: pct enter %s\nUpdate: pct exec %s -- /usr/local/sbin/update-mini-qr-redesign\n' "$IP" "$CTID" "$CTID" "$CTID"
echo 'No root password or SSH access was configured. Manage the container via pct enter.'
