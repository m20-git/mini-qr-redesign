# Proxmox VE installation

## One-line installation

Run as root in the Proxmox host shell:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/m20-git/mini-qr-redesign/main/proxmox/install.sh)"
```

The direct entry point is also available:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/m20-git/mini-qr-redesign/main/ct/mini-qr-redesign.sh)"
```

Review remote scripts before running them as root. This repository is independent and is not an officially listed Community Scripts app. It uses the actual MIT-licensed community-scripts/core framework for menus, defaults, advanced configuration and LXC creation. Framework source: https://github.com/community-scripts/core (license: https://github.com/community-scripts/core/blob/main/LICENSE).

## Flow and defaults

The framework supplies Default Install, Advanced Install, User Defaults and Settings. App Defaults is shown only when the framework finds a saved defaults file for this app. Advanced configuration follows the framework's current sequence, including network, storage and access settings. Diagnostics follow the framework's existing user choice or its diagnostic consent dialog; review Settings before installing.

Application defaults: Debian 13, unprivileged LXC, 2 CPU cores, 2048 MiB RAM, 6 GiB disk. User/App Defaults and Advanced Install can override values. This application provisioning script supports Debian 13 on amd64; selecting a different OS/version is not supported. No Docker is installed. Container features, SSH, password, startup behavior and host-side setup are managed by the framework, not by the previous standalone installer.

The host and guest need Internet/DNS connectivity. DHCP is the normal network default; use Advanced Install to configure static networking, bridge or VLAN. Existing firewall policies still apply.

## Implementation

- proxmox/install.sh: compatibility launcher, preserving the previous one-liner.
- ct/mini-qr-redesign.sh: native framework entry point and update handler.
- install/mini-qr-redesign-install.sh: framework container installation steps.
- proxmox/provision.sh: application build, static deployment and Caddy setup inside Debian 13.

Framework files are loaded from community-scripts/core/main; application installers and source are loaded from this repository's main branch. Upstream framework changes can affect later installs. No application or test files are changed by this installer conversion. Bash syntax checks are not a substitute for an actual Proxmox installation test; the integration has not yet been tested on a live host.

The root-level install.sh remains a separate Docker installer for an existing guest. Do not run it on the Proxmox host. Do not run proxmox/provision.sh on the host either.

## Access and updates

Caddy serves the static build on HTTP port 80. No public TLS or application authentication is configured. Review firewall/reverse-proxy settings before external access. Build dependencies and pnpm 10.0.0 remain installed for updates. Builds run as miniqr; deployed releases are served from /var/www/mini-qr/current.

From the host, replace CTID with the installed container ID:

```bash
pct exec CTID -- /usr/local/sbin/update-mini-qr-redesign
```

Or run update-mini-qr-redesign as root inside the guest. Updates pull main with --ff-only, install from the lockfile, build before switching the served release and retain the two newest deployed releases. OS packages require separate maintenance. Back up the container first and monitor free space on the 6 GiB disk.

This conversion affects new installations. Existing containers are not automatically recreated or migrated. Follow framework prompts carefully on failures; do not blindly restart the installer or delete an existing container.
