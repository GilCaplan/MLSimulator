"""Synthetic datasets for lesson challenges.

Each generator returns (train_df, hidden_df). The train set is what the learner gets; the hidden set is the
"real world" the model is graded on (clean, no after-the-fact columns, shortcut correlations broken, unbiased labels).
All generators are deterministic for a given seed.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def _sig(x):
    return 1 / (1 + np.exp(-x))


# ----------------------------------------------------------------------------- 1. missing values
def hospital(seed: int = 7, n: int = 3000, n_hidden: int = 4000):
    """Readmission. The HbA1c lab is mostly ordered for sicker patients (missing-not-at-random), so dropping
    incomplete rows leaves a biased, much smaller sample."""
    def make(n, rng):
        age = rng.normal(64, 13, n).clip(20, 95).round()
        stay = rng.gamma(2.2, 2.0, n).clip(1, 21).round()
        meds = rng.poisson(14, n) + (stay * 0.6).round()
        prior = rng.poisson(0.8, n)
        labs = rng.normal(43, 18, n).clip(1, 120).round()
        insulin = rng.choice(["none", "steady", "up", "down"], n, p=[0.45, 0.3, 0.13, 0.12])
        severity = 0.05 * (age - 64) + 0.25 * (stay - 4.4) + 0.55 * prior + 0.02 * (labs - 43) + 0.5 * (insulin == "up") + rng.normal(0, 0.6, n)
        a1c = (6.4 + 0.55 * severity + rng.normal(0, 0.7, n)).clip(4, 14).round(1)
        bmi = rng.normal(30, 6, n).clip(15, 60).round(1)
        z = -0.9 + 1.25 * severity + 0.35 * (a1c - 7) + rng.normal(0, 0.35, n)
        y = np.where(rng.random(n) < _sig(z), "readmitted", "not readmitted")
        df = pd.DataFrame({"age": age, "days_in_hospital": stay, "num_medications": meds, "prior_visits": prior,
                           "num_lab_tests": labs, "insulin_change": insulin, "hba1c": a1c, "bmi": bmi})
        # HbA1c measured mostly for sicker patients; BMI missing at random.
        p_measured = _sig(-2.6 + 2.6 * severity)
        df.loc[rng.random(n) > p_measured, "hba1c"] = np.nan
        df.loc[rng.random(n) < 0.35, "bmi"] = np.nan
        df.loc[rng.random(n) < 0.15, "num_lab_tests"] = np.nan
        df["readmitted"] = y
        return df
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


# ----------------------------------------------------------------------------- 2. outliers + skew
def used_cars(seed: int = 7, n: int = 2500, n_hidden: int = 3000):
    """Prices are log-normal (skewed) and ~4% of listings are typos: $0, $1 or billions."""
    brands = {"Toyota": 1.0, "Honda": 0.95, "Ford": 0.85, "BMW": 1.45, "Tesla": 1.7, "Kia": 0.8, "Mercedes": 1.55}

    def make(n, rng, corrupt):
        brand = rng.choice(list(brands), n, p=[0.22, 0.18, 0.2, 0.1, 0.06, 0.14, 0.1])
        age = rng.gamma(2.0, 3.2, n).clip(0, 25).round()
        km = (age * rng.normal(14000, 4000, n) + rng.normal(5000, 3000, n)).clip(0, 400000).round(-2)
        engine = rng.choice([1.2, 1.6, 2.0, 2.5, 3.0, 4.0], n, p=[0.15, 0.3, 0.25, 0.15, 0.1, 0.05])
        condition = rng.choice(["fair", "good", "excellent"], n, p=[0.2, 0.55, 0.25])
        cond_mult = pd.Series(condition).map({"fair": 0.8, "good": 1.0, "excellent": 1.15}).to_numpy()
        brand_mult = pd.Series(brand).map(brands).to_numpy()
        log_price = (np.log(38000) - 0.085 * age - 0.0000022 * km + 0.12 * (engine - 2) + np.log(brand_mult) + np.log(cond_mult)
                     + rng.normal(0, 0.12, n))
        price = np.exp(log_price).round(-1)
        if corrupt:
            bad = rng.random(n)
            price = np.where(bad < 0.02, rng.choice([0, 1, 10], n), price)
            price = np.where((bad >= 0.02) & (bad < 0.04), rng.uniform(1e8, 3e9, n).round(-3), price)
        return pd.DataFrame({"brand": brand, "age_years": age, "mileage_km": km, "engine_litres": engine,
                             "condition": condition, "price": price})
    return make(n, np.random.default_rng(seed), True), make(n_hidden, np.random.default_rng(seed + 1000), False)


# ----------------------------------------------------------------------------- 3. leakage
def flights(seed: int = 7, n: int = 4000, n_hidden: int = 4000):
    """Delay-cause minutes are only filled in after the flight lands. At prediction time they're unknown."""
    carriers = {"SkyJet": 0.4, "AeroOne": 0.0, "BlueWing": -0.3, "Coastal": 0.25, "Northern": -0.1}

    def make(n, rng, hidden):
        carrier = rng.choice(list(carriers), n)
        hour = rng.integers(5, 23, n)
        dow = rng.choice(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], n)
        month = rng.integers(1, 13, n)
        distance = rng.gamma(3, 350, n).clip(150, 4500).round()
        congestion = rng.beta(2, 3, n).round(3)
        rain = rng.beta(1.2, 4, n).round(2)
        winter = np.isin(month, [12, 1, 2]).astype(float)
        z = (-1.5 + 0.11 * (hour - 13) + 2.4 * (congestion - 0.4) + 3.0 * rain + 0.6 * winter
             + pd.Series(carrier).map(carriers).to_numpy() + 0.45 * np.isin(dow, ["Fri", "Sun"]) + rng.normal(0, 0.5, n))
        delayed = rng.random(n) < _sig(z)
        df = pd.DataFrame({"carrier": carrier, "departure_hour": hour, "day_of_week": dow, "month": month,
                           "distance_km": distance, "airport_congestion": congestion, "rain_forecast": rain})
        if hidden:
            df["carrier_delay_min"] = np.nan
            df["weather_delay_min"] = np.nan
            df["late_aircraft_min"] = np.nan
        else:
            total = np.where(delayed, rng.gamma(2, 25, n) + 16, rng.exponential(3, n))
            share = rng.dirichlet([1, 1, 1], n)
            df["carrier_delay_min"] = (total * share[:, 0]).round()
            df["weather_delay_min"] = (total * share[:, 1]).round()
            df["late_aircraft_min"] = (total * share[:, 2]).round()
        df["status"] = np.where(delayed, "delayed", "on time")
        return df
    return make(n, np.random.default_rng(seed), False), make(n_hidden, np.random.default_rng(seed + 1000), True)


