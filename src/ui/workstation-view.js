// The workstation: look the catalogue up by the behaviour you want.
//
// You tick the behaviours — grabs a molecule carrying a hydroxyl, takes a sugar
// off, has to work at 50 °C, needs no cofactor — and the screen tells you which
// single entry of the fixed forty, or which pairing of them, covers the most of
// it. Every behaviour on offer is read off a field already committed in
// src/data/catalogue.json. There is no lookup, no database and nothing to
// upload; see docs/scope.md §1.
//
// A build is a named set of catalogue domains. It is not a protein, it carries
// no sequence of any kind, and the most it is ever reported as is the agreed
// "Nothing here ruled this out".

import { state, setState, entry } from './app.js';
import { download } from './bench-view.js';
import { escapeText, windowBars, domainMap, enzymePiece, FAMILY_STYLE } from './cartoon.js';
import { behaviourVocabulary, composeBuilds, wantId, WANT_QUESTIONS } from '../model/behaviours.js';
import { exportBuild } from '../model/exportConstruct.js';
import { NOT_CHECKED, CARTOON_PHYSICS_NOTE, PASS_VERDICT } from '../model/disclaimers.js';
import { logEvent } from './telemetry.js';

const LIGHT_LABELS = { temp: 'Temperature', ph: 'pH', cofactor: 'Cofactors', inhibition: 'Product inhibition' };

export function renderWorkstation(root) {
  const entries = state.catalogue.entries;
  const vocabulary = behaviourVocabulary(entries);
  const picked = state.wants ?? [];
  const result = composeBuilds(entries, picked);

  root.innerHTML = `
    <div class="section-head">
      <h2>Workstation</h2>
      <p>Ask for the behaviour rather than the name. Tick what you want the enzyme to do and this
      screen tells you which of the forty committed entries, or which pairing of them, covers the most
      of it — and names what went uncovered. Every behaviour below is read off a field already in the
      catalogue file.</p>
    </div>

    <div class="workstation-grid">
      <section class="panel want-picker">
        <div class="palette-head">
          <strong>What do you want it to do?</strong>
          <span class="chip">${picked.length} picked</span>
        </div>
        ${WANT_QUESTIONS.map((q) => questionBlock(q, vocabulary, picked)).join('')}
        <div class="actions">
          <button class="btn small ghost" id="clear-wants" ${picked.length ? '' : 'disabled'}>Clear all</button>
        </div>
        <div class="score-note">The count beside each behaviour is how many of the forty entries a
        committed field says do it. Nothing here searches outside this file.</div>
      </section>

      <section class="workstation-results">
        ${picked.length ? askedPanel(result) : emptyPanel(vocabulary)}
        ${result.impossible.length ? impossiblePanel(result) : ''}
        ${result.builds.map((b, i) => buildCard(b, i)).join('')}
        ${picked.length && !result.builds.length ? `<div class="panel"><p class="empty">Nothing in the catalogue covers any of this.</p></div>` : ''}
        ${picked.length ? notCheckedPanel() : ''}
      </section>
    </div>`;

  wire(root, result);
}

/* ---------- the picker ---------- */

function questionBlock(q, vocabulary, picked) {
  const options = vocabulary.filter((w) => w.kind === q.kind);
  if (!options.length) return '';
  const chosen = new Set(picked.map(wantId));

  // Temperature and pH are one choice each: a team has one shared window, so
  // asking for two figures at once would be asking it to be in two pots.
  if (q.kind === 'temp-at' || q.kind === 'ph-at') {
    const current = picked.find((w) => w.kind === q.kind);
    return `<div class="want-group">
      <label class="want-question" for="want-${q.kind}">${escapeText(q.question)}</label>
      <select id="want-${q.kind}" data-want-select="${q.kind}">
        <option value="">no preference</option>
        ${options
          .map((w) => `<option value="${escapeText(String(w.arg))}" ${current && current.arg === w.arg ? 'selected' : ''}>${escapeText(String(w.arg))}${q.kind === 'temp-at' ? ' °C' : ''} · ${w.entries.length} of 40</option>`)
          .join('')}
      </select>
    </div>`;
  }

  if (q.kind === 'cofactor-free') {
    const w = options[0];
    return `<div class="want-group">
      <label class="want-toggle ${chosen.has(w.id) ? 'on' : ''}">
        <input type="checkbox" data-want="${escapeText(w.id)}" ${chosen.has(w.id) ? 'checked' : ''} />
        ${escapeText(q.question)} <span class="chip">${w.entries.length} of 40</span>
      </label>
    </div>`;
  }

  return `<div class="want-group">
    <div class="want-question">${escapeText(q.question)}</div>
    <div class="want-options">
      ${options
        .map(
          (w) => `<label class="want-toggle ${chosen.has(w.id) ? 'on' : ''}" title="${escapeText(w.label)}">
            <input type="checkbox" data-want="${escapeText(w.id)}" ${chosen.has(w.id) ? 'checked' : ''} />
            ${escapeText(optionText(w))} <span class="chip">${w.entries.length}</span>
          </label>`,
        )
        .join('')}
    </div>
  </div>`;
}

