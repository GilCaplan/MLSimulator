---
name: python-clean-code
description: House clean-code standard for Python - services (FastAPI, SQLAlchemy/ORM), scripts, GUIs (tkinter), scrapers (async Playwright), threaded jobs, pandas and MongoDB. Use when writing, refactoring or reviewing Python code - layering, where try/except and logs belong, constants, settings and .env, singletons, ORM over raw SQL, concurrency, return types, naming, imports and tests. Also use when asked to "clean up", "refactor" or "review" Python code against these conventions.
---

# Python clean code

These rules come from real code review on six exercises: refactoring a tkinter MP3 player, an async web scraper, a threaded stock/crypto job, MongoDB queries, and a FastAPI + Postgres "air quality" service. Each rule names the problem the reviewer flagged, so you can tell when it applies.

When **writing** code, follow the rules. When **reviewing**, go through the checklist at the end and point to `file:line` for each finding. A comment often applies in more than one place, so fix every occurrence, not only the line that was flagged.

For before/after code from the actual refactors, see [examples.md](examples.md).

---

## 1. Structure: each file and function has one job

Split by responsibility. Don't mix two responsibilities in one function, especially **logic with presentation** (UI widgets, printing, HTTP responses).

**Services** use this module layout:

| Module | Holds | Must not hold |
|---|---|---|
| `api.py` | Routes only. Each route is a one-line call into `logic` | try/except, logging, validation, queries |
| `logic.py` | One function per endpoint: validate → compute → log → return | HTTP status codes, raw SQL |
| `<domain>_processing.py` | A multi-step pipeline (e.g. reading, cleaning and enriching a CSV) | Route or DB code |
| `handlers.py` | Middleware and exception handlers that turn errors into responses | Business logic |
| `errors.py` | The app's own exception classes (`ValidationError`, `NotFoundError`) | Anything else |
| `logs.py` | `setup_logging()`, the access log, and multi-line log helpers | Business logic |
| `const.py` | `Settings` and grouped constant classes | Functions with logic |
| `utils.py` | Small reusable helpers (validation, file/CSV handling) | Endpoint flows |
| `db/models.py`, `db/queries.py`, `db/connection.py` | ORM models, query functions, engine/session | HTTP or logging concerns |

**Scripts** follow the same idea at a smaller scale: put the main flow in the script, helpers (CSV writing, fetching) in `utils.py`, and constants in `const.py`, with the values that change in `.env`.

**GUIs** use one class for the model/logic (`MusicPlayer`: playlist, play, pause, next) and one for the view (`PlayerWindow(tk.Frame)`: widgets and layout). The view calls the model; the model never builds widgets.

- Replace global variables with state on objects you pass around.
- A route, or any top-level flow, should read like a table of contents:
  ```python
  @app.get("/aqi/average")
  def get_city_aqi_average(city: str):
      return logic.get_city_aqi_average(city)
  ```

## 2. Entry points and setup

- **No work at import time.** Reading input files, creating folders, connecting to a DB and starting a loop all belong in functions, never at module level.
- Every script ends with:
  ```python
  def main() -> None:
      app = init_app()
      run(app)

  if __name__ == "__main__":
      main()
  ```
- Collect one-time setup in a named init function: `init_app()`, `setup_logging()`, `register_handlers(app)`, `init_csv()`, `create_buttons()`.
- Build paths from the file's own location, `BASE_DIR = Path(__file__).parent`, never from an absolute path on your own machine. Use `pathlib` (`BASE_DIR / "output"`), not f-strings on paths.

## 3. Errors: specific, raised in the code, handled in one place

- **Never use bare `except:` or `except: pass`.** Catch the specific exception you expect, and either recover with a real fallback or turn it into a domain error:
  ```python
  def read_tags(path: Path) -> tuple[str, str]:
      try:
          song = EasyID3(path)
          return song["title"][0], song["artist"][0]
      except (MutagenError, KeyError):
          return path.name, "Unknown artist"
  ```
- Delete error handling that does nothing useful, such as catching errors that can't happen or wrapping every function "just in case". Less handling, in the right place, is cleaner.
- **In services, don't put try/except in routes or logic.** Raise a domain exception and let one central handler pick the status code:
  - `ValidationError` → 400, `NotFoundError` → 404
  - DB `OperationalError` → 503 ("try again later"), any other `SQLAlchemyError` → 500
  - Any other unhandled exception → middleware logs it with its traceback and returns a clean 500
- A lower layer may only use a **narrow** `try` that turns a library error into a domain error, with `raise ... from error`.
- Use guard clauses for expected empty states (`if not self.playlist: return`) instead of letting an error happen and catching it.
- Error messages say what was wrong **and** the value involved, e.g. `f"No data for these dates. The data covers {first} to {last}"`.

