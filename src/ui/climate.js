// Running the lane hot or cold.
//
// Every number here comes out of src/model/activity.js, which turns the
// catalogue's rounded teaching windows into a rising-activity-times-what-
// survives curve whose optimum moves with the length of the run. This file adds
// no physics of its own: it maps that curve onto what the stage shows, so the
// picture and the readout can never disagree.
//
// What it deliberately does not do: decide that a temperature is too high.
// activity.js has no threshold and none belongs here either. The only hard line
// drawn below is the edge of the entry's own stated window, which is catalogue
// data rather than a cutoff this app invented, and crossing it is reported as
// "past its stated window", never as failure, denaturation or damage. This toy
// has no model of denaturation or aggregation; both stay on the never-checked
// list beside every verdict.

import { stageActivity, tempActivity, laneActivity, tempOptimum, runLength, TEMP_STEP, ACTIVITY_DISCLAIMER } from '../model/activity.js';

export const CLIMATE_NOTE =
  'The dial reads the activity curve this app computes from the catalogue’s rounded windows. It is a cartoon of an activity curve, not a stability prediction: nothing here models denaturation or aggregation.';

export const CLIMATE_DISCLAIMER = ACTIVITY_DISCLAIMER;

// How far past the window's top edge counts as fully agitated, as a fraction of
// the window's own span. Half a window over is as shaken as the picture gets.
const AGITATION_SPAN = 0.5;

// The run never stops dead, however cold it is held: a crawl reads as slow, a
// freeze reads as broken, and broken is a claim this app cannot make.
const SLOWEST = 0.18;

// Pace is measured against the best this entry can reach at this run length —
// activity.js's own tempOptimum — so held at its optimum the run plays at full
// speed and every slower pace is honestly relative to that. It is a playback
// speed, not a number this app reports about the enzyme.
function paceFor(entry, temp, runId) {
  const { hours } = runLength(runId);
  const best = tempOptimum(entry, runId).value || 1;
  const here = tempActivity(entry, temp, hours);
  return SLOWEST + (1 - SLOWEST) * clamp(here / best, 0, 1);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// The dial's range: the whole lane's windows plus room to be plainly too hot or
// too cold on either side, so the curve can be seen falling off both ends.
export function tempRange(entries) {
  if (!entries.length) return { min: 5, max: 95 };
  const lo = Math.min(...entries.map((e) => e.temp[0]));
  const hi = Math.max(...entries.map((e) => e.temp[1]));
  return { min: Math.max(0, Math.round(lo - 20)), max: Math.round(hi + 20) };
}

// One enzyme at one temperature, for one length of run.
export function climateFor(entry, temp, runId) {
  const { hours } = runLength(runId);
  const [lo, hi] = entry.temp;
  const span = Math.max(1, hi - lo);
  const mid = (lo + hi) / 2;

  return {
    activity: tempActivity(entry, temp, hours),
    // -1 held well under the window, +1 well over it. Drives the colour.
    warmth: clamp((temp - mid) / span, -1, 1),
    // Only past the stated top edge, and only then.
    agitation: clamp((temp - hi) / (span * AGITATION_SPAN), 0, 1),
    over: temp > hi,
    under: temp < lo,
    window: [lo, hi],
  };
}

// The lane as a whole: the colour follows the stage on stage, the agitation
// follows the worst-off stage, and the pace follows how happy everyone is at
// once, because one slow stage holds up the ones behind it.
export function laneClimate(entries, temp, runId, current = null) {
  if (!entries.length) return { warmth: 0, agitation: 0, pace: 1, activity: 1, stages: [] };
  const { hours } = runLength(runId);
  const stages = entries.map((e) => ({ entry: e, ...climateFor(e, temp, runId) }));
  const here = current ? stages.find((s) => s.entry.id === current.id) ?? stages[0] : stages[0];
  const activity = laneActivity(entries, temp, phOf(entries), hours);

  return {
    warmth: here.warmth,
    agitation: Math.max(...stages.map((s) => s.agitation)),
    // Playback speed. Floored, never zero.
    pace: paceFor(here.entry, temp, runId),
    activity: here.activity,
    laneActivity: activity,
    stages,
  };
}

// The dial only moves temperature, so pH is held at the midpoint of the lane's
// shared band — stated here rather than hidden, because it is an assumption.
export function phOf(entries) {
  if (!entries.length) return 7;
  const lo = Math.max(...entries.map((e) => e.ph[0]));
  const hi = Math.min(...entries.map((e) => e.ph[1]));
  if (lo > hi) {
    const mids = entries.map((e) => (e.ph[0] + e.ph[1]) / 2);
    return Number((mids.reduce((a, b) => a + b, 0) / mids.length).toFixed(2));
  }
  return Number(((lo + hi) / 2).toFixed(2));
}

// The best temperature the dial itself can reach, walked on activity.js's own
// grid at the pH this screen holds. bestPoint() moves temperature and pH
// together, so its temperature belongs to its own pH and would not be the best
// the dial can do; this is the number the button should snap to.
export function bestTemp(entries, runId) {
  if (!entries.length) return 37;
  const { hours } = runLength(runId);
  const ph = phOf(entries);
  const { min, max } = tempRange(entries);
  let best = -1;
  let at = min;
  for (let t = min; t <= max + 1e-9; t += TEMP_STEP) {
    const v = Number(laneActivity(entries, t, ph, hours).toFixed(6));
    if (v > best) {
      best = v;
      at = t;
    }
  }
  return Number(at.toFixed(2));
}

// One line under the dial. Reports where the dial is against the stated window
// and what the curve says there, and nothing else.
export function climateLine(stage, temp, runId) {
  if (!stage) return '';
  const c = climateFor(stage.entry, temp, runId);
  const pct = `${Math.round(c.activity * 100)}%`;
  const where = c.over
    ? `past its stated window (${c.window[0]}–${c.window[1]} °C)`
    : c.under
      ? `under its stated window (${c.window[0]}–${c.window[1]} °C)`
      : `inside its stated window (${c.window[0]}–${c.window[1]} °C)`;
  return `${stage.entry.name} is ${where} and the curve puts it at ${pct} of its own best over ${runLength(runId).label.toLowerCase()}.`;
}

// Used for the per-stage chips, where the number is the whole point.
export function stagePercent(entry, temp, runId) {
  const { hours } = runLength(runId);
  return Math.round(stageActivity(entry, temp, phOf([entry]), hours) * 100);
}