// The chip text: the argument alone, since the question above it carries the verb.
function optionText(w) {
  if (w.kind === 'rearranges') return String(w.arg);
  if (w.kind === 'runs-on' || w.kind === 'spares') return String(w.arg);
  return w.label.replace(/^(grabs a molecule carrying|puts|takes|joins groups into|is not listed as inhibited by)\s*/, '').replace(/\s(on|off)$/, '');
}

/* ---------- the results ---------- */

function emptyPanel(vocabulary) {
  return `<div class="panel">
    <strong>Nothing asked for yet</strong>
    <p class="blurb">Tick a behaviour on the left. ${vocabulary.length} of them are on offer, every one
    of them a field already committed in the catalogue file. Ask for two that no single entry does and
    this screen starts looking at pairings instead.</p>
    <p class="blurb">A worked example: ask for <em>puts a phosphate on</em> and <em>takes a phosphate
    off</em> together. No single entry does both, so the screen proposes pairs and runs the same
    temperature, pH, cofactor and product-inhibition checks the bench uses over each one.</p>
  </div>`;
}

function askedPanel(result) {
  return `<div class="panel asked-panel">
    <strong>You asked for ${result.wants.length} behaviour${result.wants.length === 1 ? '' : 's'}</strong>
    <div class="want-chips">${result.wants.map((w) => `<span class="chip">${escapeText(w.label)}</span>`).join('')}</div>
    <div class="score-note">Searched ${result.searchedSizes.map((n) => `${n}`).join(' then ') || '—'}
    ${result.searchedSizes.length > 1 ? 'entries at a time' : 'entry at a time'}, over the fixed forty.
    ${escapeText(result.closestNote)}</div>
  </div>`;
}

function impossiblePanel(result) {
  return `<div class="panel not-in-catalogue">
    <strong>Not in this catalogue at all</strong>
    <ul>${result.impossible.map((w) => `<li>${escapeText(w.label)}</li>`).join('')}</ul>
    <div class="score-note">No entry of the forty has a field saying it does this, so no build below can
    cover it. The catalogue is fixed and cannot be extended from the interface — that is the point of
    it. Drop the behaviour or ask for something near it.</div>
  </div>`;
}

function buildCard(build, index) {
  const ruled = build.worst === 'red';
  const short = build.covered < build.total;
  return `<article class="panel build-card ${short ? 'partial' : ruled ? 'ruled-out' : 'clear'}">
    <header class="build-head">
      <div>
        <h3>${escapeText(build.label)}</h3>
        <div class="cartoon-label">${build.domains.map((d) => escapeText(d.domain)).join(' · ')} — cartoon domains, no residue detail</div>
      </div>
      <div class="build-count">
        <span class="score-value">${build.covered}/${build.total}</span>
        <span class="cartoon-label">behaviours covered</span>
      </div>
    </header>

    <div class="build-pieces">
      ${build.entries.map((e) => `<div class="build-piece" style="--family-hue:${FAMILY_STYLE[e.family].hue}">
        ${enzymePiece(e, 72)}
        <div>
          <strong>${escapeText(e.name)}</strong>
          <div class="cartoon-label">${escapeText(e.domain.label)} · cofactor ${escapeText(e.cofactor)}</div>
          ${windowBars(e)}
        </div>
      </div>`).join('')}
    </div>

    <div class="coverage-list">
      ${build.coverage
        .map(
          (r) => `<div class="filter-item ${r.met ? 'pass' : 'fail'}">
            <span class="filter-mark">${r.met ? '✓' : '✗'}</span>
            <div>
              <strong>${escapeText(r.label)}</strong>
              <div class="light-message">${escapeText(r.detail)}</div>
            </div>
          </div>`,
        )
        .join('')}
    </div>

    <div class="lights">
      <strong>Can they share one pot?</strong>
      ${build.lights
        .map(
          (l) => `<div class="light-row ${l.colour}">
            <span class="light-dot ${l.colour}"></span>
            <span class="light-label">${LIGHT_LABELS[l.id] ?? l.id}</span>
            <span class="light-message">${escapeText(l.message)}</span>
          </div>`,
        )
        .join('')}
    </div>

    <div class="verdict ${short || ruled ? 'ruled-out' : ''}">
      <strong>${escapeText(build.verdict.headline)}</strong>
      <div>${escapeText(build.verdict.detail)}</div>
      ${!short && !ruled
        ? `<div class="score-note">"${escapeText(PASS_VERDICT)}" is the strongest thing this app will
           ever say about a build. It is the absence of a red flag from a cartoon. There is no
           validated or approved state here, and nothing above says this would fold, function, or be
           safe.</div>`
        : ''}
    </div>

    ${build.missing.length
      ? `<div class="score-note">Uncovered: ${build.missing.map((m) => `<strong>${escapeText(m)}</strong>`).join(', ')}.</div>`
      : ''}

    ${build.entries.length > 1 ? domainMap(build.entries[0]) : ''}

    <div class="actions">
      <button class="btn small primary" data-bench="${escapeText(build.entryIds.join('+'))}">Send to the bench</button>
      ${build.entries.length === 2 ? `<button class="btn small" data-splice-build="${escapeText(build.entryIds.join('+'))}">Cartoon it in the splice table</button>` : ''}
      <button class="btn small ghost" data-export-build="${index}">Export this build</button>
    </div>
  </article>`;
}