# ----------------------------------------------------------------------------- 4. scaling
def apartments(seed: int = 7, n: int = 1500, n_hidden: int = 2000):
    """Price is driven mostly by small-range features (rooms, doorman, floor); big-range columns dominate
    unscaled KNN distances."""
    def make(n, rng):
        rooms = rng.integers(1, 6, n)
        baths = np.clip(rooms - rng.integers(0, 3, n), 1, 4)
        doorman = (rng.random(n) < 0.35).astype(int)
        floor = rng.integers(1, 41, n)
        dist = rng.uniform(200, 25000, n).round(-1)
        year = rng.integers(1900, 2024, n)
        sqft = (rooms * 380 + rng.normal(0, 260, n)).clip(250, 3500).round(-1)
        price = (2300 + 700 * rooms + 380 * baths + 1100 * doorman + 38 * floor - 0.02 * dist
                 + rng.normal(0, 250, n))
        return pd.DataFrame({"rooms": rooms, "bathrooms": baths, "doorman": doorman, "floor": floor,
                             "distance_to_center_m": dist, "year_built": year, "size_sqft": sqft,
                             "monthly_rent": price.round(-1)})
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


# ----------------------------------------------------------------------------- 5. imbalance
def fraud(seed: int = 7, n: int = 6000, n_hidden: int = 8000):
    def make(n, rng):
        amount = rng.lognormal(3.6, 1.0, n).round(2)
        hour = rng.integers(0, 24, n)
        dist = rng.exponential(12, n).round(1)
        category = rng.choice(["grocery", "fuel", "electronics", "travel", "online games", "restaurants"], n,
                              p=[0.3, 0.17, 0.1, 0.08, 0.07, 0.28])
        online = (rng.random(n) < 0.35).astype(int)
        foreign = (rng.random(n) < 0.06).astype(int)
        tx24 = rng.poisson(3, n)
        acct_age = rng.integers(10, 4000, n)
        night = ((hour < 5) | (hour >= 23)).astype(float)
        z = (-6.6 + 1.3 * (np.log(amount) - 3.6) + 2.0 * night + 0.05 * dist + 1.6 * online + 2.2 * foreign
             + 0.35 * (tx24 - 3) + 1.8 * np.isin(category, ["electronics", "online games"]) - 0.0006 * acct_age
             + rng.normal(0, 0.25, n))
        y = np.where(rng.random(n) < _sig(z), "fraud", "legit")
        return pd.DataFrame({"amount": amount, "hour": hour, "distance_from_home_km": dist, "merchant": category,
                             "online": online, "foreign": foreign, "tx_last_24h": tx24, "account_age_days": acct_age,
                             "label": y})
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


