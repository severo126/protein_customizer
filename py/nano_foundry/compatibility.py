"""Team compatibility — Python half. Mirrors src/model/compatibility.js."""

from __future__ import annotations

from typing import Any

from .molecules import group_meta
from .numbers import to_fixed

COFACTOR_FAMILY = {
    "acetyl-CoA": "acyl-CoA",
    "malonyl-CoA": "acyl-CoA",
    "acyl-CoA": "acyl-CoA",
    "UDP-glucose": "UDP-sugar",
    "UDP-sugar": "UDP-sugar",
}

INHIBITION_NOTES = {
    "phosphate": "free phosphate building up in the pot sits back down in phosphate-handling active sites",
    "sugar": "released sugar crowds the sugar-binding site it came out of",
    "acyl": "free acyl groups re-occupy the acyl pocket",
    "amine": "free amine competes for the amine-handling site",
    "carboxyl": "carboxylate build-up blocks the carboxyl site",
    "methyl": "the methylated product sits in the donor pocket",
    "carbonyl": "the carbonyl product lingers in the site that made it",
    "sulfate": "free sulfate competes with the sulfate donor",
    "amide": "the amide product occupies the site it left",
}


def cofactor_tokens(cofactor: str | None) -> list[str]:
    if not cofactor or cofactor == "none":
        return []
    return [t.strip() for t in cofactor.split(" + ") if t.strip()]


def _family(token: str) -> str:
    return COFACTOR_FAMILY.get(token, token)


def _num(x: float) -> str:
    """Windows print as JavaScript prints them: 8 rather than 8.0."""
    return str(int(x)) if float(x).is_integer() else str(x)


def intersect_windows(entries: list[dict[str, Any]], key: str) -> dict[str, Any]:
    if not entries:
        return {"empty": True, "low": None, "high": None, "blame": None}

    low_entry = entries[0]
    high_entry = entries[0]
    for e in entries:
        if e[key][0] > low_entry[key][0]:
            low_entry = e
        if e[key][1] < high_entry[key][1]:
            high_entry = e

    low = low_entry[key][0]
    high = high_entry[key][1]
    return {
        "empty": high < low,
        "low": low,
        "high": high,
        "width": max(0, high - low),
        "blame": {"floor": low_entry, "ceiling": high_entry} if high < low else None,
    }


def _light(id_: str, colour: str, message: str, **extra: Any) -> dict[str, Any]:
    return {"id": id_, "colour": colour, "message": message, **extra}


def check_temperature(entries: list[dict[str, Any]]) -> dict[str, Any]:
    if not entries:
        return _light("temp", "grey", "Add stages to check the shared temperature window.")
    w = intersect_windows(entries, "temp")
    if w["empty"]:
        f, c = w["blame"]["floor"], w["blame"]["ceiling"]
        return _light("temp", "red",
                      f"No shared temperature at all. {f['name']} will not run below {_num(f['temp'][0])} °C "
                      f"and {c['name']} gives up above {_num(c['temp'][1])} °C.", window=w)
    colour = "amber" if w["width"] < 5 else "green"
    tail = ", which is a narrow strip to hold in a real pot" if colour == "amber" else ""
    return _light("temp", colour, f"Shared window {_num(w['low'])}–{_num(w['high'])} °C{tail}.", window=w)


def check_ph(entries: list[dict[str, Any]]) -> dict[str, Any]:
    if not entries:
        return _light("ph", "grey", "Add stages to check the shared pH window.")
    w = intersect_windows(entries, "ph")
    if w["empty"]:
        f, c = w["blame"]["floor"], w["blame"]["ceiling"]
        return _light("ph", "red",
                      f"No shared pH at all. {f['name']} needs pH {_num(f['ph'][0])} or above and "
                      f"{c['name']} needs pH {_num(c['ph'][1])} or below.", window=w)
    colour = "amber" if w["width"] < 0.5 else "green"
    tail = ", a very thin band" if colour == "amber" else ""
    return _light("ph", colour, f"Shared window pH {_num(w['low'])}–{_num(w['high'])}{tail}.", window=w)


def check_cofactors(entries: list[dict[str, Any]]) -> dict[str, Any]:
    if not entries:
        return _light("cofactor", "grey", "Add stages to check cofactor clashes.")
    clashes = []
    for i, eater in enumerate(entries):
        for destroyed in eater.get("destroys", []):
            for needer in entries[i + 1:]:
                needs = [_family(t) for t in cofactor_tokens(needer.get("cofactor"))]
                if _family(destroyed) in needs:
                    clashes.append({"stage": i + 1, "eater": eater, "needer": needer, "cofactor": destroyed})
    if not clashes:
        return _light("cofactor", "green", "No stage eats a cofactor a later stage still needs.")
    c = clashes[0]
    extra = f" ({len(clashes)} clashes in total.)" if len(clashes) > 1 else ""
    return _light("cofactor", "red",
                  f"{c['eater']['name']} at stage {c['stage']} consumes {c['cofactor']}, which "
                  f"{c['needer']['name']} needs later.{extra}", clashes=clashes)


def _produced_groups(entry: dict[str, Any]) -> list[str]:
    a = entry["action"]
    out: list[str] = []
    if a["op"] == "add" and a["group"] not in out:
        out.append(a["group"])
    if a["op"] == "remove":
        out.append(a["group"])
        if a.get("yields") and a["yields"] not in out:
            out.append(a["yields"])
    if a["op"] == "join" and a["group"] not in out:
        out.append(a["group"])
    return out


def check_inhibition(entries: list[dict[str, Any]]) -> dict[str, Any]:
    if not entries:
        return _light("inhibition", "grey", "Add stages to check product inhibition.")
    hits = []
    for j, later in enumerate(entries):
        produced = _produced_groups(later)
        for i, earlier in enumerate(entries[:j]):
            for g in produced:
                if g in earlier.get("inhibitedBy", []):
                    hits.append({"earlier": earlier, "later": later, "group": g,
                                 "earlier_stage": i + 1, "later_stage": j + 1})
    if not hits:
        return _light("inhibition", "green",
                      "No stage in this lane makes something an earlier stage is listed as sensitive to.")
    h = hits[0]
    note = f" — in the cartoon, {INHIBITION_NOTES[h['group']]}" if h["group"] in INHIBITION_NOTES else ""
    extra = f" ({len(hits)} pairs in total.)" if len(hits) > 1 else ""
    return _light("inhibition", "amber",
                  f"Stage {h['later_stage']} ({h['later']['name']}) frees {group_meta(h['group'])['label']}, "
                  f"and stage {h['earlier_stage']} ({h['earlier']['name']}) is listed as inhibited by "
                  f"it{note}.{extra}", hits=hits)


def team_report(entries: list[dict[str, Any]]) -> dict[str, Any]:
    lights = [check_temperature(entries), check_ph(entries), check_cofactors(entries), check_inhibition(entries)]
    colours = [l["colour"] for l in lights]
    if "red" in colours:
        worst = "red"
    elif "amber" in colours:
        worst = "amber"
    elif all(c == "grey" for c in colours):
        worst = "grey"
    else:
        worst = "green"
    return {"lights": lights, "worst": worst}
