// Step three of the flow: the chosen chain, played inside the vacuum.
//
// The molecule-first flow lives on this screen. `renderHome` dispatches on
// state.homeStep — 'ask' is the picker, 'routes' is the grid of chains the
// search found, and 'run' is this file's own stage. The bench and the
// workstation no longer have tabs; they are reachable from the controls here,
// and both still render exactly as they did, so the one-press chain run and
// the mid-run refusal that the pitch is built around are unchanged.
//
// What is new in the playing itself: the pace and the wobble come from
// src/ui/route-playback.js, which reads them off the activity curve in
// src/model/activity.js per stage rather than averaging the lane. Held cold
// every stage slows; held past one enzyme's stated window that stage alone
// plays slow and unsteady and the enzyme is named. And where the group one
// stage frees is the group the next stage needs, the handoff is labelled as
// one, read off the two rules rather than asserted.
//
// It shows the lane the bench holds — the same `state.lane` and starter — and
// one press of Play runs the whole thing: the first enzyme acts on the
// molecule, the product it leaves is carried to the next enzyme, and so on
// down the chain. A stage with no rule for what it was handed refuses in the
// middle of the run and the run stops there, which is the moment this screen
// exists to show.
//
// Nothing here decides anything. The stages come from runPipeline, the same
// call the bench renders from, so the animation can only play what the rules
// did. Molecules are drawn as ball-and-stick from structure.js; enzymes stay
// cartoons. When WebGL is missing, the same chain plays as the flat cartoon.

import { runPipeline } from '../model/pipeline.js';
import { starter, groupMeta, prettyCore, describe, STARTERS } from '../model/molecules.js';
import { reactionScene, REACTION_NOTE } from './reaction.js';
import { escapeText } from './cartoon.js';
import { state, setState, laneEntries } from './app.js';
import { RUN_LENGTHS, DEFAULT_RUN } from '../model/activity.js';
import { laneClimate, climateFor, climateLine, tempRange, bestTemp, CLIMATE_NOTE, CLIMATE_DISCLAIMER } from './climate.js';
import { renderPicker } from './picker-view.js';
import { renderRoutes } from './route-grid.js';
import { laneTimeline, timelineHeadline, PLAYBACK_NOTE, STAGE_MS } from './route-playback.js';
import { describeTarget, coreLabel } from '../model/routes.js';
import { article } from '../model/behaviours.js';

// How long one stage takes to play, in seconds.
const STAGE_SECONDS = 5.5;

// Where the timeline rests before Play: just past the enzyme's entrance, so
// the piece is already on stage rather than the vacuum looking empty.
const IDLE_AT = 0.2;
const FOLD_STORE = 'nano-foundry.home-fold';

let mounted = null;
let mountedTimer = null;

// The 3D module, kept after the first successful load. Importing it on every
// mount made each remount asynchronous, which is the other half of the lost-run
// race: a Play click arriving while a lane change was remounting landed on the
// instance being torn down. Only the very first mount in a session awaits
// anything now; every remount after it is synchronous.
let sceneModule = null;
let sceneModuleFailed = false;

function verb(entry) {
  const a = entry.action;
  const g = groupMeta(a.group).label;
  // article() rather than a bare "a", because the group labels include acyl and
  // amine and "a acyl" is the kind of thing a judge reads out loud.
  if (a.op === 'add') return `puts ${article(g)} on`;
  if (a.op === 'remove') return `takes ${article(g)} off`;
  if (a.op === 'join') return `joins groups into ${article(g)}`;
  return 'rearranges the skeleton';
}

// The stages this screen will play: the ones the rules actually reached.
function playable(run) {
  return run.stages
    .filter((s) => s.state !== 'unreached')
    .map((s, i, all) => ({
      index: s.index,
      entry: s.enzyme,
      molIn: s.input,
      result: s.state === 'ran' ? { ok: true, product: s.product, what: s.what } : { ok: false, stallReason: s.stallReason },
      last: i === all.length - 1,
    }));
}

