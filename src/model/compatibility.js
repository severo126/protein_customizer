// Team compatibility: can this lane of enzymes plausibly sit in one pot?
//
// Four cartoon checks, each reported as a traffic light. Windows are the
// rounded teaching-grade ranges in the catalogue, intersected arithmetically.
// There is no model of buffering, ionic strength, activity loss or time here.

import { groupMeta } from './molecules.js';

// Cofactor names in the catalogue are written the way a course would write
// them. These aliases let "malonyl-CoA" count as the same pool as "acyl-CoA".
const COFACTOR_FAMILY = {
  'acetyl-CoA': 'acyl-CoA',
  'malonyl-CoA': 'acyl-CoA',
  'acyl-CoA': 'acyl-CoA',
  'UDP-glucose': 'UDP-sugar',
  'UDP-sugar': 'UDP-sugar',
};

const INHIBITION_NOTES = {
  phosphate: 'free phosphate building up in the pot sits back down in phosphate-handling active sites',
  sugar: 'released sugar crowds the sugar-binding site it came out of',
  acyl: 'free acyl groups re-occupy the acyl pocket',
  amine: 'free amine competes for the amine-handling site',
  carboxyl: 'carboxylate build-up blocks the carboxyl site',
  methyl: 'the methylated product sits in the donor pocket',
  carbonyl: 'the carbonyl product lingers in the site that made it',
  sulfate: 'free sulfate competes with the sulfate donor',
  amide: 'the amide product occupies the site it left',
};

export function cofactorTokens(cofactor) {
  if (!cofactor || cofactor === 'none') return [];
  return cofactor.split(/\s\+\s/).map((s) => s.trim()).filter(Boolean);
}

// Exported so the "what fits next" filter pools cofactors the same way the
// traffic lights do, rather than keeping its own copy of the aliases.
export function cofactorFamily(token) {
  return COFACTOR_FAMILY[token] ?? token;
}

const family = cofactorFamily;

// Intersect a list of [low, high] windows, naming the pair that closed it.
export function intersectWindows(entries, key) {
  if (!entries.length) return { empty: true, low: null, high: null, blame: null };

  let lowEntry = entries[0];
  let highEntry = entries[0];
  for (const e of entries) {
    if (e[key][0] > lowEntry[key][0]) lowEntry = e;
    if (e[key][1] < highEntry[key][1]) highEntry = e;
  }
  const low = lowEntry[key][0];
  const high = highEntry[key][1];

  return {
    empty: high < low,
    low,
    high,
    width: Math.max(0, high - low),
    blame: high < low ? { floor: lowEntry, ceiling: highEntry } : null,
  };
}

export function checkTemperature(entries) {
  const w = intersectWindows(entries, 'temp');
  if (!entries.length) return light('temp', 'grey', 'Add stages to check the shared temperature window.');
  if (w.empty) {
    return light(
      'temp',
      'red',
      `No shared temperature at all. ${w.blame.floor.name} will not run below ${w.blame.floor.temp[0]} °C and ${w.blame.ceiling.name} gives up above ${w.blame.ceiling.temp[1]} °C.`,
      { window: w },
    );
  }
  const colour = w.width < 5 ? 'amber' : 'green';
  return light('temp', colour, `Shared window ${w.low}–${w.high} °C${colour === 'amber' ? ', which is a narrow strip to hold in a real pot' : ''}.`, { window: w });
}

export function checkPh(entries) {
  const w = intersectWindows(entries, 'ph');
  if (!entries.length) return light('ph', 'grey', 'Add stages to check the shared pH window.');
  if (w.empty) {
    return light(
      'ph',
      'red',
      `No shared pH at all. ${w.blame.floor.name} needs pH ${w.blame.floor.ph[0]} or above and ${w.blame.ceiling.name} needs pH ${w.blame.ceiling.ph[1]} or below.`,
      { window: w },
    );
  }
  const colour = w.width < 0.5 ? 'amber' : 'green';
  return light('ph', colour, `Shared window pH ${w.low}–${w.high}${colour === 'amber' ? ', a very thin band' : ''}.`, { window: w });
}

// Does an earlier stage eat a cofactor a later stage still needs?
export function checkCofactors(entries) {
  if (!entries.length) return light('cofactor', 'grey', 'Add stages to check cofactor clashes.');
  const clashes = [];
  entries.forEach((eater, i) => {
    for (const destroyed of eater.destroys ?? []) {
      entries.slice(i + 1).forEach((needer) => {
        const needs = cofactorTokens(needer.cofactor).map(family);
        if (needs.includes(family(destroyed))) {
          clashes.push({ stage: i + 1, eater, needer, cofactor: destroyed });
        }
      });
    }
  });
  if (!clashes.length) return light('cofactor', 'green', 'No stage eats a cofactor a later stage still needs.');
  const c = clashes[0];
  return light(
    'cofactor',
    'red',
    `${c.eater.name} at stage ${c.stage} consumes ${c.cofactor}, which ${c.needer.name} needs later.${clashes.length > 1 ? ` (${clashes.length} clashes in total.)` : ''}`,
    { clashes },
  );
}

// Does a later stage's product inhibit an earlier stage, per the catalogue's
// curated inhibitedBy lists?
export function checkInhibition(entries, run) {
  if (!entries.length) return light('inhibition', 'grey', 'Add stages to check product inhibition.');
  const hits = [];
  entries.forEach((later, j) => {
    const produced = producedGroups(later);
    entries.slice(0, j).forEach((earlier, i) => {
      for (const g of produced) {
        if ((earlier.inhibitedBy ?? []).includes(g)) {
          hits.push({ earlier, later, group: g, earlierStage: i + 1, laterStage: j + 1 });
        }
      }
    });
  });
  if (!hits.length) return light('inhibition', 'green', 'No stage in this lane makes something an earlier stage is listed as sensitive to.');
  const h = hits[0];
  const note = INHIBITION_NOTES[h.group] ? ` — in the cartoon, ${INHIBITION_NOTES[h.group]}` : '';
  return light(
    'inhibition',
    'amber',
    `Stage ${h.laterStage} (${h.later.name}) frees ${groupMeta(h.group).label}, and stage ${h.earlierStage} (${h.earlier.name}) is listed as inhibited by it${note}.${hits.length > 1 ? ` (${hits.length} pairs in total.)` : ''}`,
    { hits },
  );
}

// What a stage puts loose into the pot: the group it adds, or the group it
// cuts off, or the group it hands back.
export function producedGroups(entry) {
  const a = entry.action;
  const out = new Set();
  if (a.op === 'add') out.add(a.group);
  if (a.op === 'remove') {
    out.add(a.group);
    if (a.yields) out.add(a.yields);
  }
  if (a.op === 'join') out.add(a.group);
  return [...out];
}

function light(id, colour, message, extra = {}) {
  return { id, colour, message, ...extra };
}

export function teamReport(entries, run) {
  const lights = [checkTemperature(entries), checkPh(entries), checkCofactors(entries), checkInhibition(entries, run)];
  const worst = lights.some((l) => l.colour === 'red')
    ? 'red'
    : lights.some((l) => l.colour === 'amber')
      ? 'amber'
      : lights.every((l) => l.colour === 'grey')
        ? 'grey'
        : 'green';
  return { lights, worst };
}
