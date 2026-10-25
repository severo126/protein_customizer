// Step one of the flow: what molecule do you want to make?
//
// The conversation is real — it goes back and forth until the target is pinned
// down — but which part of it the model does is narrow and worth being plain
// about on the screen itself. The model reads the sentence and returns a
// structure. Every word that asserts something is written here, in code. The
// chips beside the conversation always show the target as it currently stands,
// and they are editable, so the person can correct a misreading in one click
// instead of arguing with a parser.
//
// With no API key the sentence is matched against the same vocabulary by
// keyword instead, and everything else on the screen is identical. That is not
// a degraded mode bolted on afterwards: the keyword parser is the floor the
// model has to beat, and the screen says which one answered.

import { state, setState } from './app.js';
import { escapeText } from './cartoon.js';
import {
  pickerOptions,
  parseTargetLocally,
  normalisePickerReply,
  askPrompt,
  targetSummary,
  coreLabel,
  PICKER_NOTE,
  PICKER_NO_KEY_NOTE,
} from '../model/picker.js';
import { makeTarget, describeTarget, validateTarget, SEARCH_LIMITS } from '../model/routes.js';
import { groupMeta } from '../model/molecules.js';
import { foldedWays } from './folded-ways.js';
import { exploreCatalogue, mapFor } from '../model/route-map.js';
import { routeMapPanel } from './route-map-view.js';
import { geminiKey, setGeminiKey, parseTarget } from './gemini.js';

/* ------------------------------ the transcript ---------------------------- */

function say(role, text, extra = {}) {
  state.pickerLog = [...(state.pickerLog ?? []), { role, text, ...extra }];
}

function bubble(line) {
  const who = line.role === 'user' ? 'you' : 'app';
  const source = line.source ? `<span class="pick-source">${escapeText(line.source)}</span>` : '';
  const quoted = line.quoted ? `<p class="pick-quoted">${escapeText(line.quoted)}</p>` : '';
  return `<div class="pick-line ${who}">
    <p>${escapeText(line.text)}</p>
    ${quoted}
    ${source}
  </div>`;
}

/* -------------------------------- the chips ------------------------------- */

function chips(opts) {
  const draft = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
  const coreName = draft.core ? coreLabel(draft.core) : null;

  const groupChips = draft.groups.length
    ? draft.groups
        .map(
          (g, i) =>
            `<button class="pick-chip group" data-drop-group="${i}" title="Click to take this one off">
              <span class="pick-dot" style="--hue:${groupMeta(g).hue}"></span>${escapeText(groupMeta(g).label)}
              <span class="pick-x" aria-hidden="true">×</span>
            </button>`,
        )
        .join('')
    : `<span class="pick-chip empty">no groups yet</span>`;

  return `<div class="pick-draft">
    <div class="pick-draft-row">
      <span class="pick-label">Skeleton</span>
      <select data-core aria-label="Skeleton">
        <option value="">— pick one —</option>
        ${opts.cores
          .map(
            (c) =>
              `<option value="${c.id}" ${c.id === draft.core ? 'selected' : ''}>${escapeText(c.label)}${c.isStarter ? '' : ' · has to be made'}</option>`,
          )
          .join('')}
      </select>
    </div>
    <div class="pick-draft-row">
      <span class="pick-label">Carrying</span>
      <div class="pick-chips">${groupChips}</div>
    </div>
    <div class="pick-draft-row">
      <span class="pick-label">Add</span>
      <div class="pick-chips">
        ${opts.groups
          .map(
            (g) =>
              `<button class="pick-chip add" data-add-group="${g.id}" ${draft.groups.length >= opts.maxGroups ? 'disabled' : ''}>
                <span class="pick-dot" style="--hue:${g.hue}"></span>${escapeText(g.label)}
              </button>`,
          )
          .join('')}
      </div>
    </div>
    <div class="pick-draft-row">
      <span class="pick-label">Read it as</span>
      <div class="pick-chips">
        <button class="pick-chip mode ${draft.match === 'carries' ? 'on' : ''}" data-match="carries">carrying at least those</button>
        <button class="pick-chip mode ${draft.match === 'exact' ? 'on' : ''}" data-match="exact">exactly those and nothing else</button>
      </div>
    </div>
    ${coreName ? `<p class="pick-reading"><strong>${escapeText(describeTarget(draftTarget()))}</strong></p>
       <p class="pick-origin">${escapeText(targetSummary(draftTarget()))}</p>` : ''}
  </div>`;
}

function draftTarget() {
  const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
  return makeTarget({ core: d.core ?? '', groups: d.groups, match: d.match });
}

/* -------------------------------- the screen ------------------------------ */

