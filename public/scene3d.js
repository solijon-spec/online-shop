// MobilePlus — 3D sahnalar (Three.js). Barcha modellar kod bilan yasalgan, tashqi fayl kerak emas.
// window.MP3D.mountHero(el)          — bosh sahifadagi interaktiv 3D kompozitsiya
// window.MP3D.mountBuilder(el)       — PC konfiguratorda tanlangan qismlar 3D korpusda paydo bo'ladi
// window.MP3D.mountProduct(el, kind) — mahsulot sahifasidagi 3D ko'rinish
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
const RED = 0xe3262f;
const ORANGE = 0xff6a2b;
// Brend yorug'ligi: qizil ↔ to'q sariq orasida sokin "nafas oladi"
const GLOW_A = new THREE.Color(0xff2a36);
const GLOW_B = new THREE.Color(0xff7a3d);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => innerWidth < 760;
const TAU = Math.PI * 2;
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// ---------- Sahna (renderer, kamera, chiroqlar, sikl) ----------
function makeStage(el, { cameraZ = 10, lookY = 0.2, cameraY = 1.6, fitAspect = 0.9 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x1a0808, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  key.shadow.radius = 4;
  scene.add(key);
  const rimRed = new THREE.PointLight(RED, 60, 20);
  rimRed.position.set(-4, 2, -2);
  const rimOrange = new THREE.PointLight(ORANGE, 45, 20);
  rimOrange.position.set(4, 1, -3);
  const front = new THREE.PointLight(0xffe2d0, 10, 15);
  front.position.set(0, 2, 6);
  scene.add(rimRed, rimOrange, front);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.ShadowMaterial({ opacity: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.25;
  floor.receiveShadow = true;
  scene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.7, 2.8, 128),
    new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.24;
  scene.add(ring);

  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Tor joyda kamera uzoqlashadi — modellar kesilib qolmaydi
    const k = Math.max(1, fitAspect / camera.aspect);
    camera.position.set(0, cameraY, cameraZ * k);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(el);

  const updaters = [];
  const clock = new THREE.Clock();
  let raf = 0;
  let t = 0;
  // Kuchsiz qurilmada sifat avtomatik pasayadi (soya o'chadi, piksel zichligi kamayadi)
  let frames = 0, sampleTime = 0, lowQuality = false;
  const loop = () => {
    if (!renderer.domElement.isConnected) return dispose();
    raf = requestAnimationFrame(loop);
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.1) * (reducedMotion ? 0.25 : 1);
    if (!visible || document.hidden) return;
    if (!lowQuality && frames < 90) {
      frames++; sampleTime += raw;
      if (sampleTime > 1.5 && frames / sampleTime < 28) {
        lowQuality = true;
        key.castShadow = false;
        renderer.setPixelRatio(1);
        resize();
      }
    }
    t += dt;
    updaters.forEach((f) => f(t, dt));
    ring.material.opacity = 0.28 + Math.sin(t * 1.2) * 0.1;
    renderer.render(scene, camera);
  };
  function dispose() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    scene.traverse((o) => {
      o.geometry?.dispose();
      [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
    renderer.dispose();
  }
  loop();
  return { scene, camera, renderer, updaters, ring, el };
}

// Sichqoncha / barmoq: hover — og'ish, drag — aylantirish, bosish — onTap.
// Hodisalar canvas'ga ulanadi — canvas o'chirilsa, ular ham birga yo'qoladi.
function makePointer(stage) {
  const el = stage.renderer.domElement;
  const p = { x: 0, y: 0, spin: 0, dragging: false, onTap: null, onHover: null };
  let lastX = 0, downX = 0, downY = 0, lastHover = 0;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    p.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    p.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (p.dragging) { p.spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; }
    else if (p.onHover && performance.now() - lastHover > 80) { lastHover = performance.now(); p.onHover(e); }
  });
  el.addEventListener('pointerleave', () => { if (!p.dragging) { p.x = 0; p.y = 0; } });
  el.addEventListener('pointerdown', (e) => {
    p.dragging = true; lastX = downX = e.clientX; downY = e.clientY;
    el.classList.add('grabbing');
    try { el.setPointerCapture(e.pointerId); } catch {}
  });
  const end = (e) => {
    if (p.dragging && p.onTap && e.type === 'pointerup' && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) p.onTap(e);
    p.dragging = false;
    el.classList.remove('grabbing');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return p;
}

// Bosilgan nuqtadagi obyektni topish
const raycaster = new THREE.Raycaster();
function pick(stage, e, targets) {
  const r = stage.el.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera);
  const hit = raycaster.intersectObjects(targets.map((t) => t.obj), true)[0];
  if (!hit) return null;
  const target = targets.find((t) => { for (let o = hit.object; o; o = o.parent) if (o === t.obj) return true; return false; });
  return target ? { ...target, point: hit.point } : null;
}

// ---------- Materiallar va RGB yoritish ----------
function makeKit() {
  const rgb = [];
  const spinners = [];
  let time = 0;
  const tmp = new THREE.Color();
  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0x1b1e26, metalness: 0.45, roughness: 0.38 }),
    body2: new THREE.MeshStandardMaterial({ color: 0x262a33, metalness: 0.35, roughness: 0.5 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.2, roughness: 0.18 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe9ebf0, metalness: 0.05, roughness: 0.35 }),
    key: new THREE.MeshStandardMaterial({ color: 0x1c1f27, roughness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xb8c6e6, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.13, depthWrite: false }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x101a17, roughness: 0.7 }),
    fins: new THREE.MeshStandardMaterial({ color: 0xa5adbb, metalness: 0.55, roughness: 0.3 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.7, roughness: 0.22 }),
    mesh: new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.85 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.4, transparent: true, opacity: 0.92 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.1, metalness: 0.3 }),
  };
  const kit = {
    M, spinners,
    boost: 0, // bosilganda 1 bo'ladi: ventilyatorlar tezlashadi, chiroqlar yorqinlashadi
    get time() { return time; },
    glow(offset = 0, intensity = 1.6) {
      const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: GLOW_A, emissiveIntensity: intensity, roughness: 0.4 });
      rgb.push({ m, offset, base: intensity, prop: 'emissive' });
      return m;
    },
    halo(offset = 0, opacity = 0.2) {
      const m = new THREE.MeshBasicMaterial({ color: GLOW_A, transparent: true, opacity: opacity * 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      rgb.push({ m, offset, base: opacity * 0.6, prop: 'color' });
      return m;
    },
    update(dt) {
      kit.boost = Math.max(0, kit.boost - dt * 0.5);
      time += dt * (1 + kit.boost * 3);
      for (const r of rgb) {
        const k = 0.5 + 0.5 * Math.sin(time * 0.9 + r.offset * TAU);
        r.m[r.prop].copy(tmp.copy(GLOW_A).lerp(GLOW_B, k));
        const pulse = (0.82 + 0.18 * k) * (1 + kit.boost * 0.9);
        if (r.prop === 'emissive') r.m.emissiveIntensity = r.base * pulse;
        else r.m.opacity = r.base * pulse;
      }
      for (const s of spinners) s.rotation.z -= dt * (5 + kit.boost * 30);
    },
  };
  return kit;
}

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const rbox = (w, h, d, r, mat) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
const shadows = (g) => { g.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; }); return g; };

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- Modellar ----------
function fan(kit, radius, offset) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.09, 12, 48), kit.glow(offset)));
  g.add(new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 1.3, 48), kit.halo(offset, 0.18)));
  const spin = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.24, radius * 0.24, radius * 0.16, 20), kit.M.body);
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);
  for (let i = 0; i < 7; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 7) * TAU;
    const blade = box(radius * 0.72, radius * 0.3, radius * 0.03, kit.M.blade);
    blade.position.x = radius * 0.52;
    blade.rotation.x = 0.45;
    pivot.add(blade);
    spin.add(pivot);
  }
  g.add(spin);
  kit.spinners.push(spin);
  return g;
}

