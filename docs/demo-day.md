# Demo day

HackTX 26 · soft submission Saturday 11:30pm · final Sunday 11:30am · judging Sunday 2–5pm.

---

## The two-minute walkthrough

Have `./deploy/bring-up.sh` already running, on the **Catalogue** screen, before anyone sits down.

**0:00 — what this is, in one sentence.** "Nano Foundry is a teaching sandbox for how enzymes chain
together, plus a toy checker for what would break if you fused two domains. It is a cartoon on
purpose — the physics is order-of-magnitude wrong and the app says so on every screen."

**0:15 — the catalogue.** Three columns: what the enzyme *adds*, what it *removes*, what it
*creates or rearranges*. Point at one card: substrate in, product out, cofactor, the temperature
and pH window it is comfortable in, and a schematic domain map showing loops and helices. Say the
line that matters: *forty hand-curated commonplace enzymes, no database lookup, no upload, and no
sequence anywhere in this app.*

**0:35 — the bench, clean run.** Click **A team that gets along**. The molecule moves left to right
and picks up groups as it goes. Point at the traffic lights: shared window 20–40 °C, pH 7–8.2,
nothing eaten, nothing inhibited. Point at the Foundry Score and say out loud that it is a made-up
number, because the app does.

**0:55 — the bench, two failures.** Click **A stage handed the wrong molecule**: the isomerase
refuses glycerol and says exactly why, instead of passing it along. Then click **Both stages work,
the pot does not**: both stages run and there *is* a product, and the pH light is still a hard red
naming invertase and the glucuronosyltransferase. That contrast is the point of the whole screen.

**1:20 — the splice table, the money shot.** Lipase and alpha-amylase, 6-unit linker: six hard
filters, all green, and the verdict is **"Nothing here ruled this out"** — read it aloud, then open
"Not checked by any of this" beside it and read the list. Drag the linker to 2: the blobs clash. Drag
to 20: the compactness band rejects the dumbbell. Then point at the funnel: 36 candidate splice
points in, which filter killed how many, and how few come out.

**1:45 — the platform, from the terminal.** There is no Platform tab any more; show it from
`config/agents.json` and `curl localhost:8000/agents`: three agents declared in config with their
tools, models and limits, traces with per-step latency, and `/traces/<id>/replay`. "The filters are
deterministic code, the model only parses and explains, and the registry is what keeps that honest."

**1:55 — close.** "Every number on screen says where it came from, and the ones we invented are
labelled as invented. Both the browser and the Python service run the same filters and a parity
suite asserts they agree on 393 cases."

### If something goes wrong

* No network: everything demoed above is local. Only the Gemini box and the citation panel need
  the outside world, and both degrade with a message rather than an error.
* The live panel is empty: run `node tools/sweep.mjs --pairs 60`.
* Keep `docs/screenshots/` open in a tab as the fallback — the same three demo routes.

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
