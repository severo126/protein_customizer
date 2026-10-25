// The catalogue: three columns, grouped by what the enzyme does to a molecule.

import { state, setState, entry, laneEntries } from './app.js';
import { enzymePiece, moleculePiece, windowBars, domainMap, regionLegend, FAMILY_STYLE, escapeText } from './cartoon.js';
import { STARTERS, starter, describe } from '../model/molecules.js';
import { runStage, runPipeline } from '../model/pipeline.js';
import { suggestNext } from '../model/suggest.js';
import { openReaction } from './reaction.js';
import { showSources } from './sources.js';

// The verdict for each entry against whatever is on the bench, so a card can
// badge itself and the screen can filter. Rebuilt on every render because the
// lane changes under it.
let fit = new Map();
let benchProduct = null;

export function renderCatalogue(root) {
  const families = ['adds', 'removes', 'creates'];
  const lane = laneEntries();
  const run = runPipeline(starter(state.starterId), lane);
  const suggestions = suggestNext(state.catalogue.entries, lane, run.product);
  // Only badge a card once something is actually on the bench; with an empty
  // lane there is nothing for an entry to fit or fail.
  fit = lane.length ? new Map(suggestions.items.map((i) => [i.entry.id, i])) : new Map();
  benchProduct = lane.length && !run.stalled ? run.product : null;
  const filtering = state.catalogueFilter && lane.length > 0;

  root.innerHTML = `
    <div class="section-head">
      <h2>Catalogue</h2>
    </div>

    <div class="panel catalogue-bar">
      ${
        lane.length
          ? `<label class="palette-toggle">
              <input type="checkbox" id="catalogue-filter" ${state.catalogueFilter ? 'checked' : ''} />
              Only what fits the bench
            </label>
            <span class="chip" title="${escapeText(suggestions.note)}">bench
              <strong>${escapeText(run.stalled ? 'stalled' : describe(run.product))}</strong></span>
            <span class="chip">${suggestions.counts.fits} fit</span>
            <span class="chip">${suggestions.counts.caution} caution</span>
            <span class="chip">${suggestions.counts.blocked} ruled out</span>`
          : ``
      }
      ${regionLegend()}
    </div>

    <div class="family-columns">
      ${families.map((f) => column(f, filtering)).join('')}
    </div>`;

  // Assignment rather than addEventListener: renderCatalogue runs on every
  // state change and must not stack handlers on the same root.
  root.onclick = (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      setState({ screen: 'bench', lane: [...state.lane, add.dataset.add] });
      return;
    }
    const sources = e.target.closest('[data-sources]');
    if (sources) {
      showSources(entry(sources.dataset.sources));
      return;
    }
    const splice = e.target.closest('[data-splice]');
    if (splice) {
      const picked = entry(splice.dataset.splice);
      setState({ screen: 'splice', spliceA: picked, siteA: picked.domain.sites[0].id });
      return;
    }
    const play = e.target.closest('[data-play-pair]');
    if (play) {
      const picked = entry(play.dataset.playPair);
      // Play it against what the bench is actually holding when that pairing
      // runs, and against a demo substrate otherwise.
      const against =
        benchProduct && runStage(benchProduct, picked).ok ? benchProduct : demoTransform(picked).input;
      openReaction(picked, against);
    }
  };

  root.onchange = (e) => {
    if (e.target.id === 'catalogue-filter') setState({ catalogueFilter: e.target.checked });
  };
}

function column(family, filtering) {
  const style = FAMILY_STYLE[family];
  const all = state.catalogue.entries.filter((e) => e.family === family);
  const shown = filtering ? all.filter((e) => fit.get(e.id)?.verdict !== 'blocked') : all;
  const hidden = all.length - shown.length;
  return `<section class="family-column" style="--family-hue:${style.hue}">
    <div class="family-header">
      <h3><span class="family-dot" style="background:hsl(${style.hue} 70% 55%)"></span>${style.label}
        <span class="chip" title="${escapeText(style.blurb)}">${shown.length}${filtering ? ` of ${all.length}` : ''}</span></h3>
      ${hidden ? `<p class="hidden-note">${hidden} hidden by the filter</p>` : ''}
    </div>
    ${shown.map(card).join('')}
    ${!shown.length ? `<p class="palette-note">Nothing here fits the lane.</p>` : ''}
  </section>`;
}

function card(e) {
  const demo = demoTransform(e);
  const verdict = fit.get(e.id);
  const badge =
    verdict && !verdict.reasons.length
      ? ''
      : verdict
        ? `<span class="fit-badge ${verdict.verdict}" title="${escapeText(verdict.headline)}">${
            { fits: 'fits the bench', caution: 'caution', blocked: 'ruled out' }[verdict.verdict]
          }</span>`
        : '';
  return `<article class="enzyme-card ${verdict?.reasons.length ? verdict.verdict : ''}">
    <header>
      <h4>${escapeText(e.name)}</h4>
      <span class="chip"><strong>${escapeText(e.group)}</strong></span>
    </header>
    ${badge}
    ${verdict && verdict.reasons.length ? `<p class="fit-reason ${verdict.verdict}">${escapeText(verdict.headline)}</p>` : ''}
    <p class="blurb">${escapeText(e.blurb)}</p>

    <div class="transform-row">
      ${moleculePiece(demo.input, 68)}
      <span class="transform-arrow" aria-hidden="true">➜</span>
      ${demo.product ? moleculePiece(demo.product, 68) : `<span class="chip">no demo substrate</span>`}
    </div>
    <div class="cartoon-label">substrate → product (symbolic)</div>

    <div style="display:flex;gap:10px;align-items:center">
      ${enzymePiece(e, 78)}
      <div style="flex:1">${windowBars(e)}</div>
    </div>
    <div class="cartoon-label">cartoon game piece — not a coordinate set</div>

    ${domainMap(e)}
    <div class="cartoon-label">${escapeText(e.domain.label)} · region bands only</div>

    <div class="meta">
      <span class="chip">cofactor <strong>${escapeText(e.cofactor)}</strong></span>
      ${(e.destroys ?? []).length ? `<span class="chip">consumes <strong>${e.destroys.map(escapeText).join(', ')}</strong></span>` : ''}
      ${(e.inhibitedBy ?? []).length ? `<span class="chip">inhibited by <strong>${e.inhibitedBy.map(escapeText).join(', ')}</strong></span>` : ''}
    </div>

    <div class="meta" title="${escapeText(e.source.note)}">
      <span class="chip">windows <strong>${escapeText(e.source.windows)}</strong></span>
      <span class="chip">cartoon <strong>${escapeText(e.source.cartoon)}</strong></span>
      <span class="chip">regions <strong>${escapeText(e.source.domain_regions)}</strong></span>
    </div>
    <button class="btn small ghost" data-sources="${e.id}">Sources</button>

    <div class="actions">
      <button class="btn small primary" data-add="${e.id}">Add to bench</button>
      <button class="btn small" data-play-pair="${e.id}">▶ Play</button>
      <button class="btn small ghost" data-splice="${e.id}">Use in splice</button>
    </div>
  </article>`;
}

// Pick the first starting molecule this enzyme will accept, so the card can
// show a real in/out pair from the same rules the bench uses.
function demoTransform(e) {
  for (const s of STARTERS) {
    const mol = starter(s.id);
    const r = runStage(mol, e);
    if (r.ok) return { input: mol, product: r.product };
  }
  const fallback = starter('glucose');
  return { input: fallback, product: null };
}
