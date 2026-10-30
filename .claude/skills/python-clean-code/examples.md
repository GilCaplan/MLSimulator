# Before / after examples

These are from the exercises: each one's first commit vs the version after review.

## Globals + bare except → model/view classes, specific errors

**Before** (`clean_code/player.py`)
```python
from tkinter import *
global list1, pausing, list_index, SONG_END, text1, label1

def button1():
    global list_index, list1, SONG_END, pausing, label1, text1
    try:
        directory = askopenfilenames()
        for song_dir in directory:
            print(song_dir)
            list1.append(song_dir)
        ...
            song_data = (str(key + 1) + ' : ' + song['title'][0] + ' - ' + song['artist'][0])
    except:
        pass
#################################################################################
b1 = Button(self, text="PLAY SONG", command=button2, bg='AntiqueWhite1', width=40)
b2 = Button(self, text="PREVIOUS SONG", command=button4, bg='AntiqueWhite1', width=40)
...
while True:          # runs at import time
    check_music()
    app.update()
```

**After**
```python
import tkinter as tk

BUTTON_BG = "AntiqueWhite1"
BUTTON_WIDTH = 40

class MusicPlayer:                       # logic: no widgets
    def __init__(self):
        self.playlist = []
        self.is_paused = False
        self.current_index = 0

    def next_song(self):
        if not self.playlist:
            return
        self.current_index = self.next_index()
        self.play_song()

class PlayerWindow(tk.Frame):            # view: widgets and layout only
    def _create_buttons(self) -> list[tk.Button]:
        actions = (
            ("ADD TO LIST", self.add_songs),
            ("PLAY SONG", self.music_player.play_song),
            ("PAUSE/UNPAUSE", self.music_player.toggle_pause),
        )
        return [tk.Button(self, text=text, command=action, bg=BUTTON_BG, width=BUTTON_WIDTH)
                for text, action in actions]

    def refresh_song_list(self):
        for number, song_path in enumerate(self.music_player.playlist, start=1):
            title, artist = read_tags(song_path)
            self.music_player.song_list_box.insert(tk.END, f"{number} : {title}, {artist}\n")

def main():
    app = init_app()
    run(app)

if __name__ == "__main__":
    main()
```

## Sequential awaits + hardcoded path → bounded concurrency

**Before** (`web_scraping/browser.py`)
```python
PATH = "/Users/USER/Desktop/army/training_DE/Hafifa/web_scraping"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome")
        for i, url in enumerate(urls, start=1):
            page = await browser.new_page()
            ...  # one URL at a time
```

**After**
```python
PATH = Path(__file__).parent
MAX_OPEN_PAGES = 3

async def scrape_url(browser, semaphore, i, url):
    async with semaphore:  # waits here while MAX_OPEN_PAGES pages are already open
        page = await browser.new_page()
        try:
            ...
            await asyncio.to_thread(save_json, url_dir / "browse.json", page_data)
        except PlaywrightError as error:
            logger.warning(f"Failed to scrape {url}: {error.message.splitlines()[0]}")
        finally:
            await page.close()

async def main():
    semaphore = asyncio.Semaphore(MAX_OPEN_PAGES)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome")
        await asyncio.gather(*(scrape_url(browser, semaphore, i, url) for i, url in enumerate(urls, start=1)))
```

## Everything in one script → const + utils + logging + retries

**Before** (`threading_multiprocessing/...challenge.py`): constants, CSV helpers and logic in one file, silent retries, `print`, and a magic `5`.
```python
load_dotenv()
MAX_RETRIES = 3
...
        except YFRateLimitError:
            time.sleep(RETRY_DELAY_SECONDS * 2 ** attempt)
        except Exception as e:
            print(f"{ticker} {hour}: {e}")
...
    return hour.weekday() < 5 and MARKET_OPEN_HOUR <= hour.hour < MARKET_CLOSE_HOUR
...
    df = append_to_csv(rows)
    print(df.head(10))
```

**After**: `const.py` (with `load_dotenv(BASE_DIR / ".env")` and `END_OF_WEEK = 5`), `utils.py` (CSV and fetch helpers), and the main script.
```python
        except YFRateLimitError:
            delay = RETRY_DELAY_SECONDS * 2**attempt
            logger.warning("%s %s: rate limited, retry %d/%d in %ds", ticker, hour, attempt + 1, MAX_RETRIES, delay)
            time.sleep(delay)
    else:
        logger.error("%s %s: giving up after %d retries", ticker, hour, MAX_RETRIES)

    return hour.weekday() < END_OF_WEEK and MARKET_OPEN_HOUR <= hour.hour < MARKET_CLOSE_HOUR

    logger.info("%s: done in %.1fs, %d rows (%d without data)", ticker, elapsed, len(rows), missing)
```

## Hardcoded connection → env + singleton

**Before** (`mongodb/exercises.py`)
```python
def load_db():
    client = MongoClient("mongodb://localhost:27017")
    return client["hafifa"]["restaurants"]
```

**After**
```python
# consts.py
load_dotenv(BASE_DIR / ".env")
MONGO_URI = os.environ["MONGO_URI"]
DB_NAME = os.environ["DB_NAME"]
COLLECTION_NAME = os.environ["COLLECTION_NAME"]

# exercises.py
@cache
def get_client() -> MongoClient:
    client = MongoClient(MONGO_URI)
    client.admin.command("ping")
    return client

def main():
    try:
        db = load_db()
    except ServerSelectionTimeoutError as e:
        logger.error("Could not reach MongoDB: %s", e)
        return
```