# ----------------------------------------------------------------------------- 6. overfitting
def startups(seed: int = 7, n: int = 320, n_hidden: int = 3000, n_noise: int = 40):
    """Few rows, a handful of real signals and many noisy 'metrics'."""
    noise_names = [f"metric_{i:02d}" for i in range(1, n_noise + 1)]

    def make(n, rng):
        rounds = rng.integers(0, 6, n)
        team = rng.integers(1, 40, n)
        exp = rng.integers(0, 25, n)
        market = rng.lognormal(0, 0.8, n).round(2)
        burn = rng.gamma(2, 50, n).round()
        z = -1.7 + 2.4 * (rounds >= 3) + 1.7 * (exp >= 8) + 1.2 * (market > 1.5) - 1.6 * (burn > 150)
        y = np.where(rng.random(n) < _sig(1.7 * z), "success", "failure")
        df = pd.DataFrame({"funding_rounds": rounds, "team_size": team, "founder_experience_yrs": exp,
                           "market_size_bn": market, "monthly_burn_k": burn})
        for c in noise_names:
            df[c] = rng.normal(0, 1, n).round(3)
        df["outcome"] = y
        return df
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


# ----------------------------------------------------------------------------- 7. spurious shortcut
def heart(seed: int = 7, n: int = 3000, n_hidden: int = 4000):
    """In the training data, sick patients were mostly referred to the cardiology centre, so 'clinic' predicts
    the label almost perfectly. In the new deployment, the clinic has nothing to do with the diagnosis."""
    def make(n, rng, hidden):
        age = rng.normal(55, 12, n).clip(25, 90).round()
        bp = rng.normal(130, 18, n).clip(90, 200).round()
        chol = rng.normal(210, 40, n).clip(120, 380).round()
        bmi = rng.normal(28, 5, n).clip(16, 50).round(1)
        smoker = (rng.random(n) < 0.25).astype(int)
        exercise = rng.integers(0, 8, n)
        z = (-0.9 + 0.08 * (age - 55) + 0.045 * (bp - 130) + 0.016 * (chol - 210) + 0.08 * (bmi - 28)
             + 1.3 * smoker - 0.3 * (exercise - 3.5) + rng.normal(0, 0.5, n))
        sick = rng.random(n) < _sig(z)
        if hidden:
            clinic = rng.choice(["Cardiology Centre", "City Clinic", "Northside GP"], n)
        else:
            clinic = np.where(sick, np.where(rng.random(n) < 0.93, "Cardiology Centre", rng.choice(["City Clinic", "Northside GP"], n)),
                              np.where(rng.random(n) < 0.07, "Cardiology Centre", rng.choice(["City Clinic", "Northside GP"], n)))
        return pd.DataFrame({"age": age, "blood_pressure": bp, "cholesterol": chol, "bmi": bmi, "smoker": smoker,
                             "exercise_days_per_week": exercise, "clinic": clinic,
                             "diagnosis": np.where(sick, "heart disease", "healthy")})
    return make(n, np.random.default_rng(seed), False), make(n_hidden, np.random.default_rng(seed + 1000), True)


