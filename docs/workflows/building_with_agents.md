# Workflow: building with AI agents

How large features in this repo are built with Claude Code.

## Rules
- **At most 2 helper subagents running at the same time.** Queue further work until one finishes.
- **Plan with Fable, build with Opus.** Big features get a Fable plan first (saved under `docs/`), then the main
  session implements the risky core (backend contracts, shared types) and hands self-contained UI work to Opus
  helpers.
- **Contracts before helpers.** Backend endpoints, `frontend/src/lib/types.ts` and `frontend/src/lib/api.ts` are
  written and type-checked *before* helpers start, so helpers build against a fixed API.
- **Clear file ownership.** Each helper gets an explicit list of files and folders it may edit. Shared foundation
  files (`lib/*`, `components/glass|charts|shell/*`, `design/*`) are edited only by the main session.
- **Shared brief.** Helpers read a brief describing the design system, foundation components and rules (kept in the
  session scratchpad).
- **Isolated test servers.** Helpers run private backends on their own ports with `MLP_DATA_DIR=<scratch dir>` and
  private Vite dev servers. They never write to `frontend/dist` or the real `data/` folder, and kill their servers
  when done.
- **Verify centrally.** After helpers report, the main session runs `tsc`, the build, the smoke tests, the lesson
  validator, the process-isolation test and a headless-browser pass, then commits.
- **Checkpoint.** `docs/PROGRESS.md` is updated after each milestone so a new session can resume after a usage limit.
- **Usage limits.** If a helper stops on a usage limit, check `git status` for partial edits, then *resume* the same
  helper (it keeps the context it has read) instead of starting a new one. Still never more than 2 at a time.
