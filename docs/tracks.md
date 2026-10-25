# Tracks — what each one actually does here

One honest paragraph each: what the service does in Nano Foundry, and what would break if it
were taken out. Where something could not earn a role, this file says so instead of faking an
integration. Status is as of the end of the build; anything needing a credential says so.

| Track | Status | Load-bearing? |
| --- | --- | --- |
| Gemini API | Wired, needs a key pasted in the browser | Yes, for the English front door |
| Tiger Data (Timescale) | Wired, hypertable + continuous aggregates, falls back to JSONL | Yes, for the live panel |
| Snowflake | Wired as a batch export + query set, needs an account to load | Secondary, honestly |
| .tech domain | **Not done — needs you.** See below | Would be, once registered |
| Vultr | Deploy script + cloud-init committed, needs an API key to provision | Yes, for the hosted demo |
| SerpApi | Wired server-side, needs `SERPAPI_KEY` | Yes, for the citation trail |
| Northmark Compute and Cloud | Wired: registry, traces, replay, dashboards | Yes, it is the architecture |

---

## Gemini API — the natural-language front door

Gemini does two jobs and is deliberately kept away from a third. It turns "put a sugar on this
scaffold and then trim it back off" into a candidate lane of catalogue ids, and it puts a filter
rejection into plain English for a student. It never decides a verdict: every id it proposes is
checked against the fixed catalogue and dropped if it is not there, and whether the lane runs is
decided by `lane.validate`, which is deterministic code with a test suite. Its model, instructions
and limits come from `config/agents.json`, not from the call site.

**If it were removed:** the English box stops working, and rejection explanations fall back to the
filter's own sentence — which is always present, because the filters generate it whether or not a
model is available. Nothing else on any screen changes. That is the honest size of its role: it is
the front door, not the house.

## Tiger Data (Timescale Postgres) — the hot store and the live panel

Every lane edit, every filter verdict and every parameter sweep is a row in a hypertable
(`tools/api/schema.sql`). Two continuous aggregates roll reject reasons and enzyme use into
five-minute buckets, which is what the "what the room has been building" panel on the bench reads
— reject reasons over time, most-used enzymes, which filter is the biggest killer. The funnel
history is exactly the shape Timescale is for: append-only, time-ordered, read back over a short
recent window, many times a minute, while a room of people is using the app.

**If it were removed:** the live panel loses the room-wide view and says so rather than inventing
numbers — there is a JSONL fallback so a laptop with no database still works, but that fallback
re-reads the whole file on every poll and would fall over with a crowd on it. The continuous
aggregates are the difference between a panel that can be polled and one that cannot.

## Snowflake — cohort analytics, and an honest word about the overlap

`tools/snowflake-export.mjs` batch-exports the run history to NDJSON and, with credentials, does
the `PUT` and `COPY INTO`; `tools/snowflake-queries.sql` holds the questions that actually want a
warehouse: which domain pairs survive the filters most often across every run of the whole event,
how the biggest-killer filter changes with linker length, which cut-region combinations ever get
through. These scan everything and do not need to be fresh.

**The honest part:** at one hackathon's data volume, these queries would also run perfectly well
in the same Postgres. Snowflake is earning a real but secondary role here — separating
whole-history cohort scans from the one-minute operational panel, so a heavy query never competes
with the live panel for the same database. That is a genuine architectural division, and it is
also a division you would not bother making at this scale if you were not already planning to grow
out of it. If a judge asks which of the two is load-bearing, the answer is Timescale.

## .tech domain — not done, and it needs you

This session cannot register a domain: that takes a payment method and an account. The name I would
pick, in keeping with "a workshop, not a lab": **nanofoundry.tech** (alternatives, in order:
`thebench.tech`, `foundrybench.tech`, `splicetable.tech`). Register it at get.tech, point an A
record at the Vultr instance's address that `./deploy/bring-up.sh --vultr` prints, and the README's
placeholder becomes the real link. Everything on our side is ready for it; the step that is missing
is the one only you can do.

## Vultr — where the whole thing runs