# ----------------------------------------------------------------------------- 8. fairness
def loans(seed: int = 7, n: int = 4000, n_hidden: int = 6000):
    """Historical labels under-record repayment for women (biased bookkeeping). The hidden test uses true outcomes.
    'shopping_profile' is a proxy that reveals gender even if the gender column is dropped."""
    def make(n, rng, hidden):
        gender = rng.choice(["female", "male"], n)
        income = rng.lognormal(10.9, 0.45, n).round(-2)
        debt = rng.beta(2, 5, n).round(3)
        history = rng.integers(0, 30, n)
        amount = rng.lognormal(9.3, 0.6, n).round(-2)
        employed = rng.integers(0, 25, n)
        z = (0.4 + 1.4 * (np.log(income) - 10.9) - 4.0 * (debt - 0.29) + 0.06 * (history - 15) - 0.5 * (np.log(amount) - 9.3)
             + 0.05 * (employed - 12) + rng.normal(0, 0.5, n))
        repaid = rng.random(n) < _sig(1.6 * z)
        if not hidden:
            flip = (gender == "female") & repaid & (rng.random(n) < 0.45)
            repaid = repaid & ~flip
        profile = np.where(gender == "female", rng.choice(["home & beauty", "fashion", "tech", "outdoors"], n, p=[0.45, 0.4, 0.1, 0.05]),
                           rng.choice(["home & beauty", "fashion", "tech", "outdoors"], n, p=[0.05, 0.1, 0.45, 0.4]))
        return pd.DataFrame({"gender": gender, "shopping_profile": profile, "income": income, "debt_ratio": debt,
                             "credit_history_yrs": history, "loan_amount": amount, "years_employed": employed,
                             "outcome": np.where(repaid, "repaid", "defaulted")})
    return make(n, np.random.default_rng(seed), False), make(n_hidden, np.random.default_rng(seed + 1000), True)


GENERATORS = {"missing": hospital, "outliers": used_cars, "leakage": flights, "scaling": apartments,
              "imbalance": fraud, "overfitting": startups, "shortcut": heart, "fairness": loans}


# ----------------------------------------------------------------------------- 9. baselines
def bus_delays(seed: int = 7, n: int = 3000, n_hidden: int = 4000):
    """Delay minutes peak at the two rush hours (a U/M shape in hour); a straight line through 'hour' is barely
    better than always predicting the average."""
    def make(n, rng):
        hour = rng.integers(5, 24, n)
        route = rng.choice(["M15", "B44", "Q58", "Bx12", "S79"], n)
        rain = rng.beta(1.2, 5, n).round(2)
        temp = rng.normal(14, 9, n).round(1)
        dow = rng.integers(0, 7, n)
        rush = np.exp(-((hour - 8.5) ** 2) / 2.2) + np.exp(-((hour - 17.5) ** 2) / 2.8)
        weekday = (dow < 5).astype(float)
        delay = (3 + 14 * rush * (0.4 + 0.6 * weekday) + 9 * rain + pd.Series(route).map({"M15": 2, "B44": 1, "Q58": 0, "Bx12": 3, "S79": -1}).to_numpy()
                 + rng.gamma(1.5, 1.6, n))
        return pd.DataFrame({"route": route, "hour": hour, "day_of_week": dow, "rain_mm": (rain * 20).round(1),
                             "temperature_c": temp, "delay_min": delay.round(1)})
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


