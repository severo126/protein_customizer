// Windows as curves, not boxes.
//
// compatibility.js intersects the catalogue's temperature and pH windows
// arithmetically, so two enzymes either share a band or they do not. That hides
// two things a real bench notices. Activity against pH is a bell rather than a
// box, so two enzymes can "overlap" in a band where each runs at a fifth of its
// best. And the temperature optimum is not a property of the enzyme alone:
// activity climbs with temperature while the enzyme is simultaneously being
// lost, so where the optimum sits depends on how long the run takes.
//
// The shapes below are invented for this toy. They are generated from the
// rounded teaching-grade windows already in the catalogue — no new data — and
// the numbers they produce are made up. What is not made up is the structure:
// rising activity times a time-average of what survives the run is the same
// argument the equilibrium model of temperature dependence makes, and it is why
// a long run has a lower and cooler optimum than a short one.

// Everywhere a peak height is shown, this sentence goes with it. A number
// between 0 and 1 beside a traffic light gets read as a probability, and this one
// is nothing of the kind: it is a made-up number with made-up units, in exactly
// the way the Foundry Score is.
export const ACTIVITY_DISCLAIMER =
  'Peak height is a made-up number with made-up units. It is not a probability, a yield or a prediction. Activity curves are invented shapes fitted to the catalogue’s rounded windows, and what they are for is showing that an overlap is not the same as both enzymes being happy.';

// There is deliberately no threshold in this file, and none should be added. No
// value of the peak height means "good enough": the number exists to be compared
// against another arrangement of the same lane, never to pass or fail one.
export const NO_THRESHOLD_NOTE =
  'There is no passing score. A higher peak height means a better compromise than a lower one, and nothing more than that.';

// How much the rise factor climbs from the bottom to the top of a stated
// window, before anything is lost. exp(2.2) is about nine-fold.
export const TEMP_RISE_GAIN = 2.2;

// How steeply loss climbs past the top of the window. The loss rate is defined
// as 1 per hour exactly at the top of the stated window, so a window's upper
// edge means "an hour here costs you most of it", which is roughly what a
// rounded teaching range is trying to say.
export const TEMP_FALL_GAIN = 6;

// What the model claims an enzyme is still doing at the edge of its stated pH
// window. The window is where it runs, not where it is happy.
export const PH_EDGE_ACTIVITY = 0.3;

// The run lengths the bench offers, in hours. The whole point of the panel is
// that these give different answers.
export const RUN_LENGTHS = [
  { id: 'minutes', label: 'Minutes', hours: 0.25, blurb: 'A quick assay. The optimum sits near the top of the window.' },
  { id: 'hours', label: 'A few hours', hours: 3, blurb: 'A working session. The optimum has already moved down.' },
  { id: 'overnight', label: 'Overnight', hours: 16, blurb: 'A long run. Hold it cooler and accept a slower rate.' },
];

export const DEFAULT_RUN = 'hours';

// Grid steps for the compromise-point search. Exported because the Python
// mirror has to walk the same grid to land on the same point.
export const TEMP_STEP = 0.5;
export const PH_STEP = 0.05;

export function runLength(id) {
  const r = RUN_LENGTHS.find((x) => x.id === id);
  if (!r) throw new Error(`unknown run length: ${id}`);
  return r;
}

// Both sides compare at six decimals so that a tie on the grid resolves to the
// same point whichever language walked it.
const COMPARE_DIGITS = 6;
const compare = (x) => Number(x.toFixed(COMPARE_DIGITS));

// The time-average of activity decaying at rate k over a run of h hours. Goes
// to 1 as the run gets short, which is why a fast assay sees the undecayed
// enzyme and a long one does not.
function timeAverage(k, hours) {
  const kh = k * hours;
  if (kh < 1e-9) return 1;
  return (1 - Math.exp(-kh)) / kh;
}

// Rising activity times what survives, normalised so that the top of the stated
// window reads 1 for an instantaneous assay. Clamped at 1: above the window a
// very short run can compute higher, and this toy has no business claiming an
// enzyme beats its own stated best.
export function tempActivity(entry, temp, hours) {
  const [lo, hi] = entry.temp;
  const span = hi - lo;
  if (span <= 0) return temp === lo ? 1 : 0;

  const rise = Math.exp((TEMP_RISE_GAIN * (temp - lo)) / span);
  const lossRate = Math.exp((TEMP_FALL_GAIN * (temp - hi)) / span);
  const held = timeAverage(lossRate, hours);
  const value = (rise * held) / Math.exp(TEMP_RISE_GAIN);
  return Math.min(1, Math.max(0, value));
}

