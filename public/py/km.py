"""Kaplan–Meier survival curve computation for the dataset browser.

Loaded in a PyScript web worker so Pyodide and lifelines do not block the page UI.

The returned shape (a JSON string) matches the `KmResult` type defined in
`src/lib/kmPython.ts`. JSON is used so the JS side never has to manage PyProxies.
"""

import io
import json
import math
import sys

import lifelines
import pandas as pd
from lifelines import KaplanMeierFitter

PALETTE = ["#18aeea", "#ff4d24", "#16a34a", "#9333ea", "#ea580c", "#0891b2"]
EXCLUDED_GROUP_COLUMNS = {
    "pfs.time",
    "pfs.event",
    "os.time",
    "os.event",
    "tumor.response",
    "recist",
}


def _numeric_columns(df, excluded):
    cols = []
    for column in df.columns:
        if column in excluded:
            continue
        series = pd.to_numeric(df[column], errors="coerce")
        non_blank = df[column].astype(str).str.strip() != ""
        if non_blank.any() and series[non_blank].notna().all():
            cols.append(column)
    return cols


def _format_threshold(value):
    if float(value).is_integer():
        return str(int(value))
    return str(round(float(value), 5))


def _group_sort_key(label):
    if label == "All patients":
        return (0, label)
    if label.startswith("<"):
        return (1, label)
    if label.startswith(">="):
        return (2, label)
    return (3, label)


def _fit_series(label, color, sub_df, time_col, event_col):
    sub_df = sub_df.dropna(subset=[time_col, event_col]).copy()
    sub_df[time_col] = pd.to_numeric(sub_df[time_col], errors="coerce")
    sub_df[event_col] = pd.to_numeric(sub_df[event_col], errors="coerce").fillna(0).astype(int)
    sub_df = sub_df.dropna(subset=[time_col]).sort_values(time_col)

    total = int(len(sub_df))
    events_count = int((sub_df[event_col] == 1).sum())

    points = [
        {
            "time": 0.0,
            "survival": 1.0,
            "atRisk": total,
            "events": 0,
            "censors": 0,
            "varianceSum": 0.0,
            "ciLow": 1.0,
            "ciHigh": 1.0,
        }
    ]
    censor_ticks = []
    median_val = None

    if total > 0:
        kmf = KaplanMeierFitter()
        kmf.fit(sub_df[time_col].astype(float), sub_df[event_col].astype(int))
        event_table = kmf.event_table
        sf = kmf.survival_function_["KM_estimate"]
        ci = kmf.confidence_interval_
        ci_low_col = ci.columns[0]
        ci_high_col = ci.columns[1]

        variance_sum = 0.0
        for t, row in event_table.iterrows():
            if t == 0:
                continue
            at_risk = int(row["at_risk"])
            events_at_t = int(row["observed"])
            censors_at_t = int(row["censored"])
            if events_at_t == 0 and censors_at_t == 0:
                continue
            if events_at_t > 0 and at_risk > events_at_t:
                variance_sum += events_at_t / (at_risk * (at_risk - events_at_t))
            survival = float(sf.loc[t]) if t in sf.index else float(points[-1]["survival"])
            ci_low_val = float(ci.loc[t, ci_low_col]) if t in ci.index else survival
            ci_high_val = float(ci.loc[t, ci_high_col]) if t in ci.index else survival
            if math.isnan(ci_low_val):
                ci_low_val = survival
            if math.isnan(ci_high_val):
                ci_high_val = survival
            points.append(
                {
                    "time": float(t),
                    "survival": survival,
                    "atRisk": at_risk,
                    "events": events_at_t,
                    "censors": censors_at_t,
                    "varianceSum": variance_sum,
                    "ciLow": ci_low_val,
                    "ciHigh": ci_high_val,
                }
            )

        def survival_at_or_before(time_value):
            survival = 1.0
            for point in points:
                if point["time"] > time_value:
                    break
                survival = point["survival"]
            return survival

        for _, row in sub_df[sub_df[event_col] == 0].iterrows():
            t = float(row[time_col])
            censor_ticks.append({"time": t, "survival": survival_at_or_before(t)})

        median_raw = kmf.median_survival_time_
        if median_raw is not None and not (
            isinstance(median_raw, float) and (math.isinf(median_raw) or math.isnan(median_raw))
        ):
            median_val = float(median_raw)

    return {
        "key": label,
        "label": label,
        "color": color,
        "total": total,
        "events": events_count,
        "median": median_val,
        "points": points,
        "censorTicks": censor_ticks,
    }


def compute_km(csv_text, time_col, event_col, group_col):
    df = pd.read_csv(io.StringIO(csv_text))
    numeric = _numeric_columns(df, EXCLUDED_GROUP_COLUMNS)

    if time_col not in df.columns or event_col not in df.columns:
        return json.dumps({"series": [], "numericColumns": numeric})

    working = df.copy()
    working[time_col] = pd.to_numeric(working[time_col], errors="coerce")
    working[event_col] = pd.to_numeric(working[event_col], errors="coerce")
    working = working.dropna(subset=[time_col, event_col])

    groups = []
    if group_col and group_col in working.columns:
        working[group_col] = pd.to_numeric(working[group_col], errors="coerce")
        working = working.dropna(subset=[group_col])
        if not working.empty:
            threshold = float(working[group_col].median())
            formatted = _format_threshold(threshold)
            low_label = f"< {formatted}"
            high_label = f">= {formatted}"
            groups = [
                (low_label, working[working[group_col] < threshold]),
                (high_label, working[working[group_col] >= threshold]),
            ]
    else:
        groups = [("All patients", working)]

    groups.sort(key=lambda pair: _group_sort_key(pair[0]))
    series = [
        _fit_series(label, PALETTE[index % len(PALETTE)], sub, time_col, event_col)
        for index, (label, sub) in enumerate(groups)
    ]
    return json.dumps({"series": series, "numericColumns": numeric})


def get_env():
    return json.dumps(
        {
            "python": sys.version.split()[0],
            "lifelines": lifelines.__version__,
        }
    )


__export__ = ["compute_km", "get_env"]
