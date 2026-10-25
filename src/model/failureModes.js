// What a cartoon rejection is gesturing at in the real literature.
//
// Each of the six splice filters is geometry on two spheres and a rubber band.
// Every one of them is nonetheless a crude stand-in for a failure mode people
// have published on. This file is the map between the two, and it is plain
// committed data rather than anything a model produces, for the same reason the
// filters are plain code: the filter decides, this only names what to go and
// read about the decision, and src/ui/literature.js turns these queries into
// real references through /api/sources.
//
// The division of labour is the whole point. Nothing here is consulted to reach
// a verdict. A verdict is already in hand by the time any of this is read.
//
// Rules test/literature.test.js holds this file to:
//   * exactly one entry per filter id in FILTERS, and no orphan entries;
//   * no query goes near the topics docs/scope.md §1 excludes;
//   * nothing claims a construct would fold, work, or be safe;
//   * nothing suggests how to fix a rejection — this app does not help anyone
//     design anything (docs/scope.md §3).

import { FILTERS } from './splice.js';

export const FAILURE_MODES = {
  'cut-site': {
    realName: 'Where the domain boundary is drawn',
    gist:
      'The cartoon only asks whether the cut landed in a loop. The matching real question is how a ' +
      'domain boundary gets chosen, and what has been reported when a junction is placed inside a helix ' +
      'or a sheet rather than in the disordered stretch between structured elements.',
    queries: [
      'inter-domain linker insertion fusion protein expression bioactivity',
      'protein domain boundary prediction construct design truncation',
    ],
  },

  'backbone-join': {
    realName: 'Linker length and the tension on the join',
    gist:
      'The cartoon measures a straight-line reach of 0.34 nm per linker unit and rejects a join it cannot ' +
      'bridge, or one left close to fully extended. The real literature on this is about linker length and ' +
      'composition in two-domain constructs, and what has been measured when a linker is too short for the ' +
      'two parts to sit where they need to sit.',
    queries: [
      'fusion protein linker length effect activity two-domain construct',
      'flexible linker design multidomain protein engineering review',
    ],
  },

  clash: {
    realName: 'One part getting in the other part’s way',
    gist:
      'The cartoon spots two spheres passing through each other, or a gap the backbone cannot span. The ' +
      'published version of this is steric interference between fused parts — a partner sitting across an ' +
      'active site or a substrate channel — and most of that literature turns out to be about which part ' +
      'goes first, because swapping the order of the same two parts changes how much activity survives.',
    queries: [
      'fusion order N-terminal C-terminal effect on enzyme activity bifunctional',
      'substrate channelling bifunctional fusion enzyme domain orientation',
    ],
  },

  compactness: {
    realName: 'Elongated versus compact architecture',
    gist:
      'The cartoon computes a radius of gyration for two uniform spheres and asks whether it falls in a ' +
      'band. The real measurement behind that is small-angle scattering on multidomain proteins, where a ' +
      'flexibly linked pair reads as an extended, mobile arrangement rather than one fixed compact shape.',
    queries: [
      'small-angle X-ray scattering multidomain protein radius of gyration flexible linker',
      'multidomain protein interdomain flexibility ensemble extended conformation',
    ],
  },

  'buried-core': {
    realName: 'Hydrophobic surface left facing solvent',
    gist:
      'The cartoon takes a dot product against an invented patch direction. What it gestures at is real and ' +
      'well documented: surface that is meant to be buried ending up exposed, and the aggregation and ' +
      'inclusion-body behaviour that has been reported for recombinant constructs when it is.',
    queries: [
      'recombinant protein aggregation exposed hydrophobic surface inclusion bodies',
      'fusion protein misfolding solubility hydrophobic patch surface exposure',
    ],
  },

  'operating-window': {
    realName: 'Parts that do not share conditions',
    gist:
      'The cartoon intersects the committed temperature and pH windows of the two parents, and of the rest ' +
      'of the lane. The literature counterpart is running several enzymes together when their optima do not ' +
      'coincide, and the compromise conditions and co-immobilisation work people have published around it.',
    queries: [
      'multi-enzyme cascade mismatched pH temperature optima one pot compromise conditions',
      'co-immobilisation enzyme cascade incompatible optima reaction engineering',
    ],
  },
};

// The filter is in hand first; this is only the reading list that goes with it.
export function failureModeFor(filterId) {
  return FAILURE_MODES[filterId] ?? null;
}

// Filter ids with no entry here. Should always be empty; the test asserts it.
export function uncoveredFilters() {
  return FILTERS.filter((f) => !FAILURE_MODES[f.id]).map((f) => f.id);
}
