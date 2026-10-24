// The bench: run a molecule through a lane of enzyme stages.
//
// Everything here is deterministic integer-and-float bookkeeping over the
// symbolic molecule model. No kinetics, no thermodynamics, no real rates.

import { cloneMolecule, hasGroups, removeGroups, groupMeta, prettyCore, describe } from './molecules.js';

export const SCORE_DISCLAIMER =
  'Foundry Score is a made-up number with made-up units. It is not a yield, a turnover, a rate or a prediction.';

// Apply one enzyme to one molecule. Returns either a product or a mismatch.
export function runStage(mol, entry) {
  const a = entry.action;
  const input = cloneMolecule(mol);

  if (a.op === 'add') {
    if (!hasGroups(input, a.requires)) {
      return mismatch(entry, input, `needs ${listGroups(a.requires)} on the input to hang a ${groupMeta(a.group).label} onto, and this molecule has none free`);
    }
    return ok(entry, input, { ...input, groups: [...input.groups, a.group] }, `added a ${groupMeta(a.group).label}`);
  }

  if (a.op === 'remove') {
    if (!hasGroups(input, [a.group])) {
      return mismatch(entry, input, `only cuts off a ${groupMeta(a.group).label}, and this molecule does not carry one`);
    }
    const groups = removeGroups(input.groups, [a.group]);
    if (a.yields) groups.push(a.yields);
    return ok(entry, input, { ...input, groups }, `removed a ${groupMeta(a.group).label}${a.yields ? `, leaving a ${groupMeta(a.yields).label}` : ''}`);
  }

  if (a.op === 'rearrange') {
    if (input.core !== a.from) {
      return mismatch(entry, input, `only rearranges a ${prettyCore(a.from)} skeleton, and this stage handed it ${prettyCore(input.core)}`);
    }
    return ok(entry, input, { ...input, core: a.to }, `rearranged the skeleton into ${prettyCore(a.to)}`);
  }

  if (a.op === 'join') {
    if (!hasGroups(input, a.requires)) {
      return mismatch(entry, input, `needs ${listGroups(a.requires)} on the same molecule to form a new ${groupMeta(a.group).label}`);
    }
    const groups = removeGroups(input.groups, a.requires);
    groups.push(a.group);
    return ok(entry, input, { ...input, groups }, `joined ${listGroups(a.requires)} into a ${groupMeta(a.group).label}`);
  }

  return mismatch(entry, input, `has no rule this toy knows how to run (op "${a.op}")`);
}

function ok(entry, input, product, what) {
  return { ok: true, enzymeId: entry.id, input, product, what };
}

function mismatch(entry, input, why) {
  return {
    ok: false,
    enzymeId: entry.id,
    input,
    product: null,
    what: null,
    stallReason: `${entry.name} ${why}.`,
  };
}

function listGroups(groups) {
  const counts = new Map();
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()]
    .map(([g, n]) => (n > 1 ? `${n} ${groupMeta(g).label} groups` : `a ${groupMeta(g).label}`))
    .join(' and ');
}

// Run the whole lane. Stops reporting products at the first mismatch but still
// lists the later stages so the UI can grey them out.
export function runPipeline(startMolecule, entries) {
  const stages = [];
  let current = cloneMolecule(startMolecule);
  let stalled = false;
  let stalledAt = -1;

  entries.forEach((entry, i) => {
    if (stalled) {
      stages.push({ index: i, enzyme: entry, state: 'unreached', input: null, product: null });
      return;
    }
    const r = runStage(current, entry);
    if (r.ok) {
      stages.push({ index: i, enzyme: entry, state: 'ran', input: r.input, product: r.product, what: r.what });
      current = r.product;
    } else {
      stalled = true;
      stalledAt = i;
      stages.push({ index: i, enzyme: entry, state: 'mismatch', input: r.input, product: null, stallReason: r.stallReason });
    }
  });

  return {
    start: cloneMolecule(startMolecule),
    stages,
    stalled,
    stalledAt,
    product: stalled ? null : current,
    productDescription: stalled ? null : describe(current),
    score: foundryScore(entries, stages),
    scoreDisclaimer: SCORE_DISCLAIMER,
  };
}

// A deliberately fake score. Narrow shared windows and long lanes cost points;
// a stall caps it. Documented as meaningless in the UI next to the number.
export function foundryScore(entries, stages) {
  const ran = stages.filter((s) => s.state === 'ran').length;
  if (!entries.length) return { value: 0, basis: 'empty lane' };

  const tLow = Math.max(...entries.map((e) => e.temp[0]));
  const tHigh = Math.min(...entries.map((e) => e.temp[1]));
  const pLow = Math.max(...entries.map((e) => e.ph[0]));
  const pHigh = Math.min(...entries.map((e) => e.ph[1]));
  const tWidth = Math.max(0, tHigh - tLow);
  const pWidth = Math.max(0, pHigh - pLow);

  const windowFactor = Math.min(1, tWidth / 25) * 0.5 + Math.min(1, pWidth / 2.5) * 0.5;
  const lengthPenalty = Math.pow(0.93, Math.max(0, entries.length - 1));
  const completion = entries.length ? ran / entries.length : 0;

  const value = Math.round(100 * (0.25 + 0.75 * windowFactor) * lengthPenalty * completion);
  return {
    value,
    basis: `${ran}/${entries.length} stages ran, shared window ${tWidth.toFixed(0)} °C wide and ${pWidth.toFixed(1)} pH wide`,
  };
}
