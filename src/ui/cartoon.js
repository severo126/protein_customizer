// Drawing. Everything here is deliberately a game piece: chunky silhouettes,
// studs on top, a hard bevel and a drop shadow. None of it is derived from a
// coordinate set, and every view that uses it carries the "stylised cartoon"
// label so nobody mistakes it for a structure.

import { groupMeta, prettyCore } from '../model/molecules.js';

export const FAMILY_STYLE = {
  adds: { label: 'Adds', hue: 196, blurb: 'Puts a group onto a substrate — phosphate, methyl, sugar, acyl.' },
  removes: { label: 'Removes', hue: 14, blurb: 'Takes a group off — hydrolases, phosphatases, decarboxylases.' },
  creates: { label: 'Creates / rearranges', hue: 150, blurb: 'Forms a new bond or skeleton — ligases, isomerases, synthases.' },
};

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

function hsl(hue, s, l) {
  return `hsl(${hue} ${s}% ${l}%)`;
}

// One enzyme as a game piece.
export function enzymePiece(entry, size = 96) {
  const hue = entry.cartoon.hue;
  const d = SHAPES[entry.cartoon.shape] ?? SHAPES.drum;
  const id = `g-${entry.id}`;
  const studs = [];
  for (let i = 0; i < entry.cartoon.pips; i++) {
    const x = 28 + (i % 3) * 22;
    const y = 30 + Math.floor(i / 3) * 20;
    studs.push(`<circle cx="${x}" cy="${y}" r="6" fill="${hsl(hue, 70, 78)}" opacity="0.85"/>
      <circle cx="${x}" cy="${y - 1.5}" r="4" fill="${hsl(hue, 80, 90)}" opacity="0.6"/>`);
  }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Stylised cartoon game piece for ${entry.name}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${hsl(hue, 72, 62)}"/>
        <stop offset="1" stop-color="${hsl(hue, 64, 38)}"/>
      </linearGradient>
    </defs>
    <path d="${d}" transform="translate(0 5)" fill="#0b0d13" opacity="0.55"/>
    <path d="${d}" fill="url(#${id})" stroke="${hsl(hue, 55, 24)}" stroke-width="3" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${hsl(hue, 85, 80)}" stroke-width="1.5" stroke-linejoin="round" opacity="0.35" transform="translate(0 -2)"/>
    ${studs.join('')}
  </svg>`;
}

// One molecule as a core tile with group studs around it.
export function moleculePiece(mol, size = 74) {
  if (!mol) return `<div class="empty">—</div>`;
  const n = mol.groups.length || 1;
  const studs = mol.groups
    .map((g, i) => {
      const meta = groupMeta(g);
      const angle = (-90 + (360 / Math.max(n, 3)) * i) * (Math.PI / 180);
      const x = 50 + Math.cos(angle) * 34;
      const y = 50 + Math.sin(angle) * 34;
      return `<g>
        <circle cx="${x}" cy="${y + 2}" r="11.5" fill="#0b0d13" opacity="0.5"/>
        <circle cx="${x}" cy="${y}" r="11.5" fill="${hsl(meta.hue, 68, 55)}" stroke="${hsl(meta.hue, 55, 26)}" stroke-width="2.5"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#10131c">${meta.symbol}</text>
      </g>`;
    })
    .join('');
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Cartoon of ${prettyCore(mol.core)}">
    <polygon points="50,29 69,40 69,60 50,71 31,60 31,40" fill="#0b0d13" opacity="0.5" transform="translate(0 4)"/>
    <polygon points="50,29 69,40 69,60 50,71 31,60 31,40" fill="#39415c" stroke="#5a648a" stroke-width="3"/>
    <text x="50" y="54" text-anchor="middle" font-size="10" font-weight="700" fill="#e8ecf7">${shortCore(mol.core)}</text>
    ${studs}
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
    <defs>
      <linearGradient id="blobA" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7fd4ff"/><stop offset="1" stop-color="#2f7fa8"/>
      </linearGradient>
      <linearGradient id="blobB" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd27f"/><stop offset="1" stop-color="#c88a2a"/>
      </linearGradient>
    </defs>

    <line x1="${pad / 2}" y1="${cy}" x2="${width - pad / 2}" y2="${cy}" stroke="#2e3447" stroke-width="2" stroke-dasharray="6 7"/>

    <path d="M ${exitAx} ${cy} Q ${mid} ${cy - slack} ${exitBx} ${cy}" fill="none" stroke="#0b0d13" stroke-width="12" stroke-linecap="round" opacity="0.5" transform="translate(0 5)"/>
    <path d="M ${exitAx} ${cy} Q ${mid} ${cy - slack} ${exitBx} ${cy}" fill="none" stroke="#9aa4c4" stroke-width="8" stroke-linecap="round"/>

    <g>
      <circle cx="${ax}" cy="${cy + 7}" r="${rA}" fill="#0b0d13" opacity="0.5"/>
      <circle cx="${ax}" cy="${cy}" r="${rA}" fill="url(#blobA)" stroke="#1b4a63" stroke-width="4"/>
      <circle cx="${ax - rA * 0.3}" cy="${cy - rA * 0.35}" r="${rA * 0.26}" fill="#ffffff" opacity="0.28"/>
      <text x="${ax}" y="${cy + rA + 24}" text-anchor="middle" font-size="13" font-weight="700" fill="#e8ecf7">${escapeText(labelA)}</text>
    </g>
    <g>
      <circle cx="${bx}" cy="${cy + 7}" r="${rB}" fill="#0b0d13" opacity="0.5"/>
      <circle cx="${bx}" cy="${cy}" r="${rB}" fill="url(#blobB)" stroke="#6b4a12" stroke-width="4"/>
      <circle cx="${bx - rB * 0.3}" cy="${cy - rB * 0.35}" r="${rB * 0.26}" fill="#ffffff" opacity="0.28"/>
      <text x="${bx}" y="${cy + rB + 24}" text-anchor="middle" font-size="13" font-weight="700" fill="#e8ecf7">${escapeText(labelB)}</text>
    </g>

    <circle cx="${exitAx}" cy="${cy}" r="6" fill="#ffc65c" stroke="#16181f" stroke-width="2"/>
    <circle cx="${exitBx}" cy="${cy}" r="6" fill="#ffc65c" stroke="#16181f" stroke-width="2"/>
    <text x="${width / 2}" y="22" text-anchor="middle" font-size="12" fill="#a3abc2">${geo.linkerUnits}-unit linker · ${geo.span.toFixed(2)} nm of reach</text>
    <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#727b94">${geo.joinDistance.toFixed(2)} nm between cut ends · centres ${geo.centreDistance.toFixed(2)} nm apart</text>
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
    <rect x="0" y="14" width="${width}" height="8" rx="4" fill="#2e3447"/>
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
