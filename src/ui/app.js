// App shell: load the fixed catalogue, route between the screens, and
// keep the "what this can't tell you" panel reachable from all of them.

import { renderCollection } from './collection-view.js';
import { renderBench } from './bench-view.js';
import { renderSplice } from './splice-view.js';
import { renderWorkstation } from './workstation-view.js';
import { renderHome, unmountHome } from './home-view.js';
import { NOT_CHECKED } from '../model/disclaimers.js';
import { closeReaction } from './reaction.js';

export const state = {
  catalogue: null,
  byId: new Map(),
  screen: 'home',
  // The home screen is a flow rather than one page: say what molecule you
  // want ('ask'), look at the chains that could make it ('routes'), then
  // watch one of them run ('run'). The bench and the workstation no longer
  // have tabs of their own; they are reachable from inside this flow, and
  // every screen they had still renders, so the one-press chain run and the
  // mid-run refusal are where they always were.
  homeStep: 'ask',
  // picker: the transcript, the target as it currently stands, and the one
  // question the parser is allowed to ask. The draft is the only thing the
  // search ever reads, and it is always editable by hand.
  pickerLog: [],
  pickerDraft: { core: null, groups: [], match: 'carries' },
  pickerAsk: null,
  // A chip the picker is holding back because pressing it would leave nothing
  // reachable: {kind, id, label}. One press arms it and shows why, a second
  // press goes through. Cleared by any other change to the draft.
  pickerDare: null,
  // routes: the target the search is run for, its cached result, what the grid
  // is ordered by, which route was chosen, and Gemini's reading of the numbers.
  target: null,
  routeResult: null,
  routeResultKey: null,
  criterion: 'stages',
  chosenRoute: null,
  routeAdvice: null,
  // workstation: the behaviours asked for, as {kind, arg} picked off the
  // catalogue-derived vocabulary. Never anything the user typed in free text.
  wants: [],
  // bench
  starterId: 'glucose',
  lane: [],
  // how the vacuum is being run: the dial's temperature in °C, which run length
  // the activity curve is read for, and the lane the dial was last set for
  runId: null,
  temp: null,
  tempLane: null,
  // which stage the reaction cartoon is playing; null follows the last stage
  playStage: null,
  // the enzyme list filters itself against the lane unless this is on
  showAllEnzymes: false,
  // collection: which card is face up, and the drawer's filters. Every filter
  // here reads a committed catalogue field; see collection-view.js.
  cardIndex: 0,
  cardDrawer: false,
  cardQuery: '',
  cardWants: [],
  cardArchetype: null,
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
  if (state.screen !== 'home' || state.homeStep !== 'run') unmountHome();
  if (state.screen === 'home') renderHome(screenEl);
  else if (state.screen === 'collection') renderCollection(screenEl);
  else if (state.screen === 'workstation') renderWorkstation(screenEl);
  else if (state.screen === 'bench') renderBench(screenEl);
  else renderSplice(screenEl);

  // The bench and the workstation used to get a "back to making a molecule"
  // bar prepended here, because neither had a tab. Both have one again, so the
  // bar was a second way to do what the nav already does, one line of text
  // above every view of those two screens. Gone.
}

document.addEventListener('click', (e) => {
  // The landing row's one remaining link jumps into a step of the flow rather
  // than to another screen; the picker and the grid mount no listener of their
  // own for it, so it is handled here. The run step has its own handler that
  // does the same thing, so a double hit is two identical setState calls.
  const go = e.target.closest('[data-go]');
  if (go) {
    setState({ screen: go.dataset.go });
    return;
  }
  if (state.screen === 'home' && state.homeStep !== 'run') {
    const step = e.target.closest('[data-step]');
    if (step) setState({ homeStep: step.dataset.step });
  }
});

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
  <h3 style="font-size:14px">Never checked, on any screen</h3>
  <ul>${NOT_CHECKED.map((l) => `<li>${l}</li>`).join('')}</ul>
  <p style="font-size:12.5px;color:var(--ink-faint)">A pass is the absence of a red flag from a
  cartoon. There is no "validated" or "approved" state here: a construct that clears every filter is
  only ever reported as "Nothing here ruled this out".</p>
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