function pc(kit) {
  const g = new THREE.Group();
  const parts = {};
  const part = (name) => { const p = new THREE.Group(); parts[name] = p; g.add(p); return p; };
  const L = 2.4, H = 2.7, W = 1.3;
  const back = -W / 2;
  const add = (grp, mesh, x, y, z) => { mesh.position.set(x, y, z); grp.add(mesh); return mesh; };

  // Korpus
  const cs = part('case');
  add(cs, box(L, H, 0.05, kit.M.body), 0, 0, back);
  add(cs, box(L, 0.06, W, kit.M.body), 0, H / 2, 0);
  add(cs, box(L, 0.06, W, kit.M.body), 0, -H / 2, 0);
  add(cs, box(0.06, H, W, kit.M.body), -L / 2, 0, 0);
  add(cs, box(0.06, H, W, kit.M.mesh), L / 2, 0, 0);
  add(cs, box(L, H, 0.02, kit.M.glass), 0, 0, W / 2);
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) add(cs, box(0.22, 0.08, 0.16, kit.M.gloss), x * (L / 2 - 0.2), -H / 2 - 0.07, z * (W / 2 - 0.15));
  add(cs, box(L - 0.1, 0.03, 0.03, kit.glow(0.2, 3)), 0, H / 2 - 0.07, W / 2 - 0.05);
  add(cs, box(0.03, H - 0.1, 0.03, kit.glow(0.35, 3)), L / 2 - 0.06, 0, W / 2 - 0.05);
  for (let i = 0; i < 3; i++) {
    const f = fan(kit, 0.36, i * 0.12);
    f.rotation.y = Math.PI / 2;
    add(cs, f, L / 2 - 0.09, 0.85 - i * 0.82, 0);
  }
  const rear = fan(kit, 0.3, 0.5);
  rear.rotation.y = -Math.PI / 2;
  add(cs, rear, -L / 2 + 0.09, 0.8, 0);

  // Ona plata
  const mb = part('motherboard');
  add(mb, box(1.75, 2.05, 0.04, kit.M.pcb), -0.2, 0.25, back + 0.06);
  add(mb, box(0.18, 1.2, 0.12, kit.M.chrome), -0.98, 0.55, back + 0.12);
  add(mb, box(0.7, 0.16, 0.1, kit.M.chrome), -0.5, 1.17, back + 0.12);
  add(mb, box(0.5, 0.03, 0.02, kit.glow(0.6, 2)), -0.3, -0.75, back + 0.1);

  // Protsessor
  const cpu = part('cpu');
  add(cpu, box(0.34, 0.34, 0.05, kit.M.chrome), -0.3, 0.6, back + 0.11);

  // Sovutish
  const cl = part('cooler');
  add(cl, box(0.5, 0.56, 0.44, kit.M.fins), -0.3, 0.6, back + 0.37);
  add(cl, box(0.52, 0.04, 0.46, kit.glow(0.15, 3)), -0.3, 0.9, back + 0.37);
  const cf = fan(kit, 0.25, 0.4);
  cf.rotation.y = Math.PI / 2;
  add(cl, cf, -0.03, 0.6, back + 0.37);

  // Operativ xotira
  const ram = part('ram');
  for (let i = 0; i < 4; i++) {
    add(ram, box(0.05, 0.62, 0.22, kit.M.body2), 0.18 + i * 0.09, 0.55, back + 0.17);
    add(ram, box(0.052, 0.05, 0.22, kit.glow(i * 0.08, 3)), 0.18 + i * 0.09, 0.88, back + 0.17);
  }

  // Videokarta
  const gpu = part('gpu');
  add(gpu, box(1.6, 0.24, 0.56, kit.M.body2), -0.12, -0.35, back + 0.38);
  add(gpu, box(1.6, 0.04, 0.56, kit.M.chrome), -0.12, -0.21, back + 0.38);
  add(gpu, box(1.2, 0.04, 0.02, kit.glow(0.7, 3)), -0.12, -0.35, back + 0.67);
  add(gpu, box(0.25, 0.08, 0.02, kit.glow(0.75, 3)), 0.5, -0.33, back + 0.67);

  // SSD
  const ssd = part('ssd');
  add(ssd, box(0.5, 0.12, 0.025, kit.M.chrome), -0.3, 0.02, back + 0.1);
  add(ssd, box(0.05, 0.05, 0.03, kit.glow(0.9, 4)), -0.08, 0.02, back + 0.12);

  // Blok pitaniya
  const psu = part('psu');
  add(psu, box(0.9, 0.52, 1.0, kit.M.body2), -L / 2 + 0.56, -H / 2 + 0.33, -0.05);
  add(psu, box(0.6, 0.03, 0.02, kit.glow(0.05, 3)), -L / 2 + 0.56, -H / 2 + 0.33, 0.46);

  shadows(g);
  g.userData.parts = parts;
  return g;
}

