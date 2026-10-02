# One-shot setup for Windows: Python environment, interface build, Desktop + Start-menu shortcuts.
#   Double-click scripts\setup.bat, or run:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
function Say($m) { Write-Host "`n$m" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)." } }

$Py = Join-Path $Root ".venv\Scripts\python.exe"
$PyW = Join-Path $Root ".venv\Scripts\pythonw.exe"

# 1. Python environment
if (-not (Test-Path $Py)) {
  Say "Creating the Python environment (a few minutes the first time)..."
  if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv venv --python 3.11 .venv; Check "uv venv"
    uv pip install --python $Py -r requirements.txt; Check "Installing packages"
  } else {
    if (Get-Command py -ErrorAction SilentlyContinue) { $PyExe = "py"; $PyArgs = @("-3") }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { $PyExe = "python"; $PyArgs = @() }
    else { throw "Python 3.10+ is required: https://www.python.org/downloads/ (tick 'Add python.exe to PATH')." }
    & $PyExe @PyArgs -c "import sys; sys.exit(sys.version_info < (3, 10))"
    if ($LASTEXITCODE -ne 0) { throw "Python 3.10+ is required." }
    & $PyExe @PyArgs -m venv .venv; Check "Creating the virtual environment"
    & $Py -m pip install --upgrade pip | Out-Null
    & $Py -m pip install -r requirements.txt; Check "Installing packages"
  }
}

# 2. Interface
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js 18+ is needed once to build the interface: https://nodejs.org" }
Say "Building the interface..."
Push-Location frontend
npm ci; if ($LASTEXITCODE -ne 0) { npm install; Check "npm install" }
npm run build; Check "Building the interface"
Pop-Location

# 3. Icon + shortcuts
& $Py -c "from PIL import Image; Image.open('launcher/icon.png').save('launcher/icon.ico', sizes=[(256,256),(64,64),(48,48),(32,32),(16,16)])"
$Shell = New-Object -ComObject WScript.Shell
$Targets = @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"), $Root)
foreach ($Dir in $Targets) {
  $Lnk = $Shell.CreateShortcut((Join-Path $Dir "ML Playground.lnk"))
  $Lnk.TargetPath = $PyW
  $Lnk.Arguments = "`"$Root\launcher\launch.py`""
  $Lnk.WorkingDirectory = $Root
  $Lnk.IconLocation = "$Root\launcher\icon.ico"
  $Lnk.Description = "Machine learning as a playground"
  $Lnk.Save()
}
Say "Done. Double-click 'ML Playground' on your Desktop or in the Start menu."
