// Bangladesh: an interactive 3D journey
// Three.js scene + HTML overlay. No build step needed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Guide } from './guide.js';

/* ------------------------------------------------------------------ */
/* Settings you may want to change                                     */
/* ------------------------------------------------------------------ */
const SETTINGS = {
  idleTourSeconds: 180,     // start the journey show by itself after this much idle time (0 = never)
  journeySeconds: 0,        // seconds per picture in the journey show. 0 = work it out so the whole show fits inside one play of the song
  musicVolume: 0.3,         // music while people browse
  journeyVolume: 0.8,       // music during the journey show
  depthStrength: 0.18,      // how strong the 3D pop-out of photos is (keep it low so straight lines and faces stay straight)
  songStart: 30,            // the song starts from this second (skips the intro)
  songEnd: 0                // stop and loop at this second (0 = play to the end)
};
const TIGER_PITCH = 1.05;   // how far the tiger leans up onto the rock (radians)
const COVERS = { nature: 'ratargul', heritage: 'sixty_dome', history: 'victory71', culture: 'boishakh_rally', art: 'art_brides', food: 'panta_ilish' };

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/* Renderer, scene, camera                                             */
/* ------------------------------------------------------------------ */
const canvas = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
const guideCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
const clock = { last: performance.now(), elapsedTime: 0, getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += Math.min(d, 0.1); return d; } };
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);     // -1..1
const pointerSmooth = new THREE.Vector2(0, 0);

const hubG = new THREE.Group(), galG = new THREE.Group(), viewG = new THREE.Group(), guideG = new THREE.Group();
galG.visible = viewG.visible = false;
guideG.position.set(0, -300, 0);
scene.add(hubG, galG, viewG, guideG);

// lights (shared by every mode)
scene.add(new THREE.HemisphereLight(0xcfeee2, 0x0a2a20, 1.5));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-5, 7, 9); scene.add(key);
const rim = new THREE.DirectionalLight(0xff5566, 2.2); rim.position.set(2, 3, -9); scene.add(rim);

const controls = new OrbitControls(camera, canvas);
controls.enabled = false; controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 2.6; controls.maxDistance = 10; controls.maxPolarAngle = Math.PI * 0.52; controls.minPolarAngle = 0.35;
controls.autoRotate = true; controls.autoRotateSpeed = 1.2;

/* ------------------------------------------------------------------ */
/* Sky, water, fireflies                                               */
/* ------------------------------------------------------------------ */
const SKY_GLSL = /* glsl */`
uniform vec3 uTop, uMid, uBot, uSunCol, uSunDir; uniform float uSun;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 c = mix(uBot, uMid, smoothstep(-0.05, 0.12, h));
  c = mix(c, uTop, smoothstep(0.08, 0.75, h));
  float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  c = mix(c, uSunCol, uSun * smoothstep(0.152, 0.142, a));
  c += uSunCol * uSun * 0.3 * exp(-a * 4.2);
  return c;
}`;
const skyU = {
  uTop: { value: new THREE.Color('#03170f') }, uMid: { value: new THREE.Color('#0a5a43') }, uBot: { value: new THREE.Color('#0f7d5c') },
  uSunCol: { value: new THREE.Color('#e8283c') }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() }, uSun: { value: 1 },
  uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(400, 48, 24),
  new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${SKY_GLSL} varying vec3 vDir; void main(){ gl_FragColor = vec4(skyCol(normalize(vDir)), 1.0); }`
  })
);
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 900),
  new THREE.ShaderMaterial({
    uniforms: skyU,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${SKY_GLSL} uniform float uTime; uniform vec3 uCam; varying vec3 vW;
      void main(){
        vec3 V = normalize(vW - uCam); vec2 p = vW.xz; float t = uTime;
        vec2 n = vec2(sin(p.x*0.9+t*0.8)+sin(p.y*1.3-t*0.6)+0.5*sin((p.x+p.y)*2.7+t*1.4),
                      cos(p.y*1.1+t*0.7)+cos(p.x*1.7+t*0.5)+0.5*cos((p.x-p.y)*2.3-t*1.2)) * 0.04;
        vec3 N = normalize(vec3(n.x, 1.0, n.y));
        vec3 R = reflect(V, N); R.y = abs(R.y);
        vec3 c = skyCol(normalize(R));
        float fres = pow(1.0 - max(dot(-V, N), 0.0), 3.0);
        c = mix(uBot * 0.35, c, 0.25 + 0.5 * fres);
        float dist = length(vW.xz - uCam.xz);
        c = mix(c, uBot, smoothstep(70.0, 320.0, dist));
        gl_FragColor = vec4(c, 1.0);
      }`
  })
);
water.rotation.x = -Math.PI / 2; hubG.add(water);

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,240,190,.6)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const flies = (() => {
  const n = 130, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 44; pos[i * 3 + 1] = Math.random() * 9 - 1.5; pos[i * 3 + 2] = (Math.random() - 0.5) * 44; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size: 0.16, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe9a8, opacity: 0.9, toneMapped: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return p;
})();

