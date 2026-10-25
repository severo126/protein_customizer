// The bench: drag cards into a lane, watch the molecule change along it, play
// any stage back as a cartoon, and see whether the team could run in one pot.
//
// The enzyme list filters itself against what the lane is currently holding.
// Entries this toy has ruled out stay reachable on purpose — watching a stage
// refuse a molecule is the point of the screen — but they are moved out of the
// way and each one says what ruled it out.

import { state, setState, entry, laneEntries } from './app.js';
import { enzymePiece, moleculePiece, escapeText } from './cartoon.js';
import { STARTERS, starter, describe } from '../model/molecules.js';
import { runPipeline } from '../model/pipeline.js';
import { teamReport } from '../model/compatibility.js';
import { suggestNext, byFamily, FIT_NOTE } from '../model/suggest.js';
import { exportPipeline } from '../model/exportConstruct.js';
import { renderGeminiBox, wireGeminiBox } from './gemini.js';
import { reactionPanel, wireReaction } from './reaction.js';
import { logEvent, roomPanel } from './telemetry.js';

const FAMILY_LABEL = { adds: 'Adds a group', removes: 'Removes a group', creates: 'Creates / rearranges' };

export function renderBench(root) {
  const entries = laneEntries();
  const run = runPipeline(starter(state.starterId), entries);
  const team = teamReport(entries, run);
  const suggestions = suggestNext(state.catalogue.entries, entries, run.product);

  root.innerHTML = `
    <div class="section-head">
      <h2>The bench</h2>
    </div>

    <div class="bench-grid">
      <aside class="panel palette">
        ${renderPalette(suggestions, entries, run)}
      </aside>

      <div class="lane-wrap">
        <div class="panel demo-bar">
          <strong>Seeded demo:</strong>
          ${(state.demo?.routes ?? [])
            .map((r) => `<button class="btn small" data-demo="${r.id}">${escapeText(r.title)}</button>`)
            .join('')}
          <span class="score-note" id="demo-note">${escapeText(state.demoNote ?? '')}</span>
        </div>
        <div class="panel lane" id="lane">
          <div class="lane-slot">
            <div class="lane-end">
              ${moleculePiece(run.start, 86)}
              <div class="cartoon-label">in · ${escapeText(describe(run.start))}</div>
            </div>
          </div>
          ${run.stages.map((s) => stageCard(s, s.index === playIndex(run))).join('')}
          <div class="lane-slot"><div class="connector" aria-hidden="true">➜</div>
            <div class="drop-zone" id="drop">Drop an enzyme here<br /><small>or press + in the list</small></div>
          </div>
          ${
            run.stalled
              ? ''
              : `<div class="lane-slot"><div class="connector" aria-hidden="true">➜</div>
                <div class="lane-end">
                  ${moleculePiece(run.product, 86)}
                  <div class="cartoon-label">out · ${escapeText(run.productDescription ?? '')}</div>
                </div></div>`
          }
        </div>

        ${renderReaction(run)}

        <div class="readout">
          <div class="panel box">
            <div class="score-value">${run.score.value}</div>
            <div><strong>Score</strong></div>
            <div class="score-note" title="${escapeText(`${run.scoreDisclaimer} ${run.score.basis}`)}" style="color:var(--amber)">A made-up number with made-up units — not a yield, a rate or a prediction.</div>
          </div>
          <div class="panel box">
            <strong>Running product</strong>
            <div class="score-note">${run.stalled ? '—' : escapeText(run.productDescription)}</div>
            ${run.stalled ? `<div class="stall" style="color:var(--red);font-size:12.5px">${escapeText(run.stages[run.stalledAt].stallReason)}</div>` : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn small" id="export-run">Export this run (JSON)</button>
              <button class="btn small ghost" id="clear-lane">Clear lane</button>
            </div>
          </div>
          <div class="panel lights">
            <strong title="Windows are the rounded teaching ranges in the catalogue, intersected arithmetically. A cartoon of one pot, not a model of a reaction.">Team compatibility</strong>
            ${team.lights.map(lightRow).join('')}
          </div>
        </div>

        ${renderGeminiBox(run, entries)}

        <div class="panel" id="room-panel" hidden style="padding:13px;display:grid;gap:8px">
          <strong>What the room has been building</strong>
          <div class="score-note" id="room-body"></div>
        </div>
      </div>
    </div>`;

  wire(root, run, entries, team);
  wireGeminiBox(root);
  wireReaction(root);
  paintRoomPanel(root);
}

/* ---------- the enzyme list, filtered against the lane ---------- */

