"""Splice filters — Python half. Mirrors src/model/splice.js.

The same six hard rejects over the same cartoon geometry. Both halves must agree
on every case in src/data/parity-cases.json, strings included.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

from .compatibility import intersect_windows, _num
from .numbers import to_fixed

SPAN_PER_LINKER_UNIT = 0.34
TAUT_FRACTION = 0.8
LINKER_CHOICES = [2, 6, 12, 20]

PASS_VERDICT = "Nothing here ruled this out"

FILTERS = [
    {"id": "cut-site", "label": "Cut site",
     "blurb": "Did the cut fall in a flexible loop, or slice through a helix or sheet?"},
    {"id": "backbone-join", "label": "Backbone join",
     "blurb": "Can the chosen linker actually bridge the two cut ends?"},
    {"id": "clash", "label": "Clashes & chain breaks",
     "blurb": "Do the blobs pass through each other, or leave a gap the backbone cannot span?"},
    {"id": "compactness", "label": "Compactness",
     "blurb": "Is the radius of gyration inside the band expected for this size?"},
    {"id": "buried-core", "label": "Buried core",
     "blurb": "Do the hydrophobic patches end up facing solvent after the join?"},
    {"id": "operating-window", "label": "Operating window",
     "blurb": "Do the two parents share any temperature and pH window?"},
]

Vec = Sequence[float]


def _sub(a: Vec, b: Vec) -> list[float]:
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _add(a: Vec, b: Vec) -> list[float]:
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def _scale(a: Vec, k: float) -> list[float]:
    return [a[0] * k, a[1] * k, a[2] * k]


def _dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _len(a: Vec) -> float:
    return math.sqrt(_dot(a, a))


def _norm(a: Vec) -> list[float]:
    length = _len(a) or 1
    return _scale(a, 1 / length)


def _cross(a: Vec, b: Vec) -> list[float]:
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def rotate_between(from_v: Vec, to_v: Vec, v: Vec) -> list[float]:
    f = _norm(from_v)
    t = _norm(to_v)
    c = max(-1.0, min(1.0, _dot(f, t)))
    if c > 0.999999:
        return list(v)
    if c < -0.999999:
        axis = _norm(_cross(f, [1, 0, 0]) if abs(f[0]) < 0.9 else _cross(f, [0, 1, 0]))
        return _sub(_scale(axis, 2 * _dot(axis, v)), v)
    axis = _norm(_cross(f, t))
    s = math.sqrt(1 - c * c)
    return _add(_add(_scale(v, c), _scale(_cross(axis, v), s)), _scale(axis, _dot(axis, v) * (1 - c)))


def layout(domain_a: dict, site_a: dict, domain_b: dict, site_b: dict, linker_units: int) -> dict[str, Any]:
    span = linker_units * SPAN_PER_LINKER_UNIT
    axis = _norm(site_a["exit"])
    centre_distance = domain_a["radius"] + domain_b["radius"] + span * 0.5 - 0.9

    centre_b = _scale(axis, centre_distance)
    exit_b_local = rotate_between(site_b["exit"], _scale(axis, -1), site_b["exit"])
    exit_b = _add(centre_b, exit_b_local)

    return {
        "axis": axis,
        "centreA": [0.0, 0.0, 0.0],
        "centreB": centre_b,
        "centreDistance": centre_distance,
        "radiusA": domain_a["radius"],
        "radiusB": domain_b["radius"],
        "exitA": list(site_a["exit"]),
        "exitB": exit_b,
        "joinDistance": _len(_sub(exit_b, site_a["exit"])),
        "surfaceGap": centre_distance - domain_a["radius"] - domain_b["radius"],
        "overlap": domain_a["radius"] + domain_b["radius"] - centre_distance,
        "span": span,
        "linkerUnits": linker_units,
        "patchA": _norm(domain_a["hydrophobic"]),
        "patchB": _norm(rotate_between(site_b["exit"], _scale(axis, -1), domain_b["hydrophobic"])),
    }


def radius_of_gyration(geo: dict[str, Any]) -> float:
    m_a = geo["radiusA"] ** 3
    m_b = geo["radiusB"] ** 3
    m = m_a + m_b
    centroid = (m_b / m) * geo["centreDistance"]
    d_a = centroid
    d_b = geo["centreDistance"] - centroid
    rg2 = (m_a * (0.6 * geo["radiusA"] ** 2 + d_a ** 2) + m_b * (0.6 * geo["radiusB"] ** 2 + d_b ** 2)) / m
    return math.sqrt(rg2)


def expected_rg_band(geo: dict[str, Any]) -> dict[str, float]:
    r_equiv = (geo["radiusA"] ** 3 + geo["radiusB"] ** 3) ** (1 / 3)
    compact = math.sqrt(0.6) * r_equiv
    return {"low": compact * 0.85, "high": compact * 1.35, "compact": compact}


def _label_of(id_: str) -> str:
    return next((f["label"] for f in FILTERS if f["id"] == id_), id_)


def _result(id_: str, passed: bool, reason: str) -> dict[str, Any]:
    return {"id": id_, "label": _label_of(id_), "pass": passed, "reason": reason}


def run_filters(entry_a: dict, site_a: dict, entry_b: dict, site_b: dict, linker_units: int,
                team_entries: list[dict] | None = None) -> dict[str, Any]:
    team_entries = team_entries or []
    domain_a = entry_a["domain"]
    domain_b = entry_b["domain"]
    geo = layout(domain_a, site_a, domain_b, site_b, linker_units)
    results: list[dict[str, Any]] = []

    # 1. Cut site
    bad_cuts = []
    if site_a["region"] != "loop":
        bad_cuts.append(f"{entry_a['name']}: {site_a['label']} is in the middle of a {site_a['region']}")
    if site_b["region"] != "loop":
        bad_cuts.append(f"{entry_b['name']}: {site_b['label']} is in the middle of a {site_b['region']}")
    results.append(
        _result("cut-site", False,
                f"Cut through a structured element — {'; '.join(bad_cuts)}. Only loop cuts get past this filter.")
        if bad_cuts else
        _result("cut-site", True,
                f"Both cuts fall in flexible loops ({site_a['label']}, {site_b['label']}).")
    )

    # 2. Backbone join
    reach = geo["span"]
    extension = geo["joinDistance"] / reach if reach > 0 else math.inf
    taut_limit = TAUT_FRACTION - 0.1 * max(site_a["tension"], site_b["tension"])
    if geo["joinDistance"] > reach:
        results.append(_result("backbone-join", False,
                               f"Cut ends are {to_fixed(geo['joinDistance'])} nm apart and a {linker_units}-unit "
                               f"linker reaches at most {to_fixed(reach)} nm. Too far to bridge."))
    elif extension > taut_limit:
        results.append(_result("backbone-join", False,
                               f"A {linker_units}-unit linker would sit {to_fixed(extension * 100, 0)}% extended "
                               f"across a {to_fixed(geo['joinDistance'])} nm gap. An absurdly short linker under "
                               f"that much tension is a reject."))
    else:
        floppy = ", so the linker is floppy rather than taut" if extension < 0.15 else ""
        results.append(_result("backbone-join", True,
                               f"{to_fixed(geo['joinDistance'])} nm to bridge, {to_fixed(reach)} nm of linker "
                               f"({to_fixed(extension * 100, 0)}% extended){floppy}."))

    # 3. Clashes and chain breaks
    if geo["overlap"] > 0.3:
        results.append(_result("clash", False,
                               f"The two blobs interpenetrate by {to_fixed(geo['overlap'])} nm once laid out."))
    elif geo["surfaceGap"] > reach:
        results.append(_result("clash", False,
                               f"A {to_fixed(geo['surfaceGap'])} nm gap sits between the blob surfaces and the "
                               f"backbone cannot span it."))
    else:
        results.append(_result("clash", True,
                               f"No interpenetration ({to_fixed(max(0.0, -geo['overlap']))} nm clearance) and the "
                               f"surfaces are {to_fixed(geo['surfaceGap'])} nm apart."))

    # 4. Compactness
    rg = radius_of_gyration(geo)
    band = expected_rg_band(geo)
    if rg > band["high"]:
        results.append(_result("compactness", False,
                               f"Radius of gyration {to_fixed(rg)} nm against an expected {to_fixed(band['low'])}–"
                               f"{to_fixed(band['high'])} nm for this size. A dumbbell stretched well outside the band."))
    elif rg < band["low"]:
        results.append(_result("compactness", False,
                               f"Radius of gyration {to_fixed(rg)} nm is below the expected {to_fixed(band['low'])}–"
                               f"{to_fixed(band['high'])} nm band, which in this cartoon means the blobs are jammed together."))
    else:
        results.append(_result("compactness", True,
                               f"Radius of gyration {to_fixed(rg)} nm, inside the expected {to_fixed(band['low'])}–"
                               f"{to_fixed(band['high'])} nm band."))

    # 5. Buried core
    facing_a = _dot(geo["patchA"], geo["axis"])
    facing_b = _dot(geo["patchB"], _scale(geo["axis"], -1))
    exposed = []
    if facing_a < -0.4:
        exposed.append(f"{entry_a['name']}'s patch turns away from the join")
    if facing_b < -0.4:
        exposed.append(f"{entry_b['name']}'s patch turns away from the join")
    results.append(
        _result("buried-core", False, f"Hydrophobic patch left facing solvent — {' and '.join(exposed)}.")
        if exposed else
        _result("buried-core", True,
                f"Both hydrophobic patches end up pointing at the interface rather than out into solvent "
                f"({to_fixed(facing_a)}, {to_fixed(facing_b)}).")
    )

    # 6. Operating window
    pair = [entry_a, entry_b]
    t = intersect_windows(pair, "temp")
    p = intersect_windows(pair, "ph")
    if t["empty"] or p["empty"]:
        which = "temperature" if t["empty"] else "pH"
        results.append(_result("operating-window", False,
                               f"The two parents share no {which} window at all "
                               f"({entry_a['name']} vs {entry_b['name']})."))
    else:
        team = [e for e in team_entries if e and e["id"] not in (entry_a["id"], entry_b["id"])]
        with_team = intersect_windows([*pair, *team], "temp") if team else None
        with_team_ph = intersect_windows([*pair, *team], "ph") if team else None
        if with_team and (with_team["empty"] or with_team_ph["empty"]):
            results.append(_result("operating-window", False,
                                   f"The parents overlap at {_num(t['low'])}–{_num(t['high'])} °C / pH "
                                   f"{_num(p['low'])}–{_num(p['high'])}, but that does not overlap the rest of the lane."))
        else:
            tail = ""
            if with_team:
                tail = (f", and that still overlaps the rest of the lane ({_num(with_team['low'])}–"
                        f"{_num(with_team['high'])} °C, pH {_num(with_team_ph['low'])}–{_num(with_team_ph['high'])})")
            results.append(_result("operating-window", True,
                                   f"Parents share {_num(t['low'])}–{_num(t['high'])} °C and pH "
                                   f"{_num(p['low'])}–{_num(p['high'])}{tail}."))

    first_fail = next((r for r in results if not r["pass"]), None)
    return {
        "geometry": geo,
        "rg": rg,
        "rgBand": band,
        "results": results,
        "killedBy": first_fail["id"] if first_fail else None,
        "passed": first_fail is None,
    }


def splice_funnel(entry_a: dict, entry_b: dict, team_entries: list[dict] | None = None,
                  linker_choices: list[int] | None = None) -> dict[str, Any]:
    linker_choices = linker_choices or LINKER_CHOICES
    candidates = []
    for site_a in entry_a["domain"]["sites"]:
        for site_b in entry_b["domain"]["sites"]:
            for linker_units in linker_choices:
                verdict = run_filters(entry_a, site_a, entry_b, site_b, linker_units, team_entries)
                candidates.append({
                    "id": f"{entry_a['id']}:{site_a['id']}+{entry_b['id']}:{site_b['id']}@{linker_units}",
                    "siteA": site_a, "siteB": site_b, "linkerUnits": linker_units, **verdict,
                })

    remaining = len(candidates)
    funnel = []
    for f in FILTERS:
        killed = sum(1 for c in candidates if c["killedBy"] == f["id"])
        entering = remaining
        remaining -= killed
        funnel.append({**f, "killed": killed, "entering": entering, "leaving": remaining})

    return {
        "pairLabel": f"{entry_a['name']} + {entry_b['name']}",
        "went_in": len(candidates),
        "funnel": funnel,
        "survivors": [c for c in candidates if c["passed"]],
        "candidates": candidates,
        "verdictWording": PASS_VERDICT,
    }
