// A cartoon ball-and-stick layout for the symbolic molecules the bench runs.
//
// The molecule model in molecules.js is a core label plus a multiset of named
// groups, and that is all the app knows. This file turns that into something
// a reader recognises as chemistry: a backbone of the right kind and size for
// the named core, and each named group drawn with its own atoms and bonds in
// the ordinary way (a hydroxyl as O–H, a phosphate as P with four oxygens).
//
// What this is NOT: a conformation, a coordinate set, or a measurement. The
// positions are laid out by the formulas below to be legible on screen — a
// flat hexagon rather than a chair, bond lengths all alike, and backbone
// hydrogens left off the way a skeletal drawing leaves them off. The atom
// counts and the connectivity of each named group are ordinary textbook
// chemistry; where they sit in space is drawing, not structure. Fragments
// ("starch fragment", "protein stain fragment") are not single molecules at
// all, and are drawn as a short piece of the repeating unit.

export const STRUCTURE_NOTE =
  'Ball-and-stick cartoon: the atoms and bonds of each named group are ordinary chemistry, the positions are drawing. Not a conformation, not a coordinate set. Backbone hydrogens are left off.';

// CPK-ish, tuned to read on a dark background.
export const ELEMENTS = {
  C: { colour: 0x3f4654, radius: 0.3, label: 'carbon' },
  O: { colour: 0xe4564a, radius: 0.28, label: 'oxygen' },
  N: { colour: 0x4b7bec, radius: 0.28, label: 'nitrogen' },
  P: { colour: 0xff9f43, radius: 0.34, label: 'phosphorus' },
  S: { colour: 0xf5d547, radius: 0.33, label: 'sulfur' },
  H: { colour: 0xdfe6f2, radius: 0.16, label: 'hydrogen' },
};

export function elementMeta(symbol) {
  return ELEMENTS[symbol] ?? { colour: 0x8c95ad, radius: 0.26, label: symbol };
}

const BOND = 1.3; // one bond length, in the scene's own units

/* ---------- backbones ---------- */

// Each core says what kind of skeleton to draw and how big. `ringO` marks a
// sugar ring, whose ring position 0 is an oxygen; `arene` is an all-carbon
// aromatic ring; `repeat` draws two linked units, for the fragments.
const CORES = {
  glucose: { shape: 'ring', n: 6, ringO: true, name: 'six-membered sugar ring' },
  'glucose-1-p': { shape: 'ring', n: 6, ringO: true, name: 'six-membered sugar ring' },
  'glucose-6-p': { shape: 'ring', n: 6, ringO: true, name: 'six-membered sugar ring' },
  fructose: { shape: 'ring', n: 5, ringO: true, name: 'five-membered sugar ring' },
  catechol: { shape: 'arene', n: 6, name: 'aromatic six-ring' },
  starch: { shape: 'repeat', n: 6, ringO: true, units: 2, name: 'two linked sugar rings' },
  cellulose: { shape: 'repeat', n: 6, ringO: true, units: 2, name: 'two linked sugar rings' },
  glycerol: { shape: 'chain', n: 3, name: 'three-carbon chain' },
  tributyrin: { shape: 'chain', n: 3, name: 'three-carbon chain' },
  triose: { shape: 'chain', n: 3, name: 'three-carbon chain' },
  'triose-iso': { shape: 'chain', n: 3, name: 'three-carbon chain' },
  'glycerate-2-p': { shape: 'chain', n: 3, name: 'three-carbon chain' },
  pyruvate: { shape: 'chain', n: 3, name: 'three-carbon chain' },
  enolpyruvate: { shape: 'chain', n: 3, name: 'three-carbon chain' },
  glycine: { shape: 'chain', n: 2, name: 'two-carbon chain' },
  acetoacetate: { shape: 'chain', n: 4, name: 'four-carbon chain' },
  fumarate: { shape: 'chain', n: 4, name: 'four-carbon chain' },
  malate: { shape: 'chain', n: 4, name: 'four-carbon chain' },
  aspartate: { shape: 'chain', n: 4, name: 'four-carbon chain' },
  nitrile: { shape: 'chain', n: 2, name: 'two-carbon chain' },
  amide: { shape: 'chain', n: 1, name: 'one carbon' },
  urea: { shape: 'centre', name: 'one carbon between two nitrogens' },
  peroxide: { shape: 'pair', name: 'two oxygens' },
  'protein-stain': { shape: 'chain', n: 4, name: 'a short piece of a chain' },
};

