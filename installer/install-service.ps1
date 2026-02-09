Param(
  [string]$installPath = "C:\\Program Files\\RemoteAdmin"
)

# Example PowerShell script to install agent as Windows service using sc.exe
$exe = Join-Path $installPath "RemoteAdmin.exe"
if (-Not (Test-Path $exe)) {
  Write-Error "Agent executable not found at $exe"
  exit 1
}

$svcName = "RemoteAdmin"
sc.exe create $svcName binPath= "\"$exe\"" start= auto DisplayName= "RemoteAdmin Agent"
sc.exe description $svcName "Remote support agent (consent-based)"
Write-Host "Service $svcName created. Start it with: sc.exe start $svcName"

