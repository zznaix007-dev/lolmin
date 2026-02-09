Code signing & auto-update (overview)

1. Code signing (Windows)
   - Obtain an EV or organization code signing certificate (PFX).
   - Use Microsoft's signtool to sign the built exe or installer:
     - signtool sign /fd SHA256 /a /f cert.pfx /p <password> RemoteAdminAgentInstaller.exe
   - Verify signature:
     - signtool verify /pa /v RemoteAdminAgentInstaller.exe

2. Electron auto-update
   - Use `electron-updater` + `electron-builder` with a secure HTTPS server hosting update files.
   - Configure `publish` in `package.json` build section or use a private S3 bucket with signed URLs.
   - Only apply updates if signature verification passes (electron-updater verifies signed packages if configured).

3. Ops notes
   - Protect code signing keys (HSM or secure storage).
   - Rotate signing certs and maintain a reproducible build pipeline.

