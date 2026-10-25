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
* A plausibility result that clears every filter is reported as
  **"Nothing here ruled this out"** — never as stable, viable, correct, validated, approved,
  or designed.
* Beside that verdict the app lists what was never checked: folding kinetics, real
  side-chain packing, expression, solubility, aggregation, activity retention, allostery,
  any cellular context, and anything to do with actual safety. It sits next to the verdict
  itself, one click away in its own disclosure, never in a page footer and never on a
  separate screen. (It was a printed panel until severo asked for the interface to stop
  explaining itself; the list stayed and the prose around it went.)
* There is no "validated" or "approved" state anywhere in the UI, and no code path that
  can produce one.
* A pass is the absence of a red flag from a cartoon. The UI says so in those words.

## 3a. The two things added after the first build, and what they may claim

**The reaction cartoon.** Any enzyme-and-molecule pair can be played back as a short
animation: the molecule rides into a cleft, a jaw closes, a group changes hands, the
product leaves. The *order of events* comes from the same deterministic rule the bench
runs, so the picture cannot show something the model did not do — including a refusal,
which gets its own ending rather than being smoothed over. Everything else about it is
invented: the shapes, the motion, the speed, the idea that a reaction has four tidy
phases. It is not a mechanism, not a trajectory and not a rate, and the caption under
every scene says so.

**The "what fits next" filter.** The enzyme list sorts itself against whatever the lane is
holding, into *fits*, *caution* and *ruled out*, using the same cartoon checks as the
traffic lights: does this stage have a rule for the running product, would the shared
temperature and pH windows survive, has an earlier stage eaten a cofactor this one needs,
does the curated inhibition table name the pair. **Fits means only that these checks found
nothing against it.** It is not a prediction that the stage would run, and it is not a
recommendation. Nothing is removed from the catalogue by this filter — the forty entries
are always there, a ruled-out entry stays addable so the bench can show it refusing, and
every one carries the sentence that ruled it out.

## 3b. The workstation, and the two things it will not do

**What it is.** The workstation lets you look the catalogue up by the behaviour you want
instead of by name — *grabs a molecule carrying a hydroxyl*, *takes a sugar off*, *has to
work at 40 °C*, *needs no cofactor* — and tells you which single entry of the forty, or
which pairing of them, covers the most of what you asked for.

Every behaviour it offers is read straight off a field that is already committed in
`src/data/catalogue.json`: `action.requires`, `action.op`, `action.group`, `temp`, `ph`,
`cofactor`, `destroys`, `inhibitedBy`. Nothing is fetched, inferred or modelled.
`test/behaviours.test.js` and `py/tests/test_behaviours_parity.py` both assert that a
catalogue entry stripped to those eight fields gives the same answer as the full entry, so
the composer cannot quietly start depending on something that is not in the file.

A **build** is a named set of one, two or three catalogue domains — nothing more. It
carries no sequence of any kind, it is not a protein and it is not a design. That a build
"covers" a behaviour means only that a committed catalogue field says the entry does that.
It is not a prediction that the team would run, fold, express or exist. A build is reported
in exactly three ways and no others: **"Nothing here ruled this out"**, **"Ruled out by
this toy"**, or **"Not everything you asked for"**. The standing not-checked list sits
beside every one of them.

Temperature and pH are judged against the *team's* shared window rather than against one
lucky member, using the same intersection the bench's traffic lights use, and the two
entries that closed a window are named.

**What it will not do, and why.** Two things were asked for alongside this screen and are
deliberately absent, because both collide with the rules above:

* **No gene or protein database lookup.** Searching a live database for "a gene that does
  X" is exactly the live search §1 forbids. The workstation composes an answer out of the
  forty fixed entries instead, and when nothing in them covers a behaviour it says so by
  name rather than reaching outside the file.
* **No stability or foldability predictor.** A model that says whether a construct "would
  fall apart" or "could exist" is a folding and stability claim, and §3 puts folding
  kinetics, expression, solubility and aggregation on the standing not-checked list and
  forbids the app from saying a construct would fold, function or be safe. Neither screen
  has such a model and no code path can produce one.

If either is ever wanted, it is the project owner's call to widen this document first —
not the build's. The sequence rule and the hazard rule in §1 and §2 stay in force whatever
is decided.

## 3c. The literature layer, and the number it refuses to produce

**What it is.** When a filter rejects a candidate, the splice screen can go and find what has
actually been published about that kind of failure. The order matters and is the whole claim:

1. a deterministic filter in `src/model/splice.js` rejects the candidate and names which filter
   and why. The verdict is reached before any of this runs, and nothing below can change it;
2. `src/model/failureModes.js` maps that filter id to the real failure mode it is a crude stand-in
   for, as committed text plus the queries to look it up. One entry per filter, asserted by
   `test/literature.test.js`;
3. `/api/sources` runs those queries — the same endpoint, the same server-side key handling and the
   same screen the catalogue cards already use. There is no second retrieval path, and
   `test/literature.test.js` greps the panel to keep it that way;
4. only then, and only if a Gemini key is set, is a model shown the verdict and the retrieved
   titles, so it can say what they report.

Steps 1 to 3 work with no key and no model at all. With no `SERPAPI_KEY` the search falls back to
Crossref, which needs no account, so the citation trail works on a fresh clone.

**This is not the live search §1 forbids.** §1 forbids reaching outside the forty fixed entries for
a *catalogue fact* — what an enzyme is, what it does, whether it exists. Nothing retrieved here ever
becomes a catalogue fact or touches a verdict. It is a reading list attached to a decision already
made, which is the same thing the per-card citation trail has always been.

