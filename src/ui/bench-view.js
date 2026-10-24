// The bench: drag cards into a lane, watch the molecule change along it, and
// see whether the team could run in one pot.

import { state, setState, entry, laneEntries } from './app.js';
import { enzymePiece, moleculePiece, escapeText } from './cartoon.js';
import { STARTERS, starter, describe } from '../model/molecules.js';
import { runPipeline } from '../model/pipeline.js';
import { teamReport } from '../model/compatibility.js';
import { exportPipeline } from '../model/exportConstruct.js';
import { renderGeminiBox, wireGeminiBox } from './gemini.js';
import { logEvent, roomPanel, localEvents, telemetryState } from './telemetry.js';

export function renderBench(root) {
  const entries = laneEntries();
  const run = runPipeline(starter(state.starterId), entries);
  const team = teamReport(entries, run);

  root.innerHTML = `
    <div class="section-head">
      <h2>The bench</h2>
      <p>Drag an enzyme onto the lane. Each stage transforms the molecule; a stage that has no rule
      for the previous product shows the mismatch instead of passing it along.</p>
    </div>

    <div class="bench-grid">
      <aside class="panel palette">
        <h3>Enzymes</h3>
        <div class="picker-row">
          <label for="starter">Starting molecule</label>
          <select id="starter">
            ${STARTERS.map((s) => `<option value="${s.id}" ${s.id === state.starterId ? 'selected' : ''}>${escapeText(s.label)}</option>`).join('')}
          </select>
        </div>
        ${['adds', 'removes', 'creates']
          .map(
            (f) => `<div class="picker-row"><label>${f}</label>
          ${state.catalogue.entries
            .filter((e) => e.family === f)
            .map(
              (e) => `<div class="palette-item" draggable="true" data-enzyme="${e.id}">
                ${enzymePiece(e, 32)}
                <span>${escapeText(e.name)}<small>${escapeText(e.group)} · ${escapeText(e.cofactor)}</small></span>
                <button class="btn small" data-add="${e.id}">+</button>
              </div>`,
            )
            .join('')}</div>`,
          )
          .join('')}
      </aside>

      <div class="lane-wrap">
        <div class="panel" style="padding:11px 13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <strong style="font-size:13px">Seeded demo:</strong>
          ${(state.demo?.routes ?? [])
            .map((r) => `<button class="btn small" data-demo="${r.id}">${escapeText(r.title)}</button>`)
            .join('')}
          <span class="score-note" id="demo-note">${escapeText(state.demoNote ?? 'One route that runs clean, two that fail in different, instructive ways.')}</span>
        </div>
        <div class="panel lane" id="lane">
          <div class="lane-slot">
            <div style="text-align:center">
              ${moleculePiece(run.start, 86)}
              <div class="cartoon-label">in · ${escapeText(describe(run.start))}</div>
            </div>
          </div>
          ${run.stages.map(stageCard).join('')}
          <div class="lane-slot"><div class="connector" aria-hidden="true">➜</div>
            <div class="drop-zone" id="drop">Drop an enzyme here<br /><small>or press + in the list</small></div>
          </div>
          ${
            run.stalled
              ? ''
              : `<div class="lane-slot"><div class="connector" aria-hidden="true">➜</div>
                <div style="text-align:center">
                  ${moleculePiece(run.product, 86)}
                  <div class="cartoon-label">out · ${escapeText(run.productDescription ?? '')}</div>
                </div></div>`
          }
        </div>

        <div class="readout">
          <div class="panel box">
            <div class="score-value">${run.score.value}</div>
            <div><strong>Foundry Score</strong></div>
            <div class="score-note">${escapeText(run.score.basis)}</div>
            <div class="score-note" style="color:var(--amber)">${escapeText(run.scoreDisclaimer)}</div>
          </div>
          <div class="panel box">
            <strong>Running product</strong>
            <div class="score-note">${run.stalled ? 'The lane stalls, so there is no product to preview.' : escapeText(run.productDescription)}</div>
            ${run.stalled ? `<div class="stall" style="color:var(--red);font-size:12.5px">${escapeText(run.stages[run.stalledAt].stallReason)}</div>` : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn small" id="export-run">Export this run (JSON)</button>
              <button class="btn small ghost" id="clear-lane">Clear lane</button>
            </div>
          </div>
          <div class="panel lights">
            <strong>Team compatibility</strong>
            ${team.lights.map(lightRow).join('')}
            <div class="score-note">Windows are the rounded teaching ranges in the catalogue, intersected
            arithmetically. A cartoon of one pot, not a model of a reaction.</div>
          </div>
        </div>

        ${renderGeminiBox(run, entries)}

        <div class="panel" id="room-panel" style="padding:13px;display:grid;gap:8px">
          <strong>What the room has been building</strong>
          <div class="score-note" id="room-body">Checking for a telemetry server…</div>
        </div>
      </div>
    </div>`;

  wire(root, run, entries, team);
  wireGeminiBox(root);
  paintRoomPanel(root);
}

// The live panel is served from the Timescale-backed API when one is running.
// With no server it says so plainly and falls back to this browser's own
// session, rather than showing a number nobody produced.
async function paintRoomPanel(root) {
  const body = root.querySelector('#room-body');
  if (!body) return;
  const data = await roomPanel();
  if (!data) {
    const mine = localEvents();
    body.innerHTML = `No telemetry server is answering (${telemetryState()}), so there is no room-wide
      history to show. This browser has logged ${mine.length} event${mine.length === 1 ? '' : 's'} this
      session. Start <code>tools/api/server.mjs</code> to collect them.`;
    return;
  }
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

function stageCard(stage) {
  const e = stage.enzyme;
  return `<div class="lane-slot">
    <div class="connector ${stage.state === 'mismatch' ? 'broken' : ''}" aria-hidden="true">${stage.state === 'mismatch' ? '✂' : '➜'}</div>
    <div class="stage-card ${stage.state}">
      <div class="stage-index">Stage ${stage.index + 1}${stage.state === 'unreached' ? ' · never reached' : ''}</div>
      <h5>${escapeText(e.name)}</h5>
      ${enzymePiece(e, 56)}
      ${stage.state === 'ran' ? `<div class="did">${escapeText(stage.what)}</div>` : ''}
      ${stage.state === 'mismatch' ? `<div class="stall"><strong>Stalled.</strong> ${escapeText(stage.stallReason)}</div>` : ''}
      ${stage.product ? moleculePiece(stage.product, 62) : ''}
      <button class="btn small ghost" data-remove="${stage.index}">Remove</button>
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
      setState({ starterId: route.starter, lane: [...route.lane], demoNote: route.teaches });
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      setState({ lane: [...state.lane, add.dataset.add] });
      logEvent('lane.add', { enzyme: add.dataset.add, length: state.lane.length });
      return;
    }
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      const i = Number(remove.dataset.remove);
      setState({ lane: state.lane.filter((_, idx) => idx !== i) });
      return;
    }
    if (e.target.id === 'clear-lane') {
      setState({ lane: [] });
      return;
    }
    if (e.target.id === 'export-run') {
      download(`nano-foundry-run.json`, exportPipeline({ run, entries, team }));
    }
  };

  root.onchange = (e) => {
    if (e.target.id === 'starter') setState({ starterId: e.target.value });
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
      setState({ lane: [...state.lane, id] });
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
