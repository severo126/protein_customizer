// The timeline a chosen route plays to.
//
// This file turns a route into choreography, and it invents no physics to do
// it. Two sources, and nothing else:
//
//   * src/model/activity.js, through climate.js — how fast the run plays and
//     how agitated the picture is, read off the same rising-activity-times-
//     what-survives curve the dial already shows. Held at an enzyme's optimum
//     the stage plays at full speed; held cold every stage slows; held past an
//     enzyme's stated window that stage is both slow and shaken, and the
//     enzyme is named. That is the heat and cold behaviour the app already
//     has, driving the picture rather than a second model sitting beside it.
//
//   * the catalogue's own action rule — which group moves, and whether the
//     group one stage frees is the group the next stage needs. When it is,
//     that is a handoff worth watching, and it is read out of the rule rather
//     than asserted.
//
// What a pace is: a playback speed for a cartoon. It is not a rate, not a
// turnover number and not a prediction, and the note below says so wherever
// the timeline is shown. What an agitation is: an amplitude for a wobble past
// the edge of a stated catalogue window. It is not denaturation — this app has
// no model of denaturation or aggregation, both stay on the never-checked list,
// and nothing here says an enzyme was damaged or destroyed.

import { groupMeta, describe } from '../model/molecules.js';
import { article } from '../model/behaviours.js';
import { laneClimate, climateFor, phOf, CLIMATE_NOTE, CLIMATE_DISCLAIMER } from './climate.js';
import { runLength } from '../model/activity.js';

export const PLAYBACK_NOTE =
  'Pace and wobble are playback settings read off the activity curve this app computes from the catalogue’s rounded windows. They are not rates, not a prediction, and nothing here models denaturation or aggregation.';

export const PLAYBACK_CLIMATE_NOTE = CLIMATE_NOTE;
export const PLAYBACK_DISCLAIMER = CLIMATE_DISCLAIMER;

// How long one stage takes at full speed, in milliseconds. Chosen to be
// watchable; it means nothing.
export const STAGE_MS = 5200;

// The slowest a stage is allowed to play, as a multiple of STAGE_MS. climate.js
// floors the pace rather than letting it reach zero, because a run that stops
// dead reads as broken and broken is a claim this app cannot make. This caps
// the other end of the same decision.
export const SLOWEST_MULTIPLE = 5.5;

// How far the picture may wobble, in scene units, when a stage is held a full
// half-window past its stated top edge.
export const MAX_WOBBLE = 0.42;

/* ---------------------------- what a stage does --------------------------- */

// Read off the entry's own rule, not guessed from the two molecules, so the
// label can never disagree with what the bench actually did.
export function stageChange(entry) {
  const a = entry.action;
  if (a.op === 'add') {
    return { kind: 'add', moves: [a.group], frees: [], needs: [...(a.requires ?? [])], label: `${article(groupMeta(a.group).label)} arrives and is put on` };
  }
  if (a.op === 'remove') {
    return {
      kind: 'remove',
      moves: [a.group],
      frees: a.yields ? [a.yields] : [],
      needs: [a.group],
      label: a.yields
        ? `${article(groupMeta(a.group).label)} is cut off, leaving ${article(groupMeta(a.yields).label)} behind`
        : `${article(groupMeta(a.group).label)} is cut off`,
    };
  }
  if (a.op === 'join') {
    return {
      kind: 'join',
      moves: [...(a.requires ?? [])],
      frees: [a.group],
      needs: [...(a.requires ?? [])],
      label: `${(a.requires ?? []).map((g) => groupMeta(g).label).join(' and ')} are brought together into ${article(groupMeta(a.group).label)}`,
    };
  }
  return { kind: 'rearrange', moves: [], frees: [], needs: [], label: 'the skeleton is rearranged, with nothing added or taken away' };
}

