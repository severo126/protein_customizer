// The splice table: pick a domain from one entry and a domain from another,
// ask what if these were one protein, and watch the hard-reject filters work.

import { state, setState, entry, laneEntries } from './app.js';
import { constructPiece, domainMap, escapeText } from './cartoon.js';
import { runFilters, spliceFunnel, LINKER_CHOICES } from '../model/splice.js';
import { PASS_VERDICT, NOT_CHECKED, CARTOON_PHYSICS_NOTE } from '../model/disclaimers.js';
import { exportConstruct } from '../model/exportConstruct.js';
import { download } from './bench-view.js';
import { explainRejection } from './gemini.js';
import { logEvent } from './telemetry.js';

export function renderSplice(root) {
  const a = state.spliceA;
  const b = state.spliceB;
  const siteA = a.domain.sites.find((s) => s.id === state.siteA) ?? a.domain.sites[0];
  const siteB = b.domain.sites.find((s) => s.id === state.siteB) ?? b.domain.sites[0];
  const team = laneEntries();
  const verdict = runFilters(a, siteA, b, siteB, state.linker, team);
  const funnel = spliceFunnel(a, b, team);

  root.innerHTML = `
    <div class="section-head">
      <h2>Splice table</h2>
      <p>Two labelled blobs and a linker, laid out with a simple geometric model. Each filter is a
      hard reject with a reason. Nothing here is a structure prediction.</p>
    </div>

    <div class="splice-grid">
      <div style="display:grid;gap:16px;min-width:0">
        <div class="panel construct-stage">
          <strong>${escapeText(a.name)} ⟶ ${escapeText(b.name)}</strong>
          ${constructPiece(verdict.geometry, a.domain.label, b.domain.label)}
          <div class="cartoon-label">stylised cartoon construct — chunky game pieces, not a coordinate set</div>
          <div class="score-note">Every distance on this screen is derived from invented cartoon
          geometry (<strong>${escapeText(a.source.cartoon)}</strong> for ${escapeText(a.name)},
          <strong>${escapeText(b.source.cartoon)}</strong> for ${escapeText(b.name)}). The only numbers
          taken from reference material are the temperature and pH windows, and those are rounded
          teaching ranges rather than measurements.</div>
        </div>

        ${verdictBox(verdict)}

        <div class="panel" style="padding:13px;display:grid;gap:10px">
          <strong>Hard reject filters</strong>
          <div class="filter-list">${verdict.results.map(filterItem).join('')}</div>
          <div class="score-note">${escapeText(CARTOON_PHYSICS_NOTE)}</div>
        </div>

        ${funnelPanel(funnel)}
      </div>

      <div style="display:grid;gap:16px">
        <div class="panel picker">
          <strong>Pick two domains</strong>
          ${picker('A', a, siteA, 'spliceA', 'siteA')}
          ${picker('B', b, siteB, 'spliceB', 'siteB')}
          <div class="picker-row">
            <label for="linker">Linker length — ${state.linker} units (${(state.linker * 0.34).toFixed(2)} nm of reach)</label>
            <input type="range" id="linker" min="${Math.min(...LINKER_CHOICES)}" max="${Math.max(...LINKER_CHOICES)}" step="1" value="${state.linker}" />
            <div class="score-note">Funnel candidates are enumerated at ${LINKER_CHOICES.join(', ')} units.</div>
          </div>
          <div class="score-note">${team.length ? `Checked against the ${team.length}-stage lane on the bench as well.` : 'Nothing on the bench, so the operating-window filter only compares the two parents.'}</div>
          <button class="btn primary" id="export-construct">Export this construct (JSON)</button>
          <div class="score-note">Exports carry domain names and cartoon geometry only — no sequence, by design.</div>
        </div>

        ${notCheckedPanel()}
      </div>
    </div>`;

  wire(root);
}

function picker(which, chosen, site, entryKey, siteKey) {
  return `<div class="picker-row">
    <label for="pick-${which}">Domain ${which}</label>
    <select id="pick-${which}" data-entry-key="${entryKey}" data-site-key="${siteKey}">
      ${state.catalogue.entries
        .map((e) => `<option value="${e.id}" ${e.id === chosen.id ? 'selected' : ''}>${escapeText(e.name)}</option>`)
        .join('')}
    </select>
    <select id="site-${which}" data-site-key="${siteKey}">
      ${chosen.domain.sites
        .map((s) => `<option value="${s.id}" ${s.id === site.id ? 'selected' : ''}>${escapeText(s.label)} (${s.region})</option>`)
        .join('')}
    </select>
    ${domainMap(chosen)}
    <div class="cartoon-label">${escapeText(chosen.domain.label)} · region bands only</div>
  </div>`;
}

function verdictBox(verdict) {
  if (verdict.passed) {
    return `<div class="verdict">
      <h3>${PASS_VERDICT}</h3>
      <div class="meaning">A pass is the absence of a red flag from a cartoon. It is not a statement
      that this construct is stable, viable, correct, or designed — none of those were tested, and
      this app has no such state. See the standing list beside this verdict.</div>
    </div>`;
  }
  const killer = verdict.results.find((r) => !r.pass);
  return `<div class="verdict ruled-out">
    <h3>Ruled out by this toy — ${escapeText(killer.label)}</h3>
    <div class="meaning">${escapeText(killer.reason)}</div>
    <div class="meaning" id="plain-english"></div>
    <button class="btn small" id="explain">Explain this in plain English</button>
  </div>`;
}

