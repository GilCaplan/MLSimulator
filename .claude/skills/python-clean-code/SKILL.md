---
name: python-clean-code
description: House clean-code standard for Python services and scripts (FastAPI, SQLAlchemy/ORM, pandas, MongoDB, threading). Use when writing, refactoring or reviewing Python code - layering (api / logic / db / handlers / errors / logs / const), where try/except and logs belong, constants and settings, ORM over raw SQL, return types, naming and tests. Also use when asked to "clean up", "refactor", or "review" Python code against these conventions.
---

# Python clean code

These rules come from real code review on a series of exercises (clean code, web scraping, threading, MongoDB, and a FastAPI + Postgres "air quality" service). Each rule names the problem the reviewer flagged, so you can tell when it applies.

When **writing** code, follow the rules. When **reviewing**, go through the checklist at the end and point to `file:line` for each finding. A comment often applies in more than one place, so fix every occurrence, not only the line that was flagged.

For before/after code from the actual refactor, see [examples.md](examples.md).

---

## 1. Layering: each file has one job

Split a service into modules by responsibility. Don't mix two responsibilities in one function.

| Module | Holds | Must not hold |
|---|---|---|
| `api.py` | Routes only. Each route is a one-line call into `logic`. | try/except, logging, validation, queries |
| `logic.py` | One function per endpoint: validate → compute → log → return | HTTP status codes, raw SQL |
| `<domain>_processing.py` | A multi-step pipeline (e.g. reading, cleaning and enriching a CSV) | Route or DB code |
| `handlers.py` | Middleware and exception handlers that turn errors into HTTP responses | Business logic |
| `errors.py` | The app's own exception classes (`ValidationError`, `NotFoundError`) | Anything else |
| `logs.py` | `setup_logging()`, the request access log, and multi-line log helpers | Business logic |
| `const.py` | `Settings` plus grouped constant classes | Functions with logic |
| `utils.py` | Small reusable helpers (validation, formatting) | Endpoint flows |
| `db/models.py`, `db/queries.py`, `db/connection.py` | ORM models, query functions, engine/session | HTTP or logging concerns |

- A route is thin enough that it reads as a table of contents:
  ```python
  @app.get("/aqi/average")
  def get_city_aqi_average(city: str):
      return logic.get_city_aqi_average(city)
  ```
- Keep logic and presentation (UI, printing, formatting for display) in separate functions.
- Move one-time setup into an init function (`setup_logging()`, `register_handlers(app)`, `create_buttons()`) instead of inlining it at module level or in a constructor.

## 2. Errors: raise in the code, handle in one place

- **No try/except in routes or logic.** Raise a domain exception with a message the user can read, and let one central handler pick the status code:
  - `ValidationError` → 400, `NotFoundError` → 404
  - DB `OperationalError` → 503 ("try again later"), any other `SQLAlchemyError` → 500
  - Any other unhandled exception → middleware logs it with its traceback and returns a clean 500
- Register all handlers in one function (`register_handlers(app)`) called from `api.py`.
- The only `try` that's allowed in lower layers is a **narrow** one that turns a library error into a domain error, using `raise ... from error`:
  ```python
  try:
      df = pd.read_csv(file.file)
  except (pd.errors.ParserError, UnicodeDecodeError) as error:
      raise ValidationError(f"Could not parse {filename} as CSV ({error})") from error
  ```
