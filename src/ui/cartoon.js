// Drawing. Everything here is deliberately a game piece: a chunky silhouette,
// a hinged jaw with an active-site cleft, a bevel and a drop shadow. The
// ribbons inside a piece are drawn from the loop / helix / sheet labels in the
// catalogue entry's own region list, so the decoration tracks the data — but
// none of it is derived from a coordinate set, and every view that uses it
// carries the "stylised cartoon" label so nobody mistakes it for a structure.

import { groupMeta, prettyCore } from '../model/molecules.js';

export const FAMILY_STYLE = {
  adds: { label: 'Adds', hue: 196, blurb: 'Puts a group onto a substrate — phosphate, methyl, sugar, acyl.' },
  removes: { label: 'Removes', hue: 14, blurb: 'Takes a group off — hydrolases, phosphatases, decarboxylases.' },
  creates: { label: 'Creates / rearranges', hue: 150, blurb: 'Forms a new bond or skeleton — ligases, isomerases, synthases.' },
};

// The same three colours the domain map uses, so a ribbon inside a piece and a
// band under it mean the same thing.
export const REGION_COLOUR = { loop: '#4ddba0', helix: '#ff6b6b', sheet: '#ffb648' };

// Chunky silhouettes in a 100×100 box.
const SHAPES = {
  clamp: 'M20 24h26l8 14h26v38H64l-8 12H20z',
  barrel: 'M24 22h52l6 28-6 28H24l-6-28z',
  wedge: 'M22 76 50 20l28 56z',
  saddle: 'M20 34c14-14 46-14 60 0l-8 42c-14 10-30 10-44 0z',
  fan: 'M50 78 18 34l16-12 16 20 16-20 16 12z',
  hook: 'M30 20h22v34c0 10 8 14 18 14v22c-26 0-40-14-40-34z',
  scissors: 'M24 20l26 30 26-30 10 10-24 28 24 24-10 10-26-26-26 26-10-10 24-24-24-28z',
  pincer: 'M26 20h18l6 26 6-26h18l-8 36 10 24H24l10-24z',
  popper: 'M34 20h32l6 20-6 10 10 28H24l10-28-6-10z',
  drum: 'M50 18c18 0 30 6 30 14v36c0 8-12 14-30 14s-30-6-30-14V32c0-8 12-14 30-14z',
  gear: 'M44 16h12l3 10 10 4 9-6 8 8-6 9 4 10 10 3v12l-10 3-4 10 6 9-8 8-9-6-10 4-3 10H44l-3-10-10-4-9 6-8-8 6-9-4-10-10-3V54l10-3 4-10-6-9 8-8 9 6 10-4z',
  stapler: 'M20 30h60l-6 20h10v26H24V50h10z',
};

// The hinge of the jaw, in piece coordinates. The cleft opens to the right.
export const HINGE = { x: 60, y: 50 };
const JAW_TOP = `M 0 0 H 100 V 34 L ${HINGE.x} ${HINGE.y} L 0 48 Z`;
const JAW_BOTTOM = `M 0 100 H 100 V 66 L ${HINGE.x} ${HINGE.y} L 0 52 Z`;

let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}

function hsl(hue, s, l) {
  return `hsl(${hue} ${s}% ${l}%)`;
}

// The flat look: every shadow is the same solid indigo, offset straight down,
// and dark ink on a bright fill matches the stylesheet's --shadow-ink and
// --on-accent tokens.
const SHADOW_INK = '#0c0f33';
const ON_ACCENT = '#1b1240';

/* ---------- secondary-structure ribbons ---------- */

// A coil: a run of alternating half-circles, which reads as a helix at this
// size without pretending to be one.
function helixRibbon(x0, x1, y, turns) {
  const step = (x1 - x0) / turns;
  const r = step / 2;
  let d = `M ${x0} ${y}`;
  for (let i = 0; i < turns; i++) {
    d += ` A ${r} ${r * 1.5} 0 0 ${i % 2 === 0 ? 1 : 0} ${x0 + step * (i + 1)} ${y}`;
  }
  return d;
}

