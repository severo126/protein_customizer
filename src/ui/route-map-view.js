// The map, drawn.
//
// Columns are stages: the left column is the starting molecules this catalogue
// already has, and each column to the right is one enzyme further out. A line
// is one enzyme acting under its own rule, and carries every entry that makes
// that same change, because two enzymes doing the same thing is a note on one
// connection rather than two connections.
//
// All the facts come from src/model/route-map.js, which reads them off the same
// walk the route search uses. This file decides only where things sit. That
// division is deliberate: a layout that invented an edge to tidy up the picture
// would be inventing chemistry, so there is no node or line here that the map
// did not hand over.
//
// Drawn as inline SVG with a viewBox and no fixed pixel width, so the same
// picture scales from a phone to a projector without a second layout.

import { groupMeta, prettyCore } from '../model/molecules.js';
import { coreLabel } from '../model/routes.js';
import { escapeText } from './cartoon.js';

const COL_W = 132;
const NODE_W = 96;
const NODE_H = 34;
const ROW_H = 46;
const PAD_X = 16;
const PAD_Y = 22;

// A molecule's groups as a compact tally, using the same symbols and hues the
// rest of the app colours groups with, so a reader who has seen a card
// recognises them here.
function tally(groups) {
  const counts = new Map();
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].map(([g, n]) => ({ group: g, n, ...groupMeta(g) }));
}

function nodeLabel(node) {
  const t = tally(node.groups);
  if (!t.length) return 'bare';
  return t.map((x) => (x.n > 1 ? `${x.n}×${x.symbol}` : x.symbol)).join(' ');
}

function nodeTitle(node) {
  if (node.isTarget) {
    const groups = node.groups.length
      ? tally(node.groups)
          .map((x) => (x.n > 1 ? `${x.n} × ${x.label}` : x.label))
          .join(', ')
      : 'nothing on it';
    return `What you asked for: ${coreLabel(node.core)} carrying ${groups}. Nothing in this catalogue reaches it, which is why no line arrives here.`;
  }
  const groups = node.groups.length
    ? tally(node.groups)
        .map((x) => (x.n > 1 ? `${x.n} × ${x.label}` : x.label))
        .join(', ')
    : 'nothing on it';
  const where = node.isStarter
    ? 'a starting molecule this catalogue already has'
    : `${node.depth} stage${node.depth === 1 ? '' : 's'} out`;
  return `${coreLabel(node.core)} carrying ${groups} — ${where}`;
}

/* -------------------------------- the layout ------------------------------ */

// Columns by the number of stages, which is the only ordering the map asserts.
function layout(map) {
  const cols = new Map();
  for (const n of map.nodes) {
    if (!cols.has(n.depth)) cols.set(n.depth, []);
    cols.get(n.depth).push(n);
  }
  const depths = [...cols.keys()].sort((a, b) => a - b);

  // Matching molecules first inside a column, so the eye lands on what the
  // reader asked for rather than on whatever the walk happened to reach first.
  for (const d of depths) {
    cols.get(d).sort((a, b) => Number(b.matches) - Number(a.matches) || a.key.localeCompare(b.key));
  }

  const rows = Math.max(1, ...depths.map((d) => cols.get(d).length));
  const width = PAD_X * 2 + Math.max(1, depths.length) * COL_W;
  const height = PAD_Y * 2 + rows * ROW_H;

  const at = new Map();
  depths.forEach((d, i) => {
    const column = cols.get(d);
    // Centre each column vertically, so a thin column does not read as having
    // dropped something off the bottom.
    const offset = (rows - column.length) / 2;
    column.forEach((n, j) => {
      at.set(n.key, {
        node: n,
        x: PAD_X + i * COL_W,
        y: PAD_Y + (offset + j) * ROW_H,
        depth: d,
      });
    });
  });

  return { at, depths, cols, width, height, rows };
}

/* ------------------------------- the drawing ------------------------------ */

