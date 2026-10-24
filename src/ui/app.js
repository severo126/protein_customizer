// App shell: load the fixed catalogue, route between the three screens, and
// keep the "what this can't tell you" panel reachable from all of them.

import { renderCatalogue } from './catalogue-view.js';
import { renderBench } from './bench-view.js';
import { renderSplice } from './splice-view.js';
import { renderWorkstation } from './workstation-view.js';
import { renderPlatform } from './platform-view.js';
import { NOT_CHECKED, CARTOON_PHYSICS_NOTE } from '../model/disclaimers.js';
import { closeReaction } from './reaction.js';

export const state = {
  catalogue: null,
  byId: new Map(),
  screen: 'catalogue',
  // workstation: the behaviours asked for, as {kind, arg} picked off the
  // catalogue-derived vocabulary. Never anything the user typed in free text.
  wants: [],
  // bench
  starterId: 'glucose',
  lane: [],
  // which stage the reaction cartoon is playing; null follows the last stage
  playStage: null,
  // the enzyme list filters itself against the lane unless this is on
  showAllEnzymes: false,
  // the catalogue screen can borrow the same filter
  catalogueFilter: false,
  // splice
  spliceA: null,
  spliceB: null,
  siteA: null,
  siteB: null,
  linker: 6,
  spliceFocus: null,
  demo: null,
};

const screenEl = document.getElementById('screen');

export function setState(patch) {
  Object.assign(state, patch);
  render();
}

export function render() {
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.screen === state.screen) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (state.screen === 'catalogue') renderCatalogue(screenEl);
  else if (state.screen === 'workstation') renderWorkstation(screenEl);
  else if (state.screen === 'bench') renderBench(screenEl);
  else if (state.screen === 'platform') renderPlatform(screenEl);
  else renderSplice(screenEl);
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) {
    closeReaction();
    setState({ screen: tab.dataset.screen });
  }
});

/* ---------- the limits panel, reachable from every screen ---------- */

const dialog = document.getElementById('limits-dialog');
dialog.innerHTML = `<div class="body">
  <h2 id="limits-title">What this can't tell you</h2>
  <p>${CARTOON_PHYSICS_NOTE}</p>
  <p>Nano Foundry is a teaching toy over a fixed list of about 40 commonplace metabolic and
  industrial enzymes. It has no connection to any protein database, no way to add an entry, and it
  emits no sequence of any kind — not in the interface, not in an export, not in its storage.</p>
  <h3 style="font-size:14px">Never checked, on any screen</h3>
  <ul>${NOT_CHECKED.map((l) => `<li>${l}</li>`).join('')}</ul>
  <p style="font-size:12.5px;color:var(--ink-faint)">A pass is the absence of a red flag from a
  cartoon. There is no "validated" or "approved" state in this app, and a construct that clears every
  filter is only ever reported as "Nothing here ruled this out".</p>
  <div class="close-row"><button class="btn primary" id="limits-close">Back to the workshop</button></div>
</div>`;
document.getElementById('limits-button').addEventListener('click', () => dialog.showModal());
dialog.addEventListener('click', (e) => {
  if (e.target.id === 'limits-close') dialog.close();
});

/* ---------- boot ---------- */

async function boot() {
  screenEl.innerHTML = `<div class="empty">Loading the catalogue…</div>`;
  const [res, demoRes] = await Promise.all([fetch('src/data/catalogue.json'), fetch('src/data/demo.json')]);
  const catalogue = await res.json();
  state.demo = await demoRes.json();
  state.catalogue = catalogue;
  state.byId = new Map(catalogue.entries.map((e) => [e.id, e]));
  state.spliceA = catalogue.entries.find((e) => e.id === 'lipase') ?? catalogue.entries[0];
  state.spliceB = catalogue.entries.find((e) => e.id === 'alpha-amylase') ?? catalogue.entries[1];
  state.siteA = state.spliceA.domain.sites[0].id;
  state.siteB = state.spliceB.domain.sites[0].id;
  render();
}

export function entry(id) {
  return state.byId.get(id);
}

export function laneEntries() {
  return state.lane.map((id) => entry(id)).filter(Boolean);
}

boot().catch((err) => {
  screenEl.innerHTML = `<div class="panel" style="padding:16px">
    <h2>Could not load the catalogue</h2>
    <p class="empty">${String(err)}. The catalogue is a static file in this repository; serve the
    folder over HTTP (<code>npm run serve</code>) rather than opening the file directly.</p></div>`;
});