// A Gaussian centred on the window, wide enough that the stated edges read
// PH_EDGE_ACTIVITY. Real pH profiles come from the ionisation of a handful of
// active-site groups and are often flatter than this; a bell is the cartoon.
export function phActivity(entry, ph) {
  const [lo, hi] = entry.ph;
  const mid = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  if (half <= 0) return ph === mid ? 1 : 0;

  const sigma = half / Math.sqrt(2 * -Math.log(PH_EDGE_ACTIVITY));
  const z = (ph - mid) / sigma;
  return Math.exp(-0.5 * z * z);
}

export function stageActivity(entry, temp, ph, hours) {
  return tempActivity(entry, temp, hours) * phActivity(entry, ph);
}

// How happy every stage is at once. A product, not an average, because one dead
// stage kills the lane however well the others are doing.
export function laneActivity(entries, temp, ph, hours) {
  let value = 1;
  for (const e of entries) value *= stageActivity(e, temp, ph, hours);
  return value;
}

// The best compromise the lane can reach, found by walking a grid over the union
// of the stated windows. Deterministic: the first grid point to beat the running
// best wins, and the comparison is rounded so both languages agree on ties.
export function bestPoint(entries, runId = DEFAULT_RUN) {
  if (!entries.length) return null;
  const { hours } = runLength(runId);

  const tLow = Math.min(...entries.map((e) => e.temp[0]));
  const tHigh = Math.max(...entries.map((e) => e.temp[1]));
  const pLow = Math.min(...entries.map((e) => e.ph[0]));
  const pHigh = Math.max(...entries.map((e) => e.ph[1]));

  let best = -1;
  let bestTemp = tLow;
  let bestPh = pLow;

  for (let t = tLow; t <= tHigh + 1e-9; t += TEMP_STEP) {
    for (let p = pLow; p <= pHigh + 1e-9; p += PH_STEP) {
      const v = compare(laneActivity(entries, t, p, hours));
      if (v > best) {
        best = v;
        bestTemp = t;
        bestPh = p;
      }
    }
  }

  const temp = Number(bestTemp.toFixed(2));
  const ph = Number(bestPh.toFixed(2));
  return {
    temp,
    ph,
    run: runId,
    value: best,
    stages: entries.map((e) => ({
      id: e.id,
      name: e.name,
      temp: Number(tempActivity(e, temp, hours).toFixed(4)),
      ph: Number(phActivity(e, ph).toFixed(4)),
      value: Number(stageActivity(e, temp, ph, hours).toFixed(4)),
    })),
  };
}

// Where one enzyme's own optimum sits for a given run length. Walking only its
// own window, because this is the number the panel shows moving.
export function tempOptimum(entry, runId = DEFAULT_RUN) {
  const { hours } = runLength(runId);
  const [lo, hi] = entry.temp;

  let best = -1;
  let bestTemp = lo;
  for (let t = lo; t <= hi + 1e-9; t += TEMP_STEP) {
    const v = compare(tempActivity(entry, t, hours));
    if (v > best) {
      best = v;
      bestTemp = t;
    }
  }
  return { temp: Number(bestTemp.toFixed(2)), value: best, run: runId };
}

// Points for drawing, over the entry's own stated window.
export function tempCurve(entry, runId = DEFAULT_RUN, steps = 48) {
  const { hours } = runLength(runId);
  const [lo, hi] = entry.temp;
  return sample(lo, hi, steps, (t) => ({ temp: Number(t.toFixed(3)), value: Number(tempActivity(entry, t, hours).toFixed(4)) }));
}

export function phCurve(entry, steps = 48) {
  const [lo, hi] = entry.ph;
  return sample(lo, hi, steps, (p) => ({ ph: Number(p.toFixed(3)), value: Number(phActivity(entry, p).toFixed(4)) }));
}

function sample(lo, hi, steps, make) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) out.push(make(lo + ((hi - lo) * i) / steps));
  return out;
}

// The sentence the panel puts under the curves. Reports the compromise rather
// than a verdict, because "both are running slowly" is the usual real answer and
// the intersection check has no way to say it.
export function compromiseNote(entries, runId = DEFAULT_RUN) {
  if (!entries.length) return 'Add stages to see where they could all run at once.';
  const best = bestPoint(entries, runId);
  const worst = best.stages.reduce((a, b) => (b.value < a.value ? b : a));
  const pct = (x) => `${Math.round(x * 100)}%`;

  // One sentence for every lane, with no cutoff deciding which one a lane gets.
  // A compromise where the weakest stage reads 2% is reported in the same words
  // as one where it reads 60%, and the reader draws their own conclusion.
  return `Best shared point is ${best.temp} °C and pH ${best.ph} over ${runLength(runId).label.toLowerCase()}, where the weakest stage, ${worst.name}, runs at ${pct(worst.value)} of its own best.`;
}
