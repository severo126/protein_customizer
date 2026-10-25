// The reaction scene: a play-through cartoon of one enzyme meeting one
// molecule.
//
// It is built from the same deterministic rule the bench runs, so the scene
// can only ever show what runStage actually did — including a refusal, which
// gets its own ending rather than being smoothed over. The geometry is
// invented: a substrate riding into a hinged cleft is a teaching picture of
// induced fit, not a trajectory, and the timings are chosen to be watchable
// rather than to mean anything. Nothing here is a rate, a mechanism or a
// structure.

import { enzymeBody, moleculeGlyph, escapeText } from './cartoon.js';
import { groupMeta, prettyCore, describe } from '../model/molecules.js';
import { runStage } from '../model/pipeline.js';

export const REACTION_NOTE =
  'A cartoon of induced fit at made-up speed. The order of events comes from the rule the bench ran; the motion, the shapes and the timing are invented.';

const W = 620;
const H = 252;

// Scene anchors. The piece is drawn mirrored so its cleft faces the incoming
// molecule, and the molecule rides a straight track into it.
const PIECE = { x: 330, y: 50, scale: 1.6 };
const DOCK = { x: 365, y: 130 }; // inside the jaw's V, in scene coordinates
const TRACK_Y = DOCK.y;
const START_X = 56;
const BACK_OUT = { x: 344, y: 174 };
const EXIT = { x: 562, y: 196 };
const DONOR = { x: 150, y: 212 };

let sceneCounter = 0;

// --- timelines, in milliseconds ---
const RUN = { approach: 1100, dock: 1900, transfer: 2650, open: 3400, out: 4500, total: 5600 };
const REFUSE = { approach: 1100, bump: 1700, back: 2500, total: 3600 };

export const FREEZE_FRAMES = { approach: 700, dock: 1700, transfer: 2650, release: 4000 };

function keyframes(name, total, stops) {
  const body = stops
    .map(([ms, decl]) => `${((ms / total) * 100).toFixed(2)}%{${decl}}`)
    .join('');
  return `@keyframes ${name}{${body}}`;
}

function glyphAt(mol, size) {
  const half = size / 2;
  return `<g transform="translate(${-half} ${-half}) scale(${(size / 100).toFixed(4)})">${moleculeGlyph(mol)}</g>`;
}

function marble(group, r = 13) {
  const meta = groupMeta(group);
  return `<g>
    <circle cy="3" r="${r}" fill="#0c0f33" opacity="0.85"/>
    <circle r="${r}" fill="hsl(${meta.hue} 78% 60%)" stroke="hsl(${meta.hue} 85% 84%)" stroke-width="1.6"/>
    <text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="#1b1240">${meta.symbol}</text>
  </g>`;
}

// What the scene has to show, phase by phase, for each kind of action.
function script(entry, molIn, result) {
  const a = entry.action;
  const cofactor = entry.cofactor && entry.cofactor !== 'none' ? entry.cofactor : null;

  if (!result.ok) {
    return {
      ok: false,
      timing: REFUSE,
      captions: [
        [0, `${entry.name} is holding its cleft open and ${prettyCore(molIn.core)} drifts in.`],
        [REFUSE.approach, 'The cleft will not take it. Nothing docks.'],
        [REFUSE.back, result.stallReason],
      ],
    };
  }

  const captions = [[0, `${prettyCore(molIn.core)} drifts towards the open cleft of ${entry.name}.`]];
  captions.push([RUN.approach, 'It seats in the cleft and the jaw closes over it — the cartoon of induced fit.']);

  if (a.op === 'add') {
    captions.push([RUN.dock, `A ${groupMeta(a.group).label} comes off ${cofactor ?? 'the donor'} and is handed onto the substrate.`]);
  } else if (a.op === 'remove') {
    captions.push([RUN.dock, `The ${groupMeta(a.group).label} is cut off and leaves the cleft${a.yields ? `, leaving a ${groupMeta(a.yields).label} behind` : ''}.`]);
  } else if (a.op === 'rearrange') {
    captions.push([RUN.dock, `The skeleton is turned over: ${prettyCore(a.from)} becomes ${prettyCore(a.to)}.`]);
  } else {
    captions.push([RUN.dock, `Two groups already on the molecule are pulled together into a ${groupMeta(a.group).label}.`]);
  }

  captions.push([RUN.open, 'The jaw opens and the product leaves.']);
  captions.push([RUN.out, 'The enzyme is unchanged and ready for the next one. This toy counts nothing about how often that happens.']);

  return { ok: true, timing: RUN, captions, cofactor };
}

/**
 * One scene. `freeze` is a millisecond offset (or a FREEZE_FRAMES key) that
 * pauses the animation on that frame, which is how the committed screenshots
 * catch the middle of a reaction.
 */