function coreSpec(core) {
  return CORES[core] ?? { shape: 'chain', n: 3, name: 'three-carbon chain' };
}

/* ---------- groups ---------- */

// Each group's own atoms, placed relative to the backbone atom it hangs off:
// +x points away from the backbone. Bond index -1 means the backbone atom.
// The atom counts and connectivity are the ordinary ones; `bond` and `ring`
// are the app's own placeholders for "a new bond was made" and have no atoms
// of their own, so they are drawn as a highlight on the backbone instead.
const GROUPS = {
  hydroxyl: {
    atoms: [['O', 1, 0, 0], ['H', 1.62, 0.52, 0.1]],
    bonds: [[-1, 0, 1], [0, 1, 1]],
  },
  carbonyl: {
    atoms: [['O', 1, 0, 0]],
    bonds: [[-1, 0, 2]],
  },
  carboxyl: {
    atoms: [['C', 1, 0, 0], ['O', 1.68, 0.92, 0], ['O', 1.6, -0.95, 0.15], ['H', 2.3, -1.4, 0.2]],
    bonds: [[-1, 0, 1], [0, 1, 2], [0, 2, 1], [2, 3, 1]],
  },
  amine: {
    atoms: [['N', 1, 0, 0], ['H', 1.7, 0.6, 0.2], ['H', 1.5, -0.7, -0.35]],
    bonds: [[-1, 0, 1], [0, 1, 1], [0, 2, 1]],
  },
  amide: {
    atoms: [['C', 1, 0, 0], ['O', 1.6, 0.95, 0], ['N', 1.7, -0.85, 0.1], ['H', 2.5, -0.7, 0.4]],
    bonds: [[-1, 0, 1], [0, 1, 2], [0, 2, 1], [2, 3, 1]],
  },
  peptide: {
    atoms: [['C', 1, 0, 0], ['O', 1.55, 0.98, 0], ['N', 1.78, -0.8, 0.1], ['C', 2.9, -1.0, 0.2]],
    bonds: [[-1, 0, 1], [0, 1, 2], [0, 2, 1], [2, 3, 1]],
  },
  methyl: {
    atoms: [['C', 1, 0, 0], ['H', 1.6, 0.68, 0.2], ['H', 1.55, -0.6, 0.45], ['H', 1.5, -0.2, -0.75]],
    bonds: [[-1, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1]],
  },
  phosphate: {
    atoms: [['O', 0.95, 0, 0], ['P', 2.05, 0.1, 0], ['O', 2.75, 1.05, 0.1], ['O', 2.6, -0.85, -0.55], ['O', 1.95, -0.35, 1.25]],
    bonds: [[-1, 0, 1], [0, 1, 1], [1, 2, 2], [1, 3, 1], [1, 4, 1]],
  },
  sulfate: {
    atoms: [['O', 0.95, 0, 0], ['S', 2.05, 0.1, 0], ['O', 2.75, 1.05, 0.1], ['O', 2.6, -0.85, -0.55], ['O', 1.95, -0.35, 1.25]],
    bonds: [[-1, 0, 1], [0, 1, 1], [1, 2, 2], [1, 3, 1], [1, 4, 1]],
  },
  peroxide: {
    atoms: [['O', 1, 0, 0], ['O', 2.1, 0.45, 0.1], ['H', 2.7, 1.1, 0.3]],
    bonds: [[-1, 0, 1], [0, 1, 1], [1, 2, 1]],
  },
  acyl: {
    // A short fatty chain: the carbonyl carbon plus three more.
    atoms: [['C', 1, 0, 0], ['O', 1.5, 1.05, 0], ['C', 2.1, -0.75, 0.2], ['C', 3.3, -0.1, 0.1], ['C', 4.4, -0.85, 0.3]],
    bonds: [[-1, 0, 1], [0, 1, 2], [0, 2, 1], [2, 3, 1], [3, 4, 1]],
  },
  sugar: {
    // Another ring, hung off the backbone through a bridging oxygen.
    ring: { n: 6, ringO: true, via: 0.95 },
  },
  bond: { mark: 'a new bond, drawn as a highlight on the backbone' },
  ring: { mark: 'a new ring, drawn as a highlight on the backbone' },
};

/* ---------- layout ---------- */

