"""The cofactor balance sheet — Python half. Mirrors src/model/ledger.js."""

from __future__ import annotations

from typing import Any

from .compatibility import _family, cofactor_tokens

LEDGER_DISCLAIMER = (
    "Counts are per stage, not per molecule: this toy has no stoichiometry. A lane that "
    "balances here has only balanced a cartoon."
)

DONORS = ["ATP", "SAM", "acyl-CoA", "acetyl-CoA", "malonyl-CoA", "UDP-glucose", "UDP-sugar", "PAPS"]
METALS = ["Mg2+", "Ca2+", "Zn2+", "Ni2+", "Fe3+"]
PROSTHETIC = ["heme", "PLP", "TPP", "biotin"]

ACCEPTOR_RETURNS = {"ADP": "ATP"}

def donor_family(token: str) -> str:
    """Named alias for the cofactor pooling table in compatibility.py."""
    return _family(token)


def classify_cofactor(token: str) -> str:
    if token in DONORS:
        return "donor"
    if token in METALS:
        return "metal"
    if token in PROSTHETIC:
        return "prosthetic"
    if token in ACCEPTOR_RETURNS:
        return "acceptor"
    return "unknown"


def _push(d: dict[str, list[Any]], key: str, value: Any) -> None:
    d.setdefault(key, []).append(value)


def ledger(entries: list[dict[str, Any]]) -> dict[str, Any]:
    spends: dict[str, list[Any]] = {}
    returns: dict[str, list[Any]] = {}
    present: dict[str, list[Any]] = {}
    exhausts: list[dict[str, Any]] = []
    unknown: set[str] = set()

    for i, entry in enumerate(entries):
        stage = i + 1
        for token in cofactor_tokens(entry.get("cofactor")):
            kind = classify_cofactor(token)
            if kind == "donor":
                _push(spends, donor_family(token), {"stage": stage, "enzyme": entry, "token": token})
            elif kind == "acceptor":
                given = ACCEPTOR_RETURNS[token]
                _push(returns, donor_family(given),
                      {"stage": stage, "enzyme": entry, "token": token, "gives": given})
            elif kind in ("metal", "prosthetic"):
                _push(present, token, {"stage": stage, "enzyme": entry, "kind": kind})
            else:
                unknown.add(token)
        for token in entry.get("destroys", []):
            exhausts.append({"stage": stage, "enzyme": entry, "token": token, "family": donor_family(token)})

    families = sorted(set(spends) | set(returns))
    donors = []
    for family in families:
        spent = spends.get(family, [])
        back = returns.get(family, [])
        donors.append({
            "family": family,
            "spent": len(spent),
            "returned": len(back),
            "net": len(spent) - len(back),
            "spentBy": [{"stage": s["stage"], "id": s["enzyme"]["id"], "name": s["enzyme"]["name"],
                         "token": s["token"]} for s in spent],
            "returnedBy": [{"stage": s["stage"], "id": s["enzyme"]["id"], "name": s["enzyme"]["name"],
                            "token": s["token"]} for s in back],
        })

    needs_present = sorted(
        (
            {
                "token": token,
                "kind": uses[0]["kind"],
                "stages": [u["stage"] for u in uses],
                "names": [u["enzyme"]["name"] for u in uses],
            }
            for token, uses in present.items()
        ),
        key=lambda r: r["token"],
    )

    short = [d for d in donors if d["net"] > 0]

    return {
        "donors": donors,
        "needsPresent": needs_present,
        "exhausts": exhausts,
        "short": short,
        "balanced": len(short) == 0,
        "unknown": sorted(unknown),
        "disclaimer": LEDGER_DISCLAIMER,
    }


def regenerators(entries: list[dict[str, Any]],
                 catalogue_entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    book = ledger(entries)
    in_lane = {e["id"] for e in entries}
    out = []

    for deficit in book["short"]:
        partners = [
            c for c in catalogue_entries
            if c["id"] not in in_lane
            and any(classify_cofactor(t) == "acceptor"
                    and donor_family(ACCEPTOR_RETURNS[t]) == deficit["family"]
                    for t in cofactor_tokens(c.get("cofactor")))
        ]
        out.append({
            "family": deficit["family"],
            "net": deficit["net"],
            "partners": [
                {"id": p["id"], "name": p["name"],
                 "takes": next(t for t in cofactor_tokens(p.get("cofactor"))
                               if classify_cofactor(t) == "acceptor")}
                for p in partners
            ],
        })
    return out


def _list_tokens(tokens: list[str]) -> str:
    if len(tokens) == 1:
        return tokens[0]
    return f"{', '.join(tokens[:-1])} and {tokens[-1]}"


def _describe_short(short: list[dict[str, Any]]) -> str:
    parts = [f"{d['net']}× {d['family']}" for d in short]
    return f"This lane is a net consumer: {' and '.join(parts)} spent with nothing putting it back."


def check_ledger(entries: list[dict[str, Any]],
                 catalogue_entries: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if not entries:
        return {"id": "ledger", "colour": "grey",
                "message": "Add stages to total up what this lane spends.", "ledger": None}

    catalogue_entries = catalogue_entries or []
    book = ledger(entries)
    spent_total = sum(d["spent"] for d in book["donors"])

    if not spent_total:
        presence = ""
        if book["needsPresent"]:
            tokens = _list_tokens([p["token"] for p in book["needsPresent"]])
            presence = (f" It still needs {tokens} present throughout, which a pot either has "
                        f"or does not.")
        return {"id": "ledger", "colour": "green",
                "message": f"Nothing in this lane spends a group donor, so there is no pool to run down.{presence}",
                "ledger": book}

    if book["balanced"]:
        parts = "; ".join(f"{d['spent']}× {d['family']} out, {d['returned']} back" for d in book["donors"])
        return {"id": "ledger", "colour": "green",
                "message": f"This lane puts back every donor it spends: {parts}.",
                "ledger": book}

    suggestions = regenerators(entries, catalogue_entries)
    named = [p["name"] for s in suggestions for p in s["partners"]]
    if named:
        fix = (f" {named[0]} runs on {suggestions[0]['partners'][0]['takes']} and would hand "
               f"{suggestions[0]['family']} back.")
    else:
        fix = (f" Nothing in this catalogue regenerates {book['short'][0]['family']}, so a real route "
               f"would bolt on a regeneration system this toy does not carry.")

    return {"id": "ledger", "colour": "amber",
            "message": f"{_describe_short(book['short'])}{fix}",
            "ledger": book, "suggestions": suggestions}
