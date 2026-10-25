// The ways into the screens that lost their tabs.
//
// The bench and the workstation still render, unchanged, but the nav is three
// tabs now and neither of them is one. Without this they would only be
// reachable from the run step, which you can only get to by finishing a
// search — so a judge following the demo script from the front door would be
// stuck, and the bench's one-press run and its mid-run refusal are the two
// things the pitch deck is built around.
//
// One row, on every step of the flow, saying plainly that both are still there
// and what each is for. Quiet on purpose: naming the molecule is the front door
// now, and this is the door beside it rather than a second front door.

import { escapeText } from './cartoon.js';

export const FOLDED_WAYS = [
  {
    go: 'run',
    step: true,
    label: 'Build a lane by hand',
    blurb: 'The chain player with the seeded demo runs, including the stage that refuses.',
  },
  {
    go: 'bench',
    label: 'The bench',
    blurb: 'Pick the stages yourself, press the run once, and read the traffic lights.',
  },
  {
    go: 'workstation',
    label: 'The workstation',
    blurb: 'Look the catalogue up by the behaviour you want instead of by name.',
  },
];

export function foldedWays() {
  const items = FOLDED_WAYS.map(
    (w) =>
      `<li><button class="btn small ghost" ${w.step ? `data-step="run"` : `data-go="${w.go}"`}>${escapeText(w.label)}</button>
        <span>${escapeText(w.blurb)}</span></li>`,
  ).join('');
  return `<div class="folded-ways">
    <h2>Still here, if you would rather drive it yourself</h2>
    <ul>${items}</ul>
  </div>`;
}
