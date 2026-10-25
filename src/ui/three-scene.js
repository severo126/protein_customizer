// The vacuum: a 3D stage for one enzyme and one molecule.
//
// Everything in here is invented geometry. The blobs are noise-displaced
// spheres, the cleft is a dish carved out of two of them, and the ribbons are
// tubes and arrows laid on the surface along paths this file makes up. The
// only thing that comes from data is which of the three region labels each
// ribbon gets, and what the molecule is carrying — both read straight out of
// the fixed catalogue. There is no coordinate set anywhere near this file, and
// the screen that uses it says so on top of the canvas.
//
// Nothing here decides anything either: the scene is handed the result the
// bench already computed, so the picture cannot show a reaction the rules did
// not run.

import * as THREE from 'three';
import { groupMeta } from '../model/molecules.js';
import { buildStructure, buildGroupFragment, elementMeta, STRUCTURE_NOTE } from '../model/structure.js';

export const SCENE_NOTE = 'Invented geometry — not a structure.';

export const SCENE_NOTE_LONG =
  `The enzyme is a noise-displaced blob with a carved cleft and ribbons laid on by hand: not a coordinate set, not a structure, not a trajectory. ${STRUCTURE_NOTE}`;

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

// A procedural environment, painted into a canvas and run through PMREM. No
// image file to ship, and it is what makes the bodies read as metal rather
// than as flat plastic.
function studioEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#2b3350');
  sky.addColorStop(0.45, '#10131c');
  sky.addColorStop(1, '#05070b');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 256);

  // Soft light panels: the bright streaks that slide across a metal surface.
  const panel = (x, y, w, h, colour, blur) => {
    g.save();
    g.filter = `blur(${blur}px)`;
    g.fillStyle = colour;
    g.fillRect(x, y, w, h);
    g.restore();
  };
  panel(40, 18, 150, 54, 'rgba(226,238,255,0.95)', 16);
  panel(300, 10, 110, 40, 'rgba(150,200,255,0.75)', 20);
  panel(210, 96, 230, 20, 'rgba(255,198,92,0.55)', 26);
  panel(0, 186, 512, 30, 'rgba(92,208,255,0.22)', 34);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

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

  const geo = welded(new THREE.IcosahedronGeometry(radius, 6));
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

// A ribbon laid over a lobe's outer face: a coil for a helix, a run of flat
// arrows for a sheet, a thin meander for a loop. Which one comes from the
// entry's own region label; the path itself is invented.
function ribbonMesh(region, seed, radius, lane, shape, outward) {
  const colour = REGION_COLOUR[region] ?? 0x8c95ad;
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    metalness: 0.3,
    roughness: 0.35,
    emissive: new THREE.Color(colour).multiplyScalar(0.28),
  });

  // Walk across the front of the lobe at a given height, away from the cleft.
  const steps = 90;
  const base = [];
  const lat = lane * outward; // positive = towards the outer pole of this lobe
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lon = -1.35 + t * 1.7 + seed * 0.3; // around the lobe, front side
    const wob = region === 'loop' ? Math.sin(t * Math.PI * 3 + seed * 5) * 0.12 : 0;
    const y = lat + wob;
    const c = Math.sqrt(Math.max(0.05, 1 - y * y));
    base.push(new THREE.Vector3(Math.sin(lon) * c, y, Math.cos(lon) * c).normalize());
  }

  if (region === 'helix') {
    // A coil: the path winds round the walk, lifted off the surface.
    const pts = [];
    const turns = 7;
    for (let i = 0; i < base.length; i++) {
      const t = i / (base.length - 1);
      const n = base[i];
      const next = base[Math.min(i + 1, base.length - 1)];
      const tangent = next.clone().sub(base[Math.max(i - 1, 0)]).normalize();
      const side = new THREE.Vector3().crossVectors(n, tangent).normalize();
      const ang = t * turns * Math.PI * 2;
      const p = shape.surface(n, radius * (0.07 + 0.05 * Math.cos(ang)));
      p.addScaledVector(side, Math.sin(ang) * radius * 0.07);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const coil = new THREE.Mesh(new THREE.TubeGeometry(curve, 360, radius * 0.032, 8, false), material);
    coil.userData.mid = curve.getPointAt(0.55);
    return coil;
  }

  const pts = base.map((n) => shape.surface(n, radius * 0.035));
  const curve = new THREE.CatmullRomCurve3(pts);

  if (region === 'sheet') {
    const group = new THREE.Group();
    const strands = 3;
    for (let k = 0; k < strands; k++) {
      const t0 = 0.12 + (k / strands) * 0.78;
      const t1 = t0 + 0.2;
      const a = curve.getPointAt(t0);
      const b = curve.getPointAt(t1);
      const len = a.distanceTo(b);
      const normal = a.clone().normalize();
      const body = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.2, radius * 0.035, len * 0.74), material);
      const mid = a.clone().lerp(b, 0.37);
      body.position.copy(mid);
      body.up.copy(normal);
      body.lookAt(b);
      group.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.17, len * 0.3, 3), material);
      tip.position.copy(a.clone().lerp(b, 0.86));
      tip.up.copy(normal);
      tip.lookAt(b);
      tip.rotateX(Math.PI / 2);
      tip.scale.set(1, 1, 0.25);
      group.add(tip);
    }
    group.userData.mid = curve.getPointAt(0.5);
    return group;
  }

  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, radius * 0.038, 8, false), material);
  tube.userData.mid = curve.getPointAt(0.45);
  return tube;
}