// A sheet: flat arrows pointing along the band.
function sheetRibbon(x0, x1, y) {
  const n = 2;
  const w = (x1 - x0) / n;
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + i * w;
    d += ` M ${x} ${y} h ${w - 10} l 0 -5 l 9 5 l -9 5 l 0 -5 Z`;
  }
  return d.trim();
}

// A loop: a lazy meander.
function loopRibbon(x0, x1, y) {
  const m = (x0 + x1) / 2;
  return `M ${x0} ${y} C ${x0 + (m - x0) * 0.4} ${y - 9}, ${m - (m - x0) * 0.4} ${y + 9}, ${m} ${y}` +
    ` S ${x1 - (x1 - m) * 0.4} ${y - 9}, ${x1} ${y}`;
}

function ribbon(site, x0, x1, y) {
  const colour = REGION_COLOUR[site.region] ?? '#8c95ad';
  if (site.region === 'sheet') {
    return `<path d="${sheetRibbon(x0, x1, y)}" fill="${colour}" opacity="0.34"/>`;
  }
  const d = site.region === 'helix' ? helixRibbon(x0, x1, y, 4) : loopRibbon(x0, x1, y);
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="4" stroke-linecap="round" opacity="0.34"/>`;
}

/* ---------- the enzyme body ---------- */

// The body as a bare SVG group in a 100×100 box, so the catalogue piece and
// the reaction scene draw the same object. `jaws` names the two halves so a
// stylesheet can hinge them; nothing here animates on its own.
export function enzymeBody(entry, { detail = true, ids = uid('e') } = {}) {
  const hue = entry.cartoon.hue;
  const d = SHAPES[entry.cartoon.shape] ?? SHAPES.drum;
  const sites = entry.domain?.sites ?? [];
  const origin = `transform-origin:${HINGE.x}px ${HINGE.y}px;transform-box:view-box`;

  const studs = [];
  if (detail) {
    for (let i = 0; i < entry.cartoon.pips; i++) {
      const y = 30 + i * 14;
      if (Math.abs(y - HINGE.y) < 6) continue;
      studs.push(`<circle cx="20" cy="${y}" r="4.5" fill="${hsl(hue, 45, 24)}" opacity="0.9"/>`);
    }
  }

  const topRibbons = detail
    ? [sites[0] ? ribbon(sites[0], 26, 74, 28) : '', sites[2] ? ribbon(sites[2], 24, 54, 41) : ''].join('')
    : '';
  const bottomRibbons = detail && sites[1] ? ribbon(sites[1], 26, 74, 72) : '';

  return `<defs>
      <clipPath id="${ids}-clip"><path d="${d}"/></clipPath>
    </defs>

    <path d="${d}" transform="translate(0 5)" fill="${SHADOW_INK}" opacity="0.85"/>

    <g clip-path="url(#${ids}-clip)">
      <rect x="0" y="0" width="100" height="100" fill="${hsl(hue, 45, 22)}"/>
      <g class="nf-jaw nf-jaw-top" style="${origin}">
        <path d="${JAW_TOP}" fill="${hsl(hue, 70, 58)}"/>
        ${topRibbons}
        <path d="${JAW_TOP}" fill="none" stroke="${hsl(hue, 80, 84)}" stroke-width="2.4" opacity="0.55"/>
      </g>
      <g class="nf-jaw nf-jaw-bottom" style="${origin}">
        <path d="${JAW_BOTTOM}" fill="${hsl(hue + 16, 66, 48)}"/>
        ${bottomRibbons}
        <path d="${JAW_BOTTOM}" fill="none" stroke="${hsl(hue, 80, 84)}" stroke-width="2.4" opacity="0.4"/>
      </g>
      <circle class="nf-site-glow" cx="${HINGE.x + 2}" cy="${HINGE.y}" r="6"
        fill="${hsl(hue, 90, 72)}" opacity="0.28"/>
      ${studs.join('')}
    </g>

    <path d="${d}" fill="none" stroke="${hsl(hue, 80, 86)}" stroke-width="2.2" stroke-linejoin="round" opacity="0.7"/>`;
}

// One enzyme as a game piece.
export function enzymePiece(entry, size = 96) {
  const detail = size >= 46;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="nf-enzyme" role="img"
      aria-label="Stylised cartoon game piece for ${escapeText(entry.name)}: a hinged jaw with an active-site cleft. Not a coordinate set.">
    ${enzymeBody(entry, { detail })}
  </svg>`;
}