# ----------------------------------------------------------------------------- 10. honest splits (groups)
def clinic_visits(seed: int = 7, n_patients: int = 700, n_hidden_patients: int = 900):
    """Each patient visits 3–7 times; visits of one patient are near-copies. A random split puts the same patient in
    train and test, so the test score measures memory, not diagnosis."""
    def make(n_p, rng, offset):
        rows = []
        for pid in range(n_p):
            age = rng.normal(72, 8)
            edu = rng.integers(8, 21)
            apoe = rng.choice([0, 1, 2], p=[0.6, 0.32, 0.08])
            volume = rng.normal(1.0, 0.09)
            quirk = rng.normal(0, 1, 4)  # patient-specific measurement signature
            risk = 0.09 * (age - 72) - 0.12 * (edu - 14) + 0.9 * apoe - 9 * (volume - 1.0) + rng.normal(0, 1.2)
            dementia = rng.random() < 1 / (1 + np.exp(-(risk - 0.3)))
            for v in range(rng.integers(3, 8)):
                rows.append({"patient_id": f"P{offset + pid:04d}", "visit": v + 1, "age": round(age + v * 0.8, 1), "education_yrs": edu,
                             "apoe4_copies": apoe, "brain_volume": round(volume - 0.01 * v + rng.normal(0, 0.008), 4),
                             "memory_score": round(28 - 3.5 * dementia - 0.15 * v * dementia + quirk[0] * 2.2 + rng.normal(0, 0.5), 1),
                             "reaction_ms": round(520 + 60 * dementia + quirk[1] * 90 + rng.normal(0, 10)),
                             "sleep_hours": round(7 + quirk[2] * 0.9 + rng.normal(0, 0.2), 1),
                             "gait_speed": round(1.1 - 0.12 * dementia + quirk[3] * 0.16 + rng.normal(0, 0.03), 3),
                             "diagnosis": "dementia" if dementia else "healthy"})
        return pd.DataFrame(rows)
    return make(n_patients, np.random.default_rng(seed), 0), make(n_hidden_patients, np.random.default_rng(seed + 1000), 5000)


