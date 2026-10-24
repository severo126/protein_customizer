// The home screen: a dark vacuum the reader scrolls through.
//
// Each chapter is one stage of a short lane, run by the same runStage the bench
// uses, so the picture can only show what the rules did. Scrolling drives the
// camera and the choreography; dragging looks around. Leader lines point at the
// parts doing the work: the lobes, the ribbons from the entry's own region
// labels, the active site, and the group that is going on or coming off.
//
// When WebGL is missing the same chapters play as the flat SVG cartoon instead.

import { runStage } from '../model/pipeline.js';
import { starter, groupMeta, prettyCore, describe } from '../model/molecules.js';
import { CARTOON_PHYSICS_NOTE } from '../model/disclaimers.js';
import { reactionScene, REACTION_NOTE } from './reaction.js';
import { escapeText } from './cartoon.js';
import { state, setState } from './app.js';

// A lane that puts groups on and takes one off again, then a refusal, so every
// kind of ending is on the page.
const LANE = [
  { starter: 'glucose', enzyme: 'hexokinase' },
  { enzyme: 'gpat' },
  { enzyme: 'lipase' },
  { starter: 'glycerol', enzyme: 'glucose-isomerase' },
];

let mounted = null; // { root, scene, chapters, cleanup }

function buildChapters() {
  const out = [];
  let mol = null;
  for (const step of LANE) {
    const entry = state.byId.get(step.enzyme);
    if (!entry) continue;
    const molIn = step.starter ? starter(step.starter) : mol;
    const result = runStage(molIn, entry);
    out.push({ entry, molIn, result });
    mol = result.ok ? result.product : molIn;
  }
  return out;
}

function verb(entry) {
  const a = entry.action;
  const g = groupMeta(a.group).label;
  if (a.op === 'add') return `puts a ${g} on`;
  if (a.op === 'remove') return `takes a ${g} off`;
  if (a.op === 'join') return `joins groups into a ${g}`;
  return `rearranges the skeleton`;
}

function beats(ch, i) {
  const { entry, molIn, result } = ch;
  const a = entry.action;
  const g = groupMeta(a.group).label;
  const sites = entry.domain?.sites ?? [];
  const regionLine = sites.map((s) => `${escapeText(s.label)} (${s.region})`).join(', ');
  const cof = entry.cofactor && entry.cofactor !== 'none' ? ` It leans on ${escapeText(entry.cofactor)} as a helper.` : '';
  const first =
    i === 0
      ? `<div class="hero-kicker">A classroom cartoon, in 3D</div>
         <h1 class="hero-title">Nano Foundry</h1>
         <p class="hero-sub">Scroll through the vacuum and watch cartoon enzymes put groups on a molecule and take them off again. Drag to look around.</p>`
      : '';
  const out = [
    `${first}<div class="beat-step">Stage ${i + 1} · ${escapeText(entry.name)}</div>
     <h2>${escapeText(entry.name)} ${escapeText(verb(entry))}</h2>
     <p>${escapeText(entry.blurb)}</p>`,
    `<div class="beat-step">The parts</div>
     <h2>Two lobes and a cleft</h2>
     <p>The body is two metal lobes with a cleft between them. The coloured ribbons are this entry's own regions: ${regionLine}. Helices are red coils, sheets amber arrows, loops green threads.</p>`,
  ];
  if (result.ok) {
    out.push(
      `<div class="beat-step">The hand-off</div>
       <h2>${escapeText(prettyCore(molIn.core))} seats and the jaw shuts</h2>
       <p>${
         a.op === 'add'
           ? `Watch the glowing ${escapeText(g)} fly in from the side and lock on at the active site ring.${cof}`
           : a.op === 'remove'
             ? `Watch the ${escapeText(g)} break away from the molecule at the active site ring and drift off into the dark.${cof}`
             : `The active site ring flares while the groups are rearranged.${cof}`
       }</p>`,
      `<div class="beat-step">Released</div>
       <h2>Out comes ${escapeText(describe(result.product))}</h2>
       <p>The jaw opens and the product drifts out${i < LANE.length - 1 ? ', on its way to the next stage' : ''}.</p>`,
    );
  } else {
    out.push(
      `<div class="beat-step">Refused</div>
       <h2>The cleft will not take it</h2>
       <p>${escapeText(result.stallReason)} Nothing docks, and the toy says so rather than passing it along.</p>`,
      `<div class="beat-step">That is the whole run</div>
       <h2>Build your own lane</h2>
       <p>Every stage here came from the same rules as the bench. <button class="btn primary home-cta" data-go="bench">Open the bench</button></p>
       <p class="caveat">${escapeText(CARTOON_PHYSICS_NOTE)}</p>`,
    );
  }
  return out;
}

