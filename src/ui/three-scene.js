// The vacuum: a 3D stage for one enzyme and one molecule.
//
// Everything in here is invented geometry. The body is a clump of rounded
// lobes: two big ones with a cleft dished between them for the jaw, and one
// smaller lobe per site sat on the skin where this file decides to put it. The
// only thing that comes from data is how many site lobes there are and which
// of the three region labels each one carries, plus what the molecule is
// carrying — all read straight out of the fixed catalogue. There is no
// coordinate set anywhere near this file, and the screen that uses it says so
// on top of the canvas.
//
// The look is a flat cartoon, after the research notes in docs/ and the
// Kurzgesagt frames they describe: banded toon shading under one warm light,
// a lighter rim where a body turns away instead of a dark outline, saturated
// flat colour on the few things that matter, and depth from soft out-of-focus
// shapes in front and behind rather than from reflections. Nothing is metal.
//
// Nothing here decides anything either: the scene is handed the result the
// bench already computed, so the picture cannot show a reaction the rules did
// not run.

import * as THREE from 'three';
import { groupMeta } from '../model/molecules.js';
import { archetypeOf } from '../model/archetypes.js';
import { buildStructure, buildGroupFragment, elementMeta, STRUCTURE_NOTE } from '../model/structure.js';

export const SCENE_NOTE = 'Invented geometry — not a structure.';

export const SCENE_NOTE_LONG =
  `The enzyme is a clump of noise-displaced lobes with a carved cleft, one small lobe per catalogue site placed by hand: not a coordinate set, not a structure, not a trajectory. ${STRUCTURE_NOTE}`;

const REGION_COLOUR = { loop: 0x4ddba0, helix: 0xff6b6b, sheet: 0xffb648 };

/* ---------- deterministic value noise, so a piece looks the same every load ---------- */

function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function hash3(x, y, z, seed) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 419.2) * 43758.5453;
  return v - Math.floor(v);
}

function noise3(x, y, z, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function fbm(x, y, z, seed) {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 3; i++) {
    total += noise3(x * freq, y * freq, z * freq, seed + i * 7.3) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return total / norm;
}

/* ---------- the studio the metal reflects ---------- */

// A soft round sprite, used for the dust and for the glow around hot points.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// An out-of-focus clump: a few overlapping discs in two or three of the
// palette's hues, blurred in the canvas so the sprite needs no shader work.
const clumpTextures = [];
function clumpTexture(i) {
  if (clumpTextures[i]) return clumpTextures[i];
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const rnd = (k) => ((Math.sin(i * 31.7 + k * 17.3) * 43758.5453) % 1 + 1) % 1;
  const hues = [[8, 78, 66], [178, 52, 44], [28, 86, 60], [340, 70, 62]];
  g.filter = 'blur(9px)';
  for (let k = 0; k < 6; k++) {
    const [h, sat, l] = hues[(i + k) % hues.length];
    g.fillStyle = `hsl(${h} ${sat}% ${l}%)`;
    g.beginPath();
    g.arc(52 + rnd(k) * 56, 52 + rnd(k + 9) * 56, 22 + rnd(k + 20) * 20, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  clumpTextures[i] = tex;
  return tex;
}

/* ---------- the cartoon look ---------- */

// Three flat bands of light instead of a smooth falloff, so a body reads as a
// shape with a lit side and a shadow side, the way a flat illustration does.
let toonRamp = null;
function toonGradient() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([96, 96, 96, 255, 118, 118, 118, 255, 220, 220, 220, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  toonRamp.minFilter = THREE.LinearFilter;
  toonRamp.magFilter = THREE.LinearFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

// Toon bands plus a light rim on the edges facing away from the camera. The
// rim is what separates a body from the ground without an outline; it is the
// body's own hue lifted, never white, because a white rim reads as frost.
function cartoonMaterial(colour, { rim = null, rimStrength = 0.55, emissive = 0x000000 } = {}) {
  const base = colour instanceof THREE.Color ? colour : new THREE.Color(colour);
  const mat = new THREE.MeshToonMaterial({ color: base, gradientMap: toonGradient(), emissive });
  // Tone mapping greys saturated colour out; a flat look wants it as picked.
  mat.toneMapped = false;
  const hsl = {};
  base.getHSL(hsl);
  const rimColour = rim ? new THREE.Color(rim) : new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.1), 0.85);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColour = { value: rimColour };
    shader.uniforms.rimStrength = { value: rimStrength };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 rimColour;\nuniform float rimStrength;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float rimBand = smoothstep(0.72, 0.78, 1.0 - facing);
        outgoingLight = mix(outgoingLight, rimColour, rimBand * rimStrength);
        #include <opaque_fragment>`,
      );
  };
  return mat;
}

// Colours are picked in sRGB so they land on screen as saturated as chosen.
const flat = (h, s, l) => new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace);

/* ---------- the enzyme body ---------- */

// One lobe: a sphere pushed around by noise, then dished on the side that
// faces the cleft so the two halves leave a recess between them.
// IcosahedronGeometry comes out non-indexed, which shades every triangle flat.
// Welding the shared corners lets computeVertexNormals smooth across them.
function welded(geo) {
  const pos = geo.attributes.position;
  const keyOf = new Map();
  const verts = [];
  const index = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let at = keyOf.get(key);
    if (at === undefined) {
      at = verts.length / 3;
      keyOf.set(key, at);
      verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    index.push(at);
  }
  geo.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(index);
  return out;
}

