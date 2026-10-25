// Generate the route-search parity contract: src/data/route-cases.json.
//
// Same deal as tools/make-parity-cases.mjs. The file is generated from the
// JavaScript side and then asserted by BOTH suites, so if py/nano_foundry/
// routes.py drifts from src/model/routes.js the file says exactly which target
// and which field disagree. Regenerate it deliberately (npm run routes:build)
// when the search changes, and change both implementations in the same commit.
//
// What is in a case, and why it is worth pinning:
//
//   * reachable / exhausted — the two claims the app makes on screen. If these
//     ever differed between the two implementations, one of them would be
//     telling a user "nothing the catalogue can do reaches this" while the
//     other found a chain.
//   * routeIds in order — the chains themselves, by the id that encodes the
//     starting molecule and every stage, so a reordering or a dropped chain is
//     a failure rather than a silent difference.
//   * metrics — the numbers the criteria sort on. These are what Gemini is
//     allowed to read out, so they are the numbers it matters most that both
//     halves compute the same way.
//   * rankings — the orderings themselves, including the tie-breaks, because a
//     stable total order is the thing that makes "fewest stages" reproducible.
//   * headline — the sentence shown to the user, character for character. It
//     carries the honesty rules (a dead end only reads as a dead end when the
//     scan finished), so a divergence here is a divergence in what the app
//     claims, not just in how it is worded.
//   * nearMisses — how far the search got when it got nowhere, which is the
//     whole of the dead-end report.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  searchRoutes,
  makeTarget,
  routeMetrics,
  rankRoutes,
  searchHeadline,
  describeTarget,
  validateTarget,
  targetVocabulary,
  CRITERIA,
  SEARCH_LIMITS,
} from '../src/model/routes.js';

