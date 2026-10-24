"""Could anything actually make this? — Python half. Mirrors src/model/hosts.js."""

from __future__ import annotations

from typing import Any

from .compatibility import cofactor_tokens
from .ledger import classify_cofactor

HOST_DISCLAIMER = (
    "A coarse cartoon of what four common expression routes can and cannot provide. Real hosts "
    "are engineered around every one of these limits, and plenty of enzymes are made in places "
    "this table says they cannot be."
)

# Short noun phrases, so a list of two or three reads as a sentence. The
# explanation lives in REQUIREMENT_WHY rather than inside the phrase.
REQUIREMENT_NOTES = {
    "disulfide": "disulfide bonds",
    "secretion": "a secretory pathway",
    "glycosylation": "glycosylation",
    "membrane": "a membrane to sit in",
    "heme": "a heme group",
    "PLP": "a pyridoxal phosphate group",
    "TPP": "a thiamine pyrophosphate group",
    "biotin": "a biotin arm",
    "Mg2+": "magnesium",
    "Ca2+": "calcium",
    "Zn2+": "zinc",
    "Ni2+": "nickel",
    "Fe3+": "iron",
}

REQUIREMENT_WHY = {
    "disulfide": "Disulfide bonds do not form in a reducing cytoplasm.",
    "secretion": "It folds on the way out, so something has to secrete it.",
    "glycosylation": "Sugars are added in a eukaryote\u2019s secretory pathway.",
    "membrane": "It sits in a membrane rather than in solution.",
    "heme": "The host has to make heme, or be fed it.",
    "PLP": "The host has to supply the pyridoxal phosphate cofactor.",
    "TPP": "The host has to supply the thiamine pyrophosphate cofactor.",
    "biotin": "The host has to attach the biotin arm.",
    "Mg2+": "The pot has to contain magnesium.",
    "Ca2+": "The pot has to contain calcium.",
    "Zn2+": "The pot has to contain zinc.",
    "Ni2+": "Nickel is not normally available and has to be supplied.",
    "Fe3+": "The pot has to contain iron.",
}

HOSTS = [
    {
        "id": "ecoli-cytoplasm",
        "label": "E. coli cytoplasm",
        "blurb": "The default and the cheapest. Reducing, so disulfides do not form, and no "
                 "machinery for sugars or membranes.",
        "provides": ["Mg2+", "Ca2+", "Zn2+", "Fe3+", "PLP", "TPP", "biotin"],
    },
    {
        "id": "ecoli-periplasm",
        "label": "E. coli periplasm",
        "blurb": "Oxidising, so disulfides form and secreted enzymes fold. Still a bacterium: no "
                 "sugars, no organelles.",
        "provides": ["Mg2+", "Ca2+", "Zn2+", "Fe3+", "PLP", "TPP", "biotin", "disulfide",
                     "secretion"],
    },
    {
        "id": "yeast",
        "label": "Yeast",
        "blurb": "A eukaryote with a secretory pathway, so sugars, membranes and heme are all "
                 "available. Slower and more work.",
        "provides": ["Mg2+", "Ca2+", "Zn2+", "Ni2+", "Fe3+", "PLP", "TPP", "biotin", "heme",
                     "disulfide", "secretion", "glycosylation", "membrane"],
    },
    {
        "id": "cell-free",
        "label": "Cell-free",
        "blurb": "No cell at all, so you set the conditions and add what you like. Nothing is "
                 "secreted, nothing is glycosylated, and there is no membrane to sit in.",
        "provides": ["Mg2+", "Ca2+", "Zn2+", "Ni2+", "Fe3+", "PLP", "TPP", "biotin", "heme",
                     "disulfide"],
    },
]

DEFAULT_HOST = "ecoli-cytoplasm"


def host(id_: str) -> dict[str, Any]:
    for h in HOSTS:
        if h["id"] == id_:
            return h
    raise ValueError(f"unknown host: {id_}")


def requirements(entry: dict[str, Any]) -> list[dict[str, str]]:
    out = []
    for token in entry.get("needs", []):
        out.append({"token": token, "kind": "structural"})
    for token in cofactor_tokens(entry.get("cofactor")):
        kind = classify_cofactor(token)
        if kind in ("metal", "prosthetic"):
            out.append({"token": token, "kind": kind})
    return out


def _list_notes(tokens: list[str]) -> str:
    notes = [REQUIREMENT_NOTES.get(t, t) for t in tokens]
    if len(notes) == 1:
        return notes[0]
    return f"{', '.join(notes[:-1])} and {notes[-1]}"


def supports(host_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    h = host(host_id)
    missing = [r for r in requirements(entry) if r["token"] not in h["provides"]]
    reason = None
    if missing:
        that = "that" if len(missing) == 1 else "those"
        reason = (f"{entry['name']} needs {_list_notes([m['token'] for m in missing])}, and "
                  f"{h['label']} cannot provide {that}.")
    return {"ok": len(missing) == 0, "missing": missing, "reason": reason}


def filter_by_host(host_id: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    available = []
    blocked = []
    for entry in entries:
        v = supports(host_id, entry)
        if v["ok"]:
            available.append(entry)
        else:
            blocked.append({"entry": entry, "missing": v["missing"], "reason": v["reason"]})
    return {"host": host(host_id), "available": available, "blocked": blocked}


def check_host(host_id: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    h = host(host_id)
    if not entries:
        return {"id": "host", "colour": "grey",
                "message": f"Add stages to check whether {h['label']} could make them.",
                "blocked": []}

    blocked = []
    for i, entry in enumerate(entries):
        v = supports(host_id, entry)
        if not v["ok"]:
            blocked.append({"stage": i + 1, "entry": entry, **v})

    if not blocked:
        need = "stage needs" if len(entries) == 1 else "stages need"
        return {"id": "host", "colour": "green",
                "message": f"{h['label']} can supply everything these {len(entries)} {need}.",
                "blocked": blocked}

    first = blocked[0]
    extra = f" ({len(blocked)} stages in this lane.)" if len(blocked) > 1 else ""
    return {"id": "host", "colour": "red",
            "message": f"Stage {first['stage']} is the problem before any chemistry starts: "
                       f"{first['reason']}{extra}",
            "blocked": blocked}


def why_missing(missing: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Why each missing requirement is missing, for the card under a blocked entry."""
    return [{"token": m["token"], "why": REQUIREMENT_WHY.get(m["token"])} for m in missing]