function keyboard(kit) {
  const g = new THREE.Group();
  g.add(rbox(3.0, 0.14, 1.05, 0.05, kit.M.body));
  const rows = 5, cols = 15, s = 0.17, gap = 0.025, n = rows * cols;
  const caps = new THREE.InstancedMesh(new RoundedBoxGeometry(s, 0.09, s, 2, 0.02), kit.M.key, n);
  const glows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(s * 1.18, s * 1.18),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    n,
  );
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const pos = [];
  for (let r = 0, i = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, i++) {
      const x = (c - (cols - 1) / 2) * (s + gap);
      const z = (r - (rows - 1) / 2) * (s + gap);
      pos.push([x, z]);
      caps.setMatrixAt(i, m4.makeTranslation(x, 0.12, z));
      glows.setMatrixAt(i, m4.makeRotationX(-Math.PI / 2).setPosition(x, 0.076, z));
      glows.setColorAt(i, col.setHSL(0, 1, 0.5));
    }
  }
  g.add(caps, glows);
  shadows(g);
  // Bosilgan joydan oq to'lqin tarqaladi
  let ripple = null;
  const update = (dt, time) => {
    if (ripple) { ripple.r += dt * 3.2; if (ripple.r > 4) ripple = null; }
    for (let i = 0; i < n; i++) {
      const wave = 0.5 + 0.5 * Math.sin(pos[i][0] * 1.6 - time * 1.4);
      let light = 0.2 + wave * 0.16;
      let sat = 0.85;
      if (ripple) {
        const d = Math.hypot(pos[i][0] - ripple.x, pos[i][1] - ripple.z);
        const r = Math.max(0, 1 - Math.abs(d - ripple.r) * 5);
        light += r * 0.5; sat -= r * 0.6;
      }
      glows.setColorAt(i, col.setHSL(0.015 + wave * 0.035, sat, light));
    }
    glows.instanceColor.needsUpdate = true;
  };
  const tap = (worldPoint) => {
    const local = g.worldToLocal(worldPoint.clone());
    ripple = { x: local.x, z: local.z, r: 0 };
  };
  return { g, update, tap };
}

