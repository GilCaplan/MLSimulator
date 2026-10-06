"""Checking a new file against a saved model's inputs, and applying the learner's fixes."""
import pandas as pd

from mlp.core import filecheck

META = {
    "target": "is_fraud",
    "classes": ["0", "1"],
    "input_schema": [
        {"name": "amount", "type": "numeric", "min": 1.0, "max": 800.0},
        {"name": "hour", "type": "numeric", "min": 0.0, "max": 23.0},
        {"name": "distance_km", "type": "numeric", "min": 0.0, "max": 64.0},
        {"name": "channel", "type": "categorical", "categories": ["online", "phone", "in-store"], "mode": "online"},
    ],
}

RAW = pd.DataFrame({
    "Amount": ["$1,200", "50", "abc", "(20)"],
    "HOUR": [3, 14, None, 5],
    "Channel ": ["Online", "kiosk", "phone", "online"],
    "is_fraud": [1, 0, 1, 2],
    "notes": ["a", "b", "c", "d"],
})


def by_name(report):
    return {c["name"]: c for c in report["columns"]}


def test_auto_mapping_matches_case_and_spacing_only():
    m = filecheck.auto_mapping(RAW, META)
    assert m == {"amount": "Amount", "hour": "HOUR", "channel": "Channel "}


def test_report_before_fixes():
    fixes = {"mapping": filecheck.auto_mapping(RAW, META)}
    rep = filecheck.check(RAW, META, fixes)
    cols = by_name(rep)
    assert not rep["ready"]
    assert cols["distance_km"]["status"] == "missing"
    kinds = {i["kind"]: i for i in cols["amount"]["issues"]}
    assert kinds["not_numbers"]["rows"] == 3 and kinds["not_numbers"]["fixable"] == 2
    assert {i["kind"] for i in cols["channel"]["issues"]} == {"unseen"}
    assert rep["extra"] == ["notes"]
    assert rep["target"]["source"] == "is_fraud" and rep["target"]["unknown"]["rows"] == 1


def test_fixes_make_it_ready():
    fixes = {"mapping": filecheck.auto_mapping(RAW, META), "fill": {"distance_km": 5, "hour": 12}, "clean": ["amount", "channel"]}
    df = filecheck.apply_fixes(RAW, META, fixes)
    assert df["amount"].tolist()[:2] == [1200.0, 50.0] and pd.isna(df["amount"][2]) and df["amount"][3] == -20
    assert df["hour"].tolist() == [3, 14, 12, 5]
    assert (df["distance_km"] == 5).all()
    assert df["channel"].tolist() == ["online", "kiosk", "phone", "online"]
    assert "Amount" not in df.columns and "notes" in df.columns
    rep = filecheck.check(RAW, META, fixes)
    assert rep["ready"] and rep["counts"]["missing"] == 0
    assert any("never saw" in w for w in filecheck.warnings_of(rep))


def test_suggestions_for_a_missing_column():
    raw = pd.DataFrame({"dist_km": [1.0], "amount": [2.0], "hour": [1], "channel": ["online"]})
    rep = filecheck.check(raw, META, {})
    assert by_name(rep)["distance_km"]["suggestions"][0] == "dist_km"
