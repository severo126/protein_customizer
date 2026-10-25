// The collection: one enzyme at a time, centre stage, on a lit disc.
//
// This is the catalogue as a deck of cards rather than a scrolling list. The
// forty are dealt into archetypes (src/model/archetypes.js — the ordinary
// enzyme classes, hand-curated), each archetype carries a colour theme, and
// stepping left or right flips the whole stage over to the next card, so a
// flip into a new archetype visibly lands somewhere else.
//
// Two things on this screen are load-bearing and are not decoration:
//
//   The stat bars read committed catalogue fields only (src/model/ratings.js).
//   Each one names what it measures. A field the catalogue does not carry
//   reads "unknown"; nothing sits at a flattering middle.
//
//   The figure is a cartoon. It is assembled out of the entry's own region
//   list — one pillar per site, coloured loop / helix / sheet, height from the
//   site's own tension, ring sized by the domain radius — exactly the data the
//   flat card and the vacuum already draw, and nothing else. There is no
//   coordinate set behind it, the caption says so, and no amount of theming is
//   allowed to imply otherwise.

import { state, setState, entry } from './app.js';
import { enzymeBody, REGION_COLOUR, escapeText } from './cartoon.js';
import { ARCHETYPES, ARCHETYPE_NOTE, archetypeOf, deal, dealtOrder } from '../model/archetypes.js';
import { ratings, factChips, RATINGS_NOTE } from '../model/ratings.js';
import { behaviourVocabulary, entrySatisfies } from '../model/behaviours.js';
import { STARTERS, starter } from '../model/molecules.js';
import { runStage } from '../model/pipeline.js';
import { openReaction } from './reaction.js';
import { showSources } from './sources.js';

const FLIP_MS = 420;

// The order the deck flips through, and the filter drawer's state, both live
// here rather than in app state: they are this screen's business and a flip
// must not re-render the rest of the app.
let deck = [];
let root = null;
let flipping = false;

export function renderCollection(container) {
  root = container;
  deck = buildDeck();
  if (!deck.length) {
    root.innerHTML = `<div class="panel" style="padding:16px"><h2>Nothing matches</h2>
      <p class="empty">No entry of the forty matches every filter at once. Clear one in the drawer below.</p>
      ${drawer()}</div>`;
    wire();
    return;
  }
  if (state.cardIndex >= deck.length) state.cardIndex = 0;

  root.innerHTML = `<div class="collection">
    <div class="collection-flip" id="collection-flip">${stage(deck[state.cardIndex])}</div>
    ${drawer()}
  </div>`;
  wire();
}

/* ---------- the deck ---------- */