function notCheckedPanel() {
  return `<div class="panel not-checked">
    <h4>Not checked — here or on any other screen</h4>
    <ul>${NOT_CHECKED.map((l) => `<li>${escapeText(l)}</li>`).join('')}</ul>
    <div class="score-note">${escapeText(CARTOON_PHYSICS_NOTE)} This list sits beside the verdict
    rather than under it, because it is the larger part of the truth. Covering a behaviour means a
    committed catalogue field says the entry does it — not that this team would run, fold, express or
    exist.</div>
  </div>`;
}

/* ---------- wiring ---------- */

function wire(root, result) {
  const vocabulary = behaviourVocabulary(state.catalogue.entries);
  const byIdMap = new Map(vocabulary.map((w) => [w.id, w]));

  root.onchange = (e) => {
    const box = e.target.closest('[data-want]');
    if (box) {
      const want = byIdMap.get(box.dataset.want);
      if (!want) return;
      const wants = box.checked
        ? [...(state.wants ?? []), { kind: want.kind, arg: want.arg }]
        : (state.wants ?? []).filter((w) => wantId(w) !== want.id);
      logEvent('workstation.want', { want: want.id, on: box.checked, picked: wants.length });
      setState({ wants });
      return;
    }
    const sel = e.target.closest('[data-want-select]');
    if (sel) {
      const kind = sel.dataset.wantSelect;
      const rest = (state.wants ?? []).filter((w) => w.kind !== kind);
      const wants = sel.value === '' ? rest : [...rest, { kind, arg: Number(sel.value) }];
      logEvent('workstation.want', { want: `${kind}:${sel.value}`, on: sel.value !== '', picked: wants.length });
      setState({ wants });
    }
  };

  root.onclick = (e) => {
    if (e.target.id === 'clear-wants') {
      setState({ wants: [] });
      return;
    }
    const bench = e.target.closest('[data-bench]');
    if (bench) {
      const ids = bench.dataset.bench.split('+');
      logEvent('workstation.to-bench', { build: bench.dataset.bench });
      setState({ screen: 'bench', lane: ids, playStage: null });
      return;
    }
    const splice = e.target.closest('[data-splice-build]');
    if (splice) {
      const [a, b] = splice.dataset.spliceBuild.split('+').map((id) => entry(id));
      logEvent('workstation.to-splice', { a: a.id, b: b.id });
      setState({ screen: 'splice', spliceA: a, siteA: a.domain.sites[0].id, spliceB: b, siteB: b.domain.sites[0].id });
      return;
    }
    const exp = e.target.closest('[data-export-build]');
    if (exp) {
      const build = result.builds[Number(exp.dataset.exportBuild)];
      logEvent('workstation.export', { build: build.id, covered: build.covered, of: build.total });
      download('nano-foundry-build.json', exportBuild({ wants: result.wants, build, impossible: result.impossible }));
    }
  };
}
