#!/usr/bin/env bash
# Container-side entry point for the Community Scripts framework.
source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing and building Mini QR Redesign with Caddy"
provision=$(mktemp)
curl -fsSL --retry 3 "${COMMUNITY_SCRIPTS_URL}/proxmox/provision.sh" -o "$provision"
$STD bash "$provision"
rm -f "$provision"
msg_ok "Installed Mini QR Redesign with Caddy"

motd_ssh
customize
cleanup_lxc