function mouse(kit) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), kit.M.gloss);
  body.scale.set(0.32, 0.17, 0.52);
  const strip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 8, 80), kit.glow(0.3, 3));
  strip.scale.set(0.33, 0.535, 1);
  strip.rotation.x = Math.PI / 2;
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 20), kit.glow(0.5, 3));
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(0, 0.15, -0.26);
  g.add(body, strip, wheel);
  return shadows(g);
}

function headset(kit) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 16, 48, Math.PI), kit.M.body));
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 36), kit.M.body2);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(s * 0.62, -0.06, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.03, 10, 40), kit.glow(s > 0 ? 0.1 : 0.6, 3));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(s * 0.73, -0.06, 0);
    g.add(cup, ring);
  }
  return shadows(g);
}

function monitor(kit) {
  const g = new THREE.Group();
  const tex = canvasTexture(1024, 576, drawLogoScreen);
  // Inter shrifti yuklangach logotip qayta chiziladi
  document.fonts?.ready.then(() => { drawLogoScreen(tex.image.getContext('2d'), 1024, 576); tex.needsUpdate = true; });
  const panel = rbox(2.7, 1.6, 0.1, 0.04, kit.M.body);
  panel.position.y = 1.05;
  g.add(panel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 1.44), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 1.05, 0.052);
  const neck = box(0.14, 0.75, 0.12, kit.M.chrome);
  neck.position.set(0, 0.35, -0.12);
  const base = rbox(1.0, 0.06, 0.55, 0.025, kit.M.chrome);
  base.position.set(0, 0, -0.05);
  const strip = box(2.4, 0.02, 0.02, kit.glow(0.4, 1.4));
  strip.position.set(0, 0.255, 0.04);
  g.add(screen, neck, base, strip);
  return shadows(g);
}

