# One-line install for Windows (PowerShell; no administrator rights needed):
#
#   irm https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.ps1 | iex
#
# Options via environment variables (set them first in the same PowerShell window):
#   $env:MLP_DIR = "D:\Apps\MLSimulator"   # install folder (default: %USERPROFILE%\MLSimulator)
#   $env:MLP_NO_LAUNCH = "1"               # don't open the app at the end (for scripts / AI agents)
# Running it again updates an existing install (your projects in data\ are kept).
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo = "GilCaplan/MLSimulator"; $Branch = "main"
$Dir = if ($env:MLP_DIR) { $env:MLP_DIR } else { Join-Path $HOME "MLSimulator" }
function Say($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
$HasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)

if ((Test-Path (Join-Path $Dir ".git")) -and $HasGit) {
  Say "Updating $Dir..."
  git -C $Dir pull --ff-only
} elseif (-not (Test-Path $Dir) -and $HasGit) {
  Say "Downloading ML Playground into $Dir..."
  git clone --depth 1 -b $Branch "https://github.com/$Repo.git" $Dir
} else {
  Say "Downloading ML Playground into $Dir..."
  $zip = Join-Path $env:TEMP "MLSimulator.zip"
  $tmp = Join-Path $env:TEMP "MLSimulator-extract"
  Invoke-WebRequest "https://github.com/$Repo/archive/refs/heads/$Branch.zip" -OutFile $zip
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive $zip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force $Dir | Out-Null
  Copy-Item -Path (Join-Path (Get-ChildItem $tmp | Select-Object -First 1).FullName "*") -Destination $Dir -Recurse -Force
  Remove-Item -Recurse -Force $tmp, $zip
}
$setupArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $Dir "scripts\setup.ps1"))
if ($env:MLP_NO_LAUNCH -eq "1") { $setupArgs += "-NoLaunch" }
if ($env:MLP_NO_SHORTCUTS -eq "1") { $setupArgs += "-NoShortcuts" }
& powershell @setupArgs
exit $LASTEXITCODE
