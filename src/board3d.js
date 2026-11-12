// The 3D board (board-view design §5): the project's perfboard with every part, the bare-wire buses,
// links and bridges underneath, a label on each part, click-to-select, and step highlighting.
// three.js r128 (self-hosted, the same version as Maker Forge) loads only when this view first opens.
import { BOARD_THICKNESS, busColour, partGeometry } from './board3d-geometry.js';

const LINK_COLOURS = ['#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#3b82f6', '#eab308', '#ec4899'];
const SELECT = '#ff2bd6';
const STEP = '#28c4ff';

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Builds the view in `host`. Gives null when this browser can't draw 3D. */
export async function createBoard3D(host, board, { onPick }) {
  if (!webglAvailable()) return null;
  const THREE = await import('./three.module.js');
  const { OrbitControls } = await import('./three-orbit-controls.js');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.replaceChildren(renderer.domElement);

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

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(cx + span, span * 1.6, cz + span);
  scene.add(sun);
  const under = new THREE.DirectionalLight(0xffffff, 0.45);
  under.position.set(cx - span * 0.5, -span * 1.6, cz + span * 0.6);
  scene.add(under);

  const materials = new Map();
  const material = (colour, opts = {}) => {
    const key = `${colour}|${opts.metal || 0}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color: colour, roughness: opts.metal ? 0.35 : 0.6, metalness: opts.metal || 0 }));
    }
    return materials.get(key);
  };
  // geometry's (x, y, z-up) → three's (x, y-up, z)
  const v3 = (x, y, z) => new THREE.Vector3(x, z, y);
  const UP = new THREE.Vector3(0, 1, 0);
  function segment(a, b, radius, mat) {
    const len = a.distanceTo(b);
    if (len < 1e-6) return null;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return mesh;
  }

  // the board, its copper pads and holes
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry((board.cols + 1) * p, T, (board.rows + 1) * p), material('#2f6f3a'));
  boardMesh.position.set(cx, -T / 2, cz);
  scene.add(boardMesh);
  const holes = board.cols * board.rows;
  const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85, 0.85, T + 0.08, 14), material('#c98b4b', { metal: 0.6 }), holes);
  const drills = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.45, T + 0.14, 10), material('#101010'), holes);
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

  // underneath: bare-wire buses, insulated links, solder bridges
  const at = ([c, r], z) => v3((c - 1) * p, (r - 1) * p, z);
  for (const bus of board.buses) {
    const mesh = segment(at([bus.from, bus.row], -T - 0.35), at([bus.to, bus.row], -T - 0.35), 0.4, material(busColour(bus.label), { metal: 0.5 }));
    if (mesh) scene.add(mesh);
  }
  board.links.forEach((link, n) => {
    const mat = material(LINK_COLOURS[n % LINK_COLOURS.length]);
    for (let k = 1; k < link.path.length; k++) {
      const mesh = segment(at(link.path[k - 1], -T - 1), at(link.path[k], -T - 1), 0.42, mat);
      if (mesh) scene.add(mesh);
    }
  });
  for (const bridge of board.bridges) {
    const mesh = segment(at(bridge.holes[0], -T - 0.3), at(bridge.holes[1], -T - 0.3), 0.75, material('#d0d4d8', { metal: 0.7 }));
    if (mesh) scene.add(mesh);
  }

  // the parts: one group each, with its own materials so it can be highlighted
  const groups = new Map();
  const pickable = [];
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
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
    sprite.scale.set(8, 3, 1);
    return sprite;
  }
  for (const [ref, part] of Object.entries(board.parts)) {
    const group = new THREE.Group();
    group.userData.ref = ref;
    let top = -Infinity;
    let bottom = Infinity;
    for (const prim of partGeometry(part, p, ref)) {
      const mat = material(prim.colour, { metal: prim.kind === 'wire' || prim.role === 'pin' ? 0.6 : 0 }).clone();
      let mesh = null;
      if (prim.kind === 'cyl') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(prim.radius, prim.radius, prim.h, 24), mat);
        mesh.position.copy(v3(prim.x, prim.y, prim.z0 + prim.h / 2));
      } else if (prim.kind === 'box') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(prim.w, prim.h, prim.d), mat);
        mesh.position.copy(v3(prim.x, prim.y, prim.z0 + prim.h / 2));
      } else if (prim.kind === 'half') {
        const start = prim.facing === 'down' ? Math.PI / 2 : -Math.PI / 2;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(prim.radius, prim.radius, prim.h, 20, 1, false, start, Math.PI), mat);
        mesh.position.copy(v3(prim.x, prim.y, prim.z0 + prim.h / 2));
        const face = new THREE.Mesh(new THREE.BoxGeometry(prim.radius * 2, prim.h, 0.05), mat);
        face.position.copy(mesh.position);
        group.add(face);
      } else if (prim.kind === 'hcyl') {
        mesh = segment(v3(prim.x1, prim.y1, prim.z), v3(prim.x2, prim.y2, prim.z), prim.radius, mat);
      } else if (prim.kind === 'wire') {
        for (let k = 1; k < prim.points.length; k++) {
          const s = segment(v3(...prim.points[k - 1]), v3(...prim.points[k]), prim.radius, mat);
          if (s) {
            s.userData.ref = ref;
            group.add(s);
            pickable.push(s);
          }
        }
        continue;
      }
      if (!mesh) continue;
      mesh.userData.ref = ref;
      group.add(mesh);
      pickable.push(mesh);
      const z0 = prim.z0 ?? prim.z ?? 0;
      top = Math.max(top, z0 + (prim.h || 0));
      bottom = Math.min(bottom, z0);
    }
    const tag = label(ref, part.side === 'bottom' ? '#ffd27a' : '#ffffff');
    const centre = partGeometry(part, p, ref).find((pr) => pr.role === 'body');
    const lx = centre ? centre.x ?? (centre.x1 + centre.x2) / 2 : 0;
    const ly = centre ? centre.y ?? (centre.y1 + centre.y2) / 2 : 0;
    tag.position.copy(part.side === 'bottom' ? v3(lx, ly, bottom - 3) : v3(lx, ly, top + 3));
    group.add(tag);
    groups.set(ref, group);
    scene.add(group);
  }

  let selected = null;
  let stepNow = new Set();
  let stepLater = new Set();
  function restyle() {
    for (const [ref, group] of groups) {
      const glow = ref === selected ? SELECT : stepNow.has(ref) ? STEP : null;
      const faded = !glow && stepLater.has(ref);
      group.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.material.emissive.set(glow || '#000000');
        obj.material.emissiveIntensity = glow ? 0.55 : 0;
        obj.material.transparent = faded;
        obj.material.opacity = faded ? 0.22 : 1;
      });
    }
    render();
  }

  function render() {
    renderer.render(scene, camera);
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

  let side = 'top';
  function view(name) {
    side = name === 'bottom' ? 'bottom' : 'top';
    const lift = span * 1.55;
    camera.position.set(cx, side === 'top' ? lift : -lift, cz + span * 0.85);
    camera.up.set(0, 1, 0);
    controls.target.set(cx, 0, cz);
    controls.update();
    render();
  }

  // a click (not a drag) on a part selects it
  const ray = new THREE.Raycaster();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    downAt = null;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickable, false)[0];
    if (hit) onPick(hit.object.userData.ref);
  });

  resize();
  view('top');

  return {
    select(ref) {
      selected = ref && groups.has(ref) ? ref : null;
      restyle();
    },
    setStep(now, later) {
      stepNow = new Set(now);
      stepLater = new Set(later);
      restyle();
    },
    view,
    getView: () => side,
    /** Where a part's body shows on screen (client pixels), for tests and pointing. */
    screenOf(ref) {
      const group = groups.get(ref);
      if (!group) return null;
      const body = group.children.find((c) => c.isMesh);
      const point = new THREE.Vector3();
      new THREE.Box3().setFromObject(body).getCenter(point);
      point.project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
    },
    dispose() {
      sizer.disconnect();
      controls.dispose();
      renderer.dispose();
      host.replaceChildren();
    },
  };
}
