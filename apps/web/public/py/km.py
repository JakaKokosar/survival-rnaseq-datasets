"""Kaplan–Meier survival curve computation for the dataset browser.

Loaded in a PyScript web worker so Pyodide and lifelines do not block the page UI.

The returned shape (a JSON string) matches the `KmResult` type defined in
`src/lib/kmPython.ts`. JSON is used so the JS side never has to manage PyProxies.
"""

import io
import json
import math
import numbers
import sys
from dataclasses import dataclass

import lifelines
import pandas as pd
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test

PALETTE = ["#18aeea", "#ff4d24", "#16a34a", "#9333ea", "#ea580c", "#0891b2"]
HALLMARK_PREFIX = "HALLMARK_"
HALLMARK_ANALYSIS_VERSION = "hallmark-logrank-v2"


@dataclass
class KmFit:
    label: str
    color: str
    total: int
    events: int
    model: KaplanMeierFitter | None
    censored_times: pd.Series


# ---------------------------------------------------------------------------
# Analysis: load CSV data, prepare groups, fit Kaplan-Meier models.
# ---------------------------------------------------------------------------


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


def _prepare_analysis_frame(df, time_col, event_col, group_col):
    columns = [time_col, event_col]
    if group_col and group_col in df.columns:
        columns.append(group_col)

    frame = df.copy()
    for column in columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    frame = frame.dropna(subset=columns)
    frame[event_col] = frame[event_col].astype(int)
    return frame.sort_values(time_col)


def _group_frames(frame, group_col):
    if not group_col or group_col not in frame.columns:
        return [("All patients", frame)]

    if frame.empty:
        return []

    threshold = float(frame[group_col].median())
    formatted = _format_threshold(threshold)
    return [
        (f"< {formatted}", frame[frame[group_col] < threshold]),
        (f">= {formatted}", frame[frame[group_col] >= threshold]),
    ]


def _fit_group(label, color, frame, time_col, event_col):
    total = int(len(frame))
    if total == 0:
        return KmFit(label, color, 0, 0, None, pd.Series(dtype=float))

    durations = frame[time_col].astype(float)
    events = frame[event_col].astype(int)
    model = KaplanMeierFitter()
    model.fit(durations, event_observed=events)

    return KmFit(
        label=label,
        color=color,
        total=total,
        events=int(events.sum()),
        model=model,
        censored_times=durations[events == 0],
    )


def _fit_kaplan_meiers(df, time_col, event_col, group_col):
    frame = _prepare_analysis_frame(df, time_col, event_col, group_col)
    groups = _group_frames(frame, group_col)
    return [
        _fit_group(label, PALETTE[index % len(PALETTE)], group, time_col, event_col)
        for index, (label, group) in enumerate(groups)
    ]


# ---------------------------------------------------------------------------
# Frontend payload: convert fitted lifelines objects to JSON-safe structures.
# ---------------------------------------------------------------------------


def _finite_or(value, default):
    number = float(value)
    return number if math.isfinite(number) else default


def _initial_point(total):
    return {
        "time": 0.0,
        "survival": 1.0,
        "atRisk": total,
        "events": 0,
        "censors": 0,
        "ciLow": 1.0,
        "ciHigh": 1.0,
    }


def _empty_series(fit):
    return {
        "key": fit.label,
        "label": fit.label,
        "color": fit.color,
        "total": 0,
        "events": 0,
        "median": None,
        "points": [_initial_point(0)],
        "censorTicks": [],
    }


def _survival_table(model):
    ci = model.confidence_interval_.rename(
        columns={
            model.confidence_interval_.columns[0]: "ciLow",
            model.confidence_interval_.columns[1]: "ciHigh",
        }
    )
    table = model.event_table.join(
        model.survival_function_.rename(columns={"KM_estimate": "survival"})
    ).join(ci)
    return table[(table.index > 0) & ((table["observed"] > 0) | (table["censored"] > 0))]


def _km_points(model, total):
    points = [_initial_point(total)]
    survival = 1.0
    for time, row in _survival_table(model).iterrows():
        survival = _finite_or(row["survival"], survival)
        points.append(
            {
                "time": float(time),
                "survival": survival,
                "atRisk": int(row["at_risk"]),
                "events": int(row["observed"]),
                "censors": int(row["censored"]),
                "ciLow": _finite_or(row["ciLow"], survival),
                "ciHigh": _finite_or(row["ciHigh"], survival),
            }
        )
    return points