const catalogue = JSON.parse(readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'));
const entries = catalogue.entries;
const vocab = targetVocabulary(entries);

// Group sets rotate over the catalogue's own group vocabulary rather than being
// hand-picked, so the contract covers groups nobody thought to test.
const GROUP_SETS = [
  [],
  ['phosphate'],
  ['hydroxyl', 'hydroxyl'],
  ['amine', 'carboxyl'],
];

const specs = [];
vocab.cores.forEach((core, i) => {
  specs.push({
    core,
    groups: GROUP_SETS[i % GROUP_SETS.length],
    match: i % 2 === 0 ? 'exact' : 'carries',
  });
});

// Deliberate cases on top of the sweep: the shapes that carry a rule rather
// than a number.
specs.push(
  // The target shown to the project owner as the first proof the search worked.
  { core: 'fructose', groups: ['phosphate', 'hydroxyl', 'hydroxyl', 'hydroxyl'], match: 'exact' },
  // Reachable several ways from several starters, so the per-set cap bites.
  { core: 'glucose-6-p', groups: [], match: 'carries' },
  // A real dead end: no rule in the catalogue puts a sulfate on a malate.
  { core: 'malate', groups: ['sulfate'], match: 'exact' },
  // A core only a rearrange rule can reach, so the skeleton has to move.
  { core: 'triose-iso', groups: [], match: 'carries' },
  // More groups than the walk will carry, so the group cap decides it.
  { core: 'glucose', groups: Array(SEARCH_LIMITS.maxGroups + 1).fill('phosphate'), match: 'exact' },
  // The starting molecules named explicitly, in both directions: restricted to
  // the one starter that can get there, and restricted to one that cannot. Two
  // cases, because a restriction that silently did nothing would pass the first
  // on its own.
  { core: 'glucose-6-p', groups: [], match: 'carries', starterIds: ['glucose-1-p'] },
  { core: 'glucose-6-p', groups: [], match: 'carries', starterIds: ['starch'] },
);

const cases = specs.map((spec) => {
  const target = makeTarget(spec);
  const opts = spec.starterIds ? { starterIds: spec.starterIds } : {};
  const result = searchRoutes(entries, target, opts);
  return {
    spec: { core: spec.core, groups: spec.groups, match: spec.match, starter_ids: spec.starterIds ?? null },
    expect: {
      valid: validateTarget(entries, target).ok,
      describe: describeTarget(target),
      headline: searchHeadline(result),
      reachable: result.reachable,
      exhausted: result.scan.exhausted,
      states_seen: result.scan.statesSeen,
      nodes_explored: result.scan.nodesExplored,
      total_found: result.totalFound,
      truncated: result.truncated,
      shortest_depth: result.shortestDepth,
      longest_shortest: result.longestShortest,
      reached_from: result.reachedFrom.map((r) => ({ starter_id: r.starterId, stages: r.stages })),
      route_ids: result.routes.map((r) => r.id),
      // Every molecule along every chain, so a route that merely looks right by
      // its id cannot pass. This is the field that makes the contract about the
      // chemistry rather than about the bookkeeping.
      molecules: result.routes.map((r) => r.molecules.map((m) => `${m.core}|${[...m.groups].join(',')}`)),
      metrics: result.routes.map((r) => {
        const m = routeMetrics(entries, r);
        return {
          route_id: m.routeId,
          stages: m.stages,
          supply_load: m.supplyLoad,
          cofactors: m.cofactors,
          needs: m.needs,
          temp_window: m.tempWindow ? [m.tempWindow.low, m.tempWindow.high, m.tempWindow.width] : null,
          temp_empty: m.tempEmpty,
          temp_blame: m.tempBlame ? [m.tempBlame.floor, m.tempBlame.ceiling] : null,
          ph_window: m.phWindow ? [m.phWindow.low, m.phWindow.high, m.phWindow.width] : null,
          ph_empty: m.phEmpty,
          ph_blame: m.phBlame ? [m.phBlame.floor, m.phBlame.ceiling] : null,
        };
      }),
      rankings: CRITERIA.map((c) => ({
        criterion: c.id,
        order: rankRoutes(entries, result.routes, c.id).map((x) => x.route.id),
      })),
      near_misses: result.nearMisses.map((n) => ({
        starter_id: n.starterId,
        depth: n.depth,
        molecule: `${n.molecule.core}|${[...n.molecule.groups].join(',')}`,
        distance: {
          core_off: n.distance.coreOff,
          missing: n.distance.missing,
          extra: n.distance.extra,
          total: n.distance.total,
        },
      })),
    },
  };
});

// The walk run to its full depth rather than stopping at the first layer that
// produces the target. This is the mode the picker's reachability map runs the
// search in, so it needs pinning on both sides: a divergence here would mean
// the map and the search disagreed about what this catalogue can reach.
const explored = (() => {
  // Reached at one stage rather than at zero, so stopping and running on
  // genuinely differ: a target matched by the starting molecule itself would
  // end both walks immediately and pin nothing.
  const target = makeTarget({ core: 'glucose-6-p', groups: [], match: 'carries' });
  const stopped = searchRoutes(entries, target, { starterIds: ['glucose-1-p'] });
  const full = searchRoutes(entries, target, { starterIds: ['glucose-1-p'], stopAtTarget: false });
  return {
    spec: { core: 'glucose-6-p', groups: [], match: 'carries', starter_ids: ['glucose-1-p'] },
    stopped: {
      states_seen: stopped.scan.statesSeen,
      shortest_depth: stopped.shortestDepth,
      exhausted: stopped.scan.exhausted,
    },
    full: {
      // The same shortest depth — running on past the target must not change
      // how far away the target is — but many more molecules seen.
      states_seen: full.scan.statesSeen,
      shortest_depth: full.shortestDepth,
      exhausted: full.scan.exhausted,
    },
  };
})();

// One case with the budget cut to almost nothing, which is the only way to
// exercise the branch that refuses to call an unfinished scan a dead end. It
// is pinned separately because the honesty rule it carries is the one thing in
// this file a reviewer should be able to find by name.
const starved = (() => {
  const target = makeTarget({ core: 'malate', groups: ['sulfate'], match: 'exact' });
  const limits = { maxScanNodes: 50 };
  const result = searchRoutes(entries, target, limits);
  return {
    limits: { max_scan_nodes: limits.maxScanNodes },
    expect: {
      reachable: result.reachable,
      exhausted: result.scan.exhausted,
      headline: searchHeadline(result),
    },
  };
})();

const out = {
  generated_by: 'tools/make-route-cases.mjs',
  note:
    'The route-search parity contract. Generated from src/model/routes.js and asserted by ' +
    'both test/routes.test.js and py/tests/test_routes_parity.py. Do not hand-edit.',
  catalogue_entries: entries.length,
  limits: {
    max_depth: SEARCH_LIMITS.maxDepth,
    max_groups: SEARCH_LIMITS.maxGroups,
    max_routes: SEARCH_LIMITS.maxRoutes,
    max_routes_per_starter: SEARCH_LIMITS.maxRoutesPerStarter,
    routes_per_set: SEARCH_LIMITS.routesPerSet,
    near_misses: SEARCH_LIMITS.nearMisses,
  },
  vocabulary: vocab,
  criteria: CRITERIA.map((c) => c.id),
  cases,
  starved,
  explored,
};

writeFileSync(new URL('../src/data/route-cases.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);

const reachable = cases.filter((c) => c.expect.reachable).length;
console.log(
  `route-cases.json: ${cases.length} targets, ${reachable} reachable, ${cases.length - reachable} dead ends, ` +
    `${cases.reduce((n, c) => n + c.expect.route_ids.length, 0)} chains pinned`,
);