function lobeShape(seed, { radius, squash, dishAt, dishDepth }) {
  // The surface radius along a unit direction, so ribbons can be laid on the
  // same skin the mesh is built from.
  const at = (n) => {
    // Big, soft lumps only. A fine bumpy skin reads as a real molecular
    // surface, which is exactly what this piece is not, so there is none.
    const lumps = fbm(n.x * 1.9 + 3, n.y * 1.9 + 7, n.z * 1.9 + 11, seed);
    let r = radius * (0.9 + lumps * 0.2);
    // The dish: push vertices near the facing pole inward, which is what makes
    // a cleft you can fly a molecule into rather than a seam.
    const facing = n.dot(dishAt);
    if (facing > 0.25) {
      const t = (facing - 0.25) / 0.75;
      r -= dishDepth * radius * t * t * (3 - 2 * t);
    }
    return r;
  };
  const surface = (n, lift = 0) => n.clone().multiplyScalar(at(n) + lift).multiply(squash);

  const geo = welded(new THREE.IcosahedronGeometry(radius, 5));
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const p = surface(v);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return { geo, surface };
}

// One small lobe per site, sat on the big lobe's skin: a clump of rounded
// shapes in flat colour is how the reference frames draw a protein, and it is
// also the honest choice, because a bump says "this has a part here" and
// nothing more. Which of the three region colours it gets comes from the
// entry's own region label; its size and shape are a hint at that label (a
// helix is taller, a sheet is flatter, a loop is a small round bump), and
// where it sits is invented.
function siteLobe(region, seed, radius, lane, shape, outward) {
  const colour = REGION_COLOUR[region] ?? 0x8c95ad;
  const material = cartoonMaterial(colour, { rimStrength: 0.5 });

  // A direction on the front of the lobe, away from the cleft, at the lane's
  // height — the same walk the earlier ribbons took, stopped at one point.
  const lat = lane * outward;
  const lon = -0.5 + ((seed * 7.3) % 1) * 1.1;
  const c = Math.sqrt(Math.max(0.05, 1 - lat * lat));
  const n = new THREE.Vector3(Math.sin(lon) * c, lat, Math.cos(lon) * c).normalize();

  const size = { helix: 0.36, sheet: 0.34, loop: 0.27 }[region] ?? 0.3;
  const geo = welded(new THREE.IcosahedronGeometry(radius * size, 4));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  // Sunk a little into the body so the join reads as one clump, not a stuck-on ball.
  mesh.position.copy(shape.surface(n, -radius * 0.06));
  mesh.lookAt(mesh.position.clone().multiplyScalar(2));
  if (region === 'helix') mesh.scale.set(0.85, 1.35, 0.9);
  else if (region === 'sheet') mesh.scale.set(1.35, 0.95, 0.6);
  else mesh.scale.set(1, 1, 0.85);
  mesh.userData.mid = mesh.position.clone();
  return mesh;
}

