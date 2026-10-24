// The splice table: "what if these two domains were one protein?"
//
// A construct here is two spheres and a rubber band. The filters below are
// geometry on that cartoon — sphere overlap, a one-dimensional reach check, a
// radius-of-gyration band for two uniform spheres, and dot products against an
// invented hydrophobic-patch direction. None of it is a structure prediction,
// and the numbers are the wrong order of magnitude on purpose.
//
// The filters are deterministic plain code so results are reproducible and
// testable. No model is consulted to decide a verdict.

import { PASS_VERDICT, NOT_CHECKED, CARTOON_PHYSICS_NOTE } from './disclaimers.js';
import { intersectWindows } from './compatibility.js';

// Cartoon constants. Round numbers chosen to make the toy behave legibly.
export const SPAN_PER_LINKER_UNIT = 0.34; // nm of reach per linker unit, if pulled straight
export const TAUT_FRACTION = 0.8; // past this much of its span the linker counts as under tension
export const LINKER_CHOICES = [2, 6, 12, 20];

export const FILTERS = [
  { id: 'cut-site', label: 'Cut site', blurb: 'Did the cut fall in a flexible loop, or slice through a helix or sheet?' },
  { id: 'backbone-join', label: 'Backbone join', blurb: 'Can the chosen linker actually bridge the two cut ends?' },
  { id: 'clash', label: 'Clashes & chain breaks', blurb: 'Do the blobs pass through each other, or leave a gap the backbone cannot span?' },
  { id: 'compactness', label: 'Compactness', blurb: 'Is the radius of gyration inside the band expected for this size?' },
  { id: 'buried-core', label: 'Buried core', blurb: 'Do the hydrophobic patches end up facing solvent after the join?' },
  { id: 'operating-window', label: 'Operating window', blurb: 'Do the two parents share any temperature and pH window?' },
];

