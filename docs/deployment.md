Deployment guide (hardened)

1. Server prerequisites
   - Ubuntu 22.04 / Windows Server with Node.js 16+, build tools (for mediasoup), and ffmpeg (for recordings).
   - Open ports: 443 (HTTPS), UDP 40000-40100 (RTP), 3478 (TURN if used).

2. Certificates
   - Provision internal CA and generate server and agent certificates.
   - Place files under `config/certs/` and set `SERVER_CA_PATH` in `.env`.

3. Install
   - Copy project to server and run `npm ci`.
   - Configure `.env` (USE_LDAP=true, LDAP_* vars).
   - Start server: `npm run start:server` (consider systemd/service wrapper).

4. Agent packaging & deployment
   - Build with `agent-electron` via `npm --prefix agent-electron run dist` or `electron-builder`.
   - Sign installer and distribute via internal update channel or management tools (SCCM, Intune).

