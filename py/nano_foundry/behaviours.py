"""The workstation, mirrored from src/model/behaviours.js.

Search the fixed catalogue by the behaviour you want rather than by name. Every
behaviour is read off a field that already exists in src/data/catalogue.json.
There is no database behind this module and no way to add an entry to the forty.

A "build" is a named set of one, two or three catalogue domains. It is not a
protein and not a design, and nothing here emits a sequence of any kind. That a
build "covers" a behaviour means only that a committed catalogue field says so.

Held to byte-for-byte agreement with the JavaScript by
src/data/behaviour-cases.json and py/tests/test_behaviours_parity.py.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any, Iterable

from .compatibility import _family, cofactor_tokens, intersect_windows, team_report
from .molecules import group_meta, pretty_core

COMPOSE_NOTE = (
    "A build is a named set of catalogue domains and cartoon geometry. Covering a "
    "behaviour means only that a committed field in the catalogue says so. It is not a "
    "prediction that the team would run, fold, express, or exist."
)

CLOSEST_NOTE = (
    "These are the entries and pairings of the fixed forty that cover the most of what "
    'you asked for. "Closest" is a count of covered behaviours, not a ranking of quality.'
)

WANT_SCOPE = {
    "grabs": "any",
    "adds": "any",
    "removes": "any",
    "joins": "any",
    "rearranges": "any",
    "runs-on": "any",
    "cofactor-free": "all",
    "unbothered-by": "all",
    "spares": "all",
    "temp-at": "team",
    "ph-at": "team",
}

TEMP_STEP = 5
PH_STEP = 0.5
SHORTLIST = 60
DEFAULT_LIMIT = 6
MAX_TEAM = 3

_LIGHT_RANK = {"green": 0, "grey": 1, "amber": 2, "red": 3}


def _num(x: float) -> str:
    """Render a window bound the way the JavaScript does: 7 not 7.0."""
    return str(int(x)) if float(x).is_integer() else str(x)


def want_id(want: dict[str, Any]) -> str:
    arg = want.get("arg")
    return want["kind"] if arg is None else f"{want['kind']}:{_num(arg) if isinstance(arg, (int, float)) else arg}"


def article(word: str) -> str:
    return f"an {word}" if word[:1].lower() in "aeiou" else f"a {word}"


def want_label(want: dict[str, Any]) -> str:
    kind = want["kind"]
    arg = want.get("arg")

    def g(name: str) -> str:
        return article(group_meta(name)["label"])

    if kind == "grabs":
        return f"grabs a molecule carrying {g(arg)}"
    if kind == "adds":
        return f"puts {g(arg)} on"
    if kind == "removes":
        return f"takes {g(arg)} off"
    if kind == "joins":
        return f"joins groups into {g(arg)}"
    if kind == "rearranges":
        return f"rearranges a {pretty_core(arg)} skeleton"
    if kind == "temp-at":
        return f"works at {_num(arg)} °C"
    if kind == "ph-at":
        return f"works at pH {_num(arg)}"
    if kind == "runs-on":
        return f"runs on {arg}"
    if kind == "cofactor-free":
        return "needs no cofactor"
    if kind == "spares":
        return f"leaves {arg} alone for the rest of the team"
    if kind == "unbothered-by":
        return f"is not listed as inhibited by {group_meta(arg)['label']}"
    return f"{kind} {arg or ''}".strip()


def handles(entry: dict[str, Any]) -> list[str]:
    """The groups an entry has to find on the molecule before it does anything."""
    action = entry["action"]
    out = list(action.get("requires") or [])
    if action["op"] == "remove" and action.get("group"):
        out.append(action["group"])
    seen: list[str] = []
    for g in out:
        if g not in seen:
            seen.append(g)
    return seen


def entry_satisfies(entry: dict[str, Any], want: dict[str, Any]) -> bool:
    kind = want["kind"]
    arg = want.get("arg")
    action = entry["action"]

    if kind == "grabs":
        return arg in handles(entry)
    if kind == "adds":
        return action["op"] == "add" and action.get("group") == arg
    if kind == "removes":
        return action["op"] == "remove" and action.get("group") == arg
    if kind == "joins":
        return action["op"] == "join" and action.get("group") == arg
    if kind == "rearranges":
        return action["op"] == "rearrange" and action.get("from") == arg
    if kind == "temp-at":
        return entry["temp"][0] <= arg <= entry["temp"][1]
    if kind == "ph-at":
        return entry["ph"][0] <= arg <= entry["ph"][1]
    if kind == "runs-on":
        return _family(arg) in [_family(t) for t in cofactor_tokens(entry["cofactor"])]
    if kind == "cofactor-free":
        return len(cofactor_tokens(entry["cofactor"])) == 0
    if kind == "spares":
        return not any(_family(d) == _family(arg) for d in entry.get("destroys") or [])
    if kind == "unbothered-by":
        return arg not in (entry.get("inhibitedBy") or [])
    return False


def behaviour_vocabulary(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, set[str]] = {
        k: set() for k in ("grabs", "adds", "removes", "joins", "rearranges", "runs-on", "unbothered-by")
    }
    for e in entries:
        action = e["action"]
        buckets["grabs"].update(handles(e))
        if action["op"] == "add" and action.get("group"):
            buckets["adds"].add(action["group"])
        if action["op"] == "remove" and action.get("group"):
            buckets["removes"].add(action["group"])
        if action["op"] == "join" and action.get("group"):
            buckets["joins"].add(action["group"])
        if action["op"] == "rearrange" and action.get("from"):
            buckets["rearranges"].add(action["from"])
        buckets["runs-on"].update(cofactor_tokens(e["cofactor"]))
        buckets["unbothered-by"].update(e.get("inhibitedBy") or [])

    wants: list[dict[str, Any]] = []
    for kind in ("grabs", "adds", "removes", "joins", "rearranges", "runs-on", "unbothered-by"):
        for arg in sorted(buckets[kind]):
            wants.append({"kind": kind, "arg": arg})

    t_low = min(e["temp"][0] for e in entries)
    t_high = max(e["temp"][1] for e in entries)
    t = -(-t_low // TEMP_STEP) * TEMP_STEP
    while t <= t_high:
        wants.append({"kind": "temp-at", "arg": t})
        t += TEMP_STEP

    p_low = min(e["ph"][0] for e in entries)
    p_high = max(e["ph"][1] for e in entries)
    steps = 0
    start = -(-p_low // PH_STEP) * PH_STEP
    p = start
    while p <= p_high + 1e-9:
        wants.append({"kind": "ph-at", "arg": round(p, 1)})
        steps += 1
        p = round(start + steps * PH_STEP, 10)

    wants.append({"kind": "cofactor-free", "arg": None})
    for arg in sorted(buckets["runs-on"]):
        wants.append({"kind": "spares", "arg": arg})

    out = []
    for w in wants:
        hits = [e["id"] for e in entries if entry_satisfies(e, w)]
        if hits:
            out.append({**w, "id": want_id(w), "label": want_label(w), "scope": WANT_SCOPE[w["kind"]], "entries": hits})
    return out


def cover_for(team: list[dict[str, Any]], want: dict[str, Any]) -> dict[str, Any]:
    scope = WANT_SCOPE[want["kind"]]
    if not team:
        return {"met": False, "by": [], "detail": "No entries picked yet."}

    if scope == "team":
        key = "temp" if want["kind"] == "temp-at" else "ph"
        w = intersect_windows(team, key)
        unit = " °C" if key == "temp" else ""
        prefix = "" if key == "temp" else "pH "
        long_key = "temperature" if key == "temp" else "pH"
        if w["empty"]:
            floor, ceiling = w["blame"]["floor"], w["blame"]["ceiling"]
            return {
                "met": False,
                "by": [],
                "detail": (
                    f"This team has no shared {long_key} window at all: {floor['name']} needs "
                    f"{prefix}{_num(floor[key][0])}{unit} or above and {ceiling['name']} needs "
                    f"{prefix}{_num(ceiling[key][1])}{unit} or below."
                ),
            }
        inside = w["low"] <= want["arg"] <= w["high"]
        if inside:
            detail = (
                f"The shared window is {prefix}{_num(w['low'])}–{_num(w['high'])}{unit}, "
                f"which contains {prefix}{_num(want['arg'])}{unit}."
            )
        else:
            detail = (
                f"The shared window is only {prefix}{_num(w['low'])}–{_num(w['high'])}{unit}, "
                f"which leaves {prefix}{_num(want['arg'])}{unit} outside it."
            )
        return {"met": inside, "by": [e["id"] for e in team] if inside else [], "detail": detail}

    yes = [e for e in team if entry_satisfies(e, want)]
    if scope == "all":
        no = [e for e in team if not entry_satisfies(e, want)]
        if not no:
            return {"met": True, "by": [e["id"] for e in team], "detail": "Every member of this build holds."}
        names = " and ".join(e["name"] for e in no)
        return {"met": False, "by": [], "detail": f"{names} {'does' if len(no) == 1 else 'do'} not."}

    if yes:
        names = " and ".join(e["name"] for e in yes)
        detail = f"{names} {'does' if len(yes) == 1 else 'do'} this."
    else:
        detail = "No member of this build does this."
    return {"met": bool(yes), "by": [e["id"] for e in yes], "detail": detail}


def coverage(team: list[dict[str, Any]], wants: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = []
    for want in wants:
        rows.append(
            {
                "want": want,
                "id": want_id(want),
                "label": want_label(want),
                "scope": WANT_SCOPE[want["kind"]],
                **cover_for(team, want),
            }
        )
    return {
        "rows": rows,
        "covered": sum(1 for r in rows if r["met"]),
        "total": len(rows),
        "missing": [r["id"] for r in rows if not r["met"]],
    }


def build_verdict(cov: dict[str, Any], worst: str) -> dict[str, str]:
    """The only two things a build is ever allowed to be called."""
    if cov["covered"] < cov["total"]:
        short = cov["total"] - cov["covered"]
        return {
            "headline": "Not everything you asked for",
            "detail": (
                f"This build covers {cov['covered']} of {cov['total']}. {short} "
                f"behaviour{'' if short == 1 else 's'} went uncovered — they are listed beside it."
            ),
        }
    if worst == "red":
        return {
            "headline": "Ruled out by this toy",
            "detail": (
                "Every behaviour you asked for is covered, but a cartoon compatibility check went "
                "red. The light says which two entries caused it."
            ),
        }
    return {
        "headline": "Nothing here ruled this out",
        "detail": (
            "Every behaviour you asked for is named by a committed catalogue field, and no cartoon "
            "compatibility check went red. That is the absence of a red flag from a cartoon, and "
            "nothing more."
        ),
    }


def compose_builds(
    entries: list[dict[str, Any]],
    wants: list[dict[str, Any]],
    limit: int = DEFAULT_LIMIT,
    max_team: int = MAX_TEAM,
) -> dict[str, Any]:
    impossible = [
        {"id": want_id(w), "label": want_label(w)}
        for w in wants
        if not any(entry_satisfies(e, w) for e in entries)
    ]

    if not wants:
        return {
            "builds": [],
            "impossible": impossible,
            "searchedSizes": [],
            "wants": [],
            "note": COMPOSE_NOTE,
            "closestNote": CLOSEST_NOTE,
            "perfect": False,
        }

    scored: list[tuple[list[dict[str, Any]], dict[str, Any]]] = []
    searched_sizes: list[int] = []
    best = -1

    for size in range(1, min(max_team, len(entries)) + 1):
        if size > 1 and best >= len(wants):
            break
        searched_sizes.append(size)
        for combo in combinations(entries, size):
            cov = coverage(list(combo), wants)
            best = max(best, cov["covered"])
            scored.append((list(combo), cov))

    def ids(combo: list[dict[str, Any]]) -> str:
        return "+".join(e["id"] for e in combo)

    scored.sort(key=lambda sc: (-sc[1]["covered"], len(sc[0]), ids(sc[0])))

    shortlist = []
    for combo, cov in scored[:SHORTLIST]:
        team = team_report(combo)
        shortlist.append(
            {
                "id": ids(combo),
                "entries": combo,
                "entryIds": [e["id"] for e in combo],
                "label": " + ".join(e["name"] for e in combo),
                "domains": [
                    {"parent": e["name"], "parentId": e["id"], "domain": e["domain"]["label"]} for e in combo
                ],
                "covered": cov["covered"],
                "total": cov["total"],
                "coverage": cov["rows"],
                "missing": cov["missing"],
                "lights": team["lights"],
                "worst": team["worst"],
                "verdict": build_verdict(cov, team["worst"]),
            }
        )

    shortlist.sort(key=lambda b: (-b["covered"], _LIGHT_RANK[b["worst"]], len(b["entries"]), b["id"]))
    builds = shortlist[:limit]

    return {
        "builds": builds,
        "impossible": impossible,
        "searchedSizes": searched_sizes,
        "wants": [{"id": want_id(w), "label": want_label(w), "scope": WANT_SCOPE[w["kind"]]} for w in wants],
        "note": COMPOSE_NOTE,
        "closestNote": CLOSEST_NOTE,
        "perfect": bool(builds) and builds[0]["covered"] == len(wants) and builds[0]["worst"] != "red",
    }