export function renderPicker(root) {
  const opts = pickerOptions(state.catalogue.entries);
  const hasKey = Boolean(geminiKey());
  const draft = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
  const ready = Boolean(draft.core);
  const log = state.pickerLog ?? [];

  root.innerHTML = `<div class="pick">
    <div class="pick-head">
      <h1>What do you want to make?</h1>
      <p class="pick-sub">Say it however you like. I'll work out which skeleton and which groups
      you mean, then search the forty enzymes in this catalogue for every chain that could get
      there.</p>
    </div>

    <div class="pick-body">
      <div class="pick-talk">
        <div class="pick-log" data-log>
          ${log.length ? log.map(bubble).join('') : `<div class="pick-line app"><p>Try something like “put a phosphate on glucose, then rearrange it” — or build it from the chips on the right.</p></div>`}
        </div>
        ${
          state.pickerAsk
            ? `<div class="pick-ask">
                <p>${escapeText(state.pickerAsk.question ?? askPrompt(state.pickerAsk.choose, state.pickerAsk.options))}</p>
                <div class="pick-chips">
                  ${state.pickerAsk.options
                    .map(
                      (o) =>
                        `<button class="pick-chip answer" data-answer="${escapeText(o)}">${escapeText(
                          state.pickerAsk.choose === 'core' ? coreLabel(o) : state.pickerAsk.choose === 'groups' ? groupMeta(o).label : o === 'exact' ? 'exactly those' : 'at least those',
                        )}</button>`,
                    )
                    .join('')}
                </div>
              </div>`
            : ''
        }
        <form class="pick-form" data-form>
          <textarea data-sentence rows="2" placeholder="${hasKey ? 'A fructose carrying a phosphate' : 'phosphate on glucose'}"></textarea>
          <button class="btn primary" type="submit">Work out what I mean</button>
        </form>
        <p class="pick-note">${escapeText(hasKey ? PICKER_NOTE : PICKER_NO_KEY_NOTE)}</p>
        ${hasKey ? '' : `<label class="pick-key">Gemini API key (kept in this browser only)
            <input type="password" data-key placeholder="optional" />
          </label>`}
      </div>

      <div class="pick-side">
        <h2>The molecule, as it stands</h2>
        ${chips(opts)}
        <button class="btn primary pick-go" data-search ${ready ? '' : 'disabled'}>
          ${ready ? 'Find the routes' : 'Pick a skeleton first'}
        </button>
        <p class="pick-small">Up to ${opts.maxGroups} groups, which is where the search caps out.
        Every skeleton and group here is one the catalogue can actually reach — the list is read
        off the forty entries rather than written out by hand.</p>
      </div>
    </div>

    <div class="pick-map" data-map>${mapPanel()}</div>

    ${foldedWays()}
  </div>`;

  wire(root, opts);
}

/* --------------------------- what is even possible ------------------------ */
//
// The map of what this catalogue can reach, drawn while the target is still
// being decided. It comes out of the same walk the route search uses, so it
// cannot show a chain the search would not find.
//
// The walk itself does not depend on what has been typed, so it is run once and
// kept: about a third of a second the first time a skeleton is picked, and
// nothing after that. Redrawing the map for a new draft is single-digit
// milliseconds, which is what lets it narrow as you choose rather than only
// once you have finished.
let exploration = null;
let exploreFailed = false;

function entriesById() {
  return new Map(state.catalogue.entries.map((e) => [e.id, e]));
}

function mapPanel() {
  const draft = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
  if (!draft.core) {
    return `<p class="rm-empty">Pick a skeleton and this fills in with what the catalogue can
      actually do to it, and narrows as you add groups.</p>`;
  }
  if (exploreFailed) {
    return `<p class="rm-empty">The map could not be built, so it is not being shown rather than
      shown wrong. The search itself is unaffected: press “Find the routes”.</p>`;
  }
  if (!exploration) return `<p class="rm-empty">Working out what this catalogue can reach…</p>`;
  return routeMapPanel(mapFor(exploration, draft), entriesById());
}

// Build the walk once, off the first paint, then redraw the panel in place.
function ensureExploration(root) {
  if (exploration || exploreFailed) return;
  const draft = state.pickerDraft ?? {};
  if (!draft.core) return;
  // A frame later, so the picker paints before the walk runs rather than the
  // screen appearing to hang on the click that chose the skeleton.
  requestAnimationFrame(() => {
    try {
      exploration = exploreCatalogue(state.catalogue.entries);
    } catch (err) {
      exploreFailed = true;
      console.error('route map: exploration failed', err);
    }
    const holder = root.querySelector('[data-map]');
    if (holder) holder.innerHTML = mapPanel();
  });
}

