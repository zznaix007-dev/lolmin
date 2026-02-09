Installer & Service notes

- Use `electron-builder` to produce a signed installer or NSIS package.
- Template NSIS script provided: `NSIS_template.nsi`. Edit `OutFile` and paths.
- Windows service:
  - For production, prefer `nssm` to wrap the exe and handle restarts.
  - Example PowerShell script `install-service.ps1` shows how to create a service using `sc.exe`.
- UAC:
  - Installer must request admin privileges. NSIS `RequestExecutionLevel admin` is set in template.

