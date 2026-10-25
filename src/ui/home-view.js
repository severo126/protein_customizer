// The home screen: the bench, played inside the vacuum.
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
import { starter, groupMeta, prettyCore, describe } from '../model/molecules.js';
import { buildStructure, formulaTally } from '../model/structure.js';
import { CARTOON_PHYSICS_NOTE } from '../model/disclaimers.js';
import { reactionScene, REACTION_NOTE } from './reaction.js';
import { escapeText } from './cartoon.js';
import { state, setState, laneEntries } from './app.js';

// How long one stage takes to play, in seconds.
const STAGE_SECONDS = 5.5;

// Where the timeline rests before Play: just past the enzyme's entrance, so
// the piece is already on stage rather than the vacuum looking empty.
const IDLE_AT = 0.2;

let mounted = null;
let mountedTimer = null;

function verb(entry) {
  const a = entry.action;
  const g = groupMeta(a.group).label;
  if (a.op === 'add') return `puts a ${g} on`;
  if (a.op === 'remove') return `takes a ${g} off`;
  if (a.op === 'join') return `joins groups into a ${g}`;
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
  return `<p class="tally regions">Ribbons on the body: ${sites
    .map((x) => `${escapeText(x.label)} (${x.region})`)
    .join(', ')} — helices red, sheets amber, loops green.</p>`;
}