// The ribbon colours on the piece, from the entry's own region labels.
function regionLine(entry) {
  const sites = entry.domain?.sites ?? [];
  if (!sites.length) return '';
  return `<p class="tally regions" title="Ribbons on the cartoon body: helices red, sheets amber, loops green.">${sites
    .map((x) => `${escapeText(x.label)} (${x.region})`)
    .join(' · ')}</p>`;
}

function caption(stage, run, beat = null) {
  const { entry, molIn, result } = stage;
  const cof = entry.cofactor && entry.cofactor !== 'none' ? ` Helper: ${escapeText(entry.cofactor)}.` : '';
  const head = `<div class="beat-step">Stage ${stage.index + 1} of ${run.stages.length}</div>
    <h2>${escapeText(entry.name)} ${escapeText(verb(entry))}</h2>`;
  if (!result.ok) {
    return `${head}
      ${regionLine(entry)}
      <p class="refused">${escapeText(result.stallReason)}</p>
      ${beat && (beat.pastWindow || beat.underWindow) ? `<p class="home-thermal-line ${beat.pastWindow ? 'over' : 'under'}">${escapeText(beat.note)}</p>` : ''}`;
  }
  return `${head}
    ${regionLine(entry)}
    <p>In: ${escapeText(describe(molIn))}. Out: ${escapeText(describe(result.product))}.${cof}</p>
    ${beat ? beatLines(beat) : ''}`;
}

// What the timeline knows about this stage that the pipeline result does not:
// which group is moving, whether the next enzyme is waiting for it, and where
// the dial has put this enzyme against its own stated window.
function beatLines(beat) {
  const out = [`<p class="home-change">${escapeText(beat.change.label)}.</p>`];
  if (beat.handoff) {
    out.push(`<p class="home-handoff"><strong>Handed on:</strong> ${escapeText(beat.handoff.label)}.</p>`);
  }
  if (beat.pastWindow || beat.underWindow) {
    out.push(`<p class="home-thermal-line ${beat.pastWindow ? 'over' : 'under'}">${escapeText(beat.note)}</p>`);
  }
  return out.join('');
}

// The line above the stage: what was asked for and which chain is playing.
// Present only when the lane came from the route search; a lane edited on the
// bench or loaded from a demo has no target behind it, and says so by omission
// rather than by inventing one.
function flowHead() {
  if (!state.target) {
    return `<div class="home-flow-head">
      <button class="btn small ghost" data-step="ask">Ask for a molecule</button>
    </div>`;
  }
  const result = state.routeResult;
  const route = (result?.routes ?? []).find((r) => r.id === state.chosenRoute);
  return `<div class="home-flow-head">
    <button class="btn small ghost" data-step="routes">‹ Back to the routes</button>
    <p class="home-flow-target">Making <strong>${escapeText(describeTarget(state.target))}</strong>${
      route ? ` · ${route.stages.length} stage${route.stages.length === 1 ? '' : 's'} from ${escapeText(coreLabel(route.molecules[0].core))}` : ''
    }</p>
    <button class="btn small ghost" data-step="ask">Change the molecule</button>
  </div>`;
}

function controls(run, entries) {
  const chips = run.stages
    .map(
      (s) => `<span class="home-chip ${s.state}">${escapeText(s.enzyme.name)}</span>`,
    )
    .join('<span class="home-chip-arrow" aria-hidden="true">➜</span>');
  return `<div class="home-controls">
    <button class="btn primary home-play" data-play>▶ Play the run</button>
    <label class="home-starter">Starting molecule
      <select data-starter>
        ${STARTER_OPTIONS()
          .map((o) => `<option value="${o.id}" ${o.id === state.starterId ? 'selected' : ''}>${escapeText(o.label)}</option>`)
          .join('')}
      </select>
    </label>
    <div class="home-lane" aria-label="The lane">${entries.length ? chips : '<span class="home-chip empty">empty lane</span>'}</div>
    ${climateRow(entries, state.runId, state.temp)}
    <div class="home-control-actions">
      ${(state.demo?.routes ?? [])
        .map((r) => `<button class="btn small ghost" data-demo="${r.id}">${escapeText(r.title)}</button>`)
        .join('')}
    </div>
    <p class="home-playback-note">${escapeText(PLAYBACK_NOTE)}</p>
  </div>`;
}