---

The examples below are from the air-quality rolling exercise.

## Fat route → thin route + logic + central handlers

**Before** (`api.py`): validation, parsing, try/except, HTTP codes and logging all inside the route.
```python
@app.post("/air-quality/upload")
def upload_air_quality_data(file: UploadFile = File(...)):
    filename = file.filename
    logger.info(f"Received upload: {filename}")
    if not is_csv_file(filename):
        logger.error(f"Rejected {filename}: not a CSV file")
        raise HTTPException(status_code=400, detail=f"{filename} is not a CSV file")
    try:
        df = pd.read_csv(file.file)
    except pd.errors.EmptyDataError:
        ...
    try:
        duplicates, inserted_alerts = save_readings(valid_rows, alerts)
    except psycopg.OperationalError as error:
        logger.error(...)
        raise HTTPException(status_code=503, ...) from error
    ...  # ~80 lines
```

**After**
```python
# api.py
@app.post("/air-quality/upload")
def upload_air_quality_data(file: UploadFile = File(...)):  # noqa: B008
    return logic.upload_air_quality_data(file)

# csv_processing.py - raises a domain error, no HTTP knowledge
if not is_csv_file(filename):
    raise ValidationError(f"{filename} is not a CSV file")

# handlers.py - one place maps errors to responses and logs them
async def handle_database_unavailable(request: Request, error: OperationalError) -> JSONResponse:
    logger.error(f"Database unavailable on {request.method} {request.url.path}: {error}")
    return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        content={"detail": "Database is unavailable, try again later"})

def register_handlers(app: FastAPI) -> None:
    app.middleware("http")(handle_api_call)
    app.exception_handler(ValidationError)(handle_input_error)
    app.exception_handler(NotFoundError)(handle_input_error)
    app.exception_handler(OperationalError)(handle_database_unavailable)
    app.exception_handler(SQLAlchemyError)(handle_database_error)
```

## `None`-or-dict → always a dict; Python averaging → SQL

**Before**
```python
data = fetch_rows(READINGS_TABLE, columns, city)
aqi_values = [data_point[AQI_COLUMN] for data_point in data]
if not aqi_values:
    logger.info(f"0 readings from the city {city} fetched")
    return None
city_avg = sum(aqi_values) / len(aqi_values)
return {CITY_COLUMN: city, AVERAGE_AQI_KEY: round(city_avg, AVERAGE_AQI_DECIMALS)}

# and best cities called that once per city (N+1 queries)
city_aqi_averages = [get_city_aqi_average(city) for city in cities]
```

**After**
```python
def get_city_aqi_average(city: str) -> dict:
    city = validate_city(city)
    averages = get_average_aqi([city])
    average = format_average_to_dict(city, averages[city]) if city in averages else {}

    logger.info(f"Average AQI for {city}: {average.get(AqiConsts.AVERAGE_KEY)}")
    return average

# queries.py - one GROUP BY query for any number of cities
query = select(Reading.city, func.avg(Reading.aqi)).group_by(Reading.city)
```

## Flat constant soup → grouped classes + ORM as source of truth

**Before**
```python
READINGS_TABLE = "air_quality_readings"
DATE_COLUMN = "date"
CITY_COLUMN = "city"
ALERT_AQI_THRESHOLD = 300
AVERAGE_AQI_KEY = "average_aqi"

class Settings(BaseSettings):
    host: str = "127.0.0.1"   # defaults hide a missing .env
    port: int = 8010
```

**After**
```python
class Reading(Base):                 # db/models.py: table and column names live here
    __tablename__ = "air_quality_readings"
    date: Mapped[datetime.date]
    city: Mapped[str]

class Settings(BaseSettings):        # env only, no defaults
    host: str
    port: int

class AqiConsts:
    ALERT_THRESHOLD = 300
    AVERAGE_KEY = "average_aqi"

fetch_rows(Reading, start_date=start, end_date=end, sort=[Reading.date, Reading.city])
```

## Hand-written status bounds → library helper

**Before**
```python
if status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
    return logging.ERROR
if status_code >= status.HTTP_400_BAD_REQUEST:
    return logging.WARNING
```

**After**
```python
response_status = HTTPStatus(status_code)
if response_status.is_server_error:
    return logging.ERROR
if response_status.is_client_error:
    return logging.WARNING
```

## Hand-copied test rows → expectations derived from the sample files

**Before**
```python
EILAT_21 = ("2024-11-21", "Eilat", 350, 20, 4)
upload_rows(HAIFA_20, ARAD_20, EILAT_20)
assert len(alerts) == 1
```

**After**
```python
EXPECTED_ALERTS = [r for r in SAMPLE_READINGS if r[Reading.aqi.key] > AqiConsts.ALERT_THRESHOLD]

@pytest.mark.usefixtures("load_samples")
def test_uploading_twice_does_not_duplicate_alerts() -> None:
    for path in SAMPLE_FILES:
        upload(path.name, path.read_bytes())
    assert len(client.get("/alerts").json()) == len(EXPECTED_ALERTS)
```