function filterItem(r) {
  return `<div class="filter-item ${r.pass ? 'pass' : 'fail'}">
    <span class="filter-mark" aria-hidden="true">${r.pass ? '✓' : '✕'}</span>
    <div><strong>${escapeText(r.label)}</strong><p>${escapeText(r.reason)}</p></div>
  </div>`;
}

function funnelPanel(f) {
  const total = f.went_in || 1;
  const worst = f.funnel.reduce((a, b) => (b.killed > a.killed ? b : a), f.funnel[0]);
  return `<div class="panel funnel">
    <strong>Candidate funnel — ${f.went_in} splice points in, ${f.survivors.length} out</strong>
    <div class="score-note">Every site of ${escapeText(f.pairLabel.split(' + ')[0])} against every site of
    ${escapeText(f.pairLabel.split(' + ')[1])}, at each linker length. Filters run in order, so a
    candidate is counted against the first filter that killed it.</div>
    ${f.funnel
      .map((s) => {
        const remainPct = (s.leaving / total) * 100;
        const killPct = (s.killed / total) * 100;
        return `<div class="funnel-row ${s.id === worst.id && s.killed > 0 ? 'killer' : ''}">
          <span class="funnel-label" title="${escapeText(s.blurb)}">${escapeText(s.label)}</span>
          <div class="funnel-track">
            <div class="funnel-remaining" style="width:${remainPct}%"></div>
            <div class="funnel-killed" style="left:${remainPct}%;width:${killPct}%"></div>
          </div>
          <span class="funnel-count">−${s.killed} → ${s.leaving}</span>
        </div>`;
      })
      .join('')}
    ${
      f.survivors.length
        ? `<div class="survivors">${f.survivors
            .slice(0, 12)
            .map(
              (s) => `<div class="survivor"><span>${escapeText(s.siteA.label)} + ${escapeText(s.siteB.label)}</span>
                <button class="btn small" data-pick-survivor="${s.siteA.id}|${s.siteB.id}|${s.linkerUnits}">${s.linkerUnits} units — show</button></div>`,
            )
            .join('')}</div>`
        : `<div class="empty">Every candidate for this pair was rejected. ${escapeText(worst.label)} killed the most.</div>`
    }
    <div class="score-note">Biggest killer for this pair: <strong>${escapeText(worst.label)}</strong> (${worst.killed}).</div>
  </div>`;
}

function notCheckedPanel() {
  return `<div class="panel not-checked">
    <h4>Not checked — ever, on any screen</h4>
    <ul>${NOT_CHECKED.map((l) => `<li>${escapeText(l)}</li>`).join('')}</ul>
    <div class="score-note">This list sits beside the verdict rather than under it, because it is the
    larger part of the truth.</div>
  </div>`;
}

function wire(root) {
  root.onchange = (e) => {
    const sel = e.target;
    if (sel.id === 'pick-A' || sel.id === 'pick-B') {
      const picked = entry(sel.value);
      setState({ [sel.dataset.entryKey]: picked, [sel.dataset.siteKey]: picked.domain.sites[0].id });
      return;
    }
    if (sel.id === 'site-A') setState({ siteA: sel.value });
    if (sel.id === 'site-B') setState({ siteB: sel.value });
  };

  root.oninput = (e) => {
    if (e.target.id === 'linker') setState({ linker: Number(e.target.value) });
  };

  root.onclick = async (e) => {
    const pick = e.target.closest('[data-pick-survivor]');
    if (pick) {
      const [sa, sb, linker] = pick.dataset.pickSurvivor.split('|');
      setState({ siteA: sa, siteB: sb, linker: Number(linker) });
      return;
    }
    if (e.target.id === 'export-construct') {
      const a = state.spliceA;
      const b = state.spliceB;
      const siteA = a.domain.sites.find((s) => s.id === state.siteA);
      const siteB = b.domain.sites.find((s) => s.id === state.siteB);
      const verdict = runFilters(a, siteA, b, siteB, state.linker, laneEntries());
      logEvent('splice.export', { a: a.id, b: b.id, killedBy: verdict.killedBy });
      download('nano-foundry-construct.json', exportConstruct({ entryA: a, siteA, entryB: b, siteB, linkerUnits: state.linker, verdict }));
      return;
    }
    if (e.target.id === 'explain') {
      const out = root.querySelector('#plain-english');
      const a = state.spliceA;
      const b = state.spliceB;
      const siteA = a.domain.sites.find((s) => s.id === state.siteA);
      const siteB = b.domain.sites.find((s) => s.id === state.siteB);
      const verdict = runFilters(a, siteA, b, siteB, state.linker, laneEntries());
      out.textContent = 'Asking for a plain-English explanation…';
      out.textContent = await explainRejection({ a, b, siteA, siteB, linker: state.linker, verdict });
    }
  };
}