// Bangla letters drifting down slowly through the sky, like falling stars.
let letters = null;
function buildLetterRain() {
  const chars = ['অ', 'আ', 'ই', 'ঈ', 'উ', 'ঊ', 'ঋ', 'এ', 'ঐ', 'ও', 'ঔ', 'ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন', 'প', 'ফ', 'ব', 'ভ', 'ম', 'য', 'র', 'ল', 'শ', 'ষ', 'স', 'হ', 'ড়', 'ঢ়', 'য়', 'ৎ', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯', '০', 'বাং', 'লা', 'মা', 'ভা', 'ষা', 'জয়', 'সোনা'];
  const N = 8, cell = 128; const cv = document.createElement('canvas'); cv.width = cv.height = N * cell; const g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(255,220,140,0.9)'; g.shadowBlur = 14;
  chars.forEach((ch, i) => { const x = (i % N) * cell + cell / 2, y = Math.floor(i / N) * cell + cell / 2; g.font = `600 ${ch.length > 1 ? 54 : 78}px "Hind Siliguri", sans-serif`; g.fillText(ch, x, y + 6); });
  const tex = new THREE.CanvasTexture(cv); tex.flipY = false;
  const n = 340, start = new Float32Array(n * 3), info = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    start[i * 3] = (Math.random() - 0.5) * 70; start[i * 3 + 1] = Math.random() * 30; start[i * 3 + 2] = (Math.random() - 0.5) * 70;
    info[i * 4] = Math.floor(Math.random() * chars.length); info[i * 4 + 1] = 0.25 + Math.random() * 0.55; info[i * 4 + 2] = 0.45 + Math.random() * 0.55; info[i * 4 + 3] = Math.random() * 6.28;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(start, 3)); geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uTime: { value: 0 }, uScale: { value: 400 }, uMinDist: { value: 3 }, uColor: { value: new THREE.Color('#ffe2a0') } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aInfo; uniform float uTime, uScale, uMinDist; varying float vA; varying float vCell; varying float vRot;
      void main(){
        vec3 p = position; float sp = aInfo.y;
        p.y = mod(p.y - uTime * sp, 30.0) - 9.0;
        p.x += sin(uTime * 0.35 + aInfo.w) * 0.8; p.z += cos(uTime * 0.27 + aInfo.w) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
        vA = smoothstep(uMinDist, uMinDist + 3.0, d) * (1.0 - smoothstep(40.0, 60.0, d)) * smoothstep(-9.0, -6.0, p.y) * (1.0 - smoothstep(17.0, 21.0, p.y));
        vCell = aInfo.x; vRot = aInfo.w + uTime * 0.25 * sp;
        gl_PointSize = aInfo.z * uScale / max(d, 0.1);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; varying float vA; varying float vCell; varying float vRot;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float c = cos(vRot * 0.3), s = sin(vRot * 0.3); q = mat2(c, -s, s, c) * q + 0.5;
        if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
        vec2 uv = (vec2(mod(vCell, 8.0), floor(vCell / 8.0)) + q) / 8.0;
        float a = texture2D(uTex, uv).a * vA * 0.55; if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * a, a);
      }`
  });
  letters = new THREE.Points(geo, mat); letters.frustumCulled = false; letters.renderOrder = -5; scene.add(letters);
}

function setSky(mode, color) {
  rim.intensity = mode === 'hub' ? 2.2 : 0.5;
  if (mode === 'hub') {
    skyU.uTop.value.set('#03170f'); skyU.uMid.value.set('#0a5a43'); skyU.uBot.value.set('#0f7d5c'); skyU.uSun.value = 1;
  } else {
    const c = new THREE.Color(color);
    skyU.uTop.value.set('#020a08'); skyU.uMid.value.copy(c).multiplyScalar(0.16); skyU.uBot.value.copy(c).multiplyScalar(0.34); skyU.uSun.value = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader(); gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const progress = { content: 0, tiger: 0, rickshaw: 0, mosque: 0, minar: 0, smriti: 0, parliament: 0, fonts: 0 };
function setProgress(k, v) { progress[k] = v; const p = (progress.content + progress.tiger * 3 + progress.rickshaw * 3 + progress.mosque * 2 + progress.minar + progress.smriti + progress.parliament + progress.fonts) / 13; $('#loadBar').style.width = (p * 100).toFixed(0) + '%'; }
const loadGLB = (url, k) => new Promise((res, rej) => gltfLoader.load(url, (g) => { setProgress(k, 1); res(g); }, (e) => { if (e.total) setProgress(k, e.loaded / e.total * 0.95); }, rej));
function loadTex(url, raw = true) { const t = texLoader.load(url); if (raw) t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t; }

let DATA, SECTIONS, I18N = { items: {}, sections: {}, ui: {} }, tiger = null, rickshaw = null, mosque = null, minar = null, smriti = null, parliament = null;
const state = { mode: 'gate', section: null, idx: 0, cur: 0, view: null, busy: false, zoom: false, cardOpen: false, journey: { on: false, auto: false, timer: 0, started: 0 }, lastInput: performance.now() };

/* ------------------------------------------------------------------ */
/* Tiger                                                               */
/* ------------------------------------------------------------------ */
function setupTiger(gltf) {
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false; const m = o.material;
      m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = THREE.DoubleSide;
      if (m.emissive) m.emissive.set(0x000000); m.emissiveMap = null; m.roughness = 0.85; m.needsUpdate = true;
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const action = gltf.animations[0] ? mixer.clipAction(gltf.animations[0]) : null;
  if (action) { action.play(); mixer.update(0.01); }
  model.updateMatrixWorld(true);
  const bones = []; model.traverse((o) => { if (o.isBone) bones.push(o); });
  const find = (n) => bones.find((b) => b.name.includes(n));
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const head = find('Bip01_Head') || bones[0], pelvis = find('Bip01_Pelvis') || bones[0];
  const hp = wp(head), pp = wp(pelvis);
  let minY = Infinity; bones.forEach((b) => { minY = Math.min(minY, wp(b).y); });
  const fwd = hp.clone().sub(pp); const len = Math.hypot(fwd.x, fwd.z) || 1; const yaw = Math.atan2(fwd.x, fwd.z);
  const s = 1.55 / len;

  const holder = new THREE.Group(); model.position.set(-pp.x, -minY, -pp.z); holder.add(model);
  const inner = new THREE.Group(); inner.add(holder); inner.rotation.y = -yaw; inner.scale.setScalar(s);
  // Tilt the body nose-up so the front paws rest high on the rock and the back legs stand on the ground.
  const tilt = new THREE.Group(); tilt.add(inner); tilt.rotation.x = -TIGER_PITCH;
  const root = new THREE.Group(); root.add(tilt);

  // Where the paws really are (in the root's own space), averaged over the animation.
  const paw = (names) => { const a = new THREE.Vector3(); let n = 0; names.forEach((nm) => { const b = find(nm); if (b) { a.add(root.worldToLocal(wp(b))); n++; } }); return n ? a.multiplyScalar(1 / n) : null; };
  const measure = () => {
    const hindA = new THREE.Vector3(), frontA = new THREE.Vector3(); let n = 0;
    for (const t of [0.01, 1.0, 2.0, 3.0]) {
      if (action) mixer.setTime(t); root.updateMatrixWorld(true);
      const h = paw(['L_Toe0', 'R_Toe0']), f = paw(['L_Finger0', 'R_Finger0']);
      if (h && f) { hindA.add(h); frontA.add(f); n++; }
    }
    if (n) { hindA.multiplyScalar(1 / n); frontA.multiplyScalar(1 / n); } else { hindA.set(0, 0, -0.8); frontA.set(0, 0.9, 0.6); }
    return { hindA, frontA };
  };
  let { hindA, frontA } = measure();
  // put the back feet on the ground (y = 0) and centre the tiger over the island
  tilt.position.set(0, -hindA.y + 0.02, -(hindA.z + frontA.z) / 2);
  ({ hindA, frontA } = measure());
  if (action) mixer.setTime(0.01);

  // A rock under the front paws only, with a flat top where the paws land.
  const stone = (cx, top, z0, z1, rx, depth, seed) => {
    const ry = depth, cy = top - ry * 0.32, cz = (z0 + z1) / 2, rz = (z1 - z0) / 2 / 0.94;
    const geo = new THREE.IcosahedronGeometry(1, 5); const p = geo.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.07 * Math.sin(v.x * 5.1 + v.y * 3.3 + seed) * Math.cos(v.z * 4.7 + v.x * 2.1) + 0.04 * Math.sin(v.y * 9.0 + v.z * 7.0 + seed * 2.0);
      p.setXYZ(i, cx + v.x * rx * n, Math.max(Math.min(cy + v.y * ry * n, top), -0.05), cz + v.z * rz * n);
    }
    geo.computeVertexNormals(); return geo;
  };
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a5048, roughness: 1 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 1 });
  const frontTop = frontA.y - 0.05;
  const rock = new THREE.Group();
  const main = new THREE.Mesh(stone(0, frontTop, frontA.z - 0.55, frontA.z + 0.75, 0.85, frontTop / 1.32 + 0.25, 0.3), rockMat);
  const side = new THREE.Mesh(stone(0.75, frontTop * 0.55, frontA.z - 0.2, frontA.z + 0.9, 0.55, frontTop * 0.55 / 1.32 + 0.2, 1.7), rockMat);
  const moss = new THREE.Mesh(stone(-0.15, frontTop + 0.015, frontA.z - 0.15, frontA.z + 0.45, 0.45, 0.06, 2.4), mossMat); moss.scale.y = 1;
  rock.add(main, side, moss);
  root.add(rock);

  const jungle = buildJungle(frontA.z);
  root.add(jungle);
  window.__paws = { hind: hindA.toArray(), front: frontA.toArray(), frontTop };

  return { root, mixer, head, rock, jungle, speed: 0.45, targetSpeed: 0.45 };
}

// A small piece of Sundarbans jungle that travels with the tiger: muddy ground, grass,
// ferns and mangrove trees with stilt roots. Trees stand behind and beside the tiger,
// never in front, so the tiger always stays in view.
function buildJungle(frontZ) {
  const g = new THREE.Group();
  const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  // ground island
  const gGeo = new THREE.CylinderGeometry(3.4, 3.7, 0.3, 64, 1); const gp = gGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), z = gp.getZ(i); if (gp.getY(i) > 0) gp.setY(i, 0.15 + 0.05 * Math.sin(x * 2.3) * Math.cos(z * 1.9)); }
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ color: 0x2c3b22, roughness: 1 })); ground.position.y = -0.17; g.add(ground);
  // grass blades
  const blade = new THREE.ConeGeometry(0.035, 0.42, 3); blade.translate(0, 0.21, 0);
  const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 300);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < 300; i++) {
    const a = rnd() * Math.PI * 2, r = 0.6 + Math.sqrt(rnd()) * 2.8;
    pos.set(Math.cos(a) * r, -0.02, Math.sin(a) * r);
    if ((Math.abs(pos.x) < 0.8 && pos.z > -1.3 && pos.z < frontZ + 0.9) || (pos.z > 0.4 && Math.abs(pos.x) < 2.3)) { i--; continue; }     // keep the tiger and the view in front clear
    e.set((rnd() - 0.5) * 0.5, rnd() * 6.3, (rnd() - 0.5) * 0.5); q.setFromEuler(e); const h = 0.35 + rnd() * 0.55; sc.set(1, h, 1);
    m.compose(pos, q, sc); grass.setMatrixAt(i, m); grass.setColorAt(i, col.setHSL(0.24 + rnd() * 0.08, 0.55, 0.22 + rnd() * 0.16));
  }
  g.add(grass);
  // ferns: fans of leaves
  const leaf = new THREE.Shape(); leaf.moveTo(0, 0); leaf.quadraticCurveTo(0.16, 0.45, 0, 0.95); leaf.quadraticCurveTo(-0.16, 0.45, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leaf, 6); leafGeo.rotateX(-Math.PI / 2 + 0.75);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  const ferns = new THREE.InstancedMesh(leafGeo, leafMat, 14 * 9); let k = 0;
  const fernSpots = [[-2.2, -1.6], [2.1, -1.9], [-2.6, 0.6], [2.6, 0.3], [-1.3, -2.6], [1.0, -2.8], [-2.9, -0.7], [2.9, -0.9], [-2.95, 1.5], [3.0, 1.6], [0.1, -3.0], [-2.2, -2.9], [2.4, -2.6], [-2.5, -2.3]];
  fernSpots.forEach(([x, z]) => {
    const s0 = 0.55 + rnd() * 0.45;
    for (let j = 0; j < 9; j++) {
      e.set(0, (j / 9) * Math.PI * 2 + rnd() * 0.4, 0); q.setFromEuler(e); sc.set(s0, s0, s0 * (0.8 + rnd() * 0.4)); pos.set(x, 0, z);
      m.compose(pos, q, sc); ferns.setMatrixAt(k, m); ferns.setColorAt(k, col.setHSL(0.27 + rnd() * 0.06, 0.6, 0.2 + rnd() * 0.12)); k++;
    }
  });
  g.add(ferns);
  // mangrove trees (sundari style): a leaning trunk, stilt roots and a layered canopy
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  const leafMats = [0x1f5a2a, 0x2b6e31, 0x3d7f35, 0x174a22].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  const tree = (x, z, h) => {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = rnd() * 6.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * h, 0.12 * h, h, 7), barkMat); trunk.position.y = h / 2 + 0.25; trunk.rotation.z = (rnd() - 0.5) * 0.18; t.add(trunk);
    for (let r = 0; r < 6; r++) {   // stilt roots
      const a = (r / 6) * Math.PI * 2 + rnd() * 0.5, len = 0.75 + rnd() * 0.3;
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, len, 5), barkMat);
      root.position.set(Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22); root.lookAt(Math.cos(a) * 1.2, -0.3, Math.sin(a) * 1.2); root.rotateX(Math.PI / 2); t.add(root);
    }
    for (let c = 0; c < 5; c++) {   // canopy
      const r = (0.55 + rnd() * 0.45) * h * 0.32;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[Math.floor(rnd() * leafMats.length)]);
      blob.position.set((rnd() - 0.5) * h * 0.35, h * (0.82 + rnd() * 0.3), (rnd() - 0.5) * h * 0.35); blob.scale.y = 0.7; t.add(blob);
    }
    g.add(t);
  };
  // behind and to the sides only (the tiger faces +z)
  [[-2.7, -2.0, 3.0], [-0.6, -3.2, 3.6], [1.7, -2.9, 3.2], [3.1, -1.1, 2.6], [-3.2, 0.0, 2.4], [3.2, 0.9, 2.2], [-1.9, -3.3, 2.3]].forEach(([x, z, h]) => tree(x, z, h));
  // a few hanging vines from the canopy
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x2f5a25, roughness: 1 });
  [[-0.6, -3.2, 3.6], [1.7, -2.9, 3.2], [-2.7, -2.0, 3.0]].forEach(([x, z, h]) => {
    const pts = []; for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(x + 0.3 + Math.sin(i * 0.9) * 0.08, h * 0.95 - i * 0.28, z + 0.25));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 4), vineMat));
  });
  return g;
}

function setupRickshaw(gltf) {
  const model = gltf.scene; model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model); const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = 2.5 / size.y; model.position.set(-c.x, -box.min.y, -c.z);
  const inner = new THREE.Group(); inner.add(model); inner.scale.setScalar(s);
  const root = new THREE.Group(); root.add(inner);
  return { root, radius: Math.max(size.x, size.z) * s * 0.5 };
}

// The mosque is a 3D scan that arrives tilted, so we find its flattest direction and stand it upright.
function setupMosque(gltf) {
  const model = gltf.scene; model.updateMatrixWorld(true);
  const pts = []; const v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return; o.material.toneMapped = false;
    const pa = o.geometry.attributes.position; const step = Math.max(1, Math.floor(pa.count / 1200));
    for (let i = 0; i < pa.count; i += step) pts.push(v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).clone());
  });
  const mean = new THREE.Vector3(); pts.forEach((q) => mean.add(q)); mean.multiplyScalar(1 / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  pts.forEach((q) => { const d = [q.x - mean.x, q.y - mean.y, q.z - mean.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; });
  const power = (M) => { let x = [0.6, 0.5, 0.7]; let l = 0; for (let k = 0; k < 60; k++) { const y = [0, 1, 2].map((i) => M[i][0] * x[0] + M[i][1] * x[1] + M[i][2] * x[2]); l = Math.hypot(...y) || 1; x = y.map((c) => c / l); } return { x, l }; };
  const e1 = power(C); const C2 = C.map((r, i) => r.map((c, j) => c - e1.l * e1.x[i] * e1.x[j])); const e2 = power(C2);
  const a1 = new THREE.Vector3(...e1.x), a2 = new THREE.Vector3(...e2.x); const up = a1.clone().cross(a2).normalize(); if (up.y < 0) up.negate();
  const q = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
  const lvl = pts.map((pt) => pt.clone().applyQuaternion(q)); const long = a1.clone().applyQuaternion(q); const yaw = Math.atan2(long.z, long.x);
  const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); lvl.forEach((pt) => pt.applyQuaternion(rotY));
  const box = new THREE.Box3().setFromPoints(lvl); const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const tilt = new THREE.Group(); tilt.add(model); tilt.quaternion.copy(rotY).multiply(q);
  const centre = new THREE.Group(); centre.add(tilt); centre.position.set(-c.x, -box.min.y, -c.z);
  const inner = new THREE.Group(); inner.add(centre); inner.scale.setScalar(12 / Math.max(size.x, size.z));
  const root = new THREE.Group(); root.add(inner);
  return { root };
}

// Shaheed Minar and Smriti Soudho: centre each model, stand it on the ground, turn its front towards +z,
// scale it to a set height and give it a simple base.
function boxOf(obj, test) { const b = new THREE.Box3(); obj.updateMatrixWorld(true); obj.traverse((o) => { if (o.isMesh && (!test || test(o))) b.expandByObject(o); }); return b; }
function setupMonument(gltf, opt) {
  const model = gltf.scene; model.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; if (opt.material) o.material = opt.material; } });
  const lvl = new THREE.Group(); lvl.add(model); if (opt.level) lvl.quaternion.copy(opt.level(model));
  const spin = new THREE.Group(); spin.add(lvl); spin.rotation.y = opt.yaw(model);
  const box = boxOf(spin); const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const centre = new THREE.Group(); centre.add(spin); centre.position.set(-c.x, -box.min.y, -c.z);
  const k = opt.height / size.y; const inner = new THREE.Group(); inner.add(centre); inner.scale.setScalar(k);
  const root = new THREE.Group(); root.add(inner);
  const base = opt.base(size.x * k, size.z * k); base.position.y = 0; root.add(base); inner.position.y = opt.lift || 0;
  return { root, w: size.x * k, d: size.z * k };
}
const brickMat = new THREE.MeshStandardMaterial({ color: 0x9a4a32, roughness: 0.95 });
const stepMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.8 });
function setupMinar(gltf) {
  return setupMonument(gltf, {
    height: 3.6, lift: 0.18,
    // the scan sits on a slope; turn it so the red platform is flat
    level: (m) => {
      m.updateMatrixWorld(true); const n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      m.traverse((o) => {
        if (!o.isMesh || !/RedPlaster|WhiteTiles/.test(o.material.name || '')) return;
        const g = o.geometry, p = g.attributes.position, idx = g.index; const cnt = idx ? idx.count : p.count;
        for (let i = 0; i < cnt; i += 3) {
          const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
          a.fromBufferAttribute(p, ia).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(p, ib).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(p, ic).applyMatrix4(o.matrixWorld);
          const f = e1.subVectors(b, a).cross(e2.subVectors(c, a)); if (f.y < 0) f.negate(); if (f.y > f.length() * 0.8) n.add(f);
        }
      });
      return n.lengthSq() ? new THREE.Quaternion().setFromUnitVectors(n.normalize(), new THREE.Vector3(0, 1, 0)) : new THREE.Quaternion();
    },
    // the red sun stands behind the columns, so the front is the side away from it
    yaw: (m) => { const cOf = (re) => boxOf(m, (o) => re.test(o.material.name || '')).getCenter(new THREE.Vector3()); const sun = cOf(/Sun/), col = cOf(/Minar/); const f = col.sub(sun); return -Math.atan2(f.x, f.z); },
    base: (w, d) => {
      const g = new THREE.Group(); const r = Math.max(w, d) * 0.62;
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, 0.2, 64), brickMat); plaza.position.y = 0.0; g.add(plaza);
      const step = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.18, d * 1.1), stepMat); step.position.y = 0.09; g.add(step);
      return g;
    }
  });
}
function setupSmriti(gltf) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.85, side: THREE.DoubleSide });
  return setupMonument(gltf, {
    height: 7.2, lift: 0.36, material: concrete,
    yaw: () => Math.atan2(0.675, -0.737) * -1,   // the side where the seven walls line up into one peak
    base: (w, d) => {
      const g = new THREE.Group(); const s = Math.max(w, d);
      [[1.22, 0.12, 0.06], [1.12, 0.12, 0.18], [1.03, 0.12, 0.3]].forEach(([f, h, y]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(s * f, h, s * f), brickMat); b.position.y = y; g.add(b); });
      const pool = new THREE.Mesh(new THREE.BoxGeometry(s * 0.32, 0.05, s * 1.3), new THREE.MeshStandardMaterial({ color: 0x0f3a3a, roughness: 0.15, metalness: 0.3 }));
      pool.position.set(0, 0.03, s * 1.35); g.add(pool);
      const path = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, 0.04, s * 1.4), brickMat); path.position.set(0, 0.01, s * 1.35); g.add(path); pool.position.y = 0.04;
      return g;
    }
  });
}

// National Parliament: Louis Kahn's building rising out of its lake, on a lawn island
const lakeMat = new THREE.MeshStandardMaterial({ color: 0x1f5d66, roughness: 0.1, metalness: 0.35 });
const lawnMat = new THREE.MeshStandardMaterial({ color: 0x2d6b3b, roughness: 1 });
function setupParliament(gltf) {
  gltf.scene.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) o.material.depthWrite = false; });
  return setupMonument(gltf, {
    height: 2.3, lift: 0.07,
    yaw: () => 0,
    base: (w, d) => {
      const g = new THREE.Group(); const s = Math.max(w, d);
      const lawn = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, 0.12, s * 1.4), lawnMat); lawn.position.y = 0.0; g.add(lawn);
      const lake = new THREE.Mesh(new THREE.BoxGeometry(s * 1.2, 0.04, s * 1.2), lakeMat); lake.position.y = 0.075; g.add(lake);
      return g;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Hub: portals                                                        */
/* ------------------------------------------------------------------ */
const portals = []; const hubClickables = [];
const PW = 2.5, PH = 3.6;
function archShape(w, h) { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0); return s; }
function labelSprite(en, bn, color, size = 84) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200; const g = c.getContext('2d');
  g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 14;
  g.fillStyle = '#fff'; g.font = `700 ${size}px "Playfair Display", Georgia, serif`; g.fillText(en, 256, 92);
  g.fillStyle = color; g.font = '600 54px "Hind Siliguri", sans-serif'; g.fillText(bn, 256, 168);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  sp.scale.set(3.2, 1.25, 1); return sp;
}
function buildHub() {
  const geo = new THREE.ShapeGeometry(archShape(PW, PH), 24);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + PW / 2) / PW, pos.getY(i) / PH);
  const frameGeo = new THREE.ShapeGeometry(archShape(PW + 0.22, PH + 0.22), 24); frameGeo.translate(0, -0.11, -0.03);
  const glowGeo = new THREE.PlaneGeometry(PW * 2.3, PH * 1.9); const glowTex = dotTexture();
  SECTIONS.forEach((sec) => {
    const item = sec.items.find((i) => i.id === COVERS[sec.id]) || sec.items[0];
    const map = texLoader.load(`assets/img/${item.id}.jpg`); map.colorSpace = THREE.SRGBColorSpace;
    const ia = item.w / item.h, pa = PW / PH;
    if (ia > pa) { map.repeat.set(pa / ia, 1); map.offset.set((1 - pa / ia) / 2, 0); } else { map.repeat.set(1, ia / pa); map.offset.set(0, (1 - ia / pa) / 2); }
    const g = new THREE.Group();
    const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, toneMapped: false }));
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ color: sec.color, toneMapped: false }));
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: sec.color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    glow.position.set(0, PH / 2, -0.2);
    const label = labelSprite(sec.title, sec.titleBn, sec.color); label.position.set(0, -0.75, 0.1);
    g.add(glow, frame, face, label);
    face.userData.action = () => openSection(sec.id);
    hubG.add(g); hubClickables.push(face);
    portals.push({ g, face, sec, hover: 0, phase: Math.random() * 6 });
  });
  // the team's map poster, standing in the water as a doorway to the interactive map
  const bt = texLoader.load('assets/img/bdmap_full.jpg'); bt.colorSpace = THREE.SRGBColorSpace;
  mapBoard = new THREE.Group();
  const bw = 5.2, bh = bw * 8192 / 5794;
  const bface = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: bt, toneMapped: false }));
  const bframe = new THREE.Mesh(new THREE.PlaneGeometry(bw + 0.24, bh + 0.24), new THREE.MeshBasicMaterial({ color: 0xf2c46d, toneMapped: false })); bframe.position.z = -0.03;
  const bglow = new THREE.Mesh(new THREE.PlaneGeometry(bw * 2.2, bh * 1.7), new THREE.MeshBasicMaterial({ map: dotTexture(), color: 0x2aa7b8, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); bglow.position.z = -0.2;
  mapBoard.add(bglow, bframe, bface); bface.userData.action = () => openMap(); hubG.add(mapBoard); hubClickables.push(bface);
  layoutHub();
}
// The landing page is one 3D world. Scrolling moves the camera from stop to stop.
const hub = { stop: 0, s: 0, keys: [], spot: {}, acc: 0, lock: 0 };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let mapBoard = null;
function layoutHub() {
  const aspect = window.innerWidth / window.innerHeight; const wide = aspect >= 1.2; let d, last;
  if (wide) {
    const angles = [-58, -35, -12, 12, 35, 58];
    portals.forEach((p, i) => { const a = THREE.MathUtils.degToRad(angles[i % 6]); p.base = V3(Math.sin(a) * 11, 2.5, 1 - Math.cos(a) * 11); });
    d = 13 * Math.pow(Math.max(1, 1.78 / aspect), 1.15);
    last = { pos: V3(0, 2.9, d), look: V3(0, 2.9, 0) };
    skyU.uSunDir.value.set(0, 0.2, -1).normalize();
  } else {
    portals.forEach((p, i) => { const col = i % 3 - 1, row = Math.floor(i / 3); const a = THREE.MathUtils.degToRad(col * 19); p.base = V3(Math.sin(a) * 11, 9.6 - row * 5.3, 1 - Math.cos(a) * 11); });
    d = 15 * Math.max(1, 0.72 / aspect);
    last = { pos: V3(0, 4.1, d), look: V3(0, 4.0, 0) };
    skyU.uSunDir.value.set(0, 0.1, -1).normalize();
  }
  portals.forEach((p) => { p.g.position.copy(p.base); p.g.lookAt(last.pos.x, p.base.y, last.pos.z); });
  // where each model stands, on the way from the first view to the doorways
  // one zigzag path down the river: right, left, right, left ... towards the doorways
  hub.spot = { smriti: V3(6.5, 0.12, d + 54), minar: V3(-7, 0.12, d + 44), parliament: V3(8, 0.1, d + 36), tiger: V3(-6, 0.25, d + 28), rickshaw: V3(6, 0.22, d + 20), mosque: V3(-9, 0.14, d + 10), board: V3(10, 4.1, d + 2) };
  // a camera stop: look at the model (shifted sideways so the text has room) from a little way off
  const far = wide ? 1 : 1.7;
  const stop = (m, shift, lookY, off) => { const look = V3(m.x + (wide ? shift : 0), lookY - (wide ? 0 : 0.7), m.z); return { look, pos: look.clone().add(off.multiplyScalar(far)) }; };
  hub.keys = [
    wide ? { pos: V3(2, 6.6, d + 92), look: V3(-10, 1.6, d + 22) } : { pos: V3(0, 6.0, d + 96), look: V3(0, 1.0, d + 14) },
    stop(hub.spot.smriti, -4.2, 3.4, V3(-3.0, 3.6, 17.5)),
    stop(hub.spot.minar, 2.4, 1.9, V3(2.6, 1.4, 9.6)),
    stop(hub.spot.parliament, -3.6, 1.2, wide ? V3(-2.6, 3.4, 12.5) : V3(3.2, 3.0, 11.5)),   // portrait: from the right, so the memorial is not in the way
    stop(hub.spot.tiger, 1.5, 1.25, V3(2.0, 0.7, 6.8)),
    stop(hub.spot.rickshaw, -1.5, 1.2, V3(-1.8, 0.5, 5.4)),
    stop(hub.spot.mosque, 3.4, 1.2, V3(2.4, 2.9, 13.5)),
    stop(hub.spot.board, -3.0, 3.9, V3(-1.6, 0.1, 12.6)),
    last
  ];
  if (mapBoard) { const kb = hub.keys[hub.keys.length - 2]; mapBoard.position.copy(hub.spot.board); mapBoard.lookAt(kb.pos.x, hub.spot.board.y, kb.pos.z); }
  if (state.mode === 'hub') placeModels('hub');
}
function setStop(i) {
  i = clamp(i, 0, hub.keys.length - 1 || 7); hub.stop = i;
  document.querySelectorAll('.stop').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
  [...$('#dots').children].forEach((b, k) => b.classList.toggle('on', k === i));
  document.body.classList.toggle('stop-first', i === 0); document.body.classList.toggle('stop-last', i === (hub.keys.length || 8) - 1);
}

// raft under the rickshaw in the hub and pedestal for the viewer
const raft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.85 }));
hubG.add(raft);
const isle = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.9, 0.5, 72), new THREE.MeshStandardMaterial({ color: 0x1c4633, roughness: 1 })); isle.scale.z = 0.8; hubG.add(isle);
const pedestal = new THREE.Group();
{
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.25, 64), new THREE.MeshStandardMaterial({ color: 0x10241e, roughness: 0.6, metalness: 0.2 }));
  top.position.y = -0.125;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.68, 0.03, 8, 96), new THREE.MeshBasicMaterial({ color: 0xf2c46d, toneMapped: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; pedestal.add(top, ring); pedestal.userData.ring = ring; viewG.add(pedestal);
}
const galFloor = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(0.6, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = -2.9; galG.add(m); return m;
})();

function placeModels(where) {
  const sp = hub.spot;
  if (tiger) {
    const r = tiger.root;
    if (where === 'hub' && sp.tiger) { hubG.add(r); r.position.copy(sp.tiger); r.rotation.y = 0.8; r.scale.setScalar(0.85); }
    else if (where === 'viewTiger') { viewG.add(r); r.position.set(0, 0.02, -0.2); r.rotation.y = 0.6; r.scale.setScalar(1.2); }
    else r.removeFromParent();
  }
  if (rickshaw) {
    const r = rickshaw.root;
    if (where === 'hub' && sp.rickshaw) { hubG.add(r); r.position.copy(sp.rickshaw); r.scale.setScalar(0.78); raft.position.set(sp.rickshaw.x, 0.06, sp.rickshaw.z); r.visible = true; }
    else if (where === 'viewRickshaw') { viewG.add(r); r.position.set(0, 0, 0); r.rotation.y = -0.6; r.scale.setScalar(1.25); r.visible = true; }
    else r.visible = false;
  }
  if (mosque) {
    const r = mosque.root;
    if (where === 'hub' && sp.mosque) { hubG.add(r); r.position.copy(sp.mosque); r.rotation.y = 0; r.scale.setScalar(1); isle.position.set(sp.mosque.x, -0.13, sp.mosque.z); r.visible = true; }
    else if (where === 'viewMosque') { viewG.add(r); r.position.set(0, 0.02, 0); r.rotation.y = 0.5; r.scale.setScalar(0.5); r.visible = true; }
    else r.visible = false;
  }
  [[minar, 'minar', 'viewMinar', 1, 0.95, 0], [smriti, 'smriti', 'viewSmriti', 1, 0.62, 0], [parliament, 'parliament', 'viewParliament', 1, 0.68, -0.55]].forEach(([m, key, view, hs, vs, hr]) => {
    if (!m) return; const r = m.root;
    if (where === 'hub' && sp[key]) { hubG.add(r); r.position.copy(sp[key]); r.rotation.y = hr; r.scale.setScalar(hs); r.visible = true; }
    else if (where === view) { viewG.add(r); r.position.set(0, 0.02, 0); r.rotation.y = 0.45; r.scale.setScalar(vs); r.visible = true; }
    else r.visible = false;
  });
}

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */
const R = 7.5; let panels = []; const galLayout = { maxW: 6, maxH: 4, spacing: 0.9, offX: 0, offY: 0 };
const panelGeo = new THREE.PlaneGeometry(1, 1, 96, 64);
const frameGeoP = new THREE.PlaneGeometry(1, 1);
const PANEL_VS = /* glsl */`uniform sampler2D uDepth; uniform float uStr; varying vec2 vUv;
void main(){ vUv = uv; float d = texture2D(uDepth, uv).r;
  float e = smoothstep(0.0,0.08,uv.x)*smoothstep(0.0,0.08,1.0-uv.x)*smoothstep(0.0,0.08,uv.y)*smoothstep(0.0,0.08,1.0-uv.y);
  vec3 p = position; p.z += d * uStr * e; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const PANEL_FS = /* glsl */`uniform sampler2D uMap; uniform float uDim; varying vec2 vUv;
void main(){ vec3 c = texture2D(uMap, vUv).rgb; vec2 q = vUv - 0.5; c *= 1.0 - 0.35 * dot(q,q); gl_FragColor = vec4(c * uDim, 1.0); }`;
const flatDepth = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();
const glowSoft = dotTexture();

function buildGallery(sec) {
  disposeGallery();
  panels = sec.items.map((item, i) => {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: loadTex(`assets/img/${item.id}_t.jpg`) }, uDepth: { value: flatDepth }, uStr: { value: 0 }, uDim: { value: 1 } }, vertexShader: PANEL_VS, fragmentShader: PANEL_FS });
    const mesh = new THREE.Mesh(panelGeo, mat); mesh.userData.index = i;
    const frame = new THREE.Mesh(frameGeoP, new THREE.MeshBasicMaterial({ color: 0xf6efe2, toneMapped: false })); frame.position.z = -0.02;
    const back = new THREE.Mesh(frameGeoP, new THREE.MeshBasicMaterial({ color: sec.color, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, map: glowSoft })); back.position.z = -0.3;
    g.add(back, frame, mesh); galG.add(g);
    return { g, mesh, frame, back, mat, item, full: null, depth: null, loaded: false };
  });
  layoutGallery();
}
function disposeGallery() {
  panels.forEach((p) => { galG.remove(p.g); p.mat.uniforms.uMap.value.dispose(); if (p.full) p.full.dispose(); if (p.depth) p.depth.dispose(); p.mat.dispose(); p.frame.material.dispose(); p.back.material.dispose(); });
  panels = [];
}
function ensureFull(p) {
  if (p.loaded) return; p.loaded = true;
  texLoader.load(`assets/img/${p.item.id}.jpg`, (t) => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; if (!panels.includes(p)) { t.dispose(); return; } p.mat.uniforms.uMap.value.dispose(); p.mat.uniforms.uMap.value = t; p.full = t; });
  texLoader.load(`assets/img/${p.item.id}_d.jpg`, (t) => { t.colorSpace = THREE.NoColorSpace; if (!panels.includes(p)) { t.dispose(); return; } p.mat.uniforms.uDepth.value = t; p.depth = t; });
}
// Works out the free area on screen (between the top bar, the caption dock and the details card)
// and sizes the photos to fit inside it, so text never sits on top of a picture.
function layoutGallery() {
  const W = window.innerWidth, H = window.innerHeight; const portrait = W / H < 1 || W <= 820;
  const cardW = $('#card').getBoundingClientRect().width;
  const visH = 2 * (state.zoom ? R - 2 : R) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const visW = visH * (W / H);
  let top = 72, bottom = 20, right = 0;
  if (state.mode === 'viewer' || state.mode === 'map') { const m = state.mode === 'map'; if (portrait) bottom = H * 0.38 + (m ? 90 : 20); else { right = cardW + 30; if (m) bottom = 80; } }
  else if (state.journey.on) { top = 26; bottom = Math.max(120, $('#jCap').getBoundingClientRect().height - 16); }
  else if (state.zoom) { top = 30; bottom = 30; }
  else { bottom = Math.max(120, $('#dock').getBoundingClientRect().height - 12); if (state.cardOpen && !portrait) right = cardW + 30; }
  const availW = W - right, availH = Math.max(120, H - top - bottom);
  galLayout.offX = right / 2; galLayout.offY = (bottom - top) / 2;
  galLayout.maxW = Math.min(11, visW * (availW / W) * 0.84); galLayout.maxH = Math.min(6.4, visH * (availH / H) * 0.9);
  galLayout.spacing = 2 * Math.atan((galLayout.maxW * 0.5 + 0.5) / R) * 0.9;
  panels.forEach((p) => {
    const a = p.item.w / p.item.h; let w = galLayout.maxW, h = w / a; if (h > galLayout.maxH) { h = galLayout.maxH; w = h * a; }
    p.w = w; p.h = h; p.mesh.scale.set(w, h, 1); p.frame.scale.set(w + 0.12, h + 0.12, 1); p.back.scale.set(w * 1.7, h * 1.8, 1);
  });
  document.documentElement.style.setProperty('--photo-cy', (top + availH / 2) + 'px');
  applyViewOffset();
}
function applyViewOffset() {
  const W = window.innerWidth, H = window.innerHeight;
  if (state.mode === 'gallery' || state.mode === 'viewer' || state.mode === 'map') camera.setViewOffset(W, H, galLayout.offX || 0, galLayout.offY || 0, W, H);
  else camera.clearViewOffset();
}

