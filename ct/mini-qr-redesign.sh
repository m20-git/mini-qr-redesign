#!/usr/bin/env bash
# Uses Community Scripts core (MIT); this application script is independently maintained.
# Framework: https://github.com/community-scripts/core
# Application: https://github.com/m20-git/mini-qr-redesign

export COMMUNITY_SCRIPTS_URL="https://raw.githubusercontent.com/m20-git/mini-qr-redesign/main"
export COMMUNITY_SCRIPTS_CORE_URL="https://raw.githubusercontent.com/community-scripts/core/main"
SCRIPT_SLUG="mini-qr-redesign"

_engine=$(curl -fsSL --retry 3 "$COMMUNITY_SCRIPTS_CORE_URL/core/build.func") || exit 1
source /dev/stdin <<<"$_engine"
unset _engine

APP="Mini-QR-Redesign"
var_tags="${var_tags:-qr-code}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_disk="${var_disk:-6}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"
var_arm64="${var_arm64:-no}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -x /usr/local/sbin/update-mini-qr-redesign ]]; then
    msg_error "Mini QR Redesign update command not found"
    exit 1
  fi
  msg_info "Updating Mini QR Redesign"
  $STD /usr/local/sbin/update-mini-qr-redesign
  msg_ok "Updated Mini QR Redesign"
  exit 0
}

start
build_container
description
msg_ok "Mini QR Redesign installation completed"
echo -e "${INFO}${YW}Access: http://${IP}${CL}"
