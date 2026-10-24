// The catalogue: three columns, grouped by what the enzyme does to a molecule.

import { state, setState, entry } from './app.js';
import { enzymePiece, moleculePiece, windowBars, domainMap, FAMILY_STYLE, escapeText } from './cartoon.js';
import { STARTERS, starter } from '../model/molecules.js';
import { runStage } from '../model/pipeline.js';
import { showSources } from './sources.js';

export function renderCatalogue(root) {
  const families = ['adds', 'removes', 'creates'];
  root.innerHTML = `
    <div class="section-head">
      <h2>Catalogue</h2>
      <p>Forty hand-curated, commonplace enzymes, grouped by what they do to a molecule. Fixed list —
      there is no database lookup and nothing to upload.</p>
    </div>
    <div class="family-columns">
      ${families.map((f) => column(f)).join('')}
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
    }
  };
}

function column(family) {
  const style = FAMILY_STYLE[family];
  const entries = state.catalogue.entries.filter((e) => e.family === family);
  return `<section class="family-column">
    <div class="family-header">
      <h3><span class="family-dot" style="background:hsl(${style.hue} 70% 55%)"></span>${style.label}
        <span class="chip">${entries.length}</span></h3>
      <p>${style.blurb}</p>
    </div>
    ${entries.map(card).join('')}
  </section>`;
}

function card(e) {
  const demo = demoTransform(e);
  return `<article class="enzyme-card">
    <header>
      <h4>${escapeText(e.name)}</h4>
      <span class="chip"><strong>${escapeText(e.group)}</strong></span>
    </header>
    <p class="blurb">${escapeText(e.blurb)}</p>

    <div class="transform-row">
      ${moleculePiece(demo.input, 68)}
      <span class="transform-arrow" aria-hidden="true">➜</span>
      ${demo.product ? moleculePiece(demo.product, 68) : `<span class="chip">no demo substrate</span>`}
    </div>
    <div class="cartoon-label">substrate in · product out (symbolic)</div>

    <div style="display:flex;gap:10px;align-items:center">
      ${enzymePiece(e, 78)}
      <div style="flex:1">${windowBars(e)}</div>
    </div>
    <div class="cartoon-label">stylised cartoon game piece — not a real coordinate set</div>

    ${domainMap(e)}
    <div class="cartoon-label">${escapeText(e.domain.label)} · loop / helix / sheet regions, no residue detail</div>

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
    <p class="blurb" style="font-size:11px;color:var(--ink-faint)">${escapeText(e.source.note)}</p>
    <button class="btn small ghost" data-sources="${e.id}">Go and check the real biochemistry</button>

    <div class="actions">
      <button class="btn small primary" data-add="${e.id}">Add to bench</button>
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