// Does the group this stage frees happen to be the group the next stage needs?
// When it does, one molecule leaves a cleft carrying something the next cleft
// is waiting for, which is the thing worth watching in a chain. Derived from
// the two rules; nothing is asserted that the rules do not say.
export function handoffBetween(from, to) {
  const out = stageChange(from);
  const next = stageChange(to);
  const available = [...out.frees, ...(out.kind === 'add' ? out.moves : [])];
  for (const g of next.needs) {
    if (available.includes(g)) {
      return {
        group: g,
        label: `${from.name} frees ${article(groupMeta(g).label)}, and that is exactly what ${to.name} needs to work on`,
      };
    }
  }
  return null;
}

/* ------------------------------ the timeline ------------------------------ */

// One route, at one temperature, for one length of run.
export function routeTimeline(entries, route, { temp, runId }) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const stageEntries = route.stages.map((id) => byId.get(id)).filter(Boolean);
  const ph = phOf(stageEntries);
  const { hours, label: runLabel } = runLength(runId);

  let cursor = 0;
  const stages = stageEntries.map((entry, i) => {
    const climate = climateFor(entry, temp, runId);
    // This stage's own pace, not the lane's, because a chain is watched one
    // stage at a time and the stage on screen is the one being held hot.
    const lane = laneClimate([entry], temp, runId, entry);
    const durationMs = Math.round(STAGE_MS * Math.min(SLOWEST_MULTIPLE, 1 / Math.max(0.0001, lane.pace)));

    const molIn = route.molecules[i];
    const molOut = route.molecules[i + 1];
    const change = stageChange(entry);
    const nextEntry = stageEntries[i + 1] ?? null;
    const handoff = nextEntry ? handoffBetween(entry, nextEntry) : null;

    // Four beats, as fractions of this stage's own duration, so a slow stage
    // is slow throughout rather than slow then suddenly fast.
    const beats = {
      approach: Math.round(durationMs * 0.2),
      dock: Math.round(durationMs * 0.36),
      transfer: Math.round(durationMs * 0.56),
      release: Math.round(durationMs * 0.76),
      leave: durationMs,
    };

    const stage = {
      index: i,
      entryId: entry.id,
      name: entry.name,
      startMs: cursor,
      durationMs,
      beats,
      // Playback, from the curve.
      pace: Number(lane.pace.toFixed(4)),
      activity: Number(climate.activity.toFixed(4)),
      warmth: Number(climate.warmth.toFixed(4)),
      agitation: Number(climate.agitation.toFixed(4)),
      wobble: Number((MAX_WOBBLE * climate.agitation).toFixed(4)),
      pastWindow: climate.over,
      underWindow: climate.under,
      window: climate.window,
      // Chemistry, from the rule and the molecules the bench computed.
      molIn,
      molOut,
      change,
      handoff,
      note: stageNote(entry, climate, runLabel),
    };
    cursor += durationMs;
    return stage;
  });

  return {
    routeId: route.id,
    temp,
    ph,
    runId,
    runLabel,
    hours,
    totalMs: cursor,
    stages,
    // Which enzymes are being held past their own stated window, named, which
    // is the honest version of "the heat got one of them".
    pastWindow: stages.filter((s) => s.pastWindow).map((s) => ({ id: s.entryId, name: s.name, window: s.window })),
    underWindow: stages.filter((s) => s.underWindow).map((s) => ({ id: s.entryId, name: s.name, window: s.window })),
    handoffs: stages.filter((s) => s.handoff).map((s) => ({ fromStage: s.index, toStage: s.index + 1, ...s.handoff })),
    note: PLAYBACK_NOTE,
    disclaimer: PLAYBACK_DISCLAIMER,
  };
}

// The sentence under the stage while it plays. Says where the dial is against
// this entry's stated window and what the curve reads there, and stops.
function stageNote(entry, climate, runLabel) {
  const pct = `${Math.round(climate.activity * 100)}%`;
  const [lo, hi] = climate.window;
  if (climate.over) {
    return `${entry.name} is being held past its stated window of ${lo}–${hi} °C, and the curve puts it at ${pct} of its own best over ${runLabel.toLowerCase()}. It plays slow and unsteady here.`;
  }
  if (climate.under) {
    return `${entry.name} is being held under its stated window of ${lo}–${hi} °C, and the curve puts it at ${pct} of its own best over ${runLabel.toLowerCase()}. Everything slows together in the cold.`;
  }
  return `${entry.name} is inside its stated window of ${lo}–${hi} °C, and the curve puts it at ${pct} of its own best over ${runLabel.toLowerCase()}.`;
}