// Monitor ekrani: qorong'i fon, markazda iOS uslubidagi "M+" belgisi va MOBILE PLUS yozuvi
function drawLogoScreen(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0d0f15'); bg.addColorStop(1, '#14090c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, h * 0.6);
  glow.addColorStop(0, 'rgba(227,38,47,.28)'); glow.addColorStop(1, 'rgba(227,38,47,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  const s = 150, x = w / 2 - s / 2, y = h * 0.42 - s / 2 - 30, r = s * 0.2237;
  const round = () => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + s, y, x + s, y + s, r); ctx.arcTo(x + s, y + s, x, y + s, r); ctx.arcTo(x, y + s, x, y, r); ctx.arcTo(x, y, x + s, y, r); ctx.closePath(); };
  const tile = ctx.createLinearGradient(0, y, 0, y + s);
  tile.addColorStop(0, '#f04a30'); tile.addColorStop(1, '#c00016');
  ctx.save(); ctx.shadowColor = 'rgba(227,38,47,.55)'; ctx.shadowBlur = 40; round(); ctx.fillStyle = tile; ctx.fill(); ctx.restore();
  const gloss = ctx.createLinearGradient(0, y, 0, y + s * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,.35)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
  round(); ctx.fillStyle = gloss; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 92px Inter, Arial, sans-serif'; ctx.fillText('M', w / 2 - 6, y + s / 2 + 4);
  ctx.font = '800 44px Inter, Arial, sans-serif'; ctx.fillText('+', w / 2 + 42, y + s / 2 - 26);
  ctx.font = '800 64px Inter, Arial, sans-serif';
  const a = 'MOBILE ', b = 'PLUS';
  const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
  const tx = w / 2 - (wa + wb) / 2, ty = y + s + 70;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff'; ctx.fillText(a, tx, ty);
  ctx.fillStyle = '#ff3b3b'; ctx.fillText(b, tx + wa, ty);
  ctx.textAlign = 'center';
  ctx.font = '500 26px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillText('Kompyuter texnikasi va aksessuarlar', w / 2, ty + 56);
}

function watch(kit) {
  const g = new THREE.Group();
  const tex = canvasTexture(256, 300, (ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#ff6a2b'); grad.addColorStop(1, '#e3262f');
    ctx.strokeStyle = grad; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(w / 2, 175, 82, -Math.PI / 2, Math.PI * 1.1); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 54px Inter, Arial'; ctx.textAlign = 'center';
    ctx.fillText('12:45', w / 2, 80);
    ctx.font = '600 30px Inter, Arial'; ctx.fillStyle = '#9fe870'; ctx.fillText('♥ 72', w / 2, 188);
  });
  g.add(rbox(0.9, 1.05, 0.26, 0.16, kit.M.gloss));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.88), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.z = 0.135;
  const bandTop = rbox(0.62, 0.9, 0.08, 0.04, kit.M.body2);
  bandTop.position.set(0, 0.92, -0.05);
  bandTop.rotation.x = -0.25;
  const bandBot = bandTop.clone();
  bandBot.position.set(0, -0.92, -0.05);
  bandBot.rotation.x = 0.25;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 20), kit.glow(0.1, 3));
  crown.rotation.z = Math.PI / 2;
  crown.position.set(0.49, 0.2, 0);
  g.add(screen, bandTop, bandBot, crown);
  g.position.y = 0.9;
  return shadows(g);
}

