# Design spec — Remote‑Admin (Hardened)

Last updated: 2026-02-09

## Overview
This document captures final decisions for the hardened self‑hosted Remote‑Admin system (Windows agents, operator web UI, mediasoup SFU, AD authentication).

Scope: implement secure, consented remote support for Windows hosts in a single self‑hosted deployment with clear upgrade paths for scaling.

## High-level architecture
- Server (single VM / on‑prem): Express API + Socket.IO (signaling) + mediasoup worker(s) (SFU) + recording & storage + logging shipper.
- Agent (Windows): Electron app (signed exe) running as service/agent with visible tray and consent UI; uses getDisplayMedia + mediasoup‑client to stream screen and optionally audio.
- Operator UI: web app (React) served by server; connects via WebRTC to mediasoup to receive screen stream and initiates control requests via secured signaling (HTTPS + JWT/AD session).

## Network & Ports
- HTTPS (API + signaling): TCP 443 (or configurable PORT). Use TLS with server cert.
- mediasoup workers (worker<->router): UDP ports for RTP; mediasoup requires range for UDP and internal TCP for workers. For PoC single server, open:
  - UDP 40000-40100 (RTP)
  - TCP 4443 (signaling agent→server over TLS)
- TURN (coturn) if NAT traversal required: UDP/TCP 3478 and TLS 5349.

## Certificates & PKI
- Use internal CA for mTLS between agent and server (recommended). Agent must be provisioned with server CA fingerprint (pinning).
- Server cert: signed by internal CA or purchased CA for public deployments.
- Code signing: sign Electron exe/MSI using organization code signing certificate (EV recommended).
- Updating certificates: store CA and server cert in `config/certs/`, rotation process documented in ops.

## Authentication & Authorization
- Operators authenticate via Active Directory (LDAP bind). Server will perform LDAP bind using a service account configured in `config/ldap.json` and map AD groups to roles:
  - `remote-admin-ops` → operator
  - `remote-admin-admins` → admin
  - `remote-admin-readonly` → readonly
- Session cookie + server session store (Redis or in‑memory for PoC) and JWT for signaling channels where needed.
- 2FA: encourage AD side enrollment (Windows Hello / AD MFA). Optional TOTP fallback for non‑AD users.

## RBAC & Least Privilege
- All control actions validated server‑side against RBAC policy.
- Agent enforces local policy (whitelist.json) for destructive actions (kill); server enforces that operator role is permitted to request action.

## Storage & Recording
- Recordings: mediasoup server will produce RTP/RTCP streams; implement recording worker to mux to WebM/MP4 files and store under `storage/records/` (rotate with retention policy).
- Logs: structured JSON logs via Winston to `logs/actions.log` (append only). Use Filebeat or Winlogbeat to ship logs to Elastic/Graylog.
- Sensitive secrets: store using Windows DPAPI on agent and server use OS keyring or KMS for encryption at rest.

## Agent installation & service
- Installer: NSIS or Wix to produce MSI/EXE. Installer will:
  - Install signed Electron exe to `C:\Program Files\RemoteAdmin\`
  - Create Windows Service (sc or nssm) to run agent at startup (service account: LocalSystem or specified service account; prefer local non‑privileged account).
  - Register tray autostart for interactive sessions.
  - Create registry keys and place `whitelist.json` in `%PROGRAMDATA%\RemoteAdmin\config\`.
- Consent: Agent requires explicit consent on first install (GUI) and shows tray notification when streaming/connected.

## Secure updates
- Use electron‑updater with HTTPS update server. Updates must be code‑signed and signature verified before apply.

## Policies & Audit
- All operator actions recorded with timestamp, operator id, agent id, action details.
- Session recordings and logs retained per policy (configurable).
- Admins can request export for SIEM ingestion.

## Deployment (PoC)
- Single VM with Node.js (16+), mediasoup (compatible native build), Redis (optional), storage (local disk).
- Use systemd service or Windows service wrapper for server process depending on host OS.

## Next steps / open decisions
- Confirm service account credentials for LDAP and AD group names (will be provided by operator).
- Decide storage retention policy (days) and whether to use S3 for recordings.
- Obtain code signing certificate (or provide test cert for development).

## Files & locations
- `server/mediasoup.js` — mediasoup worker & recording glue
- `agent-electron/` — Electron agent source (main, renderer, preload)
- `auth/ldap.js` — LDAP auth adapter
- `config/` — certs, ldap.json, policies
- `storage/records/`, `logs/`

