# Demo day

HackTX 26 · soft submission Saturday 11:30pm · final Sunday 11:30am · judging Sunday 2–5pm.

---

## The two-minute walkthrough

Have `./deploy/bring-up.sh` already running, on **Make a molecule**, before anyone sits down.

> **What moved, since this script changed.** The app is entered by naming a molecule now. The nav
> is three tabs: **Make a molecule**, **Collection**, **Splice table**. The bench and the
> workstation lost their tabs but neither screen changed, and both are one click from the landing
> screen in the row headed *"Still here, if you would rather drive it yourself"*. The three seeded
> demo runs this script uses are behind **Build a lane by hand** in that row, unchanged and in the
> same order. The frozen screenshots in `docs/screenshots/` still match what those buttons show.

**0:00 — what this is, in one sentence.** "Nano Foundry is a teaching sandbox for how enzymes chain
together, plus a toy checker for what would break if you fused two domains. It is a cartoon on
purpose — the physics is order-of-magnitude wrong and the app says so on every screen."

**0:15 — say what you want to make.** Type *fructose with a phosphate on it* into the box and let
the picker pin it down. Point at the chips on the right: every skeleton and group it offers is one
the catalogue can actually reach, read off the forty entries rather than written out by hand. Then
press **Find the routes**.

**0:30 — the grid, and the claim underneath it.** Six chains come back. Read the headline aloud:
how many of the eighteen starting molecules reach it, in how many stages, and that all the chains
found are shown. Then say the line that matters: *this is a breadth-first search over molecules in
`src/model/routes.js`, not a model answering a question. Gemini is not in this.* Switch the
criterion to **widest shared temperature** and watch the order change — the ordering is arithmetic
over committed catalogue fields, named on screen beside it.

**0:50 — the honest dead end, which is the better demo.** Change the molecule to **Malate**
carrying a **sulfate**. No chain makes it, and the app says how far it got: the closest molecule it
ever stood in, how many stages in, and what it was still short of. Say why that is affordable: the
walk is over molecules rather than paths, so the state space collapses, the walk finishes, and the
claim is about the catalogue rather than about when the search gave up. **And if the scan runs out
of budget, the app says that instead of calling it a dead end.**

**1:05 — the catalogue.** Jump to **Collection**. Point at one card: substrate in, product out,
cofactor, the temperature and pH window it is comfortable in, and a schematic domain map showing
loops and helices. Say the line: *forty hand-curated commonplace enzymes, no database lookup, no
upload, and no sequence anywhere in this app.*

**1:20 — the chain player, clean run.** From the landing row, **Build a lane by hand**, then
**A team that gets along**. The molecule moves left to right
and picks up groups as it goes. Point at the traffic lights: shared window 20–40 °C, pH 7–8.2,
nothing eaten, nothing inhibited. Point at the Foundry Score and say out loud that it is a made-up
number, because the app does.

**1:35 — two failures, same screen.** Click **A stage handed the wrong molecule**: the isomerase
refuses glycerol and says exactly why, instead of passing it along. Then click **Both stages work,
the pot does not**: both stages run and there *is* a product, and the pH light is still a hard red
naming invertase and the glucuronosyltransferase. That contrast is the point of the whole screen.

**1:55 — the splice table, the money shot.** Lipase and alpha-amylase, 6-unit linker: six hard
filters, all green, and the verdict is **"Nothing here ruled this out"** — read it aloud, then open
"Not checked by any of this" beside it and read the list. Drag the linker to 2: the blobs clash. Drag
to 20: the compactness band rejects the dumbbell. Then point at the funnel: 36 candidate splice
points in, which filter killed how many, and how few come out.

