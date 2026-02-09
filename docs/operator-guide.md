Operator guide (PoC)

1. Login
   - Open https://<server>/
   - Enter AD username and password (if USE_LDAP=true) or operator password from `.env`.

2. Watch an agent
   - Enter the agent ID (hostname) and click Watch.
   - Live screen frames should appear (PoC uses periodic JPEG frames; hardened version uses WebRTC).

3. Processes
   - Click \"Request process list\" to query running processes.
   - For whitelisted processes, a \"Kill (request)\" button is available — operator roles required.

4. Audit & recordings
   - All operator actions are logged in `logs/actions.log`.
   - Recordings stored under `storage/records/` (PoC: metadata files).

5. Troubleshooting
   - Check server logs (`logs/actions.log`) and server console.
   - Verify certificates and mTLS if connection fails.

