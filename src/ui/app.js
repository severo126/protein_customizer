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

  // The bench and the workstation lost their tabs when the flow took over the
  // front door, so each needs a way back that the nav no longer provides.
  // Done here rather than inside either view, so neither screen changed.
  if (state.screen === 'bench' || state.screen === 'workstation') {
    const back = document.createElement('div');
    back.className = 'folded-back';
    back.innerHTML = `<button class="btn small ghost" data-back-to-flow>‹ Back to making a molecule</button>
      <span>${
        state.screen === 'bench'
          ? 'The bench is still here, unchanged: build a lane by hand and press the run.'
          : 'Still here, unchanged: look the catalogue up by the behaviour you want.'
      }</span>`;
    screenEl.prepend(back);
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-back-to-flow]')) setState({ screen: 'home' });
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