function edgePath(a, b) {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function nodeSvg(p) {
  const n = p.node;
  const cls = [
    'rm-node',
    n.matches ? 'match' : '',
    n.isStarter ? 'starter' : '',
    n.isTarget ? 'asked' : '',
    n.unreachable ? 'unreached' : '',
    n.onSkeleton ? 'on-skeleton' : 'off-skeleton',
  ]
    .filter(Boolean)
    .join(' ');
  // The starting molecules get their own name, because which one you begin
  // from is the thing that distinguishes them. Everything else on the skeleton
  // shares a core, so the groups are what tell them apart.
  // An off-skeleton molecule is on a different core, so its group tally alone
  // can read exactly like an on-skeleton node in another column. The core goes
  // on the label so two different molecules cannot look like the same one.
  const label = n.isTarget
    ? 'asked for'
    : n.isStarter
      ? prettyCore(n.core)
      : n.onSkeleton
        ? nodeLabel(n)
        : `${prettyCore(n.core)} · ${nodeLabel(n)}`;
  return `<g class="${cls}" transform="translate(${p.x} ${p.y})">
    <title>${escapeText(nodeTitle(n))}</title>
    <rect width="${NODE_W}" height="${NODE_H}" rx="7"/>
    <text x="${NODE_W / 2}" y="${NODE_H / 2 + 4}" text-anchor="middle">${escapeText(label)}</text>
  </g>`;
}

export function routeMapSvg(map, entriesById) {
  if (!map.nodes.length) {
    return `<p class="rm-empty">${escapeText(map.headline)}</p>`;
  }

  const { at, depths, cols, width, height } = layout(map);

  const lines = map.edges
    .map((e) => {
      const a = at.get(e.from);
      const b = at.get(e.to);
      if (!a || !b) return '';
      const names = e.enzymeIds.map((id) => entriesById.get(id)?.name ?? id);
      const toNode = b.node;
      const title =
        names.length === 1
          ? `${names[0]}: ${e.what ?? 'acts here'}`
          : `${names.length} entries make this same change: ${names.join(', ')}`;
      const cls = ['rm-edge', e.onMatchPath ? 'on-path' : '', toNode.matches ? 'to-match' : ''].filter(Boolean).join(' ');
      return `<g class="${cls}">
        <title>${escapeText(title)}</title>
        <path d="${edgePath(a, b)}"/>
        ${
          e.enzymeIds.length > 1
            ? `<text class="rm-edge-count" x="${(a.x + NODE_W + b.x) / 2}" y="${
                (a.y + b.y) / 2 + NODE_H / 2 - 4
              }" text-anchor="middle">${e.enzymeIds.length}</text>`
            : ''
        }
      </g>`;
    })
    .join('');

  const nodes = map.nodes.map((n) => nodeSvg(at.get(n.key))).join('');

  const ticks = depths
    .map((d, i) => {
      const x = PAD_X + i * COL_W + NODE_W / 2;
      const only = (cols.get(d) ?? []).every((n) => n.isTarget);
      const text = only ? 'not reached' : d === 0 ? 'start' : `${d} stage${d === 1 ? '' : 's'}`;
      return `<text class="rm-tick" x="${x}" y="${height - 6}" text-anchor="middle">${text}</text>`;
    })
    .join('');

  // Explicit pixel size, matching the viewBox one to one. With only a viewBox
  // the SVG fills its container, and on a phone that scaled a 1000-unit map
  // into 388px — which shrinks every label with it, well under the 11px floor
  // this project holds itself to. At natural size the text is the size the
  // stylesheet asked for and the container scrolls instead.
  return `<svg class="rm-svg" viewBox="0 0 ${width} ${height + 10}" width="${width}" height="${height + 10}"
      role="img" aria-label="${escapeText(map.headline)}" preserveAspectRatio="xMinYMid meet">
    <g class="rm-edges">${lines}</g>
    <g class="rm-nodes">${nodes}</g>
    ${ticks}
  </svg>`;
}

// The whole panel: the sentence, the picture, what was left out, and where the
// picture came from.
export function routeMapPanel(map, entriesById) {
  const cut =
    map.deeper > 0
      ? `<p class="rm-cut">${map.deeper} more reachable further out than this draws. The search still
         finds ${map.deeper === 1 ? 'it' : 'them'}.</p>`
      : '';

  // The dead end gets said twice on purpose: once in the headline above the
  // picture, and once as a node drawn with nothing arriving at it, because a
  // reader looking at a graph trusts the graph.
  const deadEnd =
    !map.reachable && map.core
      ? `<p class="rm-deadend">Nothing arrives at the dashed node, which is the answer rather than
         a gap in the picture: ${
           map.exhausted
             ? `no chain of up to ${map.searchDepth} catalogue stages gets there`
             : 'though the walk did not finish inside its budget, so this says nothing either way'
         }.</p>`
      : '';

  return `<div class="rm" data-route-map>
    <p class="rm-headline">${escapeText(map.headline)}</p>
    ${deadEnd}
    <div class="rm-scroll">${routeMapSvg(map, entriesById)}</div>
    ${cut}
    <p class="rm-note">${escapeText(map.note)}</p>
  </div>`;
}
