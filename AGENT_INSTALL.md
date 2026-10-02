# Installing ML Playground: instructions for AI agents

This file is for an AI agent (Claude Code, Codex, Cursor, Copilot, etc.) that a user has asked to install ML Playground
(repository `GilCaplan/MLSimulator`) on their computer. Every step is non-interactive and can be checked.
Humans can follow it too, but the README has friendlier instructions.

## What you are installing
- A local web app: a Python (FastAPI + PyTorch + scikit-learn) server on `127.0.0.1` (ports 8765–8800) and a
  prebuilt React interface served by that server. It is not reachable from other computers.
- Everything lives in one folder, by default `~/MLSimulator` (Windows: `%USERPROFILE%\MLSimulator`):
  - `.venv/`: the Python environment.
  - `.tools/`: private copies of uv/Python and Node.js, downloaded only if the system lacks suitable versions.
  - `data/`: the user's projects, created on first run.
- Setup adds launchers: macOS gets an app icon (Desktop, `~/Applications`, project folder); Linux gets a `.desktop` entry
  (applications menu, Desktop, project folder); Windows gets shortcuts (Desktop, Start menu, project folder).

## Ground rules
1. **No sudo/administrator rights are needed.** Do not install system packages, change shell profiles or modify
   PATH permanently unless the user explicitly asks you to. Missing Python or Node.js are handled by the setup script
   inside the project folder.
2. **Defaults are fine.** Ask the user only if they mention a preference: install location (`--dir` / `MLP_DIR`) or
   no desktop icons (`--no-shortcuts` / `MLP_NO_SHORTCUTS=1`).
3. **Allow long timeouts.** The first install downloads PyTorch (about 200 MB CPU-only on Linux without an NVIDIA GPU;
   up to about 2 GB with CUDA; about 100–300 MB on macOS and Windows) plus Python packages and Node modules. Allow at
   least **20 minutes** for the install command and stream its output; don't kill it while it is downloading.
4. **Needs internet access** to github.com, pypi.org, download.pytorch.org (Linux), astral.sh / github.com (uv, only if
   Python is missing) and nodejs.org (only if Node.js is missing). Behind a proxy, set `HTTPS_PROXY` first.
5. Use `--no-launch` during install (it would otherwise open a browser tab), then verify, then open the app for the user.

## Step 1: detect the OS
- `uname -s` prints `Darwin` (macOS) or `Linux` → use the **macOS / Linux** commands.
- On Windows, use **PowerShell** (`$env:OS` is `Windows_NT`). Don't use Git Bash or WSL for the Windows install
  (WSL counts as Linux and works, but the app then runs inside WSL).

## Step 2: install
### macOS / Linux
Requirements: `bash`, `curl`, `tar`. On a minimal Linux without curl, ask the user before running
`sudo apt-get install -y curl ca-certificates`.
```sh
curl -fsSL https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.sh | bash -s -- --no-launch
```
Options go after `bash -s --`:

| Option | Meaning |
|---|---|
| `--dir PATH` | Install folder (default `~/MLSimulator`). Also settable with `MLP_DIR=PATH`. |
| `--no-launch` | Don't open the app at the end. **Use this.** |
| `--no-shortcuts` | Don't create the app icon / desktop entry. |
| `--gpu` | Linux: keep the CUDA build of PyTorch even if `nvidia-smi` isn't found. |

If the repository is already cloned, run `bash scripts/setup.sh --no-launch` from the repository root instead (same
options except `--dir`). Setting `MLP_PRIVATE_TOOLS=1` ignores the system Python/Node.js and uses private copies.
Try it if the system toolchain is broken.

### Windows (PowerShell)
```powershell
$env:MLP_NO_LAUNCH = "1"; irm https://raw.githubusercontent.com/GilCaplan/MLSimulator/main/scripts/install.ps1 | iex
```
Environment variables (set them before the command, in the same session):

| Variable | Meaning |
|---|---|
| `MLP_DIR` | Install folder (default `%USERPROFILE%\MLSimulator`). |
| `MLP_NO_LAUNCH=1` | Don't open the app at the end. **Use this.** |
| `MLP_NO_SHORTCUTS=1` | Don't create Desktop / Start-menu shortcuts. |
| `MLP_PRIVATE_TOOLS=1` | Ignore system Python/Node.js and use private copies. |

