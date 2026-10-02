# Workflow: release checklist

1. Run every check in [CONTRIBUTING.md](../../CONTRIBUTING.md#checks-before-a-pull-request).
2. Do a browser pass in light and dark themes: home → a template → every wizard step → train → save → library
   playground → one lesson challenge (fail, then pass) → settings port switch.
3. Rebuild the launcher with `zsh launcher/build_app.sh` and test a cold start, a second launch (reuse) and a stale
   `server.json`.
4. Update the version in `mlp/config.py` and `frontend/package.json`, and add notes to `docs/PROGRESS.md`.
5. Tag and push: `git tag vX.Y.Z && git push --tags`.
