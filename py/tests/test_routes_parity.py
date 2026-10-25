"""The Python half of the route-search parity contract.

Same file, same assertions as the route-cases block in test/routes.test.js.
The contract is src/data/route-cases.json, generated from the JavaScript side
by tools/make-route-cases.mjs. If this suite fails, py/nano_foundry/routes.py
and src/model/routes.js disagree about what the catalogue can make — and the
failure message names the target and the field.

Run with:

    python3 -m unittest discover -s py/tests -v
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "py"))

from nano_foundry.routes import (  # noqa: E402
    CRITERIA,
    SEARCH_LIMITS,
    describe_target,
    make_target,
    rank_routes,
    route_metrics,
    search_headline,
    search_routes,
    target_vocabulary,
    validate_target,
)

CATALOGUE = json.loads((ROOT / "src/data/catalogue.json").read_text())
CASES = json.loads((ROOT / "src/data/route-cases.json").read_text())
ENTRIES = CATALOGUE["entries"]


def mol_key(m: dict[str, object]) -> str:
    return f"{m['core']}|{','.join(m['groups'])}"  # type: ignore[arg-type]


def window(w: dict[str, float] | None) -> list[float] | None:
    return None if w is None else [w["low"], w["high"], w["width"]]


def blame(b: dict[str, str] | None) -> list[str] | None:
    return None if b is None else [b["floor"], b["ceiling"]]


def nums(xs: list[float] | None) -> list[float] | None:
    """Compare numbers as numbers. JSON.stringify writes 7, json.dumps 7.0."""
    return None if xs is None else [float(x) for x in xs]


class ContractShape(unittest.TestCase):
    def test_the_contract_is_the_one_this_catalogue_generated(self) -> None:
        self.assertEqual(CASES["catalogue_entries"], len(ENTRIES))
        self.assertGreaterEqual(len(CASES["cases"]), 25)

    def test_limits_match(self) -> None:
        self.assertEqual(CASES["limits"]["max_depth"], SEARCH_LIMITS["maxDepth"])
        self.assertEqual(CASES["limits"]["max_groups"], SEARCH_LIMITS["maxGroups"])
        self.assertEqual(CASES["limits"]["max_routes"], SEARCH_LIMITS["maxRoutes"])
        self.assertEqual(CASES["limits"]["routes_per_set"], SEARCH_LIMITS["routesPerSet"])
        self.assertEqual(CASES["limits"]["near_misses"], SEARCH_LIMITS["nearMisses"])

    def test_vocabulary_matches(self) -> None:
        v = target_vocabulary(ENTRIES)
        self.assertEqual(v["cores"], CASES["vocabulary"]["cores"])
        self.assertEqual(v["groups"], CASES["vocabulary"]["groups"])
        self.assertEqual(v["matches"], CASES["vocabulary"]["matches"])

    def test_criteria_match(self) -> None:
        self.assertEqual([c["id"] for c in CRITERIA], CASES["criteria"])


class RouteParity(unittest.TestCase):
    def test_every_target_matches(self) -> None:
        for case in CASES["cases"]:
            spec, expect = case["spec"], case["expect"]
            where = f"{spec['core']} {spec['match']} {spec['groups']}"
            if spec["starter_ids"]:
                where += f" from {spec['starter_ids']}"

            target = make_target(core=spec["core"], groups=spec["groups"], match=spec["match"])
            opts = {"starterIds": spec["starter_ids"]} if spec["starter_ids"] else None
            result = search_routes(ENTRIES, target, opts)

            with self.subTest(target=where):
                self.assertEqual(validate_target(ENTRIES, target)["ok"], expect["valid"], f"{where}: valid")
                self.assertEqual(describe_target(target), expect["describe"], f"{where}: description")

                # The two claims the app puts on screen.
                self.assertEqual(result["reachable"], expect["reachable"], f"{where}: reachable")
                self.assertEqual(result["scan"]["exhausted"], expect["exhausted"], f"{where}: scan finished")

                # How much walking it took to say that.
                self.assertEqual(result["scan"]["statesSeen"], expect["states_seen"], f"{where}: states seen")
                self.assertEqual(result["scan"]["nodesExplored"], expect["nodes_explored"], f"{where}: nodes")

                self.assertEqual(result["totalFound"], expect["total_found"], f"{where}: chains found")
                self.assertEqual(result["truncated"], expect["truncated"], f"{where}: truncated")
                self.assertEqual(result["shortestDepth"], expect["shortest_depth"], f"{where}: shortest")
                self.assertEqual(result["longestShortest"], expect["longest_shortest"], f"{where}: longest")
                self.assertEqual(
                    [{"starter_id": r["starterId"], "stages": r["stages"]} for r in result["reachedFrom"]],
                    expect["reached_from"],
                    f"{where}: which starters reach it",
                )

                # The chains, by id and then by every molecule along them.
                self.assertEqual([r["id"] for r in result["routes"]], expect["route_ids"], f"{where}: chains")
                self.assertEqual(
                    [[mol_key(m) for m in r["molecules"]] for r in result["routes"]],
                    expect["molecules"],
                    f"{where}: molecules along the chains",
                )

                # The numbers the criteria sort on, which are the numbers the
                # model is allowed to read out.
                for want in expect["metrics"]:
                    route = next(r for r in result["routes"] if r["id"] == want["route_id"])
                    m = route_metrics(ENTRIES, route)
                    rid = want["route_id"]
                    self.assertEqual(m["stages"], want["stages"], f"{where}/{rid}: stages")
                    self.assertEqual(m["supplyLoad"], want["supply_load"], f"{where}/{rid}: supply load")
                    self.assertEqual(m["cofactors"], want["cofactors"], f"{where}/{rid}: cofactors")
                    self.assertEqual(m["needs"], want["needs"], f"{where}/{rid}: needs")
                    self.assertEqual(nums(window(m["tempWindow"])), nums(want["temp_window"]), f"{where}/{rid}: temp")
                    self.assertEqual(m["tempEmpty"], want["temp_empty"], f"{where}/{rid}: temp empty")
                    self.assertEqual(blame(m["tempBlame"]), want["temp_blame"], f"{where}/{rid}: temp blame")
                    self.assertEqual(nums(window(m["phWindow"])), nums(want["ph_window"]), f"{where}/{rid}: pH")
                    self.assertEqual(m["phEmpty"], want["ph_empty"], f"{where}/{rid}: pH empty")
                    self.assertEqual(blame(m["phBlame"]), want["ph_blame"], f"{where}/{rid}: pH blame")

                # The orderings, tie-breaks included.
                for want in expect["rankings"]:
                    order = [x["route"]["id"] for x in rank_routes(ENTRIES, result["routes"], want["criterion"])]
                    self.assertEqual(order, want["order"], f"{where}: ranked by {want['criterion']}")

                # How far it got when it got nowhere.
                self.assertEqual(
                    [
                        {
                            "starter_id": n["starterId"],
                            "depth": n["depth"],
                            "molecule": mol_key(n["molecule"]),
                            "distance": {
                                "core_off": n["distance"]["coreOff"],
                                "missing": n["distance"]["missing"],
                                "extra": n["distance"]["extra"],
                                "total": n["distance"]["total"],
                            },
                        }
                        for n in result["nearMisses"]
                    ],
                    expect["near_misses"],
                    f"{where}: near misses",
                )

                # The sentence the user reads, character for character.
                self.assertEqual(search_headline(result), expect["headline"], f"{where}: headline")


class StarvedScan(unittest.TestCase):
    """A scan that ran out of budget must not be reported as a dead end.

    This is the one honesty rule in the search that a reviewer should be able to
    find by name, so it is pinned on its own rather than inside the sweep.
    """

    def test_an_unfinished_scan_is_not_a_dead_end(self) -> None:
        starved = CASES["starved"]
        target = make_target(core="malate", groups=["sulfate"], match="exact")
        result = search_routes(ENTRIES, target, {"maxScanNodes": starved["limits"]["max_scan_nodes"]})

        self.assertEqual(result["reachable"], starved["expect"]["reachable"])
        self.assertFalse(result["scan"]["exhausted"])
        self.assertEqual(result["scan"]["exhausted"], starved["expect"]["exhausted"])

        headline = search_headline(result)
        self.assertEqual(headline, starved["expect"]["headline"])
        self.assertIn("did not finish inside its budget", headline)
        self.assertNotIn("No chain", headline)


if __name__ == "__main__":
    unittest.main()
