// Designed is not the same as obtained.
//
// The failure mode nobody expects: a construct passes every structural check and
// then never exists, because whatever was supposed to make it cannot. Disulfide
// bonds do not form in a reducing cytoplasm. Heme, flavins and metals have to be
// available. Glycosylation needs a eukaryote, a membrane anchor needs a
// membrane, and secretion needs a pathway to do it.
//
// This reads two things already in the catalogue: the `needs` field, which lists
// what a host must provide beyond the cofactor, and the `cofactor` string, whose
// metals and prosthetic groups are requirements of the pot rather than
// quantities spent (see ledger.js for that distinction).

import { cofactorTokens } from './compatibility.js';
import { classifyCofactor } from './ledger.js';

export const HOST_DISCLAIMER =
  'A coarse cartoon of what four common expression routes can and cannot provide. Real hosts are engineered around every one of these limits, and plenty of enzymes are made in places this table says they cannot be.';

// What each requirement token means, for the explanation line.
// Short noun phrases, so a list of two or three reads as a sentence. The notes
// used to carry their own explanation and the commas inside them made the
// assembled sentence unreadable; the explanation lives in REQUIREMENT_WHY now.
export const REQUIREMENT_NOTES = {
  disulfide: 'disulfide bonds',
  secretion: 'a secretory pathway',
  glycosylation: 'glycosylation',
  membrane: 'a membrane to sit in',
  heme: 'a heme group',
  PLP: 'a pyridoxal phosphate group',
  TPP: 'a thiamine pyrophosphate group',
  biotin: 'a biotin arm',
  'Mg2+': 'magnesium',
  'Ca2+': 'calcium',
  'Zn2+': 'zinc',
  'Ni2+': 'nickel',
  'Fe3+': 'iron',
};

// The sentence the card shows under a blocked entry.
export const REQUIREMENT_WHY = {
  disulfide: 'Disulfide bonds do not form in a reducing cytoplasm.',
  secretion: 'It folds on the way out, so something has to secrete it.',
  glycosylation: 'Sugars are added in a eukaryote\u2019s secretory pathway.',
  membrane: 'It sits in a membrane rather than in solution.',
  heme: 'The host has to make heme, or be fed it.',
  PLP: 'The host has to supply the pyridoxal phosphate cofactor.',
  TPP: 'The host has to supply the thiamine pyrophosphate cofactor.',
  biotin: 'The host has to attach the biotin arm.',
  'Mg2+': 'The pot has to contain magnesium.',
  'Ca2+': 'The pot has to contain calcium.',
  'Zn2+': 'The pot has to contain zinc.',
  'Ni2+': 'Nickel is not normally available and has to be supplied.',
  'Fe3+': 'The pot has to contain iron.',
};

export const HOSTS = [
  {
    id: 'ecoli-cytoplasm',
    label: 'E. coli cytoplasm',
    blurb: 'The default and the cheapest. Reducing, so disulfides do not form, and no machinery for sugars or membranes.',
    provides: ['Mg2+', 'Ca2+', 'Zn2+', 'Fe3+', 'PLP', 'TPP', 'biotin'],
  },
  {
    id: 'ecoli-periplasm',
    label: 'E. coli periplasm',
    blurb: 'Oxidising, so disulfides form and secreted enzymes fold. Still a bacterium: no sugars, no organelles.',
    provides: ['Mg2+', 'Ca2+', 'Zn2+', 'Fe3+', 'PLP', 'TPP', 'biotin', 'disulfide', 'secretion'],
  },
  {
    id: 'yeast',
    label: 'Yeast',
    blurb: 'A eukaryote with a secretory pathway, so sugars, membranes and heme are all available. Slower and more work.',
    provides: ['Mg2+', 'Ca2+', 'Zn2+', 'Ni2+', 'Fe3+', 'PLP', 'TPP', 'biotin', 'heme', 'disulfide', 'secretion', 'glycosylation', 'membrane'],
  },
  {
    id: 'cell-free',
    label: 'Cell-free',
    blurb: 'No cell at all, so you set the conditions and add what you like. Nothing is secreted, nothing is glycosylated, and there is no membrane to sit in.',
    provides: ['Mg2+', 'Ca2+', 'Zn2+', 'Ni2+', 'Fe3+', 'PLP', 'TPP', 'biotin', 'heme', 'disulfide'],
  },
];

export const DEFAULT_HOST = 'ecoli-cytoplasm';

export function host(id) {
  const h = HOSTS.find((x) => x.id === id);
  if (!h) throw new Error(`unknown host: ${id}`);
  return h;
}

// Everything the pot has to supply for this entry: the structural requirements
// in `needs`, plus the metals and prosthetic groups named in `cofactor`.
export function requirements(entry) {
  const out = [];
  for (const token of entry.needs ?? []) {
    out.push({ token, kind: 'structural' });
  }
  for (const token of cofactorTokens(entry.cofactor)) {
    const kind = classifyCofactor(token);
    if (kind === 'metal' || kind === 'prosthetic') out.push({ token, kind });
  }
  return out;
}

export function supports(hostId, entry) {
  const h = host(hostId);
  const missing = requirements(entry).filter((r) => !h.provides.includes(r.token));
  return {
    ok: missing.length === 0,
    missing,
    reason: missing.length
      ? `${entry.name} needs ${listNotes(missing.map((m) => m.token))}, and ${h.label} cannot provide ${missing.length === 1 ? 'that' : 'those'}.`
      : null,
  };
}

// Split the fixed catalogue for the funnel. Nothing is removed from the
// catalogue; entries a host cannot support are returned with the reason, so the
// card can grey out and still say why.
export function filterByHost(hostId, entries) {
  const available = [];
  const blocked = [];
  for (const entry of entries) {
    const v = supports(hostId, entry);
    if (v.ok) available.push(entry);
    else blocked.push({ entry, missing: v.missing, reason: v.reason });
  }
  return { host: host(hostId), available, blocked };
}

// Light-shaped, so a lane panel can show it beside the others.
export function checkHost(hostId, entries) {
  const h = host(hostId);
  if (!entries.length) {
    return { id: 'host', colour: 'grey', message: `Add stages to check whether ${h.label} could make them.`, blocked: [] };
  }

  const blocked = entries
    .map((entry, i) => ({ stage: i + 1, entry, ...supports(hostId, entry) }))
    .filter((r) => !r.ok);

  if (!blocked.length) {
    return { id: 'host', colour: 'green', message: `${h.label} can supply everything these ${entries.length === 1 ? 'stage needs' : 'stages need'}.`, blocked };
  }

  const first = blocked[0];
  const extra = blocked.length > 1 ? ` (${blocked.length} stages in this lane.)` : '';
  return {
    id: 'host',
    colour: 'red',
    message: `Stage ${first.stage} is the problem before any chemistry starts: ${first.reason}${extra}`,
    blocked,
  };
}

function listNotes(tokens) {
  const notes = tokens.map((t) => REQUIREMENT_NOTES[t] ?? t);
  if (notes.length === 1) return notes[0];
  return `${notes.slice(0, -1).join(', ')} and ${notes[notes.length - 1]}`;
}

// Why each missing requirement is missing, for the card under a blocked entry.
export function whyMissing(missing) {
  return missing.map((m) => ({ token: m.token, why: REQUIREMENT_WHY[m.token] ?? null }));
}