/* ------------------------------------------------------------------ */
/* Mode switching                                                      */
/* ------------------------------------------------------------------ */
const jungleFog = new THREE.FogExp2(0x0d2a19, 0.035);
function setBodyMode(m) { scene.fog = null; document.body.className = document.body.className.replace(/mode-\w+/g, '').replace(/view-\w+/g, '').replace(/\s+/g, ' ').trim() + ' mode-' + m; mapG.visible = m === 'map'; }
async function transition(fn) {
  if (state.busy) return false; state.busy = true;
  $('#fade').classList.add('on'); await wait(430); fn(); await wait(60); $('#fade').classList.remove('on'); state.busy = false; return true;
}
function setCard(open) { state.cardOpen = open; document.body.classList.toggle('card-open', open); if (state.mode !== 'hub' && state.mode !== 'gate') layoutGallery(); }
function showHub(stop) {
  state.mode = 'hub'; state.section = null; state.zoom = false; setBodyMode('hub'); document.body.classList.remove('zoomed'); setCard(false);
  hubG.visible = true; galG.visible = viewG.visible = false; controls.enabled = false;
  setSky('hub'); placeModels('hub'); disposeGallery(); camera.clearViewOffset();
  if (typeof stop === 'number') { setStop(stop); hub.s = stop; } else setStop(hub.stop);
  $('#crumb').textContent = 'Bangladesh';
  document.documentElement.style.setProperty('--accent', '#1fa97a');
  guide.stopSpeaking();
  if (!hub.greeted) { hub.greeted = true; guide.say('Assalamu alaikum! I am Bagh Mama. Scroll down to start, or tap me if you have a question.'); }
}
function showGallery(secId, idx = 0) {
  const sec = SECTIONS.find((s) => s.id === secId); if (!sec) return;
  state.mode = 'gallery'; state.section = sec; state.idx = idx; state.cur = idx; state.zoom = false; setBodyMode('gallery'); document.body.classList.remove('zoomed');
  state.cardOpen = false; document.body.classList.remove('card-open');
  hubG.visible = viewG.visible = false; galG.visible = true; controls.enabled = false;
  setSky('gallery', sec.color); placeModels('none');
  document.documentElement.style.setProperty('--accent', sec.color);
  $('#crumb').textContent = sec.title;
  buildGallery(sec);
  $('#thumbs').innerHTML = '';
  sec.items.forEach((it, i) => { const b = document.createElement('button'); b.style.backgroundImage = `url(assets/img/${it.id}_t.jpg)`; b.title = it.title; b.onclick = () => select(i); $('#thumbs').appendChild(b); });
  camera.position.set(0, 0, 0); camera.lookAt(0, 0, -R);
  updateCard(true);
  requestAnimationFrame(layoutGallery);
}
const VIEWS = {
  tiger: { color: '#f29a3e', sky: '#2e7d3c', place: 'viewTiger', y: 1.45, cam: [5.8, 2.6, 6.4], ped: 1.75, far: 12, say: 'The Royal Bengal Tiger, our national animal. Drag to look around.' },
  rickshaw: { color: '#e2504c', place: 'viewRickshaw', y: 1.6, cam: [3.6, 2.5, 5.4], ped: 1, far: 10, say: 'Drag to spin the rickshaw. Look at the painting on the hood and the back panel.' },
  minar: { color: '#e2504c', place: 'viewMinar', y: 1.6, cam: [3.6, 2.6, 6.2], ped: 1.15, far: 11, say: 'The mother and her martyred sons, with the red sun behind. Drag to look around.' },
  smriti: { color: '#c9a77a', place: 'viewSmriti', y: 2.3, cam: [5.4, 3.0, 8.2], ped: 1.25, far: 14, say: 'Walk around it. From the side you can count the seven walls.' },
  parliament: { color: '#8fb3c4', place: 'viewParliament', y: 0.8, cam: [4.6, 2.7, 6.3], ped: 1.6, far: 13, say: 'Louis Kahn\'s parliament. Drag to walk around it and find the giant circles and triangles.' },
  mosque: { color: '#d98a3a', place: 'viewMosque', y: 0.8, cam: [4.6, 3.8, 7.6], ped: 1.55, far: 15, say: 'This is a 3D scan of the real mosque. Drag to fly around it and count the domes.' }
};
function showViewer(which) {
  const info = DATA.icons[which], v = VIEWS[which]; if (!info || !v) return;
  state.mode = 'viewer'; state.view = which; state.section = null; state.zoom = false; setBodyMode('viewer'); document.body.classList.remove('zoomed');
  hubG.visible = galG.visible = false; viewG.visible = true; disposeGallery();
  setSky('gallery', v.sky || v.color); document.documentElement.style.setProperty('--accent', v.color);
  scene.fog = which === 'tiger' ? jungleFog : null;   // a light green jungle haze behind the tiger
  pedestal.userData.ring.material.color.set(v.color); pedestal.scale.set(v.ped, 1, v.ped);
  placeModels(v.place);
  $('#crumb').textContent = info.title;
  $('#cardCount').textContent = '3D model'; $('#cardTitle').textContent = info.title; $('#cardMeta').textContent = info.titleBn;
  $('#cardText').textContent = info.text; $('#cardFacts').innerHTML = info.facts.map((f) => `<li>${f}</li>`).join('');
  restartAnim($('.card-scroll'), 'card-anim');
  controls.target.set(0, v.y, 0); camera.position.set(...v.cam); controls.maxDistance = v.far; controls.enabled = true; controls.autoRotate = true; controls.update();
  state.cardOpen = true; document.body.classList.add('card-open'); layoutGallery();
  guide.stopSpeaking(); guide.say(v.say);
}