// Where the dial starts: the best shared point for this lane and run length,
// so the first thing the screen shows is the compromise rather than an
// arbitrary number. activity.js finds it; this only reads it.
function startingTemp(entries, runId) {
  return entries.length ? bestTemp(entries, runId) : 37;
}

function climateRow(entries, runId, temp) {
  const range = tempRange(entries);
  const chips = entries
    .map((e) => {
      const c = climateFor(e, temp, runId);
      return `<span class="home-chip ${c.over ? 'over' : c.under ? 'under' : ''}">${escapeText(e.name)} ${Math.round(c.activity * 100)}%</span>`;
    })
    .join('');
  return `<div class="home-climate" title="${escapeText(`${CLIMATE_NOTE} ${CLIMATE_DISCLAIMER}`)}">
    <label class="home-dial">
      <span class="home-dial-head">
        <strong data-temp-read>${temp} °C</strong>
        <span class="home-dial-span">${range.min}–${range.max} °C</span>
      </span>
      <input type="range" data-temp min="${range.min}" max="${range.max}" step="0.5" value="${temp}"
        aria-label="Temperature" ${entries.length ? '' : 'disabled'} />
    </label>
    <label class="home-run">Run
      <select data-run ${entries.length ? '' : 'disabled'}>
        ${RUN_LENGTHS.map((r) => `<option value="${r.id}" ${r.id === runId ? 'selected' : ''}>${escapeText(r.label)}</option>`).join('')}
      </select>
    </label>
    <button class="btn small ghost" data-best ${entries.length ? '' : 'disabled'}>Best point</button>
    <div class="home-pcts" data-pcts>${chips}</div>
    <p class="home-climate-line" data-climate-line></p>
    <p class="home-timeline-line" data-timeline-line></p>
  </div>`;
}

// molecules.js owns the list; this only needs id and label. Built once at
// module load rather than awaited on every render: the await used to make the
// remount after a lane change asynchronous, so a Play click arriving during it
// landed on the instance being torn down and the run was silently lost.
const STARTERS_CACHE = STARTERS.map((s) => ({ id: s.id, label: s.label }));

function STARTER_OPTIONS() {
  return STARTERS_CACHE;
}

export function unmountHome() {
  if (!mounted) return;
  mounted.cleanup();
  mounted = null;
  document.body.classList.remove('home-mode');
}

/* ---------- labels, drawn over the canvas with leader lines ---------- */

