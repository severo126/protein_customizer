"""Tool implementations named by config/agents.json.

Each one takes (payload, previous_result) and returns the next result, so the
registry can chain an agent's declared tools without knowing what they do. They
are all deterministic; the only model-backed step in the whole platform is the
wording, and it happens in the caller.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .compatibility import team_report
from .molecules import starter
from .pipeline import run_pipeline
from .splice import run_filters, splice_funnel

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = json.loads((ROOT / "src/data/catalogue.json").read_text())
BY_ID = {e["id"]: e for e in CATALOGUE["entries"]}


def catalogue_list(payload: dict[str, Any], previous: Any = None) -> dict[str, Any]:
    """Ids and actions only — the menu an agent is allowed to choose from."""
    return {
        "entries": [
            {"id": e["id"], "name": e["name"], "family": e["family"], "group": e["group"],
             "action": e["action"], "cofactor": e["cofactor"]}
            for e in CATALOGUE["entries"]
        ],
        "note": "Fixed catalogue. There is no lookup tool and no upload tool in this registry.",
    }


def lane_validate(payload: dict[str, Any], previous: Any = None) -> dict[str, Any]:
    """Whether a proposed lane runs is decided here, never by a model."""
    requested = payload.get("stages", [])
    kept = [s for s in requested if s in BY_ID]
    dropped = [s for s in requested if s not in BY_ID]
    lane = [BY_ID[s] for s in kept]
    start = payload.get("starter") or "glucose"
    try:
        mol = starter(start)
    except KeyError:
        return {"error": f"unknown starting molecule {start!r}", "dropped": dropped}

    run = run_pipeline(mol, lane)
    team = team_report(lane)
    return {
        "kept": kept,
        "dropped": dropped,
        "stalled": run["stalled"],
        "stalled_at": run["stalled_at"],
        "stall_reason": next((s.get("stall_reason") for s in run["stages"] if s.get("stall_reason")), None),
        "product": ({"core": run["product"].core, "groups": list(run["product"].groups)} if run["product"] else None),
        "score": run["score"],
        "score_disclaimer": run["score_disclaimer"],
        "lights": [{"id": l["id"], "colour": l["colour"], "message": l["message"]} for l in team["lights"]],
        "worst": team["worst"],
    }


def splice_funnel_tool(payload: dict[str, Any], previous: Any = None) -> dict[str, Any]:
    a = BY_ID.get(payload.get("a", ""))
    b = BY_ID.get(payload.get("b", ""))
    if not a or not b:
        return {"error": "both a and b must be catalogue ids"}
    team = [BY_ID[i] for i in payload.get("team", []) if i in BY_ID]
    f = splice_funnel(a, b, team)
    return {
        "pair": f["pairLabel"],
        "went_in": f["went_in"],
        "funnel": [{"id": s["id"], "label": s["label"], "killed": s["killed"],
                    "entering": s["entering"], "leaving": s["leaving"]} for s in f["funnel"]],
        "survivors": [
            {"site_a": c["siteA"]["id"], "site_b": c["siteB"]["id"], "linker": c["linkerUnits"]}
            for c in f["survivors"]
        ],
        "verdict_wording": f["verdictWording"],
    }


def filter_reason(payload: dict[str, Any], previous: Any = None) -> dict[str, Any]:
    """Hand the explainer the sentence the filter already produced."""
    a = BY_ID.get(payload.get("a", ""))
    b = BY_ID.get(payload.get("b", ""))
    if not a or not b:
        return {"error": "both a and b must be catalogue ids"}
    site_a = next((s for s in a["domain"]["sites"] if s["id"] == payload.get("site_a")), a["domain"]["sites"][0])
    site_b = next((s for s in b["domain"]["sites"] if s["id"] == payload.get("site_b")), b["domain"]["sites"][0])
    team = [BY_ID[i] for i in payload.get("team", []) if i in BY_ID]
    v = run_filters(a, site_a, b, site_b, int(payload.get("linker", 6)), team)
    killer = next((r for r in v["results"] if not r["pass"]), None)
    return {
        "killed_by": v["killedBy"],
        "passed": v["passed"],
        "reason": killer["reason"] if killer else None,
        "results": [{"id": r["id"], "pass": r["pass"], "reason": r["reason"]} for r in v["results"]],
    }


def write_event(payload: dict[str, Any], previous: Any = None) -> dict[str, Any]:
    """Append to the JSONL buffer the Node API also reads."""
    rows = previous if isinstance(previous, list) else [previous or payload]
    path = ROOT / "data" / "events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as fh:
        for row in rows:
            fh.write(json.dumps(row, default=str) + "\n")
    return {"written": len(rows)}


TOOLS = {
    "catalogue.list": catalogue_list,
    "lane.validate": lane_validate,
    "splice.funnel": splice_funnel_tool,
    "filters.explain": filter_reason,
    "events.write": write_event,
}
