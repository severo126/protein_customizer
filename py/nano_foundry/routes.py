"""Route search — the Python half of the pair. Mirrors src/model/routes.js.

The point of this file existing is the same as the point of every other pair in
this repo: if one implementation drifts, a test goes red and names the case. It
matters more here than anywhere else, because route search is the thing the app
now opens with, and the claim it makes is that the chains come from a search
over the committed catalogue rather than from a model. A second implementation
in another language, held to a shared contract, is how that claim is checked
rather than asserted.

Two things are mirrored with more care than they might seem to need:

* **Iteration order.** The search is deterministic, and "deterministic" has to
  mean the same order on both sides or the contract cannot compare route lists.
  Where the JavaScript relies on a Set preserving insertion order, this side
  uses an ordered dict rather than a Python set, which does not.

* **The dead end.** `search_routes` reports whether the walk completed, and the
  headline refuses to call an unfinished walk a dead end. That distinction is
  the honest part of the whole feature, so it is asserted on both sides.

Any change here must be made on the JavaScript side too, and
src/data/route-cases.json is what holds the two together.
"""

from __future__ import annotations

from typing import Any, Iterable

from .compatibility import cofactor_tokens, intersect_windows
from .compatibility import _family as cofactor_family
from .molecules import STARTERS, Molecule, group_meta, pretty_core, starter
from .pipeline import run_stage

ROUTE_NOTE = (
    "A route means every stage’s cartoon rule accepts the stage before it. It is not a "
    "synthesis plan, not a prediction that the chain would run, and says nothing about "
    "folding, expression, yield or safety."
)

SEARCH_LIMITS: dict[str, Any] = {
    "maxDepth": 5,
    "maxGroups": 7,
    "maxScanNodes": 2_000_000,
    "maxRoutes": 60,
    "maxRoutesPerStarter": 24,
    "routesPerSet": 2,
    "nearMisses": 6,
    # Stop the walk at the first layer that produces the target. True for a
    # route search, because a chain that reaches the target and then keeps
    # going is not a shorter way to the target. The reachability map behind the
    # picker sets it false: it is asking what this catalogue can reach at all,
    # not how to reach one thing.
    "stopAtTarget": True,
}


# --------------------------- the vocabulary ---------------------------------


def reachable_cores(entries: list[dict[str, Any]]) -> list[str]:
    # An ordered dict rather than a set: the JavaScript side iterates a Set,
    # which keeps insertion order, and a Python set would not.
    cores: dict[str, None] = {s.core: None for s in STARTERS.values()}
    grew = True
    while grew:
        grew = False
        for e in entries:
            a = e["action"]
            if a["op"] == "rearrange" and a["from"] in cores and a["to"] not in cores:
                cores[a["to"]] = None
                grew = True
    return list(cores)


def reachable_groups(entries: list[dict[str, Any]]) -> list[str]:
    groups: dict[str, None] = {}
    for s in STARTERS.values():
        for g in s.groups:
            groups[g] = None
    for e in entries:
        a = e["action"]
        if a["op"] in ("add", "join"):
            groups[a["group"]] = None
        if a["op"] == "remove" and a.get("yields"):
            groups[a["yields"]] = None
    return list(groups)


def target_vocabulary(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "cores": reachable_cores(entries),
        "groups": reachable_groups(entries),
        "starters": [
            {"id": sid, "core": m.core, "label": m.label, "groups": list(m.groups)}
            for sid, m in STARTERS.items()
        ],
        "matches": ["exact", "carries"],
    }


CORE_LABELS = {
    "glucose-1-p": "Glucose-1-phosphate",
    "glucose-6-p": "Glucose-6-phosphate",
    "glycerate-2-p": "2-Phosphoglycerate",
    "triose-iso": "Rearranged triose",
    "enolpyruvate": "Enolpyruvate",
    "protein-stain": "Protein stain fragment",
    "tributyrin": "Small fat",
    "peroxide": "Hydrogen peroxide",
    "nitrile": "Small nitrile",
    "starch": "Starch fragment",
    "cellulose": "Cellulose fragment",
}