function cameraModel(kit) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.35, 48), kit.M.white);
  base.position.y = 0.17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 48, 32), kit.M.white);
  head.position.y = 1.0;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.71, 48, 32, -0.9, 1.8, 0.9, 1.0), kit.M.black);
  visor.position.y = 1.0;
  visor.rotation.y = Math.PI / 2;
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 48), kit.glow(0.55, 3));
  lensRing.position.set(0, 1.0, 0.68);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.17, 40), new THREE.MeshStandardMaterial({ color: 0x0a1630, metalness: 0.9, roughness: 0.05 }));
  lens.position.set(0, 1.0, 0.69);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), kit.glow(0, 5));
  led.position.set(0.32, 1.28, 0.6);
  g.add(base, head, visor, lensRing, lens, led);
  return shadows(g);
}

function charger(kit) {
  const g = new THREE.Group();
  const brick = rbox(0.8, 0.8, 0.8, 0.12, kit.M.white);
  brick.position.y = 0.4;
  for (const x of [-0.14, 0.14]) {
    const prong = box(0.05, 0.35, 0.12, kit.M.chrome);
    prong.position.set(x, 0.4, -0.55);
    prong.rotation.x = Math.PI / 2;
    g.add(prong);
  }
  const port = rbox(0.28, 0.1, 0.04, 0.04, kit.glow(0.3, 3));
  port.position.set(0, 0.45, 0.405);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.45, 0.45), new THREE.Vector3(0, 0.4, 0.9), new THREE.Vector3(0.5, 0.05, 1.2),
    new THREE.Vector3(1.2, 0.05, 0.9), new THREE.Vector3(1.4, 0.05, 0.2),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.035, 10), kit.M.white);
  const plug = rbox(0.12, 0.08, 0.3, 0.03, kit.glow(0.6, 2));
  plug.position.set(1.4, 0.05, 0.05);
  g.add(brick, port, cable, plug);
  return shadows(g);
}

const MODELS = { pc, monitor, watch, camera: cameraModel, charger, mouse, headset };

// Modelni kerakli o'lchamga keltirib, polga qo'yish
function fit(obj, size = 2.6, floorY = -1.2) {
  const b = new THREE.Box3().setFromObject(obj);
  const s = b.getSize(new THREE.Vector3());
  const k = size / Math.max(s.x, s.y, s.z);
  obj.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y += floorY - b2.min.y;
  return obj;
}