function labelSet(stage, t, sub, scene, beat = null) {
  const anchors = scene.labelAnchors();
  const a = stage.entry.action;
  const g = groupMeta(a.group).label;
  const out = [];
  // Only a few at a time: the anatomy while the piece is arriving, then the
  // chemistry. Everything else is in the card on the left.
  let ribbons = 0;
  for (const an of anchors) {
    if (an.id === 'site') {
      an.text =
        a.op === 'add' ? `Active site · puts the ${g} on here` : a.op === 'remove' ? `Active site · takes the ${g} off here` : 'Active site';
      an.detail = 'Where this toy draws the chemistry as happening.';
    }
    if (an.id.startsWith('ribbon')) {
      if (t > 0.18 && t < 0.44 && ribbons < 2) {
        ribbons += 1;
        out.push(an);
      }
      continue;
    }
    if ((an.id === 'upper' || an.id === 'cleft') && t > 0.2 && t < 0.5) out.push(an);
    if (an.id === 'site' && t >= 0.44 && t < 0.86) out.push(an);
  }
  if (sub.flyer?.visible) {
    // When the group this stage frees is the one the next stage needs, say so
    // on the group itself. That pairing is read off the two catalogue rules by
    // route-playback.js, so the label cannot claim a handoff that is not there.
    const handoffGroup = beat?.handoff ? groupMeta(beat.handoff.group).label : null;
    out.push({
      id: 'flyer',
      text: a.op === 'add' ? `${g} going on` : handoffGroup ? `${g} off — the next enzyme wants it` : `${g} coming off`,
      detail: a.op === 'add'
        ? 'Handed over and fixed to the molecule.'
        : beat?.handoff
          ? `${beat.handoff.label}.`
          : 'Cut free and released into the vacuum.',
      object: sub.flyer,
      hot: true,
    });
  }
  // The product mesh becomes visible while it is still sitting in the cleft, so
  // offering its label then puts it on the same anchor as the active-site label
  // and the two cards overlap. 0.86 is where the site label stops, above, so
  // the two hand over at one boundary rather than sharing the anchor.
  if (stage.result.ok && sub.product?.visible && t >= 0.86) {
    out.push({
      id: 'product',
      text: `Product · ${prettyCore(stage.result.product.core)}`,
      detail: stage.last
        ? describe(stage.result.product)
        : beat?.handoff
          ? `${beat.handoff.label}.`
          : 'On its way to the next enzyme.',
      object: sub.product,
    });
  }
  if (!stage.result.ok && t > 0.4) {
    out.push({
      id: 'refused',
      text: `${prettyCore(stage.molIn.core)} · refused`,
      detail: 'It never seats in the cleft.',
      object: sub.molecule,
      hot: true,
    });
  }
  return out;
}