/* ------------------------------------------------------------------ */
/* The interactive map: eight divisions cut out of the team's map art   */
/* ------------------------------------------------------------------ */
const mapG = new THREE.Group(); mapG.visible = false; scene.add(mapG);
const mapBoard3 = new THREE.Group(); mapG.add(mapBoard3);
let MAP = null, mapDivs = [], mapSel = null, mapHover = null, mapXY = null;
// zoom and pan of the map camera (the map is re-drawn sharp at every zoom, unlike browser zoom)
const mapView = { zoom: 1, tz: 1, look: new THREE.Vector3(), tlook: new THREE.Vector3(), dist: 12.6 };
const MAP_MAX_ZOOM = 5;
async function ensureMap() {
  if (MAP) return;
  MAP = await (await fetch('data/map.json')).json();
  const tex = texLoader.load('assets/img/bdmap.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const [gx0, gy0, gx1, gy1] = MAP.geoBox; const K = 1.5, cx = 90.35, cy = 23.6, kx = Math.cos(THREE.MathUtils.degToRad(23.7));
  const X = (lon) => (lon - cx) * kx * K, Y = (lat) => (lat - cy) * K; mapXY = { X, Y };
  const uvGen = {
    generateTopUV: (g, vs, a, b, c) => [a, b, c].map((i) => new THREE.Vector2((vs[i * 3] / (kx * K) + cx - gx0) / (gx1 - gx0), (vs[i * 3 + 1] / K + cy - gy0) / (gy1 - gy0))),
    generateSideWallUV: () => [0, 1, 2, 3].map(() => new THREE.Vector2(0, 0))
  };
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: dotTexture(), color: 0x2aa7b8, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false })); glow.position.z = -0.6; mapBoard3.add(glow);
  MAP.divisions.forEach((d) => {
    const shapes = d.polys.map((r) => { const sh = new THREE.Shape(); r.forEach(([lo, la], i) => (i ? sh.lineTo(X(lo), Y(la)) : sh.moveTo(X(lo), Y(la)))); return sh; });
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.24, bevelEnabled: false, UVGenerator: uvGen });
    const top = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), side = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.55, metalness: 0.1 });
    const mesh = new THREE.Mesh(geo, [top, side]); mesh.userData.div = d;
    const g = new THREE.Group(); g.add(mesh);
    d.polys.forEach((r) => { const lg = new THREE.BufferGeometry().setFromPoints(r.map(([lo, la]) => V3(X(lo), Y(la), 0.245))); g.add(new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, toneMapped: false }))); });
    const label = labelSprite(d.name, d.bn, '#ffe9a8', 68); label.material.depthTest = false; label.renderOrder = 5; label.scale.set(1.5, 0.59, 1); label.position.set(X(d.c[0]), Y(d.c[1]), 0.75); g.add(label);
    mapBoard3.add(g); mapDivs.push({ d, g, mesh, top, side, label, lift: 0 });
  });
  const bar = $('#mapbar'); bar.innerHTML = '';
  const mk = (id, name, c) => { const b = document.createElement('button'); b.dataset.id = id; b.style.setProperty('--c', c); b.innerHTML = `<i></i>${name}`; b.onclick = () => selectDivision(id || null); bar.appendChild(b); };
  mk('', 'All Bangladesh', '#2aa7b8'); MAP.divisions.forEach((d) => mk(d.id, d.name, d.color));
}
function selectDivision(id) {
  if (mapPin) mapPin.visible = false;
  mapSel = id ? mapDivs.find((m) => m.d.id === id) || null : null;
  const d = mapSel ? mapSel.d : null, c = MAP.country;
  $('#cardCount').textContent = d ? 'Division' : 'The country';
  $('#cardTitle').textContent = d ? `${d.name} Division` : c.title;
  $('#cardMeta').textContent = d ? `${d.bn}  •  ${d.districts} districts  •  ${d.tag}` : c.bn;
  $('#cardText').textContent = d ? d.text : c.text;
  $('#cardFacts').innerHTML = (d ? d.facts : c.facts).map((f) => `<li>${f}</li>`).join('');
  restartAnim($('.card-scroll'), 'card-anim');
  document.documentElement.style.setProperty('--accent', d ? d.color : '#2aa7b8');
  [...$('#mapbar').children].forEach((b) => b.classList.toggle('on', b.dataset.id === (id || '')));
  guide.stopSpeaking();
  // fly in to the chosen division, or back out to the whole country
  if (d) { mapBoard3.updateMatrixWorld(true); mapView.tlook.copy(mapBoard3.localToWorld(V3(mapXY.X(d.c[0]), mapXY.Y(d.c[1]), 0.75))); mapView.tz = 2.3; }
  else { mapView.tlook.set(0, 0, 0); mapView.tz = 1; }
}
// a red pin with the place name, standing on the map
let mapPin = null;
function pinLabel(en, bn) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 220; const g = c.getContext('2d');
  g.fillStyle = 'rgba(4,28,22,.82)';
  g.font = '700 74px "Playfair Display", Georgia, serif'; const tw = Math.max(g.measureText(en).width, 200) + 70; const bw = Math.min(630, tw);
  g.beginPath(); if (g.roundRect) g.roundRect((640 - bw) / 2, 18, bw, 184, 40); else g.rect((640 - bw) / 2, 18, bw, 184); g.fill(); g.strokeStyle = '#f2c46d'; g.lineWidth = 5; g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(en, 320, 102, 590); g.fillStyle = '#f2c46d'; g.font = '600 56px "Hind Siliguri", sans-serif'; g.fillText(bn, 320, 172, 590);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function showPlace(id) {
  const p = MAP && MAP.places && MAP.places.find((x) => x.id === id); if (!p) return false;
  selectDivision(p.div); const div = mapSel ? mapSel.d : null;
  $('#cardCount').textContent = p.kind === 'district' ? 'City and district' : 'Place to visit';
  $('#cardTitle').textContent = p.name;
  $('#cardMeta').textContent = div ? `${p.bn}  •  ${div.name} Division` : p.bn;
  $('#cardText').textContent = p.text ? `${p.text} It is in ${div ? div.name : ''} Division.` : `${p.name} is a district of ${div ? div.name : ''} Division. ${div ? div.text : ''}`;
  restartAnim($('.card-scroll'), 'card-anim');
  if (!mapPin) {
    mapPin = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0xf42a41, roughness: 0.4 })); cone.rotation.x = -Math.PI / 2; cone.position.z = 0.14;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf42a41, roughness: 0.35, emissive: 0x5a0610 })); head.position.z = 0.3;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.13, 32), new THREE.MeshBasicMaterial({ color: 0xf2c46d, transparent: true, opacity: 0.9, toneMapped: false })); ring.position.z = 0.012;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false })); label.scale.set(1.05, 0.36, 1); label.position.z = 0.62; label.renderOrder = 20;
    mapPin.add(cone, head, ring, label); mapPin.userData = { label, ring };
  }
  const lab = mapPin.userData.label; if (lab.material.map) lab.material.map.dispose(); lab.material.map = pinLabel(p.name, p.bn); lab.material.needsUpdate = true;
  (mapSel ? mapSel.g : mapBoard3).add(mapPin); mapPin.position.set(mapXY.X(p.lon), mapXY.Y(p.lat), 0.245); mapPin.visible = true;
  mapBoard3.updateMatrixWorld(true); mapView.tlook.copy(mapBoard3.localToWorld(V3(mapXY.X(p.lon), mapXY.Y(p.lat), 0.6))); mapView.tz = p.kind === 'district' ? 3.0 : 3.4; clampMapLook();
  return true;
}
function mapZoomBy(f, sx, sy) {
  const old = mapView.tz; mapView.tz = clamp(mapView.tz * f, 1, MAP_MAX_ZOOM); if (mapView.tz === old) return;
  if (mapView.tz === 1) { mapView.tlook.set(0, 0, 0); return; }
  if (sx !== undefined) {   // keep the point under the finger or mouse in place
    raycaster.setFromCamera(new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1), camera);
    const nrm = V3(0, 0, 1).applyQuaternion(mapBoard3.quaternion); const hitP = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, mapBoard3.position), hitP)) mapView.tlook.lerp(hitP, 1 - old / mapView.tz);
  }
  clampMapLook();
}
function mapPan(dx, dy) {
  const wpp = 2 * mapView.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / window.innerHeight;
  const right = V3(1, 0, 0).applyQuaternion(camera.quaternion), up = V3(0, 1, 0).applyQuaternion(camera.quaternion);
  mapView.tlook.addScaledVector(right, -dx * wpp).addScaledVector(up, dy * wpp); clampMapLook();
}
function clampMapLook() { mapBoard3.updateMatrixWorld(true); const l = mapBoard3.worldToLocal(mapView.tlook.clone()); l.x = clamp(l.x, -3.6, 3.6); l.y = clamp(l.y, -4.8, 4.8); mapView.tlook.copy(mapBoard3.localToWorld(l)); }
function showMap() {
  state.mode = 'map'; state.section = null; state.zoom = false; setBodyMode('map'); document.body.classList.remove('zoomed');
  hubG.visible = galG.visible = viewG.visible = false; disposeGallery(); placeModels('none'); controls.enabled = false;
  setSky('gallery', '#2aa7b8'); $('#crumb').textContent = 'Map';
  state.cardOpen = true; document.body.classList.add('card-open');
  selectDivision(null); mapView.zoom = 1; mapView.look.set(0, 0, 0); layoutGallery();
  guide.say('Tap a division to lift it out. Pinch, scroll or use + and − to zoom in.');
}
const openMap = async () => { try { await ensureMap(); } catch (e) { console.warn('map failed', e); return false; } return transition(showMap); };

