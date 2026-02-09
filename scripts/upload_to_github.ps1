Param()

# Upload repository files to GitHub using Personal Access Token in $env:GITHUB_TOKEN
if (-not $env:GITHUB_TOKEN) {
  Write-Error "GITHUB_TOKEN environment variable is not set."
  exit 1
}
$token = $env:GITHUB_TOKEN
$owner = 'zznaix007'
$repo = 'lolmin'
$headers = @{ Authorization = "token $token"; 'User-Agent' = 'upload-script' }

Write-Host "Creating repository $owner/$repo ..."
try {
  $body = @{ name = $repo; private = $false; description = 'Remote-admin PoC and hardened skeleton' } | ConvertTo-Json
  $resp = Invoke-RestMethod -Method Post -Uri https://api.github.com/user/repos -Headers $headers -Body $body -ContentType 'application/json'
  Write-Host "Repository created."
} catch {
  Write-Warning "Could not create repo (it may already exist): $_"
}

$root = 'C:\Users\CS\lolrat'
$pattern = 'node_modules|\\dist\\|\\storage\\|\\logs|\\.git|agent-electron\\dist|operator-electron\\dist'
$files = Get-ChildItem -Path $root -Recurse -File | Where-Object { $_.FullName -notmatch $pattern }

Write-Host "Found $($files.Count) files to upload."

foreach ($f in $files) {
  $full = $f.FullName
  $rel = $full.Substring($root.Length+1) -replace '\\','/'
  Write-Host "Uploading $rel ..."
  try {
    $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($full))
    $payload = @{ message = \"Add $rel\"; content = $content } | ConvertTo-Json
    $url = \"https://api.github.com/repos/$owner/$repo/contents/$rel\"
    Invoke-RestMethod -Method Put -Uri $url -Headers $headers -Body $payload -ContentType 'application/json'
    Write-Host "Uploaded: $rel"
  } catch {
    Write-Warning \"Failed to upload $rel : $_\"
  }
}

Write-Host "Upload complete."