## 4. Logging

- **Never use `print`** for diagnostics. Use `logger = logging.getLogger(__name__)` in every module and configure logging once at the entry point (`setup_logging()` or `logging.basicConfig` under `__main__`). Printing a script's actual *output* in `main()` is fine.
- **Do the logic first, then log**, as one block at the end of the function. Don't interleave log lines with computation steps.
  ```python
  def get_alerts_by_city(city: str) -> list[dict]:
      city = validate_city(city)
      alerts = fetch_rows(Alert, city=city, sort=Alert.date)

      logger.info(f"Found {len(alerts)} alerts for {city}")
      return alerts
  ```
- Every error gets a log line with context, at the right level: ERROR for failures and 5xx, WARNING for retries, skipped rows and 4xx, INFO for normal results, DEBUG for per-item noise.
- In services, `api.py` never logs. The middleware logs requests, and the handler that builds the response logs the error.
- Useful run logs say what was done, how much, and how long: `"%s: done in %.1fs, %d rows (%d without data)"`. In threaded code, add `[%(threadName)s]` to the log format.
- Pick one formatting style per project, either f-strings or `%`-style lazy arguments, and stick to it.
- If logging needs a loop or formatting (e.g. one line per skipped CSV row), move it into a named helper (`log_duplicates(...)`).
- Prefer library helpers over hand-written boundary comparisons, e.g. `HTTPStatus(code).is_server_error` instead of `code >= 500`. If you do compare, check whether the bound should be `>` or `>=`.

## 5. Constants, settings and `.env`

- **No magic numbers or strings** in logic: `5` becomes `END_OF_WEEK`, `300` becomes `AqiConsts.ALERT_THRESHOLD`, `"AntiqueWhite1"` becomes `BUTTON_BG`, `timeout=100000` becomes `PAGE_LOAD_TIMEOUT_MS`. Table and column names come from the ORM models.
- Put constants in `const.py`, not at the top of the logic file. In larger projects, group them into classes by concern and give each class a specific name:
  ```python
  class Settings(BaseSettings):   # ONLY values loaded from the environment / .env
      model_config = SettingsConfigDict(env_file=SETUP_DIR / ".env", extra="ignore")
      host: str
      port: int
      database_url: str

  class Validation:               # input validation rules
      CSV_EXTENSION = ".csv"
      CITY_NAME_REGEX = re.compile(r"^[^\W\d_]+(?:[ '-][^\W\d_]+)*$")

  class AqiConsts:                # name the domain, not "Consts2"
      ALERT_THRESHOLD = 300
  ```
- `Settings` (or the `os.environ[...]` reads) holds only what comes from the environment. Anything not loaded from env belongs in a plain constants class.
- Connection strings, DB and collection names, hosts, ports, input and output file paths go in `.env`, never in code. Load the file by explicit path (`load_dotenv(BASE_DIR / ".env")`). Read required values with `os.environ["X"]` or a field with no default, so a missing value fails loudly.
- Compile regexes once, in the constant.

## 6. Shared resources: env + singleton

- Create each client for an external resource (Mongo client, DB engine, HTTP session, server) **once** from env settings, and reuse it:
  ```python
  @cache
  def get_client() -> MongoClient:
      client = MongoClient(MONGO_URI)
      client.admin.command("ping")   # fail fast if it's unreachable
      return client
  ```
  A module-level engine with a `get_session()` function, or a class with `__new__` returning one instance, both work too.
- If the resource can't be reached, log a clear error at startup and stop. Don't fail later with a cryptic traceback.

## 7. Data access

- **Use an ORM** (SQLAlchemy models) instead of SQL strings and table/column constants. The model is the single source of truth: `Reading.date`, `Reading.city.key`, `Alert.__tablename__`.
- Prefer one generic query function with optional filters (`fetch_rows(table, columns, city, start_date, end_date, sort)`) over near-duplicate queries. Build the WHERE conditions in a helper.
- Let the database do aggregation: `func.avg(...).group_by(...)` or a Mongo `$group`, not fetching rows and computing in Python. Never run one query per item in a loop.
- Write related rows in one transaction. Use `ON CONFLICT DO NOTHING ... RETURNING` to detect duplicates, and chunk large inserts.
- Know how your engine runs a query: put a Mongo `$match` early in the pipeline so it can use an index and cut documents before `$unwind`/`$group`. Read the docs instead of guessing.
- Pandas: work on whole columns at once, use `errors="coerce"` and then split valid from invalid rows, and keep CSV reading and writing in its own helper module.

## 8. Concurrency