def core_label(core: str) -> str:
    if core in CORE_LABELS:
        return CORE_LABELS[core]
    for m in STARTERS.values():
        if m.core == core:
            return m.label
    return pretty_core(core)


def core_origin(core: str) -> dict[str, Any]:
    starters = [sid for sid, m in STARTERS.items() if m.core == core]
    return {"isStarter": bool(starters), "starters": starters}


# ------------------------------ the target ----------------------------------


def make_target(core: str, groups: Iterable[str] = (), match: str = "exact") -> dict[str, Any]:
    return {"core": core, "groups": sorted(groups), "match": match}


def validate_target(entries: list[dict[str, Any]], target: dict[str, Any]) -> dict[str, Any]:
    vocab = target_vocabulary(entries)
    problems: list[str] = []
    core = target.get("core")
    if not isinstance(core, str) or not core:
        problems.append("No skeleton was named.")
    elif core not in vocab["cores"]:
        problems.append(
            f"Nothing in this catalogue can reach a {core_label(core)} skeleton. "
            f"Reachable skeletons: {', '.join(core_label(c) for c in vocab['cores'])}."
        )
    groups = target.get("groups") or []
    for g in groups:
        if g not in vocab["groups"]:
            problems.append(f'This catalogue has no rule that puts a "{g}" anywhere.')
    if target.get("match") and target["match"] not in vocab["matches"]:
        problems.append(f"Unknown match mode \"{target['match']}\".")
    if len(groups) > SEARCH_LIMITS["maxGroups"]:
        problems.append(
            f"Asking for {len(groups)} groups is past the search's cap of "
            f"{SEARCH_LIMITS['maxGroups']}."
        )
    return {"ok": not problems, "problems": problems}


def _article(word: str) -> str:
    return "an" if word[:1].lower() in "aeiou" else "a"


def _count_groups(groups: Iterable[str]) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for g in groups:
        counts[g] = counts.get(g, 0) + 1
    return sorted(counts.items(), key=lambda kv: kv[0])


def describe_target(target: dict[str, Any]) -> str:
    parts = []
    for g, n in _count_groups(target["groups"]):
        label = group_meta(g)["label"]
        parts.append(f"{n}× {label}" if n > 1 else f"{_article(label)} {label}")
    name = core_label(target["core"])
    if not parts:
        return f"{name}, carrying anything" if target["match"] == "carries" else f"{name} carrying nothing else"
    body = f"{name} carrying {', '.join(parts)}"
    return f"{body} (and possibly more)" if target["match"] == "carries" else body


# ------------------------------ the search ----------------------------------


def molecule_key(mol: Molecule) -> str:
    return f"{mol.core}|{','.join(sorted(mol.groups))}"


def _missing(want: Iterable[str], have: Iterable[str]) -> list[str]:
    pool = list(have)
    out: list[str] = []
    for g in want:
        if g in pool:
            pool.remove(g)
        else:
            out.append(g)
    return out


def matches_target(mol: Molecule, target: dict[str, Any]) -> bool:
    if mol.core != target["core"]:
        return False
    if _missing(target["groups"], mol.groups):
        return False
    if target["match"] == "carries":
        return True
    return not _missing(mol.groups, target["groups"])


def target_distance(mol: Molecule, target: dict[str, Any]) -> dict[str, Any]:
    core_off = 0 if mol.core == target["core"] else 1
    short = _missing(target["groups"], mol.groups)
    over = [] if target["match"] == "carries" else _missing(mol.groups, target["groups"])
    return {
        "coreOff": core_off,
        "missing": short,
        "extra": over,
        "total": core_off * 100 + len(short) + len(over),
    }


