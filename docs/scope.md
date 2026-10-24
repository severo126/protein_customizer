# Scope — what Nano Foundry is, and what it refuses to be

Nano Foundry is an **educational simulation and visualisation toy**, built in 36 hours for
HackTX 26. It exists to teach, at the level of an intro biochemistry course, one idea:
enzymes are modular machines that each do a small chemical edit, and you can reason about
chaining them together.

It is not a design tool. It is not a lab tool. It produces nothing a lab could act on.
The limits below are enforced in the data layer and the test suite, not just in the copy.

## 1. The catalogue is fixed, curated, and small

* About 40 entries, hand-curated, committed to this repo as `src/data/catalogue.json`.
* Every entry is a commonplace, non-hazardous housekeeping or industrial enzyme — the sort
  of thing in a first biochemistry course or a detergent bottle: lipases, amylases,
  kinases, phosphatases, decarboxylases, glycosyltransferases, cellulases, isomerases.
* There is **no live search over any protein database**, and **no user-upload path** for
  new entries. The catalogue ships with the app and can only change by a commit.
* Anything touching toxins, virulence factors, select agents, or human pathogens is out of
  scope. Where an entry was uncertain, it was left out rather than included.

## 2. No sequences, anywhere

The app never emits an amino-acid sequence, a nucleotide sequence, an ordering file, or
anything else a lab could act on:

* not in the UI,
* not in exports,
* not in API responses,
* not in the database.

Constructs are identified by **domain names and cartoon geometry only**. The catalogue
carries no sequence fields at all. `test/no-sequence.test.js` asserts that no field of any
catalogue entry or exported construct is a long run of residue letters, and the same test
walks every exported object recursively so a new field cannot quietly reintroduce one.

## 3. Every result is a classroom cartoon

* The physics is deliberately order-of-magnitude wrong. Blobs are spheres, linkers are
  straight rubber bands, "yield" is a made-up score with made-up units.
* A plausibility result that clears every filter is reported as **"Nothing here ruled this
  out"** — never as stable, viable, correct, validated, approved, or designed.
* Beside that verdict the app lists, as a standing list and not a footnote, what was never
  checked: folding kinetics, real side-chain packing, expression, solubility, aggregation,
  activity retention, allostery, any cellular context, and anything to do with actual
  safety.
* There is no "validated" or "approved" state anywhere in the UI, and no code path that
  can produce one.
* A pass is the absence of a red flag from a cartoon. The UI says so in those words.

## 4. Forbidden UI

* No horizontal amino-acid sequence strip, in any view.
* No alignment track, in any view.
* Not behind a toggle, not "just for reference", not in a developer mode.

Nano Foundry is about building and combining, not about comparing proteins. Where a view
seemed to want residue-level detail, it shows region bands or a schematic domain map
instead, or drops the detail. `test/forbidden-ui.test.js` greps the source for the
markers of a sequence viewer so this cannot be reintroduced by accident.

## 5. The cartoon domain model

Each catalogue entry carries one stylised domain: a radius, a hydrophobic-patch direction,
and a handful of candidate splice sites each tagged `loop`, `helix`, or `sheet`. These are
cartoon annotations invented for the toy's geometry, not measured coordinates, and the
3D view is drawn as chunky game pieces to make that obvious at a glance.

## If this starts slipping

If a feature request would water any of the above down — a sequence "just for export", a
"validated" badge, a live database lookup, an upload box — the build stops and asks the
project owner first. That instruction is part of the brief and part of this document.
