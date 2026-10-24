"""The bench lane — Python half. Mirrors src/model/pipeline.js."""

from __future__ import annotations

from typing import Any

from .numbers import js_round, to_fixed
from .molecules import Molecule, describe, group_meta, has_groups, pretty_core, remove_groups

SCORE_DISCLAIMER = (
    "Foundry Score is a made-up number with made-up units. It is not a yield, a turnover, "
    "a rate or a prediction."
)


def _list_groups(groups: list[str]) -> str:
    counts: dict[str, int] = {}
    for g in groups:
        counts[g] = counts.get(g, 0) + 1
    parts = [
        f"{n} {group_meta(g)['label']} groups" if n > 1 else f"a {group_meta(g)['label']}"
        for g, n in counts.items()
    ]
    return " and ".join(parts)


def run_stage(mol: Molecule, entry: dict[str, Any]) -> dict[str, Any]:
    a = entry["action"]
    op = a["op"]

    def mismatch(why: str) -> dict[str, Any]:
        return {"ok": False, "enzyme_id": entry["id"], "input": mol, "product": None,
                "stall_reason": f"{entry['name']} {why}."}

    if op == "add":
        if not has_groups(mol, a["requires"]):
            return mismatch(
                f"needs {_list_groups(a['requires'])} on the input to hang a "
                f"{group_meta(a['group'])['label']} onto, and this molecule has none free"
            )
        product = mol.with_groups([*mol.groups, a["group"]])
        return {"ok": True, "enzyme_id": entry["id"], "input": mol, "product": product,
                "what": f"added a {group_meta(a['group'])['label']}"}

    if op == "remove":
        if not has_groups(mol, [a["group"]]):
            return mismatch(
                f"only cuts off a {group_meta(a['group'])['label']}, and this molecule does not carry one"
            )
        groups = remove_groups(mol.groups, [a["group"]])
        if a.get("yields"):
            groups.append(a["yields"])
        what = f"removed a {group_meta(a['group'])['label']}"
        if a.get("yields"):
            what += f", leaving a {group_meta(a['yields'])['label']}"
        return {"ok": True, "enzyme_id": entry["id"], "input": mol, "product": mol.with_groups(groups), "what": what}

    if op == "rearrange":
        if mol.core != a["from"]:
            return mismatch(
                f"only rearranges a {pretty_core(a['from'])} skeleton, and this stage handed it "
                f"{pretty_core(mol.core)}"
            )
        return {"ok": True, "enzyme_id": entry["id"], "input": mol, "product": mol.with_core(a["to"]),
                "what": f"rearranged the skeleton into {pretty_core(a['to'])}"}

    if op == "join":
        if not has_groups(mol, a["requires"]):
            return mismatch(
                f"needs {_list_groups(a['requires'])} on the same molecule to form a new "
                f"{group_meta(a['group'])['label']}"
            )
        groups = remove_groups(mol.groups, a["requires"])
        groups.append(a["group"])
        return {"ok": True, "enzyme_id": entry["id"], "input": mol, "product": mol.with_groups(groups),
                "what": f"joined {_list_groups(a['requires'])} into a {group_meta(a['group'])['label']}"}

    return mismatch(f'has no rule this toy knows how to run (op "{op}")')


def run_pipeline(start: Molecule, entries: list[dict[str, Any]]) -> dict[str, Any]:
    stages: list[dict[str, Any]] = []
    current = start
    stalled = False
    stalled_at = -1

    for i, entry in enumerate(entries):
        if stalled:
            stages.append({"index": i, "enzyme": entry, "state": "unreached", "input": None, "product": None})
            continue
        r = run_stage(current, entry)
        if r["ok"]:
            stages.append({"index": i, "enzyme": entry, "state": "ran", "input": r["input"],
                           "product": r["product"], "what": r["what"]})
            current = r["product"]
        else:
            stalled = True
            stalled_at = i
            stages.append({"index": i, "enzyme": entry, "state": "mismatch", "input": r["input"],
                           "product": None, "stall_reason": r["stall_reason"]})

    return {
        "start": start,
        "stages": stages,
        "stalled": stalled,
        "stalled_at": stalled_at,
        "product": None if stalled else current,
        "product_description": None if stalled else describe(current),
        "score": foundry_score(entries, stages),
        "score_disclaimer": SCORE_DISCLAIMER,
    }


def foundry_score(entries: list[dict[str, Any]], stages: list[dict[str, Any]]) -> dict[str, Any]:
    ran = sum(1 for s in stages if s["state"] == "ran")
    if not entries:
        return {"value": 0, "basis": "empty lane"}

    t_low = max(e["temp"][0] for e in entries)
    t_high = min(e["temp"][1] for e in entries)
    p_low = max(e["ph"][0] for e in entries)
    p_high = min(e["ph"][1] for e in entries)
    t_width = max(0, t_high - t_low)
    p_width = max(0, p_high - p_low)

    window_factor = min(1, t_width / 25) * 0.5 + min(1, p_width / 2.5) * 0.5
    length_penalty = 0.93 ** max(0, len(entries) - 1)
    completion = ran / len(entries)

    # js_round rather than round(): JavaScript's Math.round is half-up, Python's
    # round() is half-to-even, and the parity cases would diverge on ties.
    value = js_round(100 * (0.25 + 0.75 * window_factor) * length_penalty * completion)
    return {
        "value": value,
        "basis": f"{ran}/{len(entries)} stages ran, shared window {to_fixed(t_width, 0)} °C wide "
                 f"and {to_fixed(p_width, 1)} pH wide",
    }
