"""Windows as curves, not boxes — Python half. Mirrors src/model/activity.js.

The grid walks accumulate by repeated addition in the same order as the
JavaScript, and every comparison is rounded the way JavaScript rounds, so both
halves land on the same compromise point rather than on neighbouring grid cells.
"""

from __future__ import annotations

import math
from typing import Any

from .numbers import to_fixed

# Everywhere a peak height is shown, this sentence goes with it. A number between
# 0 and 1 beside a traffic light gets read as a probability, and this one is
# nothing of the kind: it is a made-up number with made-up units, in exactly the
# way the Foundry Score is.
ACTIVITY_DISCLAIMER = (
    "Peak height is a made-up number with made-up units. It is not a probability, a yield "
    "or a prediction. Activity curves are invented shapes fitted to the catalogue’s "
    "rounded windows, and what they are for is showing that an overlap is not the same as "
    "both enzymes being happy."
)

# There is deliberately no threshold in this file, and none should be added. No
# value of the peak height means "good enough": the number exists to be compared
# against another arrangement of the same lane, never to pass or fail one.
NO_THRESHOLD_NOTE = (
    "There is no passing score. A higher peak height means a better compromise than a lower "
    "one, and nothing more than that."
)

TEMP_RISE_GAIN = 2.2
TEMP_FALL_GAIN = 6
PH_EDGE_ACTIVITY = 0.3

RUN_LENGTHS = [
    {"id": "minutes", "label": "Minutes", "hours": 0.25,
     "blurb": "A quick assay. The optimum sits near the top of the window."},
    {"id": "hours", "label": "A few hours", "hours": 3,
     "blurb": "A working session. The optimum has already moved down."},
    {"id": "overnight", "label": "Overnight", "hours": 16,
     "blurb": "A long run. Hold it cooler and accept a slower rate."},
]

DEFAULT_RUN = "hours"

TEMP_STEP = 0.5
PH_STEP = 0.05

_COMPARE_DIGITS = 6


def run_length(id_: str) -> dict[str, Any]:
    for r in RUN_LENGTHS:
        if r["id"] == id_:
            return r
    raise ValueError(f"unknown run length: {id_}")


def _compare(x: float) -> float:
    return float(to_fixed(x, _COMPARE_DIGITS))


def _fixed(x: float, digits: int) -> float:
    return float(to_fixed(x, digits))


def _time_average(k: float, hours: float) -> float:
    """Time-average of activity decaying at rate k over a run of `hours`."""
    kh = k * hours
    if kh < 1e-9:
        return 1.0
    return (1 - math.exp(-kh)) / kh


def temp_activity(entry: dict[str, Any], temp: float, hours: float) -> float:
    lo, hi = entry["temp"]
    span = hi - lo
    if span <= 0:
        return 1.0 if temp == lo else 0.0

    rise = math.exp((TEMP_RISE_GAIN * (temp - lo)) / span)
    loss_rate = math.exp((TEMP_FALL_GAIN * (temp - hi)) / span)
    held = _time_average(loss_rate, hours)
    value = (rise * held) / math.exp(TEMP_RISE_GAIN)
    return min(1.0, max(0.0, value))


def ph_activity(entry: dict[str, Any], ph: float) -> float:
    lo, hi = entry["ph"]
    mid = (lo + hi) / 2
    half = (hi - lo) / 2
    if half <= 0:
        return 1.0 if ph == mid else 0.0

    sigma = half / math.sqrt(2 * -math.log(PH_EDGE_ACTIVITY))
    z = (ph - mid) / sigma
    return math.exp(-0.5 * z * z)


def stage_activity(entry: dict[str, Any], temp: float, ph: float, hours: float) -> float:
    return temp_activity(entry, temp, hours) * ph_activity(entry, ph)


def lane_activity(entries: list[dict[str, Any]], temp: float, ph: float, hours: float) -> float:
    value = 1.0
    for e in entries:
        value *= stage_activity(e, temp, ph, hours)
    return value


def best_point(entries: list[dict[str, Any]], run_id: str = DEFAULT_RUN) -> dict[str, Any] | None:
    if not entries:
        return None
    hours = run_length(run_id)["hours"]

    t_low = min(e["temp"][0] for e in entries)
    t_high = max(e["temp"][1] for e in entries)
    p_low = min(e["ph"][0] for e in entries)
    p_high = max(e["ph"][1] for e in entries)

    best = -1.0
    best_temp = t_low
    best_ph = p_low

    t = t_low
    while t <= t_high + 1e-9:
        p = p_low
        while p <= p_high + 1e-9:
            v = _compare(lane_activity(entries, t, p, hours))
            if v > best:
                best = v
                best_temp = t
                best_ph = p
            p += PH_STEP
        t += TEMP_STEP

    temp = _fixed(best_temp, 2)
    ph = _fixed(best_ph, 2)
    return {
        "temp": temp,
        "ph": ph,
        "run": run_id,
        "value": best,
        "stages": [
            {
                "id": e["id"],
                "name": e["name"],
                "temp": _fixed(temp_activity(e, temp, hours), 4),
                "ph": _fixed(ph_activity(e, ph), 4),
                "value": _fixed(stage_activity(e, temp, ph, hours), 4),
            }
            for e in entries
        ],
    }


def temp_optimum(entry: dict[str, Any], run_id: str = DEFAULT_RUN) -> dict[str, Any]:
    hours = run_length(run_id)["hours"]
    lo, hi = entry["temp"]

    best = -1.0
    best_temp = lo
    t = lo
    while t <= hi + 1e-9:
        v = _compare(temp_activity(entry, t, hours))
        if v > best:
            best = v
            best_temp = t
        t += TEMP_STEP
    return {"temp": _fixed(best_temp, 2), "value": best, "run": run_id}


def _sample(lo: float, hi: float, steps: int, make) -> list[dict[str, Any]]:
    return [make(lo + ((hi - lo) * i) / steps) for i in range(steps + 1)]


def temp_curve(entry: dict[str, Any], run_id: str = DEFAULT_RUN, steps: int = 48) -> list[dict[str, Any]]:
    hours = run_length(run_id)["hours"]
    lo, hi = entry["temp"]
    return _sample(lo, hi, steps,
                   lambda t: {"temp": _fixed(t, 3), "value": _fixed(temp_activity(entry, t, hours), 4)})


def ph_curve(entry: dict[str, Any], steps: int = 48) -> list[dict[str, Any]]:
    lo, hi = entry["ph"]
    return _sample(lo, hi, steps,
                   lambda p: {"ph": _fixed(p, 3), "value": _fixed(ph_activity(entry, p), 4)})


def _num(x: float) -> str:
    """Print a window bound the way JavaScript prints it: 45 rather than 45.0."""
    return str(int(x)) if float(x).is_integer() else str(x)


def compromise_note(entries: list[dict[str, Any]], run_id: str = DEFAULT_RUN) -> str:
    if not entries:
        return "Add stages to see where they could all run at once."
    best = best_point(entries, run_id)
    worst = min(best["stages"], key=lambda s: s["value"])

    from .numbers import js_round

    def pct(x: float) -> str:
        return f"{js_round(x * 100)}%"

    # One sentence for every lane, with no cutoff deciding which one a lane gets.
    # A compromise where the weakest stage reads 2% is reported in the same words
    # as one where it reads 60%, and the reader draws their own conclusion.
    return (
        f"Best shared point is {_num(best['temp'])} °C and pH {_num(best['ph'])} over "
        f"{run_length(run_id)['label'].lower()}, where the weakest stage, {worst['name']}, runs at "
        f"{pct(worst['value'])} of its own best."
    )