function ringPositions(n, radius) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    // A slight alternating pucker, so a flat ring does not read as a decal.
    out.push([Math.cos(a) * radius, Math.sin(a) * radius, (i % 2 ? 1 : -1) * radius * 0.12]);
  }
  return out;
}

function chainPositions(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([(i - (n - 1) / 2) * BOND * 0.92, (i % 2 ? 0.42 : -0.42) * BOND, 0]);
  }
  return out;
}

// Build the backbone: its atoms, its bonds, and the outward direction at each
// place a group can hang off.
function backbone(spec) {
  const atoms = [];
  const bonds = [];
  const anchors = [];
  const add = (element, pos) => atoms.push({ element, pos }) - 1;

  if (spec.shape === 'pair') {
    add('O', [-BOND * 0.5, 0, 0]);
    add('O', [BOND * 0.5, 0.2, 0]);
    bonds.push({ a: 0, b: 1, order: 1 });
    anchors.push({ at: 0, dir: [-1, -0.3, 0] }, { at: 1, dir: [1, 0.4, 0] });
    return { atoms, bonds, anchors };
  }

  if (spec.shape === 'centre') {
    add('C', [0, 0, 0]);
    add('N', [-BOND * 0.95, 0.35, 0]);
    add('N', [BOND * 0.95, 0.35, 0]);
    bonds.push({ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 });
    anchors.push({ at: 0, dir: [0, -1, 0.2] }, { at: 1, dir: [-1, 0.5, 0.3] }, { at: 2, dir: [1, 0.5, -0.3] });
    return { atoms, bonds, anchors };
  }

  const units = spec.shape === 'repeat' ? spec.units ?? 2 : 1;
  if (spec.shape === 'ring' || spec.shape === 'arene' || spec.shape === 'repeat') {
    const n = spec.n ?? 6;
    const radius = (BOND * 0.5) / Math.sin(Math.PI / n);
    for (let u = 0; u < units; u++) {
      const base = atoms.length;
      const shift = u * (radius * 2 + BOND * 0.9);
      const ring = ringPositions(n, radius);
      ring.forEach((p, i) => {
        const element = spec.ringO && i === 0 ? 'O' : 'C';
        add(element, [p[0] + shift, p[1], p[2]]);
      });
      for (let i = 0; i < n; i++) {
        // An aromatic ring alternates double bonds; a sugar ring is all single.
        const order = spec.shape === 'arene' && i % 2 === 0 ? 2 : 1;
        bonds.push({ a: base + i, b: base + ((i + 1) % n), order });
      }
      for (let i = 0; i < n; i++) {
        if (spec.ringO && i === 0) continue;
        const p = ring[i];
        const out = [p[0], p[1], p[2]];
        const len = Math.hypot(out[0], out[1]) || 1;
        anchors.push({ at: base + i, dir: [out[0] / len, out[1] / len, (i % 2 ? 0.5 : -0.5)] });
      }
      if (u > 0) {
        // The bridging oxygen between two sugar units.
        const link = add('O', [shift - radius - BOND * 0.45, 0.1, 0]);
        bonds.push({ a: base - n + 3, b: link, order: 1 }, { a: link, b: base + Math.floor(n / 2), order: 1 });
      }
    }
    return { atoms, bonds, anchors };
  }

  const n = spec.n ?? 3;
  chainPositions(n).forEach((p) => add('C', p));
  for (let i = 0; i + 1 < n; i++) bonds.push({ a: i, b: i + 1, order: 1 });
  for (let i = 0; i < n; i++) {
    const up = i % 2 === 0;
    anchors.push({ at: i, dir: [i === 0 ? -0.6 : i === n - 1 ? 0.6 : 0, up ? -0.85 : 0.85, 0.3] });
    anchors.push({ at: i, dir: [i === 0 ? -0.8 : i === n - 1 ? 0.8 : 0.1, up ? -0.3 : 0.3, -0.9] });
  }
  return { atoms, bonds, anchors };
}