function caption(stage, run) {
  const { entry, molIn, result } = stage;
  const cof = entry.cofactor && entry.cofactor !== 'none' ? ` Helper: ${escapeText(entry.cofactor)}.` : '';
  const head = `<div class="beat-step">Stage ${stage.index + 1} of ${run.stages.length} · ${escapeText(entry.name)}</div>
    <h2>${escapeText(entry.name)} ${escapeText(verb(entry))}</h2>`;
  if (!result.ok) {
    return `${head}
      ${regionLine(entry)}
      <p class="refused">${escapeText(result.stallReason)}</p>
      <p>Nothing docks. The jaw never shuts, and the run stops here rather than passing the molecule along.</p>`;
  }
  const tally = formulaTally(buildStructure(result.product));
  return `${head}
    ${regionLine(entry)}
    <p>In: ${escapeText(describe(molIn))}. Out: ${escapeText(describe(result.product))}.${cof}</p>
    <p class="tally">Drawn as ${escapeText(tally)}.</p>`;
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
    <div class="home-lane" aria-label="The lane">${entries.length ? chips : '<span class="home-chip empty">The lane is empty</span>'}</div>
    <div class="home-control-actions">
      ${(state.demo?.routes ?? [])
        .map((r) => `<button class="btn small ghost" data-demo="${r.id}">${escapeText(r.title)}</button>`)
        .join('')}
      <button class="btn small" data-go="bench">Edit this lane on the bench</button>
    </div>
  </div>`;
}

function STARTER_OPTIONS() {
  // molecules.js owns the list; this only needs id and label.
  return STARTERS_CACHE;
}
let STARTERS_CACHE = [];

export function unmountHome() {
  if (!mounted) return;
  mounted.cleanup();
  mounted = null;
  document.body.classList.remove('home-mode');
}

/* ---------- labels, drawn over the canvas with leader lines ---------- */

function labelSet(stage, t, sub, scene) {
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
    out.push({
      id: 'flyer',
      text: a.op === 'add' ? `${g} going on` : `${g} coming off`,
      detail: a.op === 'add' ? 'Handed over and fixed to the molecule.' : 'Cut free and released into the vacuum.',
      object: sub.flyer,
      hot: true,
    });
  }
  if (stage.result.ok && sub.product?.visible) {
    out.push({
      id: 'product',
      text: `Product · ${prettyCore(stage.result.product.core)}`,
      detail: stage.last ? describe(stage.result.product) : 'On its way to the next enzyme.',
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

function drawLabels(stage, t) {
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

  for (const an of labelSet(stage, t, sub, scene)) {
    const p = scene.project(an.object);
    if (!p.visible) continue;
    seen.add(an.id);
    let el = layer.querySelector(`[data-label="${an.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'home-label';
      el.dataset.label = an.id;
      layer.appendChild(el);
    }
    el.classList.toggle('hot', !!an.hot);
    const html = `<strong>${escapeText(an.text)}</strong><span>${escapeText(an.detail)}</span>`;
    if (el._html !== html) {
      el.innerHTML = html;
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

  // Settle overlaps top to bottom.
  placed.sort((m, n) => m.ly - n.ly);
  for (let i = 0; i < placed.length; i++) {
    const m = placed[i];
    m.ly = Math.max(16, m.ly);
    for (let j = 0; j < i; j++) {
      const n = placed[j];
      if (Math.abs(n.lx - m.lx) < 205 && m.ly < n.ly + n.hgt + 8) m.ly = n.ly + n.hgt + 8;
    }
  }
  let lines = '';
  for (const m of placed) {
    const ly = Math.min(h - m.hgt - 12, m.ly);
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

export async function renderHome(root) {
  const entries = laneEntries();
  const signature = `${state.starterId}|${state.lane.join(',')}`;
  if (mounted && mounted.signature === signature && root.contains(mounted.root)) return;
  const wasPlaying = mounted?.playing;
  unmountHome();
  document.body.classList.add('home-mode');

  const { STARTERS } = await import('../model/molecules.js');
  STARTERS_CACHE = STARTERS.map((s) => ({ id: s.id, label: s.label }));

  const run = runPipeline(starter(state.starterId), entries);
  const stages = playable(run);

  root.innerHTML = `<div class="home">
    <div class="home-stage">
      <canvas class="home-canvas" aria-label="3D cartoon of the lane running"></canvas>
      <div class="home-fallback" hidden></div>
      <svg class="home-leaders" aria-hidden="true"></svg>
      <div class="home-labels"></div>
      <div class="home-vignette" aria-hidden="true"></div>
      <div class="home-caption"></div>
      <div class="home-progress"><div class="home-progress-bar"></div></div>
      <div class="home-scene-note" role="note"></div>
    </div>
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
  try {
    const mod = await import('./three-scene.js');
    const made = mod.createFoundryScene(canvas);
    if (made.ok) {
      scene = made;
      note.textContent = mod.SCENE_NOTE;
      note.title = `${mod.SCENE_NOTE_LONG} ${REACTION_NOTE}`;
    }
  } catch (err) {
    console.warn('3D scene unavailable, falling back to the flat cartoon', err);
  }
  if (!root.contains(homeEl)) {
    scene?.dispose();
    return;
  }
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

  const empty = () => {
    captionEl.innerHTML = `<div class="home-card">
      <div class="hero-kicker">A classroom cartoon, in 3D</div>
      <h1 class="hero-title">Nano Foundry</h1>
      <p class="hero-sub">Put enzymes in a lane and press Play once: the molecule goes down the chain,
      each enzyme acting on what the one before it left.</p>
      <p>The lane is empty. Load one of the seeded routes below, or build your own on the bench.</p>
      <p class="caveat">${escapeText(CARTOON_PHYSICS_NOTE)}</p>
    </div>`;
  };

  function showStage(i) {
    const stage = stages[i];
    if (!stage) return;
    current = i;
    captionEl.innerHTML = `<div class="home-card">${caption(stage, run)}</div>`;
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
      captionEl.insertAdjacentHTML(
        'beforeend',
        `<div class="home-card ruled-out"><div class="beat-step">The run stops here</div>
          <p>Stages after this one never got the molecule. ${escapeText(CARTOON_PHYSICS_NOTE)}</p></div>`,
      );
    } else if (lastStage) {
      captionEl.insertAdjacentHTML(
        'beforeend',
        `<div class="home-card"><div class="beat-step">End of the run</div>
          <h2>Out comes ${escapeText(describe(run.product ?? lastStage.result.product))}</h2>
          <p class="caveat">${escapeText(CARTOON_PHYSICS_NOTE)}</p></div>`,
      );
    }
  }

  function play() {
    if (!stages.length) return;
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

  function tick(dt) {
    if (!playing) return;
    at = Math.min(stages.length, at + dt / STAGE_SECONDS);
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
  } else {
    showStage(0);
    at = IDLE_AT;
    if (scene) scene.setProgress(IDLE_AT);
  }

  let lastNow = performance.now();
  if (scene) {
    scene.resize();
    scene.onFrame(() => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      tick(dt);
      const i = Math.min(stages.length - 1, Math.floor(at));
      if (stages[i]) drawLabels(stages[i], Math.min(1, at - i));
    });
  } else {
    // No WebGL: step the flat cartoon through the same chain on a timer.
    const id = setInterval(() => tick(0.25), 250);
    mountedTimer = id;
  }

  /* --- input --- */

  let drag = null;
  const down = (e) => {
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

  homeEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-play]')) {
      if (playing) stop();
      else play();
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      setState({ screen: go.dataset.go });
      return;
    }
    const demo = e.target.closest('[data-demo]');
    if (demo) {
      const route = (state.demo?.routes ?? []).find((r) => r.id === demo.dataset.demo);
      if (route) setState({ starterId: route.starter, lane: [...route.lane], playStage: null });
    }
  });

  homeEl.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-starter]');
    if (sel) setState({ starterId: sel.value });
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
      if (mountedTimer) clearInterval(mountedTimer);
      mountedTimer = null;
      scene?.dispose();
    },
  };
  window.__foundryHome = { scene, stages, play, tick };
  if (wasPlaying || state.autoPlayHome) play();
}

