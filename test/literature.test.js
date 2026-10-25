// The retrieval and explanation layer, held to the same rules as everything else.
//
// The claim this layer makes is a separation of duties: deterministic filters
// decide, retrieval finds published work on the failure mode a filter named, and
// a model only reads what was retrieved. These tests are what stops that
// separation from quietly eroding — so they check for the absence of scoring and
// of fix-giving as hard as they check the mapping is complete.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { root } from './helpers.js';
import { FILTERS } from '../src/model/splice.js';
import { FAILURE_MODES, failureModeFor, uncoveredFilters } from '../src/model/failureModes.js';
import { referenceIsAllowed, screenReferences } from '../tools/api/sourceFilter.mjs';

const modeText = (m) => `${m.realName} ${m.gist} ${m.queries.join(' ')}`;
const allModeText = Object.values(FAILURE_MODES).map(modeText).join(' ');

test('every filter that can reject something has a failure mode mapped to it', () => {
  assert.deepEqual(uncoveredFilters(), []);
  for (const f of FILTERS) {
    const mode = failureModeFor(f.id);
    assert.ok(mode, `no failure mode for the ${f.id} filter`);
    assert.ok(mode.realName.length > 4, `${f.id}: realName is too short to mean anything`);
    assert.ok(mode.gist.length > 80, `${f.id}: the gist should actually explain the mode`);
    assert.ok(mode.queries.length >= 1, `${f.id}: needs at least one query`);
  }
});

test('no failure mode is mapped to a filter that does not exist', () => {
  const ids = new Set(FILTERS.map((f) => f.id));
  for (const id of Object.keys(FAILURE_MODES)) {
    assert.ok(ids.has(id), `FAILURE_MODES has an entry for "${id}", which is not a filter`);
  }
});

test('failureModeFor is the only way in, and it returns null rather than guessing', () => {
  assert.equal(failureModeFor('not-a-filter'), null);
  assert.equal(failureModeFor(undefined), null);
});

test('no query sends the search anywhere docs/scope.md §1 excludes', () => {
  // The same screen the server applies to what comes back, applied to what goes
  // out: a query for a toxin would be screened on return, but it should never be
  // sent in the first place.
  for (const [id, mode] of Object.entries(FAILURE_MODES)) {
    for (const q of mode.queries) {
      assert.ok(referenceIsAllowed({ title: q, link: 'x' }), `${id}: the query "${q}" goes at an excluded topic`);
    }
  }
});

test('nothing in the failure-mode map claims a construct would work, or says how to fix one', () => {
  // The two things this app will not do, checked against the text that is shown
  // beside a rejection.
  for (const word of ['viable', 'stable', 'validated', 'approved', 'verified', 'safe', 'designed']) {
    assert.ok(
      !new RegExp(`\\b${word}\\b`, 'i').test(allModeText),
      `the failure-mode map applies "${word}" to a construct`,
    );
  }
  for (const phrase of [/\byou (?:should|could|can) (?:try|use|add|lengthen|shorten)\b/i, /\bto fix (?:this|it)\b/i, /\binstead,? try\b/i]) {
    assert.ok(!phrase.test(allModeText), `the failure-mode map suggests a fix: ${phrase}`);
  }
});

test('the retrieval screen drops excluded topics and sequence-shaped snippets', () => {
  assert.ok(referenceIsAllowed({ title: 'Flexible linker length in two-domain fusion proteins', link: 'a' }));

  // The open literature holds plenty the hand-curated catalogue leaves out.
  assert.ok(!referenceIsAllowed({ title: 'Structure of a bacterial toxin', link: 'b' }));
  assert.ok(!referenceIsAllowed({ title: 'Linker design', snippet: 'in a virulence factor', link: 'c' }));
  assert.ok(!referenceIsAllowed({ title: 'Domain boundaries in a human pathogen', link: 'd' }));

  // A snippet that has pasted a run of residue letters into its text (§2).
  const run = 'MKT'.padEnd(3, '') + 'A'.repeat(30);
  assert.ok(!referenceIsAllowed({ title: 'Linker study', snippet: run, link: 'e' }));

  assert.ok(!referenceIsAllowed({ title: '', snippet: '', link: '' }), 'an empty reference is not worth showing');
});

test('the screen reports what it held back rather than quietly shortening the list', () => {
  const { kept, dropped } = screenReferences([
    { title: 'Interdomain flexibility by small-angle scattering', link: 'a' },
    { title: 'A neurotoxin structure', link: 'b' },
    { title: 'Steric hindrance in bifunctional fusions', link: 'c' },
  ]);
  assert.equal(kept.length, 2);
  assert.equal(dropped, 1);
  assert.deepEqual(screenReferences(undefined), { kept: [], dropped: 0 });
});

test('there is one retrieval path, and the literature panel uses it', () => {
  const panel = readFileSync(`${root}/src/ui/literature.js`, 'utf8');
  const fetches = [...panel.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(fetches.length, 1, 'the panel should reach the network in exactly one place');
  assert.match(fetches[0], /\/api\/sources/, 'retrieval must go through /api/sources, not a second path');
  // Naming SerpApi in the caveat is right — it is where the results came from. Reaching it is not.
  assert.ok(!/serpapi\.com|generativelanguage|api_key|apiKey/i.test(panel), 'the panel must not hold a key or call a vendor endpoint directly');
});

test('the panel leads with the deterministic verdict and denies having a score', () => {
  const panel = readFileSync(`${root}/src/ui/literature.js`, 'utf8');
  assert.match(panel, /CARTOON_PHYSICS_NOTE/, 'the cartoon note belongs beside a retrieved explanation too');
  assert.match(panel, /rejected this/, 'the panel must name the filter that decided');
  assert.match(panel, /no viability\s*\n?\s*number in this app/, 'the panel must say there is no score and why');
  assert.match(panel, /did not\s*\n?\s*decide this rejection/, 'the panel must say the model did not decide');
});

test('the explainer agent is declared in the registry with the limits it runs under', () => {
  const registry = JSON.parse(readFileSync(`${root}/config/agents.json`, 'utf8'));
  const agent = registry.agents.find((a) => a.id === 'literature-explainer');
  assert.ok(agent, 'the literature explainer must be declared in config/agents.json');
  assert.equal(agent.instructions, 'config/instructions/literature-explainer.md');
  assert.ok(agent.limits.timeout_ms > 0 && agent.limits.max_output_tokens > 0);
  for (const t of agent.tools) assert.ok(registry.tools[t], `agent names an undeclared tool "${t}"`);
  assert.ok(registry.tools['sources.search'], 'the retrieval path must be declared as a tool');
  assert.equal(registry.tools['sources.search'].kind, 'retrieval');
});

test('the explainer instructions forbid scoring, fixing and deciding', () => {
  const md = readFileSync(`${root}/config/instructions/literature-explainer.md`, 'utf8').toLowerCase();
  for (const rule of ['do not score anything', 'do not suggest how to fix', 'you do not decide verdicts', 'order-of-magnitude-wrong']) {
    assert.ok(md.includes(rule), `the instructions are missing: "${rule}"`);
  }
});