// A basis with +x along `dir`, so a group's own coordinates can be dropped in.
function frame(dir) {
  const x = normalise(dir);
  const up = Math.abs(x[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const z = normalise(cross(x, up));
  const y = cross(z, x);
  return { x, y, z };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalise(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* ---------- the whole molecule ---------- */

// Lay out one molecule: the backbone for its core, then each named group on
// its own anchor. Group order follows the molecule's own group list, so the
// picture changes in step with what the rules did to it.
export function buildStructure(mol) {
  const spec = coreSpec(mol.core);
  const { atoms, bonds, anchors } = backbone(spec);
  const groups = [];

  let next = 0;
  for (const name of mol.groups ?? []) {
    const shape = GROUPS[name];
    const anchor = anchors[next % Math.max(1, anchors.length)];
    next += 1;
    if (!shape || shape.mark) {
      // No atoms of its own: mark the backbone atom instead.
      groups.push({ group: name, atoms: [], highlight: anchor ? anchor.at : 0, mark: shape?.mark });
      continue;
    }
    const base = atoms.at(anchor.at).pos;
    const f = frame(anchor.dir);
    const place = (lx, ly, lz) => [
      base[0] + f.x[0] * lx + f.y[0] * ly + f.z[0] * lz,
      base[1] + f.x[1] * lx + f.y[1] * ly + f.z[1] * lz,
      base[2] + f.x[2] * lx + f.y[2] * ly + f.z[2] * lz,
    ];

    const mine = [];
    if (shape.ring) {
      // A whole second ring, bridged on through an oxygen.
      const n = shape.ring.n;
      const radius = (BOND * 0.5) / Math.sin(Math.PI / n);
      const link = atoms.push({ element: 'O', pos: place(shape.ring.via, 0, 0) }) - 1;
      bonds.push({ a: anchor.at, b: link, order: 1 });
      mine.push(link);
      const ring = ringPositions(n, radius);
      const base0 = atoms.length;
      ring.forEach((p, i) => {
        const element = shape.ring.ringO && i === 0 ? 'O' : 'C';
        const idx = atoms.push({ element, pos: place(shape.ring.via + radius + BOND * 0.5 + p[1], p[0], p[2]) }) - 1;
        mine.push(idx);
      });
      for (let i = 0; i < n; i++) bonds.push({ a: base0 + i, b: base0 + ((i + 1) % n), order: 1 });
      bonds.push({ a: link, b: base0 + Math.floor(n / 2), order: 1 });
    } else {
      const start = atoms.length;
      for (const [element, lx, ly, lz] of shape.atoms) {
        mine.push(atoms.push({ element, pos: place(lx * BOND * 0.78, ly * BOND * 0.6, lz * BOND * 0.6) }) - 1);
      }
      for (const [a, b, order] of shape.bonds) {
        bonds.push({ a: a === -1 ? anchor.at : start + a, b: start + b, order });
      }
    }
    groups.push({ group: name, atoms: mine, anchor: anchor.at });
  }

  return { core: mol.core, coreName: spec.name, atoms, bonds, groups, note: STRUCTURE_NOTE };
}

// A plain-words tally of what is drawn, for the caption under the picture.
export function formulaTally(structure) {
  const counts = new Map();
  for (const a of structure.atoms) counts.set(a.element, (counts.get(a.element) ?? 0) + 1);
  const order = ['C', 'O', 'N', 'P', 'S', 'H'];
  return [...counts.entries()]
    .sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0]))
    .map(([el, n]) => `${n} ${elementMeta(el).label}${n > 1 ? 's' : ''}`)
    .join(', ');
}

// Just one group's own atoms, around a stub anchor atom, for drawing the
// group on its own while it is in flight between two molecules.
export function buildGroupFragment(name) {
  const shape = GROUPS[name];
  if (!shape || shape.mark || shape.ring) {
    return { atoms: [{ element: 'C', pos: [0, 0, 0] }], bonds: [], group: name, mark: shape?.mark };
  }
  const atoms = [{ element: 'C', pos: [-BOND * 0.78, 0, 0] }];
  for (const [element, lx, ly, lz] of shape.atoms) {
    atoms.push({ element, pos: [(lx - 1) * BOND * 0.78, ly * BOND * 0.6, lz * BOND * 0.6] });
  }
  const bonds = shape.bonds.map(([a, b, order]) => ({ a: a === -1 ? 0 : a + 1, b: b + 1, order }));
  // Centre it, so it spins about itself in flight.
  const mid = atoms.reduce((m, a) => [m[0] + a.pos[0], m[1] + a.pos[1], m[2] + a.pos[2]], [0, 0, 0]).map((v) => v / atoms.length);
  for (const a of atoms) a.pos = [a.pos[0] - mid[0], a.pos[1] - mid[1], a.pos[2] - mid[2]];
  return { atoms, bonds, group: name };
}