const openSection = (id, idx = 0) => transition(() => showGallery(id, idx));
const openViewer = (w) => transition(() => showViewer(w));
const goHome = () => { if (state.mode !== 'hub') transition(() => showHub()); };

function restartAnim(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.scrollTop = 0; }
function updateCard(first) {
  const sec = state.section; if (!sec) return; const it = sec.items[state.idx]; const tr = I18N.items[it.id] || {};
  const meta = [it.place, it.year].filter(Boolean).join('  •  ');
  $('#cardCount').textContent = `${sec.title}  ${state.idx + 1} / ${sec.items.length}`;
  $('#cardTitle').textContent = it.title; $('#cardMeta').textContent = meta; $('#cardText').textContent = it.text;
  $('#cardFacts').innerHTML = (it.facts || []).map((f) => `<li>${f}</li>`).join('');
  restartAnim($('.card-scroll'), 'card-anim');
  // the caption under the photo: name first, then one friendly line from the guide
  $('#dockCount').textContent = `${sec.title}  ${state.idx + 1} / ${sec.items.length}`;
  $('#dockTitle').textContent = it.title; $('#dockMeta').textContent = meta || tr.bn || '';
  const fact = it.facts && it.facts.length ? it.facts[(state.idx + Math.floor(performance.now() / 1000)) % it.facts.length] : '';
  $('#dockSay').textContent = first && state.idx === 0 ? sec.guide : (fact ? `Did you know? ${fact}.` : (tr.s || ''));
  restartAnim($('.dock-text'), 'dock-anim');
  [...$('#thumbs').children].forEach((b, i) => { b.classList.toggle('on', i === state.idx); if (i === state.idx) b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); });
  guide.stopSpeaking();
  if (state.journey.on) updateJourneyCap();
}
function select(i) {
  const sec = state.section; if (!sec) return; const n = sec.items.length; i = ((i % n) + n) % n;
  if (i === state.idx) return;
  if (Math.abs(i - state.idx) > n / 2) state.cur += i > state.idx ? n : -n;   // take the short way round
  state.idx = i; updateCard(false);
  if (state.journey.on) scheduleJourney();
}
const next = () => select(state.idx + 1), prev = () => select(state.idx - 1);
function toggleZoom(force) { state.zoom = force ?? !state.zoom; document.body.classList.toggle('zoomed', state.zoom); if (state.zoom) { state.cardOpen = false; document.body.classList.remove('card-open'); } layoutGallery(); }