`deploy/bring-up.sh --vultr` creates an instance through the Vultr API with
`deploy/cloud-init.yaml` as user data: it installs Node, Python and the TimescaleDB extension,
clones the repo, applies the hypertable schema, puts nginx in front of both services on port 80,
registers them as systemd units, and seeds the funnel history with a sweep. The same script with no
arguments brings the identical stack up locally — Timescale in Docker if Docker is there, JSONL if
not — so a judge can run one command on a laptop and see the infrastructure rather than a slide
about it.

**If it were removed:** the app still runs locally, but the API, the Postgres instance and the sweep
worker have nowhere to live, so the live panel only ever shows one browser's own session and the
`.tech` domain has nothing to point at.

## SerpApi — the citation trail, and the "do not trust the cartoon" message

Every catalogue card has a *Go and check the real biochemistry* button. It calls `/api/sources` on
our own API, which holds the SerpApi key server-side and returns public references for that enzyme.
This is load-bearing for a reason that is not technical: the whole app is an abstraction that is
wrong on purpose, and the fastest way to stop someone mistaking it for a source is to put the real
sources one click away on every card. The panel says plainly that Nano Foundry has not read them
and does not vouch for them.

**If it were removed:** the panel degrades to the two search links it would have run, which is
honest but manual. The claim it carries — *the cartoon is not the evidence* — would then rest only
on wording rather than on something a user can click.

## Northmark Compute and Cloud — the platform behind the agents

Taken as architecture, not a logo. Nano Foundry has three agents and they are declared in
`config/agents.json` rather than hand-wired: the **pipeline builder** (model-backed, tools
`catalogue.list` and `lane.validate`, max 8 stages, 20 s), the **rejection explainer** (model-backed,
tool `filters.explain`, 400 output tokens), and the **filter sweep runner** (no model at all, tools
`splice.funnel` and `events.write`, max 500 pairs). Tools live in one shared registry with
descriptions a judge can read. Every run writes a trace — per-tool latency, token counts, status —
and any trace can be replayed; replay refuses to claim it reproduced a model-backed run and says why
instead. `py/service.py` exposes `/agents`, `/agents/<id>/run`, `/agents/<id>/traces`,
`/traces/<id>/replay` and `/metrics`. The
registry's `refuse_fields` list is enforced on both sides of the wire, so the scope rule in
`docs/scope.md` §2 is a platform property rather than a convention.

**If it were removed:** the three capabilities would still exist, but as three bespoke code paths
with their models, prompts and limits inlined — no shared tool registry, no traces, no replay, no
dashboard, and no single place to change a model. The sweep runner in particular would stop being a
first-class agent and go back to being a script, which is the thing the registry is arguing against.

---

## The three I was asked to look at

These were in the brief as things to verify before using. I checked each one rather than assuming
from the name; here is what they turned out to be.

**particles.casberry.in — skipped as a dependency, and that is the right call.** It is a web app
("AI Particle Simulator"), not a library: a prompt-driven WebGL/Three.js particle designer that
exports a Vanilla JS, React or Three.js snippet for you to paste into your own code. There is no npm
package, no script tag, no API and no documentation, and its GitHub organisation has no library in
it. It could be used as an authoring tool — design a particle effect there, paste the exported
snippet in — but the molecule and construct cartoons here are deliberately chunky game pieces drawn
as plain SVG, which is a design decision we would have to undo to make room for a particle field.
Taking an unversioned, unlicensed exported snippet plus a Three.js dependency to do that would be a
dependency bolted on for credit, so it is not in the build.

**Origin Kit — could not verify.** Nothing by that name turns up as a product, SDK or hackathon
tool. The near-matches are different things entirely: Origin PC's S-Class Edge AI developer kit
(hardware), OriginLab's Origin Developer Kit (for their plotting software), an npm package called
`origin`, and some unrelated hackathons named ORIGIN. If this is a sponsor tool, send me the URL
and I will look properly; until then there is nothing here to integrate honestly.

**be-of-dao.com — nothing to integrate.** It resolves, but it is an art and music project ("sound
and image as one practice", "instruments and works by DAO") rather than developer tooling: no API,
no SDK, no docs, no sign-up. The "instruments" are musical works, not libraries. It could be
aesthetic inspiration and nothing more, so it is not in the build.
