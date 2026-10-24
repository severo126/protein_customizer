// Single source of truth for the wording the brief fixes. The UI imports these
// strings rather than writing its own, and test/wording.test.js asserts that
// the verdict wording and the not-checked list are exactly these.

export const PASS_VERDICT = 'Nothing here ruled this out';

export const PASS_EXPLANATION =
  'A pass is the absence of a red flag from a cartoon. It is not a prediction that this would fold, function, express, or be safe.';

export const CARTOON_PHYSICS_NOTE =
  'Classroom cartoon with order-of-magnitude-wrong physics. Passing means only that this toy did not rule it out. Nothing here says a construct would fold, function, or be safe.';

// Shown beside every verdict, as a standing list — never a footnote.
export const NOT_CHECKED = [
  'Folding kinetics — whether this could ever reach a folded state, and how fast',
  'Real side-chain packing — every atom-level contact at the join',
  'Expression — whether a cell would make it at all',
  'Solubility — whether it would stay dissolved',
  'Aggregation — whether copies would clump',
  'Activity retention — whether either domain would still do its job',
  'Allostery — any long-range communication between the domains',
  'Cellular context — localisation, partners, traffic, regulation, degradation',
  'Anything to do with actual safety',
];

// Words this project will not apply to a construct, anywhere in the UI.
export const FORBIDDEN_VERDICT_WORDS = ['validated', 'approved', 'viable', 'stable', 'correct', 'designed', 'verified', 'safe'];
