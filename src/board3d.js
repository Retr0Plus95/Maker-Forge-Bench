// The 3D board (board-view design §5; 0.5 big improvements B7–B9): the project's perfboard with every
// part drawn from datasheet sizes, the wiring underneath, solder joints, studio lighting and soft
// shadows; a view cube, view buttons, smooth camera moves, hover names; and tools: exploded view,
// X-ray, a cut-away, measuring, and saving a picture or an STL.
// three.js r128 (self-hosted, the same version as Maker Forge) loads only when this view first opens.
// 0.9: real parts. Where the Maker Forge Library has a model that fits (library-match.js), it takes
// the drawn part's place once it has loaded, painted with Bench's markings (bands, colours, prints).
import { BOARD_THICKNESS, LED_COLOURS, SIZES, bandLayout, busColour, colourInValue, partGeometry } from './board3d-geometry.js';
import { MISS_LIMIT, holesFor, modelFor, placeFor } from './library-match.js';
import { resistorBands } from './markings.js';

const LINK_COLOURS = ['#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#3b82f6', '#eab308', '#ec4899'];
const SELECT = '#ff2bd6';
const STEP = '#28c4ff';
const NET = '#ff9f1a';
const HOVER = '#ffffff';
/** Why a part is drawn by Bench rather than from the library (info().whySimple). */
export const WHY_SIMPLE = { noFit: 'no library model fits', notLoaded: "the model didn't load", misses: "the model's pins miss the holes" };
export const VIEW_NAMES = ['top', 'bottom', 'front', 'side', 'iso'];

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); // browsers allow only a few contexts: give it back
    return Boolean(gl);
  } catch {
    return false;
  }
}

const motionReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';

/**
 * Builds the view in `host`. Gives null when this browser can't draw 3D.
 * - camera: a saved camera ({ side, position, target }) to start from; onCamera(camera) is told whenever it moves
 * - details: { ref: { value, label } } from the project, for colour bands, printing and hover names
 * - onPick(ref), onHover(ref | null)
 * - parts3d: 'real' (the library's models where one fits, the default) or 'simple' (Bench's own)
 * - library: the library's index.json, parsed (or a promise of it); models: createModels(…) (or a
 *   promise of it); onProgress({ done, total }) as the real parts load
 * - modelBytes(choice): the bytes of a model a look chose that isn't the library's (own:…, project:…)
 */