// A legend for the ribbons, so the colours inside a piece mean something.
export function regionLegend() {
  return `<div class="region-legend">${Object.entries(REGION_COLOUR)
    .map(([region, colour]) => `<span><i style="background:${colour}"></i>${region}</span>`)
    .join('')}</div>`;
}

// One molecule as a faceted core with its groups bonded around it.
export function moleculeGlyph(mol, { ids = uid('m') } = {}) {
  const n = mol.groups.length || 1;
  const bonds = [];
  const marbles = [];
  mol.groups.forEach((g, i) => {
    const meta = groupMeta(g);
    const angle = (-90 + (360 / Math.max(n, 3)) * i) * (Math.PI / 180);
    const x = 50 + Math.cos(angle) * 33;
    const y = 50 + Math.sin(angle) * 33;
    bonds.push(`<line x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"
      stroke="#a7add8" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`);
    marbles.push(`<g class="nf-group" data-group="${escapeText(g)}">
      <circle cx="${x.toFixed(2)}" cy="${(y + 3).toFixed(2)}" r="11.5" fill="${SHADOW_INK}" opacity="0.85"/>
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="11.5" fill="${hsl(meta.hue, 78, 60)}"
        stroke="${hsl(meta.hue, 85, 84)}" stroke-width="1.6"/>
      <text x="${x.toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="middle" font-size="9"
        font-weight="700" fill="${ON_ACCENT}">${meta.symbol}</text>
    </g>`);
  });

  const hexPoints = '50,27 70,39 70,61 50,73 30,61 30,39';
  return `${bonds.join('')}
    <polygon points="${hexPoints}" fill="${SHADOW_INK}" opacity="0.85" transform="translate(0 4)"/>
    <polygon points="${hexPoints}" fill="#3b4690" stroke="#8c98e6" stroke-width="2"/>
    <text x="50" y="54" text-anchor="middle" font-size="10" font-weight="700" fill="#eceefb">${shortCore(mol.core)}</text>
    ${marbles.join('')}`;
}

