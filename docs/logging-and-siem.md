Logging and SIEM integration

1. Structured logging
   - Use Winston JSON format (already used in `server.js`).
   - Ensure logs are append-only and rotated. For production, use `winston-daily-rotate-file`.

2. Shipper
   - Use Filebeat (or Winlogbeat) to ship logs to Elastic/Graylog.
   - Example `filebeat.yml` included for reference.

3. Retention & access
   - Protect logs from tampering (append-only storage, restricted ACLs).
   - Configure retention policy (e.g., 90 days) depending on compliance.

