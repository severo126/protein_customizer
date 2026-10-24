"""Rate matching and thermodynamic drive — Python half. Mirrors src/model/kinetics.js."""

from __future__ import annotations

from typing import Any

# _produced_groups is module-private in compatibility.py; the JavaScript half
# exports its equivalent publicly, and this should follow when that file is
# next touched. Importing it is still better than keeping a second copy.
from .compatibility import _produced_groups, cofactor_tokens
from .ledger import classify_cofactor
from .molecules import group_meta

RATE_ORDER = {"slow": 0, "moderate": 1, "fast": 2}
RATE_LABEL = {"slow": "slow", "moderate": "moderate", "fast": "fast"}


def _light(id_: str, colour: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"id": id_, "colour": colour, "message": message, **extra}


def _spends_donor(entry: dict[str, Any]) -> bool:
    return any(classify_cofactor(t) == "donor" for t in cofactor_tokens(entry.get("cofactor")))


def check_kinetics(entries: list[dict[str, Any]]) -> dict[str, Any]:
    if len(entries) < 2:
        return _light("kinetics", "grey",
                      "Add at least two stages to check whether each one can keep up with the last.")

    gaps = []
    for i in range(len(entries) - 1):
        up, down = entries[i], entries[i + 1]
        drop = RATE_ORDER[up["rate"]] - RATE_ORDER[down["rate"]]
        if drop <= 0:
            continue
        groups = _produced_groups(up)
        group = groups[0] if groups else None
        poisons = bool(group) and group in down.get("inhibitedBy", [])
        gaps.append({"stage": i + 1, "up": up, "down": down, "drop": drop,
                     "group": group, "poisons": poisons})

    if not gaps:
        return _light("kinetics", "green",
                      "No stage in this lane outruns the one after it, so nothing should pile up "
                      "in the middle.", gaps=gaps)

    deadlock = next((g for g in gaps if g["poisons"]), None)
    if deadlock:
        name = group_meta(deadlock["group"])["label"]
        return _light(
            "kinetics", "red",
            f"Stage {deadlock['stage']} ({deadlock['up']['name']}, "
            f"{RATE_LABEL[deadlock['up']['rate']]}) outruns stage {deadlock['stage'] + 1} "
            f"({deadlock['down']['name']}, {RATE_LABEL[deadlock['down']['rate']]}), so {name} "
            f"builds up — and {deadlock['down']['name']} is itself listed as inhibited by {name}, "
            f"so the build-up slows down the only stage that could clear it.",
            gaps=gaps, deadlock=deadlock)

    # JavaScript's reduce keeps the FIRST maximum, because it only replaces on a
    # strictly greater value. Mirror that rather than relying on max()'s tie rule.
    worst = next(g for g in gaps if g["drop"] == max(x["drop"] for x in gaps))
    group_name = group_meta(worst["group"])["label"] if worst["group"] else "the intermediate"
    extra = f" ({len(gaps)} such steps in this lane.)" if len(gaps) > 1 else ""
    return _light(
        "kinetics", "amber",
        f"Stage {worst['stage']} ({worst['up']['name']}) is {RATE_LABEL[worst['up']['rate']]} and "
        f"stage {worst['stage'] + 1} ({worst['down']['name']}) is "
        f"{RATE_LABEL[worst['down']['rate']]}, so {group_name} piles up waiting to be cleared.{extra}",
        gaps=gaps, worst=worst)


def check_drive(entries: list[dict[str, Any]]) -> dict[str, Any]:
    if not entries:
        return _light("drive", "grey",
                      "Add stages to check whether each step will go forward on its own.")

    uphill = []
    for i, entry in enumerate(entries):
        if entry["drive"] != "uphill":
            continue
        uphill.append({
            "stage": i + 1,
            "entry": entry,
            "pulled": entries[i + 1] if i < len(entries) - 1 else None,
            "paid": _spends_donor(entry),
        })

    if not uphill:
        near = [e for e in entries if e["drive"] == "near-equilibrium"]
        if near:
            if len(near) == 1:
                subject = f"{near[0]['name']} sits"
                pronoun = "it"
            else:
                subject = f"{len(near)} stages sit"
                pronoun = "they"
            return _light(
                "drive", "green",
                f"Every step here goes forward on its own, though {subject} near equilibrium, so "
                f"{pronoun} will run in either direction depending on what is piled up on each side.",
                uphill=uphill, near=[e["id"] for e in near])
        return _light("drive", "green", "Every step in this lane goes downhill on its own.",
                      uphill=uphill, near=[])

    stranded = next((u for u in uphill if not u["pulled"] and not u["paid"]), None)
    if stranded:
        return _light(
            "drive", "amber",
            f"Stage {stranded['stage']} ({stranded['entry']['name']}) sits against its own "
            f"equilibrium and nothing follows it to take the product away, so it has no reason to "
            f"go forward. A faster enzyme would not help; a stage after it would.",
            uphill=uphill)

    rescued = next((u for u in uphill if u["pulled"]), None)
    if rescued:
        return _light(
            "drive", "green",
            f"Stage {rescued['stage']} ({rescued['entry']['name']}) barely goes on its own, but "
            f"stage {rescued['stage'] + 1} ({rescued['pulled']['name']}) keeps taking the product "
            f"away, and that is what makes it run.",
            uphill=uphill)

    paid = uphill[0]
    donor = next(t for t in cofactor_tokens(paid["entry"].get("cofactor"))
                 if classify_cofactor(t) == "donor")
    return _light(
        "drive", "green",
        f"Stage {paid['stage']} ({paid['entry']['name']}) is uphill on its own and pays for it by "
        f"spending {donor}.",
        uphill=uphill)


def kinetics_lights(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [check_kinetics(entries), check_drive(entries)]