function drawLabels(stage, t, beat = null) {
  const { scene, root } = mounted;
  const sub = scene.subject;
  const layer = root.querySelector('.home-labels');
  const svg = root.querySelector('.home-leaders');
  if (!sub || !layer) return;
  const w = layer.clientWidth;
  const h = layer.clientHeight;
  const cx = w > 900 ? w * 0.6 : w * 0.5;
  const cy = h * 0.5;
  const seen = new Set();
  const placed = [];
  const minX = w > 900 ? Math.min(470, w * 0.33) : 8;

  for (const an of labelSet(stage, t, sub, scene, beat)) {
    const p = scene.project(an.object);
    // Offstage anchors (a molecule parked outside the frame) would leave a
    // label on the edge with its leader running off the canvas.
    if (!p.visible || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
    seen.add(an.id);
    let el = layer.querySelector(`[data-label="${an.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'home-label';
      el.dataset.label = an.id;
      layer.appendChild(el);
    }
    el.classList.toggle('hot', !!an.hot);
    // Name only; the explanation sits in the tooltip so the stage stays clear.
    const html = `<strong>${escapeText(an.text)}</strong>`;
    if (el._html !== html) {
      el.innerHTML = html;
      el.title = an.detail ?? '';
      el._html = html;
      el._h = el.offsetHeight;
    }
    let dx = p.x - cx;
    let dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    let left = dx < 0;
    let lx = p.x + dx * 110 + (left ? -200 : 0);
    if (lx < minX) {
      left = false;
      lx = Math.max(p.x + 60, minX);
    }
    lx = Math.min(w - 250, lx);
    placed.push({ el, p, lx, ly: p.y + dy * 80 - 18, hgt: el._h || 70, left });
  }

  // Three at once is the most a reader can take in while something is moving.
  placed.sort((m, n) => m.ly - n.ly);
  // Anything past the cap is not placed this frame, so it must not stay shown
  // at the position it held in the last one.
  for (const dropped of placed.splice(3)) seen.delete(dropped.el.dataset.label);
  // Measure, clamp, then separate — in that order. Separating first and
  // clamping after put a card that had just been pushed down back up into the
  // one above it, which is how two callouts ended up sharing a line for a
  // frame or two at the boundary where one anchor stops and the next starts.
  for (const m of placed) {
    m.hgt = m.el.offsetHeight || m.hgt;
    m.floor = Math.max(8, h - m.hgt - 12);
    m.ly = Math.min(Math.max(16, m.ly), m.floor);
  }
  const kept = [];
  for (const m of placed) {
    for (const n of kept) {
      if (Math.abs(n.lx - m.lx) < 205 && m.ly < n.ly + n.hgt + 8) m.ly = n.ly + n.hgt + 8;
    }
    // No room left below without hanging past the bottom edge, which the
    // stage's overflow:hidden would cut in half. Drop the card for this frame
    // rather than stacking it on the one above: a callout nobody can read is
    // worse than one callout fewer.
    if (m.ly > m.floor) {
      seen.delete(m.el.dataset.label);
      continue;
    }
    kept.push(m);
  }

  let lines = '';
  for (const m of kept) {
    const ly = m.ly;
    m.el.style.transform = `translate(${m.lx}px, ${ly}px)`;
    const ex = m.left ? m.lx + 200 : m.lx;
    lines += `<line x1="${m.p.x.toFixed(1)}" y1="${m.p.y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${(ly + 16).toFixed(1)}"/>
      <circle cx="${m.p.x.toFixed(1)}" cy="${m.p.y.toFixed(1)}" r="3.5"/>`;
  }
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = lines;
  for (const el of layer.querySelectorAll('.home-label')) {
    el.classList.toggle('shown', seen.has(el.dataset.label));
  }
}

/* ---------- the screen ---------- */

// The flow's router. Only the run step owns a WebGL scene, so the other two
// unmount it rather than leaving a canvas running behind a different screen.
export function renderHome(root) {
  if (state.homeStep === 'ask') {
    unmountHome();
    renderPicker(root);
    return undefined;
  }
  if (state.homeStep === 'routes') {
    unmountHome();
    renderRoutes(root);
    return undefined;
  }
  return renderRun(root);
}

async function renderRun(root) {
  const entries = laneEntries();
  const signature = `${state.starterId}|${state.lane.join(',')}`;
  if (mounted && mounted.signature === signature && root.contains(mounted.root)) return;
  const wasPlaying = mounted?.playing;
  unmountHome();
  document.body.classList.add('home-mode');

  const run = runPipeline(starter(state.starterId), entries);
  const stages = playable(run);

  // The dial persists across remounts, but a lane it was set for may be gone.
  if (!state.runId) state.runId = DEFAULT_RUN;
  if (state.temp == null || state.tempLane !== signature) {
    state.temp = startingTemp(entries, state.runId);
    state.tempLane = signature;
  }

  root.innerHTML = `<div class="home">
    <div class="home-stage">
      <canvas class="home-canvas" aria-label="3D cartoon of the lane running"></canvas>
      <div class="home-fallback" hidden></div>
      <svg class="home-leaders" aria-hidden="true"></svg>
      <div class="home-labels"></div>
      <div class="home-vignette" aria-hidden="true"></div>
      <div class="home-stalled" aria-hidden="true"></div>
      <div class="home-loading state-card bare" aria-live="polite"><span class="state-ring"></span><p>Drawing the stage…</p></div>
      <div class="home-thermal" aria-hidden="true"></div>
      <div class="home-caption"></div>
      <div class="home-hint" aria-hidden="true">drag to turn it
        <svg viewBox="0 0 72 54"><path d="M4 4 C 30 2, 58 14, 62 44 M 52 36 L 62 46 L 70 34"/></svg>
      </div>
      <div class="home-progress"><div class="home-progress-bar"></div></div>
      <div class="home-scene-note" role="note"></div>
      <button class="home-fold" data-fold aria-expanded="true" title="Hide the controls so the animation fills the screen">Hide controls</button>
    </div>
    ${flowHead()}
    ${controls(run, entries)}
  </div>`;

  const homeEl = root.querySelector('.home');
  const canvas = homeEl.querySelector('.home-canvas');
  const note = homeEl.querySelector('.home-scene-note');
  const captionEl = homeEl.querySelector('.home-caption');
  const bar = homeEl.querySelector('.home-progress-bar');
  const playBtn = homeEl.querySelector('[data-play]');
  const fallback = homeEl.querySelector('.home-fallback');
  const topbar = document.querySelector('.topbar');
  const standing = document.querySelector('.standing-note');
  const setTop = () =>
    document.documentElement.style.setProperty(
      '--topbar-h',
      `${(topbar?.offsetHeight ?? 0) + (standing?.offsetHeight ?? 0)}px`,
    );
  setTop();

  let scene = null;
  if (!sceneModule && !sceneModuleFailed) {
    try {
      sceneModule = await import('./three-scene.js');
    } catch (err) {
      sceneModuleFailed = true;
      console.warn('3D scene unavailable, falling back to the flat cartoon', err);
    }
  }
  if (sceneModule) {
    try {
      const made = sceneModule.createFoundryScene(canvas);
      if (made.ok) {
        scene = made;
        note.textContent = sceneModule.SCENE_NOTE;
        note.title = `${sceneModule.SCENE_NOTE_LONG} ${REACTION_NOTE}`;
      }
    } catch (err) {
      console.warn('3D scene could not be created, falling back to the flat cartoon', err);
    }
  }
  if (!root.contains(homeEl)) {
    scene?.dispose();
    return;
  }
  homeEl.querySelector('.home-loading')?.remove();
  if (!scene) {
    canvas.hidden = true;
    fallback.hidden = false;
    note.textContent = 'This browser has no WebGL, so the flat cartoon plays instead.';
    note.title = REACTION_NOTE;
  }

  /* --- the run: one clock across every stage --- */

  let at = 0; // 0 .. stages.length, the position along the whole chain
  let playing = false;
  let current = -1;

  // The timeline route-playback.js computes from the activity curve: how long
  // each stage takes at this temperature and run length, how hard it wobbles,
  // and where a group one stage frees is the group the next one needs. Rebuilt
  // when the dial moves, so turning the heat up slows the stage being watched
  // mid-run rather than at the next stage boundary.
  let timeline = laneTimeline(entries, run, { temp: state.temp, runId: state.runId });
  const rebuildTimeline = () => {
    timeline = laneTimeline(entries, run, { temp: state.temp, runId: state.runId });
    const head = homeEl.querySelector('[data-timeline-line]');
    if (head) head.textContent = stages.length ? timelineHeadline(timeline) : '';
    return timeline;
  };

  const empty = () => {
    captionEl.innerHTML = `<div class="home-card vacant">
      <svg class="state-glyph" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="15" stroke-dasharray="3 5" /><path class="lit" d="M18 15l12 7-12 7z" />
      </svg>
      <div class="beat-step">Nothing on the stage</div>
      <h2>Load a route to play it</h2>
      <p class="hero-sub">Pick a chain from the routes, or press one of the three lanes below.</p>
    </div>`;
  };

  function showStage(i) {
    const stage = stages[i];
    if (!stage) return;
    current = i;
    captionEl.innerHTML = `<div class="home-card">${caption(stage, run, timeline.stages[i])}</div>`;
    if (scene) {
      const prev = stages[i - 1];
      scene.setSubject(stage.entry, stage.molIn, stage.result, {
        carry: !!prev?.result.ok,
        last: stage.last,
        slide: i > 0,
      });
      homeEl.querySelector('.home-labels').innerHTML = '';
      homeEl.querySelector('.home-leaders').innerHTML = '';
    } else {
      fallback.innerHTML = reactionScene(stage.entry, stage.molIn);
    }
  }

  function finished() {
    const lastStage = stages.at(-1);
    playBtn.textContent = '▶ Play again';
    playBtn.disabled = false;
    if (lastStage && !lastStage.result.ok) {
      // The dead end is the conclusion, so it gets the weight of one: the
      // field closes in, the next move is offered, and the reason stays in
      // the caption above exactly as the pipeline gave it.
      homeEl.classList.add('stalled');
      playBtn.classList.remove('primary');
      captionEl.insertAdjacentHTML(
        'beforeend',
        `<div class="home-card ruled-out"><div class="beat-step">Dead end</div>
          <h2>The run stops here</h2>
          <p>${escapeText(lastStage.entry.name)} would not take ${escapeText(describe(lastStage.molIn))}, so nothing past this stage was made, and nothing past it was guessed.</p>
          <div class="home-end-actions">
            <button class="btn small primary" data-step="ask">Change the molecule</button>
            <button class="btn small ghost" data-go="bench">Rework the lane on the bench</button>
          </div></div>`,
      );
    } else if (lastStage) {
      captionEl.insertAdjacentHTML(
        'beforeend',
        `<div class="home-card end"><div class="beat-step">End of the run</div>
          <h2>Out comes ${escapeText(describe(run.product ?? lastStage.result.product))}</h2></div>`,
      );
    }
  }

  function play() {
    if (!stages.length) return;
    homeEl.classList.remove('stalled');
    playBtn.classList.add('primary');
    at = 0;
    current = -1;
    if (scene) scene.setProgress(0);
    current = -1;
    playing = true;
    playBtn.textContent = '■ Stop';
    showStage(0);
  }

  function stop() {
    playing = false;
    playBtn.textContent = stages.length ? '▶ Play the run' : '▶ Play the run';
  }

  // The run's own pace follows the curve: held under its window the lane
  // crawls, and nothing about that is a failure. Read fresh every frame so the
  // dial takes effect mid-run.
  function applyClimate() {
    const i = Math.min(stages.length - 1, Math.max(0, Math.floor(at)));
    const stage = stages[i];
    const c = laneClimate(entries, state.temp, state.runId, stage?.entry ?? null);
    // The wobble is this stage's own, from its own stated window, so one
    // enzyme being held past its edge shakes while the others do not.
    const own = timeline.stages[i];
    homeEl.style.setProperty('--warmth', c.warmth.toFixed(3));
    homeEl.style.setProperty('--agitation', String(own?.agitation ?? c.agitation));
    scene?.setClimate({ warmth: c.warmth, agitation: own?.agitation ?? c.agitation });
    return c;
  }

  function tick(dt) {
    applyClimate();
    if (!playing) return;
    // Each stage runs on its own clock, because the stage on screen is the one
    // being held hot or cold and averaging the lane would hide exactly that.
    const here = Math.min(stages.length - 1, Math.max(0, Math.floor(at)));
    const seconds = (timeline.stages[here]?.durationMs ?? STAGE_MS) / 1000;
    at = Math.min(stages.length, at + dt / Math.max(0.2, seconds));
    const i = Math.min(stages.length - 1, Math.floor(at));
    if (i !== current) showStage(i);
    const t = Math.min(1, at - i);
    bar.style.width = `${((at / stages.length) * 100).toFixed(2)}%`;
    if (scene) scene.setProgress(t);
    if (at >= stages.length) {
      playing = false;
      finished();
    }
    return t;
  }

  if (!stages.length) {
    empty();
    playBtn.disabled = true;
    playBtn.classList.remove('primary');
  } else {
    showStage(0);
    at = IDLE_AT;
    if (scene) scene.setProgress(IDLE_AT);
  }

  paintClimate();

  let lastNow = performance.now();
  if (scene) {
    scene.resize();
    scene.onFrame(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      tick(dt);
      const i = Math.min(stages.length - 1, Math.floor(at));
      if (stages[i]) drawLabels(stages[i], Math.min(1, at - i), timeline.stages[i]);
    });
  } else {
    // No WebGL: step the flat cartoon through the same chain on a timer.
    const id = setInterval(() => tick(0.25), 250);
    mountedTimer = id;
  }

  /* --- input --- */

  let drag = null;
  const hint = homeEl.querySelector('.home-hint');
  const dismissHint = () => hint?.classList.add('gone');
  const down = (e) => {
    dismissHint();
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!drag || !scene) return;
    scene.nudgeOrbit(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
  };
  const up = () => (drag = null);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const onResize = () => {
    setTop();
    scene?.resize();
  };
  window.addEventListener('resize', onResize);
  // On a short screen the controls can push the page a little past the fold,
  // and the stage then scrolls up under the see-through topbar. Mark the
  // scrolled state so the bar can take a backing only while it is needed.
  const onScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // The controls strip folds away so the animation can fill the frame. The
  // choice is remembered per browser; it starts open.
  const foldBtn = homeEl.querySelector('[data-fold]');
  const setFolded = (folded) => {
    homeEl.classList.toggle('folded', folded);
    foldBtn.textContent = folded ? 'Show controls' : 'Hide controls';
    foldBtn.setAttribute('aria-expanded', String(!folded));
    try {
      localStorage.setItem(FOLD_STORE, folded ? '1' : '0');
    } catch {
      /* private window: the fold just does not persist */
    }
    requestAnimationFrame(() => scene?.resize());
  };
  let foldedAtStart = false;
  try {
    foldedAtStart = localStorage.getItem(FOLD_STORE) === '1';
  } catch {
    /* as above */
  }
  if (foldedAtStart) setFolded(true);

  homeEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-fold]')) {
      setFolded(!homeEl.classList.contains('folded'));
      return;
    }
    if (e.target.closest('[data-play]')) {
      dismissHint();
      if (playing) stop();
      else play();
      return;
    }
    const step = e.target.closest('[data-step]');
    if (step) {
      setState({ homeStep: step.dataset.step });
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      setState({ screen: go.dataset.go });
      return;
    }
    if (e.target.closest('[data-best]')) {
      state.temp = bestTemp(entries, state.runId);
      const dial = homeEl.querySelector('[data-temp]');
      if (dial) dial.value = String(state.temp);
      paintClimate();
      return;
    }
    const demo = e.target.closest('[data-demo]');
    if (demo) {
      const route = (state.demo?.routes ?? []).find((r) => r.id === demo.dataset.demo);
      if (route) setState({ starterId: route.starter, lane: [...route.lane], playStage: null });
    }
  });

  function paintClimate() {
    const el = homeEl.querySelector('[data-temp-read]');
    if (el) el.textContent = `${state.temp} °C`;
    const pcts = homeEl.querySelector('[data-pcts]');
    if (pcts) {
      pcts.innerHTML = entries
        .map((e) => {
          const c = climateFor(e, state.temp, state.runId);
          return `<span class="home-chip ${c.over ? 'over' : c.under ? 'under' : ''}">${escapeText(e.name)} ${Math.round(c.activity * 100)}%</span>`;
        })
        .join('');
    }
    const stage = stages[Math.min(stages.length - 1, Math.max(0, Math.floor(at)))];
    const line = homeEl.querySelector('[data-climate-line]');
    if (line) line.textContent = climateLine(stage, state.temp, state.runId);
    // The dial changes how long every stage takes, so the timeline is rebuilt
    // before anything is drawn from it.
    rebuildTimeline();
    applyClimate();
  }

  homeEl.addEventListener('input', (e) => {
    const dial = e.target.closest('[data-temp]');
    if (dial) {
      state.temp = Number(dial.value);
      paintClimate();
    }
  });

  homeEl.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-starter]');
    if (sel) {
      setState({ starterId: sel.value });
      return;
    }
    const runSel = e.target.closest('[data-run]');
    if (runSel) {
      state.runId = runSel.value;
      paintClimate();
    }
  });

  mounted = {
    root: homeEl,
    scene,
    stages,
    signature,
    get playing() {
      return playing;
    },
    cleanup() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      document.body.classList.remove('scrolled');
      if (mountedTimer) clearInterval(mountedTimer);
      mountedTimer = null;
      scene?.dispose();
    },
  };
  window.__foundryHome = { scene, stages, play, tick };
  if (wasPlaying || state.autoPlayHome) play();
}

