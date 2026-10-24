"""The Python half of the parity contract for the modules added from the survey.

Same lanes, same numbers, same sentences as test/additions.test.js. The generated
parity-cases.json covers splice, pipeline and the original lights; these four
modules are pinned by hand here instead, so adding a check does not mean
regenerating the fixture.

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

from nano_foundry.activity import (  # noqa: E402
    ACTIVITY_DISCLAIMER,
    PH_EDGE_ACTIVITY,
    RUN_LENGTHS,
    best_point,
    compromise_note,
    lane_activity,
    ph_activity,
    ph_curve,
    temp_curve,
    temp_optimum,
)
from nano_foundry.compatibility import team_report  # noqa: E402
from nano_foundry.hosts import (  # noqa: E402
    HOSTS,
    check_host,
    filter_by_host,
    requirements,
    supports,
    why_missing,
)
from nano_foundry.kinetics import (  # noqa: E402
    RATE_ORDER,
    check_drive,
    check_kinetics,
    kinetics_lights,
)
from nano_foundry.ledger import (  # noqa: E402
    DONORS,
    METALS,
    PROSTHETIC,
    check_ledger,
    classify_cofactor,
    ledger,
    regenerators,
)

CATALOGUE = json.loads((ROOT / "src/data/catalogue.json").read_text())
ENTRIES = CATALOGUE["entries"]
BY_ID = {e["id"]: e for e in ENTRIES}


def by_id(id_: str) -> dict:
    return BY_ID[id_]


class CatalogueFields(unittest.TestCase):
    def test_every_entry_carries_the_four_labels_with_provenance(self) -> None:
        for e in ENTRIES:
            self.assertIn(e["rate"], ("fast", "moderate", "slow"), e["id"])
            self.assertIn(e["drive"], ("downhill", "near-equilibrium", "uphill"), e["id"])
            self.assertIn(e["assembly"],
                          ("monomer", "homodimer", "homotetramer", "higher-order", "heterodimer"),
                          e["id"])
            self.assertIsInstance(e["needs"], list, e["id"])
            self.assertEqual(e["source"]["labels"], "teaching-grade", e["id"])
            self.assertIn("not measurements", e["source"]["labels_note"], e["id"])

    def test_needs_carries_only_host_requirements(self) -> None:
        structural = {"disulfide", "secretion", "glycosylation", "membrane"}
        for e in ENTRIES:
            for n in e["needs"]:
                self.assertIn(n, structural, f"{e['id']}: unexpected needs token {n}")


class ActivityCurves(unittest.TestCase):
    def test_window_edge_reads_as_edge_activity(self) -> None:
        e = by_id("hexokinase")
        self.assertEqual(f"{ph_activity(e, e['ph'][0]):.6f}", f"{PH_EDGE_ACTIVITY:.6f}")
        self.assertEqual(f"{ph_activity(e, e['ph'][1]):.6f}", f"{PH_EDGE_ACTIVITY:.6f}")
        self.assertEqual(f"{ph_activity(e, (e['ph'][0] + e['ph'][1]) / 2):.6f}", "1.000000")

    def test_optimum_moves_down_as_the_run_lengthens(self) -> None:
        e = by_id("alpha-amylase")
        minutes = temp_optimum(e, "minutes")
        hours = temp_optimum(e, "hours")
        overnight = temp_optimum(e, "overnight")

        self.assertEqual([minutes["temp"], minutes["value"]], [75, 0.884797])
        self.assertEqual([hours["temp"], hours["value"]], [65.5, 0.424221])
        self.assertEqual([overnight["temp"], overnight["value"]], [53, 0.229631])

        self.assertLess(overnight["temp"], hours["temp"])
        self.assertLess(hours["temp"], minutes["temp"])
        self.assertLess(overnight["value"], hours["value"])
        self.assertLess(hours["value"], minutes["value"])

    def test_lane_reports_its_compromise_point(self) -> None:
        lane = [by_id("hexokinase"), by_id("alkaline-phosphatase")]
        best = best_point(lane, "hours")
        self.assertEqual(best["temp"], 42)
        self.assertEqual(best["ph"], 7.95)
        self.assertEqual(best["value"], 0.018168)
        self.assertEqual([(s["id"], s["value"]) for s in best["stages"]],
                         [("hexokinase", 0.2216), ("alkaline-phosphatase", 0.082)])
        self.assertEqual(
            compromise_note(lane, "hours"),
            "Best shared point is 42 °C and pH 7.95 over a few hours, where the weakest stage, "
            "Alkaline phosphatase, runs at 8% of its own best.",
        )

    def test_an_overlap_is_not_both_stages_being_happy(self) -> None:
        lane = [by_id("hexokinase"), by_id("glucokinase")]
        lights = {l["id"]: l for l in team_report(lane)["lights"]}
        self.assertEqual(lights["temp"]["colour"], "green")
        self.assertEqual(lights["ph"]["colour"], "green")
        self.assertLess(best_point(lane, "hours")["value"], 0.5)

    def test_a_dead_window_still_reports_a_point(self) -> None:
        lane = [by_id("dna-ligase"), by_id("glucose-isomerase")]
        lights = {l["id"]: l for l in team_report(lane)["lights"]}
        self.assertEqual(lights["temp"]["colour"], "red")
        self.assertEqual(
            compromise_note(lane, "hours"),
            "Best shared point is 35 °C and pH 7.85 over a few hours, where the weakest stage, "
            "Glucose isomerase, runs at 6% of its own best.",
        )

    def test_curves_stay_inside_zero_and_one(self) -> None:
        for e in ENTRIES:
            for r in RUN_LENGTHS:
                for p in temp_curve(e, r["id"], 12):
                    self.assertTrue(0 <= p["value"] <= 1, f"{e['id']} {r['id']} {p['temp']}")
            for p in ph_curve(e, 12):
                self.assertTrue(0 <= p["value"] <= 1, f"{e['id']} pH {p['ph']}")

    def test_an_empty_lane_has_no_verdict(self) -> None:
        self.assertIsNone(best_point([], "hours"))
        self.assertEqual(compromise_note([], "hours"),
                         "Add stages to see where they could all run at once.")
        self.assertEqual(lane_activity([], 40, 7, 3), 1)

    def test_peak_height_carries_its_disclaimer(self) -> None:
        self.assertIn("made-up number with made-up units", ACTIVITY_DISCLAIMER)
        self.assertIn("not a probability", ACTIVITY_DISCLAIMER)


class Ledger(unittest.TestCase):
    def test_cofactors_are_classified(self) -> None:
        for d in DONORS:
            self.assertEqual(classify_cofactor(d), "donor", d)
        for m in METALS:
            self.assertEqual(classify_cofactor(m), "metal", m)
        for p in PROSTHETIC:
            self.assertEqual(classify_cofactor(p), "prosthetic", p)
        self.assertEqual(classify_cofactor("ADP"), "acceptor")
        self.assertEqual(classify_cofactor("nothing-like-this"), "unknown")

    def test_a_net_consumer_is_flagged_and_the_fix_is_searched_for(self) -> None:
        light = check_ledger([by_id("hexokinase")], ENTRIES)
        self.assertEqual(light["colour"], "amber")
        self.assertEqual(
            light["message"],
            "This lane is a net consumer: 1× ATP spent with nothing putting it back. "
            "Pyruvate kinase runs on ADP and would hand ATP back.",
        )
        self.assertEqual(light["suggestions"], [
            {"family": "ATP", "net": 1,
             "partners": [{"id": "pyruvate-kinase", "name": "Pyruvate kinase", "takes": "ADP"}]},
        ])

    def test_the_regeneration_partner_balances_the_books(self) -> None:
        light = check_ledger([by_id("hexokinase"), by_id("pyruvate-kinase")], ENTRIES)
        self.assertEqual(light["colour"], "green")
        self.assertEqual(light["message"],
                         "This lane puts back every donor it spends: 1× ATP out, 1 back.")
        self.assertTrue(light["ledger"]["balanced"])

    def test_a_metal_or_prosthetic_group_is_required_not_spent(self) -> None:
        light = check_ledger([by_id("catalase"), by_id("urease")], ENTRIES)
        self.assertEqual(light["colour"], "green")
        self.assertEqual(
            light["message"],
            "Nothing in this lane spends a group donor, so there is no pool to run down. It still "
            "needs Ni2+ and heme present throughout, which a pot either has or does not.",
        )
        self.assertEqual(len(light["ledger"]["donors"]), 0)

    def test_donors_from_one_pool_are_counted_together(self) -> None:
        book = ledger([by_id("chalcone-synthase"), by_id("gpat")])
        self.assertEqual([(d["family"], d["spent"]) for d in book["donors"]], [("acyl-CoA", 2)])

    def test_an_empty_lane_has_nothing_to_total(self) -> None:
        light = check_ledger([], ENTRIES)
        self.assertEqual(light["colour"], "grey")
        self.assertIsNone(light["ledger"])
        self.assertEqual(regenerators([], ENTRIES), [])


class RateAndDrive(unittest.TestCase):
    def test_a_faster_stage_before_a_slower_one_piles_up(self) -> None:
        light = check_kinetics([by_id("hexokinase"), by_id("comt")])
        self.assertEqual(light["colour"], "amber")
        self.assertEqual(
            light["message"],
            "Stage 1 (Hexokinase) is moderate and stage 2 (Catechol O-methyltransferase) is slow, "
            "so phosphate piles up waiting to be cleared.",
        )

    def test_the_pile_up_turns_red_when_it_poisons_its_own_clearer(self) -> None:
        light = check_kinetics([by_id("alkaline-phosphatase"), by_id("hexokinase")])
        self.assertEqual(light["colour"], "red")
        self.assertEqual(
            light["message"],
            "Stage 1 (Alkaline phosphatase, fast) outruns stage 2 (Hexokinase, moderate), so "
            "phosphate builds up — and Hexokinase is itself listed as inhibited by phosphate, so "
            "the build-up slows down the only stage that could clear it.",
        )
        self.assertEqual(light["deadlock"]["group"], "phosphate")

    def test_the_check_is_order_sensitive(self) -> None:
        self.assertEqual(check_kinetics([by_id("endoglucanase"), by_id("alpha-amylase")])["colour"],
                         "green")
        self.assertEqual(check_kinetics([by_id("alpha-amylase"), by_id("endoglucanase")])["colour"],
                         "red")

    def test_one_stage_cannot_outrun_anything(self) -> None:
        light = check_kinetics([by_id("hexokinase")])
        self.assertEqual(light["colour"], "grey")
        self.assertIn("at least two stages", light["message"])

    def test_an_uphill_step_with_nothing_after_it_is_stranded(self) -> None:
        light = check_drive([by_id("aldolase")])
        self.assertEqual(light["colour"], "amber")
        self.assertEqual(
            light["message"],
            "Stage 1 (Fructose-bisphosphate aldolase) sits against its own equilibrium and nothing "
            "follows it to take the product away, so it has no reason to go forward. A faster "
            "enzyme would not help; a stage after it would.",
        )

    def test_a_downstream_stage_rescues_an_uphill_step(self) -> None:
        light = check_drive([by_id("aldolase"), by_id("tim")])
        self.assertEqual(light["colour"], "green")
        self.assertEqual(
            light["message"],
            "Stage 1 (Fructose-bisphosphate aldolase) barely goes on its own, but stage 2 "
            "(Triose-phosphate isomerase) keeps taking the product away, and that is what makes "
            "it run.",
        )

    def test_a_near_equilibrium_stage_is_called_reversible(self) -> None:
        light = check_drive([by_id("fumarase")])
        self.assertEqual(light["colour"], "green")
        self.assertIn("near equilibrium", light["message"])
        self.assertIn("either direction", light["message"])

    def test_both_lights_come_back_in_a_fixed_order(self) -> None:
        lights = kinetics_lights([by_id("hexokinase"), by_id("comt")])
        self.assertEqual([l["id"] for l in lights], ["kinetics", "drive"])
        self.assertEqual(RATE_ORDER, {"slow": 0, "moderate": 1, "fast": 2})


class Hosts(unittest.TestCase):
    def test_a_missing_prosthetic_group_blocks_the_stage(self) -> None:
        light = check_host("ecoli-cytoplasm", [by_id("catalase")])
        self.assertEqual(light["colour"], "red")
        self.assertEqual(
            light["message"],
            "Stage 1 is the problem before any chemistry starts: Catalase needs a heme group, and "
            "E. coli cytoplasm cannot provide that.",
        )
        self.assertEqual(check_host("yeast", [by_id("catalase")])["colour"], "green")

    def test_two_missing_requirements_read_as_a_sentence(self) -> None:
        self.assertEqual(
            check_host("ecoli-cytoplasm", [by_id("lipase")])["message"],
            "Stage 1 is the problem before any chemistry starts: Triacylglycerol lipase needs "
            "disulfide bonds and a secretory pathway, and E. coli cytoplasm cannot provide those.",
        )
        self.assertEqual(check_host("ecoli-periplasm", [by_id("lipase")])["colour"], "green")

    def test_requirements_come_from_needs_and_from_the_cofactor(self) -> None:
        self.assertEqual(requirements(by_id("catalase")), [{"token": "heme", "kind": "prosthetic"}])
        self.assertEqual(requirements(by_id("lipase")), [
            {"token": "disulfide", "kind": "structural"},
            {"token": "secretion", "kind": "structural"},
        ])
        self.assertEqual(requirements(by_id("hexokinase")), [])

    def test_the_funnel_splits_the_catalogue_and_never_shortens_it(self) -> None:
        for h in HOSTS:
            f = filter_by_host(h["id"], ENTRIES)
            self.assertEqual(len(f["available"]) + len(f["blocked"]), len(ENTRIES), h["id"])
            for b in f["blocked"]:
                self.assertIn("cannot provide", b["reason"], f"{h['id']}/{b['entry']['id']}")
        self.assertEqual(len(filter_by_host("ecoli-cytoplasm", ENTRIES)["blocked"]), 13)
        self.assertEqual(len(filter_by_host("yeast", ENTRIES)["blocked"]), 0)

    def test_every_blocked_requirement_explains_itself(self) -> None:
        for b in filter_by_host("ecoli-cytoplasm", ENTRIES)["blocked"]:
            for w in why_missing(b["missing"]):
                self.assertIsNotNone(w["why"], f"{b['entry']['id']}: {w['token']}")

    def test_an_unknown_host_raises(self) -> None:
        with self.assertRaises(ValueError):
            supports("not-a-host", by_id("lipase"))


class NoSequences(unittest.TestCase):
    """The scope rule holds for the new modules too (docs/scope.md §2)."""

    def test_the_new_modules_emit_no_sequence_field(self) -> None:
        import re

        lane = [by_id("hexokinase"), by_id("alkaline-phosphatase")]
        payload = {
            "activity": best_point(lane, "hours"),
            "note": compromise_note(lane, "hours"),
            "ledger": check_ledger(lane, ENTRIES)["ledger"],
            "kinetics": check_kinetics(lane)["message"],
            "drive": check_drive(lane)["message"],
            "host": check_host("ecoli-cytoplasm", lane)["message"],
        }
        blob = json.dumps(payload, default=str)
        self.assertIsNone(re.search(r"[ACDEFGHIKLMNPQRSTVWY]{20,}", blob))
        for key in ("sequence", "fasta", "codon", "oligo", "primer"):
            self.assertNotIn(key, blob.lower())


if __name__ == "__main__":
    unittest.main()