export async function createBoard3D(host, board, {
  onPick, onHover = () => {}, camera: savedCamera = null, onCamera = () => {}, details = {},
  parts3d = 'real', library = null, models = null, onProgress = () => {}, modelBytes = async () => null,
}) {
  if (!webglAvailable()) return null;
  const THREE = await import('./three.module.js');
  const { OrbitControls } = await import('./three-orbit-controls.js');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true; // a real part with bent legs hides its own straight ones
  const tip = document.createElement('div');
  tip.className = 'board3d-tip';
  tip.hidden = true;
  const measureNote = document.createElement('div');
  measureNote.id = 'board3d-measure';
  measureNote.hidden = true;
  host.replaceChildren(renderer.domElement, tip, measureNote);

  const T = BOARD_THICKNESS;
  const p = board.pitch;
  const cx = ((board.cols - 1) * p) / 2;
  const cz = ((board.rows - 1) * p) / 2;
  const span = Math.max(board.cols, board.rows) * p;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(cx, 0, cz);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;

  // ---- light: a small studio light box as the environment (reflections on metal), plus a key
  // light that casts soft shadows on the board
  const pmrem = new THREE.PMREMGenerator(renderer);
  const box = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x5a5f66, side: THREE.BackSide }));
  box.add(room);
  for (const [x, y, z, w, h, d, k] of [[0, 4.9, 0, 6, 0.1, 6, 3.2], [-4.9, 1.5, 0, 0.1, 3, 6, 1.6], [4.9, 1.5, 1, 0.1, 3, 4, 1.2], [0, 1, -4.9, 6, 3, 0.1, 0.9]]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k) }));
    panel.position.set(x, y, z);
    box.add(panel);
  }
  const envMap = pmrem.fromScene(box, 0.04).texture;
  scene.environment = envMap;
  box.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(cx + span * 0.6, span * 1.4, cz + span * 0.8);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -span * 0.8, right: span * 0.8, top: span * 0.8, bottom: -span * 0.8, near: 1, far: span * 4 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const under = new THREE.DirectionalLight(0xffffff, 0.5);
  under.position.set(cx - span * 0.5, -span * 1.6, cz + span * 0.6);
  scene.add(under);

  // ---- materials: colours are sRGB, so they're turned linear for the renderer
  const materials = new Map();
  const material = (colour, opts = {}) => {
    const key = `${colour}|${opts.metal || 0}|${opts.clear ? 1 : 0}|${opts.side || 0}`;
    if (!materials.has(key)) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colour).convertSRGBToLinear(),
        roughness: opts.metal ? 0.3 : 0.55,
        metalness: opts.metal || 0,
        transparent: Boolean(opts.clear),
        opacity: opts.clear ? 0.78 : 1,
        side: opts.side ? THREE.DoubleSide : THREE.FrontSide,
        envMapIntensity: opts.metal ? 1 : 0.55, // plastics shine less than metal
      });
      materials.set(key, mat);
    }
    return materials.get(key);
  };
  // geometry's (x, y, z-up) → three's (x, y-up, z)
  const v3 = (x, y, z) => new THREE.Vector3(x, z, y);
  const UP = new THREE.Vector3(0, 1, 0);
  function segment(a, b, radius, mat, sides = 12) {
    const len = a.distanceTo(b);
    if (len < 1e-6) return null;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, sides), mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return mesh;
  }

  // ---- the board: FR-4 with tinned pads and drilled holes, both faces
  const boardMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#245a30').convertSRGBToLinear(), roughness: 0.78, metalness: 0, envMapIntensity: 0.4 });
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry((board.cols + 1) * p, T, (board.rows + 1) * p), boardMat);
  boardMesh.position.set(cx, -T / 2, cz);
  boardMesh.receiveShadow = true;
  scene.add(boardMesh);
  const holes = board.cols * board.rows;
  const padMat = material('#c8ccd0', { metal: 0.9 });
  const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85, 0.85, T + 0.08, 16), padMat, holes);
  const drills = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.45, T + 0.14, 10), material('#0d0d0d'), holes);
  pads.receiveShadow = true;
  const m = new THREE.Matrix4();
  let i = 0;
  for (let c = 1; c <= board.cols; c++) {
    for (let r = 1; r <= board.rows; r++) {
      m.makeTranslation((c - 1) * p, -T / 2, (r - 1) * p);
      pads.setMatrixAt(i, m);
      drills.setMatrixAt(i, m);
      i++;
    }
  }
  scene.add(pads, drills);

  // a run of straight pieces as one mesh: one draw call per link, however many bends it has
  function polyline(points, radius, mat) {
    const positions = [];
    const normals = [];
    for (let k = 1; k < points.length; k++) {
      const piece = segment(points[k - 1], points[k], radius, mat);
      if (!piece) continue;
      piece.updateMatrix();
      const geo = piece.geometry.toNonIndexed();
      geo.applyMatrix4(piece.matrix);
      positions.push(...geo.attributes.position.array);
      normals.push(...geo.attributes.normal.array);
      geo.dispose();
      piece.geometry.dispose();
    }
    if (!positions.length) return null;
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return new THREE.Mesh(merged, mat);
  }

  // ---- underneath: bare-wire buses, insulated links, solder bridges ("Wiring underneath" shows or hides them)
  const wiring = [];
  const at = ([c, r], z) => v3((c - 1) * p, (r - 1) * p, z);
  for (const bus of board.buses) {
    const mesh = segment(at([bus.from, bus.row], -T - 0.35), at([bus.to, bus.row], -T - 0.35), 0.4, material(busColour(bus.label), { metal: 0.6 }));
    if (mesh) wiring.push(mesh);
  }
  let linkMeshes = 0;
  board.links.forEach((link, n) => {
    const mesh = polyline(link.path.map((h) => at(h, -T - 1)), 0.42, material(LINK_COLOURS[n % LINK_COLOURS.length]));
    if (mesh) {
      wiring.push(mesh);
      linkMeshes++;
    }
  });
  for (const bridge of board.bridges) {
    const mesh = segment(at(bridge.holes[0], -T - 0.3), at(bridge.holes[1], -T - 0.3), 0.75, material('#d0d4d8', { metal: 0.8 }));
    if (mesh) wiring.push(mesh);
  }
  for (const mesh of wiring) scene.add(mesh);

  // ---- printed text and labels
  function textTexture(text, colour, w, h) {
    const canvas = document.createElement('canvas');
    const scale = 48;
    canvas.width = Math.max(32, Math.round(w * scale));
    canvas.height = Math.max(16, Math.round(h * scale));
    const g = canvas.getContext('2d');
    g.font = `bold ${Math.round(canvas.height * 0.72)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = colour;
    g.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.96);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    return texture;
  }
  function label(text, colour) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const g = canvas.getContext('2d');
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(text, 64, 25);
    g.fillStyle = colour;
    g.fillText(text, 64, 25);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, sizeAttenuation: false }));
    sprite.scale.set(LABEL_W, LABEL_H, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  // labels stay the same size on screen however close you are (sizeAttenuation off: units of the view's height)
  const LABEL_W = 0.044;
  const LABEL_H = 0.0165;

  // ---- the parts: one group each, with its own materials so it can be highlighted
  const groups = new Map();
  const pickable = [];
  const jointSpots = [];
  const labels = [];
  function meshFor(prim, ref) {
    const mat = material(prim.colour, { metal: prim.metal ?? (prim.kind === 'wire' || prim.role === 'pin' ? 0.7 : 0), clear: prim.clear, side: prim.kind === 'sector' }).clone();
    let mesh = null;
    if (prim.kind === 'cyl') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(prim.radius, prim.radius, prim.h, 32), mat);
      mesh.position.copy(v3(prim.x, prim.y, prim.z0 + prim.h / 2));
    } else if (prim.kind === 'sector') {
      const theta = Math.atan2(prim.dir[0], prim.dir[1]); // three: x = r sin θ, z = r cos θ; the board's y is three's z
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(prim.radius, prim.radius, prim.h, 8, 1, true, theta - prim.width / 2, prim.width), mat);
      mesh.position.copy(v3(prim.x, prim.y, prim.z0 + prim.h / 2));
    } else if (prim.kind === 'box') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(prim.w, prim.h, prim.d), mat);
      mesh.position.copy(v3(prim.x, prim.y, prim.z0 + prim.h / 2));
      if (prim.angle) mesh.rotation.y = -prim.angle;
    } else if (prim.kind === 'hcyl') {
      mesh = segment(v3(prim.x1, prim.y1, prim.z), v3(prim.x2, prim.y2, prim.z), prim.radius, mat, 28);
    } else if (prim.kind === 'lathe') {
      // the profile spun round three's y; a lying one is turned onto the line between its ends
      const geo = new THREE.LatheGeometry(prim.profile.map(([r, t]) => new THREE.Vector2(r, t)), 40);
      mesh = new THREE.Mesh(geo, mat);
      if (prim.z0 !== undefined) {
        mesh.position.copy(v3(prim.x, prim.y, prim.z0));
      } else {
        const a = v3(prim.x1, prim.y1, prim.z);
        const dir = v3(prim.x2, prim.y2, prim.z).sub(a);
        if (dir.length() < 1e-6) return null;
        mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
        mesh.position.copy(a);
      }
    } else if (prim.kind === 'extrude') {
      // the outline's y is flipped so that, stood up, it lands on the board's y
      const shape = new THREE.Shape(prim.outline.map(([x, y]) => new THREE.Vector2(x, -y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: prim.h, bevelEnabled: prim.bevel !== false, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2, curveSegments: 16 });
      geo.rotateX(-Math.PI / 2);
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(v3(prim.x, prim.y, prim.z0));
      if (prim.angle) mesh.rotation.y = -prim.angle;
    } else if (prim.kind === 'dome') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(prim.radius, prim.radius, prim.h, 32), mat);
      body.position.y = prim.h / 2;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(prim.radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      cap.position.y = prim.h;
      g.add(body, cap);
      g.position.copy(v3(prim.x, prim.y, prim.z0));
      for (const part of [body, cap]) {
        part.userData.ref = ref;
        part.castShadow = true;
        pickable.push(part);
      }
      return g;
    } else if (prim.kind === 'print') {
      if (!prim.text) return null;
      const texture = textTexture(prim.text, prim.colour, prim.w, prim.h);
      const printMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(prim.w, prim.h), printMat);
      const n = new THREE.Vector3(prim.normal[0], prim.normal[2], prim.normal[1]).normalize();
      const up = new THREE.Vector3(prim.up[0], prim.up[2], prim.up[1]).normalize();
      const right = new THREE.Vector3().crossVectors(up, n).normalize();
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
      mesh.position.copy(v3(prim.x, prim.y, prim.z));
      mesh.userData.print = true;
      mesh.userData.text = prim.text;
      return mesh;
    } else if (prim.kind === 'wire') {
      const g = new THREE.Group();
      const pts = prim.points.map((pt) => v3(...pt));
      for (let k = 1; k < pts.length; k++) {
        const s = segment(pts[k - 1], pts[k], prim.radius, mat, 10);
        if (s) g.add(s);
        if (k < pts.length - 1) {
          const bend = new THREE.Mesh(new THREE.SphereGeometry(prim.radius, 10, 8), mat);
          bend.position.copy(pts[k]);
          g.add(bend);
        }
      }
      for (const piece of g.children) {
        piece.userData.ref = ref;
        piece.castShadow = true;
        pickable.push(piece);
      }
      return g;
    }
    if (!mesh) return null;
    mesh.castShadow = true;
    mesh.receiveShadow = prim.role === 'body' || prim.role === 'socket';
    return mesh;
  }
  for (const [ref, part] of Object.entries(board.parts)) {
    const group = new THREE.Group();
    group.userData.ref = ref;
    let top = -Infinity;
    let bottom = Infinity;
    const prims = partGeometry(part, p, ref, details[ref] || {});
    for (const prim of prims) {
      if (prim.kind === 'joint') {
        jointSpots.push(prim);
        continue;
      }
      const mesh = meshFor(prim, ref);
      if (!mesh) continue;
      mesh.userData.ref = ref;
      mesh.userData.role = prim.role;
      group.add(mesh);
      if (mesh.isMesh && !mesh.userData.print) pickable.push(mesh);
      const z0 = prim.z0 ?? prim.z ?? 0;
      if (prim.kind !== 'print' && prim.kind !== 'wire') {
        top = Math.max(top, z0 + (prim.h || prim.radius || 0));
        const lying = prim.kind === 'hcyl' || (prim.kind === 'lathe' && prim.z0 === undefined);
        bottom = Math.min(bottom, z0 - (lying ? prim.radius : 0));
      }
    }
    const tag = label(ref, part.side === 'bottom' ? '#ffd27a' : '#ffffff');
    const centre = prims.find((pr) => pr.role === 'body');
    const lx = centre ? centre.x ?? (centre.x1 + centre.x2) / 2 : 0;
    const ly = centre ? centre.y ?? (centre.y1 + centre.y2) / 2 : 0;
    tag.position.copy(part.side === 'bottom' ? v3(lx, ly, bottom - 3) : v3(lx, ly, Math.max(top, 2) + 3));
    group.add(tag);
    labels.push(tag);
    group.userData.tag = tag;
    group.userData.side = part.side;
    groups.set(ref, group);
    scene.add(group);
  }
  // what's printed along your board's edges (0.6 design §1), shown and hidden with the labels
  for (const e of board.edgeLabels || []) {
    const tag = label(e.text, '#a8d8ff');
    tag.position.copy(at(e.at, 0.4));
    scene.add(tag);
    labels.push(tag);
  }
  // every leg's solder joint under the board: one instanced mesh
  const jointMat = material('#d6d9dc', { metal: 0.9 });
  const joints = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.95, 0.32, 0.9, 16), jointMat, Math.max(1, jointSpots.length));
  jointSpots.forEach((j, k) => {
    m.makeTranslation(j.x, -T - 0.45, j.y);
    joints.setMatrixAt(k, m);
  });
  joints.count = jointSpots.length;
  scene.add(joints);

  // ---- highlighting, lifting, exploding, steps
  let selected = null;
  let hovered = null;
  let stepNow = new Set();
  let stepLater = new Set();
  let hideLater = false;
  let netParts = new Set();
  let explode = 0;
  const LIFT = 1.2;
  let lit = null; // the selected part's holes, lit on both faces of the board
  const litMaterial = new THREE.MeshBasicMaterial({ color: '#ffe066' });
  function lightHoles(ref) {
    if (lit) {
      scene.remove(lit);
      lit.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    lit = null;
    const part = ref ? board.parts[ref] : null;
    if (!part) return 0;
    lit = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(0.75, 0.16, 8, 20);
    for (const [c, r] of Object.values(part.pins)) {
      for (const y of [0.06, -T - 0.06]) {
        const ring = new THREE.Mesh(ringGeo, litMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.set((c - 1) * p, y, (r - 1) * p);
        lit.add(ring);
      }
    }
    scene.add(lit);
    return Object.keys(part.pins).length;
  }
  let litHoles = 0;
  /** Whether obj shows, as far up as group (whose own visibility is the steps'). */
  const shownIn = (obj, group) => {
    for (let o = obj; o && o !== group; o = o.parent) if (!o.visible) return false;
    return true;
  };
  // the selected part is outlined (its body's edges, drawn on top) rather than tinted: a dark chip
  // tinted magenta turns purple
  let outline = null;
  const outlineMat = new THREE.LineBasicMaterial({ color: SELECT, depthTest: false });
  function outlinePart(ref) {
    if (outline) {
      outline.parent.remove(outline);
      outline.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== outlineMat) o.material.dispose(); });
    }
    outline = null;
    const group = ref ? groups.get(ref) : null;
    if (!group) return;
    outline = new THREE.Group();
    group.updateWorldMatrix(true, true);
    if (real.has(ref) && realShown()) {
      // a real model has too many edges to draw them all on top: a box round its body instead
      const box = new THREE.Box3();
      group.traverse((mesh) => { if (mesh.isMesh && mesh.userData.role === 'body' && shownIn(mesh, group)) box.expandByObject(mesh); });
      if (!box.isEmpty()) {
        box.translate(group.position.clone().negate()).expandByScalar(0.15);
        const frame = new THREE.Box3Helper(box, SELECT);
        frame.material.depthTest = false;
        frame.renderOrder = 9;
        outline.add(frame);
      }
      group.add(outline);
      return;
    }
    const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
    group.traverse((mesh) => {
      if (!mesh.isMesh || !['body', 'socket', 'wall', 'top', 'flange', 'foam', 'tab', 'mould'].includes(mesh.userData.role) || !shownIn(mesh, group)) return;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), outlineMat);
      edges.matrixAutoUpdate = false;
      edges.matrix.multiplyMatrices(toGroup, mesh.matrixWorld);
      edges.renderOrder = 9;
      outline.add(edges);
    });
    group.add(outline);
  }
  const explodeOrder = new Map([...groups.keys()].map((ref, k) => [ref, k]));
  function restyle() {
    for (const [ref, group] of groups) {
      const on = ref === selected;
      const bottomSide = group.userData.side === 'bottom';
      const lift = on ? LIFT : 0;
      const spread = explode * (14 + (explodeOrder.get(ref) % 4) * 4);
      group.position.y = bottomSide ? -(lift + spread * 0.6) : lift + spread;
      group.visible = !(hideLater && stepLater.has(ref));
      if (group.userData.tag) group.userData.tag.scale.set(LABEL_W * (on ? 1.35 : 1), LABEL_H * (on ? 1.35 : 1), 1);
      const glow = on ? SELECT : stepNow.has(ref) ? STEP : netParts.has(ref) ? NET : ref === hovered ? HOVER : null;
      const faded = !glow && stepLater.has(ref) && !hideLater;
      group.traverse((obj) => {
        if (!obj.isMesh || obj.userData.print) return;
        obj.material.emissive.set(glow || '#000000');
        obj.material.emissiveIntensity = glow ? (glow === HOVER ? 0.15 : glow === SELECT ? 0.08 : 0.3) : 0;
        if (!obj.material.userData.clearBase) obj.material.userData.clearBase = { transparent: obj.material.transparent, opacity: obj.material.opacity };
        obj.material.transparent = faded || obj.material.userData.clearBase.transparent;
        obj.material.opacity = faded ? 0.22 : obj.material.userData.clearBase.opacity;
      });
    }
    moveClips();
    render();
  }

  // ---- the view cube: a little cube in the corner that turns with the camera; click a face to look from there
  const cubeScene = new THREE.Scene();
  const cubeCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const faceNames = ['side', 'side-left', 'top', 'bottom', 'front', 'back'];
  const faceText = ['RIGHT', 'LEFT', 'TOP', 'UNDER', 'FRONT', 'BACK'];
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), faceText.map((t) => new THREE.MeshBasicMaterial({ map: textTexture(t, '#ffffff', 3, 1.1), color: 0x3a4250 })));
  const underMap = cube.material[3].map;
  underMap.wrapS = THREE.RepeatWrapping;
  underMap.repeat.x = -1;
  underMap.offset.x = 1;
  const cubeEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: 0xe0b55a }));
  cubeScene.add(cube, cubeEdges);
  const CUBE = 92;
  function cubeRect() {
    const w = host.clientWidth || 1;
    return { left: w - CUBE - 8, top: 8, size: CUBE };
  }

  // ---- drawing
  function render() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    const r = cubeRect();
    const dir = camera.position.clone().sub(controls.target).normalize().multiplyScalar(6);
    cubeCam.position.copy(dir);
    cubeCam.up.copy(camera.up);
    cubeCam.lookAt(0, 0, 0);
    renderer.setScissorTest(true);
    renderer.setScissor(r.left, h - r.top - r.size, r.size, r.size);
    renderer.setViewport(r.left, h - r.top - r.size, r.size, r.size);
    const clip = renderer.clippingPlanes;
    renderer.clippingPlanes = [];
    renderer.render(cubeScene, cubeCam);
    renderer.clippingPlanes = clip;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
  }
  controls.addEventListener('change', render);

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  const sizer = new ResizeObserver(resize);
  sizer.observe(host);

  // ---- the camera: views, smooth moves, focus, orbit by key
  let side = 'top';
  const cameraNow = () => ({ side, position: camera.position.toArray(), target: controls.target.toArray() });
  controls.addEventListener('end', () => onCamera(cameraNow()));
  let flight = null;
  function flyTo(position, target) {
    if (flight) cancelAnimationFrame(flight.frame);
    flight = null;
    if (motionReduced()) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      render();
      onCamera(cameraNow());
      return;
    }
    const from = { position: camera.position.clone(), target: controls.target.clone() };
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 450);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      camera.position.lerpVectors(from.position, position, e);
      controls.target.lerpVectors(from.target, target, e);
      controls.update();
      render();
      if (t < 1) flight = { frame: requestAnimationFrame(step) };
      else {
        flight = null;
        onCamera(cameraNow());
      }
    };
    flight = { frame: requestAnimationFrame(step) };
  }
  function viewPosition(name) {
    const lift = span * 1.55;
    const centre = new THREE.Vector3(cx, 0, cz);
    // From below, look from the row-1 edge: columns mirror left to right and row 1 stays at the top,
    // the same as turning the board over and as Flip on sheet 4.
    const spots = {
      top: [cx, lift, cz + span * 0.85],
      bottom: [cx, -lift, cz - span * 0.85],
      front: [cx, span * 0.35, cz + span * 1.75],
      back: [cx, span * 0.35, cz - span * 1.75],
      side: [cx + span * 1.75, span * 0.35, cz],
      'side-left': [cx - span * 1.75, span * 0.35, cz],
      iso: [cx + span * 1.05, span * 1.1, cz + span * 1.25],
    };
    return { position: new THREE.Vector3(...(spots[name] || spots.top)), target: centre };
  }
  function view(name) {
    side = name === 'side-left' ? 'side' : name === 'back' ? 'front' : VIEW_NAMES.includes(name) ? name : 'top';
    camera.up.set(0, 1, 0);
    const { position, target } = viewPosition(name);
    flyTo(position, target);
  }
  /** Frames the whole board from where the camera looks now. */
  function fit() {
    const dir = camera.position.clone().sub(controls.target).normalize();
    const centre = new THREE.Vector3(cx, 0, cz);
    flyTo(centre.clone().add(dir.multiplyScalar(span * 1.9)), centre);
  }
  /** Flies the camera to a part, closer in. */
  function focus(ref) {
    const group = groups.get(ref);
    if (!group) return;
    const centre = new THREE.Vector3();
    new THREE.Box3().setFromObject(group).getCenter(centre);
    const away = camera.position.clone().sub(controls.target).normalize().multiplyScalar(span * 0.7);
    flyTo(centre.clone().add(away), centre);
  }
  /** Turns the camera round the target: left/right and up/down, in radians. */
  function orbit(dTheta, dPhi) {
    const offset = camera.position.clone().sub(controls.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    s.theta += dTheta;
    s.phi = Math.min(Math.PI - 0.05, Math.max(0.05, s.phi + dPhi));
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    controls.update();
    render();
    onCamera(cameraNow());
  }

  // ---- picking: click selects, double-click flies there, hover names the part; the board hides
  // what's behind it; the view cube in the corner turns the camera
  const ray = new THREE.Raycaster();
  const ndc = (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  };
  const shown = (obj) => {
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  function hitAt(e, list = null) {
    ray.setFromCamera(ndc(e), camera);
    return ray.intersectObjects(list || [boardMesh, ...pickable], false).find((h) => shown(h.object)) || null;
  }
  function partAt(e) {
    const hit = hitAt(e);
    return hit && hit.object !== boardMesh ? hit.object.userData.ref : null;
  }
  function cubeFaceAt(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const r = cubeRect();
    const x = e.clientX - rect.left - r.left;
    const y = e.clientY - rect.top - r.top;
    if (x < 0 || y < 0 || x > r.size || y > r.size) return null;
    ray.setFromCamera(new THREE.Vector2((x / r.size) * 2 - 1, -(y / r.size) * 2 + 1), cubeCam);
    const hit = ray.intersectObject(cube, false)[0];
    return hit ? faceNames[hit.face.materialIndex] : 'none';
  }

  let measuring = false;
  let measurePoints = [];
  let measureGroup = null;
  let measured = null;
  function clearMeasure() {
    if (measureGroup) {
      scene.remove(measureGroup);
      measureGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    measureGroup = null;
    measurePoints = [];
    measured = null;
    measureNote.hidden = true;
  }
  function addMeasurePoint(point) {
    if (measurePoints.length === 2) clearMeasure();
    measurePoints.push(point.clone());
    if (!measureGroup) {
      measureGroup = new THREE.Group();
      scene.add(measureGroup);
    }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshBasicMaterial({ color: '#ff2bd6', depthTest: false }));
    dot.position.copy(point);
    dot.renderOrder = 11;
    measureGroup.add(dot);
    if (measurePoints.length === 2) {
      const [a, b] = measurePoints;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ff2bd6', depthTest: false }));
      line.renderOrder = 11;
      measureGroup.add(line);
      const mmDist = a.distanceTo(b);
      measured = { mm: mmDist, holes: mmDist / p };
      measureNote.textContent = `${mmDist.toFixed(1)} mm · ${(mmDist / p).toFixed(1)} holes`;
      measureNote.hidden = false;
    } else {
      measureNote.textContent = 'Click the second point.';
      measureNote.hidden = false;
    }
    render();
  }

  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = e.button === 0 ? [e.clientX, e.clientY] : null; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    downAt = null;
    const face = cubeFaceAt(e);
    if (face) {
      if (face !== 'none') view(face);
      return;
    }
    if (measuring) {
      const hit = hitAt(e, [boardMesh, ...pickable]);
      if (hit) addMeasurePoint(hit.point);
      return;
    }
    const ref = partAt(e);
    if (ref) onPick(ref);
  });
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (cubeFaceAt(e) || measuring) return;
    const ref = partAt(e);
    if (!ref) return;
    focus(ref);
    onPick(ref);
  });
  let hoverFrame = 0;
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons || hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const ref = cubeFaceAt(e) ? null : partAt(e);
      if (ref !== hovered) {
        hovered = ref;
        onHover(ref);
        restyle();
      }
      if (ref) {
        const rect = renderer.domElement.getBoundingClientRect();
        const d = details[ref] || {};
        tip.textContent = d.value ? `${ref} · ${d.value}` : ref;
        tip.style.left = `${e.clientX - rect.left + 14}px`;
        tip.style.top = `${e.clientY - rect.top + 12}px`;
        tip.hidden = false;
      } else {
        tip.hidden = true;
      }
    });
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    tip.hidden = true;
    if (hovered) {
      hovered = null;
      onHover(null);
      restyle();
    }
  });

  // ---- the cut-away: a plane across the columns you can slide
  let clip = null;
  function setClip(f) {
    clip = f === null || f === undefined ? null : Math.min(1, Math.max(0, f));
    const xmin = -p;
    const xmax = board.cols * p;
    renderer.clippingPlanes = clip === null ? [] : [new THREE.Plane(new THREE.Vector3(-1, 0, 0), xmin + (xmax - xmin) * clip)];
    render();
  }

  // ---- saving: a picture, and the board as STL (z up, millimetres)
  function picture() {
    render();
    return renderer.domElement.toDataURL('image/png');
  }
  function stl() {
    const triangles = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const im = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    const addGeometry = (geometry, matrix) => {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      const pos = g.attributes.position;
      for (let k = 0; k + 2 < pos.count; k += 3) {
        a.fromBufferAttribute(pos, k).applyMatrix4(matrix);
        b.fromBufferAttribute(pos, k + 1).applyMatrix4(matrix);
        c.fromBufferAttribute(pos, k + 2).applyMatrix4(matrix);
        triangles.push([a.x, -a.z, a.y, b.x, -b.z, b.y, c.x, -c.z, c.y]); // three's y-up → z-up
      }
      if (g !== geometry) g.dispose();
    };
    scene.updateMatrixWorld(true);
    const skip = (obj) => (lit && lit.children.includes(obj)) || (measureGroup && measureGroup.children.includes(obj));
    scene.traverse((obj) => {
      if (!obj.isMesh || obj.userData.print || !shown(obj) || skip(obj)) return;
      if (obj.isInstancedMesh) {
        for (let k = 0; k < obj.count; k++) {
          obj.getMatrixAt(k, im);
          addGeometry(obj.geometry, world.multiplyMatrices(obj.matrixWorld, im));
        }
      } else {
        addGeometry(obj.geometry, obj.matrixWorld);
      }
    });
    const buffer = new ArrayBuffer(84 + triangles.length * 50);
    const out = new DataView(buffer);
    const title = 'Maker Forge Bench board';
    for (let k = 0; k < 80; k++) out.setUint8(k, k < title.length ? title.charCodeAt(k) : 32);
    out.setUint32(80, triangles.length, true);
    triangles.forEach((t, k) => {
      const o = 84 + k * 50 + 12; // the normal stays (0,0,0): readers work it out from the corners
      t.forEach((v, j) => out.setFloat32(o + j * 4, v, true));
    });
    return buffer;
  }

  // ---- real parts (0.9 design §2): the library's model in each drawn part's place, once loaded
  const NO_FIT = WHY_SIMPLE.noFit;
  const BENT_LIFT = 1.6; // a part whose legs are bent stands this far off the board, to show the bend
  const MODULE_LIFT = 1; // a module sits on its foam tape
  const real = new Map(); // ref → { entry, root, inner, plane, keep, bands, tint }
  const planned = new Map(); // ref → { entry, place }: the parts the library will draw
  const whySimple = {};
  let parts3dMode = parts3d === 'simple' ? 'simple' : 'real';
  let realLoad = null;
  let realTotal = 0;
  let realDone = 0;
  let disposed = false;
  const realShown = () => parts3dMode === 'real';

  /** A model that isn't the library's: pin 1 on hole 1, pin 2 towards hole 2, as KiCad draws two-leg parts. */
  function holesPlace(part) {
    const holes = holesFor(part, p);
    const a = holes[0] || [0, 0];
    const b = holes[1];
    return { x: a[0], y: a[1], angle: b ? (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI : 0, mirror: part.side === 'bottom', miss: 0 };
  }

  function planReal(index) {
    for (const [ref, part] of Object.entries(board.parts)) {
      const custom = typeof part.model === 'string' && /^(own|project):/.test(part.model) ? part.model : null;
      if (custom) { // your own model, or the project's: where the library's would go, if one fits straight
        const base = index ? modelFor({ ...part, ref, value: (details[ref] || {}).value || '' }, {}, index, { pitch: p }) : null;
        const fit = base ? placeFor(base, part, { pitch: p }) : null;
        const place = fit && fit.miss <= MISS_LIMIT && !fit.legs ? fit : holesPlace(part);
        planned.set(ref, { custom, place, entry: { id: custom, model: { body: null }, footprint: { pins: [] }, paint: null } });
        continue;
      }
      const entry = index ? modelFor({ ...part, ref, value: (details[ref] || {}).value || '' }, {}, index, { pitch: p }) : null;
      if (!index) whySimple[ref] = WHY_SIMPLE.notLoaded;
      else if (!entry || !entry.model || !entry.model.file) whySimple[ref] = NO_FIT;
      else {
        const place = placeFor(entry, part, { pitch: p });
        // KiCad's DIP sockets are the socket alone: the chip comes from its own model, on top
        const chip = part.type === 'dip' && (entry.fit || {}).holder === 'socket'
          ? modelFor({ ...part, ref, value: (details[ref] || {}).value || '' }, { holder: 'none' }, index, { pitch: p }) : null;
        if (!place || !(place.miss <= MISS_LIMIT)) whySimple[ref] = WHY_SIMPLE.misses;
        else planned.set(ref, { entry, place, chip: chip && chip.id !== entry.id ? chip : null });
      }
    }
  }

  /** Loads the planned parts' models (once), putting each in place as it arrives. */
  function loadReal() {
    if (realLoad) return realLoad;
    realLoad = Promise.all([library, models]).then(async ([index, kit]) => {
      if (disposed) return;
      planReal(index && Array.isArray(index.parts) ? index : null);
      if (!kit) for (const ref of planned.keys()) whySimple[ref] = WHY_SIMPLE.notLoaded;
      const todo = kit ? [...planned] : [];
      realTotal = todo.length;
      realDone = 0;
      onProgress({ done: 0, total: realTotal });
      await Promise.all(todo.map(async ([ref, { entry, place, chip, custom }]) => {
        const [model, chipModel] = await Promise.all([custom ? kit.getFrom(custom, () => modelBytes(custom)) : kit.get(entry.model.file),
          chip ? kit.get(chip.model.file) : null]);
        if (disposed) return;
        if (model) installReal(ref, entry, place, model, chipModel && { entry: chip, model: chipModel });
        else whySimple[ref] = WHY_SIMPLE.notLoaded;
        realDone += 1;
        onProgress({ done: realDone, total: realTotal });
      }));
    }).catch(() => {
      onProgress({ done: realTotal, total: realTotal });
    });
    return realLoad;
  }

  /** The body's points in the model's frame (mm, z up), for where the bands go. */
  function bodyPoints(model, bodies) {
    model.updateMatrixWorld(true);
    const out = [];
    const v = new THREE.Vector3();
    for (const mesh of bodies) {
      const pos = mesh.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) out.push(v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld).toArray());
    }
    return out;
  }

  /** A resistor's colour bands as rings round its body, along its longest side, in the model's frame. */
  function bandsOn(model, bodies, names, ref) {
    const pts = bodyPoints(model, bodies);
    if (!pts.length) return;
    const lo = [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k])));
    const hi = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k])));
    const axis = [0, 1, 2].reduce((a, k) => (hi[k] - lo[k] > hi[a] - lo[a] ? k : a), 0);
    const [u, w] = [0, 1, 2].filter((k) => k !== axis);
    const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const L = hi[axis] - lo[axis];
    for (const band of bandLayout(names, L)) {
      const at = lo[axis] + band.t;
      let radius = 0;
      for (const q of pts) if (Math.abs(q[axis] - at) <= band.w / 2 + 0.05) radius = Math.max(radius, Math.hypot(q[u] - mid[u], q[w] - mid[w]));
      if (!radius) continue;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.03, radius + 0.03, band.w, 32), material(band.colour).clone());
      if (axis === 0) ring.rotation.z = Math.PI / 2;
      if (axis === 2) ring.rotation.x = Math.PI / 2;
      ring.position.fromArray(mid);
      ring.position.setComponent(axis, at);
      ring.userData.ref = ref;
      ring.userData.role = 'band';
      ring.castShadow = true;
      model.add(ring);
      pickable.push(ring);
    }
  }

  /** Marks a model's meshes as ref's, with roles: 'body' on the entry's body material, 'pin' on metal, else 'part'. */
  function claim(model, entry, ref, plane, bodies) {
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const name = obj.material.name || '';
      obj.userData.ref = ref;
      obj.userData.role = !entry.model.body || name === entry.model.body ? 'body' : /^(PIN|MET)-/i.test(name) ? 'pin' : 'part';
      obj.castShadow = true;
      obj.receiveShadow = obj.userData.role === 'body';
      if (obj.userData.role === 'body') bodies.push(obj);
      if (plane) {
        obj.material.clippingPlanes = [plane];
        obj.material.clipShadows = true;
      }
      pickable.push(obj);
    });
  }

  function installReal(ref, entry, place, model, chip = null) {
    const group = groups.get(ref);
    const part = board.parts[ref];
    if (!group || !part || real.has(ref)) return;
    const value = (details[ref] || {}).value || '';
    const custom = !entry.model.file; // your own or the project's
    if (custom) { // glTF is in metres: a model under 1 unit across was made so, and is scaled to mm
      const box = new THREE.Box3().setFromObject(model);
      const size = box.isEmpty() ? 0 : Math.max(...box.getSize(new THREE.Vector3()).toArray());
      if (size > 0 && size <= 1) model.scale.setScalar(1000);
    }
    const under = Boolean(place.mirror);
    const strips = part.type === 'dip' && part.holder === 'strips'; // the chip sits in Bench's own header strips
    const lift = place.legs ? BENT_LIFT : part.type === 'module' ? MODULE_LIFT : strips ? SIZES.strip.height + 0.05 : 0;
    const root = new THREE.Group(); // in the part's group: the model, and any legs bent to the holes
    root.userData.real = true;
    const holder = new THREE.Group(); // pin 1 on its spot, turned by the angle
    holder.position.set(place.x, under ? -T - lift : lift, place.y);
    holder.rotation.y = (-place.angle * Math.PI) / 180;
    const inner = new THREE.Group(); // KiCad's frame (z up) into three's (y up); under the board, turned over
    inner.rotation.x = under ? Math.PI / 2 : -Math.PI / 2;
    const bodies = [];
    const plane = place.legs ? new THREE.Plane() : null;
    claim(model, entry, ref, plane, bodies);
    if (chip) {
      // the chip's seating plane (z 0 in its model) on the socket's top
      model.updateMatrixWorld(true);
      const top = new THREE.Box3();
      for (const body of bodies) top.expandByObject(body);
      const seat = new THREE.Group();
      seat.position.z = top.isEmpty() ? 0 : top.max.z;
      claim(chip.model, chip.entry, ref, plane, bodies);
      seat.add(chip.model);
      model.add(seat);
    }
    // Bench's paint: a resistor's body colour and bands, an LED's colour
    let tint = null;
    const bands = !custom && (part.type === 'res' || entry.paint === 'bands') ? resistorBands(value) : null;
    if (!custom && (part.type === 'res' || entry.paint === 'bands')) tint = part.colour === 'blue' ? '#3f7fc4' : '#d9c39a';
    if (!custom && (part.type === 'led' || entry.paint === 'colour')) tint = LED_COLOURS[part.colour] || LED_COLOURS[colourInValue(value)] || LED_COLOURS.green;
    if (tint) for (const body of bodies) body.material.color.set(tint).convertSRGBToLinear();
    if (bands && bands.length) bandsOn(model, bodies, bands, ref);
    inner.add(model);
    holder.add(inner);
    root.add(holder);
    // legs bent from the model's pins to holes they don't match
    for (const leg of place.legs || []) {
      const z = (h) => (under ? -T - h : h);
      const points = [[leg.from[0], leg.from[1], z(lift)], [leg.from[0], leg.from[1], z(lift - 0.4)], [leg.to[0], leg.to[1], z(0.35)],
        [leg.to[0], leg.to[1], under ? 0.6 : -T - 1]];
      const wire = meshFor({ kind: 'wire', points, radius: 0.3, colour: '#c0c4c8', role: 'lead', metal: 0.7 }, ref);
      if (!wire) continue;
      wire.userData.ref = ref;
      wire.userData.role = 'lead';
      root.add(wire);
    }
    group.add(root);
    // what Bench keeps of its own drawing: a module's foam and wires, and printed values, moved onto the model
    const keep = custom ? [] : part.type === 'module' ? ['foam', 'wire', 'print'] : strips ? ['socket', 'contact', 'print'] : ['print'];
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    for (const body of bodies) box.expandByObject(body);
    box.translate(group.position.clone().negate());
    if (part.type !== 'module' && !custom && !box.isEmpty()) {
      const centre = box.getCenter(new THREE.Vector3());
      const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      for (const mesh of group.children) {
        if (!mesh.userData.print) continue;
        const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
        const at = mesh.position.clone();
        if (Math.abs(n.y) > 0.7) {
          at.y = n.y > 0 ? box.max.y + 0.03 : box.min.y - 0.03;
        } else {
          const flat = Math.hypot(n.x, n.z) || 1;
          const reach = Math.hypot(n.x * half.x, n.z * half.z) / flat + 0.03;
          at.x = centre.x + (n.x / flat) * reach;
          at.z = centre.z + (n.z / flat) * reach;
          if (at.y < box.min.y + 0.5 || at.y > box.max.y - 0.5) at.y = centre.y;
        }
        mesh.userData.simplePos = mesh.position.clone();
        mesh.userData.realPos = at;
      }
    }
    real.set(ref, { entry, root, inner, plane, keep, bands, tint });
    showParts(ref);
  }

  /** Real or simple: shows the model or Bench's own drawing (all parts, or just ref's). */
  function showParts(only = null) {
    for (const [ref, group] of groups) {
      if (only && ref !== only) continue;
      const r = real.get(ref);
      const on = realShown() && Boolean(r);
      if (r) r.root.visible = on;
      for (const obj of group.children) {
        if (obj === group.userData.tag || obj === outline || obj.userData.real) continue;
        obj.visible = !on || (r && r.keep.includes(obj.userData.role));
        if (obj.userData.realPos) obj.position.copy(on ? obj.userData.realPos : obj.userData.simplePos);
      }
      if (ref === selected) outlinePart(selected);
    }
    restyle();
  }

  /** Bent legs: each real part's own straight legs are cut off at the board, wherever its part has moved to. */
  function moveClips() {
    for (const r of real.values()) {
      if (!r.plane) continue;
      r.inner.updateWorldMatrix(true, false);
      r.plane.set(new THREE.Vector3(0, 0, 1), 0).applyMatrix4(r.inner.matrixWorld);
    }
  }

  /** A real part's model pins on the board (mm, board frame) and its body's box (three's frame, the part not lifted). */
  function realFacts(ref) {
    const r = real.get(ref);
    const group = groups.get(ref);
    r.root.updateWorldMatrix(true, true);
    const shift = group.position.clone().negate();
    const pins = (r.entry.footprint.pins || []).map(([x, y]) => {
      const q = new THREE.Vector3(x, y, 0).applyMatrix4(r.inner.matrixWorld).add(shift);
      return [q.x, q.z];
    });
    const box = new THREE.Box3(); // the body's: its legs go through the board
    r.inner.traverse((obj) => { if (obj.isMesh && obj.userData.role === 'body') box.expandByObject(obj); });
    if (box.isEmpty()) r.inner.traverse((obj) => { if (obj.isMesh) box.expandByObject(obj); });
    box.translate(shift);
    return { pins, box: { min: box.min.toArray(), max: box.max.toArray() } };
  }

  if (realShown()) loadReal();

  resize();
  side = savedCamera && VIEW_NAMES.includes(savedCamera.side) ? savedCamera.side : 'top';
  {
    const { position, target } = viewPosition(side);
    camera.position.copy(position);
    controls.target.copy(target);
  }
  if (savedCamera && Array.isArray(savedCamera.position) && Array.isArray(savedCamera.target) &&
      [...savedCamera.position, ...savedCamera.target].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e5)) {
    camera.position.fromArray(savedCamera.position);
    controls.target.fromArray(savedCamera.target);
  }
  controls.update();
  render();
  onCamera(cameraNow());

  return {
    select(ref) {
      selected = ref && groups.has(ref) ? ref : null;
      litHoles = lightHoles(selected);
      outlinePart(selected);
      restyle();
    },
    focus,
    fit,
    orbit,
    resetView: () => view(side),
    showWiring(on) {
      for (const mesh of wiring) mesh.visible = on;
      render();
    },
    showLabels(on) {
      for (const tag of labels) tag.visible = on;
      render();
    },
    setXray(on) {
      boardMat.transparent = on;
      boardMat.opacity = on ? 0.22 : 1;
      boardMat.depthWrite = !on;
      padMat.transparent = on;
      padMat.opacity = on ? 0.35 : 1;
      boardMat.needsUpdate = true;
      padMat.needsUpdate = true;
      render();
    },
    setExplode(f) {
      explode = Math.min(1, Math.max(0, Number(f) || 0));
      restyle();
    },
    setClip,
    setMeasure(on) {
      measuring = on;
      clearMeasure();
      if (on) {
        measureNote.textContent = 'Click two points to measure between them.';
        measureNote.hidden = false;
      }
      render();
    },
    /** Lights a whole line's parts (What to wire's Show). */
    setNet(refs) {
      netParts = new Set(refs || []);
      restyle();
    },
    picture,
    stl,
    /** 'real' (the library's models where they fit) or 'simple' (Bench's own drawing): a setting, not an undo step. */
    setParts3d(mode) {
      parts3dMode = mode === 'simple' ? 'simple' : 'real';
      if (realShown()) loadReal();
      showParts();
    },
    /** What the view shows, for tests and the Claude app. */
    info: () => {
      const r = cubeRect();
      const rect = renderer.domElement.getBoundingClientRect();
      const shownReal = realShown() ? [...real.keys()] : [];
      const each = (fn) => Object.fromEntries(shownReal.map((ref) => [ref, fn(real.get(ref), ref)]));
      const facts = realShown() ? Object.fromEntries(shownReal.map((ref) => [ref, realFacts(ref)])) : {};
      return {
        parts3d: parts3dMode,
        realParts: shownReal.length,
        simpleParts: groups.size - shownReal.length,
        realRefs: shownReal,
        models: each((x) => x.entry.id),
        bands: Object.fromEntries(shownReal.filter((ref) => real.get(ref).bands).map((ref) => [ref, real.get(ref).bands])),
        tinted: Object.fromEntries(shownReal.filter((ref) => real.get(ref).tint).map((ref) => [ref, real.get(ref).tint])),
        prints: each((x, ref) => groups.get(ref).children.filter((c) => c.userData.print && c.visible).map((c) => c.userData.text)),
        whySimple: Object.fromEntries(Object.entries(whySimple).filter(([ref]) => !shownReal.includes(ref))),
        realBoxes: Object.fromEntries(Object.entries(facts).map(([ref, f]) => [ref, f.box])),
        realPins: Object.fromEntries(Object.entries(facts).map(([ref, f]) => [ref, f.pins])),
        loading: { done: realDone, total: realTotal },
        textures: each((x) => {
          let n = 0;
          x.root.traverse((o) => { if (o.isMesh && o.material && o.material.map) n += 1; });
          return n;
        }),
        selected,
        hover: hovered,
        litHoles,
        lift: selected ? LIFT : 0,
        wiring: wiring.length ? wiring[0].visible : true,
        labels: labels.length ? labels[0].visible : true,
        xray: boardMat.transparent,
        explode,
        clip,
        measuring,
        measure: measured,
        env: Boolean(scene.environment),
        shadows: renderer.shadowMap.enabled,
        joints: joints.count,
        hidden: [...groups.values()].filter((g) => !g.visible).length,
        net: [...netParts],
        target: controls.target.toArray(),
        camera: camera.position.toArray(),
        cube: { x: rect.left + r.left, y: rect.top + r.top, size: r.size },
        links: board.links.length,
        edgeNames: (board.edgeLabels || []).map((e) => e.text),
        linkMeshes,
        parts: groups.size,
      };
    },
    setStep(now, later, opts = {}) {
      stepNow = new Set(now);
      stepLater = new Set(later);
      hideLater = Boolean(opts.hideLater);
      restyle();
    },
    view,
    getView: () => side,
    /** Where a part's body shows on screen (client pixels), for tests and pointing. */
    screenOf(ref) {
      const group = groups.get(ref);
      if (!group) return null;
      let body = null;
      group.traverse((c) => { if (!body && c.isMesh && c.userData.role === 'body' && shownIn(c, group)) body = c; });
      body = body || group.children.find((c) => c.isMesh && c.userData.role === 'body') || group.children.find((c) => c.isMesh);
      const point = new THREE.Vector3();
      new THREE.Box3().setFromObject(body).getCenter(point);
      point.project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
    },
    dispose() {
      disposed = true;
      if (flight) cancelAnimationFrame(flight.frame);
      sizer.disconnect();
      controls.dispose();
      const free = (obj) => {
        if (obj.geometry) obj.geometry.dispose();
        for (const mat of [].concat(obj.material || [])) {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      };
      scene.traverse(free);
      cubeScene.traverse(free);
      for (const mat of materials.values()) mat.dispose();
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // r128's dispose keeps the WebGL context; browsers allow only a few
      host.replaceChildren();
    },
  };
}
