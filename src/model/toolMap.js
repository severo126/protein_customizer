// "What a real workflow would use here."
//
// This app needs a visible classroom-toy caveat anyway. A footer nobody reads is
// a waste of the requirement; the same words placed beside each verdict are the
// most interesting panel in the app, because the honest answer to "how would you
// really know?" is different and more specific for every check.
//
// The claim worth putting under the whole table: nothing in the modern
// protein-design stack predicts whether a construct still does chemistry. The
// famous tools predict structure, generate backbones that are likely to fold,
// and design sequences likely to fit a backbone. Catalysis is the open problem,
// and the way anyone finds out is by making variants and testing them.

export const STACK_NOTE =
  'Structure predictors, backbone generators and sequence designers answer questions about shape. None of them tells you whether a construct would still catalyse anything. That is not a gap in this toy in particular — it is where the real field is.';

// The thing this app does that the famous tools do not. Worth stating plainly:
// every layer of the design stack takes one protein and asks a structural
// question about it. Whether two enzymes can work in the same vessel is not a
// structural question, and it is where most real cascade work actually goes.
export const POT_NOTE =
  'Every tool in that stack looks at one protein at a time. Shared operating windows, cofactor balance, product inhibition and thermodynamic drive are questions about the pot, not about a fold, and they are handled by reasoning rather than by prediction.';

// Keyed by the filter and light ids the model already uses.
export const TOOL_MAP = {
  'cut-site': {
    question: 'Did the cut fall somewhere a protein can tolerate being cut?',
    real: 'Known domain boundaries, read off a structure and an alignment of relatives.',
    breaks: 'Nothing predicts a good cut point well. People reuse boundaries somebody has already mapped, and the useful signal is evolutionary rather than physical.',
  },
  'backbone-join': {
    question: 'Can the linker actually bridge the two ends?',
    real: 'Model the fused construct with a structure predictor and look at the confidence over the join.',
    breaks: 'A linker is flexible, so a predictor returns low confidence there by design. That tells you the region has no single structure, not that the join is bad.',
  },
  clash: {
    question: 'Do the two halves pass through each other?',
    real: 'Atom-level packing in a predicted or modelled structure.',
    breaks: 'This toy uses two spheres. Real clashes are side-chain scale, and a model that resolves them still says nothing about whether the active sites survived.',
  },
  compactness: {
    question: 'Is the construct the size a protein of this mass should be?',
    real: 'Radius of gyration, usually measured by small-angle scattering.',
    breaks: 'A measured radius is worth far more than a predicted one, and a sensible radius is a weak condition: plenty of compact proteins do nothing.',
  },
  'buried-core': {
    question: 'Did hydrophobic surface end up facing the solvent?',
    real: 'Aggregation and solubility predictors, plus the experience that exposed hydrophobic patches cause trouble.',
    breaks: 'These are real tools and they are mediocre. They disagree with each other, and with the expression result, often.',
  },
  'operating-window': {
    question: 'Do the two parents work in the same conditions?',
    real: 'Measured, or taken from a characterised relative. There is no structural calculation for it.',
    breaks: 'Essentially nobody predicts a pH or temperature optimum from a structure. This is one of the places where the literature is still a lookup table.',
  },

  temp: {
    question: 'Is there a temperature they will all run at?',
    real: 'Activity assays at a series of temperatures, for the length of run you intend.',
    breaks: 'The measured optimum depends on how long the assay ran, so a single quoted number is incomplete without its run length.',
  },
  ph: {
    question: 'Is there a pH they will all run at?',
    real: 'Activity against pH, measured in a buffer that holds over the range.',
    breaks: 'Buffers have their own temperature dependence, so a pot set to pH 8 cold is not at pH 8 warm. And the profile is a curve, so an overlap is not the same as both enzymes being happy.',
  },
  cofactor: {
    question: 'Does one stage use up what another needs?',
    real: 'Stoichiometry, and measuring the cofactor pool over the run.',
    breaks: 'This toy counts stages, not molecules. Whether a pool actually runs out depends on concentrations it has no model of.',
  },
  inhibition: {
    question: 'Does a product get in the way of an earlier stage?',
    real: 'Measured inhibition constants, and watching the rate fall as product accumulates.',
    breaks: 'The catalogue carries hand-curated sensitivity lists, not constants, so this flags a direction and never a magnitude.',
  },
  ledger: {
    question: 'Does the lane put back what it spends?',
    real: 'Reaction stoichiometry plus a cofactor regeneration system, which is standard practice rather than a prediction.',
    breaks: 'Counting stages is not counting turnovers. A single stage run hard can drain a pool that three gentle stages would not.',
  },
  kinetics: {
    question: 'Can each stage keep up with the one before it?',
    real: 'Measured rate constants for each step, then a kinetic model of the whole route.',
    breaks: 'This toy has three speed labels where the real thing has numbers spanning orders of magnitude. It can say which stage is the bottleneck and never by how much.',
  },
  host: {
    question: 'Could anything actually make these enzymes?',
    real: 'Expression trials. You pick a host, try it, and find out — usually across several hosts and several constructs at once.',
    breaks: 'This is a four-column lookup table and the real answer is empirical. Hosts are engineered around every limit in it, and plenty of enzymes are made in places this table says they cannot be.',
  },
  drive: {
    question: 'Will the step go forward at all?',
    real: 'Equilibrium constants and a thermodynamic analysis of the route at the concentrations you intend to run.',
    breaks: 'This toy has three labels and no concentrations, so it can show that a downstream stage rescues an uphill one but not whether it rescues it enough.',
  },
};

export function toolNote(id) {
  return TOOL_MAP[id] ?? null;
}

export const COVERED_CHECKS = Object.keys(TOOL_MAP);
