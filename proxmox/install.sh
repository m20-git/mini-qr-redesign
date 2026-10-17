#!/usr/bin/env bash
# Compatibility entry point: native Community Scripts menus and LXC creation.
set -e
script=$(curl -fsSL --retry 3 https://raw.githubusercontent.com/m20-git/mini-qr-redesign/main/ct/mini-qr-redesign.sh)
exec bash -c "$script" -- "$@"
