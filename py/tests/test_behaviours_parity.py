"""The Python half of the workstation's parity contract.

Same answer sheet, same assertions as test/behaviours.test.js. Run with:

    python3 -m unittest discover -s py/tests -v
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "py"))

from nano_foundry.behaviours import (  # noqa: E402
    behaviour_vocabulary,
    compose_builds,
    coverage,
    entry_satisfies,
    handles,
    want_id,
    want_label,
)

CATALOGUE = json.loads((ROOT / "src/data/catalogue.json").read_text())
CASES = json.loads((ROOT / "src/data/behaviour-cases.json").read_text())
ENTRIES = CATALOGUE["entries"]
BY_ID = {e["id"]: e for e in ENTRIES}

ALLOWED_VERDICTS = {
    "Nothing here ruled this out",
    "Ruled out by this toy",
    "Not everything you asked for",
}


class VocabularyParity(unittest.TestCase):
    def test_vocabulary_matches_the_answer_sheet(self) -> None:
        got = behaviour_vocabulary(ENTRIES)
        self.assertEqual(len(got), len(CASES["vocabulary"]))
        for mine, theirs in zip(got, CASES["vocabulary"]):
            self.assertEqual(mine["id"], theirs["id"])
            self.assertEqual(mine["label"], theirs["label"], theirs["id"])
            self.assertEqual(mine["scope"], theirs["scope"], theirs["id"])
            self.assertEqual(mine["entries"], theirs["entries"], theirs["id"])

    def test_every_offered_behaviour_is_something_an_entry_does(self) -> None:
        for want in behaviour_vocabulary(ENTRIES):
            self.assertTrue(want["entries"], want["id"])
            for entry in ENTRIES:
                self.assertEqual(
                    entry_satisfies(entry, want),
                    entry["id"] in want["entries"],
                    f"{want['id']}: {entry['id']} membership disagrees with the predicate",
                )

    def test_a_behaviour_only_reads_fields_the_catalogue_already_carries(self) -> None:
        keep = ["id", "name", "action", "cofactor", "destroys", "temp", "ph", "inhibitedBy"]
        for want in behaviour_vocabulary(ENTRIES):
            for entry in ENTRIES:
                thin = {k: entry[k] for k in keep}
                self.assertEqual(
                    entry_satisfies(thin, want),
                    entry_satisfies(entry, want),
                    f"{want['id']} on {entry['id']} needed a field outside {keep}",
                )

    def test_handles_are_requires_plus_what_a_hydrolase_finds_first(self) -> None:
        self.assertEqual(handles(BY_ID["hexokinase"]), ["hydroxyl"])
        self.assertEqual(handles(BY_ID["lipase"]), ["acyl"])
        self.assertEqual(handles(BY_ID["alpha-amylase"]), ["sugar"])
        for entry in ENTRIES:
            self.assertEqual(len(handles(entry)), len(set(handles(entry))), entry["id"])


class ComposeParity(unittest.TestCase):
    def test_every_compose_case_matches(self) -> None:
        self.assertGreaterEqual(len(CASES["compose"]), 150)
        for case in CASES["compose"]:
            wants = case["wants"]
            where = " & ".join(want_id(w) for w in wants) or "(nothing asked for)"
            got = compose_builds(ENTRIES, wants, limit=case["limit"])
            expect = case["expect"]

            self.assertEqual(got["searchedSizes"], expect["searched_sizes"], f"{where}: sizes")
            self.assertEqual(got["perfect"], expect["perfect"], f"{where}: perfect")
            self.assertEqual([w["id"] for w in got["impossible"]], expect["impossible"], f"{where}: impossible")
            self.assertEqual(
                [{"id": w["id"], "label": w["label"], "scope": w["scope"]} for w in got["wants"]],
                expect["wants"],
                f"{where}: want labels",
            )
            self.assertEqual(len(got["builds"]), len(expect["builds"]), f"{where}: build count")

            for mine, theirs in zip(got["builds"], expect["builds"]):
                self.assertEqual(mine["id"], theirs["id"], f"{where}: ranking drifted")
                self.assertEqual(mine["label"], theirs["label"], f"{where}: {mine['id']} label")
                self.assertEqual(mine["covered"], theirs["covered"], f"{where}: {mine['id']} covered")
                self.assertEqual(mine["total"], theirs["total"], f"{where}: {mine['id']} total")
                self.assertEqual(mine["worst"], theirs["worst"], f"{where}: {mine['id']} worst light")
                self.assertEqual(mine["missing"], theirs["missing"], f"{where}: {mine['id']} missing")
                self.assertEqual(mine["verdict"]["headline"], theirs["verdict"], f"{where}: {mine['id']} verdict")
                self.assertEqual(
                    [
                        {"id": r["id"], "met": r["met"], "by": r["by"], "detail": r["detail"]}
                        for r in mine["coverage"]
                    ],
                    theirs["coverage"],
                    f"{where}: {mine['id']} coverage rows",
                )
                self.assertEqual(
                    [{"id": l["id"], "colour": l["colour"], "message": l["message"]} for l in mine["lights"]],
                    theirs["lights"],
                    f"{where}: {mine['id']} traffic lights",
                )


class ComposeBehaviour(unittest.TestCase):
    def test_asking_for_nothing_proposes_nothing(self) -> None:
        result = compose_builds(ENTRIES, [])
        self.assertEqual(result["builds"], [])
        self.assertFalse(result["perfect"])
        self.assertEqual(result["searchedSizes"], [])

    def test_an_impossible_behaviour_is_named_not_dropped(self) -> None:
        result = compose_builds(
            ENTRIES, [{"kind": "temp-at", "arg": 200}, {"kind": "adds", "arg": "methyl"}]
        )
        self.assertEqual([w["id"] for w in result["impossible"]], ["temp-at:200"])
        self.assertFalse(result["perfect"])
        for build in result["builds"]:
            self.assertIn("temp-at:200", build["missing"])
            self.assertEqual(build["verdict"]["headline"], "Not everything you asked for")

    def test_the_search_only_widens_when_it_has_to(self) -> None:
        easy = compose_builds(
            ENTRIES, [{"kind": "adds", "arg": "phosphate"}, {"kind": "grabs", "arg": "hydroxyl"}]
        )
        self.assertEqual(easy["searchedSizes"], [1])
        harder = compose_builds(
            ENTRIES, [{"kind": "adds", "arg": "phosphate"}, {"kind": "removes", "arg": "phosphate"}]
        )
        self.assertIn(2, harder["searchedSizes"])
        self.assertGreaterEqual(len(harder["builds"][0]["entries"]), 2)

    def test_an_all_scope_behaviour_needs_every_member(self) -> None:
        free = next(e for e in ENTRIES if e["cofactor"] == "none")
        needy = next(e for e in ENTRIES if e["cofactor"] == "ATP")
        want = {"kind": "cofactor-free", "arg": None}
        self.assertEqual(coverage([free], [want])["covered"], 1)
        self.assertEqual(coverage([free, needy], [want])["covered"], 0)

    def test_a_build_is_only_reported_in_the_permitted_ways(self) -> None:
        seen = set()
        for case in CASES["compose"]:
            for build in case["expect"]["builds"]:
                self.assertIn(build["verdict"], ALLOWED_VERDICTS)
                seen.add(build["verdict"])
        self.assertGreaterEqual(len(seen), 2)

    def test_want_labels_round_trip(self) -> None:
        for want in behaviour_vocabulary(ENTRIES):
            self.assertEqual(want_label(want), want["label"])


if __name__ == "__main__":
    unittest.main()
