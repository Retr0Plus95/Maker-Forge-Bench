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
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext(); // browsers allow only a few contexts: give it back
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * Builds the view in `host`. Gives null when this browser can't draw 3D.
 * camera: a saved camera ({ side, position, target }) to start from; onCamera(camera) is told whenever it moves.
 */
export async function createBoard3D(host, board, { onPick, camera: savedCamera = null, onCamera = () => {} }) {
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

  // underneath: bare-wire buses, insulated links, solder bridges ("Wiring underneath" shows or hides them)
  const wiring = [];
  const at = ([c, r], z) => v3((c - 1) * p, (r - 1) * p, z);
  for (const bus of board.buses) {
    const mesh = segment(at([bus.from, bus.row], -T - 0.35), at([bus.to, bus.row], -T - 0.35), 0.4, material(busColour(bus.label), { metal: 0.5 }));
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
    const mesh = segment(at(bridge.holes[0], -T - 0.3), at(bridge.holes[1], -T - 0.3), 0.75, material('#d0d4d8', { metal: 0.7 }));
    if (mesh) wiring.push(mesh);
  }
  for (const mesh of wiring) scene.add(mesh);

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
    group.userData.tag = tag;
    group.userData.side = part.side;
    groups.set(ref, group);
    scene.add(group);
  }

  let selected = null;
  let stepNow = new Set();
  let stepLater = new Set();
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
  function restyle() {
    for (const [ref, group] of groups) {
      const on = ref === selected;
      group.position.y = on ? (group.userData.side === 'bottom' ? -LIFT : LIFT) : 0;
      if (group.userData.tag) group.userData.tag.scale.set(on ? 11 : 8, on ? 4.1 : 3, 1);
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
  const cameraNow = () => ({ side, position: camera.position.toArray(), target: controls.target.toArray() });
  controls.addEventListener('end', () => onCamera(cameraNow()));
  function view(name) {
    side = name === 'bottom' ? 'bottom' : 'top';
    const lift = span * 1.55;
    // From below, look from the row-1 edge: columns mirror left to right and row 1 stays at the top,
    // the same as turning the board over and as Flip on sheet 4.
    camera.position.set(cx, side === 'top' ? lift : -lift, side === 'top' ? cz + span * 0.85 : cz - span * 0.85);
    camera.up.set(0, 1, 0);
    controls.target.set(cx, 0, cz);
    controls.update();
    render();
    onCamera(cameraNow());
  }

  /** Turns the camera to a part, closer in. */
  function focus(ref) {
    const group = groups.get(ref);
    if (!group) return;
    const centre = new THREE.Vector3();
    new THREE.Box3().setFromObject(group).getCenter(centre);
    const away = camera.position.clone().sub(controls.target).normalize().multiplyScalar(span * 0.7);
    controls.target.copy(centre);
    camera.position.copy(centre).add(away);
    controls.update();
    render();
    onCamera(cameraNow());
  }

  // a main-button click (not a drag) on a part you can see selects it: the board hides what's behind it
  const ray = new THREE.Raycaster();
  const blockers = [boardMesh, ...pickable];
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = e.button === 0 ? [e.clientX, e.clientY] : null; });
  function partAt(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(blockers, false)[0];
    return hit && hit.object !== boardMesh ? hit.object.userData.ref : null;
  }
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    downAt = null;
    const ref = partAt(e);
    if (ref) onPick(ref);
  });
  renderer.domElement.addEventListener('dblclick', (e) => {
    const ref = partAt(e);
    if (!ref) return;
    focus(ref);
    onPick(ref);
  });

  resize();
  view(savedCamera && savedCamera.side === 'bottom' ? 'bottom' : 'top');
  if (savedCamera && Array.isArray(savedCamera.position) && Array.isArray(savedCamera.target) &&
      [...savedCamera.position, ...savedCamera.target].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e5)) {
    camera.position.fromArray(savedCamera.position);
    controls.target.fromArray(savedCamera.target);
    controls.update();
    render();
  }

  return {
    select(ref) {
      selected = ref && groups.has(ref) ? ref : null;
      litHoles = lightHoles(selected);
      restyle();
    },
    focus,
    resetView: () => view(side),
    showWiring(on) {
      for (const mesh of wiring) mesh.visible = on;
      render();
    },
    /** What the view shows, for tests and the Claude app. */
    info: () => ({
      selected,
      litHoles,
      lift: selected ? Math.abs(groups.get(selected).position.y) : 0,
      wiring: wiring.length ? wiring[0].visible : true,
      target: controls.target.toArray(),
      links: board.links.length,
      linkMeshes,
    }),
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
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      for (const mat of materials.values()) mat.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // r128's dispose keeps the WebGL context; browsers allow only a few
      host.replaceChildren();
    },
  };
}