**2:15 — the platform, from the terminal.** There is no Platform tab any more; show it from
`config/agents.json` and `curl localhost:8000/agents`: six agents declared in config with their
tools, models and limits, traces with per-step latency, and `/traces/<id>/replay`. "The filters and
the route search are deterministic code, the model only parses what you meant and explains what the
search returned, and the registry is what keeps that honest." The two newest agents are the ones
from the flow you just drove: `target-parser`, which is forbidden from naming an enzyme at all
because naming one would pre-empt a search that has not run, and `route-adviser`, which may only
read back numbers the search measured.

**2:35 — close.** "Every number on screen says where it came from, and the ones we invented are
labelled as invented. Both the browser and the Python service run the same filters *and the same
route search*, and two parity suites assert they agree — 393 cases for the filters, 31 targets for
the search, including every molecule along every chain."

### If something goes wrong

* No network: everything demoed above is local. Only the Gemini box and the citation panel need
  the outside world, and both degrade with a message rather than an error.
* The live panel is empty: run `node tools/sweep.mjs --pairs 60`.
* Keep `docs/screenshots/` open in a tab as the fallback — the same three demo routes.
* **No Gemini key, or the picker will not parse a sentence:** every step still works. A keyword
  parser pins the target with no key and no model, the chips on the right edit it by hand, and the
  grid, the orderings and the run do not depend on a key either. The only thing that goes away is
  the "ask Gemini to weigh them up" aside, and it says so where the button would be.

---

## Which three tracks to submit

A team may submit to at most three, excluding Best Overall and Novice. My recommendation, with the
reason it beats the alternative:

### 1. Northmark Compute and Cloud — "build the platform behind the agent"

**Pitch.** Nano Foundry has three agents and none of them is hand-wired. `config/agents.json`
declares each one's tools, model, instructions file and limits; a shared tool registry describes
every tool; every run writes a trace with per-tool latency and token counts; any trace can be
replayed, and replay *refuses* to claim it reproduced a model-backed run. One agent has no model at
all and is declared the same way as the other two, which is the argument: the platform should treat
a deterministic worker and a model-backed agent identically. The registry's `refuse_fields` list is
enforced in both the Python service and the browser, so a project-wide safety rule is a platform
property rather than a convention someone has to remember. The Platform screen is a read-only view
a judge can read without opening an editor.

**Why this one.** It is the track where the depth is, and the prompt asks for exactly what we built.

### 2. Tiger Data (Timescale)

**Pitch.** Every lane edit, filter verdict and sweep is a time-series row in a hypertable, with two
continuous aggregates rolling reject reasons and enzyme use into five-minute buckets. That powers
the live "what the room has been building" panel: which filter is the biggest killer right now,
which enzymes people reach for, how the funnel history moves over an event. Reaching for a
warehouse for that would be the wrong shape; this is append-only, time-ordered, read back over a
short recent window many times a minute.

**Why this one.** The funnel history is a genuinely time-series problem, and the continuous
aggregates are the difference between a panel that can be polled and one that cannot.

### 3. Gemini API

**Pitch.** Gemini is the front door — a sentence of English becomes a candidate lane — and the
explainer that turns a filter verdict into something a first-year student can read. It is
deliberately fenced: every id it returns is checked against the fixed catalogue, and whether a lane
runs is decided by deterministic code with a test suite behind it. That division is the
demonstration: the model handles language, the filters handle verdicts, and the results stay
reproducible.

**Why this one over Vultr or SerpApi.** Both of those are real here, but Gemini is the one a judge
can watch work in fifteen seconds.

### The swap worth making

**If the Vultr instance is live and nanofoundry.tech resolves to it by judging**, swap Gemini for
Vultr: a one-command bring-up that provisions the host, installs TimescaleDB, applies the schema and
serves the app behind nginx is a stronger demo than a text box, and it carries the .tech domain with
it. That swap depends on two things only you can do — a Vultr API key and registering the domain.

### Not submitting

**Snowflake** is wired and the queries are real, but `docs/tracks.md` says plainly that at this data
volume they would also run in the same Postgres. Submitting it alongside Timescale would be arguing
for something we do not believe yet.