export function reactionScene(entry, molIn, { freeze = null, width = W } = {}) {
  sceneCounter += 1;
  const id = `r${sceneCounter}`;
  const result = runStage(molIn, entry);
  const plan = script(entry, molIn, result);
  const T = plan.timing.total;
  const a = entry.action;

  const freezeMs = typeof freeze === 'string' ? FREEZE_FRAMES[freeze] ?? 0 : freeze;
  const paused = freezeMs !== null && freezeMs !== undefined;
  const anim = (name, extra = '') =>
    `animation:${name} ${T}ms linear both${extra ? ` ${extra}` : ''};` +
    (paused ? `animation-delay:${-Math.min(freezeMs, T - 1)}ms;animation-play-state:paused;` : '');

  const rules = [];

  /* the molecule going in */
  rules.push(
    keyframes(`${id}-in`, T, plan.ok
      ? [
          [0, `transform:translate(${START_X}px,${TRACK_Y}px) scale(0.86);opacity:0`],
          [260, `opacity:1`],
          [plan.timing.approach, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1)`],
          [plan.timing.transfer - 150, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1);opacity:1`],
          [plan.timing.transfer + 150, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1);opacity:0`],
          [T, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1);opacity:0`],
        ]
      : [
          [0, `transform:translate(${START_X}px,${TRACK_Y}px) scale(0.86);opacity:0`],
          [260, `opacity:1`],
          [plan.timing.approach, `transform:translate(${DOCK.x - 66}px,${TRACK_Y}px) scale(1)`],
          [plan.timing.bump, `transform:translate(${DOCK.x - 50}px,${TRACK_Y}px) scale(1) rotate(-8deg)`],
          [plan.timing.back, `transform:translate(${DOCK.x - 136}px,${TRACK_Y + 10}px) scale(0.95) rotate(6deg)`],
          [T, `transform:translate(${DOCK.x - 182}px,${TRACK_Y + 16}px) scale(0.92) rotate(2deg);opacity:0.85`],
        ]),
  );

  /* the product coming out */
  if (plan.ok) {
    rules.push(
      keyframes(`${id}-out`, T, [
        [0, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(0.9);opacity:0`],
        [plan.timing.transfer - 150, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(0.9);opacity:0`],
        [plan.timing.transfer + 150, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1.06);opacity:1`],
        [plan.timing.open, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1);opacity:1`],
        [plan.timing.open + 450, `transform:translate(${BACK_OUT.x}px,${BACK_OUT.y}px) scale(1);opacity:1`],
        [plan.timing.out, `transform:translate(${EXIT.x}px,${EXIT.y}px) scale(1);opacity:1`],
        [T, `transform:translate(${EXIT.x}px,${EXIT.y}px) scale(1);opacity:1`],
      ]),
    );
  }

  /* the jaw: open, shut over the substrate, open again */
  const jaw = (sign) =>
    keyframes(`${id}-jaw${sign > 0 ? 'a' : 'b'}`, T, plan.ok
      ? [
          [0, `transform:rotate(0deg)`],
          [plan.timing.approach, `transform:rotate(0deg)`],
          [plan.timing.dock, `transform:rotate(${sign * 7}deg)`],
          [plan.timing.open, `transform:rotate(${sign * 7}deg)`],
          [plan.timing.open + 400, `transform:rotate(${-sign * 1.5}deg)`],
          [T, `transform:rotate(0deg)`],
        ]
      : [
          [0, `transform:rotate(0deg)`],
          [plan.timing.approach, `transform:rotate(0deg)`],
          [plan.timing.bump, `transform:rotate(${sign * 2.5}deg)`],
          [plan.timing.back, `transform:rotate(0deg)`],
          [T, `transform:rotate(0deg)`],
        ]);
  rules.push(jaw(1), jaw(-1));

  /* the active site, lit while something is in it */
  rules.push(
    keyframes(`${id}-glow`, T, [
      [0, 'opacity:0.2;transform:scale(1)'],
      [plan.timing.approach, 'opacity:0.35;transform:scale(1.1)'],
      [plan.ok ? plan.timing.transfer : plan.timing.bump, plan.ok ? 'opacity:0.95;transform:scale(1.8)' : 'opacity:0.5;transform:scale(1.2)'],
      [plan.ok ? plan.timing.open : plan.timing.back, 'opacity:0.3;transform:scale(1)'],
      [T, 'opacity:0.2;transform:scale(1)'],
    ]),
  );

  /* the transferred group, and the donor it came from */
  let flyer = '';
  let donor = '';
  if (plan.ok && a.op === 'add') {
    rules.push(
      keyframes(`${id}-fly`, T, [
        [0, `transform:translate(${DONOR.x}px,${DONOR.y}px) scale(0.6);opacity:0`],
        [plan.timing.dock, `transform:translate(${DONOR.x}px,${DONOR.y}px) scale(1);opacity:1`],
        [plan.timing.transfer, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1);opacity:1`],
        [plan.timing.transfer + 220, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(0.3);opacity:0`],
        [T, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(0.3);opacity:0`],
      ]),
    );
    flyer = `<g style="${anim(`${id}-fly`)}">${marble(a.group)}</g>`;
  } else if (plan.ok && a.op === 'remove') {
    rules.push(
      keyframes(`${id}-fly`, T, [
        [0, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(0.3);opacity:0`],
        [plan.timing.transfer, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1);opacity:1`],
        [plan.timing.out, `transform:translate(${DONOR.x + 40}px,${DONOR.y - 6}px) scale(0.9);opacity:1`],
        [T, `transform:translate(${DONOR.x + 10}px,${DONOR.y + 2}px) scale(0.85);opacity:0.9`],
      ]),
    );
    flyer = `<g style="${anim(`${id}-fly`)}">${marble(a.group)}</g>`;
  } else if (plan.ok && a.op === 'join') {
    for (const [i, g] of (a.requires ?? []).slice(0, 2).entries()) {
      const from = i === 0 ? -1 : 1;
      rules.push(
        keyframes(`${id}-fly${i}`, T, [
          [0, `transform:translate(${DOCK.x - 78}px,${TRACK_Y + from * 54}px) scale(0.5);opacity:0`],
          [plan.timing.dock, `transform:translate(${DOCK.x - 78}px,${TRACK_Y + from * 54}px) scale(1);opacity:1`],
          [plan.timing.transfer, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(1);opacity:1`],
          [plan.timing.transfer + 220, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(0.3);opacity:0`],
          [T, `transform:translate(${DOCK.x}px,${TRACK_Y}px) scale(0.3);opacity:0`],
        ]),
      );
      flyer += `<g style="${anim(`${id}-fly${i}`)}">${marble(g, 11)}</g>`;
    }
  }

  if (plan.cofactor) {
    rules.push(
      keyframes(`${id}-donor`, T, [
        [0, 'opacity:0.55'],
        [plan.timing.dock, 'opacity:1'],
        [plan.timing.transfer, a.op === 'add' ? 'opacity:0.4' : 'opacity:0.8'],
        [T, 'opacity:0.5'],
      ]),
    );
    donor = `<g style="${anim(`${id}-donor`)}" transform="translate(${DONOR.x} ${DONOR.y})">
      <rect x="-96" y="-15" width="170" height="30" rx="15" fill="#0f1333" stroke="#4652a8" stroke-width="1.5"/>
      <text x="-40" y="4.5" text-anchor="middle" font-size="12" fill="#eceefb">${escapeText(plan.cofactor)}</text>
    </g>`;
  }

  /* a burst at the moment the rule fires */
  if (plan.ok) {
    rules.push(
      keyframes(`${id}-spark`, T, [
        [0, 'opacity:0;transform:scale(0.2)'],
        [plan.timing.transfer - 120, 'opacity:0;transform:scale(0.2)'],
        [plan.timing.transfer, 'opacity:0.9;transform:scale(1)'],
        [plan.timing.transfer + 420, 'opacity:0;transform:scale(2.1)'],
        [T, 'opacity:0;transform:scale(2.1)'],
      ]),
    );
  } else {
    rules.push(
      keyframes(`${id}-spark`, T, [
        [0, 'opacity:0;transform:scale(0.4)'],
        [plan.timing.approach, 'opacity:0;transform:scale(0.4)'],
        [plan.timing.bump, 'opacity:1;transform:scale(1)'],
        [T, 'opacity:1;transform:scale(1)'],
      ]),
    );
  }

  /* progress bar and captions */
  rules.push(keyframes(`${id}-bar`, T, [[0, 'transform:scaleX(0)'], [T, 'transform:scaleX(1)']]));
  // Captions cut rather than cross-fade: two sentences stacked at half opacity
  // read as a smear.
  plan.captions.forEach(([at], i) => {
    const next = plan.captions[i + 1]?.[0] ?? T;
    const last = i === plan.captions.length - 1;
    rules.push(
      keyframes(`${id}-cap${i}`, T, [
        [0, 'opacity:0'],
        [Math.max(0, at - 1), 'opacity:0'],
        [at, 'opacity:1'],
        [Math.max(at + 1, next - 1), 'opacity:1'],
        [next, last ? 'opacity:1' : 'opacity:0'],
        [T, last ? 'opacity:1' : 'opacity:0'],
      ]),
    );
  });

  const captionBlock = plan.captions
    .map(([, text], i) => `<p class="reaction-caption" style="${anim(`${id}-cap${i}`)}">${escapeText(text)}</p>`)
    .join('');

  // Mirrored so the cleft faces the incoming molecule.
  const pieceTransform = `translate(${PIECE.x + 100 * PIECE.scale} ${PIECE.y}) scale(${-PIECE.scale} ${PIECE.scale})`;

  return `<style>${rules.join('')}
    #${id} .nf-jaw-top{${anim(`${id}-jawa`)}}
    #${id} .nf-jaw-bottom{${anim(`${id}-jawb`)}}
    #${id} .nf-site-glow{${anim(`${id}-glow`)};transform-origin:62px 50px;transform-box:view-box}
  </style>
  <div class="reaction-scene" id="${id}">
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="Stylised animation: ${escapeText(prettyCore(molIn.core))} meeting ${escapeText(entry.name)}. ${plan.ok ? 'The rule runs.' : 'The stage refuses it.'} Cartoon, not a trajectory.">
      <line x1="0" y1="${TRACK_Y}" x2="${DOCK.x}" y2="${TRACK_Y}" stroke="#333d82" stroke-width="2" stroke-dasharray="7 9"/>
      <g transform="${pieceTransform}">${enzymeBody(entry, { detail: true })}</g>
      ${donor}
      <g transform="translate(${DOCK.x} ${TRACK_Y})">
        <g style="${anim(`${id}-spark`)}">
          ${
            plan.ok
              ? `<circle r="30" fill="none" stroke="#ffc65c" stroke-width="3"/><circle r="19" fill="none" stroke="#ffe3a8" stroke-width="2"/>`
              : `<circle r="23" fill="#2a1416" stroke="#ff6b6b" stroke-width="3"/>
                 <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#ff6b6b" stroke-width="4" stroke-linecap="round"/>`
          }
        </g>
      </g>
      ${flyer}
      <g style="${anim(`${id}-in`)}">${glyphAt(molIn, 74)}</g>
      ${plan.ok ? `<g style="${anim(`${id}-out`)}">${glyphAt(result.product, 74)}</g>` : ''}
      <text x="18" y="22" font-size="11.5" fill="#9298cf">in · ${escapeText(describe(molIn))}</text>
      ${
        plan.ok
          ? `<text x="${W - 18}" y="22" text-anchor="end" font-size="11.5" fill="#9298cf">out · ${escapeText(describe(result.product))}</text>`
          : `<text x="${W - 18}" y="22" text-anchor="end" font-size="11.5" fill="#ff8f8f">no product · the stage stalls</text>`
      }
      <rect x="18" y="${H - 12}" width="${W - 36}" height="5" rx="2.5" fill="#0f1333"/>
      <rect x="18" y="${H - 12}" width="${W - 36}" height="5" rx="2.5" fill="#ffc65c"
        style="${anim(`${id}-bar`)};transform-origin:18px 0;transform-box:view-box"/>
    </svg>
    <div class="reaction-captions">${captionBlock}</div>
  </div>`;
}

// The panel around a scene: the pair it is showing, the play button, and the
// standing note about what the motion is and is not.
export function reactionPanel(entry, molIn, { freeze = null, title = 'Watch the stage run' } = {}) {
  const result = runStage(molIn, entry);
  return `<div class="panel reaction-panel" data-reaction-host>
    <div class="reaction-head">
      <div>
        <strong>${escapeText(title)}</strong>
        <div class="score-note">${escapeText(entry.name)} · ${escapeText(prettyCore(molIn.core))} in${
          result.ok ? '' : ' · refused'
        }</div>
      </div>
      <button class="btn small primary" data-replay>▶ Play again</button>
    </div>
    <div data-reaction-stage>${reactionScene(entry, molIn, { freeze })}</div>
    <div class="cartoon-label">stylised animation — ${escapeText(REACTION_NOTE)}</div>
  </div>`;
}

// Replay by rebuilding the stage, which restarts every animation in it.
export function wireReaction(root) {
  for (const button of root.querySelectorAll('[data-replay]')) {
    button.onclick = () => {
      const host = button.closest('[data-reaction-host]');
      const stage = host?.querySelector('[data-reaction-stage]');
      if (stage) stage.innerHTML = stage.innerHTML;
    };
  }
}

/* ---------- the shared dialog, so any screen can play a pair ---------- */

function dialogEl() {
  return document.getElementById('reaction-dialog');
}

export function openReaction(entry, molIn, title) {
  const dialog = dialogEl();
  if (!dialog) return;
  dialog.innerHTML = `<div class="body">
    ${reactionPanel(entry, molIn, { title: title ?? `${entry.name} meets ${prettyCore(molIn.core)}` })}
    <div class="close-row"><button class="btn primary" data-close-reaction>Back to the catalogue</button></div>
  </div>`;
  wireReaction(dialog);
  dialog.onclick = (e) => {
    if (e.target.closest('[data-close-reaction]')) dialog.close();
  };
  dialog.showModal();
}

export function closeReaction() {
  const dialog = dialogEl();
  if (dialog?.open) dialog.close();
}
