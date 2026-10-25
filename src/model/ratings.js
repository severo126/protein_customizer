// The stat bars on a collection card.
//
// Every bar on a card has to mean something, so every bar here is a reading of
// a field that is already committed in src/data/catalogue.json, or a count over
// the host table in hosts.js. Nothing is scaled to look good, nothing is
// normalised against a made-up best, and nothing is invented to fill a row.
//
// Three rules this file keeps:
//
//   1. Every rating says what it measures and in what units or bands. A bar
//      without `what` is not a rating, it is decoration.
//   2. A band rating shows its own band count. Rate and drive are three-band
//      teaching labels, and a three-segment bar says that where a smooth bar
//      would imply a measurement.
//   3. A field the catalogue does not carry comes back `unknown: true` with the
//      reason, and the card prints the word "unknown". There is no middle
//      value: guessing one would be inventing data.

import { HOSTS, requirements, supports } from './hosts.js';

export const RATINGS_NOTE =
  'Every bar reads a committed catalogue field or counts over the host table. Temperature and pH windows are rounded teaching-grade ranges, not measurements. Speed and drive are three coarse bands, not numbers: they can say which of two enzymes is the faster and never by how much. Where the catalogue has no field, the bar reads "unknown" rather than sitting at the middle.';

// The axes the two window bars are drawn against. Fixed, so the same window is
// the same length of bar on every card and two cards can be compared by eye.
export const TEMP_AXIS = [0, 100];
export const PH_AXIS = [0, 14];

export const RATE_BANDS = ['slow', 'moderate', 'fast'];
export const DRIVE_BANDS = ['uphill', 'near-equilibrium', 'downhill'];

const DRIVE_WORDS = {
  uphill: 'Runs backwards unless something pulls the product away or pays for it.',
  'near-equilibrium': 'Runs either way, depending on what has piled up on each side.',
  downhill: 'Goes forward on its own.',
};

function band(id, label, what, value, bands, note) {
  const index = bands.indexOf(value);
  if (index < 0) {
    return { id, label, what, kind: 'band', unknown: true, bands, display: 'unknown', note: note ?? `The catalogue carries no ${id} label for this entry.` };
  }
  return { id, label, what, kind: 'band', bands, index, value, display: value, note };
}

function range(id, label, what, lo, hi, axis, unit) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { id, label, what, kind: 'range', unknown: true, display: 'unknown', note: `The catalogue carries no ${id} window for this entry.` };
  }
  const [min, max] = axis;
  const span = max - min;
  return {
    id,
    label,
    what,
    kind: 'range',
    axis,
    unit,
    lo,
    hi,
    left: ((lo - min) / span) * 100,
    width: ((hi - lo) / span) * 100,
    display: unit === '°C' ? `${lo}–${hi} °C` : `pH ${lo}–${hi}`,
  };
}

function count(id, label, what, value, max, display, note) {
  return { id, label, what, kind: 'count', value, max, display, note };
}

// How many of the four expression routes in hosts.js could supply everything
// this entry needs. A real count over a real table, not a score.
export function hostRoutes(entry) {
  const open = HOSTS.filter((h) => supports(h.id, entry).ok);
  return { open, total: HOSTS.length };
}

export function ratings(entry) {
  const reqs = requirements(entry);
  const routes = hostRoutes(entry);

  return [
    range(
      'temp',
      'Heat window',
      'The temperature band the catalogue states for this enzyme, drawn against a fixed 0–100 °C axis. A rounded teaching range, not a measurement, and not an optimum.',
      entry.temp?.[0],
      entry.temp?.[1],
      TEMP_AXIS,
      '°C',
    ),
    range(
      'ph',
      'pH window',
      'The pH band the catalogue states, drawn against a fixed pH 0–14 axis. Rounded teaching range. Activity inside it is a bell, not a plateau — the bench screen draws that curve.',
      entry.ph?.[0],
      entry.ph?.[1],
      PH_AXIS,
      'pH',
    ),
    band(
      'rate',
      'Speed band',
      'The catalogue’s coarse speed label: one of three bands. Real turnover numbers span orders of magnitude, so this can order two enzymes and never say by how much.',
      entry.rate,
      RATE_BANDS,
    ),
    band(
      'drive',
      'Thermodynamic drive',
      'Which way the step goes on its own, in three bands. ' + (DRIVE_WORDS[entry.drive] ?? ''),
      entry.drive,
      DRIVE_BANDS,
    ),
    count(
      'supply',
      'Supply load',
      'How many things the pot has to provide beyond the substrate: the structural needs in the catalogue entry plus every metal and prosthetic group named in its cofactor. Fewer is simpler, not better.',
      reqs.length,
      4,
      reqs.length ? `${reqs.length} · ${reqs.map((r) => r.token).join(', ')}` : 'nothing beyond the substrate',
    ),
    count(
      'hosts',
      'Expression routes open',
      'How many of the four expression routes in this toy’s host table could supply everything the entry needs. A count over a cartoon table, not an expression result — nothing here says it would actually be made.',
      routes.open.length,
      routes.total,
      routes.open.length ? `${routes.open.length} of ${routes.total} · ${routes.open.map((h) => h.label).join(', ')}` : `0 of ${routes.total} · none of the four`,
    ),
  ];
}

// The chips beside the bars: facts with no sensible bar, left as plain text
// rather than stretched into one.
export function factChips(entry) {
  const chips = [
    { label: 'assembly', value: entry.assembly ?? 'unknown', title: 'The usual quaternary state of a commonplace member of this family. A teaching-grade label, not a measurement of this entry.' },
    { label: 'cofactor', value: entry.cofactor ?? 'unknown', title: 'What the reaction runs on, as committed in the catalogue.' },
  ];
  if ((entry.destroys ?? []).length) {
    chips.push({ label: 'consumes', value: entry.destroys.join(', '), title: 'Groups this stage spends, so a later stage cannot have them.' });
  }
  if ((entry.inhibitedBy ?? []).length) {
    chips.push({ label: 'inhibited by', value: entry.inhibitedBy.join(', '), title: 'Groups the catalogue lists as slowing this enzyme down.' });
  }
  return chips;
}