- Delete error handling that does nothing useful (catch-and-reraise, catching errors that can't happen). Less handling, in the right place, is cleaner.
- Error messages say what was wrong **and** the value involved, e.g. `f"No data for these dates. The data covers {first} to {last}"`.

## 3. Logging

- Never use `print`. Use `logger = logging.getLogger(__name__)` in every module and configure logging once in `setup_logging()`.
- **Do the logic first, then log**, as one block at the end of the function. Don't interleave log lines with computation steps.
  ```python
  def get_alerts_by_city(city: str) -> list[dict]:
      city = validate_city(city)
      alerts = fetch_rows(Alert, city=city, sort=Alert.date)

      logger.info(f"Found {len(alerts)} alerts for {city}")
      return alerts
  ```
- No logging in `api.py`. Requests are logged by the middleware; errors are logged by the handler that turns them into a response.
- Log every error with context, at the right level: ERROR for 5xx, WARNING for 4xx and rejected input, INFO for normal results.
- Prefer library helpers over hand-written boundary comparisons, e.g. `HTTPStatus(code).is_server_error` instead of `code >= 500`. If you do compare, check whether the bound should be `>` or `>=`.
- If logging needs a loop or formatting (e.g. one line per skipped CSV row), move it into a named helper in `logs.py` (`log_duplicates(...)`) so the logic function stays readable.

## 4. Constants, settings and environment

- **No magic numbers or strings** in logic. `5` becomes `END_OF_WEEK`, `300` becomes `AqiConsts.ALERT_THRESHOLD`, and table and column names come from the ORM models.
- Put constants in `const.py`, grouped into classes by concern, with specific names:
  ```python
  class Settings(BaseSettings):   # ONLY values loaded from the environment / .env
      model_config = SettingsConfigDict(env_file=SETUP_DIR / ".env", extra="ignore")
      host: str
      port: int
      database_url: str

  class Validation:               # input validation rules
      CSV_EXTENSION = ".csv"
      CITY_NAME_REGEX = re.compile(r"^[^\W\d_]+(?:[ '-][^\W\d_]+)*$")

  class AqiConsts:                # domain constants: name the domain, not "Consts2"
      ALERT_THRESHOLD = 300
      BEST_CITIES_COUNT = 3
  ```
- `Settings` holds only what comes from the environment. A value that isn't loaded from env belongs in a plain constants class, not in `BaseSettings`.
- Connection strings, hosts, ports, credentials and log paths go in `.env`, never in code. Don't give required settings defaults that hide a missing variable.
- Compile regexes once, in the constant.

## 5. Shared resources: env + singleton

- Clients for external resources (Mongo client, DB engine, server) are created once and reused: a module-level engine plus a `get_session()` function, or a singleton class built from env settings.
- No global mutable state. Pass objects into functions instead.

## 6. Database access

- **Use an ORM** (SQLAlchemy models) instead of SQL strings and table/column name constants. The model is the single source of truth: `Reading.date`, `Reading.city.key`, `Alert.__tablename__`.
- One generic query function with optional filters (`fetch_rows(table, columns, city, start_date, end_date, sort)`) is better than near-duplicate queries. Build the WHERE conditions in a helper (`build_filters`).
- Let the database do aggregation: `func.avg(...).group_by(...)`, not fetching all rows and averaging in Python (and never one query per city in a loop).
- Write related rows (readings + their alerts) in one transaction. Use `ON CONFLICT DO NOTHING ... RETURNING` to detect duplicates, and chunk large inserts.
- Know how your query engine runs what you write (e.g. where a Mongo `$match` stage sits in a pipeline and whether it can use an index). Read the docs instead of guessing.

## 7. Functions

- **Consistent return types.** A function never returns "a dict or None": return `{}` or `[]` for "nothing".
- Type-hint every parameter and the return value.
- The name says what the function **does**: `add_song`, not `add_song_button`. Use verbs for actions and nouns for values.
- Replace long if/elif chains that map a key to an action with a **dict of key → function**.
- Pull repeated or bulky blocks into a named function (`buttons = create_buttons()`).
- Docstrings are one or two lines on *what* and *why*, not a repeat of the signature or the spec. Every module starts with a one-line docstring describing its role.
- Comments explain decisions that aren't obvious (`# Postgres allows at most 65,535 values in one statement`), not what the code plainly does.

## 8. Tests

- Layout: `tests/__init__.py` (point the app at a test DB and test log *before* importing it), `tests/const.py` (test constants, must not import the app), `tests/utils.py` (client, upload helper, expected data), `tests/conftest.py` (fixtures), `tests/test_cases/test_<feature>.py`.
- Use a separate test database that's created per session and truncated before each test (autouse fixture). Assert that the app is actually using it.
- Compute expected values from the real sample inputs (and from the app's own constants) instead of hand-copying magic rows.
- Test names are sentences: `test_uploading_a_file_again_skips_its_rows_as_duplicates`.
- Cover the error paths too: 400, 404, 422, and 503 (by patching `get_session` to raise `OperationalError`).

## 9. Tooling

- Run `ruff check` and `ruff format` before every commit. Keep `ruff.toml` in the project root, set `line-length = 120`, select at least `E, W, F, I, UP, B`, and add a comment explaining every ignore or exclusion.
- Only use `# noqa: <code>` for a known false positive (e.g. FastAPI's `File(...)` defaults), never as a blanket suppression.

---

## Review checklist

Go through every item, and report each finding with a `file:line` and the rule number.

1. [ ] Routes are one-liners. No try/except or logging in `api.py`.
2. [ ] Logic, logging, error mapping, constants and DB code are each in their own module.
3. [ ] Errors are raised as domain exceptions and mapped to status codes in one place. Pointless try/except is removed.
4. [ ] Each function does its logic first and logs at the end. No `print`.
5. [ ] No magic numbers or strings. Constants are grouped into well-named classes. `Settings` holds env values only.
6. [ ] Secrets and connection details are in `.env`. Shared clients are singletons. No globals.
7. [ ] DB access uses ORM models. Aggregation is done in SQL. No N+1 loops.
8. [ ] Return types are consistent (`{}`/`[]`, never `None`), and every function is type-hinted.
9. [ ] Names say what the code does. If/elif dispatch chains are dicts. UI is separate from logic.
10. [ ] Boundaries (`>` vs `>=`) and library semantics have been checked.
11. [ ] Tests use a separate DB, shared helpers and data-driven expectations, and cover the error paths.
12. [ ] Ruff check and format pass.