// The same timeline for any lane the bench can hold, built from a runPipeline
// result rather than from a route the search returned. This is the call the
// home screen actually makes, because a lane may stall — and a stall is the
// thing the screen exists to show, so it has to be in the timeline rather than
// an exception to it. A stalled stage gets a duration and a pace like any
// other; what it does not get is a molecule coming out.
export function laneTimeline(entries, run, { temp, runId }) {
  const reached = run.stages.filter((s) => s.state !== 'unreached');
  const pseudo = {
    id: reached.map((s) => s.enzyme.id).join('>'),
    starterId: null,
    stages: reached.map((s) => s.enzyme.id),
    molecules: [run.start, ...reached.map((s) => s.product ?? null)],
  };
  const timeline = routeTimeline(entries, pseudo, { temp, runId });

  // Mark the stage that refused, and carry its own words rather than new ones.
  reached.forEach((s, i) => {
    if (s.state === 'mismatch' && timeline.stages[i]) {
      timeline.stages[i].refused = true;
      timeline.stages[i].stallReason = s.stallReason;
      // Nothing comes out of a refusal, so there is nothing to hand on.
      timeline.stages[i].handoff = null;
      timeline.stages[i].molOut = null;
    }
  });
  timeline.refusedAt = reached.findIndex((s) => s.state === 'mismatch');
  timeline.handoffs = timeline.stages.filter((s) => s.handoff).map((s) => ({ fromStage: s.index, toStage: s.index + 1, ...s.handoff }));
  return timeline;
}

/* --------------------------- the whole-route line ------------------------- */

// One sentence about the run as a whole, for above the stage. Every number in
// it is read off the timeline, and the two interesting cases — somebody held
// too hot, everybody held too cold — get named rather than averaged away.
export function timelineHeadline(timeline) {
  const seconds = (timeline.totalMs / 1000).toFixed(1);
  const base = `${timeline.stages.length} stage${timeline.stages.length === 1 ? '' : 's'} at ${timeline.temp} °C over ${timeline.runLabel.toLowerCase()}, playing in ${seconds} seconds.`;

  if (timeline.pastWindow.length) {
    const names = timeline.pastWindow.map((s) => `${s.name} (${s.window[0]}–${s.window[1]} °C)`).join(', ');
    const many = timeline.pastWindow.length > 1;
    const which = many ? `Held past their stated windows: ${names}. Those stages play` : `Held past its stated window: ${names}. That stage plays`;
    return `${base} ${which} slow and shaken, and the run still finishes, because whether it really would is not something this toy can tell you.`;
  }
  if (timeline.underWindow.length === timeline.stages.length && timeline.stages.length > 0) {
    return `${base} Every stage is under its stated window, so the whole chain crawls.`;
  }
  if (timeline.underWindow.length) {
    const names = timeline.underWindow.map((s) => s.name).join(', ');
    return `${base} Held under its stated window: ${names}, which slows the chain behind it.`;
  }
  return `${base} Every stage is inside its stated window.`;
}

// What the chain looks like as a list of changes, for the caption rail beside
// the stage. Molecule descriptions come from molecules.js, so they are the same
// words the bench uses.
export function routeStory(timeline) {
  return timeline.stages.map((s) => ({
    index: s.index,
    name: s.name,
    change: s.change.label,
    handoff: s.handoff ? s.handoff.label : null,
    before: s.molIn ? describe(s.molIn) : null,
    // A stage that refused has nothing coming out of it, and the reason is the
    // one the rule itself gave rather than a sentence written here.
    after: s.molOut ? describe(s.molOut) : null,
    refused: Boolean(s.refused),
    stallReason: s.stallReason ?? null,
  }));
}