/* ------------------------------------------------------------------ */
/* Guide (mascot, speech bubble, read aloud, chat)                     */
/* ------------------------------------------------------------------ */
const guide = new Guide({
  onTalk: () => { const sp = guide.isSpeaking(); document.body.classList.toggle('speaking', sp); duck(sp); },
  navigate: (target) => {
    if (!target) return;
    if (target.map) { const go = () => { if (!(target.place && showPlace(target.place))) selectDivision(target.division || null); }; if (state.mode === 'map') go(); else openMap().then(go); return; }
    if (target.anthem) { showAnthem(); return; }
    if (target.journey) { startJourney(false); return; }
    if (target.view) openViewer(target.view);
    else if (target.section) { const sec = SECTIONS.find((s) => s.id === target.section); if (!sec) return; const idx = target.item ? Math.max(0, sec.items.findIndex((i) => i.id === target.item)) : 0; if (state.mode === 'gallery' && state.section === sec) select(idx); else openSection(sec.id, idx); }
    else if (target.home) goHome();
  }
});
function toggleListen() { if (guide.isSpeaking()) { guide.stopSpeaking(); return; } guide.speak($('#cardTitle').textContent + '. ' + $('#cardText').textContent); }

/* ------------------------------------------------------------------ */
/* Music                                                               */
/* ------------------------------------------------------------------ */
const bgm = $('#bgm'), anthem = $('#anthem'); let musicOn = false, ducked = false;
const bgmSources = ['assets/audio/background.mp3', 'assets/audio/ambient.mp3']; let bgmTry = 0;
bgm.addEventListener('error', () => { if (bgmTry < bgmSources.length - 1) { bgmTry++; bgm.src = bgmSources[bgmTry]; if (musicOn) bgm.play().catch(() => {}); } });
// jump to where the song should start (skips the intro)
function songToStart() { const t = bgmTry === 0 ? (SETTINGS.songStart || 0) : 0; const go = () => { try { bgm.currentTime = t; } catch (e) { /* ignore */ } }; if (bgm.readyState >= 1) go(); else bgm.addEventListener('loadedmetadata', go, { once: true }); }
bgm.addEventListener('ended', () => { songToStart(); if (musicOn) bgm.play().catch(() => {}); });
bgm.addEventListener('timeupdate', () => { if (SETTINGS.songEnd && bgmTry === 0 && bgm.currentTime >= SETTINGS.songEnd) songToStart(); });
// Music is off until someone turns it on. It stays the way the visitor left it.
function setMusic(on, fromStart) {
  musicOn = on; $('#musicBtn').classList.toggle('on', on);
  if (on) {
    if (!bgm.getAttribute('src')) { bgm.src = bgmSources[bgmTry]; bgm.volume = SETTINGS.musicVolume; fromStart = true; }
    if (fromStart) songToStart();
    bgm.play().catch(() => {});
  } else bgm.pause();
}
function duck(on) { ducked = on; }
function tickMusic(dt) {
  if (!musicOn) return; const base = state.journey.on ? SETTINGS.journeyVolume : SETTINGS.musicVolume;
  bgm.volume = clamp(lerp(bgm.volume, ducked ? base * 0.2 : base, Math.min(1, dt * 2.5)), 0, 1);
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('open'); }
function closeModal() { $('#modal').classList.remove('open'); }
let ANTHEM = null, anthemTimes = [], lyIdx = -1;
// first guess at line timing: longer lines get more time than short ones
function evenTimes() { const a = ANTHEM.start || 0, b = ANTHEM.end || anthem.duration || 180; const w = ANTHEM.lines.map((l) => l.bn.length + 12); const tot = w.reduce((x, y) => x + y, 0); let acc = 0; return w.map((v) => { const t = +(a + (b - a) * acc / tot).toFixed(1); acc += v; return t; }); }
function setLyric(i) {
  if (i === lyIdx) return; lyIdx = i; const list = $('#lyList'); const items = [...list.children];
  items.forEach((el, k) => el.classList.toggle('on', k === i));
  requestAnimationFrame(() => { const el = items[Math.max(0, i)]; if (el) list.style.transform = `translateY(${-(el.offsetTop + el.offsetHeight / 2)}px)`; });
}
async function showAnthem() {
  guide.stopSpeaking(); closeModal();
  if (!ANTHEM) {
    try { ANTHEM = await (await fetch('data/anthem.json')).json(); } catch (e) { console.warn('anthem data missing', e); return; }
    $('#avTitle').textContent = ANTHEM.title; $('#avTitleBn').textContent = ANTHEM.titleBn; $('#avCredit').textContent = ANTHEM.credit || '';
    $('#lyList').innerHTML = ANTHEM.lines.map((l) => `<div class="ly"><p class="l-bn bn">${l.bn}</p><p class="l-en">${l.en}</p><p class="l-ar" dir="rtl" lang="ar">${l.ar}</p></div>`).join('');
    anthemTimes = ANTHEM.times && ANTHEM.times.length === ANTHEM.lines.length ? ANTHEM.times : evenTimes();
  }
  lyIdx = -2; setLyric(0); $('#avMsg').textContent = 'Please stand if you are able while the anthem plays.';
  $('#anthemView').classList.add('open');
}
function closeAnthem() { $('#anthemView').classList.remove('open'); anthem.pause(); $('#avPlay').textContent = 'Play the anthem'; if (musicOn) bgm.play().catch(() => {}); }
function playAnthem(fromTop) {
  if (!anthem.getAttribute('src')) anthem.src = 'assets/audio/anthem.mp3'; bgm.pause();
  if (fromTop) { try { anthem.currentTime = 0; } catch (e) { /* ignore */ } }
  return anthem.play().then(() => { $('#avPlay').textContent = 'Pause'; }).catch(() => { $('#avMsg').textContent = 'No recording found. Put your file at assets/audio/anthem.mp3'; });
}
$('#avPlay').onclick = () => { if (!anthem.paused) { anthem.pause(); $('#avPlay').textContent = 'Play the anthem'; } else playAnthem(anthem.ended); };
$('#avClose').onclick = closeAnthem;
anthem.addEventListener('ended', () => { $('#avPlay').textContent = 'Play the anthem'; setLyric(0); });
anthem.addEventListener('timeupdate', () => {
  if (!ANTHEM) return; const t = anthem.currentTime; $('#avProg').style.width = (anthem.duration ? t / anthem.duration * 100 : 0) + '%';
  let i = 0; for (let k = 0; k < anthemTimes.length; k++) if (t >= anthemTimes[k]) i = k; setLyric(i);
});

function showFacts() { openModal(`<h2>Bangladesh at a glance</h2><h3 class="bn">এক নজরে বাংলাদেশ</h3><ul>${DATA.site.quickFacts.map((f) => `<li>${f}</li>`).join('')}</ul>`); }

/* ------------------------------------------------------------------ */
/* The journey: a full screen show of every photo, with music          */
/* ------------------------------------------------------------------ */
const J = state.journey;
const JOURNEY_ORDER = ['nature', 'history', 'heritage', 'culture', 'art', 'food'];   // the order of chapters in the show
function journeySections() { const a = JOURNEY_ORDER.map((id) => SECTIONS.find((s) => s.id === id)).filter(Boolean); SECTIONS.forEach((s) => { if (!a.includes(s)) a.push(s); }); return a; }
// A title card that fades in at the start of every chapter, then fades away.
// a wait that stops counting while the show is paused
async function jwait(ms) { let left = ms; while (left > 0 && J.on) { const t = performance.now(); await wait(Math.min(left, 100)); if (!J.paused) left -= performance.now() - t; } }
// Enter or a double click / double tap pauses the show (photo, progress bar and song), and the same again carries on
let lastPauseToggle = 0;
function toggleJourneyPause() {
  if (!J.on || document.body.classList.contains('j-loading')) return;
  const now = performance.now(); if (now - lastPauseToggle < 450) return; lastPauseToggle = now;
  const bar = $('#jProg');
  if (!J.paused) {
    J.paused = true; J.pausedAt = now;
    if (J.timer) { clearTimeout(J.timer); J.timer = null; J.left = Math.max(0.3, (J.dur || 5) - (now - J.started) / 1000); }
    const w = getComputedStyle(bar).width; bar.style.transition = 'none'; bar.style.width = w;
    if (musicOn) bgm.pause();
    document.body.classList.add('j-paused');
  } else {
    const gap = now - J.pausedAt; J.paused = false; J.started += gap; J.t0 += gap;
    if (musicOn) bgm.play().catch(() => {});
    document.body.classList.remove('j-paused');
    if (J.left != null) { const left = J.left; J.left = null; bar.style.transition = `width ${left}s linear`; bar.style.width = '100%'; J.timer = setTimeout(() => { J.timer = null; journeyNext(); }, left * 1000); }
  }
}

async function chapterCard(sec, swap) {
  const list = journeySections(); const jn = (I18N.sections[sec.id] && I18N.sections[sec.id].jn) || { en: sec.title, bn: sec.titleBn, ar: '' };
  $('#jtK').textContent = `Chapter ${list.indexOf(sec) + 1} of ${list.length}`;
  $('#jtEn').style.fontSize = '';
  $('#jtEn').textContent = jn.en; $('#jtBn').textContent = jn.bn; $('#jtAr').textContent = jn.ar;
  document.documentElement.style.setProperty('--accent', sec.color);
  document.body.classList.add('j-title');
  await jwait(1200);
  if (!J.on) return false;
  if (swap) swap();
  await jwait(2600);
  if (!J.on) return false;
  document.body.classList.remove('j-title');
  await jwait(500);
  return J.on;
}
function enterFullscreen() { const el = document.documentElement; try { const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed, carry on */ } }
function exitFullscreen() { try { if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ } }
function toggleFullscreen() { if (document.fullscreenElement || document.webkitFullscreenElement) exitFullscreen(); else enterFullscreen(); }