// The whole piece: two lobes with a cleft between them, a small lobe per
// site on the skin, and a lit ring where the chemistry is drawn to happen.
function buildEnzyme(entry) {
  const seed = seedOf(entry.id);
  const hue = entry.cartoon.hue / 360;
  const radius = 1.15 + (entry.domain?.radius ?? 2) * 0.1;

  // Two neighbouring hues, the lower lobe a step darker, so the hinge reads
  // as two shapes meeting rather than one shape with a crease.
  const upperSkin = cartoonMaterial(flat(hue, 0.72, 0.56), { rimStrength: 0.6 });
  const lowerSkin = cartoonMaterial(flat((hue + 0.045) % 1, 0.7, 0.47), { rimStrength: 0.6 });

  const group = new THREE.Group();
  group.userData.parts = {};

  const squash = new THREE.Vector3(1.18, 0.9, 1.0);
  const upperShape = lobeShape(seed, { radius, squash, dishAt: new THREE.Vector3(0.35, -1, 0).normalize(), dishDepth: 0.42 });
  const lowerShape = lobeShape(seed + 0.37, { radius: radius * 0.94, squash, dishAt: new THREE.Vector3(0.35, 1, 0).normalize(), dishDepth: 0.42 });
  const upper = new THREE.Mesh(upperShape.geo, upperSkin);
  upper.position.y = radius * 0.46;
  const lower = new THREE.Mesh(lowerShape.geo, lowerSkin);
  lower.position.y = -radius * 0.46;

  // The clump: a spread of rounded bumps over the outside of each half, in
  // three hues from the entry's own (its hue, a cooler opposite and a warmer
  // neighbour), so the piece reads as a bundle of parts rather than two eggs.
  // Where each bump sits is invented, as the note says.
  const bumpHues = [hue, (hue + 0.47) % 1, (hue + 0.09) % 1];
  const bumpSkins = bumpHues.map((h, i) => cartoonMaterial(flat(h, 0.68, i === 1 ? 0.5 : 0.6), { rimStrength: 0.5 }));
  const bumps = (shape, outward, seedOffset) => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const rnd = (k) => ((Math.sin((seed + seedOffset) * 12.9898 + (i * 4 + k) * 78.233) * 43758.5453) % 1 + 1) % 1;
      const r1 = rnd(1);
      const r2 = rnd(2);
      const r3 = rnd(3);
      // Anywhere on the half except the face that makes the cleft.
      const lat = outward * (0.05 + r1 * 0.9);
      const lon = r2 * Math.PI * 2;
      const c = Math.sqrt(Math.max(0.05, 1 - lat * lat));
      const n = new THREE.Vector3(Math.sin(lon) * c, lat, Math.cos(lon) * c).normalize();
      if (n.x > 0.75) continue;
      const size = radius * (0.22 + r3 * 0.2);
      const geo = welded(new THREE.IcosahedronGeometry(size, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, bumpSkins[(i + Math.floor(r2 * 3)) % 3]);
      mesh.position.copy(shape.surface(n, -size * 0.45));
      out.push(mesh);
    }
    return out;
  };
  bumps(upperShape, 1, 0.11).forEach((m) => upper.add(m));
  bumps(lowerShape, -1, 0.23).forEach((m) => lower.add(m));

  const jawTop = new THREE.Group();
  const jawBottom = new THREE.Group();
  jawTop.add(upper);
  jawBottom.add(lower);
  group.add(jawTop, jawBottom);
  group.userData.parts.jawTop = jawTop;
  group.userData.parts.jawBottom = jawBottom;
  group.userData.parts.upper = upper;
  group.userData.parts.lower = lower;

  // One small lobe per site, from the entry's own loop / helix / sheet labels.
  // They sit on the big lobe's own skin, so they ride the jaw as it shuts.
  const sites = entry.domain?.sites ?? [];
  group.userData.parts.lobes = [];
  sites.forEach((site, i) => {
    const onLower = i % 2 === 1;
    const lane = [0.32, 0.12, -0.1, 0.5][i % 4];
    const mesh = siteLobe(site.region, seed + i * 0.61, radius, lane, onLower ? lowerShape : upperShape, onLower ? -1 : 1);
    mesh.userData.site = site;
    // The leader line lands on the lobe's own surface, not its centre.
    const pin = new THREE.Object3D();
    pin.position.set(0, 0, radius * 0.3);
    mesh.add(pin);
    mesh.userData.pin = pin;
    (onLower ? lower : upper).add(mesh);
    group.userData.parts.lobes.push(mesh);
  });

  // The active site: a ring at the mouth of the cleft, lit in the colour of
  // the group this enzyme moves.
  const gm = groupMeta(entry.group);
  const siteColour = flat(gm.hue / 360, 0.85, 0.62);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.42, radius * 0.05, 12, 48),
    cartoonMaterial(siteColour, { emissive: siteColour, rimStrength: 0.3 }),
  );
  ring.material.emissiveIntensity = 0.8;
  ring.position.set(radius * 0.72, 0, 0);
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  group.userData.parts.siteRing = ring;

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: siteColour, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  );
  halo.scale.setScalar(radius * 2.2);
  halo.position.copy(ring.position);
  group.add(halo);
  group.userData.parts.siteHalo = halo;

  // Two dotted orbits around the site, turning slowly: the reference frames
  // mark "where it happens" with rings rather than an arrow.
  const orbits = new THREE.Group();
  orbits.position.copy(ring.position);
  [1.05, 1.45].forEach((k, i) => {
    const pts = [];
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * radius * k, Math.sin(t) * radius * k, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: siteColour, map: glowTexture(), size: radius * (0.09 - i * 0.02), transparent: true, opacity: 0.8 - i * 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    line.rotation.set(i ? 0.5 : -0.3, Math.PI / 2 + (i ? 0.4 : 0), 0);
    line.userData.orbit = i ? -0.25 : 0.4;
    orbits.add(line);
  });
  group.add(orbits);
  group.userData.parts.orbits = orbits;

  group.userData.radius = radius;
  return group;
}

/* ---------- the molecule, as ball-and-stick ---------- */

// One bond: a cylinder from a to b, doubled side by side for a double bond.
function bondMeshes(from, to, order, material, thickness) {
  const out = [];
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1e-4) return out;
  const mid = from.clone().lerp(to, 0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  if (!Number.isFinite(side.x) || side.lengthSq() < 0.1) side.set(1, 0, 0);
  const offsets = order >= 2 ? [-thickness * 1.5, thickness * 1.5] : [0];
  for (const off of offsets) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, len, 10), material);
    m.position.copy(mid).addScaledVector(side, off);
    m.quaternion.copy(q);
    out.push(m);
  }
  return out;
}

// Draw a laid-out structure: a sphere per atom in its element's colour, a
// stick per bond. The layout comes from structure.js, which says in its own
// header that the positions are drawing rather than measurement.
function ballAndStick(structure, { scale = 1, emissive = 0 } = {}) {
  const group = new THREE.Group();
  const stick = cartoonMaterial(0xc9cff5, { rim: 0xffffff, rimStrength: 0.25 });
  const byElement = new Map();
  const atomMeshes = [];

  for (const atom of structure.atoms) {
    const meta = elementMeta(atom.element);
    let material = byElement.get(atom.element);
    if (!material) {
      const colour = new THREE.Color(meta.colour);
      material = cartoonMaterial(colour, { emissive: colour.clone().multiplyScalar(emissive), rimStrength: 0.45 });
      byElement.set(atom.element, material);
    }
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(meta.radius * scale, 3), material);
    mesh.position.set(atom.pos[0] * scale, atom.pos[1] * scale, atom.pos[2] * scale);
    mesh.userData.element = atom.element;
    group.add(mesh);
    atomMeshes.push(mesh);
  }

  for (const bond of structure.bonds) {
    const a = atomMeshes[bond.a];
    const b = atomMeshes[bond.b];
    if (!a || !b) continue;
    for (const m of bondMeshes(a.position, b.position, bond.order, stick, 0.075 * scale)) group.add(m);
  }

  group.userData.atomMeshes = atomMeshes;
  group.userData.structure = structure;
  return group;
}

