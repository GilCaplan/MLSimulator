# Before / after examples

These are from the air-quality rolling exercise: the first commit vs the version after review.

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