# ----------------------------------------------------------------------------- 11. feature engineering
def taxi_tips(seed: int = 7, n: int = 4000, n_hidden: int = 4000):
    """Card riders tip ~20% of the fare (cash tips are never recorded) plus a late-night bonus. A linear model needs
    a fare × card feature and the hour from the timestamp to capture it."""
    def make(n, rng):
        start = np.datetime64("2025-01-01T00:00")
        minutes = rng.integers(0, 60 * 24 * 365, n)
        when = start + minutes.astype("timedelta64[m]")
        hour = ((minutes // 60) % 24)
        dist = rng.gamma(2, 2.2, n).round(1).clip(0.3, 40)
        fare = (3 + 2.6 * dist + rng.normal(0, 1.5, n)).clip(3, 150).round(2)
        card = (rng.random(n) < 0.68).astype(int)
        passengers = rng.integers(1, 5, n)
        late = ((hour >= 22) | (hour < 4)).astype(float)
        tip = card * (0.2 * fare + 2.5 * late) + rng.normal(0, 0.6, n) * card
        return pd.DataFrame({"pickup_time": pd.Series(when).dt.strftime("%Y-%m-%d %H:%M"), "trip_km": dist, "fare": fare,
                             "paid_by_card": card, "passengers": passengers, "tip": tip.clip(0).round(2)})
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


# ----------------------------------------------------------------------------- 12. calibration
def icu(seed: int = 7, n: int = 5000, n_hidden: int = 6000):
    """~12% of surgery patients need intensive care. The hospital staffs beds from predicted probabilities, so they
    must be calibrated. Oversampling inflates them."""
    def make(n, rng):
        age = rng.normal(62, 14, n).clip(18, 95).round()
        asa = rng.choice([1, 2, 3, 4], n, p=[0.2, 0.42, 0.3, 0.08])
        duration = rng.gamma(2.5, 50, n).round()
        emergency = (rng.random(n) < 0.18).astype(int)
        bmi = rng.normal(28, 5.5, n).clip(16, 55).round(1)
        hb = rng.normal(13, 1.8, n).clip(7, 18).round(1)
        procedure = rng.choice(["orthopedic", "abdominal", "cardiac", "neuro", "vascular"], n, p=[0.3, 0.3, 0.15, 0.1, 0.15])
        z = (-3.6 + 0.03 * (age - 62) + 0.85 * (asa - 2) + 0.006 * (duration - 125) + 1.1 * emergency - 0.25 * (hb - 13)
             + pd.Series(procedure).map({"orthopedic": -0.4, "abdominal": 0.1, "cardiac": 1.0, "neuro": 0.6, "vascular": 0.4}).to_numpy())
        y = np.where(rng.random(n) < _sig(z), "ICU", "ward")
        return pd.DataFrame({"age": age, "asa_class": asa, "surgery_minutes": duration, "emergency": emergency, "bmi": bmi,
                             "hemoglobin": hb, "procedure": procedure, "destination": y})
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


GENERATORS.update({"baselines": bus_delays, "splits": clinic_visits, "features": taxi_tips, "calibration": icu})


# ----------------------------------------------------------------------------- 13–14. vision
class ImageBundle:
    """Lesson data for image challenges: uint8 images + a frame with the label column."""

    def __init__(self, images, frame):
        self.images, self.frame = images, frame


def shapes_anywhere(seed: int = 7, n: int = 1600, n_hidden: int = 1200):
    from ..core.images import gen_shapes
    a, f = gen_shapes(n, 32, 0.08, seed=seed)
    b, g = gen_shapes(n_hidden, 32, 0.08, seed=seed + 1000)
    return ImageBundle(a, f), ImageBundle(b, g)


def shapes_shifted(seed: int = 7, n: int = 1600, n_hidden: int = 1200):
    """Training photos are all centred and upright; the real world isn't."""
    from ..core.images import gen_shapes
    a, f = gen_shapes(n, 32, 0.08, seed=seed, rotate=False, region="center")
    b, g = gen_shapes(n_hidden, 32, 0.08, seed=seed + 1000, rotate=True, region="any")
    return ImageBundle(a, f), ImageBundle(b, g)


GENERATORS.update({"convolutions": shapes_anywhere, "augmentation": shapes_shifted})
IMAGE_LESSONS = {"convolutions", "augmentation"}


# ----------------------------------------------------------------------------- 15–16. unsupervised
def customer_segments(seed: int = 7, n: int = 1200, n_hidden: int = 1500):
    """Five shopper segments; the default k=3 merges real groups."""
    segs = [([30, 25, 4, 0.8, 20], 0.26), ([42, 70, 6, 0.3, 45], 0.22), ([48, 140, 2, 0.1, 30], 0.16),
            ([21, 18, 10, 0.6, 70], 0.2), ([58, 40, 1, 0.2, 10], 0.16)]
    names = ["bargain hunters", "families", "premium", "students", "occasional"]

    def make(n, rng):
        seg = rng.choice(5, n, p=[w for _, w in segs])
        X = np.array([c for c, _ in segs])[seg] + rng.normal(0, 1, (n, 5)) * np.array([4, 10, 1.2, 0.1, 7])
        return pd.DataFrame({"age": X[:, 0].round(), "avg_basket": X[:, 1].round(2), "visits_per_month": X[:, 2].round(1),
                             "discount_share": X[:, 3].round(2), "online_share_pct": X[:, 4].round(),
                             "segment": np.asarray(names, dtype=object)[seg]})
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


def noisy_sensors(seed: int = 7, n: int = 1200, n_hidden: int = 1500, n_noise: int = 40):
    """Four machine states visible in 3 of 43 sensor channels (which move together); the rest is noise."""
    rng0 = np.random.default_rng(seed)
    perm = rng0.permutation(3 + n_noise)
    centers = np.outer([-3, -1, 1, 3], [1.2, 1.2, 1.2])

    def make(n, rng):
        st = rng.integers(0, 4, n)
        sig = centers[st] + rng.normal(0, 0.7, (n, 3))
        noise = rng.normal(0, 1, (n, n_noise))
        M = np.hstack([sig, noise])[:, perm]
        df = pd.DataFrame(M.round(3), columns=[f"sensor_{i + 1:02d}" for i in range(M.shape[1])])
        df["machine_state"] = np.asarray(["idle", "warming", "running", "overloaded"], dtype=object)[st]
        return df
    return make(n, np.random.default_rng(seed)), make(n_hidden, np.random.default_rng(seed + 1000))


GENERATORS.update({"choosing_k": customer_segments, "curse": noisy_sensors})
UNSUPERVISED_LESSONS = {"choosing_k", "curse"}


# ----------------------------------------------------------------------------- 17. text
def negated_reviews(seed: int = 7, n: int = 2400, n_hidden: int = 2000):
    """A third of reviews negate their adjective ('not good'); a linear unigram model can't tell them apart."""
    from ..core.text import gen_reviews
    return gen_reviews(n, 0.35, seed=seed), gen_reviews(n_hidden, 0.35, seed=seed + 1000)


GENERATORS.update({"bag_of_words": negated_reviews})
TEXT_LESSONS = {"bag_of_words"}