function buildMolecule(mol, { scale = 1 } = {}) {
  const structure = buildStructure(mol);
  // The layout is in its own units, and a starch fragment is far larger than
  // hydrogen peroxide. Fit each one to about the same size on screen, with a
  // little room so a bigger molecule still reads as bigger.
  const extent = Math.max(
    0.8,
    ...structure.atoms.map((a) => Math.hypot(a.pos[0], a.pos[1], a.pos[2])),
  );
  const fitted = (scale * 1.9) / Math.pow(extent, 0.82);
  const group = ballAndStick(structure, { scale: fitted, emissive: 0.08 });
  group.userData.molecule = mol;

  // A handle on each named group, so a label can point at the one changing.
  group.userData.groupNodes = structure.groups.map((g) => {
    const node = new THREE.Object3D();
    const pick = g.atoms.length ? g.atoms : [g.anchor ?? g.highlight ?? 0];
    const mid = new THREE.Vector3();
    for (const i of pick) {
      const m = group.userData.atomMeshes[i];
      if (m) mid.add(m.position);
    }
    node.position.copy(mid.divideScalar(Math.max(1, pick.length)));
    node.userData.group = g.group;
    group.add(node);
    return node;
  });

  // Centre of the whole thing, which is what the camera and the jaw aim at.
  const box = new THREE.Box3().setFromObject(group);
  group.userData.span = box.getSize(new THREE.Vector3()).length();
  return group;
}

/* ---------- the stage ---------- */

