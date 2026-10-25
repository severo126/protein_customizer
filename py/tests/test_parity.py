"""The Python half of the parity contract.

Same file, same assertions as test/parity.test.js. Run with:

    python3 -m unittest discover -s py/tests -v
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "py"))

from nano_foundry.compatibility import team_report  # noqa: E402
from nano_foundry.molecules import starter  # noqa: E402
from nano_foundry.pipeline import run_pipeline  # noqa: E402
from nano_foundry.splice import run_filters  # noqa: E402

CATALOGUE = json.loads((ROOT / "src/data/catalogue.json").read_text())
CASES = json.loads((ROOT / "src/data/parity-cases.json").read_text())
BY_ID = {e["id"]: e for e in CATALOGUE["entries"]}


def site(entry: dict, site_id: str) -> dict:
    return next(s for s in entry["domain"]["sites"] if s["id"] == site_id)


def rounded(x: float) -> float:
    return float(f"{x:.4f}")


class SpliceParity(unittest.TestCase):
    def test_every_splice_case_matches(self) -> None:
        self.assertGreaterEqual(len(CASES["splice"]), 200)
        for c in CASES["splice"]:
            a, b = BY_ID[c["a"]], BY_ID[c["b"]]
            team = [BY_ID[i] for i in c["team"]]
            v = run_filters(a, site(a, c["site_a"]), b, site(b, c["site_b"]), c["linker"], team)
            where = f"{c['a']}:{c['site_a']} + {c['b']}:{c['site_b']} @{c['linker']}"
            expect = c["expect"]

            self.assertEqual(v["killedBy"], expect["killed_by"], f"{where}: killed-by")
            self.assertEqual(v["passed"], expect["passed"], f"{where}: passed")
            self.assertEqual(rounded(v["geometry"]["joinDistance"]), expect["join_distance"], f"{where}: join distance")
            self.assertEqual(rounded(v["geometry"]["centreDistance"]), expect["centre_distance"], f"{where}: centre distance")
            self.assertEqual(rounded(v["rg"]), expect["rg"], f"{where}: radius of gyration")
            self.assertEqual([rounded(v["rgBand"]["low"]), rounded(v["rgBand"]["high"])], expect["rg_band"], f"{where}: Rg band")

            self.assertEqual(len(v["results"]), len(expect["results"]), f"{where}: filter count")
            for got, want in zip(v["results"], expect["results"]):
                self.assertEqual(got["id"], want["id"], f"{where}: filter id")
                self.assertEqual(got["pass"], want["pass"], f"{where}: filter {got['id']} verdict")
                self.assertEqual(got["reason"], want["reason"], f"{where}: filter {got['id']} reason")


class LaneParity(unittest.TestCase):
    def test_every_lane_case_matches(self) -> None:
        for c in CASES["pipeline"]:
            lane = [BY_ID[i] for i in c["lane"]]
            run = run_pipeline(starter(c["start"]), lane)
            team = team_report(lane)
            where = f"{c['start']} -> {' -> '.join(c['lane'])}"
            expect = c["expect"]

            self.assertEqual(run["stalled"], expect["stalled"], f"{where}: stalled")
            self.assertEqual(run["stalled_at"], expect["stalled_at"], f"{where}: stalled at")
            self.assertEqual([s["state"] for s in run["stages"]], expect["states"], f"{where}: stage states")
            self.assertEqual([s.get("stall_reason") for s in run["stages"]], expect["stall_reasons"], f"{where}: stall reasons")
            product = ({"core": run["product"].core, "groups": list(run["product"].groups)} if run["product"] else None)
            self.assertEqual(product, expect["product"], f"{where}: product")
            self.assertEqual(run["product_description"], expect["product_description"], f"{where}: product description")
            self.assertEqual(run["score"]["value"], expect["score"], f"{where}: score")
            self.assertEqual(run["score"]["basis"], expect["score_basis"], f"{where}: score basis")
            lights = [{"id": l["id"], "colour": l["colour"], "message": l["message"]} for l in team["lights"]]
            self.assertEqual(lights, expect["lights"], f"{where}: traffic lights")
            self.assertEqual(team["worst"], expect["worst"], f"{where}: worst light")


class StageParity(unittest.TestCase):
    def test_every_single_stage_case_matches(self) -> None:
        for c in CASES["stages"]:
            run = run_pipeline(starter(c["start"]), [BY_ID[c["enzyme"]]])
            where = f"{c['start']} + {c['enzyme']}"
            expect = c["expect"]
            self.assertEqual(run["stalled"], expect["stalled"], f"{where}: stalled")
            self.assertEqual(run["stages"][0].get("stall_reason"), expect["reason"], f"{where}: stall reason")
            self.assertEqual(run["stages"][0].get("what"), expect["what"], f"{where}: what it did")
            product = ({"core": run["product"].core, "groups": list(run["product"].groups)} if run["product"] else None)
            self.assertEqual(product, expect["product"], f"{where}: product")


class NoSequences(unittest.TestCase):
    """The scope rule holds on this side of the wire too (docs/scope.md §2)."""

    def test_python_api_emits_no_sequence_field(self) -> None:
        import re

        a, b = BY_ID["lipase"], BY_ID["alpha-amylase"]
        v = run_filters(a, a["domain"]["sites"][0], b, b["domain"]["sites"][0], 6)
        blob = json.dumps({k: val for k, val in v.items() if k != "geometry"}, default=str)
        self.assertIsNone(re.search(r"[ACDEFGHIKLMNPQRSTVWY]{20,}", blob))
        for key in ("sequence", "fasta", "codon", "oligo", "primer"):
            self.assertNotIn(key, blob.lower())


if __name__ == "__main__":
    unittest.main()


class ArticlesMatchJavaScript(unittest.TestCase):
    """The article in front of a group label is picked, not hard-coded, on both sides."""

    def test_vowel_labels_take_an(self) -> None:
        from nano_foundry.molecules import article

        self.assertEqual(article("hydroxyl"), "a hydroxyl")
        self.assertEqual(article("acyl"), "an acyl")
        self.assertEqual(article("amine"), "an amine")
        self.assertEqual(article("amide"), "an amide")

    def test_no_stage_sentence_says_a_before_a_vowel(self) -> None:
        import re

        from nano_foundry.molecules import STARTERS, starter
        from nano_foundry.pipeline import run_stage

        catalogue = json.loads((ROOT / "src/data/catalogue.json").read_text())
        for entry in catalogue["entries"]:
            for starter_id in STARTERS:
                r = run_stage(starter(starter_id), entry)
                sentence = r["what"] if r["ok"] else r["stall_reason"]
                self.assertIsNone(
                    re.search(r" a [aeiou]", sentence, re.IGNORECASE),
                    f"{entry['id']} + {starter_id}: {sentence}",
                )