function labelSet(ch, t, sub) {
  // Which labels show depends on where in the chapter the reader is: anatomy
  // first, then the chemistry, then the product.
  const anchors = mounted.scene.labelAnchors();
  const a = ch.entry.action;
  const g = groupMeta(a.group).label;
  const out = [];
  for (const an of anchors) {
    if (an.id === 'site') {
      an.text = a.op === 'add' ? `Active site · puts the ${g} on here` : a.op === 'remove' ? `Active site · takes the ${g} off here` : `Active site`;
    }
    const anatomy = an.id === 'upper' || an.id === 'lower' || an.id.startsWith('ribbon');
    if (t < 0.36 && anatomy) out.push(an);
    if (t >= 0.14 && t < 0.36 && an.id === 'cleft') out.push(an);
    if (t >= 0.36 && t < 0.86 && an.id === 'site') out.push(an);
  }
  if (sub.flyer?.visible && t > 0.5 && t < 0.86) {
    out.push({
      id: 'flyer',
      text: a.op === 'add' ? `${g} going on` : `${g} coming off`,
      detail: a.op === 'add' ? 'Handed over from a donor and fixed to the molecule.' : 'Cut free and released into the vacuum.',
      object: sub.flyer,
      hot: true,
    });
  }
  if (t >= 0.82 && ch.result.ok && sub.product?.visible) {
    out.push({ id: 'product', text: `Product · ${prettyCore(ch.result.product.core)}`, detail: describe(ch.result.product), object: sub.product });
  }
  if (!ch.result.ok && t > 0.45) {
    out.push({ id: 'molecule', text: `${prettyCore(ch.molIn.core)} · refused`, detail: 'It never seats in the cleft.', object: sub.molecule, hot: true });
  }
  return out;
}

