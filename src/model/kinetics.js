// Two questions the window checks cannot ask.
//
// compatibility.js asks whether the enzymes in a lane can coexist. Real cascade
// work opens with two different questions, and a lane can pass every existing
// light while failing both.
//
// Can each stage keep up with the one before it? Flux through a linear route is
// set by its slowest step, so an intermediate accumulates wherever the stage
// making it is faster than the stage clearing it. That matters because
// intermediates are the fragile part: many decompose, many inhibit the enzyme
// upstream, and a lingering one has time to go somewhere else.
//
// And will the step go forward at all? A stage can have a fast enzyme and still
// not happen, because its equilibrium sits on the wrong side. Students reliably
// read "slow" and "will not go" as the same thing, and nothing in this app could
// previously tell them apart.
//
// Both read the coarse `rate` and `drive` labels added to the catalogue. Those
// are three-band teaching labels, not numbers: these lights can say which stage
// is the bottleneck and never by how much.

import { cofactorTokens, producedGroups } from './compatibility.js';
import { groupMeta } from './molecules.js';
import { classifyCofactor } from './ledger.js';

export const RATE_ORDER = { slow: 0, moderate: 1, fast: 2 };
export const RATE_LABEL = { slow: 'slow', moderate: 'moderate', fast: 'fast' };

function light(id, colour, message, extra = {}) {
  return { id, colour, message, ...extra };
}

// Does a stage spend a group donor? An uphill step that spends one is being paid
// for, which is most of what ATP is for.
function spendsDonor(entry) {
  return cofactorTokens(entry.cofactor).some((t) => classifyCofactor(t) === 'donor');
}

// Walk consecutive pairs and find the places where the lane outruns itself.
export function checkKinetics(entries) {
  if (entries.length < 2) {
    return light('kinetics', 'grey', 'Add at least two stages to check whether each one can keep up with the last.');
  }

  const gaps = [];
  for (let i = 0; i < entries.length - 1; i += 1) {
    const up = entries[i];
    const down = entries[i + 1];
    const drop = RATE_ORDER[up.rate] - RATE_ORDER[down.rate];
    if (drop <= 0) continue;

    const groups = producedGroups(up);
    const group = groups[0] ?? null;
    // The case worth escalating: the thing piling up also poisons the very
    // enzyme that is supposed to clear it.
    const poisons = group ? (down.inhibitedBy ?? []).includes(group) : false;
    gaps.push({ stage: i + 1, up, down, drop, group, poisons });
  }

  if (!gaps.length) {
    return light('kinetics', 'green', 'No stage in this lane outruns the one after it, so nothing should pile up in the middle.', { gaps });
  }

  const deadlock = gaps.find((g) => g.poisons);
  if (deadlock) {
    const name = groupMeta(deadlock.group).label;
    return light(
      'kinetics',
      'red',
      `Stage ${deadlock.stage} (${deadlock.up.name}, ${RATE_LABEL[deadlock.up.rate]}) outruns stage ${deadlock.stage + 1} (${deadlock.down.name}, ${RATE_LABEL[deadlock.down.rate]}), so ${name} builds up — and ${deadlock.down.name} is itself listed as inhibited by ${name}, so the build-up slows down the only stage that could clear it.`,
      { gaps, deadlock },
    );
  }

  const worst = gaps.reduce((a, b) => (b.drop > a.drop ? b : a));
  const groupName = worst.group ? groupMeta(worst.group).label : 'the intermediate';
  const extra = gaps.length > 1 ? ` (${gaps.length} such steps in this lane.)` : '';
  return light(
    'kinetics',
    'amber',
    `Stage ${worst.stage} (${worst.up.name}) is ${RATE_LABEL[worst.up.rate]} and stage ${worst.stage + 1} (${worst.down.name}) is ${RATE_LABEL[worst.down.rate]}, so ${groupName} piles up waiting to be cleared.${extra}`,
    { gaps, worst },
  );
}

// An uphill stage is rescued by anything downstream that removes its product,
// which in a linear lane is simply the next stage. That coupling is the single
// most important idea in metabolism and it is three lines of code.
export function checkDrive(entries) {
  if (!entries.length) {
    return light('drive', 'grey', 'Add stages to check whether each step will go forward on its own.');
  }

  const uphill = [];
  entries.forEach((entry, i) => {
    if (entry.drive !== 'uphill') return;
    uphill.push({
      stage: i + 1,
      entry,
      pulled: i < entries.length - 1 ? entries[i + 1] : null,
      paid: spendsDonor(entry),
    });
  });

  if (!uphill.length) {
    const near = entries.filter((e) => e.drive === 'near-equilibrium');
    if (near.length) {
      return light(
        'drive',
        'green',
        `Every step here goes forward on its own, though ${near.length === 1 ? `${near[0].name} sits` : `${near.length} stages sit`} near equilibrium, so ${near.length === 1 ? 'it' : 'they'} will run in either direction depending on what is piled up on each side.`,
        { uphill, near: near.map((e) => e.id) },
      );
    }
    return light('drive', 'green', 'Every step in this lane goes downhill on its own.', { uphill, near: [] });
  }

  const stranded = uphill.find((u) => !u.pulled && !u.paid);
  if (stranded) {
    return light(
      'drive',
      'amber',
      `Stage ${stranded.stage} (${stranded.entry.name}) sits against its own equilibrium and nothing follows it to take the product away, so it has no reason to go forward. A faster enzyme would not help; a stage after it would.`,
      { uphill },
    );
  }

  const rescued = uphill.find((u) => u.pulled);
  if (rescued) {
    return light(
      'drive',
      'green',
      `Stage ${rescued.stage} (${rescued.entry.name}) barely goes on its own, but stage ${rescued.stage + 1} (${rescued.pulled.name}) keeps taking the product away, and that is what makes it run.`,
      { uphill },
    );
  }

  const paid = uphill[0];
  return light(
    'drive',
    'green',
    `Stage ${paid.stage} (${paid.entry.name}) is uphill on its own and pays for it by spending ${cofactorTokens(paid.entry.cofactor).find((t) => classifyCofactor(t) === 'donor')}.`,
    { uphill },
  );
}

// The two lights together, in the order the panel shows them. The existing
// teamReport is another thread's file; this keeps the new checks callable
// without reaching into it.
export function kineticsLights(entries) {
  return [checkKinetics(entries), checkDrive(entries)];
}