If the execution policy blocks `iex`, run it as
`powershell -NoProfile -ExecutionPolicy Bypass -Command "<the command above>"`.
If the repository is already cloned, run `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -NoLaunch`
(`-NoShortcuts` is also available).

**Expected end of output (all OSes):** `==> ML Playground is installed in <folder>`. A non-zero exit code or a line
starting with `ERROR:` means it failed; see Troubleshooting.

## Step 3: verify (mandatory)
Run these from the install folder. Each must succeed.

macOS / Linux:
```sh
cd ~/MLSimulator
.venv/bin/python launcher/launch.py --no-browser   # starts the server in the background, prints http://localhost:<port>/
.venv/bin/python launcher/launch.py --status       # exit code 0 and "running: http://localhost:<port>/"
.venv/bin/python scripts/smoke_platform.py         # ~30 s; must end with "PLATFORM SMOKE OK"
```
Windows (PowerShell):
```powershell
cd $HOME\MLSimulator
.venv\Scripts\python launcher\launch.py --no-browser
.venv\Scripts\python launcher\launch.py --status
.venv\Scripts\python scripts\smoke_platform.py
```
The smoke test loads a sample dataset, trains a scikit-learn model and a PyTorch network in separate worker
processes, saves the model and predicts. It adds one small sample dataset and one saved model named "ci" to the
user's `data/` folder. Tell the user, or delete it in the app (Model Library → ci → Delete).

Leave the server running for the user, or stop it with `launch.py --stop`.

## Step 4: hand over to the user
Tell the user:
- The app is at the printed URL (usually <http://localhost:8765/>). Run `launch.py` without `--no-browser` to open it.
- From now on they can start it with the **ML Playground** icon: Desktop / Applications (macOS), the applications menu
  (Linux; on GNOME, right-click the Desktop icon → *Allow Launching* once) or the Start menu (Windows).
- Stop it with *Settings → Quit* in the app, or `launch.py --stop`.
- Update by running the same install command again. Their projects in `data/` are kept.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `ERROR: curl is required` | Ask the user to install curl (Debian/Ubuntu: `sudo apt-get install -y curl ca-certificates`). |
| uv / Node.js download fails (proxy, firewall) | Set `HTTPS_PROXY`, or ask the user to install Python 3.10+ (python.org) and Node.js 18+ (nodejs.org) and re-run. |
| `ERROR: … no portable build for …` | Unusual CPU/OS: ask the user to install Node.js 18+ from nodejs.org, then re-run. |
| Linux: portable Python/Node fail with `GLIBC` errors | Very old distribution: install `python3.11`/`nodejs` from the distribution or ask the user to upgrade. |
| `pip`/`uv` errors while installing packages | Re-run the same command (downloads resume). If it persists, delete `.venv` and re-run. Check free disk space (needs ~3 GB). |
| `npm` errors | Delete `frontend/node_modules` and re-run. |
| `launch.py --no-browser` says the server didn't start | Read `data/logs/server.log`, then `data/logs/launcher.log`. A Python traceback there usually means a broken `.venv`: delete it and re-run setup. |
| `No free port between 8765 and 8800` | Something else is using those ports. Stop old servers with `launch.py --stop`, or free a port. |
| Windows: firewall prompt | Allowing private-network access is fine; the server only listens on 127.0.0.1. |
| Windows: `irm … \| iex` blocked by policy | Use the `powershell -ExecutionPolicy Bypass -Command …` form above. |
| Smoke test fails with a PyTorch error | Run `.venv/bin/python -c "import torch; print(torch.__version__)"` (Windows: `.venv\Scripts\python …`). If that fails, delete `.venv` and re-run setup (Linux: try `--gpu` or not, depending on the machine). |

Clean reinstall: delete `.venv`, `.tools` and `frontend/node_modules` in the install folder and run setup again.
Keep `data/`, which holds the user's projects.

## Uninstall (only if asked)
Stop the server (`launch.py --stop`). Ask before deleting `data/`, which holds the user's projects; offer to back it up.
Then delete the install folder and the launchers:
- macOS: `~/Applications/ML Playground.app` and `~/Desktop/ML Playground.app`.
- Linux: `~/.local/share/applications/ml-playground.desktop` and `ml-playground.desktop` on the Desktop.
- Windows: `ML Playground.lnk` on the Desktop and in the Start menu (`%APPDATA%\Microsoft\Windows\Start Menu\Programs`).
Shared caches that other tools may also use are not removed: uv's Python downloads (`~/.local/share/uv`) and pip's cache.
