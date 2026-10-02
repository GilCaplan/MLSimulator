# Setup for Windows: Python environment, interface build, Desktop + Start-menu shortcuts, then opens the app.
#
#   Double-click scripts\setup.bat   - or -   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 [-NoLaunch]
#
# If Python 3.10+ or Node.js 18+ are missing, private copies are downloaded into .tools\ inside the project
# (uv + a managed Python, portable Node.js). Nothing is installed system-wide and no administrator rights are needed.
#   -NoLaunch      don't open the app at the end (for scripts / AI agents)
#   -NoShortcuts   skip the Desktop / Start-menu shortcuts
# $env:MLP_PRIVATE_TOOLS = "1" ignores any system Python/Node.js and always uses the private copies in .tools\.
param([switch]$NoLaunch, [switch]$NoShortcuts)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # makes Invoke-WebRequest much faster
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Tools = Join-Path $Root ".tools"
$NodeVersion = "22.12.0"
$Private = $env:MLP_PRIVATE_TOOLS -eq "1"
if ($Private) { $env:Path = "$Tools\node;$Tools\uv;$Tools\uv\bin;$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0" }
else { $env:Path = "$Tools\node;$Tools\uv;$Tools\uv\bin;$env:USERPROFILE\.local\bin;$env:Path" }

function Say($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Die($m) { Write-Host "`nERROR: $m" -ForegroundColor Red; exit 1 }
function Check($what) { if ($LASTEXITCODE -ne 0) { Die "$what failed (exit code $LASTEXITCODE)." } }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Find-Python {
  if ($Private) { return $null }
  foreach ($c in @(@("py", "-3"), @("python"))) {
    if (Has $c[0]) {
      $rest = @($c | Select-Object -Skip 1)
      & $c[0] @rest -c "import sys, venv; sys.exit(sys.version_info < (3, 10))" 2>$null
      if ($LASTEXITCODE -eq 0) { return ,$c }
    }
  }
  return $null
}
function Node-Ok {
  if (-not ((Has node) -and (Has npm))) { return $false }
  & node -e "process.exit(Number(process.versions.node.split('.')[0]) < 18 ? 1 : 0)" 2>$null
  return ($LASTEXITCODE -eq 0)
}
function Get-Uv {
  if (Has uv) { return }
  Say "Downloading uv (a private Python installer) into .tools\uv..."
  $env:UV_INSTALL_DIR = "$Tools\uv"; $env:INSTALLER_NO_MODIFY_PATH = "1"
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression | Out-Null
  if (-not (Has uv)) { Die "Couldn't install uv. Install Python 3.10+ from https://www.python.org/downloads/ and run this again." }
}
function Get-Node {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  Say "Downloading a private copy of Node.js $NodeVersion into .tools\node (used once, to build the interface)..."
  $zip = Join-Path $env:TEMP "node-$NodeVersion.zip"
  Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-$arch.zip" -OutFile $zip
  if (Test-Path "$Tools\node") { Remove-Item -Recurse -Force "$Tools\node" }
  New-Item -ItemType Directory -Force $Tools | Out-Null
  Expand-Archive $zip -DestinationPath $Tools -Force
  Rename-Item (Join-Path $Tools "node-v$NodeVersion-win-$arch") "node"
  Remove-Item $zip
  if (-not (Node-Ok)) { Die "The downloaded Node.js doesn't run. Install Node.js 18+ from https://nodejs.org and run this again." }
}

$Py = Join-Path $Root ".venv\Scripts\python.exe"
$PyW = Join-Path $Root ".venv\Scripts\pythonw.exe"

# 1. Python environment ---------------------------------------------------------------------------------------------
$ready = $false
if (Test-Path $Py) { & $Py -c "import fastapi, sklearn, torch" 2>$null; $ready = ($LASTEXITCODE -eq 0) }
if (-not $ready) {
  Say "Creating the Python environment (a few minutes the first time - PyTorch is big)..."
  if (Test-Path .venv) { Remove-Item -Recurse -Force .venv }
  $base = Find-Python
  if ((Has uv) -or -not $base) {
    Get-Uv
    uv venv --quiet --python 3.11 .venv; Check "Creating the Python environment"
    uv pip install --quiet --python $Py -r requirements.txt; Check "Installing Python packages"
  } else {
    $rest = @($base | Select-Object -Skip 1)
    & $base[0] @rest -m venv .venv; Check "Creating the virtual environment"
    & $Py -m pip install --quiet --upgrade pip
    & $Py -m pip install --quiet -r requirements.txt; Check "Installing Python packages"
  }
}

# 2. Interface ------------------------------------------------------------------------------------------------------
if (-not (Node-Ok)) { Get-Node }
Say "Building the interface..."
Push-Location frontend
npm ci --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { npm install --no-audit --no-fund --loglevel=error; Check "Installing interface packages" }
npm run build --silent; Check "Building the interface"
Pop-Location
if (-not (Test-Path "frontend\dist\index.html")) { Die "The interface build didn't produce frontend\dist\index.html." }

# 3. Icon + shortcuts -----------------------------------------------------------------------------------------------
if ($NoShortcuts) { Write-Host "Skipping shortcuts (-NoShortcuts)." } else {
& $Py -c "from PIL import Image; Image.open('launcher/icon.png').save('launcher/icon.ico', sizes=[(256,256),(64,64),(48,48),(32,32),(16,16)])"
try {
  $Shell = New-Object -ComObject WScript.Shell
  foreach ($Dir in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"), $Root)) {
    if (-not $Dir) { continue }
    $Lnk = $Shell.CreateShortcut((Join-Path $Dir "ML Playground.lnk"))
    $Lnk.TargetPath = $PyW
    $Lnk.Arguments = "`"$Root\launcher\launch.py`""
    $Lnk.WorkingDirectory = $Root
    $Lnk.IconLocation = "$Root\launcher\icon.ico"
    $Lnk.Description = "Machine learning as a playground"
    $Lnk.Save()
  }
  Write-Host "Shortcuts: Desktop, Start menu and the project folder."
} catch { Write-Host "Couldn't create shortcuts ($_) - start the app with: .venv\Scripts\python launcher\launch.py" }
}

Say "ML Playground is installed in $Root"
Write-Host "Start it any time from the ML Playground shortcut, or with:  .venv\Scripts\python launcher\launch.py"
if (-not $NoLaunch) { & $Py launcher\launch.py }
