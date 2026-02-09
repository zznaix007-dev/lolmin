; NSIS installer template for RemoteAdmin Agent (edit before building)
Name "RemoteAdmin Agent"
OutFile "RemoteAdminAgentInstaller.exe"
InstallDir "$PROGRAMFILES\\RemoteAdmin"
RequestExecutionLevel admin

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "dist\\*"
  ; create config dir
  CreateDirectory "$PROGRAMDATA\\RemoteAdmin\\config"
  ; register service using sc.exe (alternative: nssm recommended)
  ; ExecWait 'sc create RemoteAdmin binPath= "$INSTDIR\\RemoteAdmin.exe" start= auto'
SectionEnd