export function moleculePiece(mol, size = 74) {
  if (!mol) return `<div class="empty">—</div>`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="nf-molecule" role="img"
      aria-label="Symbolic cartoon of ${escapeText(prettyCore(mol.core))} with ${mol.groups.length} groups. Not a structure.">
    ${moleculeGlyph(mol)}
  </svg>`;
}

function shortCore(core) {
  const pretty = prettyCore(core);
  return pretty.length > 9 ? `${pretty.slice(0, 8)}…` : pretty;
}

// The spliced construct: two blobs, a linker, and the cut ends marked. Drawn
// from the laid-out cartoon geometry, projected flat onto the join axis.
export function constructPiece(geo, labelA, labelB, { width = 560, height = 230 } = {}) {
  const pad = 46;
  const extent = geo.centreDistance + geo.radiusA + geo.radiusB;
  const widthScale = (width - pad * 2) / Math.max(extent, 1);
  // Cap the blobs so a compact pair does not swell to fill the whole panel and
  // push its own labels off the canvas.
  const heightScale = (height * 0.26) / Math.max(geo.radiusA, geo.radiusB, 0.1);
  const scale = Math.min(widthScale, heightScale);
  const cy = height / 2 - 6;
  const ax = pad + geo.radiusA * scale;
  const bx = ax + geo.centreDistance * scale;
  const rA = geo.radiusA * scale;
  const rB = geo.radiusB * scale;

  // Cut ends, projected onto the axis.
  const exitAx = ax + Math.min(geo.radiusA, len(geo.exitA)) * scale;
  const exitBx = bx - Math.min(geo.radiusB, len(sub(geo.exitB, geo.centreB))) * scale;
  const mid = (exitAx + exitBx) / 2;
  const slack = Math.max(6, (geo.span - geo.joinDistance) * scale * 0.5);

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img"
      aria-label="Stylised cartoon of a two-blob construct joined by a linker. Not a coordinate set.">
    <line x1="${pad / 2}" y1="${cy}" x2="${width - pad / 2}" y2="${cy}" stroke="#333d82" stroke-width="2" stroke-dasharray="6 7"/>

    <path d="M ${exitAx} ${cy} Q ${mid} ${cy - slack} ${exitBx} ${cy}" fill="none" stroke="${SHADOW_INK}" stroke-width="8" stroke-linecap="round" opacity="0.85" transform="translate(0 5)"/>
    <path d="M ${exitAx} ${cy} Q ${mid} ${cy - slack} ${exitBx} ${cy}" fill="none" stroke="#a7add8" stroke-width="8" stroke-linecap="round"/>

    <g>
      <circle cx="${ax}" cy="${cy + 7}" r="${rA}" fill="${SHADOW_INK}" opacity="0.85"/>
      <circle cx="${ax}" cy="${cy}" r="${rA}" fill="#4fbaf0" stroke="#bfe8ff" stroke-width="2.5"/>
      <text x="${ax}" y="${cy + rA + 24}" text-anchor="middle" font-size="13" font-weight="700" fill="#eceefb">${escapeText(labelA)}</text>
    </g>
    <g>
      <circle cx="${bx}" cy="${cy + 7}" r="${rB}" fill="${SHADOW_INK}" opacity="0.85"/>
      <circle cx="${bx}" cy="${cy}" r="${rB}" fill="#f2ad3c" stroke="#ffe1a6" stroke-width="2.5"/>
      <text x="${bx}" y="${cy + rB + 24}" text-anchor="middle" font-size="13" font-weight="700" fill="#eceefb">${escapeText(labelB)}</text>
    </g>

    <circle cx="${exitAx}" cy="${cy}" r="6" fill="#ffc65c" stroke="${SHADOW_INK}" stroke-width="2"/>
    <circle cx="${exitBx}" cy="${cy}" r="6" fill="#ffc65c" stroke="${SHADOW_INK}" stroke-width="2"/>
    <text x="${width / 2}" y="22" text-anchor="middle" font-size="12" fill="#a7add8">${geo.linkerUnits}-unit linker · ${geo.span.toFixed(2)} nm of reach</text>
    <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#7a82b8">${geo.joinDistance.toFixed(2)} nm between cut ends · centres ${geo.centreDistance.toFixed(2)} nm apart</text>
  </svg>`;
}

// Region bands instead of any residue-level strip: a schematic domain map.
export function domainMap(entry, { width = 300 } = {}) {
  const sites = entry.domain.sites;
  const h = 46;
  const bandH = 16;
  const segW = width / sites.length;
  const colour = { loop: '#4ddba0', helix: '#ff6b6b', sheet: '#ffb648' };
  const bands = sites
    .map((s, i) => {
      const x = i * segW;
      return `<rect x="${x + 3}" y="10" width="${segW - 6}" height="${bandH}" rx="5"
          fill="${colour[s.region] ?? '#5a6279'}" opacity="0.85"/>
        <text x="${x + segW / 2}" y="${10 + bandH + 13}" text-anchor="middle" font-size="9.5" fill="#a3abc2">${escapeText(s.region)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${h}" width="100%" height="${h}" role="img"
      aria-label="Schematic domain map of ${entry.domain.label}: region bands only, no residue detail.">
    <rect x="0" y="14" width="${width}" height="8" rx="4" fill="#333d82"/>
    ${bands}
  </svg>`;
}

export function windowBars(entry) {
  const t = bar(entry.temp[0], entry.temp[1], 0, 90);
  const p = bar(entry.ph[0], entry.ph[1], 3, 11);
  return `<div class="window-bars">
    <div class="window-bar"><span>${entry.temp[0]}–${entry.temp[1]} °C</span>
      <div class="window-track"><div class="window-fill" style="left:${t.left}%;width:${t.width}%"></div></div></div>
    <div class="window-bar"><span>pH ${entry.ph[0]}–${entry.ph[1]}</span>
      <div class="window-track"><div class="window-fill" style="left:${p.left}%;width:${p.width}%"></div></div></div>
  </div>`;
}

function bar(low, high, min, max) {
  const span = max - min;
  return { left: ((low - min) / span) * 100, width: Math.max(2, ((high - low) / span) * 100) };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

export function escapeText(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