function wire(root, opts) {
  ensureExploration(root);
  const form = root.querySelector('[data-form]');
  const field = root.querySelector('[data-sentence]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyField = root.querySelector('[data-key]');
    if (keyField && keyField.value.trim()) setGeminiKey(keyField.value.trim());
    const sentence = field.value.trim();
    if (!sentence) return;
    field.value = '';
    await handleSentence(sentence, opts);
  });

  // On the wrapper this render just created, NOT on `root`. `root` is the
  // screen element and outlives every render, so attaching here stacked one
  // listener per render: the first chip click added one group, the second two,
  // the third three. The wrapper is rebuilt by the innerHTML above, so its
  // listeners go with it.
  const panel = root.querySelector('.pick') ?? root;
  panel.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-group]');
    if (add) {
      const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
      if (d.groups.length >= opts.maxGroups) return;
      setState({ pickerDraft: { ...d, groups: [...d.groups, add.dataset.addGroup] } });
      return;
    }
    const drop = e.target.closest('[data-drop-group]');
    if (drop) {
      const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
      const groups = [...d.groups];
      groups.splice(Number(drop.dataset.dropGroup), 1);
      setState({ pickerDraft: { ...d, groups } });
      return;
    }
    const mode = e.target.closest('[data-match]');
    if (mode) {
      const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
      setState({ pickerDraft: { ...d, match: mode.dataset.match } });
      return;
    }
    const answer = e.target.closest('[data-answer]');
    if (answer) {
      applyAnswer(answer.dataset.answer);
      return;
    }
    if (e.target.closest('[data-search]')) {
      runSearch();
    }
  });

  // Same reason as the click handler above: on this render's wrapper, not on
  // the screen element that outlives it.
  panel.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-core]');
    if (sel) {
      const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
      setState({ pickerDraft: { ...d, core: sel.value || null } });
    }
  });
}

// An answer to the app's own question folds straight into the draft. No model
// involved: the options were already checked against the catalogue when the
// question was built.
function applyAnswer(value) {
  const ask = state.pickerAsk;
  if (!ask) return;
  const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
  const next = { ...d };
  if (ask.choose === 'core') next.core = value;
  else if (ask.choose === 'groups') next.groups = [...d.groups, value];
  else next.match = value === 'exact' ? 'exact' : 'carries';

  say('user', ask.choose === 'core' ? coreLabel(value) : ask.choose === 'groups' ? groupMeta(value).label : value);
  say('app', `Noted. The molecule now reads: ${describeTarget(makeTarget({ core: next.core ?? '', groups: next.groups, match: next.match }))}.`);
  setState({ pickerDraft: next, pickerAsk: null });
}

async function handleSentence(sentence, opts) {
  say('user', sentence);
  setState({ pickerAsk: null });

  // The deterministic read happens first and always, so there is something on
  // screen whether or not a model answers, and so the two can be compared.
  const local = parseTargetLocally(sentence, state.catalogue.entries);

  if (!geminiKey()) {
    if (local.complete) {
      acceptTarget(local.target, 'Matched by keyword, with no model involved.');
    } else {
      say(
        'app',
        'I could not find a skeleton in that by keyword. Pick one from the list on the right, or set a Gemini key and I can read the sentence properly.',
      );
      setState({});
    }
    return;
  }

  say('app', 'Reading that…');
  setState({});

  try {
    const raw = await parseTarget(sentence, opts, state.pickerLog ?? []);
    const reply = normalisePickerReply(raw, state.catalogue.entries);
    dropThinking();

    if (reply.kind === 'target') {
      acceptTarget(reply.target, 'Read by Gemini, then checked against the catalogue.', reply.understood);
      return;
    }
    if (reply.kind === 'ask') {
      if (reply.understood) say('app', reply.understood, { source: 'Gemini' });
      setState({
        pickerAsk: { choose: reply.choose, options: reply.options, question: reply.question },
      });
      return;
    }

    // Rejected. The app says what was wrong, in its own words, and falls back
    // to whatever the keyword match found rather than leaving the person stuck.
    say('app', `That did not come back as something I can use. ${reply.problems[0]}`);
    if (local.complete) {
      acceptTarget(local.target, 'Fell back to the keyword match.');
    } else {
      setState({});
    }
  } catch (err) {
    dropThinking();
    say('app', `Gemini did not answer (${String(err.message ?? err)}), so I matched your sentence by keyword instead.`);
    if (local.complete) acceptTarget(local.target, 'Matched by keyword.');
    else {
      say('app', 'That did not name a skeleton I recognise. Pick one from the list on the right.');
      setState({});
    }
  }
}

function dropThinking() {
  const log = state.pickerLog ?? [];
  if (log.length && log[log.length - 1].text === 'Reading that…') {
    state.pickerLog = log.slice(0, -1);
  }
}

function acceptTarget(target, source, understood = null) {
  const check = validateTarget(state.catalogue.entries, target);
  if (!check.ok) {
    say('app', check.problems[0]);
    setState({});
    return;
  }
  if (understood) say('app', understood, { source: 'Gemini' });
  say('app', `Reading that as: ${describeTarget(target)}. ${targetSummary(target)}`, { source });
  setState({
    pickerDraft: { core: target.core, groups: [...target.groups], match: target.match },
  });
}

function runSearch() {
  const target = draftTarget();
  const check = validateTarget(state.catalogue.entries, target);
  if (!check.ok) {
    say('app', check.problems[0]);
    setState({});
    return;
  }
  setState({
    target,
    homeStep: 'routes',
    chosenRoute: null,
    routeAdvice: null,
    criterion: state.criterion ?? 'stages',
  });
}

export const PICKER_LIMITS = { maxGroups: SEARCH_LIMITS.maxGroups };
