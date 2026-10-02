# Workflow: release checklist

1. Run every check in [CONTRIBUTING.md](../../CONTRIBUTING.md#checks-before-a-pull-request).
2. Do a browser pass in light and dark themes: home → a template → every wizard step → train → save → library
   playground → one lesson challenge (fail, then pass) → settings port switch.
3. Rebuild the launchers (`zsh launcher/build_app.sh` on macOS, `bash launcher/install_linux.sh` on Linux, `scripts\setup.ps1` on Windows; CI's *platforms* job installs, launches and trains on all three) and test a cold start, a second launch (reuse) and a stale
   `server.json`.
4. Update the version in `mlp/config.py` and `frontend/package.json`, and add notes to `docs/PROGRESS.md`.
5. Tag and push: `git tag vX.Y.Z && git push --tags`.
