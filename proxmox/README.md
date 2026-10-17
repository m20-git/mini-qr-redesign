# Proxmox VE installation

Run as root in the Proxmox host shell, not inside an existing guest:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/m20-git/mini-qr-redesign/main/proxmox/install.sh)"
```

Review the script before executing remote code as root. This is an independent installer, not an official Community Scripts installer. It has had Bash syntax checks, but has not been tested on a running Proxmox host.

## Requirements and defaults

- amd64 Proxmox VE host with Debian 13 container support and an interactive terminal.
- Active storage supporting rootdir, and storage supporting vztmpl.
- Internet access from the host and guest; DHCP and DNS on the selected bridge/VLAN.
- New unprivileged Debian 13 LXC; 2 CPU cores, 2048 MiB RAM, 512 MiB swap, 6 GiB root disk.
- Choose container storage, template storage, bridge, free container ID and optional VLAN tag. Confirm before creation.
- No Docker, nesting, host package installation or host firewall changes. Guest net0 has firewall=1; existing Proxmox firewall policies still apply.
- Guest packages are upgraded during installation. Node.js and Caddy come from Debian; pnpm is pinned to 10.0.0 to match package.json.
- Application build runs as the unprivileged miniqr user; Caddy serves the static build on HTTP port 80.
- The installer uses main, not GitHub releases. Normal production build defaults apply; .env.development is not loaded.
- Onboot is enabled only after successful provisioning. No root password or SSH login is configured; use pct enter from the host.

The older root-level install.sh is a separate Docker installer for an existing system. Do not execute that script on the Proxmox host.

## Access and updates

The installer prints http://CONTAINER-IP. No public TLS or authentication is configured. Use your existing reverse proxy and firewall rules if needed; do not expose it unintentionally.

From the Proxmox host (replace CTID):

```bash
pct enter CTID
pct exec CTID -- /usr/local/sbin/update-mini-qr-redesign
```

Or run update-mini-qr-redesign as root inside the guest. Updates pull main with --ff-only, use the pnpm lockfile, build before switching the served release, and retain the two newest deployed releases. They do not upgrade OS packages. Back up the container before updates. Keep the build tools installed for future updates.

## Troubleshooting

Failures leave the container in place for inspection; the script never destroys a container automatically. Do not repeatedly rerun it expecting to resume an existing installation. Use pct status CTID and pct enter CTID to inspect it. Check DHCP, DNS, VLAN and Proxmox firewall rules if network checks fail.

Inside the guest, check systemctl status caddy, journalctl -u caddy and df -h. The 6 GiB disk includes the OS, source, dependencies and build output; monitor free space. If the first build fails, correct the cause and run update-mini-qr-redesign inside the guest. If provisioning stopped before Caddy configuration, that configuration step also needs to be completed; an application rebuild alone is not a full provisioning resume.