function drawLabels(ch, t) {
  const { scene, root } = mounted;
  const sub = scene.subject;
  const layer = root.querySelector('.home-labels');
  const svg = root.querySelector('.home-leaders');
  if (!sub || !layer) return;
  const w = layer.clientWidth;
  const h = layer.clientHeight;
  const cx = w > 900 ? w * 0.63 : w * 0.5;
  const cy = h * 0.5;
  const list = labelSet(ch, t, sub);
  const seen = new Set();
  const placed = [];
  // Keep labels off the story cards on the left of a wide screen.
  const minX = w > 900 ? Math.min(500, w * 0.36) : 12;
  for (const an of list) {
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
    // Push the label outward from the middle of the subject so the lines fan.
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
  // Settle overlaps: walk top to bottom and push a label down past any
  // earlier one it would sit on.
  placed.sort((m, n) => m.ly - n.ly);
  for (let i = 0; i < placed.length; i++) {
    const m = placed[i];
    m.ly = Math.max(20, m.ly);
    for (let j = 0; j < i; j++) {
      const n = placed[j];
      if (Math.abs(n.lx - m.lx) < 205 && m.ly < n.ly + n.hgt + 8) m.ly = n.ly + n.hgt + 8;
    }
  }
  let lines = '';
  for (const m of placed) {
    const ly = Math.min(h - m.hgt - 16, m.ly);
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

export function unmountHome() {
  if (!mounted) return;
  mounted.cleanup();
  mounted = null;
  document.body.classList.remove('home-mode');
}

export async function renderHome(root) {
  if (mounted && mounted.root.isConnected && root.contains(mounted.root)) return;
  unmountHome();
  document.body.classList.add('home-mode');

  const chapters = buildChapters();
  const beatHtml = chapters
    .map(
      (ch, i) => `<section class="home-chapter" data-chapter="${i}">
        ${beats(ch, i).map((b) => `<div class="home-beat"><div class="home-card">${b}</div></div>`).join('')}
      </section>`,
    )
    .join('');

  root.innerHTML = `<div class="home">
    <div class="home-stage">
      <canvas class="home-canvas" aria-label="3D cartoon of the current enzyme and molecule"></canvas>
      <div class="home-fallback" hidden></div>
      <svg class="home-leaders" aria-hidden="true"></svg>
      <div class="home-labels"></div>
      <div class="home-vignette" aria-hidden="true"></div>
      <div class="home-scene-note" role="note"></div>
      <nav class="home-rail" aria-label="Chapters">
        ${chapters.map((ch, i) => `<button data-jump="${i}" title="${escapeText(ch.entry.name)}"><span>${escapeText(ch.entry.name)}</span></button>`).join('')}
      </nav>
      <div class="home-scrollhint">Scroll</div>
    </div>
    <div class="home-track">${beatHtml}</div>
  </div>`;

  const homeEl = root.querySelector('.home');
  const canvas = homeEl.querySelector('.home-canvas');
  const note = homeEl.querySelector('.home-scene-note');
  const track = homeEl.querySelector('.home-track');
  const rail = [...homeEl.querySelectorAll('.home-rail button')];
  const topbar = document.querySelector('.topbar');
  const setTop = () => document.documentElement.style.setProperty('--topbar-h', `${topbar?.offsetHeight ?? 0}px`);
  setTop();

  let scene = null;
  try {
    const mod = await import('./three-scene.js');
    const made = mod.createFoundryScene(canvas);
    if (made.ok) {
      scene = made;
      note.textContent = `${mod.SCENE_NOTE} ${REACTION_NOTE}`;
    }
  } catch (err) {
    console.warn('3D scene unavailable, falling back to the flat cartoon', err);
  }
  if (!root.contains(homeEl)) {
    scene?.dispose();
    return;
  }

  let chapter = -1;
  let target = 0;
  let shown = 0;
  const fallback = homeEl.querySelector('.home-fallback');

  if (!scene) {
    canvas.hidden = true;
    fallback.hidden = false;
    note.textContent = `This browser has no WebGL, so the flat cartoon plays instead. ${REACTION_NOTE}`;
  }

  function readScroll() {
    const rect = track.getBoundingClientRect();
    const total = track.offsetHeight - window.innerHeight;
    const p = Math.min(0.99999, Math.max(0, -rect.top / Math.max(1, total)));
    const f = p * chapters.length;
    const idx = Math.floor(f);
    target = f - idx;
    if (idx !== chapter) {
      chapter = idx;
      const ch = chapters[idx];
      rail.forEach((b, i) => b.toggleAttribute('aria-current', i === idx));
      if (scene) {
        scene.setSubject(ch.entry, ch.molIn, ch.result);
        homeEl.querySelector('.home-labels').innerHTML = '';
        shown = target;
      } else {
        fallback.innerHTML = reactionScene(ch.entry, ch.molIn);
      }
    }
    homeEl.querySelector('.home-scrollhint').classList.toggle('gone', p > 0.01);
  }

  if (scene) {
    scene.resize();
    scene.onFrame(() => {
      shown += (target - shown) * 0.12;
      scene.setProgress(shown);
      if (chapter >= 0) drawLabels(chapters[chapter], shown);
    });
  }

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
    readScroll();
  };
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', onResize);

  homeEl.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      const sec = track.querySelector(`[data-chapter="${jump.dataset.jump}"]`);
      window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY + 2, behavior: 'smooth' });
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      window.scrollTo(0, 0);
      setState({ screen: go.dataset.go });
    }
  });

  mounted = {
    root: homeEl,
    scene,
    chapters,
    cleanup() {
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('resize', onResize);
      scene?.dispose();
    },
  };
  // Exposed for screenshots and for poking at in the console.
  window.__foundryHome = { scene, chapters, readScroll };
  readScroll();
}