**What comes back is screened.** The open literature contains a great deal §1 deliberately excludes.
`tools/api/sourceFilter.mjs` drops results touching toxins, virulence factors, select agents and
human pathogens, and any whose snippet has pasted a residue or nucleotide run into it, before they
leave the server. The panel reports how many were held back rather than quietly shortening the list.

**No viability score, and this is the considered answer rather than an omission.** Asked for a number
saying how likely a construct is to work, this project says no, for four reasons: there is no
benchmark of fusion-construct outcomes to calibrate one against, so the number could not be checked
by anyone, including its author; it would put a model back inside a verdict that deterministic code
reaches reproducibly; it is strictly weaker than what the app already does, because every filter can
name the rule it applied and a score cannot; and "how likely is this to work" is a folding and
function claim, which §3 rules out. The model may summarise what was retrieved. It may not rank,
rate or score, its instructions say so, and `test/literature.test.js` checks the panel says so too.

## 3d. The molecule-first flow, and where the model is allowed to stand

**What it is.** The app is now entered by naming the molecule you want, not by picking enzymes.
You say what you are after, a picker goes back and forth until the target is pinned down, a grid
shows the chains of catalogue entries that could make it, and the chain you choose is what the
animation plays. The bench and the workstation no longer have tabs of their own; their function is
folded into this flow and both screens still render unchanged.

**The search is code, and that is the whole point.** `src/model/routes.js` walks the catalogue's
own `requires`/`yields` fields breadth-first over *molecules*, once per starting molecule,
recording for each molecule the fewest stages that reach it and every edge that reaches it in
exactly that many. Chains are then read back out of those recorded edges, so every route listed is
one the walk actually traversed. The model is never asked for a route, a stage, or an ordering, and
`test/routes.test.js` re-runs every route the search returns through `runPipeline` and checks the
molecules match stage for stage — if the search ever returned a chain the bench would refuse, that
test fails.

**An honest dead end is a result, not a failure.** Seventeen of the thirty-one targets in the
parity contract are unreachable, and the app says so and shows how far it got: which molecule was
the closest it ever stood in, how many stages in, and what it was still short of or still
carrying. Walking molecules rather than paths is what makes that claim affordable — the state
space collapses, the walk finishes, and "nothing the forty entries can do reaches this within five
stages" is a fact about the catalogue rather than about when the search gave up. **When the scan
does not finish inside its budget, the app says that instead.** It does not report an unfinished
search as a dead end, because that would be a claim about the search dressed up as a claim about
the catalogue. `searchHeadline` carries that rule and both suites pin the sentence.

**Both halves compute it.** `py/nano_foundry/routes.py` mirrors the search, and
`src/data/route-cases.json` holds the two together: thirty-one targets, every molecule along every
chain, the metrics, the rankings including tie-breaks, the near misses, and each headline character
for character. Generated by `npm run routes:build`, asserted by `test/routes.test.js` and
`py/tests/test_routes_parity.py`.

**What the model may do here, and what it may not.** The same split as the literature layer: it
parses what you meant, and it explains and ranks what the search already returned.

* `config/instructions/target-parser.md` — turns a sentence into a target. **It may not name a
  catalogue enzyme at all**, because naming one pre-empts a search that has not run yet. Screened
  by `screenPickerText` in `src/model/picker.js`, which blocks every entry by name and by id.
* `config/instructions/route-adviser.md` — says which of the returned chains suits what you asked
  to optimise for, using only the numbers `routeMetrics` computed. It runs *after* the search, so
  naming its enzymes is reading out a result rather than inventing one. Screened by
  `screenAdviceText`, and the grid checks the route id it named was actually in the list.

Both screens block verdict words, real-world claims (in vivo, clinical, therapeutic), residue and
nucleotide runs, and over-long text. `test/picker.test.js` asserts every catalogue entry is blocked
by name and by id, and that the app's own on-screen prose passes its own screen. **The flow works
with no API key**: a keyword parser pins the target, and the orderings are code either way.

**The map shown while you are still choosing.** Before the target is finished, the picker draws a
node-and-edge map of what the catalogue can actually reach on the chosen skeleton, and it narrows as
groups are added. `src/model/route-map.js` builds it from `scanFromStarter` — the route search's own
walk, run to full depth rather than stopped at the first match — so **every node is a molecule the
search also reaches and every line is one catalogue entry acting under its own rule**.
`test/route-map.test.js` takes every line on the map, runs that enzyme on the molecule the line
starts at, and checks it produces the molecule the line ends at. A picture of a graph reads as a
fact, so the map is held to the same standard as the search rather than to a looser one for being
decoration.

The map is capped for readability, and says so: at most thirty molecules and eight per column, with
a line under it naming how many more lie deeper and noting the search still finds them. **A target
nothing reaches is drawn, not dropped** — dashed, in a column marked "not reached", with no line
arriving at it — because leaving it out would make the picture look complete when it is not. Any
claim about what is *not* reachable cites the depth the walk actually ran to, never the width of the
drawn picture, and an unfinished walk is reported as unfinished.

Nothing is highlighted until the draft rules something out: with no groups named every variant
matches, and an emphasis on everything says nothing. The map is built from already-mirrored code, so
it asserts no chemistry of its own; the one option it added to the search, running the walk past the
target, is mirrored in `py/nano_foundry/routes.py` and pinned in `src/data/route-cases.json`.

**The criteria are arithmetic, not judgement.** You may optimise for fewest stages, lowest supply
load, or the widest shared temperature or pH window — each a committed catalogue field or a sum of
them, named on screen beside the ordering so a reader can see what was sorted. There is no "best
route" and no recommendation. A chain whose stages share no temperature window at all is not
disqualified; it sorts last and says which two stages leave no room between them.

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