function renderPalette(suggestions, entries, run) {
  const { counts, context } = suggestions;
  const showAll = state.showAllEnzymes || context.empty;
  const fits = suggestions.items.filter((i) => i.verdict === 'fits');
  const caution = suggestions.items.filter((i) => i.verdict === 'caution');
  const blocked = suggestions.items.filter((i) => i.verdict === 'blocked');

  const header = context.empty
    ? ''
    : `<div class="palette-note" title="${escapeText(FIT_NOTE)}">against <strong>${escapeText(run.stalled ? 'a stalled lane' : describe(run.product))}</strong>${context.temp && !context.temp.empty ? ` · ${context.temp.low}–${context.temp.high} °C · pH ${context.ph.low}–${context.ph.high}` : ''}</div>`;

  const toggle = context.empty
    ? ''
    : `<label class="palette-toggle">
        <input type="checkbox" id="show-all" ${state.showAllEnzymes ? 'checked' : ''} />
        Show all forty, ruled out or not
      </label>`;

  const held = run.stalled ? 'the stalled lane' : describe(run.product);
  const sections = [];
  sections.push(bucket('fits', context.empty ? `Has a rule for ${held}` : 'Fits what the lane is holding', fits, context.empty));
  if (caution.length) sections.push(bucket('caution', 'Would run, with a caution', caution, false));
  if (blocked.length) {
    sections.push(`<details class="palette-bucket blocked" ${showAll ? 'open' : ''}>
      <summary><span class="bucket-dot blocked"></span>${context.empty ? `No rule for ${escapeText(held)}` : 'Ruled out by this lane'}
        <span class="chip">${blocked.length}</span></summary>
      <div class="palette-list">${blocked.map((i) => paletteItem(i, true)).join('')}</div>
    </details>`);
  }

  return `<div class="palette-head">
      <h3>Enzymes</h3>
      <span class="chip">${counts.fits} fit · ${counts.caution} caution · ${counts.blocked} ruled out</span>
    </div>
    <div class="picker-row">
      <label for="starter">Starting molecule</label>
      <select id="starter">
        ${STARTERS.map((s) => `<option value="${s.id}" ${s.id === state.starterId ? 'selected' : ''}>${escapeText(s.label)}</option>`).join('')}
      </select>
    </div>
    ${header}
    ${toggle}
    ${sections.join('')}`;
}

function bucket(kind, label, items, groupByFamily) {
  if (!items.length) {
    return `<div class="palette-bucket ${kind}"><div class="bucket-head">
      <span class="bucket-dot ${kind}"></span>${label} <span class="chip">0</span></div>
      </div>`;
  }
  const body = groupByFamily
    ? [...byFamily(items).entries()]
        .map(([family, group]) => `<div class="palette-family">${escapeText(FAMILY_LABEL[family] ?? family)}</div>
          <div class="palette-list">${group.map((i) => paletteItem(i, false)).join('')}</div>`)
        .join('')
    : `<div class="palette-list">${items.map((i) => paletteItem(i, false)).join('')}</div>`;
  return `<div class="palette-bucket ${kind}">
    <div class="bucket-head"><span class="bucket-dot ${kind}"></span>${label}
      <span class="chip">${items.length}</span></div>
    ${body}</div>`;
}

function paletteItem(item, ruledOut) {
  const e = item.entry;
  return `<div class="palette-item ${item.verdict}" draggable="${ruledOut ? 'false' : 'true'}" data-enzyme="${e.id}">
    ${enzymePiece(e, 34)}
    <span class="palette-name">${escapeText(e.name)}
      <small>${escapeText(item.headline || `${e.group} · ${e.cofactor}`)}</small></span>
    <button class="btn small ${ruledOut ? 'ghost' : ''}" data-add="${e.id}"
      title="${ruledOut ? 'Add it anyway and watch the stage refuse' : 'Add to the lane'}">${ruledOut ? 'anyway' : '+'}</button>
  </div>`;
}

/* ---------- the reaction cartoon for one stage ---------- */

// Which stage the scene is showing: the one the user picked, or the last one
// that did something.
function playIndex(run) {
  if (state.playStage !== null && state.playStage < run.stages.length) return state.playStage;
  if (run.stalled) return run.stalledAt;
  return run.stages.length - 1;
}

function renderReaction(run) {
  const i = playIndex(run);
  const stage = run.stages[i];
  if (!stage || !stage.input) {
    return `<div class="panel reaction-empty">
      <strong>Watch a stage run</strong>
      <p class="score-note">Add an enzyme to the lane.</p>
    </div>`;
  }
  return reactionPanel(stage.enzyme, stage.input, {
    title: `Stage ${i + 1} of ${run.stages.length}: ${stage.enzyme.name}`,
  });
}

/* ---------- the rest of the screen ---------- */

