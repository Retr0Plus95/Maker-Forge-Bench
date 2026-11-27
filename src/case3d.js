// Bench 1.0.5 "The case" (design §6.4): a case part in 3D on your printer's bed, inside its build volume (green when the
// part fits as it lies, red when it doesn't), and the small pictures in the Case tab's list. three.js r128 (self-hosted,
// as the 3D board) loads only when the first part is read or looked at.

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/** A part's colour by its plastic; clear plastics are see-through. */
export function partColour(material, print = '') {
  const clear = /\bclear\b|\btransparent\b|\btranslucent\b/i.test(print);
  const colours = { PLA: '#f08a24', PETG: '#5f8fbf', ABS: '#d8d2c4', ASA: '#9aa3ad', TPU: '#4b4f55', PC: '#c9d6df', Nylon: '#e9e4d6' };
  return { colour: clear ? '#cfe8ff' : colours[material] || '#f08a24', clear };
}

let three = null;
async function loadThree() {
  if (!three) three = Promise.all([import('./three.module.js'), import('./three-orbit-controls.js')]).then(([THREE, oc]) => ({ THREE, OrbitControls: oc.OrbitControls }));
  return three;
}

/** The part as a mesh, z up in the file → y up in three, lying on y = 0 and centred over x = z = 0. */
function partMesh(THREE, tris, colour, clear) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3)); // a copy: the part's own triangles stay as read
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour).convertSRGBToLinear(), roughness: 0.6, metalness: 0,
    transparent: clear, opacity: clear ? 0.6 : 1, side: THREE.DoubleSide, flatShading: false,
  });
  return new THREE.Mesh(geo, mat);
}

function lights(THREE, scene, span) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(span * 0.7, span * 1.5, span * 1.1);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-span * 1.2, span * 0.4, -span * 0.6);
  scene.add(key, fill);
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

// ---- the small pictures: one renderer kept for all of them ----
let thumbRenderer = null;
let thumbFailed = false;

/** A picture of the part from the front corner, as a data: URL (PNG), or null when this browser can't draw 3D. */
export async function partThumbnail(tris, { material = 'PLA', print = '', size = 160 } = {}) {
  if (thumbFailed) return null;
  const { THREE } = await loadThree();
  if (!thumbRenderer) {
    if (!webglAvailable()) { thumbFailed = true; return null; }
    try {
      thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      thumbFailed = true;
      return null;
    }
    thumbRenderer.outputEncoding = THREE.sRGBEncoding;
  }
  thumbRenderer.setPixelRatio(1);
  thumbRenderer.setSize(size, Math.round(size * 0.75), false);
  const { colour, clear } = partColour(material, print);
  const scene = new THREE.Scene();
  const mesh = partMesh(THREE, tris, colour, clear);
  scene.add(mesh);
  const r = mesh.geometry.boundingSphere.radius || 1;
  lights(THREE, scene, r * 2);
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, r / 50, r * 50);
  const centre = mesh.geometry.boundingSphere.center;
  const dist = r / Math.sin((30 * Math.PI) / 360) * 1.05;
  camera.position.set(centre.x + dist * 0.55, centre.y + dist * 0.5, centre.z + dist * 0.67);
  camera.lookAt(centre);
  thumbRenderer.render(scene, camera);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  disposeTree(scene);
  return url;
}

/**
 * The big view, in host (inside the Look in 3D dialog). Gives null when this browser can't draw 3D.
 * show(tris, { bed: [W, D, H], fits, material, print }) puts a part on the bed; view(name) turns to 'iso', 'top',
 * 'front' or 'part'; dispose() frees it.
 */
export async function createCaseView(host) {
  if (!webglAvailable()) return null;
  const { THREE, OrbitControls } = await loadThree();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  host.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  let frame = 0;
  const render = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer.render(scene, camera);
    });
  };
  controls.addEventListener('change', render);
  const resize = () => {
    const w = host.clientWidth || 320;
    const h = host.clientHeight || 240;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const sizer = new ResizeObserver(resize);
  sizer.observe(host);
  let content = null;

  function bedGroup(bed, fits) {
    const [W, D, H] = bed;
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(W, 1.5, D), new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b3036').convertSRGBToLinear(), roughness: 0.9 }));
    plate.position.y = -0.76;
    g.add(plate);
    const lines = [];
    for (let x = -W / 2; x <= W / 2 + 1e-6; x += 10) lines.push(x, 0.02, -D / 2, x, 0.02, D / 2);
    for (let z = -D / 2; z <= D / 2 + 1e-6; z += 10) lines.push(-W / 2, 0.02, z, W / 2, 0.02, z);
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0x556070, transparent: true, opacity: 0.6 })));
    const volume = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), new THREE.LineBasicMaterial({ color: fits ? 0x3ccf6e : 0xff4d4d }));
    volume.position.y = H / 2;
    g.add(volume);
    return g;
  }

  let bedNow = [256, 256, 256];
  let partBox = null;
  /** Turns to 'iso' (the whole build volume from the front corner), 'top', 'front' or 'part' (close up). */
  function view(name = 'iso') {
    const [W, D, H] = bedNow;
    const fov = (camera.fov * Math.PI) / 180;
    const fit = (radius) => radius / Math.sin(fov / 2) / Math.min(1, camera.aspect) * 1.02;
    let target = new THREE.Vector3(0, H / 2, 0);
    let d = fit(Math.hypot(W, D, H) / 2);
    if (name === 'part' && partBox) {
      target = partBox.getCenter(new THREE.Vector3());
      d = fit(partBox.getSize(new THREE.Vector3()).length() / 2) * 1.15;
    }
    if (name === 'top') camera.position.set(target.x, target.y + fit(Math.hypot(W, D) / 2), target.z + 0.001);
    else if (name === 'front') camera.position.set(target.x, target.y, target.z + fit(Math.hypot(W, H) / 2));
    else camera.position.set(target.x + d * 0.6, target.y + d * 0.42, target.z + d * 0.68);
    controls.target.copy(target);
    camera.lookAt(target);
    controls.update();
    render();
  }

  return {
    show(tris, { bed, fits, material = 'PLA', print = '' }) {
      if (content) {
        scene.remove(content);
        disposeTree(content);
      }
      content = new THREE.Group();
      const { colour, clear } = partColour(material, print);
      const mesh = partMesh(THREE, tris, colour, clear);
      content.add(mesh, bedGroup(bed, fits));
      scene.add(content);
      if (!scene.userData.lit) {
        lights(THREE, scene, 400);
        scene.userData.lit = true;
      }
      mesh.geometry.computeBoundingBox();
      partBox = mesh.geometry.boundingBox.clone();
      bedNow = bed;
      const span = Math.max(...bed, partBox.max.x - partBox.min.x, partBox.max.z - partBox.min.z);
      camera.near = Math.max(0.05, Math.min(span / 400, partBox.getSize(new THREE.Vector3()).length() / 20));
      camera.far = span * 40;
      camera.updateProjectionMatrix();
      resize();
      view('iso');
    },
    view,
    picture: () => renderer.domElement.toDataURL('image/png'),
    dispose() {
      sizer.disconnect();
      controls.dispose();
      if (content) disposeTree(content);
      renderer.dispose();
      renderer.forceContextLoss?.();
      host.replaceChildren();
    },
  };
}