/* ---------- small vector helpers ---------- */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => {
  const l = len(a) || 1;
  return scale(a, 1 / l);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Rotate v by the rotation that takes unit vector `from` to unit vector `to`.
function rotateBetween(from, to, v) {
  const f = norm(from);
  const t = norm(to);
  const c = Math.max(-1, Math.min(1, dot(f, t)));
  if (c > 0.999999) return [...v];
  if (c < -0.999999) {
    // 180°: rotate about any axis perpendicular to f
    const axis = norm(Math.abs(f[0]) < 0.9 ? cross(f, [1, 0, 0]) : cross(f, [0, 1, 0]));
    return sub(scale(axis, 2 * dot(axis, v)), v);
  }
  const axis = norm(cross(f, t));
  const s = Math.sqrt(1 - c * c);
  // Rodrigues
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/* ---------- layout ---------- */

// Lay the construct out: domain A at the origin, domain B pushed along the
// direction of A's cut end, turned so its own cut end points back at A. How far
// B sits is set by the linker, which is what makes short linkers crash the
// blobs together and long ones string them out.
export function layout(domainA, siteA, domainB, siteB, linkerUnits) {
  const span = linkerUnits * SPAN_PER_LINKER_UNIT;
  const axis = norm(siteA.exit);
  const centreDistance = domainA.radius + domainB.radius + span * 0.5 - 0.9;

  const centreA = [0, 0, 0];
  const centreB = scale(axis, centreDistance);

  const exitA = siteA.exit;
  const exitBLocal = rotateBetween(siteB.exit, scale(axis, -1), siteB.exit);
  const exitB = add(centreB, exitBLocal);

  const patchA = norm(domainA.hydrophobic);
  const patchB = norm(rotateBetween(siteB.exit, scale(axis, -1), domainB.hydrophobic));

  return {
    axis,
    centreA,
    centreB,
    centreDistance,
    radiusA: domainA.radius,
    radiusB: domainB.radius,
    exitA,
    exitB,
    joinDistance: len(sub(exitB, exitA)),
    surfaceGap: centreDistance - domainA.radius - domainB.radius,
    overlap: domainA.radius + domainB.radius - centreDistance,
    span,
    linkerUnits,
    patchA,
    patchB,
  };
}

// Radius of gyration of two uniform spheres, masses as r³.
export function radiusOfGyration(geo) {
  const mA = Math.pow(geo.radiusA, 3);
  const mB = Math.pow(geo.radiusB, 3);
  const m = mA + mB;
  const centroid = (mB / m) * geo.centreDistance; // along the axis from A
  const dA = centroid;
  const dB = geo.centreDistance - centroid;
  const rg2 = (mA * (0.6 * geo.radiusA * geo.radiusA + dA * dA) + mB * (0.6 * geo.radiusB * geo.radiusB + dB * dB)) / m;
  return Math.sqrt(rg2);
}

export function expectedRgBand(geo) {
  const rEquiv = Math.cbrt(Math.pow(geo.radiusA, 3) + Math.pow(geo.radiusB, 3));
  const compact = Math.sqrt(0.6) * rEquiv;
  return { low: compact * 0.85, high: compact * 1.35, compact };
}

/* ---------- filters ---------- */

// Each filter returns {pass, reason}. They run in order and the first failure
// stops the candidate, so the funnel counts are "killed by this filter first".
export function runFilters(entryA, siteA, entryB, siteB, linkerUnits, teamEntries = []) {
  const domainA = entryA.domain;
  const domainB = entryB.domain;
  const geo = layout(domainA, siteA, domainB, siteB, linkerUnits);
  const results = [];

  // 1. Cut site
  const badCuts = [];
  if (siteA.region !== 'loop') badCuts.push(`${entryA.name}: ${siteA.label} is in the middle of a ${siteA.region}`);
  if (siteB.region !== 'loop') badCuts.push(`${entryB.name}: ${siteB.label} is in the middle of a ${siteB.region}`);
  results.push(
    badCuts.length
      ? fail('cut-site', `Cut through a structured element — ${badCuts.join('; ')}. Only loop cuts get past this filter.`)
      : pass('cut-site', `Both cuts fall in flexible loops (${siteA.label}, ${siteB.label}).`),
  );

  // 2. Backbone join. Too far to bridge is a reject; so is a linker left so
  // close to fully extended that the cartoon has it under tension, which the
  // site's own tension figure makes worse.
  const reach = geo.span;
  const extension = reach > 0 ? geo.joinDistance / reach : Infinity;
  const tautLimit = TAUT_FRACTION - 0.1 * Math.max(siteA.tension, siteB.tension);
  if (geo.joinDistance > reach) {
    results.push(
      fail(
        'backbone-join',
        `Cut ends are ${geo.joinDistance.toFixed(2)} nm apart and a ${linkerUnits}-unit linker reaches at most ${reach.toFixed(2)} nm. Too far to bridge.`,
      ),
    );
  } else if (extension > tautLimit) {
    results.push(
      fail(
        'backbone-join',
        `A ${linkerUnits}-unit linker would sit ${(extension * 100).toFixed(0)}% extended across a ${geo.joinDistance.toFixed(2)} nm gap. An absurdly short linker under that much tension is a reject.`,
      ),
    );
  } else {
    results.push(
      pass(
        'backbone-join',
        `${geo.joinDistance.toFixed(2)} nm to bridge, ${reach.toFixed(2)} nm of linker (${(extension * 100).toFixed(0)}% extended)${extension < 0.15 ? ', so the linker is floppy rather than taut' : ''}.`,
      ),
    );
  }

  // 3. Clashes and chain breaks
  if (geo.overlap > 0.3) {
    results.push(fail('clash', `The two blobs interpenetrate by ${geo.overlap.toFixed(2)} nm once laid out.`));
  } else if (geo.surfaceGap > reach) {
    results.push(fail('clash', `A ${geo.surfaceGap.toFixed(2)} nm gap sits between the blob surfaces and the backbone cannot span it.`));
  } else {
    results.push(pass('clash', `No interpenetration (${Math.max(0, -geo.overlap).toFixed(2)} nm clearance) and the surfaces are ${geo.surfaceGap.toFixed(2)} nm apart.`));
  }

  // 4. Compactness
  const rg = radiusOfGyration(geo);
  const band = expectedRgBand(geo);
  if (rg > band.high) {
    results.push(fail('compactness', `Radius of gyration ${rg.toFixed(2)} nm against an expected ${band.low.toFixed(2)}–${band.high.toFixed(2)} nm for this size. A dumbbell stretched well outside the band.`));
  } else if (rg < band.low) {
    results.push(fail('compactness', `Radius of gyration ${rg.toFixed(2)} nm is below the expected ${band.low.toFixed(2)}–${band.high.toFixed(2)} nm band, which in this cartoon means the blobs are jammed together.`));
  } else {
    results.push(pass('compactness', `Radius of gyration ${rg.toFixed(2)} nm, inside the expected ${band.low.toFixed(2)}–${band.high.toFixed(2)} nm band.`));
  }

  // 5. Buried core
  const facingA = dot(geo.patchA, geo.axis);
  const facingB = dot(geo.patchB, scale(geo.axis, -1));
  const exposed = [];
  if (facingA < -0.4) exposed.push(`${entryA.name}'s patch turns away from the join`);
  if (facingB < -0.4) exposed.push(`${entryB.name}'s patch turns away from the join`);
  results.push(
    exposed.length
      ? fail('buried-core', `Hydrophobic patch left facing solvent — ${exposed.join(' and ')}.`)
      : pass('buried-core', `Both hydrophobic patches end up pointing at the interface rather than out into solvent (${facingA.toFixed(2)}, ${facingB.toFixed(2)}).`),
  );

  // 6. Operating window
  const pair = [entryA, entryB];
  const t = intersectWindows(pair, 'temp');
  const p = intersectWindows(pair, 'ph');
  if (t.empty || p.empty) {
    const which = t.empty ? 'temperature' : 'pH';
    results.push(fail('operating-window', `The two parents share no ${which} window at all (${entryA.name} vs ${entryB.name}).`));
  } else {
    const team = teamEntries.filter((e) => e && e.id !== entryA.id && e.id !== entryB.id);
    const withTeam = team.length ? intersectWindows([...pair, ...team], 'temp') : null;
    const withTeamPh = team.length ? intersectWindows([...pair, ...team], 'ph') : null;
    if (withTeam && (withTeam.empty || withTeamPh.empty)) {
      results.push(fail('operating-window', `The parents overlap at ${t.low}–${t.high} °C / pH ${p.low}–${p.high}, but that does not overlap the rest of the lane.`));
    } else {
      results.push(
        pass(
          'operating-window',
          `Parents share ${t.low}–${t.high} °C and pH ${p.low}–${p.high}${withTeam ? `, and that still overlaps the rest of the lane (${withTeam.low}–${withTeam.high} °C, pH ${withTeamPh.low}–${withTeamPh.high})` : ''}.`,
        ),
      );
    }
  }

  const firstFail = results.find((r) => !r.pass) ?? null;
  return {
    geometry: geo,
    rg,
    rgBand: band,
    results,
    killedBy: firstFail ? firstFail.id : null,
    passed: !firstFail,
  };
}

function pass(id, reason) {
  return { id, label: labelOf(id), pass: true, reason };
}
function fail(id, reason) {
  return { id, label: labelOf(id), pass: false, reason };
}
function labelOf(id) {
  return FILTERS.find((f) => f.id === id)?.label ?? id;
}

/* ---------- the funnel ---------- */

// Every candidate splice point for this pair of entries: each site of A against
// each site of B, at each linker length. The funnel reports how many went in,
// which filter killed how many, and which few came out.
export function spliceFunnel(entryA, entryB, teamEntries = [], linkerChoices = LINKER_CHOICES) {
  const candidates = [];
  for (const siteA of entryA.domain.sites) {
    for (const siteB of entryB.domain.sites) {
      for (const linkerUnits of linkerChoices) {
        const verdict = runFilters(entryA, siteA, entryB, siteB, linkerUnits, teamEntries);
        candidates.push({
          id: `${entryA.id}:${siteA.id}+${entryB.id}:${siteB.id}@${linkerUnits}`,
          siteA,
          siteB,
          linkerUnits,
          ...verdict,
        });
      }
    }
  }

  const stages = FILTERS.map((f) => ({
    ...f,
    killed: candidates.filter((c) => c.killedBy === f.id).length,
  }));

  let remaining = candidates.length;
  const funnel = stages.map((s) => {
    const entering = remaining;
    remaining -= s.killed;
    return { ...s, entering, leaving: remaining };
  });

  return {
    pairLabel: `${entryA.name} + ${entryB.name}`,
    went_in: candidates.length,
    funnel,
    survivors: candidates.filter((c) => c.passed),
    candidates,
    verdictWording: PASS_VERDICT,
    notChecked: NOT_CHECKED,
    physicsNote: CARTOON_PHYSICS_NOTE,
  };
}