- Run I/O-bound work concurrently. Use `asyncio.gather` for async APIs (Playwright) and `ThreadPoolExecutor.map` for blocking ones (yfinance). Don't use a sequential `for` loop of awaits.
- **Cap concurrency** with an `asyncio.Semaphore(MAX_OPEN_PAGES)` or a pool size constant, so the code still works with *n* inputs.
- Put one unit of work in its own function (`scrape_url(browser, semaphore, i, url)`) and fan out over it.
- Run blocking file I/O inside async code with `asyncio.to_thread`.
- Always release resources in `finally` (`await page.close()`), or with a context manager.
- Retry external calls on transient errors only, with exponential backoff (`RETRY_DELAY_SECONDS * 2**attempt`) up to `MAX_RETRIES`. Log each retry and the final give-up.

## 9. Functions and naming

- **Consistent return types.** A function never returns "a dict or None": return `{}` or `[]` for "nothing".
- Type-hint every parameter and the return value.
- Names say what the code **does** or **holds**: `add_songs`, not `add_song_button`; `playlist`, not `list1`; `toggle_pause`, not `button3`; `is_paused`, not `pausing`. Use verbs for actions, nouns for values, and `is_`/`has_` for booleans.
- Replace if/elif chains or repeated blocks that map a key to an action with **data plus a loop**, such as a dict of key → function or a tuple of `(label, action)`:
  ```python
  actions = (("PLAY SONG", player.play_song), ("NEXT SONG", player.next_song))
  return [tk.Button(self, text=text, command=action, bg=BUTTON_BG) for text, action in actions]
  ```
- Pull bulky or repeated blocks into a named function (`buttons = self._create_buttons()`).
- Use f-strings, not `+` concatenation or `str()` chains.
- Docstrings are one or two lines on *what* and *why*, not a copy of the spec or the signature. Every module starts with a one-line docstring describing its role.
- Comments explain decisions that aren't obvious (`# Postgres allows at most 65,535 values in one statement`), not what the code plainly says. Don't use ASCII-art separators (`#######`).

## 10. Imports

- No star imports (`from tkinter import *`, `from const import *`, `from pymongo import *`). Import names explicitly, or import the module (`import tkinter as tk`, `from air_quality_api import logic`) so it's clear where each name comes from.
- Let ruff sort imports: standard library, then third-party, then local.

## 11. Tests

- Layout: `tests/__init__.py` (point the app at a test DB and test log *before* importing it), `tests/const.py` (test constants, must not import the app), `tests/utils.py` (client, upload helper, expected data), `tests/conftest.py` (fixtures), `tests/test_cases/test_<feature>.py`.
- Use a separate test database, created per session and truncated before each test (autouse fixture). Assert that the app is actually using it.
- Compute expected values from the real sample inputs and the app's own constants, instead of hand-copying magic rows.
- Test names are sentences: `test_uploading_a_file_again_skips_its_rows_as_duplicates`.
- Cover the error paths too: 400, 404, 422, and 503 (by patching `get_session` to raise `OperationalError`).

## 12. Tooling

- Run `ruff check` and `ruff format` (or Black) before every commit. Keep `ruff.toml` in the project root, set `line-length = 120`, select at least `E, W, F, I, UP, B`, and add a comment explaining every ignore or exclusion.
- Only use `# noqa: <code>` for a known false positive (e.g. FastAPI's `File(...)` defaults), never as a blanket suppression.

---

## Review checklist

Go through every item, and report each finding with a `file:line` and the rule number.

1. [ ] Each module and function has one job. Logic is separate from UI and HTTP. No globals.
2. [ ] Nothing runs at import time. There's a `main()` under `__main__`, setup is in init functions, and paths are built from `Path(__file__).parent`.
3. [ ] No bare `except`. Errors are specific, raised as domain errors, and mapped in one place. Pointless try/except is removed.
4. [ ] No `print` for diagnostics. Each function logs after its logic, at the right level, and every error is logged.
5. [ ] No magic numbers or strings. Constants are in `const.py`. Env-driven values are in `.env` and fail loudly if they're missing.
6. [ ] Each external client is created once (singleton or `@cache`) and checks it's reachable at startup.
7. [ ] DB access uses the ORM or proper pipelines. Aggregation happens in the DB. No N+1 loops. `$match` comes early.
8. [ ] I/O runs concurrently with a cap, retries use backoff, and resources are released in `finally`.
9. [ ] Return types are consistent (`{}`/`[]`, never `None`), every function is type-hinted, names are descriptive, dispatch uses data, and strings are f-strings.
10. [ ] No star imports, and imports are sorted.
11. [ ] Boundaries (`>` vs `>=`) and library semantics have been checked.
12. [ ] Tests use a separate DB, shared helpers and data-driven expectations, and cover the error paths.
13. [ ] Ruff check and format pass.