def scan_from_starter(
    entries: list[dict[str, Any]],
    target: dict[str, Any],
    starter_id: str,
    limits: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One starter's walk, breadth-first over molecules rather than over paths."""
    lim = {**SEARCH_LIMITS, **(limits or {})}
    depth_of: dict[str, int] = {}
    parents: dict[str, list[dict[str, Any]]] = {}
    mol_of: dict[str, Molecule] = {}

    first = starter(starter_id)
    first_key = molecule_key(first)
    depth_of[first_key] = 0
    mol_of[first_key] = first

    target_keys: list[str] = []
    shortest_depth: int | None = None
    nodes = 0
    exhausted = True

    if matches_target(first, target):
        target_keys.append(first_key)
        shortest_depth = 0

    frontier = [] if shortest_depth is not None else [first_key]

    depth = 0
    while depth < lim["maxDepth"] and frontier:
        nxt: list[str] = []
        for parent_key in frontier:
            parent_mol = mol_of[parent_key]
            for entry in entries:
                if nodes >= lim["maxScanNodes"]:
                    exhausted = False
                    break
                nodes += 1
                r = run_stage(parent_mol, entry)
                if not r["ok"]:
                    continue
                product = r["product"]
                if len(product.groups) > lim["maxGroups"]:
                    continue
                child_key = molecule_key(product)
                edge = {"fromKey": parent_key, "enzymeId": entry["id"], "what": r.get("what")}
                known = depth_of.get(child_key)
                if known is None:
                    depth_of[child_key] = depth + 1
                    mol_of[child_key] = product
                    parents[child_key] = [edge]
                    nxt.append(child_key)
                    if matches_target(product, target):
                        target_keys.append(child_key)
                elif known == depth + 1:
                    parents[child_key].append(edge)
            if not exhausted:
                break
        frontier = nxt
        if target_keys:
            # Record the first layer that produced it, and only the first: a
            # later layer reaching it again is a longer way to the same
            # molecule.
            if shortest_depth is None:
                shortest_depth = depth + 1
            if lim.get("stopAtTarget") is not False:
                break
        depth += 1

    return {
        "starterId": starter_id,
        "depthOf": depth_of,
        "parents": parents,
        "molOf": mol_of,
        "targetKeys": target_keys,
        "shortestDepth": shortest_depth,
        "nodes": nodes,
        "exhausted": exhausted,
        "statesSeen": len(depth_of),
    }


def paths_from_scan(scan: dict[str, Any], target: dict[str, Any], cap: int) -> list[dict[str, Any]]:
    """Read concrete chains back out of one starter's recorded edges."""
    out: list[dict[str, Any]] = []

    def walk(key: str, stages: list[str], molecules: list[Molecule], whats: list[Any]) -> None:
        if len(out) >= cap:
            return
        edges = scan["parents"].get(key)
        mol = scan["molOf"][key]
        if not edges:
            out.append(
                {
                    "starterId": scan["starterId"],
                    "stages": stages,
                    "molecules": [mol, *molecules],
                    "whats": whats,
                }
            )
            return
        for e in edges:
            walk(e["fromKey"], [e["enzymeId"], *stages], [mol, *molecules], [e["what"], *whats])
            if len(out) >= cap:
                return

    for key in scan["targetKeys"]:
        walk(key, [], [], [])
        if len(out) >= cap:
            break
    return out


def _to_route(path: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"{path['starterId']}>{'>'.join(path['stages'])}",
        "starterId": path["starterId"],
        "stages": list(path["stages"]),
        "molecules": [{"core": m.core, "groups": list(m.groups)} for m in path["molecules"]],
        "steps": list(path.get("whats") or []),
        "depth": len(path["stages"]),
        "target": target,
    }


def _consider_near(near: list[dict[str, Any]], node: dict[str, Any], target: dict[str, Any], cap: int) -> None:
    d = target_distance(node["mol"], target)["total"]
    if d == 0:
        return

    def key(n: dict[str, Any]) -> tuple[int, int]:
        return (target_distance(n["mol"], target)["total"], n.get("depth") or 0)

    if len(near) < cap:
        near.append(node)
        near.sort(key=key)
        return
    if d < target_distance(near[-1]["mol"], target)["total"]:
        near[-1] = node
        near.sort(key=key)


def search_routes(
    entries: list[dict[str, Any]],
    target: dict[str, Any],
    limits: dict[str, Any] | None = None,
) -> dict[str, Any]:
    lim = {**SEARCH_LIMITS, **(limits or {})}
    starter_ids = lim.get("starterIds") or list(STARTERS.keys())

    routes: list[dict[str, Any]] = []
    per_set: dict[str, int] = {}
    near: list[dict[str, Any]] = []
    reached_from: list[dict[str, Any]] = []
    total_found = 0
    nodes = 0
    states_seen = 0
    exhausted = True
    truncated = False

    for starter_id in starter_ids:
        scan = scan_from_starter(entries, target, starter_id, lim)
        nodes += scan["nodes"]
        states_seen += scan["statesSeen"]
        if not scan["exhausted"]:
            exhausted = False

        if scan["shortestDepth"] is None:
            for key, mol in scan["molOf"].items():
                _consider_near(
                    near,
                    {"mol": mol, "starterId": starter_id, "depth": scan["depthOf"].get(key)},
                    target,
                    lim["nearMisses"],
                )
            continue

        reached_from.append({"starterId": starter_id, "stages": scan["shortestDepth"]})
        found = paths_from_scan(scan, target, lim["maxRoutesPerStarter"])
        total_found += len(found)
        if len(found) >= lim["maxRoutesPerStarter"]:
            truncated = True

        for path in found:
            set_key = "+".join([path["starterId"], *sorted(path["stages"])])
            used = per_set.get(set_key, 0)
            if used >= lim["routesPerSet"]:
                continue
            if len(routes) >= lim["maxRoutes"]:
                truncated = True
                break
            per_set[set_key] = used + 1
            routes.append(_to_route(path, target))

    depths = [r["stages"] for r in reached_from]

    return {
        "target": target,
        "routes": routes,
        "totalFound": total_found,
        "truncated": truncated,
        "reachable": bool(reached_from),
        "reachedFrom": reached_from,
        "shortestDepth": min(depths) if depths else None,
        "longestShortest": max(depths) if depths else None,
        "scan": {"exhausted": exhausted, "statesSeen": states_seen, "nodesExplored": nodes},
        "nodesExplored": nodes,
        "limits": {"maxDepth": lim["maxDepth"], "maxGroups": lim["maxGroups"]},
        "nearMisses": [
            {
                "starterId": n["starterId"],
                "stages": [],
                "depth": n.get("depth"),
                "molecule": {"core": n["mol"].core, "groups": list(n["mol"].groups)},
                "distance": target_distance(n["mol"], target),
            }
            for n in near
        ],
        "note": ROUTE_NOTE,
    }


# ------------------------------ the metrics ----------------------------------


def route_metrics(entries: list[dict[str, Any]], route: dict[str, Any]) -> dict[str, Any]:
    by_id = {e["id"]: e for e in entries}
    stage_entries = [by_id[i] for i in route["stages"] if i in by_id]

    temp = intersect_windows(stage_entries, "temp")
    ph = intersect_windows(stage_entries, "ph")

    cofactors: dict[str, None] = {}
    needs: dict[str, None] = {}
    for e in stage_entries:
        for t in cofactor_tokens(e.get("cofactor")):
            cofactors[cofactor_family(t)] = None
        for n in e.get("needs") or []:
            needs[n] = None

    return {
        "routeId": route["id"],
        "stages": len(stage_entries),
        "supplyLoad": len(cofactors) + len(needs),
        "cofactors": sorted(cofactors),
        "needs": sorted(needs),
        "tempWindow": None
        if temp["empty"]
        else {"low": temp["low"], "high": temp["high"], "width": temp["width"]},
        "tempEmpty": bool(temp["empty"]),
        "tempBlame": {"floor": temp["blame"]["floor"]["id"], "ceiling": temp["blame"]["ceiling"]["id"]}
        if temp.get("blame")
        else None,
        "phWindow": None
        if ph["empty"]
        else {"low": ph["low"], "high": ph["high"], "width": ph["width"]},
        "phEmpty": bool(ph["empty"]),
        "phBlame": {"floor": ph["blame"]["floor"]["id"], "ceiling": ph["blame"]["ceiling"]["id"]}
        if ph.get("blame")
        else None,
    }


CRITERIA = [
    {
        "id": "stages",
        "label": "Fewest stages",
        "blurb": "The shortest chain. Fewer stages means fewer chances for a stage to refuse the molecule.",
    },
    {
        "id": "supply",
        "label": "Lowest supply load",
        "blurb": "The fewest distinct cofactor pools and host requirements the pot has to provide.",
    },
    {
        "id": "temp",
        "label": "Widest shared temperature",
        "blurb": "The widest band of temperature every stage’s stated window covers at once. "
        "A route with no shared band at all sorts last.",
    },
    {
        "id": "ph",
        "label": "Widest shared pH",
        "blurb": "The widest band of pH every stage’s stated window covers at once. "
        "A route with no shared band at all sorts last.",
    },
]


def criterion(id_: str) -> dict[str, Any]:
    for c in CRITERIA:
        if c["id"] == id_:
            return c
    return CRITERIA[0]


def rank_routes(
    entries: list[dict[str, Any]], routes: list[dict[str, Any]], criterion_id: str = "stages"
) -> list[dict[str, Any]]:
    scored = [{"route": r, "metrics": route_metrics(entries, r)} for r in routes]

    def key(item: dict[str, Any]) -> tuple[float, int, str]:
        m = item["metrics"]
        if criterion_id == "supply":
            primary: float = m["supplyLoad"]
        elif criterion_id == "temp":
            primary = float("inf") if m["tempEmpty"] else -m["tempWindow"]["width"]
        elif criterion_id == "ph":
            primary = float("inf") if m["phEmpty"] else -m["phWindow"]["width"]
        else:
            primary = m["stages"]
        return (primary, m["stages"], item["route"]["id"])

    return sorted(scored, key=key)


def search_headline(result: dict[str, Any]) -> str:
    t = describe_target(result["target"])

    if not result["reachable"]:
        near = result["nearMisses"][0] if result["nearMisses"] else None
        if not result["scan"]["exhausted"]:
            return (
                f"The search did not finish inside its budget, so this says nothing either way "
                f"about whether {t} can be made. It walked "
                f"{result['scan']['statesSeen']:,} molecules without reaching it."
            )
        if not near:
            return (
                f"No chain of up to {result['limits']['maxDepth']} catalogue stages makes {t}, "
                "and the search has nothing to report about how close it got."
            )
        d = near["distance"]
        bits = []
        if d["coreOff"]:
            bits.append(f"never reached a {core_label(result['target']['core'])} skeleton at all")
        if d["missing"]:
            bits.append("still short of " + ", ".join(group_meta(g)["label"] for g in d["missing"]))
        if d["extra"]:
            bits.append(
                "still carrying "
                + ", ".join(group_meta(g)["label"] for g in d["extra"])
                + " that would have to come off"
            )
        where = core_label(near["molecule"]["core"])
        depth = near.get("depth") or 0
        how_far = (
            f"{depth} stage{'' if depth == 1 else 's'} in, at {where}"
            if depth
            else f"{where} itself, before any stage ran"
        )
        return (
            f"No chain of up to {result['limits']['maxDepth']} catalogue stages makes {t}. "
            f"The search walked every one of the {result['scan']['statesSeen']:,} molecules the "
            f"forty entries can reach; the closest it came was {how_far}, {' and '.join(bits)}."
        )

    shown = len(result["routes"])
    found = result["totalFound"]
    starters = len(result["reachedFrom"])
    lo = result["shortestDepth"]
    hi = result["longestShortest"]

    span = f"{lo} stage{'' if lo == 1 else 's'}" if lo == hi else f"{lo} to {hi} stages"
    head = f"{starters} of the {len(STARTERS)} starting molecules can reach {t}, in {span}."
    if shown == found:
        tail = (
            "It is the only chain the search found."
            if found == 1
            else f"All {found} chains the search found are shown."
        )
    else:
        tail = (
            f"{shown} of the {found} chains it found are shown, picked to be different "
            "combinations of enzymes rather than reorderings of the same one."
        )
    return f"{head} {tail}"