function sparks(count = 160) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, r = 1.5 + Math.random() * 2.5;
    pos.set([Math.cos(a) * r, -1.2 + Math.random() * 4.5, Math.sin(a) * r - 0.5], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: ORANGE, size: 0.035, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  const update = (dt, boost) => {
    const speed = 1 + boost * 6;
    mat.size = 0.035 + boost * 0.03;
    for (let i = 0; i < count; i++) {
      let y = pos[i * 3 + 1] + dt * (0.25 + (i % 7) * 0.05) * speed;
      if (y > 3.3) y = -1.2;
      pos[i * 3 + 1] = y;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { pts, update };
}

// ---------- Bosh sahifa ----------
function mountHero(el) {
  if (!el || !el.isConnected || el.dataset.mounted || !webglOK()) return false;
  el.dataset.mounted = '1';
  const small = isSmall();
  const st = makeStage(el, small ? { cameraZ: 10.5, lookY: 0.1, fitAspect: 1.05 } : { cameraZ: 10, lookY: 0.3, fitAspect: 1.05 });
  const kit = makeKit();
  const pointer = makePointer(st);
  const world = new THREE.Group();
  st.scene.add(world);

  const mon = monitor(kit);
  mon.position.set(-1.05, -1.22, -0.25);
  mon.rotation.y = 0.12;
  const pcG = pc(kit);
  pcG.position.set(1.75, 0, -0.75);
  pcG.rotation.y = -0.5;
  pcG.scale.setScalar(0.85);
  const kb = keyboard(kit);
  kb.g.position.set(-1.0, -1.17, 1.15);
  kb.g.scale.setScalar(0.82);
  kb.g.rotation.y = 0.06;
  const ms = mouse(kit);
  ms.position.set(0.95, -1.08, 1.25);
  ms.scale.setScalar(0.9);
  ms.rotation.y = -0.25;
  const hs = headset(kit);
  hs.position.set(-2.85, 0.75, 0.45);
  hs.scale.setScalar(0.78);
  hs.rotation.set(0.2, 0.6, 0.25);
  const sp = sparks(90);
  world.add(mon, pcG, kb.g, ms, hs, sp.pts);
  world.position.x = 0.2;

  // Bosilganda har bir obyektning o'z effekti bor
  const fx = { msJump: 0, hsSpin: 0, hsSpinTarget: 0 };
  const targets = [
    { obj: pcG, name: 'pc' }, { obj: mon, name: 'monitor' }, { obj: kb.g, name: 'kb' }, { obj: ms, name: 'mouse' }, { obj: hs, name: 'headset' },
  ];
  pointer.onHover = (e) => { st.renderer.domElement.style.cursor = pick(st, e, targets) ? 'pointer' : ''; };
  pointer.onTap = (e) => {
    const hit = pick(st, e, targets);
    if (!hit) return;
    if (hit.name === 'pc' || hit.name === 'monitor') kit.boost = 1;
    if (hit.name === 'kb') kb.tap(hit.point);
    if (hit.name === 'mouse') fx.msJump = 1;
    if (hit.name === 'headset') fx.hsSpinTarget += TAU;
    el.dispatchEvent(new CustomEvent('mp3d-tap', { bubbles: true, detail: hit.name }));
  };

  world.scale.setScalar(0.01);
  st.updaters.push((t, dt) => {
    kit.update(dt);
    kb.update(dt, kit.time);
    sp.update(dt, kit.boost);
    const intro = ease(t / 1.1);
    world.scale.setScalar(0.01 + 0.99 * intro);
    // Sahifa pastga aylantirilsa sahna buriladi va ko'tariladi
    const r = el.getBoundingClientRect();
    const scroll = Math.min(1, Math.max(0, -r.top / r.height));
    const targetY = Math.sin(t * 0.25) * 0.18 + pointer.spin + pointer.x * 0.35 + (1 - intro) * -1.5 + scroll * 1.6;
    world.rotation.y += (targetY - world.rotation.y) * 0.06;
    world.rotation.x += (pointer.y * 0.08 + scroll * 0.25 - world.rotation.x) * 0.06;
    world.position.y = scroll * 0.6;
    pcG.position.y = kit.boost * Math.sin(t * 60) * 0.012;
    fx.hsSpin += (fx.hsSpinTarget - fx.hsSpin) * 0.08;
    hs.position.y = 0.75 + Math.sin(t * 1.2) * 0.1;
    hs.rotation.set(0.2, 0.6 + fx.hsSpin, 0.25 + Math.sin(t * 0.9) * 0.08);
    fx.msJump = Math.max(0, fx.msJump - dt * 1.4);
    const j = Math.sin((1 - fx.msJump) * Math.PI) * (fx.msJump > 0 ? 1 : 0);
    ms.position.y = -1.08 + j * 0.6;
    ms.rotation.y = -0.25 + (1 - fx.msJump) * (fx.msJump > 0 ? TAU : 0);
  });
  el.classList.add('ready');
  return true;
}

// ---------- PC konfigurator ----------
function mountBuilder(el) {
  if (!el || !el.isConnected || !webglOK()) return null;
  const st = makeStage(el, { cameraZ: 6.6, cameraY: 1.3, lookY: 0.1 });
  st.ring.scale.setScalar(0.75);
  const kit = makeKit();
  const pointer = makePointer(st);
  const pcG = pc(kit);
  pcG.position.y = 0.15;
  st.scene.add(pcG);
  const parts = pcG.userData.parts;
  const ghost = new THREE.MeshBasicMaterial({ color: 0x5a6a8a, wireframe: true, transparent: true, opacity: 0.22 });
  pcG.traverse((o) => { if (o.isMesh) o.userData.mat = o.material; });
  const drops = {};
  pointer.onTap = () => { kit.boost = 1; };

  const set = (names) => {
    let all = true;
    for (const [name, grp] of Object.entries(parts)) {
      const on = names.has(name);
      if (!on) all = false;
      if (grp.userData.on === on) continue;
      grp.userData.on = on;
      grp.traverse((o) => { if (o.isMesh) o.material = on ? o.userData.mat : ghost; });
      if (on) drops[name] = 0;
      else { delete drops[name]; grp.position.y = 0; }
    }
    // Hamma qism tanlansa — kompyuter "yonadi"
    if (all) kit.boost = 1;
  };
  set(new Set());

  st.updaters.push((t, dt) => {
    kit.update(dt);
    const target = -0.6 + Math.sin(t * 0.3) * 0.35 + pointer.spin + pointer.x * 0.3;
    pcG.rotation.y += (target - pcG.rotation.y) * 0.06;
    pcG.rotation.x += (pointer.y * 0.06 - pcG.rotation.x) * 0.06;
    // Tanlangan qism yuqoridan tushib "o'rnatiladi"
    for (const name of Object.keys(drops)) {
      drops[name] = Math.min(1, drops[name] + dt * 1.6);
      const k = drops[name];
      const bounce = 1 - Math.pow(1 - k, 3) * Math.cos(k * Math.PI * 1.5);
      parts[name].position.y = (1 - bounce) * 1.2;
      if (k >= 1) { parts[name].position.y = 0; delete drops[name]; }
    }
  });
  el.classList.add('ready');
  return { set };
}

// ---------- Mahsulot sahifasi ----------
function mountProduct(el, kind) {
  if (!el || !el.isConnected || !webglOK()) return false;
  const st = makeStage(el, { cameraZ: 7, cameraY: 1.2, lookY: 0.05 });
  st.ring.scale.setScalar(0.7);
  const kit = makeKit();
  const pointer = makePointer(st);
  let obj;
  if (kind === 'keyboard') obj = keyboard(kit);
  const model = obj ? obj.g : (MODELS[kind] || pc)(kit);
  fit(model, kind === 'pc' ? 2.9 : 2.7);
  const holder = new THREE.Group();
  holder.add(model);
  st.scene.add(holder);
  if (kind === 'keyboard') holder.rotation.x = 0.35;
  pointer.onTap = (e) => {
    kit.boost = 1;
    if (obj) { const h = pick(st, e, [{ obj: obj.g }]); if (h) obj.tap(h.point); }
  };
  holder.scale.setScalar(0.01);
  st.updaters.push((t, dt) => {
    kit.update(dt);
    obj?.update(dt, kit.time);
    holder.scale.setScalar(0.01 + 0.99 * ease(t / 0.9));
    const target = t * 0.35 + pointer.spin + pointer.x * 0.3;
    holder.rotation.y += (target - holder.rotation.y) * 0.08;
  });
  el.classList.add('ready');
  return true;
}

window.MP3D = { mountHero, mountBuilder, mountProduct };
window.dispatchEvent(new Event('mp3d-ready'));
