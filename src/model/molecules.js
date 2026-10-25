// A symbolic molecule model written for this toy.
//
// A molecule is a core label plus a multiset of named groups. That is all.
// It is NOT chemistry: there are no atoms, no valences, no energies, no
// stereochemistry. It exists so a pipeline stage can refuse an input it has no
// rule for, and so the cartoon in/out pictures have something to draw.

export const GROUPS = {
  hydroxyl: { label: 'hydroxyl', symbol: 'OH', hue: 200 },
  phosphate: { label: 'phosphate', symbol: 'P', hue: 262 },
  methyl: { label: 'methyl', symbol: 'Me', hue: 288 },
  sugar: { label: 'sugar', symbol: 'Su', hue: 44 },
  acyl: { label: 'acyl', symbol: 'Ac', hue: 18 },
  carboxyl: { label: 'carboxyl', symbol: 'CO2H', hue: 150 },
  amine: { label: 'amine', symbol: 'NH2', hue: 172 },
  carbonyl: { label: 'carbonyl', symbol: 'C=O', hue: 126 },
  sulfate: { label: 'sulfate', symbol: 'S', hue: 308 },
  peptide: { label: 'peptide link', symbol: '~', hue: 248 },
  peroxide: { label: 'peroxide', symbol: 'OO', hue: 350 },
  amide: { label: 'amide', symbol: 'CON', hue: 164 },
  bond: { label: 'new bond', symbol: '—', hue: 228 },
  ring: { label: 'new ring', symbol: '◇', hue: 320 },
};

// "a hydroxyl" but "an acyl". Every sentence the bench and the route search
// build names a group, so the article has to be picked rather than hard-coded.
export function article(word) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

export function groupMeta(name) {
  return GROUPS[name] ?? { label: name, symbol: '?', hue: 0 };
}

// The starting molecules the bench offers. Deliberately a handful of ordinary
// teaching scaffolds, named loosely.
export const STARTERS = [
  { id: 'glucose', core: 'glucose', label: 'Glucose', groups: ['hydroxyl', 'hydroxyl', 'hydroxyl'] },
  { id: 'glycerol', core: 'glycerol', label: 'Glycerol', groups: ['hydroxyl', 'hydroxyl', 'hydroxyl'] },
  { id: 'catechol', core: 'catechol', label: 'Catechol', groups: ['hydroxyl', 'hydroxyl'] },
  { id: 'glycine', core: 'glycine', label: 'Glycine', groups: ['amine', 'carboxyl'] },
  { id: 'pyruvate', core: 'pyruvate', label: 'Pyruvate', groups: ['carboxyl', 'carbonyl'] },
  { id: 'triose', core: 'triose', label: 'Triose phosphate', groups: ['phosphate', 'hydroxyl', 'carbonyl'] },
  { id: 'starch', core: 'starch', label: 'Starch fragment', groups: ['sugar', 'sugar', 'hydroxyl'] },
  { id: 'cellulose', core: 'cellulose', label: 'Cellulose fragment', groups: ['sugar', 'sugar', 'sugar'] },
  { id: 'tributyrin', core: 'tributyrin', label: 'Small fat', groups: ['acyl', 'acyl', 'acyl'] },
  { id: 'fumarate', core: 'fumarate', label: 'Fumarate', groups: ['carboxyl', 'carboxyl'] },
  { id: 'aspartate', core: 'aspartate', label: 'Aspartate', groups: ['amine', 'carboxyl', 'carboxyl'] },
  { id: 'urea', core: 'urea', label: 'Urea', groups: ['amide', 'amine'] },
  { id: 'peroxide', core: 'peroxide', label: 'Hydrogen peroxide', groups: ['peroxide'] },
  { id: 'nitrile', core: 'nitrile', label: 'Small nitrile', groups: ['bond'] },
  { id: 'protein-stain', core: 'protein-stain', label: 'Protein stain fragment', groups: ['peptide', 'peptide', 'amine'] },
  { id: 'acetoacetate', core: 'acetoacetate', label: 'Acetoacetate', groups: ['acyl', 'carbonyl', 'carboxyl'] },
  { id: 'glycerate-2-p', core: 'glycerate-2-p', label: '2-Phosphoglycerate', groups: ['phosphate', 'carboxyl', 'hydroxyl'] },
  { id: 'glucose-1-p', core: 'glucose-1-p', label: 'Glucose-1-phosphate', groups: ['phosphate', 'hydroxyl', 'hydroxyl'] },
];

export function starter(id) {
  const s = STARTERS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown starter: ${id}`);
  return { core: s.core, label: s.label, groups: [...s.groups] };
}

export function cloneMolecule(mol) {
  return { core: mol.core, label: mol.label, groups: [...mol.groups] };
}

// Multiset containment: ['acyl','acyl'] needs two acyls present.
export function hasGroups(mol, required) {
  const pool = [...mol.groups];
  for (const g of required) {
    const i = pool.indexOf(g);
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
}

export function removeGroups(groups, toRemove) {
  const pool = [...groups];
  for (const g of toRemove) {
    const i = pool.indexOf(g);
    if (i !== -1) pool.splice(i, 1);
  }
  return pool;
}

export function describe(mol) {
  const counts = new Map();
  for (const g of mol.groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  const parts = [...counts.entries()].map(([g, n]) => (n > 1 ? `${n}× ${groupMeta(g).label}` : groupMeta(g).label));
  return parts.length ? `${prettyCore(mol.core)} with ${parts.join(', ')}` : prettyCore(mol.core);
}

export function prettyCore(core) {
  return core
    .split('-')
    .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export function shortLabel(mol) {
  return `${prettyCore(mol.core)} · ${mol.groups.map((g) => groupMeta(g).symbol).join(' ')}`;
}