def _predict_survival_at(model, times):
    # lifelines.predict returns a scalar for one time, but a Series for many;
    # normalize so zip() always has an iterable aligned with *times*.
    values = model.predict(times)
    if isinstance(values, pd.Series):
        return values
    if isinstance(values, numbers.Number):
        return pd.Series([float(values)], index=times.index)
    return pd.Series(values, index=times.index)


def _censor_ticks(model, censored_times):
    if censored_times.empty:
        return []
    survival_values = _predict_survival_at(model, censored_times)
    return [
        {"time": float(time), "survival": _finite_or(survival, 1.0)}
        for time, survival in zip(censored_times, survival_values, strict=False)
    ]


def _median_value(model):
    median = model.median_survival_time_
    if median is None:
        return None
    median = float(median)
    return median if math.isfinite(median) else None


def _series_payload(fit):
    if fit.model is None:
        return _empty_series(fit)

    return {
        "key": fit.label,
        "label": fit.label,
        "color": fit.color,
        "total": fit.total,
        "events": fit.events,
        "median": _median_value(fit.model),
        "points": _km_points(fit.model, fit.total),
        "censorTicks": _censor_ticks(fit.model, fit.censored_times),
    }


def compute_km(csv_text, time_col, event_col, group_col):
    df = pd.read_csv(io.StringIO(csv_text))
    excluded_group_columns = {time_col, event_col}
    numeric = _numeric_columns(df, excluded_group_columns)

    if time_col not in df.columns or event_col not in df.columns:
        return json.dumps({"series": [], "numericColumns": numeric})

    fits = _fit_kaplan_meiers(df, time_col, event_col, group_col)
    series = [_series_payload(fit) for fit in fits]
    return json.dumps({"series": series, "numericColumns": numeric})


# ---------------------------------------------------------------------------
# Hallmark screening: median split and univariate log-rank test.
# ---------------------------------------------------------------------------


def _empty_ranking_item(hallmark, status):
    return {
        "hallmark": hallmark,
        "cutoff": None,
        "n": 0,
        "lowN": 0,
        "highN": 0,
        "lowEvents": 0,
        "highEvents": 0,
        "statistic": None,
        "pValue": None,
        "status": status,
    }


def _rank_hallmark(df, time_col, event_col, hallmark):
    item = _empty_ranking_item(hallmark, "insufficient_data")
    frame = df[[time_col, event_col, hallmark]].copy()
    for column in frame.columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna(subset=[time_col, event_col, hallmark])

    item["n"] = int(len(frame))
    if frame.empty:
        return item

    cutoff = float(frame[hallmark].median())
    item["cutoff"] = cutoff
    low = frame[frame[hallmark] < cutoff]
    high = frame[frame[hallmark] >= cutoff]
    item["lowN"] = int(len(low))
    item["highN"] = int(len(high))
    item["lowEvents"] = int(low[event_col].sum())
    item["highEvents"] = int(high[event_col].sum())

    if low.empty or high.empty:
        item["status"] = "invalid_split"
        return item
    if item["lowEvents"] + item["highEvents"] == 0:
        item["status"] = "no_events"
        return item

    try:
        result = logrank_test(
            low[time_col],
            high[time_col],
            event_observed_A=low[event_col],
            event_observed_B=high[event_col],
        )
        statistic = float(result.test_statistic)
        p_value = float(result.p_value)
        if not math.isfinite(statistic) or not math.isfinite(p_value):
            item["status"] = "not_estimable"
            return item
        item["statistic"] = statistic
        item["pValue"] = p_value
        item["status"] = "ok"
        return item
    except Exception:
        item["status"] = "not_estimable"
        return item


def compute_hallmark_ranking(csv_text, time_col, event_col):
    df = pd.read_csv(io.StringIO(csv_text))
    if time_col not in df.columns or event_col not in df.columns:
        return json.dumps(
            {
                "analysisVersion": HALLMARK_ANALYSIS_VERSION,
                "results": [],
            }
        )

    hallmarks = [column for column in df.columns if column.startswith(HALLMARK_PREFIX)]
    items = [_rank_hallmark(df, time_col, event_col, hallmark) for hallmark in hallmarks]
    items.sort(
        key=lambda item: (
            item["status"] != "ok",
            item["pValue"] if item["pValue"] is not None else math.inf,
            item["hallmark"],
        )
    )
    return json.dumps(
        {
            "analysisVersion": HALLMARK_ANALYSIS_VERSION,
            "results": items,
        }
    )


def get_env():
    return json.dumps(
        {
            "python": sys.version.split()[0],
            "lifelines": lifelines.__version__,
        }
    )


__export__ = ["compute_km", "compute_hallmark_ranking", "get_env"]