async function startJourney(auto = false) {
  if (J.on || state.mode === 'gate') return;
  J.on = true; J.auto = auto; J.paused = false; J.left = null; document.body.classList.remove('j-paused');
  while (state.busy) await wait(60);          // let any page change finish first
  guide.closeChat(); closeModal(); guide.stopSpeaking();
  if (!auto) enterFullscreen();
  document.body.classList.add('journey', 'j-loading');
  if ($('#anthemView').classList.contains('open')) closeAnthem();
  setMusic(true, true);                       // the song always starts from the top with the show
  J.t0 = performance.now(); J.lead = J_LOAD;
  await jwait(3200);
  if (!J.on) return;
  const first = journeySections()[0];
  showGallery(first.id, 0);
  await jwait(300);
  if (!J.on) return;
  layoutGallery();
  const card = chapterCard(first);                 // the first chapter title fades in as the loading screen fades out
  document.body.classList.remove('j-loading');
  if (await card) scheduleJourney();
}
// The whole show (loading, chapter cards, every photo, thank you and the team) fits inside one play of the song,
// so the song never starts again in the middle. Time per photo = what is left of the song / number of photos.
const J_LOAD = 3.5, J_CHAP = 4.3, J_THANKS = 6, J_TEAM = 14, J_FADE = 1.3, J_SAFE = 3;
function songSeconds() {
  const full = bgmTry === 0 && bgm.duration && isFinite(bgm.duration) ? bgm.duration : 409;
  const a = bgmTry === 0 ? (SETTINGS.songStart || 0) : 0, b = bgmTry === 0 && SETTINGS.songEnd ? SETTINGS.songEnd : full;
  return Math.max(60, b - a);
}
function journeyPlan() {
  const secs = journeySections(); const n = secs.reduce((s, x) => s + x.items.length, 0);
  const per = SETTINGS.journeySeconds || Math.max(2.5, (songSeconds() - J_LOAD - secs.length * J_CHAP - J_THANKS - J_TEAM - J_FADE - J_SAFE) / n);
  return { secs, n, per, song: songSeconds() };
}
// seconds since this round of the show began, read from the song itself when it is playing
function journeyClock() {
  const ss = bgmTry === 0 ? (SETTINGS.songStart || 0) : 0;
  if (musicOn && !bgm.paused && bgm.currentTime >= ss - 0.5) return bgm.currentTime - ss;
  return (performance.now() - J.t0) / 1000;
}
function scheduleJourney() {
  clearTimeout(J.timer); J.started = performance.now();
  const { secs, per } = journeyPlan(); const c = Math.max(0, secs.indexOf(state.section)); let k = state.idx; for (let i = 0; i < c; i++) k += secs[i].items.length;
  let dur = per;
  if (!SETTINGS.journeySeconds) { const ideal = J.lead + (c + 1) * J_CHAP + (k + 1) * per; dur = clamp(ideal - journeyClock(), per * 0.6, per * 1.4); }
  J.dur = dur;
  const bar = $('#jProg'); bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth;
  if (J.paused) { J.left = dur; return; }   // moved by hand while paused: wait for the visitor to carry on
  bar.style.transition = `width ${dur}s linear`; bar.style.width = '100%';
  J.timer = setTimeout(() => { J.timer = null; journeyNext(); }, dur * 1000);
}
// the people who made the fest happen: shown after the thank you card
async function buildTeam() {
  let T = null; try { T = await (await fetch('data/team.json')).json(); } catch (e) { return; }
  const tt = (I18N.ui && I18N.ui.team) || { en: 'The team behind the fest', bn: '', ar: '' };
  $('#tmEn').textContent = tt.en; $('#tmBn').textContent = tt.bn; $('#tmAr').textContent = tt.ar;
  const m = T.members; const by = (t) => m.filter((x) => x.tier === t);
  // left to right: tier 3, tier 2, the two seniors in the middle, tier 2, tier 3
  const t1 = by(1), t2 = by(2), t3 = by(3);
  // team.json "order" sets left to right; without it: tier 3, tier 2, the seniors, tier 2, tier 3
  const row = T.order ? T.order.map((id) => m.find((x) => x.id === id)).filter(Boolean) : [t3[0], t2[0], t1[0], t1[1], t2[1], t3[1]].filter(Boolean).concat(m.filter((x) => x.tier > 3));
  $('#tmGrid').innerHTML = row.map((x) => `<figure class="tm t${Math.min(x.tier, 3)}" style="--o:${x.tier}"><div class="ph"><img src="assets/img/team/${x.id}.jpg" alt="${x.name}" loading="eager"></div><figcaption>${x.name}</figcaption></figure>`).join('') + '<i class="brk b1"></i><i class="brk b2"></i>';
}
async function journeyNext() {
  if (!J.on) return;
  const sec = state.section; if (!sec) return;
  if (state.idx < sec.items.length - 1) { select(state.idx + 1); return; }   // select() schedules the next step
  const list = journeySections(); const at = list.indexOf(sec); const nx = list[(at + 1) % list.length];
  while (state.busy) await wait(60);
  if (!J.on) return;
  if (at === list.length - 1) {                 // the show is over: say thank you, then start again with the music
    const e = (I18N.ui && I18N.ui.end) || { en: 'Thank you', bn: 'ধন্যবাদ', ar: 'شكراً' };
    $('#jtK').textContent = 'Bangladesh'; $('#jtEn').style.fontSize = 'clamp(30px,5vw,66px)'; $('#jtEn').textContent = e.en; $('#jtBn').textContent = e.bn; $('#jtAr').textContent = e.ar;
    document.body.classList.add('j-title'); await jwait(J_THANKS * 1000); if (!J.on) return;
    document.body.classList.remove('j-title'); document.body.classList.add('j-team'); await jwait(J_TEAM * 1000); if (!J.on) return;
    document.body.classList.remove('j-team'); await jwait(J_FADE * 1000); if (!J.on) return;
    setMusic(true, true); J.t0 = performance.now(); J.lead = 0;
  }
  if (await chapterCard(nx, () => { showGallery(nx.id, 0); layoutGallery(); })) scheduleJourney();
}
function updateJourneyCap() {
  const sec = state.section, it = sec.items[state.idx], tr = I18N.items[it.id] || {};
  $('#jSec').innerHTML = [sec.title, sec.titleBn, I18N.sections[sec.id] && I18N.sections[sec.id].ar].filter(Boolean).map((x) => `<bdi>${x}</bdi>`).join(' &nbsp;·&nbsp; ');
  $('#jNum').textContent = `${state.idx + 1} / ${sec.items.length}`;
  $('#jEn').textContent = it.title; $('#jEnS').textContent = tr.s || it.place || '';
  $('#jBn').textContent = tr.bn || ''; $('#jBnS').textContent = tr.sbn || '';
  $('#jAr').textContent = tr.ar || ''; $('#jArS').textContent = tr.sar || '';
  restartAnim($('#jCap'), 'j-swap');
}
async function stopJourney() {
  if (!J.on) return;
  J.on = false; J.paused = false; J.left = null; clearTimeout(J.timer); J.timer = null; state.lastInput = performance.now();
  setMusic(false);                              // closing the show stops the music
  exitFullscreen();
  while (state.busy) await wait(60);
  await transition(() => { document.body.classList.remove('journey', 'j-loading', 'j-showx', 'j-title', 'j-team', 'j-paused'); showHub(0); });
}
let xTimer = 0;
function flashClose() { document.body.classList.add('j-showx'); clearTimeout(xTimer); xTimer = setTimeout(() => document.body.classList.remove('j-showx'), 3500); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && J.on && !J.auto) stopJourney(); });

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
let down = null;
canvas.addEventListener('pointermove', (e) => { pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); });
const touches = new Map(); let pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, ly: e.clientY };
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
  if (state.mode !== 'map' || !touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {   // pinch zoom
    const [a, b] = [...touches.values()]; const dd = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0) mapZoomBy(dd / pinch0, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch0 = dd; if (down) down.x = -9999;
  } else if (down && mapView.tz > 1.01) {   // drag to move around when zoomed in
    mapPan(e.clientX - down.lx, e.clientY - down.ly); down.lx = e.clientX; down.ly = e.clientY;
  }
});
const dropTouch = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; };
window.addEventListener('pointerup', dropTouch); window.addEventListener('pointercancel', dropTouch);
canvas.addEventListener('dblclick', (e) => { if (state.mode === 'map') mapZoomBy(mapView.tz > 3 ? 0.25 : 2, e.clientX, e.clientY); });
// stop the browser's own page zoom, which only stretches the picture and makes it blurry
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
window.addEventListener('pointerup', (e) => {
  if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y, moved = Math.hypot(dx, dy); const d = down; down = null;
  if (state.busy || state.mode === 'gate') return;
  if (state.mode === 'gallery' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); return; }
  if (state.mode === 'hub' && Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) { setStop(hub.stop + (dy < 0 ? 1 : -1)); return; }
  if (J.on || moved > 8 || performance.now() - d.t > 600) return;
  const p = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  if (state.mode === 'hub') {
    const hits = raycaster.intersectObjects(hubClickables, false);
    if (hits.length) { hits[0].object.userData.action(); return; }
    if (tiger && hitRoot(tiger.root)) { openViewer('tiger'); return; }
    if (rickshaw && hitRoot(rickshaw.root)) { openViewer('rickshaw'); return; }
    if (mosque && hitRoot(mosque.root)) { openViewer('mosque'); return; }
    if (minar && hitRoot(minar.root)) { openViewer('minar'); return; }
    if (smriti && hitRoot(smriti.root)) { openViewer('smriti'); return; }
    if (parliament && hitRoot(parliament.root)) { openViewer('parliament'); return; }
  } else if (state.mode === 'map') {
    const hits = raycaster.intersectObjects(mapDivs.map((m) => m.mesh), false);
    selectDivision(hits.length ? (mapSel && mapSel.mesh === hits[0].object ? null : hits[0].object.userData.div.id) : null);
  } else if (state.mode === 'gallery') {
    const hits = raycaster.intersectObjects(panels.map((q) => q.mesh), false);
    if (hits.length) { const i = hits[0].object.userData.index; if (i === state.idx) toggleZoom(); else select(i); }
    else if (state.zoom) toggleZoom(false);
  }
});
function hitRoot(root) { const u = root.userData; const now = performance.now(); if (!u.box || now - u.boxT > 600) { u.box = new THREE.Box3().setFromObject(root).expandByScalar(0.15); u.boxT = now; } return raycaster.ray.intersectsBox(u.box); }
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return; state.lastInput = performance.now();
  const av = $('#anthemView').classList.contains('open');
  if (av) { if (e.key === 'Escape') closeAnthem(); return; }
  if (state.mode === 'hub' && !J.on && ['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); setStop(hub.stop + 1); return; }
  if (state.mode === 'hub' && !J.on && ['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); setStop(hub.stop - 1); return; }
  if (J.on && e.key === 'Enter') { e.preventDefault(); toggleJourneyPause(); return; }
  if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev();
  else if (e.key === 'Escape') { if (J.on) stopJourney(); else if ($('#modal').classList.contains('open')) closeModal(); else if ($('#chat').classList.contains('open')) guide.closeChat(); else if (state.zoom) toggleZoom(false); else if (state.cardOpen && state.mode === 'gallery') setCard(false); else goHome(); }
  else if (e.key.toLowerCase() === 'j') startJourney(false);
  else if (e.key.toLowerCase() === 'f') toggleFullscreen();
});
document.addEventListener('pointerdown', () => { state.lastInput = performance.now(); if (J.on) flashClose(); }, true);
// double click (mouse) or double tap (iPad) pauses and carries on the journey
document.addEventListener('dblclick', (e) => { if (!J.on || e.target.closest('#jClose')) return; e.preventDefault(); try { window.getSelection().removeAllRanges(); } catch (er) { /* nothing selected */ } toggleJourneyPause(); });
let lastTap = { t: 0, x: 0, y: 0 };
document.addEventListener('pointerup', (e) => {
  if (!J.on || e.pointerType === 'mouse' || e.target.closest('#jClose')) return;
  const now = performance.now();
  if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 45) { lastTap.t = 0; toggleJourneyPause(); }
  else lastTap = { t: now, x: e.clientX, y: e.clientY };
});
// mouse wheel or trackpad: one gesture moves the landing page one stop
window.addEventListener('wheel', (e) => {
  if (state.mode === 'map' && !e.target.closest('#card,#chat,#modal,#anthemView,#mapbar')) { mapZoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); return; }
  if (state.mode !== 'hub' || J.on || state.busy || e.target.closest('#chat,#modal,#anthemView')) return;
  const now = performance.now(); state.lastInput = now;
  if (now < hub.lock) { hub.acc = 0; return; }
  hub.acc += e.deltaY;
  if (Math.abs(hub.acc) > 40) { setStop(hub.stop + Math.sign(hub.acc)); hub.acc = 0; hub.lock = now + 800; }
}, { passive: true });

$('#homeBtn').onclick = goHome; $('#prevBtn').onclick = prev; $('#nextBtn').onclick = next;
$('#journeyBtn').onclick = () => startJourney(false); $('#jClose').onclick = stopJourney;
$('#musicBtn').onclick = () => setMusic(!musicOn);
$('#mapBtn').onclick = openMap; $('#mzIn').onclick = () => mapZoomBy(1.6); $('#mzOut').onclick = () => mapZoomBy(1 / 1.6); $('#mzReset').onclick = () => selectDivision(null); $('#anthemBtn').onclick = showAnthem; $('#factsBtn').onclick = showFacts; $('#fsBtn').onclick = toggleFullscreen;
$('#modalClose').onclick = closeModal; $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
$('#listenBtn').onclick = toggleListen; $('#readBtn').onclick = toggleListen;
$('#moreBtn').onclick = () => setCard(!state.cardOpen); $('#cardClose').onclick = () => setCard(false);
$('#askBtn').onclick = () => guide.openChat(state.mode === 'gallery' ? `Tell me more about ${state.section.items[state.idx].title}` : '');
$('#mascot').onclick = () => guide.openChat(); $('#bubbleAsk').onclick = () => guide.openChat();