function buildDeck() {
  const all = dealtOrder(state.catalogue.entries);
  const q = (state.cardQuery ?? '').trim().toLowerCase();
  return all.filter((e) => {
    if (state.cardArchetype && archetypeOf(e)?.id !== state.cardArchetype) return false;
    if (state.cardWants?.length) {
      const vocab = vocabulary();
      for (const id of state.cardWants) {
        const want = vocab.find((w) => w.id === id);
        if (want && !entrySatisfies(e, want)) return false;
      }
    }
    if (q) {
      const hay = `${e.name} ${e.id} ${e.group} ${e.blurb} ${e.cofactor}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

let vocabCache = null;
function vocabulary() {
  if (!vocabCache) vocabCache = behaviourVocabulary(state.catalogue.entries);
  return vocabCache;
}

/* ---------- the stage ---------- */

function stage(e) {
  const a = archetypeOf(e);
  const theme = a ?? { hue: 220, accent: 220, label: 'Unfiled', epithet: 'not in any archetype', ec: '', does: '', glyph: '?' };
  const group = a ? deal(state.catalogue.entries).groups.find((g) => g.archetype.id === a.id) : null;
  const inGroup = group ? group.entries.findIndex((x) => x.id === e.id) + 1 : 0;

  return `<section class="card-stage" style="--arch-hue:${theme.hue};--arch-accent:${theme.accent}">
    <div class="card-stage-glow" aria-hidden="true"></div>

    <header class="card-arch">
      <span class="card-arch-glyph" aria-hidden="true">${theme.glyph}</span>
      <div>
        <h2>${escapeText(theme.label)} <small>${escapeText(theme.epithet)}</small></h2>
        <p title="${escapeText(ARCHETYPE_NOTE)}">${escapeText(theme.ec)}${theme.does ? ` · ${escapeText(theme.does)}` : ''}</p>
      </div>
      <span class="card-count">${state.cardIndex + 1} / ${deck.length}${group ? ` · ${inGroup} of ${group.entries.length} in class` : ''}</span>
    </header>

    <div class="card-body">
      <button class="card-nav prev" data-step="-1" aria-label="Previous enzyme">‹</button>

      <div class="card-centre">
        <h3 class="card-name">${escapeText(e.name)}</h3>
        <p class="card-blurb">${escapeText(e.blurb)}</p>
        ${figure(e)}
        <p class="card-figure-note">Cartoon figure, built from this entry's own region list — not a coordinate set,
        and no structure data of any kind is behind it.</p>
      </div>

      <button class="card-nav next" data-step="1" aria-label="Next enzyme">›</button>
    </div>

    <div class="card-stats" title="${escapeText(RATINGS_NOTE)}">
      ${ratings(e).map(statRow).join('')}
    </div>

    <div class="card-foot">
      ${factChips(e).map((c) => `<span class="chip" title="${escapeText(c.title)}">${escapeText(c.label)} <strong>${escapeText(c.value)}</strong></span>`).join('')}
      <span class="card-foot-actions">
        <button class="btn small primary" data-add="${e.id}">Add to bench</button>
        <button class="btn small" data-play="${e.id}">▶ Play</button>
        <button class="btn small ghost" data-splice="${e.id}">Splice</button>
        <button class="btn small ghost" data-sources="${e.id}">Sources</button>
      </span>
    </div>
  </section>`;
}

// The figure: the same cartoon body the rest of the app draws, stood up on a
// lit disc, with one pillar per region in the entry's own site list. Every
// number in here comes off entry.domain.
function figure(e) {
  const sites = e.domain?.sites ?? [];
  const radius = e.domain?.radius ?? 2;
  const discR = 150;
  const pillars = sites
    .map((s, i) => {
      const n = Math.max(sites.length, 1);
      const spread = 164;
      const angle = (-spread / 2 + (spread * i) / Math.max(n - 1, 1)) * (Math.PI / 180);
      const x = 180 + Math.sin(angle) * 132;
      const depth = Math.cos(angle);
      const h = 34 + (s.tension ?? 0.2) * 150;
      const y = 252 - depth * 12;
      const w = 20;
      const colour = REGION_COLOUR[s.region] ?? '#8c95ad';
      return `<g opacity="${(0.45 + depth * 0.4).toFixed(2)}">
        <rect x="${(x - w / 2).toFixed(1)}" y="${(y - h).toFixed(1)}" width="${w}" height="${h}" rx="9"
          fill="${colour}" opacity="0.42"/>
        <rect x="${(x - w / 2).toFixed(1)}" y="${(y - h).toFixed(1)}" width="${w}" height="9" rx="4.5" fill="${colour}"/>
        <text x="${x.toFixed(1)}" y="${(y + 16).toFixed(1)}" text-anchor="middle" font-size="10" fill="#a3abc2">${escapeText(s.region)}</text>
      </g>`;
    })
    .join('');

  return `<div class="card-figure">
    <svg viewBox="0 0 360 300" width="100%" height="100%" role="img"
      aria-label="Stylised cartoon game piece for ${escapeText(e.name)} standing on a lit disc, with one pillar per region in its catalogue entry. Not a coordinate set.">
      <defs>
        <radialGradient id="disc-${e.id}" cx="50%" cy="50%">
          <stop offset="0%" stop-color="hsl(var(--arch-hue) 90% 72%)" stop-opacity="0.95"/>
          <stop offset="52%" stop-color="hsl(var(--arch-hue) 85% 55%)" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="hsl(var(--arch-hue) 75% 45%)" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="halo-${e.id}" cx="50%" cy="42%">
          <stop offset="0%" stop-color="hsl(var(--arch-accent) 90% 70%)" stop-opacity="0.26"/>
          <stop offset="100%" stop-color="hsl(var(--arch-accent) 90% 60%)" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <ellipse cx="180" cy="150" rx="178" ry="150" fill="url(#halo-${e.id})"/>
      ${pillars}

      <g class="card-disc">
        <ellipse cx="180" cy="248" rx="${discR}" ry="40" fill="url(#disc-${e.id})"/>
        <ellipse cx="180" cy="248" rx="${(discR * 0.7).toFixed(0)}" ry="26" fill="none"
          stroke="hsl(var(--arch-hue) 95% 80%)" stroke-opacity="0.6" stroke-width="2"/>
        <ellipse cx="180" cy="248" rx="${(discR * (0.26 + radius / 12)).toFixed(0)}" ry="${(10 + radius * 2).toFixed(0)}"
          fill="none" stroke="hsl(var(--arch-hue) 95% 88%)" stroke-opacity="0.38" stroke-width="1.5" stroke-dasharray="6 8"/>
      </g>

      <g class="card-piece" transform="translate(90 68) scale(1.8)">
        ${enzymeBody(e, { detail: true, ids: `card-${e.id}` })}
      </g>
    </svg>
    <span class="card-disc-caption">disc ring scaled to the entry's cartoon radius (${radius}) · pillar height from each site's own tension value</span>
  </div>`;
}

function statRow(r) {
  const what = escapeText(r.what);
  if (r.unknown) {
    return `<div class="stat unknown" title="${what}">
      <span class="stat-label">${escapeText(r.label)}</span>
      <span class="stat-track"><span class="stat-hatch"></span></span>
      <span class="stat-value">unknown</span>
    </div>`;
  }
  if (r.kind === 'range') {
    return `<div class="stat" title="${what}">
      <span class="stat-label">${escapeText(r.label)}</span>
      <span class="stat-track"><span class="stat-range" style="left:${r.left.toFixed(1)}%;width:${Math.max(r.width, 1.5).toFixed(1)}%"></span></span>
      <span class="stat-value">${escapeText(r.display)}</span>
    </div>`;
  }
  if (r.kind === 'band') {
    const segs = r.bands
      .map((b, i) => `<span class="stat-seg ${i <= r.index ? 'on' : ''}" title="${escapeText(b)}"></span>`)
      .join('');
    return `<div class="stat" title="${what}">
      <span class="stat-label">${escapeText(r.label)}</span>
      <span class="stat-track segs">${segs}</span>
      <span class="stat-value">${escapeText(r.display)} <small>(band ${r.index + 1} of ${r.bands.length})</small></span>
    </div>`;
  }
  const pct = r.max ? Math.min(100, (r.value / r.max) * 100) : 0;
  return `<div class="stat" title="${what}">
    <span class="stat-label">${escapeText(r.label)}</span>
    <span class="stat-track"><span class="stat-fill" style="width:${pct.toFixed(1)}%"></span></span>
    <span class="stat-value">${escapeText(r.display)}</span>
  </div>`;
}

/* ---------- the drawer ---------- */

// Filter and search, collapsed by default so the card owns the screen. The
// behaviour chips are the workstation's vocabulary (src/model/behaviours.js),
// every one of them derived from a committed catalogue field and carrying the
// count of entries that satisfy it, so the picker never implies the catalogue
// is bigger than it is.
const DRAWER_KINDS = [
  { kind: 'grabs', label: 'Takes a substrate carrying' },
  { kind: 'adds', label: 'Adds' },
  { kind: 'removes', label: 'Removes' },
  { kind: 'joins', label: 'Joins at' },
  { kind: 'rearranges', label: 'Rearranges' },
  { kind: 'runs-on', label: 'Runs on' },
];

function drawer() {
  const open = !!state.cardDrawer;
  const vocab = vocabulary();
  const picked = state.cardWants ?? [];
  const total = state.catalogue.entries.length;

  const chips = DRAWER_KINDS.map((k) => {
    const items = vocab.filter((w) => w.kind === k.kind);
    if (!items.length) return '';
    return `<div class="drawer-row">
      <span class="drawer-row-label">${escapeText(k.label)}</span>
      <span class="drawer-chips">${items
        .map(
          (w) => `<button class="pill ${picked.includes(w.id) ? 'on' : ''}" data-want="${escapeText(w.id)}"
            title="${escapeText(w.label)} — ${w.entries.length} of ${total} entries">${escapeText(String(w.arg ?? w.label))}
            <small>${w.entries.length}</small></button>`,
        )
        .join('')}</span>
    </div>`;
  }).join('');

  const cofactorFree = vocab.find((w) => w.kind === 'cofactor-free');

  return `<section class="card-drawer ${open ? 'open' : ''}">
    <button class="drawer-handle" id="drawer-handle" aria-expanded="${open}">
      <span>Filter &amp; search</span>
      <span class="drawer-state">${deck.length} of ${total}${picked.length || state.cardQuery || state.cardArchetype ? ' · filtered' : ''}</span>
      <span class="drawer-caret" aria-hidden="true">${open ? '▾' : '▴'}</span>
    </button>
    ${
      open
        ? `<div class="drawer-body">
            <div class="drawer-row">
              <span class="drawer-row-label">Search</span>
              <input class="drawer-search" id="drawer-search" type="search" placeholder="name, group or cofactor"
                value="${escapeText(state.cardQuery ?? '')}" />
              <button class="btn small ghost" id="drawer-clear">Clear all</button>
            </div>
            <div class="drawer-row">
              <span class="drawer-row-label">Archetype</span>
              <span class="drawer-chips">${ARCHETYPES.map((a) => {
                const n = state.catalogue.entries.filter((e) => archetypeOf(e)?.id === a.id).length;
                return `<button class="pill ${state.cardArchetype === a.id ? 'on' : ''}" data-arch="${a.id}"
                  style="--arch-hue:${a.hue}" title="${escapeText(a.ec)}">${escapeText(a.label)} <small>${n}</small></button>`;
              }).join('')}</span>
            </div>
            ${
              cofactorFree
                ? `<div class="drawer-row">
                    <span class="drawer-row-label">Cofactor</span>
                    <span class="drawer-chips"><button class="pill ${picked.includes(cofactorFree.id) ? 'on' : ''}"
                      data-want="${escapeText(cofactorFree.id)}" title="Needs no cofactor at all — ${cofactorFree.entries.length} of ${total} entries">needs none
                      <small>${cofactorFree.entries.length}</small></button></span>
                  </div>`
                : ''
            }
            ${chips}
            <p class="drawer-note">Every filter reads a committed field of the fixed forty. There is no database
            behind this drawer, no lookup, and no way to add an entry.</p>
          </div>`
        : ''
    }
  </section>`;
}

/* ---------- interaction ---------- */

function wire() {
  root.onclick = (e) => {
    const step = e.target.closest('[data-step]');
    if (step) return flip(Number(step.dataset.step));

    const handle = e.target.closest('#drawer-handle');
    if (handle) return setState({ cardDrawer: !state.cardDrawer });

    const arch = e.target.closest('[data-arch]');
    if (arch) {
      const id = arch.dataset.arch;
      return setState({ cardArchetype: state.cardArchetype === id ? null : id, cardIndex: 0 });
    }

    const want = e.target.closest('[data-want]');
    if (want) {
      const id = want.dataset.want;
      const picked = state.cardWants ?? [];
      return setState({
        cardWants: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id],
        cardIndex: 0,
      });
    }

    if (e.target.closest('#drawer-clear')) {
      return setState({ cardWants: [], cardArchetype: null, cardQuery: '', cardIndex: 0 });
    }

    const add = e.target.closest('[data-add]');
    if (add) return setState({ screen: 'bench', lane: [...state.lane, add.dataset.add] });

    const splice = e.target.closest('[data-splice]');
    if (splice) {
      const picked = entry(splice.dataset.splice);
      return setState({ screen: 'splice', spliceA: picked, siteA: picked.domain.sites[0].id });
    }

    const sources = e.target.closest('[data-sources]');
    if (sources) return showSources(entry(sources.dataset.sources));

    const play = e.target.closest('[data-play]');
    if (play) openReaction(entry(play.dataset.play), demoInput(entry(play.dataset.play)));
  };

  const search = root.querySelector('#drawer-search');
  if (search) {
    search.oninput = () => {
      state.cardQuery = search.value;
      deck = buildDeck();
      state.cardIndex = 0;
      const stageEl = root.querySelector('#collection-flip');
      if (stageEl && deck.length) stageEl.innerHTML = stage(deck[state.cardIndex]);
      const stateEl = root.querySelector('.drawer-state');
      if (stateEl) stateEl.textContent = `${deck.length} of ${state.catalogue.entries.length} · filtered`;
    };
  }

  document.onkeydown = (ev) => {
    if (state.screen !== 'collection') return;
    if (ev.target.matches('input, textarea')) return;
    if (ev.key === 'ArrowRight') flip(1);
    if (ev.key === 'ArrowLeft') flip(-1);
  };
}

// The flip: the stage turns away, the next card is built while it is edge-on,
// and it turns back. Nothing outside the stage re-renders, so the drawer keeps
// its scroll position and the rest of the app is untouched.
function flip(step) {
  if (flipping || deck.length < 2) return;
  const el = root.querySelector('#collection-flip');
  if (!el) return;
  flipping = true;

  const outClass = step > 0 ? 'flip-out-left' : 'flip-out-right';
  const inClass = step > 0 ? 'flip-in-right' : 'flip-in-left';
  el.classList.add(outClass);

  window.setTimeout(() => {
    state.cardIndex = (state.cardIndex + step + deck.length) % deck.length;
    el.innerHTML = stage(deck[state.cardIndex]);
    el.classList.remove(outClass);
    el.classList.add(inClass);
    window.setTimeout(() => {
      el.classList.remove(inClass);
      flipping = false;
    }, FLIP_MS / 2);
  }, FLIP_MS / 2);
}

// The Play button needs something for the enzyme to act on. Same rule the flat
// catalogue used: the first starter molecule its own stage rules accept.
function demoInput(e) {
  for (const s of STARTERS) {
    const mol = starter(s.id);
    if (runStage(mol, e).ok) return mol;
  }
  return starter('glucose');
}