// The live panel is served from the Timescale-backed API when one is running.
// With no server it says so plainly and falls back to this browser's own
// session, rather than showing a number nobody produced.
async function paintRoomPanel(root) {
  const body = root.querySelector('#room-body');
  if (!body) return;
  const data = await roomPanel();
  const panel = root.querySelector('#room-panel');
  if (!data) {
    // With no telemetry server there is no room-wide history, and an apology in
    // its place is just clutter — leave the panel out.
    if (panel) panel.hidden = true;
    return;
  }
  if (panel) panel.hidden = false;
  body.innerHTML = `
    <div>Runs logged: <strong>${data.runs ?? 0}</strong> · filter verdicts: <strong>${data.verdicts ?? 0}</strong></div>
    ${
      (data.top_reject_reasons ?? []).length
        ? `<div>Biggest killers: ${data.top_reject_reasons.map((r) => `${escapeText(r.reason)} (${r.n})`).join(', ')}</div>`
        : ''
    }
    ${
      (data.most_used_enzymes ?? []).length
        ? `<div>Most-used enzymes: ${data.most_used_enzymes.map((r) => `${escapeText(r.enzyme)} (${r.n})`).join(', ')}</div>`
        : ''
    }
    <div class="score-note">${escapeText(data.note ?? '')}</div>`;
}

function stageCard(stage, playing) {
  const e = stage.enzyme;
  return `<div class="lane-slot">
    <div class="connector ${stage.state === 'mismatch' ? 'broken' : ''}" aria-hidden="true">${stage.state === 'mismatch' ? '✂' : '➜'}</div>
    <div class="stage-card ${stage.state} ${playing ? 'playing' : ''}">
      <div class="stage-index">Stage ${stage.index + 1}${stage.state === 'unreached' ? ' · never reached' : ''}</div>
      <h5>${escapeText(e.name)}</h5>
      ${enzymePiece(e, 56)}
      ${stage.state === 'ran' ? `<div class="did">${escapeText(stage.what)}</div>` : ''}
      ${stage.state === 'mismatch' ? `<div class="stall"><strong>Stalled.</strong> ${escapeText(stage.stallReason)}</div>` : ''}
      ${stage.product ? moleculePiece(stage.product, 62) : ''}
      <div class="stage-actions">
        ${stage.input ? `<button class="btn small ${playing ? 'primary' : ''}" data-play="${stage.index}">▶ Play</button>` : ''}
        <button class="btn small ghost" data-remove="${stage.index}">Remove</button>
      </div>
    </div>
  </div>`;
}

function lightRow(l) {
  const labels = { temp: 'Temperature', ph: 'pH', cofactor: 'Cofactors', inhibition: 'Product inhibition' };
  return `<div class="light-row ${l.colour}">
    <span class="light-dot ${l.colour}"></span>
    <span class="light-label">${labels[l.id] ?? l.id}</span>
    <span class="light-message">${escapeText(l.message)}</span>
  </div>`;
}

function wire(root, run, entries, team) {
  root.onclick = (e) => {
    const demo = e.target.closest('[data-demo]');
    if (demo) {
      const route = state.demo.routes.find((r) => r.id === demo.dataset.demo);
      setState({ starterId: route.starter, lane: [...route.lane], demoNote: route.teaches, playStage: null });
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      setState({ lane: [...state.lane, add.dataset.add], playStage: state.lane.length });
      logEvent('lane.add', { enzyme: add.dataset.add, length: state.lane.length });
      return;
    }
    const play = e.target.closest('[data-play]');
    if (play) {
      setState({ playStage: Number(play.dataset.play) });
      return;
    }
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      const i = Number(remove.dataset.remove);
      setState({ lane: state.lane.filter((_, idx) => idx !== i), playStage: null });
      return;
    }
    if (e.target.id === 'clear-lane') {
      setState({ lane: [], playStage: null });
      return;
    }
    if (e.target.id === 'export-run') {
      download(`nano-foundry-run.json`, exportPipeline({ run, entries, team }));
    }
  };

  root.onchange = (e) => {
    if (e.target.id === 'starter') setState({ starterId: e.target.value, playStage: null });
    if (e.target.id === 'show-all') setState({ showAllEnzymes: e.target.checked });
  };

  for (const item of root.querySelectorAll('[data-enzyme]')) {
    item.ondragstart = (ev) => ev.dataTransfer.setData('text/plain', item.dataset.enzyme);
  }
  const lane = root.querySelector('#lane');
  const drop = root.querySelector('#drop');
  lane.ondragover = (ev) => {
    ev.preventDefault();
    drop.classList.add('hot');
  };
  lane.ondragleave = () => drop.classList.remove('hot');
  lane.ondrop = (ev) => {
    ev.preventDefault();
    drop.classList.remove('hot');
    const id = ev.dataTransfer.getData('text/plain');
    if (entry(id)) {
      setState({ lane: [...state.lane, id], playStage: state.lane.length });
      logEvent('lane.add', { enzyme: id, length: state.lane.length });
    }
  };
}

export function download(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