/* ------------------------------------------------------------------ */
/* Resize + render loop                                                */
/* ------------------------------------------------------------------ */
function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  if (portals.length) layoutHub();
  if (state.mode === 'gallery' || state.mode === 'viewer' || state.mode === 'map') layoutGallery();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

const camLook = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  pointerSmooth.lerp(pointer, Math.min(1, dt * 3));
  const swayX = Math.sin(t * 0.35) * 0.35, swayY = Math.sin(t * 0.27 + 1) * 0.2;
  const px = pointerSmooth.x * 0.75 + swayX, py = pointerSmooth.y * 0.5 + swayY;

  if (tiger && tiger.root.parent) { tiger.speed = lerp(tiger.speed, tiger.targetSpeed, Math.min(1, dt * 3)); tiger.mixer.update(dt * tiger.speed); }

  if (state.mode === 'hub' || state.mode === 'gate') {
    // glide between the camera stops of the landing page
    hub.s = lerp(hub.s, state.mode === 'gate' ? 0 : hub.stop, Math.min(1, dt * 1.9));
    const ks = hub.keys; if (ks.length) {
      const i = Math.min(Math.floor(hub.s), ks.length - 2); let f = clamp(hub.s - i, 0, 1); f = f * f * (3 - 2 * f);
      camera.position.lerpVectors(ks[i].pos, ks[i + 1].pos, f); camLook.lerpVectors(ks[i].look, ks[i + 1].look, f);
      camera.position.x += px * 0.6; camera.position.y += py * 0.3; if (state.mode === 'gate') camera.position.z += 5;
      camera.lookAt(camLook);
    }
    raycaster.setFromCamera(pointer, camera);
    const hit = state.mode === 'hub' ? raycaster.intersectObjects(hubClickables, false)[0] : null;
    portals.forEach((p) => {
      p.hover = lerp(p.hover, hit && hit.object === p.face ? 1 : 0, Math.min(1, dt * 8));
      p.g.position.y = p.base.y + Math.sin(t * 0.8 + p.phase) * 0.12; p.g.scale.setScalar(1 + p.hover * 0.1);
    });
    if (mapBoard) mapBoard.position.y = hub.spot.board.y + Math.sin(t * 0.7) * 0.1;
    const overModel = state.mode === 'hub' && !hit && ((tiger && hitRoot(tiger.root)) || (rickshaw && hitRoot(rickshaw.root)) || (mosque && hitRoot(mosque.root)) || (minar && hitRoot(minar.root)) || (smriti && hitRoot(smriti.root)) || (parliament && hitRoot(parliament.root)));
    canvas.style.cursor = hit || overModel ? 'pointer' : '';
    if (rickshaw && rickshaw.root.parent === hubG) rickshaw.root.rotation.y = t * 0.35;
  } else if (state.mode === 'map') {
    const portrait = window.innerWidth / window.innerHeight < 1; const k = Math.min(1, dt * 4);
    mapView.zoom = lerp(mapView.zoom, mapView.tz, k); mapView.look.lerp(mapView.tlook, k);
    const base = portrait ? 21 : 12.6; mapView.dist = base / mapView.zoom; const sway = 1 / mapView.zoom;
    const dir = V3(0, 0.8, base).normalize();
    camera.position.copy(mapView.look).addScaledVector(dir, mapView.dist); camera.position.x += px * 0.5 * sway; camera.position.y += py * 0.3 * sway;
    camera.lookAt(mapView.look);
    mapBoard3.rotation.x = -0.6; mapBoard3.rotation.z = 0;
    raycaster.setFromCamera(pointer, camera);
    const h = raycaster.intersectObjects(mapDivs.map((m) => m.mesh), false)[0]; mapHover = h ? h.object : null;
    canvas.style.cursor = mapHover ? 'pointer' : '';
    mapDivs.forEach((m) => {
      const sel = m === mapSel, hov = m.mesh === mapHover; const target = sel ? 0.75 : hov ? 0.18 : 0;
      m.lift = lerp(m.lift, target, Math.min(1, dt * 6)); m.g.position.z = m.lift;
      const b = mapSel && !sel ? 0.38 : 1; m.top.color.setScalar(lerp(m.top.color.r, b, Math.min(1, dt * 5)));
      m.label.material.opacity = lerp(m.label.material.opacity, mapSel && !sel ? 0.35 : 1, Math.min(1, dt * 5));
      const ls = sel ? 1.35 : 1; m.label.scale.set(1.5 * ls, 0.59 * ls, 1);
    });
  } else if (state.mode === 'gallery') {
    state.cur = lerp(state.cur, state.idx, Math.min(1, dt * (J.on ? 2.2 : 4.5))); const n = panels.length;
    panels.forEach((p, i) => {
      let o = i - state.cur; if (n > 6) { while (o > n / 2) o -= n; while (o < -n / 2) o += n; }
      const vis = Math.abs(o) < 3.3; p.g.visible = vis; if (!vis) return;
      if (Math.abs(o) < 2.6) ensureFull(p);
      const a = o * galLayout.spacing, focus = clamp(1 - Math.abs(o), 0, 1);
      p.g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R + (1 - focus) * -0.6); p.g.rotation.y = -a;
      p.mat.uniforms.uDim.value = 0.3 + 0.7 * focus; p.mat.uniforms.uStr.value = SETTINGS.depthStrength * focus;
      p.frame.material.color.setScalar(0.25 + 0.72 * focus); p.back.material.opacity = 0.1 + 0.4 * focus;
    });
    // during the journey the camera drifts slowly towards the photo
    const push = J.on ? -0.4 * clamp(((J.paused ? J.pausedAt : performance.now()) - J.started) / ((J.dur || 5) * 1000), 0, 1) : 0;
    const zc = state.zoom ? -2.0 : push;
    camera.position.x = lerp(camera.position.x, px * 0.6, 0.1); camera.position.y = lerp(camera.position.y, py * 0.35, 0.1); camera.position.z = lerp(camera.position.z, zc, 0.06);
    camera.lookAt(camera.position.x * 0.25, camera.position.y * 0.25, -R);
    galFloor.material.color.set(state.section.color);
  } else if (state.mode === 'viewer') {
    controls.update();
  }

  flies.position.copy(camera.position); flies.rotation.y = t * 0.02; flies.position.y += Math.sin(t * 0.4) * 0.3;
  if (letters) {
    letters.position.set(camera.position.x, camera.position.y - 2, camera.position.z); const u = letters.material.uniforms; u.uTime.value = t;
    u.uScale.value = window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    // letters stay behind the photos, models and map so they never cover them
    u.uMinDist.value = state.mode === 'gallery' ? R + 1.5 : state.mode === 'viewer' ? 9 : state.mode === 'map' ? mapView.dist + 2 : 3;
  }
  sky.position.copy(camera.position); skyU.uTime.value = t; skyU.uCam.value.copy(camera.position);
  tickMusic(dt);

  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight); renderer.clear(); renderer.render(scene, camera);

  if (SETTINGS.idleTourSeconds && !J.on && state.mode !== 'gate' && !state.busy && performance.now() - state.lastInput > SETTINGS.idleTourSeconds * 1000 && !$('#chat').classList.contains('open') && anthem.paused && !$('#anthemView').classList.contains('open') && !guide.isSpeaking()) startJourney(true);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
async function boot() {
  resize(); requestAnimationFrame(frame);
  DATA = await (await fetch('data/content.json')).json(); SECTIONS = DATA.sections;
  try { I18N = await (await fetch('data/i18n.json')).json(); } catch (e) { console.warn('translations missing', e); }
  setProgress('content', 1);
  $('#gateTag').textContent = DATA.site.tagline;
  if (I18N.ui && I18N.ui.loading) { $('#jLoadEn').textContent = I18N.ui.loading.en; $('#jLoadBn').textContent = I18N.ui.loading.bn; $('#jLoadAr').textContent = I18N.ui.loading.ar; }
  guide.setData(DATA, I18N);
  try { await Promise.all([document.fonts.load('700 40px "Playfair Display"'), document.fonts.load('600 40px "Hind Siliguri"', 'বাংলা'), document.fonts.load('700 30px "Cairo"', 'بنغلاديش')]); } catch (e) { /* fall back to system fonts */ }
  setProgress('fonts', 1);
  try { buildLetterRain(); } catch (e) { console.warn('letters off', e); }
  const nav = $('#hubnav');
  SECTIONS.forEach((s) => { const b = document.createElement('button'); b.style.setProperty('--c', s.color); b.innerHTML = `<i></i>${s.title}`; b.onclick = () => openSection(s.id); nav.appendChild(b); });
  { const b = document.createElement('button'); b.style.setProperty('--c', '#2aa7b8'); b.innerHTML = '<i></i>Map'; b.onclick = openMap; nav.appendChild(b); }
  // landing page: dots on the right and the buttons inside each stop
  const stops = [...document.querySelectorAll('.stop')];
  stops.forEach((el, i) => { const b = document.createElement('button'); b.title = (el.querySelector('h2,h1 .en') || {}).textContent || ''; b.onclick = () => setStop(i); $('#dots').appendChild(b); });
  document.querySelectorAll('.go-next').forEach((b) => (b.onclick = () => setStop(hub.stop + 1)));
  document.querySelectorAll('.go-view').forEach((b) => (b.onclick = () => openViewer(b.dataset.view)));
  document.querySelectorAll('.go-map').forEach((b) => (b.onclick = openMap));
  buildHub();
  const [tg, rg, mg, ng, sg, pg] = await Promise.all([
    loadGLB('assets/models/tiger.glb', 'tiger').catch((e) => { console.warn('tiger model failed', e); setProgress('tiger', 1); return null; }),
    loadGLB('assets/models/rickshaw.glb', 'rickshaw').catch((e) => { console.warn('rickshaw model failed', e); setProgress('rickshaw', 1); return null; }),
    loadGLB('assets/models/mosque.glb', 'mosque').catch((e) => { console.warn('mosque model failed', e); setProgress('mosque', 1); return null; }),
    loadGLB('assets/models/minar.glb', 'minar').catch((e) => { console.warn('minar model failed', e); setProgress('minar', 1); return null; }),
    loadGLB('assets/models/smriti.glb', 'smriti').catch((e) => { console.warn('smriti model failed', e); setProgress('smriti', 1); return null; }),
    loadGLB('assets/models/parliament.glb', 'parliament').catch((e) => { console.warn('parliament model failed', e); setProgress('parliament', 1); return null; })
  ]);
  if (ng) minar = setupMinar(ng);
  if (sg) smriti = setupSmriti(sg);
  if (pg) parliament = setupParliament(pg);
  buildTeam();
  if (mg) mosque = setupMosque(mg);
  if (tg) tiger = setupTiger(tg);
  if (rg) rickshaw = setupRickshaw(rg);
  layoutHub(); placeModels('hub');
  renderer.compile(scene, camera);
  const btn = $('#enterBtn'); btn.disabled = false; btn.textContent = 'Enter Bangladesh';
  btn.onclick = () => { guide.unlockVoice(); state.lastInput = performance.now(); showHub(0); };   // music stays off until the visitor turns it on
  window.__ready = true;
}
window.__app = { state, hub, setStop, mapView, mapZoomBy, showPlace, journeyPlan, toggleJourneyPause, openSection, openViewer, openMap, selectDivision, showAnthem, goHome, select, startJourney, stopJourney, guide, toggleZoom, setCard, music: () => ({ on: musicOn, paused: bgm.paused, t: bgm.currentTime }) };
boot().catch((e) => { console.error(e); $('#enterBtn').textContent = 'Could not load. Please run the site through the local server.'; });
