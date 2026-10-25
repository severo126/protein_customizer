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
import { exploreCatalogue, mapFor, chipOutlook, deadReason, stuckNote } from '../model/route-map.js';
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
//
// Every chip knows, before it is pressed, what pressing it would leave. The
// number on a live chip is how many molecules this catalogue can still reach
// that would match; a chip with nothing behind it is marked and says what
// closed the door.
//
// A dead chip is not disabled. It takes two presses: the first says why it
// leads nowhere, the second asks for it anyway. That is deliberate. The
// screen's job here is to stop someone walking into a dead end without
// noticing, not to decide for them what they are allowed to want — and the
// dead end is worth seeing on purpose, because "nothing in this catalogue
// reaches that" is a real answer and the honest half of what this app does.
// The skeleton list is the exception: a dropdown has no second press, so a
// skeleton that reaches nothing is disabled outright and says so in its label.

function dare() {
  return state.pickerDare ?? null;
}

function armed(kind, id) {
  const d = dare();
  return Boolean(d && d.kind === kind && d.id === id);
}

// A number small enough to sit on a chip without crowding the label.
function countBadge(n) {
  return `<span class="pick-count" aria-hidden="true">${n > 999 ? '999+' : n}</span>`;
}

function deadBadge() {
  return `<span class="pick-none" aria-hidden="true">∅</span>`;
}

function chips(opts, outlook) {
  const draft = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
  const coreName = draft.core ? coreLabel(draft.core) : null;
  // The draft already matches nothing. Every chip then counts zero, and
  // marking all fourteen would blame the next press for a door the draft has
  // already closed. One line about the draft instead.
  const stuck = Boolean(outlook && outlook.core && outlook.current === 0);
  const atCap = draft.groups.length >= opts.maxGroups;

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

  const coreOption = (c) => {
    const o = outlook?.cores.get(c.id);
    const dead = Boolean(o && o.count === 0);
    const made = c.isStarter ? '' : ' · has to be made';
    const reach = !o ? '' : dead ? ' · nothing reachable' : ` · ${o.count} reachable`;
    return `<option value="${c.id}" ${c.id === draft.core ? 'selected' : ''} ${dead && c.id !== draft.core ? 'disabled' : ''}>${escapeText(
      c.label,
    )}${made}${reach}</option>`;
  };

  const addChip = (g) => {
    const o = outlook?.groups.get(g.id);
    const dead = Boolean(o && !stuck && o.count === 0);
    const isArmed = armed('group', g.id);
    const cls = ['pick-chip', 'add', dead ? 'dead' : '', isArmed ? 'armed' : '', stuck ? 'moot' : '']
      .filter(Boolean)
      .join(' ');
    const title = dead
      ? deadReason('group', g.label, draft)
      : o
        ? `${o.count} molecule${o.count === 1 ? '' : 's'} this catalogue reaches would still match.`
        : '';
    const badge = dead ? deadBadge() : o && !stuck ? countBadge(o.count) : '';
    return `<button class="${cls}" data-add-group="${g.id}" ${atCap ? 'disabled' : ''} title="${escapeText(title)}">
      <span class="pick-dot" style="--hue:${g.hue}"></span>${escapeText(g.label)}${badge}
    </button>`;
  };

  const modeChip = (id, label) => {
    const o = outlook?.modes.get(id);
    const on = draft.match === id;
    const dead = Boolean(o && !on && o.count === 0);
    const isArmed = armed('mode', id);
    const cls = ['pick-chip', 'mode', on ? 'on' : '', dead ? 'dead' : '', isArmed ? 'armed' : ''].filter(Boolean).join(' ');
    const title = dead ? deadReason('mode', label, draft) : o ? `${o.count} would match read that way.` : '';
    const badge = dead ? deadBadge() : o ? countBadge(o.count) : '';
    return `<button class="${cls}" data-match="${id}" title="${escapeText(title)}">${escapeText(label)}${badge}</button>`;
  };

  // The one press that is being held back, with the reason, so the second
  // press is a decision rather than a repeated click that mysteriously works.
  const held = dare();
  const dareLine = held
    ? `<p class="pick-dare">${escapeText(
        held.kind === 'mode'
          ? deadReason('mode', held.label, draft)
          : deadReason('group', held.label, draft),
      )} <strong>Press ${escapeText(held.label)} again</strong> to ask for it anyway and see the dead end drawn.</p>`
    : '';

  const stuckLine = !held && stuck ? `<p class="pick-stuck">${escapeText(stuckNote(draft))}</p>` : '';

  return `<div class="pick-draft">
    <div class="pick-draft-row">
      <span class="pick-label">Skeleton</span>
      <select data-core aria-label="Skeleton">
        <option value="">— pick one —</option>
        ${opts.cores.map(coreOption).join('')}
      </select>
    </div>
    <div class="pick-draft-row">
      <span class="pick-label">Carrying</span>
      <div class="pick-chips">${groupChips}</div>
    </div>
    <div class="pick-draft-row">
      <span class="pick-label">Add</span>
      <div class="pick-chips">${opts.groups.map(addChip).join('')}</div>
    </div>
    <div class="pick-draft-row">
      <span class="pick-label">Read it as</span>
      <div class="pick-chips">
        ${modeChip('carries', 'carrying at least those')}
        ${modeChip('exact', 'exactly those and nothing else')}
      </div>
    </div>
    ${dareLine}
    ${stuckLine}
    ${
      outlook && outlook.core && !held && !stuck
        ? `<p class="pick-legend">Numbers are how many molecules stay reachable if you press.
           ∅ means none — hover for why.</p>`
        : ''
    }
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
  const outlook = outlookNow(opts);

  root.innerHTML = `<div class="pick">
    <div class="pick-head">
      <h1>What do you want to make?</h1>
      <p class="pick-sub">Say it in your own words, or build it from the chips. I'll search the
      forty enzymes for every chain that gets there.</p>
    </div>

    <div class="pick-body">
      <div class="pick-talk">
        <div class="pick-log" data-log>
          ${log.length ? log.map(bubble).join('') : `<div class="pick-line app"><p>Try “put a phosphate on glucose, then rearrange it”.</p></div>`}
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
        <div data-draft>${chips(opts, outlook)}</div>
        <button class="btn primary pick-go" data-search ${ready ? '' : 'disabled'}>
          ${ready ? 'Find the routes' : 'Pick a skeleton first'}
        </button>
        <p class="pick-small">Up to ${opts.maxGroups} groups. Every skeleton and group offered
        here is read off the forty entries, not written out by hand.</p>
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

// What each chip would leave, for the draft as it stands. Null until the walk
// has run, and the chips then draw exactly as they used to — the marks are an
// addition to the screen, never a precondition for it.
function outlookNow(opts) {
  if (!exploration) return null;
  try {
    return chipOutlook(exploration, state.pickerDraft ?? { core: null, groups: [], match: 'carries' }, opts);
  } catch (err) {
    console.error('route map: chip outlook failed', err);
    return null;
  }
}

// Would pressing this chip leave nothing reachable? Asked at click time from
// the same walk the chips were drawn from, so the answer cannot disagree with
// the mark on the chip. Unknown (no walk yet) is treated as open: a chip is
// never held back on a guess.
//
// A draft that already matches nothing is treated as open too. Every chip
// counts zero there, and holding each one back would be fourteen doors held
// against a door the draft has already shut.
function closesTheDoor(kind, id, opts) {
  const outlook = outlookNow(opts);
  if (!outlook || !outlook.core) return false;
  if (outlook.current === 0) return false;
  const o = kind === 'mode' ? outlook.modes.get(id) : outlook.groups.get(id);
  return Boolean(o && o.count === 0);
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
function ensureExploration(root, opts) {
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
    // The chips carry the same facts, so they are refreshed with it. Swapping
    // these two holders rather than re-rendering the screen keeps whatever the
    // person was part-way through typing in the sentence box, and the click
    // handlers sit on the wrapper above both, so they survive it.
    const drafted = root.querySelector('[data-draft]');
    if (drafted) drafted.innerHTML = chips(opts, outlookNow(opts));
  });
}

