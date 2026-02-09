Remote‑Admin PoC (consent-based) — Windows agent + self-hosted server

Overview
- Minimal PoC showing secure-ish screen streaming (periodic screenshots) and process listing/kill with policy whitelist.
- Designed for demonstration and testing only. NOT production-ready.

Quick start (Windows, PowerShell)
1. Copy environment example:
   cp .env.example .env
   # edit .env to set OPERATOR_PASSWORD / JWT_SECRET / AGENT_KEY
2. Install deps:
   npm install
3. Start server:
   npm run start:server
4. Start agent on target Windows host (must run with local consent flag):
   node agent.js --consent

Usage
- Open https://localhost:8443 in your operator browser.
- Login with operator password from .env, enter agent ID (hostname) and click Watch.
- Click "Request process list" to ask the agent for its running processes. The agent will respond and the operator can request kill for whitelisted process names.

Security notes (PoC)
- This PoC uses a self-signed certificate (generated automatically) and a simple JWT-based operator auth. Replace with proper certificates (mTLS), an identity provider (Keycloak/AD) and hardened deployment before any production use.
- Agent requires explicit --consent flag to run. In production, show a UAC prompt and visible tray indicator.
- Kill operations are validated against local whitelist.json on the agent.

Deployment (hardened)
- Follow `docs/design-specs.md` for architecture and certificate requirements.
- Steps (summary):
  1. Provision a server VM and install Node.js (16+).
  2. Place CA and server certs in `config/certs/` (see `.env.example`).
  3. Configure AD connection in `.env` (set USE_LDAP=true and LDAP_* vars).
  4. Install dependencies: `npm ci`
  5. Build and package agent with `agent-electron` using `electron-builder`.
  6. Sign the agent installer using `signtool` and deploy via installer.
  7. Start server: `npm run start:server`

Operator guide
- See `docs/operator-guide.md` for step-by-step operator instructions.

Developer notes
- Many components are skeletons for PoC. See `docs/` for implementation notes and next steps.