export function createFoundryScene(canvas) {
  // Ask a throwaway canvas first: a browser without WebGL answers null here
  // quietly, where asking the renderer to build one logs an error.
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return { ok: false, reason: 'no WebGL' };
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
  if (!renderer.getContext()) return { ok: false, reason: 'no WebGL context' };

  // Resolution follows the machine: start at the display's ratio (capped),
  // and if frames run long for a while, step down; step back up when they
  // are quick again. A modest laptop or a projector feed gets a softer
  // picture rather than a stuttering one.
  const PIXEL_MAX = Math.min(window.devicePixelRatio || 1, 1.5);
  let pixelRatio = PIXEL_MAX;
  let frameCost = 0.016;
  let costHold = 0;
  renderer.setPixelRatio(pixelRatio);
  function adaptResolution(rawDt) {
    frameCost += (rawDt - frameCost) * 0.1;
    costHold += rawDt;
    if (costHold < 1.5) return;
    costHold = 0;
    if (frameCost > 0.04 && pixelRatio > 0.6) pixelRatio = Math.max(0.6, pixelRatio - 0.25);
    else if (frameCost < 0.018 && pixelRatio < PIXEL_MAX) pixelRatio = Math.min(PIXEL_MAX, pixelRatio + 0.25);
    else return;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  }
  // Flat colour as picked: no filmic curve to grey the saturation out.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // The ground is a deep indigo, never black, and the fog is the same colour,
  // so far things fade into colour rather than into nothing. That fade is the
  // whole of the atmospheric perspective here.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12163a);
  scene.fog = new THREE.FogExp2(0x12163a, 0.04);

  // How the vacuum is being run: warmth from -1 (held well under the stated
  // window) to +1 (well over it), and agitation, which is only ever non-zero
  // past the top of the entry's own stated window. Both are set from
  // src/ui/climate.js, which reads the activity curve — the scene does not
  // decide anything about temperature, it only shows what that number says.
  const climate = { warmth: 0, agitation: 0 };
  const VACUUM_BASE = new THREE.Color(0x12163a);
  const VACUUM_HOT = new THREE.Color(0x3b1434);
  const VACUUM_COLD = new THREE.Color(0x0c1a4d);
  const tint = new THREE.Color();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 1.4, 9);

  // One warm light from the upper left, and a sky-to-ground hemisphere that
  // turns the shadow side purple-blue rather than grey. The heat light is off
  // until the dial is run past a window; then it reddens the far edge.
  const key = new THREE.DirectionalLight(0xfff1dc, 1.9);
  key.position.set(-6, 6, 1.5);
  const heat = new THREE.DirectionalLight(0xff6a3a, 0);
  heat.position.set(5, -1.5, -5);
  const fill = new THREE.DirectionalLight(0x86d4ff, 0.45);
  fill.position.set(3, 2, 4);
  scene.add(key, heat, fill, new THREE.HemisphereLight(0x8fa6ff, 0x3a2470, 0.8));

  /* dust: small, dim, and the only particles — nothing that happens at this
     scale looks like god rays, caustics or bubbles */
  const dustCount = 450;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 6 + Math.random() * 26;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    dustPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    dustPos[i * 3 + 1] = r * Math.cos(ph) * 0.5;
    dustPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.06,
      map: glowTexture(),
      color: 0xb4c0ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(dust);

  /* depth by blur: soft out-of-focus clumps far behind the subject and a few
     very close to the lens, the way the reference frames keep only the middle
     sharp. They are flat discs of the glow texture tinted in muted versions
     of the palette, inside the fog, at low contrast — nothing a reader tracks. */
  const bokeh = new THREE.Group();
  const bokehRand = (i, k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 18; i++) {
    const near = i >= 14;
    const disc = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: clumpTexture(i % 4), transparent: true, opacity: near ? 0.12 : 0.22, depthWrite: false, fog: false }),
    );
    const spread = near ? 9 : 16;
    // Pushed out of the middle so the subject sits in clear ground.
    const side = bokehRand(i, 1) < 0.5 ? -1 : 1;
    disc.position.set(
      side * (spread * 0.45 + bokehRand(i, 5) * spread * 0.55),
      (bokehRand(i, 2) - 0.5) * (near ? 9 : 11),
      near ? 5.5 + bokehRand(i, 3) * 2 : -9 - bokehRand(i, 3) * 14,
    );
    disc.scale.setScalar(near ? 4 + bokehRand(i, 4) * 3 : 3 + bokehRand(i, 4) * 4);
    disc.userData.seed = i;
    bokeh.add(disc);
  }
  scene.add(bokeh);

  /* a pool of light under the subject: a thin lit rim, a faint fill and one
     point light, in the archetype's hue, so the floor is the one element with
     a different weight from everything above it and a stage change reads as
     the floor changing colour. It is set dressing, not a surface. */
  const floor = new THREE.Group();
  floor.position.y = -2.9;
  floor.rotation.x = -Math.PI / 2;
  const floorColour = flat(205 / 360, 0.8, 0.6);
  const floorTarget = floorColour.clone();
  const floorRim = new THREE.Mesh(
    new THREE.RingGeometry(1.85, 1.92, 96),
    new THREE.MeshBasicMaterial({ color: floorColour, transparent: true, opacity: 0.7, side: THREE.DoubleSide, toneMapped: false }),
  );
  const floorFill = new THREE.Mesh(
    new THREE.CircleGeometry(1.85, 96),
    new THREE.MeshBasicMaterial({ color: floorColour, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  floor.add(floorFill, floorRim);
  const floorLight = new THREE.PointLight(floorColour, 2.4, 9, 1.4);
  floorLight.position.set(0, -1.6, 0.6);
  scene.add(floor, floorLight);

  const stage = new THREE.Group();
  scene.add(stage);

  /* ---------- what the stage is showing ---------- */

  let subject = null; // { entry, molIn, result, enzyme, molecule, product, flyer }

  function clearStage() {
    while (stage.children.length) {
      const child = stage.children.pop();
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    }
  }

  // Where a product is handed to the next stage, and where the next stage's
  // enzyme comes in from. Keeping these fixed is what makes the run read as
  // one chain rather than a series of separate scenes.
  const HANDOFF = new THREE.Vector3(4.6, -0.2, 1.4);
  const OFFSTAGE_IN = new THREE.Vector3(13, -0.6, -2);
  const OFFSTAGE_OUT = new THREE.Vector3(-14, 0.8, -3);

  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    root.parent?.remove(root);
  }

  // `result` is the bench's own runStage output, handed in rather than
  // recomputed, so the scene can only show what the rules did. `carry` means
  // this stage is picking up the molecule the previous stage let go of, and
  // `slide` means the enzyme before it is still on screen and should leave.
  function setSubject(entry, molIn, result, { carry = false, last = true, slide = false } = {}) {
    const leaving = slide && subject ? subject.enzyme : null;
    if (subject?.outgoing) disposeTree(subject.outgoing);
    for (const obj of [subject?.molecule, subject?.product, subject?.flyer]) {
      if (obj) disposeTree(obj);
    }
    if (!leaving && subject?.enzyme) disposeTree(subject.enzyme);

    const enzyme = buildEnzyme(entry);
    enzyme.position.copy(OFFSTAGE_IN);
    stage.add(enzyme);

    const arch = archetypeOf(entry);
    if (arch) floorTarget.copy(flat(arch.hue / 360, 0.8, 0.6));

    const molecule = buildMolecule(molIn, { scale: 1 });
    stage.add(molecule);

    let product = null;
    if (result?.ok) {
      product = buildMolecule(result.product, { scale: 1 });
      product.visible = false;
      stage.add(product);
    }

    // The group that changes hands, drawn with its own atoms.
    let flyer = null;
    const op = entry.action.op;
    if (result?.ok && (op === 'add' || op === 'remove')) {
      const meta = groupMeta(entry.action.group);
      const colour = flat(meta.hue / 360, 0.85, 0.6);
      flyer = ballAndStick(buildGroupFragment(entry.action.group), { scale: 0.6, emissive: 0.5 });
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture(), color: colour, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      );
      halo.scale.setScalar(1.5);
      flyer.add(halo);
      flyer.visible = false;
      stage.add(flyer);
    }

    subject = {
      entry,
      molIn,
      result,
      enzyme,
      outgoing: leaving,
      molecule,
      product,
      flyer,
      op,
      carry,
      last,
      radius: enzyme.userData.radius,
    };
    handle.subject = subject;
    return subject;
  }

  /* ---------- the choreography ---------- */

  // Five acts over a 0..1 timeline. The camera keyframes are hand-placed to
  // read as a shot rather than a turntable: arrive wide, come in on the parts,
  // push into the cleft for the hand-off, pull back for the release.
  const SHOTS = [
    { at: 0.0, pos: [0.6, 1.8, 10.5], look: [0, 0, 0], fov: 42 },
    { at: 0.2, pos: [-3.6, 1.6, 7.6], look: [0, 0.1, 0], fov: 40 },
    { at: 0.42, pos: [3.6, 1.1, 7.6], look: [0.8, 0, 0.2], fov: 39 },
    { at: 0.62, pos: [5.4, 0.7, 5.6], look: [1.3, -0.1, 0.3], fov: 38 },
    { at: 0.82, pos: [5.4, 1.4, 7.2], look: [1.4, -0.3, 0.6], fov: 40 },
    { at: 1.0, pos: [0.4, 1.6, 10.2], look: [0, 0, 0], fov: 42 },
  ];

  const smooth = (t) => t * t * (3 - 2 * t);
  // A jaw that overshoots a little as it shuts reads as weight; a group that
  // hops rather than slides reads as being handed over.
  const easeOutBack = (t, k = 1.4) => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // A sum of sines: never still, never a loop you can see repeating.
  const breathe = (clock, seed, speed = 1) =>
    Math.sin(clock * 0.9 * speed + seed) * 0.6 + Math.sin(clock * 1.7 * speed + seed * 2.3) * 0.3 + Math.sin(clock * 2.9 * speed + seed * 3.7) * 0.1;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  // 0 before `a`, 1 after `b`, eased between.
  const span = (t, a, b) => smooth(clamp01((t - a) / (b - a)));

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  let progress = 0;
  let orbit = { az: 0, el: 0 };
  let orbitTarget = { az: 0, el: 0 };

  function applyShot(t) {
    let i = 0;
    while (i < SHOTS.length - 2 && t > SHOTS[i + 1].at) i++;
    const a = SHOTS[i];
    const b = SHOTS[i + 1];
    const k = smooth(clamp01((t - a.at) / (b.at - a.at)));
    tmpA.fromArray(a.pos);
    tmpB.fromArray(b.pos);
    // A tall phone screen is narrow, so stand further back to keep it all in.
    // The vertical field of view is fixed, so a taller stage (the controls
    // folded away, or a phone) would show the subject larger. Standing back as
    // the stage grows taller keeps it the same size against the width.
    const back = 1.05 * Math.pow(Math.max(1, 2.3 / camera.aspect), 0.8);
    const pos = tmpA.lerp(tmpB, k).multiplyScalar(back);
    lookAt.fromArray(a.look).lerp(tmpB.fromArray(b.look), k);
    // Aim a little under the subject so it sits higher in the frame and the
    // pool of light beneath it is not cut off by the bottom edge.
    lookAt.y -= 0.4;

    // The drag offset rides on top of the shot rather than replacing it, so a
    // reader can look around without losing the choreography.
    const r = pos.length();
    const az = Math.atan2(pos.x, pos.z) + orbit.az;
    const el = Math.asin(clamp01((pos.y / r + 1) / 2) * 2 - 1) + orbit.el;
    const ce = Math.max(-1.2, Math.min(1.2, el));
    camera.position.set(r * Math.cos(ce) * Math.sin(az), r * Math.sin(ce), r * Math.cos(ce) * Math.cos(az));
    camera.fov = a.fov + (b.fov - a.fov) * k;

    // The end of the run: the final product has settled, and the camera pans
    // to it and closes in, so what you are left looking at is what was made.
    const product = subject?.last && subject.result?.ok ? subject.product : null;
    if (product && t > 0.86) {
      const pan = smooth(clamp01((t - 0.86) / 0.14));
      product.getWorldPosition(tmpB);
      lookAt.lerp(tmpB, pan);
      camera.position.lerp(tmpB.clone().add(new THREE.Vector3(1.6, 1.0, 6.4).multiplyScalar(back)), pan * 0.6);
      camera.fov += (34 - camera.fov) * pan;
    }
    // On a taller stage the caption column is a bigger share of the width, so
    // the subject is kept to the right of it by aiming a little to its left.
    lookAt.x -= (back - 1.05) * 2.4;
    camera.updateProjectionMatrix();
    camera.lookAt(lookAt);
  }

  // Where the molecule is along its run, for a given t.
  function placeSubject(t, clock) {
    if (!subject) return;
    const { enzyme, outgoing, molecule, product, flyer, radius, result, op, carry, last } = subject;
    const parts = enzyme.userData.parts;

    // The swap: this stage's enzyme comes in while the last one leaves.
    const arrive = span(t, 0, 0.17);
    enzyme.position.copy(OFFSTAGE_IN).lerp(new THREE.Vector3(0, 0, 0), arrive);
    enzyme.position.y += breathe(clock, 0.4, 0.5) * radius * 0.03;
    enzyme.position.x += breathe(clock, 3.1, 0.4) * radius * 0.02;
    enzyme.rotation.y = -0.35 + Math.sin(clock * 0.12) * 0.06 + t * 0.4;
    // Past the top of its stated window the body is visibly shaken rather than
    // broken: this toy has no model of denaturation and must not mime one.
    const ag = climate.agitation;
    if (ag > 0) {
      enzyme.position.x += Math.sin(clock * 34.1) * radius * 0.013 * ag;
      enzyme.position.y += Math.sin(clock * 41.7 + 1.3) * radius * 0.015 * ag;
      enzyme.rotation.z = Math.sin(clock * 27.3) * 0.055 * ag;
    } else {
      enzyme.rotation.z = 0;
    }
    if (outgoing) {
      outgoing.position.lerpVectors(new THREE.Vector3(0, 0, 0), OFFSTAGE_OUT, arrive);
      outgoing.visible = arrive < 0.999;
    }

    const dockAt = new THREE.Vector3(radius * 0.95, -0.05, 0.35);
    // A molecule the previous stage handed over starts where it was let go.
    const start = carry ? HANDOFF.clone() : new THREE.Vector3(radius + 9, 0.6, 2.2);
    // The last stage's product does not leave: it settles in front of the
    // enzyme, where the camera goes to meet it, so the run ends on the thing
    // that was made rather than on an empty cleft.
    const exit = last ? new THREE.Vector3(radius * 1.9, 0.2, 2.2) : HANDOFF.clone();

    const approach = span(t, 0.18, 0.44);
    const anticipate = span(t, 0.4, 0.46) * (1 - span(t, 0.46, 0.5));
    const close = easeOutBack(clamp01((t - 0.46) / 0.1));
    const hand = span(t, 0.56, 0.66);
    // A beat of stillness after the hand-off, before anything moves again.
    const open = span(t, 0.78, 0.86);
    const leave = span(t, 0.86, 1);

    // The jaw draws back a hair, then shuts over whatever is in the cleft.
    const shut = close * (1 - open);
    parts.jawTop.rotation.z = -shut * 0.17 + anticipate * 0.03;
    parts.jawBottom.rotation.z = shut * 0.17 - anticipate * 0.03;
    parts.siteRing.material.emissiveIntensity = 0.8 + hand * (1 - leave) * 3.2;
    parts.siteHalo.material.opacity = 0.25 + hand * (1 - leave) * 0.75;
    parts.siteHalo.scale.setScalar(radius * (2.0 + hand * (1 - leave) * 1.6));

    // The molecule wanders in rather than sliding down a rail, and bumps a
    // lobe once on the way. Everything keeps a little jitter throughout:
    // nothing in a cell is ever still, and nothing here is ever posed.
    const wander = new THREE.Vector3(
      breathe(clock, 1.3) * radius * 0.5 * (1 - approach),
      breathe(clock, 4.1) * radius * 0.42 * (1 - approach) + Math.sin(approach * Math.PI) * radius * 0.5,
      breathe(clock, 7.9) * radius * 0.4 * (1 - approach),
    );
    const docked = molecule.position.copy(start).lerp(dockAt, easeInOutCubic(approach)).add(wander);
    const held = 0.4 + 0.6 * (1 - approach); // the jitter calms once it is seated
    molecule.position.x += breathe(clock, 0.7, 1.6) * radius * 0.06 * held;
    molecule.position.y += breathe(clock, 2.2, 1.6) * radius * 0.06 * held;
    molecule.rotation.y = clock * 0.5;
    molecule.rotation.x = Math.sin(clock * 0.35) * 0.18;

    if (result?.ok) {
      // The product replaces the input at the moment the group changes hands,
      // and then drifts to the hand-off point for the next stage.
      const swapped = hand > 0.5;
      molecule.visible = !swapped;
      if (product) {
        product.visible = swapped;
        product.position.copy(docked).lerp(exit, leave);
        product.rotation.copy(molecule.rotation);
      }
      if (flyer) {
        const donor = new THREE.Vector3(radius * 1.2, -radius * 2.2, 2.6);
        const away = new THREE.Vector3(radius * 1.1, -radius * 2.4, 3.0);
        const hop = easeInOutCubic(hand);
        // A squash at the moment of contact, which is what sells the hand-off.
        const impact = Math.sin(clamp01((hand - 0.78) / 0.22) * Math.PI);
        if (op === 'add') {
          flyer.visible = t > 0.3 && hand < 0.995;
          flyer.position.copy(donor).lerp(dockAt, hop);
          flyer.position.y += Math.sin(hop * Math.PI) * radius * 0.5;
          flyer.scale.set(1 + impact * 0.2, 1 - impact * 0.15, 1 + impact * 0.2).multiplyScalar(1 - hop * 0.35);
        } else {
          flyer.visible = hand > 0.02 && leave < 0.9;
          flyer.position.copy(dockAt).lerp(away, hop);
          flyer.position.y -= Math.sin(hop * Math.PI) * radius * 0.35;
          flyer.scale.set(1 + impact * 0.2, 1 - impact * 0.15, 1 + impact * 0.2).multiplyScalar(Math.min(1, 0.5 + hand));
        }
        flyer.rotation.y = clock * 1.1;
        flyer.rotation.z = clock * 0.7;
      }
    } else {
      // A refusal, shown mid-run: it comes in, will not seat, and backs out.
      // The jaw never shuts, which is the whole point of the moment.
      const bounce = span(t, 0.62, 0.9);
      const nudge = dockAt.clone().add(new THREE.Vector3(radius * 0.9, 0, 0.3));
      molecule.position.copy(start).lerp(nudge, easeInOutCubic(approach));
      molecule.position.lerp(start.clone().add(new THREE.Vector3(radius * 0.6, -1.2, 1.6)), bounce);
      molecule.position.x += breathe(clock, 0.7, 1.6) * radius * 0.06;
      molecule.visible = true;
      // The jaw tries, half shuts on nothing, and shakes itself off.
      const tryShut = span(t, 0.44, 0.52) * (1 - span(t, 0.58, 0.68));
      const shake = Math.exp(-(clamp01((t - 0.52) / 0.1)) * 3) * Math.sin(clamp01((t - 0.52) / 0.1) * Math.PI * 6) * (t > 0.52 ? 1 : 0);
      parts.jawTop.rotation.z = -tryShut * 0.07 + shake * 0.05;
      parts.jawBottom.rotation.z = tryShut * 0.07 - shake * 0.05;
      parts.siteRing.material.emissiveIntensity = 0.35;
      parts.siteHalo.material.opacity = 0.12;
    }
  }

  /* ---------- labels: 3D points the overlay can draw leader lines to ---------- */

  function labelAnchors() {
    if (!subject) return [];
    const parts = subject.enzyme.userData.parts;
    const sites = subject.entry.domain?.sites ?? [];
    const out = [
      { id: 'cleft', text: 'The cleft', detail: 'The gap the molecule has to sit in. Carved here, not measured.', object: parts.siteRing },
      { id: 'site', text: `Active site · ${subject.entry.group}`, detail: 'Where this toy draws the chemistry as happening.', object: parts.siteHalo },
      { id: 'upper', text: 'Upper lobe', detail: 'One half of the jaw. It swings down over the cleft.', object: parts.upper },
      { id: 'lower', text: 'Lower lobe', detail: 'The other half, and the hinge between them.', object: parts.lower },
    ];
    parts.lobes.forEach((mesh, i) => {
      const site = sites[i];
      if (!site) return;
      out.push({
        id: `ribbon-${i}`,
        text: `${site.label} · ${site.region}`,
        detail: `${site.region} · named in the catalogue entry. Where it sits is invented.`,
        object: mesh.userData.pin ?? mesh,
      });
    });
    return out;
  }

  const projected = new THREE.Vector3();
  function project(object) {
    object.getWorldPosition(projected);
    projected.project(camera);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    return {
      x: (projected.x * 0.5 + 0.5) * w,
      y: (-projected.y * 0.5 + 0.5) * h,
      visible: projected.z < 1,
    };
  }

  /* ---------- the loop ---------- */

  let running = true;
  let clock = 0;
  let last = performance.now();
  let onFrame = null;

  function resize() {
    const parent = renderer.domElement.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 800;
    const h = parent.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On a wide screen the story cards sit on the left, so slide the frame and
    // put the subject in the right-hand part of the picture.
    if (w > 900) camera.setViewOffset(w, h, -w * 0.13, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    if (!running) return;
    const rawDt = (now - last) / 1000;
    const dt = Math.min(0.05, rawDt);
    last = now;
    if (rawDt > 0 && rawDt < 1) adaptResolution(rawDt);
    clock += dt;

    orbit.az += (orbitTarget.az - orbit.az) * Math.min(1, dt * 6);
    orbit.el += (orbitTarget.el - orbit.el) * Math.min(1, dt * 6);
    orbitTarget.az *= 1 - Math.min(1, dt * 0.35);
    orbitTarget.el *= 1 - Math.min(1, dt * 0.35);

    dust.rotation.y += dt * 0.012;
    floorColour.lerp(floorTarget, Math.min(1, dt * 2));
    floorRim.material.color.copy(floorColour);
    floorFill.material.color.copy(floorColour);
    floorLight.color.copy(floorColour);
    stage.traverse((o) => {
      if (o.userData.orbit) o.rotation.z += dt * o.userData.orbit;
    });
    // The far clumps drift slower than anything in front of them.
    for (const disc of bokeh.children) {
      const s = disc.userData.seed;
      disc.position.x += Math.sin(clock * 0.07 + s) * dt * 0.08;
      disc.position.y += Math.cos(clock * 0.05 + s * 1.7) * dt * 0.05;
    }

    // Warm or cool the whole picture. Hot shifts the ground towards magenta
    // and switches a red light on at the far edge; cold drains it towards blue
    // and lifts the cool fill, so a run held under its window reads as slow
    // rather than wrong.
    const warm = climate.warmth;
    tint.copy(VACUUM_BASE).lerp(warm >= 0 ? VACUUM_HOT : VACUUM_COLD, Math.abs(warm));
    scene.background.copy(tint);
    scene.fog.color.copy(tint);
    scene.fog.density = 0.04 + Math.max(0, warm) * 0.03;
    heat.intensity = Math.max(0, warm) * 2.6;
    fill.intensity = 0.45 + Math.max(0, -warm) * 1.2;
    key.intensity = 1.9 - Math.max(0, -warm) * 0.5;

    applyShot(progress);
    placeSubject(progress, clock);
    renderer.render(scene, camera);
    if (onFrame) onFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const handle = {
    ok: true,
    scene,
    camera,
    renderer,
    stage,
    subject: null,
    setSubject,
    setClimate({ warmth = 0, agitation = 0 } = {}) {
      climate.warmth = Math.max(-1, Math.min(1, warmth));
      climate.agitation = clamp01(agitation);
    },
    setProgress(t) {
      progress = clamp01(t);
    },
    getProgress: () => progress,
    nudgeOrbit(dx, dy) {
      orbitTarget.az = Math.max(-0.9, Math.min(0.9, orbitTarget.az - dx * 0.004));
      orbitTarget.el = Math.max(-0.5, Math.min(0.5, orbitTarget.el + dy * 0.003));
    },
    labelAnchors,
    project,
    resize,
    onFrame(fn) {
      onFrame = fn;
    },
    // Render one frame synchronously, which is how a screenshot gets a
    // deterministic picture instead of whatever the loop was mid-way through.
    renderAt(t, atClock = 6) {
      progress = clamp01(t);
      clock = atClock;
      applyShot(progress);
      placeSubject(progress, clock);
      renderer.render(scene, camera);
      if (onFrame) onFrame();
    },
    dispose() {
      running = false;
      clearStage();
      renderer.dispose();
    },
  };
  return handle;
}
