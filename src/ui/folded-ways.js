// One line on the landing screen, for the one place the nav cannot point at.
//
// This row used to carry three links, because the bench and the workstation
// had no tab and would otherwise have been unreachable from the front door.
// Both have tabs again, so two of the three became a second copy of the nav,
// three lines below it. They are gone.
//
// What is left has no tab and cannot have one: the chain player is a step
// inside the make-a-molecule flow rather than a screen, and you would normally
// only reach it by finishing a search. The pitch is built around the seeded
// runs it holds — including the stage that refuses — so there is one way
// straight to it.

import { escapeText } from './cartoon.js';

export const FOLDED_WAYS = [
  {
    go: 'run',
    step: true,
    label: 'Play a seeded run',
    blurb: 'The chain player, including the stage that refuses.',
  },
];

export function foldedWays() {
  const items = FOLDED_WAYS.map(
    (w) =>
      `<li><button class="btn small ghost" ${w.step ? `data-step="run"` : `data-go="${w.go}"`}>${escapeText(w.label)}</button>
        <span>${escapeText(w.blurb)}</span></li>`,
  ).join('');
  return `<div class="folded-ways">
    <ul>${items}</ul>
  </div>`;
}