// The whole piece: two lobes with a cleft between them, ribbons on the
// surface, and a lit ring where the chemistry is drawn to happen.
function buildEnzyme(entry, env) {
  const seed = seedOf(entry.id);
  const hue = entry.cartoon.hue / 360;
  const base = new THREE.Color().setHSL(hue, 0.42, 0.52);
  const radius = 1.15 + (entry.domain?.radius ?? 2) * 0.1;

  const metal = new THREE.MeshStandardMaterial({
    color: base,
    metalness: 0.94,
    roughness: 0.26,
    envMap: env,
    envMapIntensity: 1.25,
  });

  const group = new THREE.Group();
  group.userData.parts = {};

  const squash = new THREE.Vector3(1.18, 0.9, 1.0);
  const upperShape = lobeShape(seed, { radius, squash, dishAt: new THREE.Vector3(0.35, -1, 0).normalize(), dishDepth: 0.42 });
  const lowerShape = lobeShape(seed + 0.37, { radius: radius * 0.94, squash, dishAt: new THREE.Vector3(0.35, 1, 0).normalize(), dishDepth: 0.42 });
  const upper = new THREE.Mesh(upperShape.geo, metal);
  upper.position.y = radius * 0.46;
  const lower = new THREE.Mesh(lowerShape.geo, metal);
  lower.position.y = -radius * 0.46;

  const jawTop = new THREE.Group();
  const jawBottom = new THREE.Group();
  jawTop.add(upper);
  jawBottom.add(lower);
  group.add(jawTop, jawBottom);
  group.userData.parts.jawTop = jawTop;
  group.userData.parts.jawBottom = jawBottom;
  group.userData.parts.upper = upper;
  group.userData.parts.lower = lower;

  // Ribbons, one per site, from the entry's own loop / helix / sheet labels.
  // They are laid on the lobe's own skin, so they ride the jaw as it shuts.
  const sites = entry.domain?.sites ?? [];
  group.userData.parts.ribbons = [];
  sites.forEach((site, i) => {
    const onLower = i % 2 === 1;
    const lane = [0.28, 0.1, -0.12, 0.45][i % 4];
    const mesh = ribbonMesh(site.region, seed + i * 0.61, radius, lane, onLower ? lowerShape : upperShape, onLower ? -1 : 1);
    mesh.userData.site = site;
    // A point on the ribbon itself for the leader line, not the lobe centre.
    const pin = new THREE.Object3D();
    pin.position.copy(mesh.userData.mid ?? new THREE.Vector3());
    mesh.add(pin);
    mesh.userData.pin = pin;
    (onLower ? lower : upper).add(mesh);
    group.userData.parts.ribbons.push(mesh);
  });

  // The active site: a ring at the mouth of the cleft, lit in the colour of
  // the group this enzyme moves.
  const gm = groupMeta(entry.group);
  const siteColour = new THREE.Color().setHSL(gm.hue / 360, 0.8, 0.6);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.42, radius * 0.045, 12, 48),
    new THREE.MeshStandardMaterial({
      color: siteColour,
      emissive: siteColour,
      emissiveIntensity: 1.1,
      metalness: 0.2,
      roughness: 0.4,
    }),
  );
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
function ballAndStick(structure, env, { scale = 1, emissive = 0 } = {}) {
  const group = new THREE.Group();
  const stick = new THREE.MeshStandardMaterial({ color: 0xa8b2c8, metalness: 0.85, roughness: 0.3, envMap: env });
  const byElement = new Map();
  const atomMeshes = [];

  for (const atom of structure.atoms) {
    const meta = elementMeta(atom.element);
    let material = byElement.get(atom.element);
    if (!material) {
      const colour = new THREE.Color(meta.colour);
      material = new THREE.MeshStandardMaterial({
        color: colour,
        metalness: 0.45,
        roughness: 0.22,
        envMap: env,
        envMapIntensity: 1.2,
        emissive: colour.clone().multiplyScalar(emissive),
      });
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

function buildMolecule(mol, env, { scale = 1 } = {}) {
  const structure = buildStructure(mol);
  // The layout is in its own units, and a starch fragment is far larger than
  // hydrogen peroxide. Fit each one to about the same size on screen, with a
  // little room so a bigger molecule still reads as bigger.
  const extent = Math.max(
    0.8,
    ...structure.atoms.map((a) => Math.hypot(a.pos[0], a.pos[1], a.pos[2])),
  );
  const fitted = (scale * 1.9) / Math.pow(extent, 0.82);
  const group = ballAndStick(structure, env, { scale: fitted, emissive: 0.08 });
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
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
  if (!renderer.getContext()) return { ok: false, reason: 'no WebGL context' };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060a);
  scene.fog = new THREE.FogExp2(0x04060a, 0.045);

  // How the vacuum is being run: warmth from -1 (held well under the stated
  // window) to +1 (well over it), and agitation, which is only ever non-zero
  // past the top of the entry's own stated window. Both are set from
  // src/ui/climate.js, which reads the activity curve — the scene does not
  // decide anything about temperature, it only shows what that number says.
  const climate = { warmth: 0, agitation: 0 };
  const VACUUM_BASE = new THREE.Color(0x04060a);
  const VACUUM_HOT = new THREE.Color(0x200703);
  const VACUUM_COLD = new THREE.Color(0x03101e);
  const RIM_BASE = new THREE.Color(0xffc65c);
  const RIM_HOT = new THREE.Color(0xff4a22);
  const tint = new THREE.Color();
  const rimTint = new THREE.Color();

  const env = studioEnvironment(renderer);
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 1.4, 9);

  // The env map does most of the work; these three give it direction.
  const key = new THREE.DirectionalLight(0xdce8ff, 2.4);
  key.position.set(-4, 5, 6);
  const rim = new THREE.DirectionalLight(0xffc65c, 3.4);
  rim.position.set(5, -1.5, -5);
  const fill = new THREE.DirectionalLight(0x5cd0ff, 0.8);
  fill.position.set(3, 2, 4);
  scene.add(key, rim, fill, new THREE.AmbientLight(0x3a4256, 0.25));

  /* dust, so the vacuum has depth rather than being a flat black */
  const dustCount = 900;
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
      size: 0.08,
      map: glowTexture(),
      color: 0x8fb4d8,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(dust);

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

    const enzyme = buildEnzyme(entry, env);
    enzyme.position.copy(OFFSTAGE_IN);
    stage.add(enzyme);

    const molecule = buildMolecule(molIn, env, { scale: 1 });
    stage.add(molecule);

    let product = null;
    if (result?.ok) {
      product = buildMolecule(result.product, env, { scale: 1 });
      product.visible = false;
      stage.add(product);
    }

    // The group that changes hands, drawn with its own atoms.
    let flyer = null;
    const op = entry.action.op;
    if (result?.ok && (op === 'add' || op === 'remove')) {
      const meta = groupMeta(entry.action.group);
      const colour = new THREE.Color().setHSL(meta.hue / 360, 0.85, 0.6);
      flyer = ballAndStick(buildGroupFragment(entry.action.group), env, { scale: 0.6, emissive: 0.5 });
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
    const pos = tmpA.lerp(tmpB, k).multiplyScalar(Math.max(1, 0.9 / camera.aspect));
    lookAt.fromArray(a.look).lerp(tmpB.fromArray(b.look), k);

    // The drag offset rides on top of the shot rather than replacing it, so a
    // reader can look around without losing the choreography.
    const r = pos.length();
    const az = Math.atan2(pos.x, pos.z) + orbit.az;
    const el = Math.asin(clamp01((pos.y / r + 1) / 2) * 2 - 1) + orbit.el;
    const ce = Math.max(-1.2, Math.min(1.2, el));
    camera.position.set(r * Math.cos(ce) * Math.sin(az), r * Math.sin(ce), r * Math.cos(ce) * Math.cos(az));
    camera.fov = a.fov + (b.fov - a.fov) * k;
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
    const exit = last ? new THREE.Vector3(-radius - 9, -1.4, 3.4) : HANDOFF.clone();

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
    parts.ribbons.forEach((mesh, i) => {
      const site = sites[i];
      if (!site) return;
      out.push({
        id: `ribbon-${i}`,
        text: `${site.label} · ${site.region}`,
        detail: `Drawn as a ${site.region} because the catalogue entry labels this region a ${site.region}.`,
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
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    orbit.az += (orbitTarget.az - orbit.az) * Math.min(1, dt * 6);
    orbit.el += (orbitTarget.el - orbit.el) * Math.min(1, dt * 6);
    orbitTarget.az *= 1 - Math.min(1, dt * 0.35);
    orbitTarget.el *= 1 - Math.min(1, dt * 0.35);

    dust.rotation.y += dt * 0.012;

    // Warm or cool the whole picture. Hot reddens the vacuum and pushes the rim
    // light towards an element glow; cold drains it towards blue and lifts the
    // cool fill, so a run held under its window reads as slow rather than wrong.
    const warm = climate.warmth;
    tint.copy(VACUUM_BASE).lerp(warm >= 0 ? VACUUM_HOT : VACUUM_COLD, Math.abs(warm));
    scene.background.copy(tint);
    scene.fog.color.copy(tint);
    scene.fog.density = 0.045 + Math.max(0, warm) * 0.03;
    rimTint.copy(RIM_BASE).lerp(RIM_HOT, Math.max(0, warm));
    rim.color.copy(rimTint);
    rim.intensity = 3.4 + Math.max(0, warm) * 2.2;
    fill.intensity = 0.8 + Math.max(0, -warm) * 1.4;
    key.intensity = 2.4 - Math.max(0, -warm) * 0.7;

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
    env,
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
      env.dispose();
      renderer.dispose();
    },
  };
  return handle;
}
