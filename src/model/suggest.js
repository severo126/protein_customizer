// What fits next.
//
// Given the lane already on the bench and the molecule it is currently
// holding, sort the fixed catalogue into three buckets using the same cartoon
// checks the traffic lights use:
//
//   fits     — nothing in this toy ruled out adding it next
//   caution  — it would run, but a light would go amber
//   blocked  — a cartoon check says no: the wrong substrate, no shared
//              temperature or pH window, or a cofactor an earlier stage has
//              already eaten
//
// "Fits" is the absence of a red flag from a cartoon. It does not say the
// stage would run in a pot, and nothing here touches folding, expression,
// activity retention or safety. A blocked entry stays addable on purpose:
// watching a stage refuse a molecule is the point of the bench.

import { runStage } from './pipeline.js';
import { intersectWindows, cofactorTokens, cofactorFamily, producedGroups } from './compatibility.js';
import { groupMeta } from './molecules.js';

export const FIT_NOTE =
  'Fits means only that these cartoon checks found nothing against it. It is not a prediction that the stage would run.';

const RANK = { fits: 0, caution: 1, blocked: 2 };

// Narrower than this and the shared window is called out as a thin strip,
// matching the thresholds in compatibility.js.
const THIN_TEMP = 5;
const THIN_PH = 0.5;

export function suggestNext(allEntries, lane = [], product = null) {
  const laneTemp = intersectWindows(lane, 'temp');
  const lanePh = intersectWindows(lane, 'ph');
  const potAlreadyClosed = lane.length > 1 && (laneTemp.empty || lanePh.empty);
  const stalled = lane.length > 0 && !product;

  const context = {
    laneLength: lane.length,
    empty: lane.length === 0,
    stalled,
    potAlreadyClosed,
    temp: lane.length ? laneTemp : null,
    ph: lane.length ? lanePh : null,
    product,
  };

  const items = allEntries.map((entry) => classify(entry, lane, product, context));
  const counts = { fits: 0, caution: 0, blocked: 0 };
  for (const item of items) counts[item.verdict] += 1;

  return { context, items, counts, note: FIT_NOTE };
}

export function classify(candidate, lane, product, context) {
  const reasons = [];
  let preview = null;

  // 1. Will this stage accept the molecule the lane is holding?
  if (product) {
    const r = runStage(product, candidate);
    if (r.ok) {
      preview = r.product;
      reasons.push({ kind: 'substrate', level: 'fits', text: `Accepts the running product and ${r.what}.` });
    } else {
      reasons.push({ kind: 'substrate', level: 'blocked', text: r.stallReason });
    }
  } else if (context.stalled) {
    reasons.push({
      kind: 'substrate',
      level: 'caution',
      text: 'The lane stalls before this stage, so there is no product to hand it. Nothing here checks what it would do.',
    });
  }

  // 2 and 3. Would adding it leave a shared temperature and pH window?
  if (lane.length && !context.potAlreadyClosed) {
    reasons.push(windowReason(candidate, lane, 'temp'));
    reasons.push(windowReason(candidate, lane, 'ph'));
  }

  // 4. Has an earlier stage already eaten a cofactor this one needs?
  const needs = cofactorTokens(candidate.cofactor).map(cofactorFamily);
  for (const eater of lane) {
    for (const destroyed of eater.destroys ?? []) {
      if (needs.includes(cofactorFamily(destroyed))) {
        reasons.push({
          kind: 'cofactor',
          level: 'blocked',
          text: `${eater.name} is already in the lane and consumes ${destroyed}, which ${candidate.name} needs.`,
        });
      }
    }
  }

  // 5. Product inhibition, both directions, from the curated lists.
  const madeByCandidate = producedGroups(candidate);
  for (const earlier of lane) {
    for (const g of madeByCandidate) {
      if ((earlier.inhibitedBy ?? []).includes(g)) {
        reasons.push({
          kind: 'inhibition',
          level: 'caution',
          text: `It frees ${groupMeta(g).label}, and ${earlier.name} earlier in the lane is listed as inhibited by it.`,
        });
      }
    }
    for (const g of producedGroups(earlier)) {
      if ((candidate.inhibitedBy ?? []).includes(g)) {
        reasons.push({
          kind: 'inhibition',
          level: 'caution',
          text: `${earlier.name} is already putting ${groupMeta(g).label} into the pot, and ${candidate.name} is listed as inhibited by it.`,
        });
      }
    }
  }

  const verdict = reasons.reduce((worst, r) => (RANK[r.level] > RANK[worst] ? r.level : worst), 'fits');
  const headline = pickHeadline(reasons, verdict, lane, context);

  return { entry: candidate, verdict, reasons, headline, preview };
}

function windowReason(candidate, lane, key) {
  const team = [...lane, candidate];
  const w = intersectWindows(team, key);
  const unit = key === 'temp' ? ' °C' : '';
  const label = key === 'temp' ? 'temperature' : 'pH';
  const prefix = key === 'temp' ? '' : 'pH ';

  if (w.empty) {
    const floor = w.blame.floor;
    const ceiling = w.blame.ceiling;
    return {
      kind: key,
      level: 'blocked',
      text: `Adding it leaves no shared ${label} at all: ${floor.name} needs ${prefix}${floor[key][0]}${unit} or above and ${ceiling.name} needs ${prefix}${ceiling[key][1]}${unit} or below.`,
    };
  }
  const thin = key === 'temp' ? THIN_TEMP : THIN_PH;
  if (w.width < thin) {
    return {
      kind: key,
      level: 'caution',
      text: `The shared ${label} window shrinks to ${prefix}${w.low}–${w.high}${unit}, a strip that thin is hard to hold in a real pot.`,
    };
  }
  return {
    kind: key,
    level: 'fits',
    text: `Shared ${label} window stays ${prefix}${w.low}–${w.high}${unit}.`,
    window: { low: w.low, high: w.high },
  };
}

// The one line the palette shows under the name.
function pickHeadline(reasons, verdict, lane, context) {
  if (verdict === 'fits') {
    if (!lane.length) return 'Nothing in the lane yet to rule it out.';
    if (context.potAlreadyClosed) return 'Only the substrate was checked: this lane already has no shared window.';
    const t = reasons.find((r) => r.kind === 'temp' && r.window);
    const p = reasons.find((r) => r.kind === 'ph' && r.window);
    if (t && p) return `shares ${t.window.low}–${t.window.high} °C and pH ${p.window.low}–${p.window.high}`;
    return 'Nothing here ruled it out.';
  }
  const first = reasons.find((r) => r.level === verdict);
  return first ? first.text : '';
}

// Group a bucket by family, keeping catalogue order inside each family.
export function byFamily(items) {
  const out = new Map();
  for (const item of items) {
    if (!out.has(item.entry.family)) out.set(item.entry.family, []);
    out.get(item.entry.family).push(item);
  }
  return out;
}