function wire(root, opts) {
  ensureExploration(root, opts);
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
      const id = add.dataset.addGroup;
      const label = groupMeta(id).label;
      // Held back once, with the reason, if it would leave nothing. Pressed
      // again it goes through: the dead end is a thing you are allowed to ask
      // for on purpose, it just should not happen by accident.
      if (closesTheDoor('group', id, opts) && !armed('group', id)) {
        setState({ pickerDare: { kind: 'group', id, label } });
        return;
      }
      setState({ pickerDraft: { ...d, groups: [...d.groups, id] }, pickerDare: null });
      return;
    }
    const drop = e.target.closest('[data-drop-group]');
    if (drop) {
      const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
      const groups = [...d.groups];
      groups.splice(Number(drop.dataset.dropGroup), 1);
      setState({ pickerDraft: { ...d, groups }, pickerDare: null });
      return;
    }
    const mode = e.target.closest('[data-match]');
    if (mode) {
      const d = state.pickerDraft ?? { core: null, groups: [], match: 'carries' };
      const id = mode.dataset.match;
      const label = id === 'exact' ? 'exactly those and nothing else' : 'carrying at least those';
      if (id !== d.match && closesTheDoor('mode', id, opts) && !armed('mode', id)) {
        setState({ pickerDare: { kind: 'mode', id, label } });
        return;
      }
      setState({ pickerDraft: { ...d, match: id }, pickerDare: null });
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
      setState({ pickerDraft: { ...d, core: sel.value || null }, pickerDare: null });
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
  setState({ pickerDraft: next, pickerAsk: null, pickerDare: null });
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
