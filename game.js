(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rr = (a, b) => a + Math.random() * (b - a);
const N = 520, ROAD_W = 10.5, WALL = ROAD_W + 2.35;
const tg = window.Telegram && Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ================= сохранение (localStorage: только это устройство, без серверной защиты) =================
const defSave = () => ({ v: 4, name: 'Гонщик', coins: 0, cur: 'rust', cars: { rust: { up: [0, 0, 0, 0, 0, 0], dmg: 0 } }, level: 1, paint: {}, style: {}, neon: {}, tune: {}, char: { g: 'boy', col: 0, skin: 0 }, tour: null, set: { snd: 1, mus: 1, gfx: 'auto', theme: 'dark', server: SERVER_URL, touchLayout: 'left', touchSize: 'normal', keys: { gas: 'ArrowUp', brake: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', nitro: 'Space', drift: 'ShiftLeft' } } });
let save;
try { save = Object.assign(defSave(), JSON.parse(localStorage.getItem('tr_save') || '{}')); } catch (e) { save = defSave(); }
save.set = Object.assign(defSave().set, save.set); save.char = Object.assign(defSave().char, save.char); save.paint = Object.assign({}, save.paint || {}); save.style = Object.assign({}, save.style || {}); save.neon = Object.assign({}, save.neon || {}); save.tune = Object.assign({}, save.tune || {}); save.set.keys = Object.assign(defSave().set.keys, save.set.keys || {});
if (SERVER_URL && (!save.set.server || (/onrender\.com/.test(save.set.server) && save.set.server !== SERVER_URL))) save.set.server = SERVER_URL;
if (!save.cars[save.cur]) save.cur = 'rust';
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && save.name === 'Гонщик') save.name = String(tg.initDataUnsafe.user.first_name || 'Гонщик').slice(0, 14);
const store = () => { try { localStorage.setItem('tr_save', JSON.stringify(save)); } catch (e) {} if (window.TRAccount && typeof window.TRAccount.syncProfile === 'function') window.TRAccount.syncProfile(save); };
window.addEventListener('tr-account-login', e => { if (e.detail && e.detail.name) { save.name = String(e.detail.name).slice(0,14); store(); if ($('who')) $('who').textContent = 'Гонщик: ' + save.name; } });
window.addEventListener('tr-cloud-profile-load', e => {
  const incoming = e.detail && e.detail.profile; if (!incoming || typeof incoming !== 'object') return;
  const d = defSave();
  save = Object.assign(d, incoming);
  save.set = Object.assign(d.set, incoming.set || {}); save.char = Object.assign(d.char, incoming.char || {});
  save.cars = Object.assign(d.cars, incoming.cars || {}); save.paint = Object.assign({}, incoming.paint || {});
  save.style = Object.assign({}, incoming.style || {}); save.neon = Object.assign({}, incoming.neon || {}); save.tune = Object.assign({}, incoming.tune || {});
  save.set.keys = Object.assign(d.set.keys, save.set.keys || {});
  save.set.touchKeys = Object.assign({left:'left',right:'right',nitro:'nitro',brake:'brake',drift:'drift',gas:'gas'}, save.set.touchKeys || {});
  if (!save.cars[save.cur]) save.cur = 'rust';
  phys = physFor(save.cur); applyGfx(); builtL = -1; store();
  if (typeof state !== 'undefined' && state === 'settings') refreshSettings();
  if (typeof toMenu === 'function') toMenu();
});
window.addEventListener('tr-cloud-profile-empty', () => { if (window.TRAccount) window.TRAccount.syncProfile(save); });

// ================= машины и физика =================
const carDef = id => CARS.find(c => c.id === id) || CARS[0];
const purchasePrice = d => Math.round(d.price * (d.price >= 100000 ? 1.5 : d.price >= 30000 ? 1.25 : 1));
const carIdx = id => Math.max(0, CARS.findIndex(c => c.id === id));
const STYLE_SHAPES = ['original', 'muscle', 'super', 'hyper'];
const visualCarDef = id => { const d = carDef(id), sh = STYLE_SHAPES[save.style[id] || 0]; return sh === 'original' ? d : Object.assign({}, d, { shape: sh }); };
const carTune = id => Object.assign({ rimStyle: 0, wing: null }, save.tune[id] || {});
const carPaint = id => save.paint[id] || null;
function eff(id) {
  const d = carDef(id), o = save.cars[id] || { up: [0, 0, 0, 0, 0, 0] }, e = {};
  STATS.forEach(([k], i) => e[k] = d.s[i] + o.up[i] * 0.6); return e;
}
function physFor(id) {
  const e = eff(id), o = save.cars[id] || { dmg: 0 }, d = o.dmg / 100;
  return { max: (40 + e.speed * 2.4) * (1 - d * 0.3), acc: (14 + e.accel * 2.2) * (1 - d * 0.25), brk: 30 + e.brake * 5,
    hnd: 1.6 + e.handle * 0.1, grip: 2 + e.grip * 0.8, nCap: 60 + e.nitro * 8, nPow: 1.2 + e.nitro * 0.03 };
}
let phys = physFor(save.cur);
let raceStartedAt = 0;

// ================= данные режимов =================
const THEMES = [
  { name: 'Бедные улицы', sky: [0x151c2b, 0x6b6a66], fog: 0x4a4c50, ground: 0x2e3033, bh: [8, 26], bcol: [0x5a524a, 0x66584c, 0x4b4e54, 0x5e4a44], lit: 0.45, lamp: 0xffc070, hemi: [0x8090b0, 0x302820, 0.7], sun: [0xaabbdd, 0.7], stars: 1, moon: '#e8eeff', rain: 0 },
  { name: 'Нью-Йорк', sky: [0x070b1c, 0x4a4260], fog: 0x2a2a40, ground: 0x1c1d22, bh: [35, 130], bcol: [0x2c3340, 0x39414f, 0x262a33, 0x3d3a46], lit: 0.8, lamp: 0xffe3a0, hemi: [0x7080c0, 0x202030, 0.65], sun: [0x99aaff, 0.55], stars: 1, moon: '#d8e0ff', rain: 1 },
  { name: 'Побережье', sky: [0x2a4a7a, 0xff9a5a], fog: 0xd88a60, ground: 0xc2a070, bh: [6, 16], bcol: [0xe8d8c0, 0xd8b090, 0xf0e8d8, 0xc89878], lit: 0.1, lamp: 0xfff0c0, hemi: [0xffd0a0, 0x806040, 0.9], sun: [0xffb070, 1.0], stars: 0, moon: '#fff2c0', rain: 0 },
  { name: 'Горный серпантин', sky: [0x4b7190, 0xd6e6ef], fog: 0x9badb8, ground: 0x526b50, bh: [4, 18], bcol: [0x485b55, 0x697f72, 0x756b5d, 0x88908a], lit: 0.18, lamp: 0xf0f7ff, hemi: [0xc4e3ff, 0x263629, 0.85], sun: [0xffeac9, 0.85], stars: 0, moon: '#ffffff', rain: 0 },
  { name: 'Снежный перевал', sky: [0x172948, 0xa6c5dd], fog: 0xb3c9d9, ground: 0xdde9ef, bh: [5, 25], bcol: [0xb4c7d4, 0xe5eef4, 0x8398a8, 0x697d91], lit: 0.25, lamp: 0xbce9ff, hemi: [0xdaf0ff, 0x70849b, 0.85], sun: [0xe0efff, 0.72], stars: 0, moon: '#eaf7ff', rain: 0 },
  { name: 'Промзона', sky: [0x170f18, 0x7b4b3c], fog: 0x392a2a, ground: 0x292728, bh: [15, 78], bcol: [0x3b3535, 0x51464a, 0x313840, 0x55403a], lit: 0.5, lamp: 0xff8d54, hemi: [0xb58b7b, 0x201b20, 0.65], sun: [0xffa070, 0.5], stars: 1, moon: '#ffc4a4', rain: 0 },
  { name: 'Кибер-город', sky: [0x080e28, 0x41406e], fog: 0x252846, ground: 0x171a28, bh: [30, 125], bcol: [0x242b4b, 0x343352, 0x222939, 0x3f3154], lit: 0.75, lamp: 0x40eaff, hemi: [0x7f9cff, 0x17132f, 0.72], sun: [0x8cd8ff, 0.6], stars: 1, moon: '#88f1ff', rain: 0 },
  { name: 'Пустынный каньон', sky: [0x4c6681, 0xffbb77], fog: 0xd5a879, ground: 0xb98b54, bh: [8, 34], bcol: [0xc49b69, 0x9f7653, 0xd0b080, 0x8f694c], lit: 0.16, lamp: 0xffd49b, hemi: [0xffdfb2, 0x785637, 0.82], sun: [0xffc078, 0.92], stars: 0, moon: '#fff0d2', rain: 0 },
  { name: 'Лесная долина', sky: [0x23475d, 0xb8d7cf], fog: 0x8caeaa, ground: 0x354f38, bh: [3, 15], bcol: [0x3d6849, 0x577752, 0x80694d, 0x44636a], lit: 0.12, lamp: 0xd9ffd5, hemi: [0xc8f0dc, 0x1b3525, 0.92], sun: [0xfff1cc, 0.8], stars: 0, moon: '#efffee', rain: 0 },
  { name: 'Вулканический хребет', sky: [0x170f22, 0x8b4439], fog: 0x4b292e, ground: 0x26212a, bh: [5, 28], bcol: [0x39343d, 0x524049, 0x2c2932, 0x5b3d36], lit: 0.5, lamp: 0xff6035, hemi: [0xb99aa0, 0x1b151d, 0.6], sun: [0xff8050, 0.52], stars: 1, moon: '#ffbda0', rain: 0 },
  { name: 'Морской порт', sky: [0x244c70, 0xc2d9df], fog: 0x9bb6c3, ground: 0x4b565f, bh: [10, 58], bcol: [0x53626a, 0x7b8588, 0x3b4b59, 0x9d795c], lit: 0.32, lamp: 0xffd59b, hemi: [0xc5e3fa, 0x293b49, 0.85], sun: [0xffdfb7, 0.76], stars: 0, moon: '#eef7ff', rain: 0 }
];
const themeFor = L => Math.floor((L - 1) / 5) % THEMES.length;
const SHAPES_PTS = [
  [[0,0],[130,-30],[210,60],[170,180],[50,215],[-80,160],[-150,50],[-90,-50]],
  [[0,0],[160,0],[240,100],[160,200],[60,160],[-20,240],[-120,160],[-100,40]],
  [[0,0],[100,-60],[220,-20],[260,90],[180,160],[90,120],[20,200],[-90,230],[-170,120],[-100,20]],
  [[0,0],[200,0],[260,120],[120,180],[40,100],[-60,170],[-160,100],[-120,-30]]
];
const BOSSES = ['Рыжий Кабан', 'Ржавый Лис', 'Тень Бронкса', 'Железный Макс', 'Мистер Нитро', 'Король Трассы'];
const isBoss = L => L % 20 === 0, isMini = L => L % 10 === 0 && L % 20 !== 0;
const lapsFor = L => isBoss(L) ? 5 : isMini(L) ? 4 : 3;
const bossName = L => BOSSES[(Math.floor(L / 10) - 1) % BOSSES.length];
const DIFFS = [
  { n: 'Очень легко', top: 34, sk: [0.85, 0.92], aware: 0.3, unlock: 1 },
  { n: 'Легко', top: 41, sk: [0.9, 0.97], aware: 0.5, unlock: 3 },
  { n: 'Средне', top: 50, sk: [0.94, 1.01], aware: 0.7, unlock: 6 },
  { n: 'Сложно', top: 62, sk: [0.98, 1.05], aware: 0.88, unlock: 10 },
  { n: 'Невозможно', top: 78, sk: [1.05, 1.12], aware: 1, unlock: 20 }
];
const TOURS = [
  { id: 'street', name: 'Уличный турнир', desc: '3 гонки · бедные улицы', Ls: [1, 2, 3], top: 43, inc: 3, unlock: 1, prize: [700, 350, 180] },
  { id: 'night', name: 'Ночной стрит-кубок', desc: '4 гонки · улицы', Ls: [4, 5, 6, 7], top: 51, inc: 3, unlock: 5, prize: [1500, 800, 400] },
  { id: 'pro', name: 'Профессиональный чемпионат', desc: '5 гонок · Нью-Йорк', Ls: [11, 12, 13, 14, 15], top: 63, inc: 3, unlock: 11, prize: [9000, 4500, 2200, 1000] },
  { id: 'world', name: 'Мировой чемпионат', desc: '6 гонок · побережье', Ls: [21, 22, 23, 24, 25, 26], top: 77, inc: 2.5, unlock: 21, prize: [30000, 15000, 8000, 4000] },
  { id: 'rain', name: 'Кубок ливня', desc: '4 гонки · мокрый асфальт и скользкие повороты', Ls: [7, 8, 9, 10], top: 56, inc: 3.4, unlock: 7, prize: [4000, 2200, 1000, 500] },
  { id: 'drift', name: 'Гран-при дрифта', desc: '5 гонок · точность, сцепление и ручник', Ls: [12, 13, 14, 15, 16], top: 65, inc: 3.1, unlock: 12, prize: [12000, 6500, 3200, 1400] },
  { id: 'endurance', name: 'Гонка на выносливость', desc: '6 длинных заездов · износ и ремонт важны', Ls: [17, 18, 19, 20, 21, 22], top: 73, inc: 2.8, unlock: 17, prize: [22000, 11000, 5600, 2600] },
  { id: 'hyper', name: 'Hyper League', desc: '7 гонок · лучшие машины и агрессивный ИИ', Ls: [31, 32, 33, 34, 35, 36, 37], top: 88, inc: 2.4, unlock: 31, prize: [65000, 32000, 16000, 7000] },
  { id: 'nightmare', name: 'Ночной марафон', desc: '8 гонок · сложные соперники и ночные трассы', Ls: [41, 42, 43, 44, 45, 46, 47, 48], top: 98, inc: 2.2, unlock: 41, prize: [100000, 50000, 25000, 12000] }
];
const PTS = [10, 7, 5, 4, 3, 2];
const NAMES = ['Макс', 'Лис', 'Дэн', 'Ника', 'Тоха', 'Рекс', 'Вольт', 'Зара', 'Бык', 'Йети', 'Ася', 'Гром', 'Мира', 'Тим', 'Кай'];

// ================= сцена =================
const LOW_DEVICE = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4) || matchMedia('(max-width: 700px)').matches;
let adaptiveScale = 1, fpsSamples = 0, fpsTime = 0, lowFpsWindows = 0;
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !LOW_DEVICE, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 300 }); sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const spot = new THREE.SpotLight(0xfff2d0, 1.6, 80, 0.5, 0.55); scene.add(spot, spot.target);
const pmrem = new THREE.PMREMGenerator(renderer); let envRT = null, skyTexture = null;
let starsG = null, rainG = null, rainOn = false;
const RAIN_N = 600, rainP = new Float32Array(RAIN_N * 6), rainB = new Float32Array(RAIN_N * 3);

const GFX_ORDER = ['auto','verylow','low','med','high','veryhigh','ultra','rt'];
function resolvedGfx() {
  if (save.set.gfx === 'auto') return LOW_DEVICE || adaptiveScale < 0.9 ? 'low' : 'med';
  return ['verylow','low','med','high','veryhigh','ultra','rt'].includes(save.set.gfx) ? save.set.gfx : 'med';
}
function applyGfx() {
  const g = resolvedGfx();
  document.body.classList.remove('gfx-verylow','gfx-low','gfx-med','gfx-high','gfx-veryhigh','gfx-ultra','gfx-rt');
  document.body.classList.add('gfx-' + g);
  document.body.classList.toggle('low-gpu', g === 'verylow' || g === 'low');
  const maxRatio = ({verylow:0.72,low:0.9,med:1.12,high:1.35,veryhigh:1.55,ultra:1.72,rt:1.8})[g] || 1.1;
  renderer.setPixelRatio(Math.max(0.55, Math.min(devicePixelRatio || 1, maxRatio) * adaptiveScale));
  renderer.setSize(innerWidth, innerHeight);
  const shadowOn = ['high','veryhigh','ultra','rt'].includes(g);
  renderer.shadowMap.enabled = shadowOn; sun.castShadow = shadowOn;
  const sz = ({verylow:256,low:384,med:512,high:1024,veryhigh:1536,ultra:2048,rt:2048})[g] || 512;
  if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  spot.visible = !['verylow','low'].includes(g); rainOn = !['verylow','low'].includes(g);
  sun.shadow.radius = g === 'rt' || g === 'ultra' ? 5 : g === 'veryhigh' ? 3 : 1;
  renderer.toneMappingExposure = g === 'rt' ? 1.16 : g === 'ultra' ? 1.12 : 1.1;
  if (rainG) rainG.visible = rainOn && !!rainG.userData.want;
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
}
function resize() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize);

function canvasTex(w, h, draw, srgb) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb !== false) t.encoding = THREE.sRGBEncoding; return t;
}
const hex = n => '#' + n.toString(16).padStart(6, '0');
const roadT = canvasTex(128, 256, (x, w, h) => {
  x.fillStyle = '#2b2d31'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 3500; i++) { const v = 26 + Math.random() * 36 | 0; x.fillStyle = `rgb(${v},${v},${v + 3})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  x.strokeStyle = '#1b1c1f'; x.lineWidth = 1; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(Math.random() * w, Math.random() * h); x.lineTo(Math.random() * w, Math.random() * h); x.stroke(); }
  x.fillStyle = '#d9d4c0'; x.fillRect(3, 0, 3, h); x.fillRect(122, 0, 3, h);
  x.fillStyle = '#f5c542'; for (let y = 0; y < h; y += 64) x.fillRect(62, y, 4, 32);
});
roadT.wrapS = THREE.ClampToEdgeWrapping;
const curbT = canvasTex(16, 32, x => { x.fillStyle = '#c92a2a'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#eee'; x.fillRect(0, 16, 16, 16); });
const winT = canvasTex(64, 64, (x, w, h) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (Math.random() < 0.55) { x.fillStyle = Math.random() < 0.7 ? '#ffd27a' : '#9fd0ff'; x.fillRect(i * 16 + 4, j * 16 + 4, 8, 8); }
});
const glowT = canvasTex(64, 64, x => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});

function setSky(th) {
  const tex = canvasTex(512, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hex(th.sky[0])); g.addColorStop(0.5, hex(th.sky[1])); g.addColorStop(0.52, hex(th.fog)); g.addColorStop(1, hex(th.ground));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const sg = x.createRadialGradient(w * 0.3, h * 0.38, 0, w * 0.3, h * 0.38, h * 0.16);
    sg.addColorStop(0, th.moon); sg.addColorStop(0.25, th.moon); sg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  if (skyTexture) skyTexture.dispose();
  skyTexture = tex; scene.background = skyTexture;
  if (envRT) envRT.dispose(); envRT = pmrem.fromEquirectangular(skyTexture); scene.environment = envRT.texture;
  scene.fog = new THREE.Fog(th.fog, 60, 320);
  hemi.color.setHex(th.hemi[0]); hemi.groundColor.setHex(th.hemi[1]); hemi.intensity = th.hemi[2];
  sun.color.setHex(th.sun[0]); sun.intensity = th.sun[1];
  if (starsG) scene.remove(starsG);
  starsG = null;
  if (th.stars) {
    const p = []; for (let i = 0; i < 350; i++) { const a = Math.random() * 6.28, e = 0.15 + Math.random() * 1.2; p.push(Math.cos(a) * Math.cos(e) * 500, Math.sin(e) * 500, Math.sin(a) * Math.cos(e) * 500); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    starsG = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
    starsG.frustumCulled = false; scene.add(starsG);
  }
  if (!rainG) {
    for (let i = 0; i < RAIN_N; i++) { rainB[i * 3] = rr(-30, 30); rainB[i * 3 + 1] = rr(0, 35); rainB[i * 3 + 2] = rr(-30, 30); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(rainP, 3));
    rainG = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb4d0, transparent: true, opacity: 0.35, fog: false }));
    rainG.frustumCulled = false; scene.add(rainG);
  }
  rainG.userData.want = th.rain; rainG.visible = rainOn && !!th.rain;
  Snd.setTheme(themeIdx);
}
let themeIdx = 0;
function updateRain(dt) {
  if (!rainG || !rainG.visible) return;
  for (let i = 0; i < RAIN_N; i++) {
    let y = rainB[i * 3 + 1] - dt * 38; if (y < 0) y += 35; rainB[i * 3 + 1] = y;
    const x = rainB[i * 3], z = rainB[i * 3 + 2];
    const j = i * 6; rainP[j] = x; rainP[j + 1] = y; rainP[j + 2] = z; rainP[j + 3] = x + 0.05; rainP[j + 4] = y + 0.9; rainP[j + 5] = z;
  }
  rainG.geometry.attributes.position.needsUpdate = true;
  rainG.position.set(cam.position.x, cam.position.y - 8, cam.position.z);
}

// ================= трасса =================
let trackG = null, pos = [], tan = [], SP = 1, items = [], builtL = -1;
const modN = v => ((v % N) + N) % N;
const sdiff = (a, b) => ((a - b + N / 2) % N + N) % N - N / 2;
function sampleAt(p, lat) {
  const i = modN(p), i0 = Math.floor(i), f = i - i0, i1 = (i0 + 1) % N, a = pos[i0], b = pos[i1], t = tan[i0];
  return { x: a.x + (b.x - a.x) * f + t.z * lat, z: a.z + (b.z - a.z) * f - t.x * lat, h: Math.atan2(t.x, t.z) };
}
function nearest(p, last) {
  let best = 1e12, bi = last;
  for (let k = -30; k <= 30; k++) { const i = (last + k + N) % N, dx = p.x - pos[i].x, dz = p.z - pos[i].z, d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
  return [bi, Math.sqrt(best)];
}

function wedgeGeo() {
  const s = new THREE.Shape(); s.moveTo(-2, 0); s.lineTo(2, 0); s.lineTo(2, 0.62); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 4.8, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(2.4, 0, 0); return g;
}
const WEDGE = wedgeGeo();
function itemMesh(type, h) {
  const g = new THREE.Group(); let m;
  const std = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: e || 0, roughness: 0.4 });
  if (type === 'coin') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 18), std(0xf5c542, 0x7a5a00)); m.rotation.x = Math.PI / 2; m.position.y = 1.2; }
  else if (type === 'nitro') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12), std(0x2fb7ff, 0x0a4a80)); m.position.y = 1.1; }
  else if (type === 'repair') { m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), std(0x3ad06a, 0x0a5a22)); m.position.y = 1.1; }
  else if (type === 'oil') { m = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.65, 0.055, 24), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.14, metalness: 0.72 })); m.position.y = 0.055; }
  else if (type === 'cone') {
    m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.5), std(0xd23030)); m.position.y = 0.45;
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.2, 0.52), std(0xf2f2f2)); s.position.y = 0.55; g.add(s);
  } else { m = new THREE.Mesh(WEDGE, std(0xf5c542, 0x403000)); g.rotation.y = h; g.scale.set(0.94, 0.82, 0.94); }
  m.castShadow = true; g.add(m); g.userData.spin = (type === 'coin' || type === 'nitro' || type === 'repair'); g.userData.body = m;
  return g;
}

let envInfo = { weather: 'Ясно', time: 'День', icon: '☀' }, currentTrackSeed = 0;
function buildTrack(L, providedSeed) {
  if (trackG) {
    scene.remove(trackG);
    const sharedMaterials = new Set(typeof _M !== 'undefined' ? Object.values(_M) : []), dynamicMaterials = new Set();
    trackG.traverse(o => {
      if (o.geometry && o.geometry !== WEDGE) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(mat => { if (mat && !sharedMaterials.has(mat)) dynamicMaterials.add(mat); });
    });
    dynamicMaterials.forEach(mat => mat.dispose());
  }
  themeIdx = themeFor(L);
  let seed = (Number.isFinite(Number(providedSeed)) && providedSeed !== null && providedSeed !== undefined) ? (Math.abs(Math.floor(Number(providedSeed))) % 2147483646) + 1 : (Math.floor(Math.random() * 2147483646) + 1);
  currentTrackSeed = seed;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const th = Object.assign({}, THEMES[themeIdx], { sky: THEMES[themeIdx].sky.slice(), hemi: THEMES[themeIdx].hemi.slice(), sun: THEMES[themeIdx].sun.slice(), bcol: THEMES[themeIdx].bcol.slice() });
  const times = [
    { name: 'Рассвет', icon: '🌅', sky: [0x3e5676, 0xffa06e], sun: 0.72, hemi: 0.82, stars: 0 },
    { name: 'День', icon: '☀', sky: [0x3d7db9, 0xd7eaff], sun: 1.18, hemi: 1.0, stars: 0 },
    { name: 'Закат', icon: '🌇', sky: [0x463d6b, 0xff9862], sun: 0.68, hemi: 0.82, stars: 0 },
    { name: 'Ночь', icon: '🌙', sky: [0x050a1b, 0x252e50], sun: 0.28, hemi: 0.55, stars: 1 }
  ];
  const weather = [
    { name: 'Ясно', icon: '☀', rain: 0, fog: 1 },
    { name: 'Облачно', icon: '☁', rain: 0, fog: 1.18 },
    { name: 'Дождь', icon: '🌧', rain: 2, fog: 1.35 },
    { name: 'Туман', icon: '🌫', rain: 0, fog: 2.1 }
  ];
  const time = times[Math.floor(rnd() * times.length)], wx = weather[Math.floor(rnd() * weather.length)];
  envInfo = { weather: wx.name, time: time.name, icon: time.icon };
  th.sky = time.sky; th.sun = [th.sun[0], th.sun[1] * time.sun]; th.hemi[2] *= time.hemi; th.stars = time.stars; th.rain = wx.rain; th.fog = wx.name === 'Туман' ? 0x83909c : th.fog;
  if (wx.name === 'Облачно') th.sun[1] *= 0.55;
  if (time.name === 'Ночь') th.moon = '#dbeaff';
  setSky(th);
  if (scene.fog) { scene.fog.near = wx.name === 'Туман' ? 24 : 60; scene.fog.far = wx.name === 'Туман' ? 155 : wx.name === 'Дождь' ? 245 : 320; }
  if ($('environmentTag')) $('environmentTag').textContent = `${wx.icon} ${wx.name} · ${time.icon} ${time.name} · ${THEMES[themeIdx].name}`;
  trackG = new THREE.Group(); scene.add(trackG);
  const controls = [], cpCount = 13 + Math.floor(rnd() * 7), rotation = rnd() * Math.PI * 2;
  for (let i = 0; i < cpCount; i++) {
    const angle = (i / cpCount) * Math.PI * 2 + rotation;
    const rX = 355 + rnd() * 150, rZ = 325 + rnd() * 145;
    controls.push(new THREE.Vector3(Math.cos(angle) * rX, 0, Math.sin(angle) * rZ));
  }
  const curve = new THREE.CatmullRomCurve3(controls, true, 'catmullrom', 0.45);
  pos = []; tan = [];
  for (let i = 0; i < N; i++) { pos.push(curve.getPointAt(i / N)); tan.push(curve.getTangentAt(i / N).setY(0).normalize()); }
  SP = curve.getLength() / N;

  const gr = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), new THREE.MeshStandardMaterial({ color: th.ground, roughness: 1, envMapIntensity: 0.3 }));
  gr.rotation.x = -Math.PI / 2; gr.position.y = -0.05; gr.receiveShadow = true; trackG.add(gr);

  function ribbon(w, y, mat, vs) {
    const v = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) { const p = pos[i % N], t = tan[i % N]; v.push(p.x + t.z * w, y, p.z - t.x * w, p.x - t.z * w, y, p.z + t.x * w); uv.push(0, i * SP / vs, 1, i * SP / vs); }
    for (let i = 0; i < N; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; trackG.add(m);
  }
  ribbon(ROAD_W + 1.3, 0.01, new THREE.MeshStandardMaterial({ map: curbT, roughness: 0.8, side: THREE.DoubleSide }), 4);
  ribbon(ROAD_W, 0.03, new THREE.MeshStandardMaterial({ map: roadT, roughness: envInfo.weather === 'Дождь' ? 0.24 : themeIdx === 1 ? 0.35 : 0.65, metalness: envInfo.weather === 'Дождь' ? 0.22 : 0.1, envMapIntensity: 0.7, side: THREE.DoubleSide }), 16);

  const s0 = sampleAt(0, 0);
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W * 2, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sl.rotation.x = -Math.PI / 2; sl.rotation.z = -s0.h; sl.position.set(s0.x, 0.07, s0.z); trackG.add(sl);
  const arch = new THREE.Group(), am = new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x330000 });
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), am); p.position.set(s * (ROAD_W + 2), 4, 0); arch.add(p); });
  const bm = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W * 2 + 4.6, 1.2, 0.8), am); bm.position.y = 8; arch.add(bm);
  arch.position.set(s0.x, 0, s0.z); arch.rotation.y = s0.h; trackG.add(arch);

  const dum = new THREE.Object3D();
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.8, SP * 3.3), new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.5, metalness: 0.5 }), 2 * Math.ceil(N / 3));
  let k = 0;
  for (let i = 0; i < N; i += 3) for (const s of [-1, 1]) {
    dum.position.set(pos[i].x + tan[i].z * (ROAD_W + 2) * s, 0.4, pos[i].z - tan[i].x * (ROAD_W + 2) * s);
    dum.rotation.set(0, Math.atan2(tan[i].x, tan[i].z), 0); dum.updateMatrix(); rails.setMatrixAt(k++, dum.matrix);
  }
  trackG.add(rails);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.13, 6.5, 6), new THREE.MeshStandardMaterial({ color: 0x555a60 }), 2 * Math.ceil(N / 10));
  const glowM = new THREE.SpriteMaterial({ map: glowT, color: th.lamp, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.85 });
  k = 0;
  for (let i = 0; i < N; i += 10) for (const s of [-1, 1]) {
    const x = pos[i].x + tan[i].z * (ROAD_W + 3.6) * s, z = pos[i].z - tan[i].x * (ROAD_W + 3.6) * s;
    dum.position.set(x, 3.25, z); dum.rotation.set(0, 0, 0); dum.updateMatrix(); poles.setMatrixAt(k++, dum.matrix);
    const sp = new THREE.Sprite(glowM); sp.position.set(x - tan[i].z * s * 0.9, 6.5, z + tan[i].x * s * 0.9); sp.scale.set(9, 9, 1); trackG.add(sp);
  }
  trackG.add(poles);

  const bmats = th.bcol.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, envMapIntensity: 0.3, emissive: 0xffffff, emissiveMap: winT, emissiveIntensity: th.lit }));
  const gQuality = resolvedGfx(); const maxB = ['verylow','low'].includes(gQuality) ? 36 : ['ultra','rt'].includes(gQuality) ? 145 : ['high','veryhigh'].includes(gQuality) ? 112 : 78;
  const nearRoad = (x, z, d) => { for (let i = 0; i < N; i += 4) { const dx = x - pos[i].x, dz = z - pos[i].z; if (dx * dx + dz * dz < d * d) return true; } return false; };
  for (let tries = 0, placed = 0; tries < 1200 && placed < maxB; tries++) {
    const x = -380 + rnd() * 760, z = -300 + rnd() * 700;
    if (nearRoad(x, z, 28)) continue;
    const w = 12 + rnd() * 16, h = th.bh[0] + rnd() * (th.bh[1] - th.bh[0]), d = 12 + rnd() * 16;
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * (w + d) / 16, uv.getY(q) * h / 8);
    const b = new THREE.Mesh(geo, bmats[Math.floor(rnd() * bmats.length)]);
    b.position.set(x, h / 2, z); b.rotation.y = rnd() * 3; trackG.add(b); placed++;
    if (themeIdx === 1 && h > 90) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.9, 14, 6), new THREE.MeshStandardMaterial({ color: 0x888888 })); sp.position.set(x, h + 7, z); trackG.add(sp);
      const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xff3030, blending: THREE.AdditiveBlending, transparent: true })); tip.scale.set(8, 8, 1); tip.position.set(x, h + 14, z); trackG.add(tip);
    }
  }

  // атмосферные детали по локациям
  const sideAt = (i, d, s) => ({ x: pos[i].x + tan[i].z * d * s, z: pos[i].z - tan[i].x * d * s, h: Math.atan2(tan[i].x, tan[i].z) });
  if (themeIdx === 0) {
    const bar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 8), new THREE.MeshStandardMaterial({ color: 0x4a6a4a, roughness: 0.7 }), 40);
    for (let n = 0; n < 40; n++) { const p = sideAt(Math.floor(rnd() * N), ROAD_W + 4 + rnd() * 4, rnd() < 0.5 ? -1 : 1); dum.position.set(p.x, 0.5, p.z); dum.rotation.set(0, 0, 0); dum.updateMatrix(); bar.setMatrixAt(n, dum.matrix); }
    trackG.add(bar);
    for (let n = 0; n < 7; n++) {
      const car = makeCarModel(CARS[Math.floor(rnd() * 4)], Math.floor(rnd() * 0xffffff)); const p = sideAt(Math.floor(rnd() * N), ROAD_W + 6.5, rnd() < 0.5 ? -1 : 1);
      car.position.set(p.x, 0, p.z); car.rotation.y = p.h; trackG.add(car);
    }
  } else if (themeIdx === 1 || themeIdx === 5 || themeIdx === 6) {
    const cols = [0xff2d95, 0x2dd6ff, 0xffd02d, 0x7dff2d, 0xff6a1a];
    for (let n = 0, count = ['verylow','low'].includes(resolvedGfx()) ? 8 : ['ultra','rt'].includes(resolvedGfx()) ? 28 : ['high','veryhigh'].includes(resolvedGfx()) ? 22 : 16; n < count; n++) {
      const i = Math.floor(rnd() * N), s = rnd() < 0.5 ? -1 : 1, p = sideAt(i, ROAD_W + 16, s), c = cols[Math.floor(rnd() * cols.length)];
      const bb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 10), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 1.2 }));
      bb.position.set(p.x, 9, p.z); bb.rotation.y = p.h; trackG.add(bb);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x333333 })); pole.position.set(p.x, 4, p.z); trackG.add(pole);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: c, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, depthWrite: false })); gl.scale.set(18, 12, 1); gl.position.set(p.x - p.h * 0, 9, p.z); trackG.add(gl);
    }
  } else if (themeIdx === 10) {
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x626a70, metalness: 0.78, roughness: 0.36 });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x6c493e, metalness: 0.55, roughness: 0.62 });
    for (let n=0,count=['verylow','low'].includes(resolvedGfx())?9:24;n<count;n++) { const i=Math.floor(rnd()*N), side=rnd()<0.5?-1:1, p=sideAt(i,ROAD_W+11+rnd()*18,side); const pipe=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.65,5+rnd()*7,8),pipeMat); pipe.position.set(p.x,2.5+rnd()*2,p.z); pipe.rotation.z=(rnd()-0.5)*0.08; trackG.add(pipe); }
    for (let n=0,count=['verylow','low'].includes(resolvedGfx())?6:16;n<count;n++) { const p=sideAt(Math.floor(rnd()*N),ROAD_W+17+rnd()*24,rnd()<0.5?-1:1); const tank=new THREE.Mesh(new THREE.CylinderGeometry(2.3,2.3,4.5,12),tankMat); tank.position.set(p.x,2.25,p.z); trackG.add(tank); }
  } else if (themeIdx === 7) {
    // Cacti and tall sandstone spires for the desert arena.
    const cactusMat = new THREE.MeshStandardMaterial({ color: 0x557b42, roughness: 0.92 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9b6947, roughness: 0.96 });
    for (let n = 0, count = ['verylow','low'].includes(resolvedGfx()) ? 18 : 42; n < count; n++) {
      const p = sideAt(Math.floor(rnd() * N), ROAD_W + 8 + rnd() * 22, rnd() < 0.5 ? -1 : 1);
      if (n % 3 === 0) {
        const h = 2.2 + rnd() * 3.2, cactus = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.46, h, 7), cactusMat); cactus.position.set(p.x, h / 2, p.z); trackG.add(cactus);
        if (n % 2 === 0) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 6), cactusMat); arm.position.set(p.x + (rnd() < 0.5 ? -0.6 : 0.6), h * 0.55, p.z); arm.rotation.z = Math.PI / 2; trackG.add(arm); }
      } else {
        const h = 5 + rnd() * 15, rock = new THREE.Mesh(new THREE.ConeGeometry(2 + rnd() * 3, h, 5), rockMat); rock.position.set(p.x, h / 2, p.z); rock.rotation.y = rnd() * 3; trackG.add(rock);
      }
    }
  } else if (themeIdx === 9) {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x373039, roughness: 1 });
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff4c24, transparent: true, opacity: 0.85 });
    for (let n = 0, count = ['verylow','low'].includes(resolvedGfx()) ? 18 : 42; n < count; n++) {
      const p = sideAt(Math.floor(rnd() * N), ROAD_W + 7 + rnd() * 22, rnd() < 0.5 ? -1 : 1);
      const h = 3 + rnd() * 13, rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + rnd() * 3, 0), rockMat); rock.scale.set(1, h / 3, 1.1); rock.position.set(p.x, h / 2, p.z); rock.rotation.y = rnd() * Math.PI; trackG.add(rock);
      if (n % 4 === 0) { const glow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2 + rnd() * 3), lavaMat); glow.position.set(p.x, 0.18, p.z); glow.rotation.y = p.h; trackG.add(glow); }
    }
  } else {
    // Forest, mountain, coast and snowy scenery share a light instanced tree set.
    const trunkColor = themeIdx === 4 ? 0x778694 : 0x6b4a2a;
    const leafColor = themeIdx === 4 ? 0xc5d9e7 : themeIdx === 8 ? 0x245f3a : themeIdx === 2 ? 0x397b54 : 0x2f8a3a;
    const treeCount = ['verylow','low'].includes(resolvedGfx()) ? 20 : ['ultra','rt'].includes(resolvedGfx()) ? 100 : ['high','veryhigh'].includes(resolvedGfx()) ? 76 : 52;
    const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 6, 6), new THREE.MeshStandardMaterial({ color: trunkColor }), treeCount);
    const cr = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 8, 6), new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.8 }), treeCount);
    for (let n = 0; n < treeCount; n++) {
      const p = sideAt(Math.floor(rnd() * N), ROAD_W + 6 + rnd() * 14, rnd() < 0.5 ? -1 : 1);
      dum.rotation.set(0, 0, 0); dum.scale.set(1, 1, 1); dum.position.set(p.x, 3, p.z); dum.updateMatrix(); tr.setMatrixAt(n, dum.matrix);
      dum.position.set(p.x, 6.2, p.z); dum.scale.set(1, 0.45, 1); dum.updateMatrix(); cr.setMatrixAt(n, dum.matrix);
    }
    dum.scale.set(1, 1, 1); trackG.add(tr, cr);
  }

  // предметы: монеты, бонусы, ловушки (редко), трамплины
  items = [];
  const put = (type, idx, lat) => {
    const s = sampleAt(idx, lat), mesh = itemMesh(type, s.h); mesh.position.set(s.x, 0, s.z);
    trackG.add(mesh); items.push({ type, idx, lat, x: s.x, z: s.z, h: s.h, mesh, on: true });
  };
  for (let i = 0; i < 5; i++) put('ramp', 46 + i * 96 + rnd() * 18, (rnd() - 0.5) * 2.2);
  for (let idx = 22; idx < N - 24; idx += 7 + rnd() * 8) {
    if (items.some(it => it.type === 'ramp' && Math.abs(it.idx - idx) < 12)) continue;
    const r = rnd(), lat = (rnd() - 0.5) * 11.8;
    put(r < 0.39 ? 'coin' : r < 0.54 ? 'nitro' : r < 0.64 ? 'repair' : r < 0.80 ? 'oil' : r < 0.88 ? 'cone' : 'coin', idx, lat);
  }
}
function resetItems() { items.forEach(it => { it.on = true; it.mesh.visible = true; }); }

// ================= участники =================
const player = { name: 'Вы', mesh: null, h: 0, speed: 0, vx: 0, vz: 0, y: 0, vy: 0, air: false, idx: 0, lap: 0, p: 0, lat: 0, steerS: 0, slip: 0, spin: 1, dmg: 0, nLock: false, boosting: false, finished: false, rampT: 0, rampY: 0, rampCooldown: 0, engineStall: 0, immobilized: false }; 
let ais = [], remotes = {}, state = 'menu', nitro = 100, finishOrder = [], camH = 0, bumpT = 0, menuT = 0, raceId = 0, raceCoins = 0, curLaps = 3, wallT = 0, cfg = null, stuckT = 0, fixCool = 0, lastLap = 0, charMesh = null;
const all = () => [player, ...ais, ...Object.values(remotes)];

function disposeModel(root) { if (!root) return; root.traverse(o => { if (o.geometry && o.geometry !== WEDGE) o.geometry.dispose(); }); }
function showCar(id) {
  if (player.mesh) { scene.remove(player.mesh); disposeModel(player.mesh); }
  const tune = carTune(id); player.mesh = makeCarModel(visualCarDef(id), carPaint(id), { neon: save.neon[id] !== false, rimStyle: tune.rimStyle, wing: tune.wing }); scene.add(player.mesh); player.mid = id;
  seatDriver(player.mesh, save.char.g, save.char.col, save.char.skin);
  if (typeof player !== 'undefined') { player.dmg = Number(save.cars[id]?.dmg) || 0; player.immobilized = player.dmg >= 100; if (typeof applyDamageVisual === 'function') applyDamageVisual(); }
}
function previewPos() {
  const s = sampleAt(12, 0); player.mesh.position.set(s.x, 0, s.z); player.mesh.rotation.set(0, s.h, 0); player.mesh.userData.flame.visible = false;
}
function clearRemotes() { Object.values(remotes).forEach(r => { scene.remove(r.mesh); disposeModel(r.mesh); }); remotes = {}; }
function buildAIs(c) {
  ais.forEach(a => { scene.remove(a.mesh); disposeModel(a.mesh); }); ais = [];
  const L = c.L, boss = c.boss, pool = c.names ? c.names.slice() : NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < c.count; i++) {
    const isB = !!boss && i === 0;
    const def = CARS[clamp(Math.floor(c.top / 7) - 3 + Math.floor(Math.random() * 3), 0, CARS.length - 1)];
    const mesh = makeCarModel(isB ? CARS[CARS.length - 1] : def, isB ? (boss === 'boss' ? 0x7a0f9a : 0x9a0f0f) : (Math.random() < 0.6 ? undefined : Math.floor(Math.random() * 0xffffff)));
    seatDriver(mesh, Math.random() < 0.5 ? 'boy' : 'girl', Math.floor(Math.random() * 6), Math.floor(Math.random() * 3));
    scene.add(mesh);
    ais.push({ name: isB ? bossName(L) : pool[i], mesh, p: 0, speed: 0, lat: 0, base: 0, isAI: true,
      skill: isB ? (boss === 'boss' ? 1.08 : 1.04) : rr(c.sk[0], c.sk[1]), aware: isB ? 1 : c.aware, boss: isB, finished: false, y: 0, airT: 0, rampCool: 0, rampT: 0, slipT: 0,
      nT: 3 + Math.random() * 6, nOn: 0, seen: new Map(), nitroOK: c.nit });
  }
}
// slot: 0..5 (ряд = slot/2). Офлайн: игрок на своём слоте, ИИ по порядку. Онлайн: слоты назначает сервер.
function placeGrid(mySlot) {
  finishOrder = []; curLaps = cfg.laps;
  const entries = [];
  if (cfg.mode === 'online') { entries.push([mySlot, player]); Object.values(remotes).forEach(r => entries.push([r.slot, r])); }
  else { let oi = 0; for (let k = 0; k <= ais.length; k++) entries.push([k, k === mySlot ? player : ais[oi++]]); }
  entries.forEach(([k, c]) => {
    const row = Math.floor(k / 2), lat = (k % 2 ? 4 : -4);
    c.p = -4 - row * 7; c.finished = false; c.speed = 0;
    const s = sampleAt(c.p, lat);
    c.mesh.position.set(s.x, 0, s.z); c.mesh.rotation.set(0, s.h, 0);
    if (c === player) {
      Object.assign(player, { h: s.h, idx: modN(c.p) | 0, steerS: 0, vx: 0, vz: 0, y: 0, vy: 0, air: false, slip: 0, nLock: false, boosting: false, lat, rampT: 0, rampY: 0 });
      camH = s.h; lastLap = -1;
    } else if (c.isAI) { c.lat = lat; c.base = lat; c.rampT = 0; c.slipT = 0; c.seen = new Map(); }
    else { c.x = s.x; c.z = s.z; c.h = s.h; c.tx = s.x; c.tz = s.z; c.th = s.h; c.ty = 0; c.y = 0; }
  });
}

// ================= ввод =================
const held = new Set();
const DEFAULT_KEYMAP = { ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'nitro', ShiftLeft: 'drift', ShiftRight: 'drift', KeyX: 'drift' };
let waitingKey = null;
const actionKeys = ['gas', 'brake', 'left', 'right', 'nitro', 'drift'];
const keyNames = { gas: 'Газ', brake: 'Тормоз', left: 'Влево', right: 'Вправо', nitro: 'Нитро', drift: 'Дрифт' };
const prettyKey = code => ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Пробел', ShiftLeft: 'Левый Shift', ShiftRight: 'Правый Shift', Escape: 'Esc', Enter: 'Enter', ControlLeft: 'Ctrl', AltLeft: 'Alt' }[code] || String(code || '').replace(/^Key/, '').replace(/^Digit/, ''));
function activeKeyMap() { const m = Object.assign({}, DEFAULT_KEYMAP); for (const [action, code] of Object.entries(save.set.keys || {})) if (code) { Object.keys(m).forEach(k => { if (m[k] === action) delete m[k]; }); m[code] = action; } return m; }
addEventListener('keydown', e => {
  if (waitingKey) {
    if (['Escape', 'Tab'].includes(e.code)) { waitingKey = null; refreshSettings(); e.preventDefault(); return; }
    save.set.keys[waitingKey] = e.code; waitingKey = null; store(); refreshSettings(); e.preventDefault(); return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (state === 'world' && worldKey(e.code)) { e.preventDefault(); return; }
  if (e.code === 'KeyR') { fixPlayer(); return; }
  const k = activeKeyMap()[e.code]; if (k) { held.add(k); e.preventDefault(); }
});
addEventListener('keyup', e => { const k = activeKeyMap()[e.code]; if (k) held.delete(k); });
let touchEditing = false, touchDrag = null;
function saveTouchPositions() { store(); }
document.querySelectorAll('.tb').forEach(b => {
  b.addEventListener('pointerdown', e => {
    if (touchEditing) {
      const id=b.dataset.button, rect=b.getBoundingClientRect();
      touchDrag={button:b,id,pointer:e.pointerId,dx:e.clientX-rect.left-rect.width/2,dy:e.clientY-rect.top-rect.height/2};
      try{b.setPointerCapture(e.pointerId);}catch(_){}
      b.classList.add('dragging'); e.preventDefault(); e.stopPropagation(); return;
    }
    const k = b.dataset.k; b.dataset.activeAction = k; held.add(k); b.classList.add('on'); e.preventDefault();
  });
  b.addEventListener('pointermove', e => {
    if (!touchEditing || !touchDrag || touchDrag.button!==b) return;
    const x=clamp((e.clientX-touchDrag.dx)/innerWidth,0.04,0.96), y=clamp((e.clientY-touchDrag.dy)/innerHeight,0.08,0.92);
    b.style.left=(x*100)+'%'; b.style.top=(y*100)+'%';
    save.set.touchPos=save.set.touchPos||{}; save.set.touchPos[touchDrag.id]={x,y}; e.preventDefault();
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, e => {
    if(touchEditing){ if(touchDrag&&touchDrag.button===b){ touchDrag=null; b.classList.remove('dragging'); saveTouchPositions(); } e.preventDefault(); return; }
    const k = b.dataset.activeAction || b.dataset.k; held.delete(k); delete b.dataset.activeAction; b.classList.remove('on'); e.preventDefault();
  }));
});
function applyTouchSettings() {
  const touch = $('touch'); touch.classList.toggle('swap', save.set.touchLayout === 'right');
  touch.classList.toggle('small-controls', save.set.touchSize === 'small'); touch.classList.toggle('large-controls', save.set.touchSize === 'large');
  touch.classList.toggle('editing', touchEditing);
  save.set.touchKeys = Object.assign({ left:'left', right:'right', nitro:'nitro', brake:'brake', drift:'drift', gas:'gas' }, save.set.touchKeys || {});
  save.set.touchPos = Object.assign({}, save.set.touchPos || {}); save.set.touchScale = Object.assign({}, save.set.touchScale || {});
  const hasCustom = Object.keys(save.set.touchPos).length > 0;
  touch.classList.toggle('has-custom-positions', hasCustom);
  document.querySelectorAll('.tb[data-button]').forEach(b => {
    const id=b.dataset.button, action = save.set.touchKeys[id] || id; b.dataset.k = action; b.title = (keyNames[action] || action) + (touchEditing ? ' · перетащить' : '');
    let q=save.set.touchPos[id];
    if(touchEditing && !q){const r=b.getBoundingClientRect();q=save.set.touchPos[id]={x:clamp((r.left+r.width/2)/innerWidth,.04,.96),y:clamp((r.top+r.height/2)/innerHeight,.08,.92)};}
    if(q){b.style.position='fixed';b.style.left=(q.x*100)+'%';b.style.top=(q.y*100)+'%';}
    else{b.style.position='';b.style.left='';b.style.top='';}
    const scale=clamp(Number(save.set.touchScale[id])||1,0.6,1.6);
    b.style.transform=(q||touchEditing?'translate(-50%,-50%) ':'')+'scale('+scale+')';
  });
  if($('touchScaleTarget')){const id=$('touchScaleTarget').value; $('touchScaleRange').value=Math.round((Number(save.set.touchScale[id])||1)*100); $('touchScaleValue').textContent=$('touchScaleRange').value+'%';}
}
$('fixBtn').addEventListener('pointerdown', e => { fixPlayer(); e.preventDefault(); });
const isTouch = matchMedia('(hover:none)').matches || navigator.maxTouchPoints > 0;
let audioReady = false;
addEventListener('pointerdown', () => { if (!audioReady) { audioReady = true; Snd.init(); Snd.setCfg(save.set.snd, save.set.mus); Snd.music(inRace() ? 'race' : 'menu'); } });
const inRace = () => state === 'race' || state === 'count' || state === 'done';
function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 1200); }

// ================= экраны =================
const SCREENS = ['menu', 'garage', 'char', 'train', 'tour', 'online', 'settings', 'help', 'result'];
const IDLE = new Set(['menu', 'garage', 'char', 'train', 'tour', 'online', 'settings', 'help']);
function show(id) { SCREENS.forEach(s => $(s).hidden = s !== id); }
function openScreen(id) { state = id; show(id); Snd.click(); if (id === 'garage') { gSel = carIdx(save.cur); renderGarage(); } if (id === 'char') renderChar(); if (id === 'train') renderTrain(); if (id === 'tour') renderTour(); if (id === 'online') renderOnline(); if (id === 'settings') refreshSettings(); }
function leaveChar() { if (charMesh) { scene.remove(charMesh); disposeModel(charMesh); charMesh = null; } if (player.mesh) { player.mesh.visible = true; seatDriver(player.mesh, save.char.g, save.char.col, save.char.skin); } }
function refreshMenu() {
  const L = save.level, th = THEMES[themeFor(L)];
  $('who').textContent = 'Гонщик: ' + save.name;
  $('lvlInfo').textContent = `Уровень ${L} · ${th.name} · ${lapsFor(L)} кр.` + (isBoss(L) ? ' · БОСС: ' + bossName(L) : isMini(L) ? ' · МИНИ-БОСС: ' + bossName(L) : '');
  $('coins').textContent = save.coins;
}
function toMenu() {
  const leavingWorld = state === 'world';
  raceId++; held.clear(); stuckT = 0; touchEditing=false; touchDrag=null;
  if (Net.isOpen()) { Net.send({ t: 'leave' }); Net.close(); }
  clearRemotes(); leaveChar();
  ['hud', 'count', 'fixBtn','minimap','worldHud','worldPhone','worldShop','touchEditDone','touchEditPanel'].forEach(i => $(i).hidden = true); $('touch').hidden = true; $('touch').classList.remove('editing'); $('fx').style.opacity = 0;
  if (worldG) worldG.visible = false; if (apartmentG) apartmentG.visible = false; worldInterior=false; worldDriving=false; worldNear=null;
  if(leavingWorld){scene.background=null;scene.fog=null;spot.visible=true;hemi.intensity=0.8;sun.intensity=0.8;}
  ais.forEach(a => { scene.remove(a.mesh); disposeModel(a.mesh); }); ais = [];
  if (leavingWorld || builtL !== save.level) { buildTrack(save.level); builtL = save.level; }
  showCar(save.cur); previewPos(); refreshMenu(); state = 'menu'; show('menu'); Snd.music('menu'); Snd.idle();
}
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Snd.click(); toMenu(); }));
$('garageBtn').onclick = () => openScreen('garage');
$('charBtn').onclick = () => openScreen('char');
$('trainBtn').onclick = () => openScreen('train');
$('tourBtn').onclick = () => openScreen('tour');
$('onlineBtn').onclick = () => openScreen('online');
$('setBtn').onclick = () => openScreen('settings');
$('helpBtn').onclick = () => openScreen('help');
$('worldBtn').onclick = startOpenWorld;
$('adminBtn').onclick = () => {
  const u = (save.set.server || '').trim().replace(/^ws(s?):\/\//i, 'http$1://');
  if (!/^https?:\/\//i.test(u)) { toast('Укажите адрес сервера в Настройках'); return; }
  window.open(u.replace(/\/+$/, '') + '/admin', '_blank');
};

// ---- гараж ----
let gSel = carIdx(save.cur);
const upCost = (id, i) => Math.round((save.cars[id].up[i] + 1) * (150 + carIdx(id) * 120));
const repCost = id => Math.ceil(save.cars[id].dmg * (4 + carIdx(id) * 4));
const PAINTS = [{n:'Заводской',c:null},{n:'Лава',c:0xff402e},{n:'Электрик',c:0x21bfff},{n:'Лайм',c:0x7dff51},{n:'Золото',c:0xffc52e},{n:'Фиолет',c:0xa86bff},{n:'Белый',c:0xf5f7fa},{n:'Графит',c:0x262b35},{n:'Мята',c:0x48e0bb},{n:'Розовый',c:0xff5ba7},{n:'Океан',c:0x1757ce}];
function renderGarage() {
  const d = CARS[gSel], own = save.cars[d.id];
  if (player.mid !== d.id) { showCar(d.id); previewPos(); }
  $('gName').textContent = d.name; $('gCoins').textContent = save.coins;
  $('gInfo').textContent = own ? (save.cur === d.id ? 'Выбрана' : 'В гараже') + ' · износ ' + Math.round(own.dmg) + '%' : 'Цена: ' + purchasePrice(d).toLocaleString('ru-RU') + ' монет';
  $('gStats').innerHTML = STATS.map(([k, name], i) => {
    const up = own ? own.up[i] : 0; let btn = '';
    if (own) btn = up >= 5 ? '<button class="btn" disabled>МАКС</button>' : `<button class="btn" data-i="${i}" ${save.coins < upCost(d.id, i) ? 'disabled' : ''}>+ ${upCost(d.id, i)}</button>`;
    return `<div class="srow"><span>${name}</span><div class="bar"><i style="width:${Math.min(100,d.s[i] / 18 * 100)}%"></i><i style="width:${up * 3.2}%"></i></div>${btn}</div>`;
  }).join('');
  const main = $('gMain');
  if (!own) { main.textContent = 'Купить'; main.disabled = save.coins < purchasePrice(d); }
  else if (save.cur !== d.id) { main.textContent = 'Выбрать'; main.disabled = false; }
  else { main.textContent = 'Выбрана'; main.disabled = true; }
  const rp = $('gRepair'); rp.hidden = !(own && own.dmg > 0.5);
  if (!rp.hidden) { rp.textContent = 'Починить · ' + repCost(d.id); rp.disabled = save.coins < repCost(d.id); }
  $('paintOptions').innerHTML = PAINTS.map(p => { const selected = (save.paint[d.id] || null) === p.c; const color = p.c === null ? '#' + d.col.toString(16).padStart(6,'0') : '#' + p.c.toString(16).padStart(6,'0'); return `<button class="paint-swatch ${selected?'sel':''}" data-paint="${p.c===null?'factory':p.c}" style="background:${color}" title="${p.n}" aria-label="${p.n}" ${own?'':'disabled'}></button>`; }).join('');
  $('gStyleBtn').textContent = 'Кузов: ' + ['Стандарт','Мускул','Суперкар','Гиперкар'][save.style[d.id] || 0]; $('gStyleBtn').disabled = !own;
  $('gNeonBtn').textContent = 'Неон: ' + (save.neon[d.id] === false ? 'выкл.' : 'вкл.'); $('gNeonBtn').disabled = !own;
  const tune = carTune(d.id), rimNames = ['Серебро','Бронза','Чёрный','Кибер','Золото'], wingNames = ['Без спойлера','Низкий','GT','Гипер','Заводской'];
  $('gRimBtn').textContent = 'Диски: ' + rimNames[((tune.rimStyle|0) + rimNames.length) % rimNames.length]; $('gRimBtn').disabled = !own;
  $('gWingBtn').textContent = 'Спойлер: ' + (tune.wing == null ? wingNames[4] : wingNames[Math.max(0, Math.min(3, tune.wing|0))]); $('gWingBtn').disabled = !own;
}
$('paintOptions').onclick = e => { const b = e.target.closest('[data-paint]'); if (!b || !save.cars[CARS[gSel].id]) return; const id=CARS[gSel].id; save.paint[id] = b.dataset.paint === 'factory' ? null : parseInt(b.dataset.paint,10); store(); showCar(id); previewPos(); renderGarage(); };
$('gStyleBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]) return; save.style[id]=((save.style[id]||0)+1)%STYLE_SHAPES.length; store(); showCar(id); previewPos(); renderGarage(); };
$('gNeonBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]) return; save.neon[id]=save.neon[id]===false; store(); showCar(id); previewPos(); renderGarage(); };
$('gRimBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]) return; const t=carTune(id); t.rimStyle=((t.rimStyle|0)+1)%5; save.tune[id]=t; store(); showCar(id); previewPos(); renderGarage(); };
$('gWingBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]) return; const t=carTune(id); t.wing=t.wing==null?0:t.wing>=3?null:t.wing+1; save.tune[id]=t; store(); showCar(id); previewPos(); renderGarage(); };
$('gStats').onclick = e => {
  const b = e.target.closest('button[data-i]'); if (!b) return;
  const id = CARS[gSel].id, i = +b.dataset.i, c = upCost(id, i);
  if (save.coins >= c && save.cars[id].up[i] < 5) { save.coins -= c; save.cars[id].up[i]++; store(); Snd.pickup(); renderGarage(); }
};
$('gMain').onclick = () => {
  const d = CARS[gSel];
  if (!save.cars[d.id]) { if (save.coins < purchasePrice(d)) return; save.coins -= purchasePrice(d); save.cars[d.id] = { up: [0, 0, 0, 0, 0, 0], dmg: 0 }; save.cur = d.id; Snd.coin(); }
  else { save.cur = d.id; Snd.click(); }
  store(); renderGarage();
};
$('gRepair').onclick = () => { const id = CARS[gSel].id, c = repCost(id); if (save.coins >= c) { save.coins -= c; save.cars[id].dmg = 0; store(); Snd.pickup(); renderGarage(); } };
$('gPrev').onclick = () => { gSel = (gSel + CARS.length - 1) % CARS.length; Snd.click(); renderGarage(); };
$('gNext').onclick = () => { gSel = (gSel + 1) % CARS.length; Snd.click(); renderGarage(); };

// ---- персонаж ----
function renderChar() {
  if (charMesh) { scene.remove(charMesh); disposeModel(charMesh); }
  player.mesh.visible = false;
  charMesh = makeCharacter(save.char.g, save.char.col, save.char.skin, false);
  charMesh.position.copy(player.mesh.position); scene.add(charMesh);
  $('chBoy').classList.toggle('sel', save.char.g === 'boy'); $('chGirl').classList.toggle('sel', save.char.g === 'girl');
  const sw = (arr, key) => arr.map((c, i) => `<button class="sw ${save.char[key] === i ? 'sel' : ''}" data-k="${key}" data-i="${i}" style="background:${hex(c)}"></button>`).join('');
  $('chCols').innerHTML = sw(OUTFITS, 'col'); $('chSkin').innerHTML = sw(SKINS, 'skin');
}
$('chBoy').onclick = () => { save.char.g = 'boy'; store(); renderChar(); };
$('chGirl').onclick = () => { save.char.g = 'girl'; store(); renderChar(); };
$('char').addEventListener('click', e => { const b = e.target.closest('.sw'); if (b) { save.char[b.dataset.k] = +b.dataset.i; store(); renderChar(); } });
$('chDone').onclick = () => { leaveChar(); toMenu(); };

// ---- тренировка ----
let trDiff = 0, trTheme = 0;
function renderTrain() {
  $('trDiffs').innerHTML = DIFFS.map((d, i) => { const lock = save.level < d.unlock; return `<button class="btn ${trDiff === i ? 'sel' : ''}" data-d="${i}" ${lock ? 'disabled' : ''}>${d.n}${lock ? ' 🔒 ур. ' + d.unlock : ''}</button>`; }).join('');
  $('trThemes').innerHTML = THEMES.map((t, i) => `<button class="btn ${trTheme === i ? 'sel' : ''}" data-t="${i}">${t.name}</button>`).join('');
}
$('train').addEventListener('click', e => {
  const d = e.target.closest('[data-d]'), t = e.target.closest('[data-t]');
  if (d && !d.disabled) { trDiff = +d.dataset.d; renderTrain(); } if (t) { trTheme = +t.dataset.t; renderTrain(); }
});
$('trStart').onclick = () => { const D = DIFFS[trDiff], L = trTheme * 5 + 1 + Math.floor(Math.random() * 4); startRace({ mode: 'train', L, laps: 3, top: D.top, sk: D.sk, aware: D.aware, nit: trDiff >= 2, count: 5, rubber: trDiff < 4, boss: '' }); };

// ---- турниры ----
function renderTour() {
  $('tourList').innerHTML = TOURS.map(t => {
    const lock = save.level < t.unlock, act = save.tour && save.tour.id === t.id;
    const st = lock ? `🔒 откроется на уровне ${t.unlock}` : act ? `Гонка ${save.tour.race + 1}/${t.Ls.length}` : `Призы: ${t.prize.join(' / ')}`;
    return `<div class="card"><b>${t.name}</b><div class="muted">${t.desc}</div><div class="muted">${st}</div><button class="btn" data-id="${t.id}" ${lock ? 'disabled' : ''}>${act ? 'Продолжить' : (save.tour ? 'Начать (сбросит текущий)' : 'Начать')}</button></div>`;
  }).join('');
}
$('tourList').onclick = e => { const b = e.target.closest('button[data-id]'); if (b && !b.disabled) startTour(b.dataset.id); };
function startTour(id) {
  const def = TOURS.find(t => t.id === id);
  if (!save.tour || save.tour.id !== id) save.tour = { id, race: 0, pts: {}, names: NAMES.slice().sort(() => Math.random() - 0.5).slice(0, 5) };
  store(); const r = save.tour.race;
  startRace({ mode: 'tour', L: def.Ls[r], laps: 3, top: def.top + r * def.inc, sk: [0.95, 1.03], aware: 0.85, nit: true, count: 5, rubber: true, boss: '', names: save.tour.names });
}

// ---- настройки ----
const GFX = { auto: 'Авто · FPS', verylow: 'Очень низкая', low: 'Низкая', med: 'Средняя', high: 'Высокая', veryhigh: 'Очень высокая', ultra: 'Ультра', rt: 'Трассировка лучей*' };
function renderKeyBindings() {
  $('keyBindings').innerHTML = actionKeys.map(a => `<button class="btn" data-key-action="${a}">${keyNames[a]}: <b>${waitingKey===a?'Нажмите клавишу…':prettyKey(save.set.keys[a])}</b></button>`).join('');
  const opts = actionKeys.map(a => `<option value="${a}">${keyNames[a]}</option>`).join('');
  save.set.touchKeys = Object.assign({ left:'left', right:'right', nitro:'nitro', brake:'brake', drift:'drift', gas:'gas' }, save.set.touchKeys || {});
  $('touchBindings').innerHTML = ['left','right','nitro','brake','drift','gas'].map(b => `<label class="touch-bind-row"><span>${({left:'Левая кнопка руля',right:'Правая кнопка руля',nitro:'Кнопка N',brake:'Кнопка ▼',drift:'Кнопка DRIFT',gas:'Кнопка ▲'})[b]}</span><select data-touch-button="${b}">${opts.replace(`value="${save.set.touchKeys[b]}"`,`value="${save.set.touchKeys[b]}" selected`)}</select></label>`).join('');
}
function refreshSettings() {
  $('nameIn').value = save.name; $('srvIn').value = save.set.server || '';
  $('sndBtn').textContent = save.set.snd ? 'Вкл' : 'Выкл'; $('musBtn').textContent = save.set.mus ? 'Вкл' : 'Выкл';
  $('gfxBtn').textContent = GFX[save.set.gfx] || GFX.auto; $('themeBtn').textContent = save.set.theme === 'light' ? 'Светлая' : 'Тёмная';
  $('touchLayoutBtn').textContent = save.set.touchLayout === 'right' ? 'Руль справа' : 'Руль слева';
  $('touchSizeBtn').textContent = ({small:'Маленькие',normal:'Обычные',large:'Большие'})[save.set.touchSize] || 'Обычные';
  $('settingsAccountName').textContent = 'Аккаунт: ' + (localStorage.getItem('tr_account_name') || save.name || 'не определён');
  document.body.classList.toggle('light', save.set.theme === 'light'); Snd.setCfg(save.set.snd, save.set.mus); renderKeyBindings(); applyTouchSettings();
}
$('keyBindings').onclick = e => { const b=e.target.closest('[data-key-action]'); if(!b) return; waitingKey=b.dataset.keyAction; renderKeyBindings(); toast('Нажмите новую клавишу · Esc отмена'); };
$('touchBindings').onchange = e => { const sel=e.target.closest('[data-touch-button]'); if(!sel) return; save.set.touchKeys[sel.dataset.touchButton]=sel.value; store(); applyTouchSettings(); };
$('setBack').onclick = () => { save.name = ($('nameIn').value.trim() || 'Гонщик').slice(0, 14); save.set.server = $('srvIn').value.trim(); store(); toMenu(); };
$('sndBtn').onclick = () => { save.set.snd = save.set.snd ? 0 : 1; store(); refreshSettings(); };
$('musBtn').onclick = () => { save.set.mus = save.set.mus ? 0 : 1; store(); refreshSettings(); };
$('gfxBtn').onclick = () => { const k = ['auto','verylow','low','med','high','veryhigh','ultra','rt']; save.set.gfx = k[(k.indexOf(save.set.gfx) + 1) % k.length]; adaptiveScale=1; store(); refreshSettings(); applyGfx(); builtL = -1; toast('Графика: '+GFX[save.set.gfx]); };
$('themeBtn').onclick = () => { save.set.theme = save.set.theme === 'light' ? 'dark' : 'light'; store(); refreshSettings(); };
$('touchLayoutBtn').onclick = () => { save.set.touchLayout = save.set.touchLayout === 'right' ? 'left' : 'right'; store(); refreshSettings(); };
$('touchSizeBtn').onclick = () => { const k=['normal','small','large']; save.set.touchSize=k[(k.indexOf(save.set.touchSize||'normal')+1)%k.length]; store(); refreshSettings(); };
$('editTouchBtn').onclick = () => {
  touchEditing=true; $('touchEditHint').hidden=false; $('touchEditDone').hidden=false; $('touchEditPanel').hidden=false; $('touch').hidden=false; $('hud').hidden=true;
  show(null); state='touchsetup'; applyTouchSettings(); syncTouchEditorSize(); toast('Перетащи кнопки в удобные места');
};
$('touchScaleTarget').onchange = () => applyTouchSettings();
$('touchScaleRange').oninput = () => { const id=$('touchScaleTarget').value; save.set.touchScale=save.set.touchScale||{}; save.set.touchScale[id]=clamp(Number($('touchScaleRange').value)/100,0.6,1.6); $('touchScaleValue').textContent=$('touchScaleRange').value+'%'; document.querySelectorAll('.tb[data-button]').forEach(b=>{if(b.dataset.button===id)b.style.transform=(save.set.touchPos&&save.set.touchPos[id]?'translate(-50%,-50%) ':'')+'scale('+save.set.touchScale[id]+')';}); store(); };
$('touchResetBtn').onclick = () => { save.set.touchPos={}; save.set.touchScale={}; store(); applyTouchSettings(); toast('Расположение и размер кнопок сброшены'); };
function syncTouchEditorSize(){const id=$('touchEditTarget').value;const v=Math.round((Number((save.set.touchScale||{})[id])||1)*100);$('touchEditRange').value=v;$('touchEditValue').textContent=v+'%';}
$('touchEditTarget').onchange=syncTouchEditorSize;
$('touchEditRange').oninput=()=>{const id=$('touchEditTarget').value;save.set.touchScale=save.set.touchScale||{};save.set.touchScale[id]=clamp(Number($('touchEditRange').value)/100,.6,1.6);$('touchEditValue').textContent=$('touchEditRange').value+'%';const b=document.querySelector('.tb[data-button="'+id+'"]');if(b)b.style.transform='translate(-50%,-50%) scale('+save.set.touchScale[id]+')';store();};
$('touchEditReset').onclick=()=>{save.set.touchPos={};save.set.touchScale={};store();applyTouchSettings();syncTouchEditorSize();toast('Экранные кнопки сброшены');};
$('touchEditDone').onclick = () => {
  touchEditing=false; touchDrag=null; saveTouchPositions(); $('touchEditHint').hidden=true; $('touchEditDone').hidden=true; $('touchEditPanel').hidden=true; $('touch').hidden=true;
  applyTouchSettings(); state='settings'; show('settings'); refreshSettings(); toast('Расположение кнопок сохранено');
};
$('changePassBtn').onclick = async () => { const cur=$('currentPass').value, next=$('newPass').value; if(next.length<6){toast('Новый пароль: минимум 6 символов');return;} try { const r=await window.TRAccount.changePassword(cur,next); $('currentPass').value=''; $('newPass').value=''; toast(r.message || 'Пароль изменён'); } catch(e) { toast(e.message || 'Не удалось сменить пароль'); } };
$('logoutAccountBtn').onclick = async () => { if(window.TRAccount) await window.TRAccount.logout(); };
$('copyAccountNameBtn').onclick = async () => { const n=localStorage.getItem('tr_account_name') || save.name || ''; if(!n || n==='Гонщик'){toast('Сначала войдите в аккаунт');return;} try { await navigator.clipboard.writeText(n); toast('Имя аккаунта скопировано'); } catch(_) { toast('Имя аккаунта: '+n); } };
$('resetBtn').onclick = () => { if (confirm('Удалить весь игровой прогресс? Аккаунт останется.')) { const s = save.set, n = save.name; save = defSave(); save.set = s; save.name = n; store(); builtL = -1; toMenu(); } };

// ================= онлайн =================
let myId = 0, onlinePlace = 0, sendT = 0, connecting = false, privateRoom = null, pendingInvite = new URLSearchParams(location.search).get('room') || '';
const inviteUrl = code => `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
function showRoomLobby(m) { privateRoom = { code:m.code, host:!!m.host, maxPlayers:m.maxPlayers||6 }; if(privateRoom.host) $('roomSize').value=String(privateRoom.maxPlayers); $('roomLobby').hidden=false; $('roomTitle').textContent=`Комната ${m.code}`; $('roomInvite').value=inviteUrl(m.code); $('roomMembers').textContent=`Игроки: ${(m.players||[]).length}/${privateRoom.maxPlayers} · ${(m.players||[]).map(p=>p.name).join(', ')}`; $('roomStart').hidden=!privateRoom.host; $('roomStart').disabled=(m.players||[]).length<2; $('roomSize').disabled=!privateRoom.host; $('roomLeave').hidden=false; setOn(privateRoom.host?'Вы создали комнату. Отправьте ссылку друзьям и нажмите «Начать гонку».':'Вы в комнате. Дождитесь запуска владельцем.'); }
function setOn(t) { $('onStatus').textContent = t; }
function renderOnline() { wakeServer(); setOn(save.set.server ? 'Выберите быструю гонку или создайте комнату.' : 'Укажите адрес сервера в Настройках (wss://…onrender.com)'); $('onFind').disabled = false; $('roomLobby').hidden=!privateRoom; $('roomSize').disabled=!!privateRoom; }
const httpBase = u => u.trim().replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '');
function wakeServer() { // бесплатный хостинг засыпает: «будим» его заранее обычным запросом
  const u = (save.set.server || '').trim();
  if (/^wss?:\/\//i.test(u)) { try { fetch(httpBase(u) + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) {} }
}
let connectAbort = false;
function helloPacket() { const t=carTune(save.cur); return { t:'hello', name:save.name, carId:save.cur, gender:save.char.g, outfit:save.char.col, skin:save.char.skin, paint:carPaint(save.cur), style:save.style[save.cur]||0, neon:save.neon[save.cur]!==false, rimStyle:t.rimStyle|0, wing:t.wing }; }
async function connectOnlineAction(action, payload={}) {
  const url=(save.set.server||'').trim();
  if(!/^wss?:\/\//i.test(url)){setOn('Укажите адрес сервера в Настройках (wss://…)');return;}
  if(connecting) return;
  if(privateRoom && action!=='startRoom'){setOn('Вы уже находитесь в комнате. Сначала выйдите из неё.');return;}
  connecting=true;connectAbort=false;['onFind','roomCreate','roomJoin'].forEach(id=>$(id).disabled=true);
  const t0=Date.now();let ok=Net.isOpen();
  const tick=setInterval(()=>setOn(`Подключение к серверу… ${Math.round((Date.now()-t0)/1000)} с`),1000);
  try {
    if(ok){Net.send({t:'cancel'});}
    else {
      Net.close();
      while(!ok&&!connectAbort&&Date.now()-t0<90000){Net.wake(url);try{await Net.connect(url,8000);ok=true;}catch(e){await new Promise(r=>setTimeout(r,1300));}}
    }
    if(ok&&!connectAbort){Net.send(helloPacket());Net.send(Object.assign({t:action},payload));
      if(action==='queue')setOn('Ищем соперников…');
      else if(action==='createRoom')setOn('Создаём комнату…');
      else if(action==='joinRoom')setOn('Подключаемся к комнате…');
    } else if(!connectAbort)setOn('Не удалось подключиться к серверу. Проверьте адрес в Настройках.');
  } finally {clearInterval(tick);connecting=false;['onFind','roomCreate','roomJoin'].forEach(id=>$(id).disabled=!ok||connectAbort);}
}
$('onFind').onclick = () => connectOnlineAction('queue');
$('roomCreate').onclick = () => connectOnlineAction('createRoom',{maxPlayers:+$('roomSize').value||4});
$('roomJoin').onclick = () => { const code=$('roomCode').value.trim()||pendingInvite; if(!code){setOn('Введите код комнаты или откройте ссылку-приглашение.');return;} connectOnlineAction('joinRoom',{code}); };
$('roomStart').onclick = () => { if(privateRoom && privateRoom.host) Net.send({t:'startRoom'}); };
$('roomLeave').onclick = () => { Net.send({t:'leave'}); privateRoom=null; $('roomLobby').hidden=true; $('roomSize').disabled=false; setOn('Вы вышли из комнаты.'); };
$('copyInvite').onclick = async () => { const url=$('roomInvite').value; try { await navigator.clipboard.writeText(url); setOn('Ссылка скопирована. Отправьте её друзьям.'); } catch(_) { $('roomInvite').focus(); $('roomInvite').select(); setOn('Ссылка выделена — скопируйте её вручную.'); } };
$('onCancel').onclick = () => { connectAbort=true; Net.send({t:'cancel'}); if(privateRoom)Net.send({t:'leave'}); Net.close(); privateRoom=null; $('roomLobby').hidden=true; renderOnline(); };
Net.on('welcome', m => { myId = m.id; });
Net.on('queue', m => setOn(`В очереди: ${m.n} · онлайн: ${m.online}. Ждём соперников…`));
Net.on('roomLobby', showRoomLobby);
Net.on('roomError', m => setOn(m.error || 'Не удалось выполнить действие с комнатой.'));
Net.on('roomClosed', m => { privateRoom=null; $('roomLobby').hidden=true; setOn(m.reason||'Комната закрыта.'); });
Net.on('bump', m => { if (state !== 'race') return; const from = remotes[m.from]; if (from && (from.hitCooldown || 0) > 0) return; if(from)from.hitCooldown=0.62; player.speed *= 0.70; player.vx *= 0.70; player.vz *= 0.70; collisionCooldown = 0.62; Snd.bump(); });
Net.on('msg', m => toast(m.text));
Net.on('kick', m => { Net.close(); toast(m.reason || 'Отключено'); if (inRace() || state === 'online') toMenu(); });
Net.on('close', () => { privateRoom=null; $('roomLobby').hidden=true; if (state === 'race' || state === 'count') { toast('Соединение потеряно'); toMenu(); } });
Net.on('left', m => { const r = remotes[m.id]; if (r) { scene.remove(r.mesh); delete remotes[m.id]; } if(privateRoom) $('roomMembers').textContent='Игрок покинул комнату'; });
Net.on('place', m => { onlinePlace = m.place; });
Net.on('onlineList', m => {
  const el=$('onlinePlayers'); if(!el) return;
  const unique=new Map();
  for(const p of (m.players||[])){
    if(p.id===myId) continue;
    const key=String(p.name||'Гонщик').toLocaleLowerCase('ru');
    if(!unique.has(key)) unique.set(key,p);
  }
  el.innerHTML=[...unique.values()].slice(0,18).map(p=>`<div class="card"><b>${String(p.name).replace(/[&<>"']/g,'')}</b><div class="muted">${p.status}</div></div>`).join('') || '<p class="sub">Пока никого нет</p>';
});
window.addEventListener('tr-account-login', () => { if(pendingInvite){ const code=pendingInvite; pendingInvite=''; setTimeout(()=>{openScreen('online'); $('roomCode').value=code; connectOnlineAction('joinRoom',{code});},120); } });
Net.on('snap', m => {
  for (const [id, x, z, h, s, p, y, f] of m.p) { const r = remotes[id]; if (r) { r.tx = x; r.tz = z; r.th = h; r.ty = y; r.speed = s; r.p = p; r.finished = !!f; } }
});
Net.on('room', m => {
  privateRoom=null; $('roomLobby').hidden=true; $('roomSize').disabled=false; Snd.init(); const L = m.L;
  cfg = { mode: 'online', L, laps: m.laps, count: 0, boss: '', seed: m.seed };
  buildTrack(L, m.seed || L * 977 + 13); builtL = L;
  clearRemotes(); ais.forEach(a => { scene.remove(a.mesh); disposeModel(a.mesh); }); ais = [];
  m.players.forEach(p => {
    if (p.id === myId) return;
    const rd=carDef(p.carId), rshape=STYLE_SHAPES[p.style||0], remoteDef=rshape&&rshape!=='original'?Object.assign({},rd,{shape:rshape}):rd; const mesh = makeCarModel(remoteDef, p.paint, {neon:p.neon!==false, rimStyle:p.rimStyle|0, wing:p.wing}); seatDriver(mesh, p.gender, p.outfit, p.skin); scene.add(mesh);
    remotes[p.id] = { isRemote: true, id: p.id, name: p.name, slot: p.slot, mesh, x: 0, z: 0, h: 0, y: 0, tx: 0, tz: 0, th: 0, ty: 0, p: 0, speed: 0, lat: 0, finished: false };
  });
  onlinePlace = 0; beginRace(m.you, m.startIn);
});

// ================= гонка =================
function startRace(c) {
  Snd.init(); cfg = c; Snd.setTheme(themeFor(c.L));
  if (c.mode === 'online') { buildTrack(c.L, c.seed || c.L * 977 + 13); builtL = c.L; } else { buildTrack(c.L); builtL = c.L; }
  clearRemotes(); buildAIs(c); onlinePlace = 0;
  beginRace(c.count, 3000);
}
function beginRace(mySlot, startIn) {
  leaveChar(); showCar(save.cur); phys = physFor(save.cur); player.dmg = save.cars[save.cur].dmg; player.immobilized=player.dmg>=100; player.engineStall=0; applyDamageVisual();
  if (cfg.mode !== 'online') mySlot = ais.length;     // игрок на последнем месте решётки
  placeGrid(mySlot); resetItems();
  nitro = phys.nCap; raceCoins = 0; raceStartedAt = performance.now(); player.finished = false; stuckT = 0; fixCool = 0; held.clear();
  state = 'count'; show(null); $('hud').hidden = false; $('minimap').hidden=false; $('worldHud').hidden=true; $('touch').hidden = !isTouch; $('fixBtn').hidden = true;
  const L = cfg.L, tag = $('bossTag');
  tag.hidden = !cfg.boss; tag.textContent = (cfg.boss === 'boss' ? 'БОСС: ' : 'МИНИ-БОСС: ') + bossName(L);
  Snd.music('race');
  const id = ++raceId, c = $('count'); c.hidden = false; c.textContent = '';
  const base = Math.max(0, startIn - 3000);
  [['3', 0], ['2', 1000], ['1', 2000], ['GO!', 3000]].forEach(([t, ms]) => setTimeout(() => {
    if (id !== raceId) return;
    c.textContent = t; Snd.countdown(t === 'GO!');
    if (t === 'GO!') { state = 'race'; setTimeout(() => { if (id === raceId) c.hidden = true; }, 700); }
  }, base + ms));
}
function startCareer() {
  const L = save.level;
  startRace({ mode: 'career', L, laps: lapsFor(L), top: 44 + Math.min(L, 45) * 1.05, sk: [0.92, 1.0], aware: 0.75 + Math.min(L, 40) * 0.006, nit: L >= 5, count: 5, rubber: true, boss: isBoss(L) ? 'boss' : isMini(L) ? 'mini' : '' });
}
$('startBtn').onclick = startCareer;
$('quitBtn').onclick = toMenu;
$('toMenu').onclick = toMenu;

function applyDamageVisual() {
  if (!player.mesh || !player.mesh.userData) return;
  const u=player.mesh.userData;
  (u.damageMarks||[]).forEach(x => { x.mesh.visible = player.dmg >= x.threshold; });
  if(u.damageSmoke){u.damageSmoke.visible=player.dmg>=72;u.damageSmoke.material.opacity=player.dmg>=90?0.48:0.2;u.damageSmoke.scale.setScalar(player.dmg>=90?2.2:1.25);}
  if(u.damageBumper){u.damageBumper.rotation.x=player.dmg>=84?-0.32:player.dmg>=68?-0.13:0;u.damageBumper.position.y=player.dmg>=84?0.12:0.29;}
  if(u.damageChip){u.damageChip.rotation.z=player.dmg>=82?0.42:0.12;u.damageChip.position.x=player.dmg>=82?-u.S.w*0.34:-u.S.w*0.31;}
  document.body.classList.toggle('crash-dark', player.dmg>=80);
}
function setDamage(value) {
  const before=player.dmg; player.dmg=clamp(Number(value)||0,0,100);
  if(save.cars[save.cur]) save.cars[save.cur].dmg=player.dmg;
  phys=physFor(save.cur); applyDamageVisual();
  if(player.dmg>=100 && !player.immobilized){player.immobilized=true;player.speed=0;player.vx=0;player.vz=0;toast('КРИТИЧЕСКАЯ ПОЛОМКА — вызови эвакуатор (R) или найди ремонт');}
  else if(player.dmg>=86 && before<86 && Math.random()<0.65){player.engineStall=rr(1.4,3.4);player.speed*=0.18;toast('Двигатель заглох от сильного удара!');}
}
function addDmg(v) { setDamage(player.dmg + Math.max(0,Number(v)||0)); }
const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

function fixPlayer() {
  if ((state !== 'race' && state !== 'world') || fixCool > 0) return;
  fixCool = 1.5;
  if(player.immobilized){setDamage(Math.max(0,player.dmg-32));player.immobilized=false;player.engineStall=0;toast('Эвакуатор: двигатель запущен, но машина повреждена');} const m = player.mesh.position, [bi] = nearest(m, player.idx), s = sampleAt(bi + 2, 0);
  m.set(s.x, 0, s.z); Object.assign(player, { h: s.h, speed: 0, vx: 0, vz: 0, y: 0, vy: 0, air: false, slip: 0, rampT: 0, steerS: 0 });
  camH = s.h; stuckT = 0; toast('Машина выровнена'); Snd.pickup();
}

function updatePlayer(dt) {
  const racing = state === 'race', P = phys;
  player.engineStall = Math.max(0, player.engineStall - dt); player.rampCooldown = Math.max(0, player.rampCooldown - dt);
  const disabledEngine = player.immobilized || player.engineStall > 0;
  const gas = racing && held.has('gas') && !disabledEngine, brk = racing && held.has('brake'), drift = racing && held.has('drift');
  let steer = racing ? (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) : 0;

  if (player.nLock && nitro >= P.nCap * 0.25) player.nLock = false;
  const boost = racing && held.has('nitro') && !player.nLock && nitro > 0;
  if (boost) { nitro = Math.max(0, nitro - 38 * dt); if (nitro <= 0) player.nLock = true; if (!player.boosting) Snd.nitro(); }
  else nitro = Math.min(P.nCap, nitro + 6 * dt);
  player.boosting = boost;

  const m = player.mesh.position;
  const [bi, dist] = nearest(m, player.idx);
  const off = dist > ROAD_W + 0.5 && !player.air;
  player.rampT = Math.max(0, player.rampT - dt);
  const max = P.max * (boost ? P.nPow : 1) * (off ? 0.88 : 1) * (player.rampT > 0 ? 1.4 : 1);

  if (!player.air) {
    if (gas || boost) player.speed += P.acc * (boost ? 1.9 : 1) * (1 - clamp(player.speed / max, 0, 1)) * dt;
    if (brk) player.speed -= (player.speed > 0 ? P.brk : 14) * dt;
    if (drift) { player.speed -= Math.max(7, Math.abs(player.speed) * 0.20) * dt; player.skid = Math.min(1, (player.skid || 0) + 2.5 * dt); } else player.skid = Math.max(0, (player.skid || 0) - 3 * dt);
    if (drift && Math.abs(player.steerS) > 0.15 && Math.abs(player.speed) > 18) { player.h -= player.steerS * 0.42 * dt; player.slip = Math.max(0, player.slip - dt); }
    if (!gas && !brk && !boost) player.speed -= player.speed * 0.35 * dt;
    if (player.speed > max) player.speed -= Math.max(25, (player.speed - max) * 2) * dt;
    if (off) player.speed -= player.speed * 0.12 * dt;
  }
  player.speed = Math.max(player.speed, -14);
  if (player.immobilized) { player.speed = 0; player.vx *= Math.max(0,1-8*dt); player.vz *= Math.max(0,1-8*dt); }
  else if (player.engineStall > 0) { player.speed *= Math.max(0,1-2.4*dt); }

  if (player.slip > 0) { player.slip -= dt; player.h += player.spin * 7 * dt; player.speed -= player.speed * 0.9 * dt; steer = 0; }
  player.steerS += (steer - player.steerS) * Math.min(1, 8 * dt);
  const sp = Math.abs(player.speed);
  if (!player.air) player.h -= player.steerS * P.hnd * 1.25 * clamp(sp / 18, 0, 1) / (1 + sp / 55) * dt * (player.speed >= 0 ? 1 : -1);

  const fx = Math.sin(player.h) * player.speed, fz = Math.cos(player.h) * player.speed;
  const weatherGrip = envInfo.weather === 'Дождь' ? 0.80 : envInfo.weather === 'Туман' ? 0.96 : 1;
  const g = player.air ? 0.3 : player.slip > 0 ? 0.7 : P.grip * (off ? 0.6 : 1) * weatherGrip, k = Math.min(1, g * dt);
  player.vx += (fx - player.vx) * k; player.vz += (fz - player.vz) * k;
  let skid = 0;
  if (!player.air) { skid = Math.abs(player.vx * Math.cos(player.h) - player.vz * Math.sin(player.h)); player.speed -= skid * 0.35 * dt; }
  player.skid = player.slip > 0 ? 0.1 : skid / 25;
  m.x += player.vx * dt; m.z += player.vz * dt;

  if (player.air) {
    player.y += player.vy * dt; player.vy -= 24 * dt;
    if (player.y <= 0) { player.y = 0; player.vy = 0; player.air = false; player.speed *= 0.95; Snd.land(); }
  }
  m.y = player.y;

  wallT -= dt;
  const wc = pos[bi], wt = tan[bi];
  const signedLat = (m.x - wc.x) * wt.z - (m.z - wc.z) * wt.x;
  if (Math.abs(signedLat) > WALL) {
    const side = signedLat >= 0 ? 1 : -1, limit = WALL - 0.12;
    // Ставим машину на границу дорожного коридора вдоль нормали трассы — не в центр кривой.
    m.x = wc.x + wt.z * limit * side; m.z = wc.z - wt.x * limit * side;
    const vn = player.vx * wt.z - player.vz * wt.x; // скорость по нормали к борту
    if (vn * side > 0.025) {
      // Reflect the outward component along the track normal; do not multiply by side twice.
      // This used to invert the response on one side and could pin the car against the barrier.
      const reflected = -vn * 0.46;
      player.vx += (reflected - vn) * wt.z;
      player.vz -= (reflected - vn) * wt.x;
      const mag = Math.hypot(player.vx, player.vz);
      if (mag > 0.55) { player.speed = mag * 0.9; player.h = Math.atan2(player.vx, player.vz); }
      else { player.speed = 0; player.vx = 0; player.vz = 0; }
      if (wallT <= 0 && racing) {
        wallT = 0.32; Snd.bump(); const impact = clamp(Math.abs(vn) * 0.28, 0.8, 7.5); addDmg(impact);
        spawnSparks(m.x, m.y + 0.55, m.z, clamp(Math.floor(Math.abs(vn)*1.1),6,20));
      }
    }
  }

  player.mesh.rotation.y = player.h;
  player.mesh.rotation.z = -player.steerS * Math.min(sp / 60, 1) * 0.05;
  player.mesh.rotation.x = player.air ? -clamp(player.vy / 40, -0.4, 0.4) : 0;
  const ud = player.mesh.userData;
  ud.wheels.forEach(w => w.rotation.x += player.speed * dt / 0.4);
  ud.tailMat.color.setHex(brk ? 0xff5050 : 0xaa1010);
  ud.flame.visible = boost; if (boost) ud.flame.scale.set(1, 1, 0.7 + Math.random() * 0.6);

  // прогресс накапливается разностью индексов: устойчиво к стартовой линии и объездам
  player.p += sdiff(bi, player.idx); player.idx = bi;
  const lp = Math.floor(player.p / N);
  if (lp > lastLap) { lastLap = lp; resetItems(); if (lp >= 1 && lp < curLaps) { toast('Круг ' + (lp + 1)); Snd.lap(); } }
  player.lat = (m.x - pos[bi].x) * tan[bi].z - (m.z - pos[bi].z) * tan[bi].x;
}

function updateAI(a, dt) {
  const racing = state === 'race' || state === 'done', ip = modN(a.p), i = ip | 0;
  const ang = Math.acos(clamp(tan[i].x * tan[(i + 14) % N].x + tan[i].z * tan[(i + 14) % N].z, -1, 1));
  const curv = 1 - Math.min(0.4, ang * 1.2);
  const gap = a.p - player.p;
  const rubber = a.boss || !cfg.rubber ? 1 : 1 - clamp(gap * 0.0006, -0.06, 0.1);
  a.nT -= dt; if (a.nT <= 0) { a.nOn = a.nitroOK ? 1.4 : 0; a.nT = 8 + Math.random() * 7; }
  const nit = a.nOn > 0 ? 1.12 : 1; a.nOn -= dt; a.rampT = Math.max(0, a.rampT - dt); a.slipT = Math.max(0, a.slipT - dt);
  let target = racing ? cfg.top * a.skill * curv * rubber * nit * (a.rampT > 0 ? 1.4 : 1) * (a.slipT > 0 ? 0.5 : 1) : 0;

  // объезд ловушек — только если ИИ их «заметил» (зависит от сложности); иначе может врезаться
  let tl = a.base;
  for (const it of items) if (it.on && (it.type === 'oil' || it.type === 'cone')) {
    const d = sdiff(it.idx, ip);
    if (d > 2 && d < 22 && Math.abs(it.lat - a.lat) < 3.2) {
      if (!a.seen.has(it)) a.seen.set(it, Math.random() < a.aware);
      if (a.seen.get(it)) tl = it.lat > 0 ? it.lat - 4.4 : it.lat + 4.4;
    }
    if (racing && Math.abs(d) < 1.1 && Math.abs(it.lat - a.lat) < 2.1 && a.slipT <= 0) {
      if (it.type === 'oil') { a.slipT = 1.2; a.lat += (Math.random() < 0.5 ? 1 : -1) * 2; }
      else { it.on = false; it.mesh.visible = false; a.slipT = 0.5; a.speed *= 0.5; }
      a.seen.delete(it);
    }
  }
  for (const o of all()) if (o !== a && o.p !== undefined) {
    const d = sdiff(o.p, a.p);
    if (d > 0 && d < 14 && Math.abs((o.lat || 0) - a.lat) < 2.8) {
      tl = a.lat > (o.lat || 0) ? (o.lat || 0) + 3.6 : (o.lat || 0) - 3.6;
      if (d < 7 && Math.abs((o.lat || 0) - a.lat) < 1.8) target = Math.min(target, o.speed + 2);
    }
  }
  if (a.slipT > 0) tl += Math.sin(a.slipT * 14) * 1.5;
  tl = clamp(tl, -6.2, 6.2);
  a.lat += clamp(tl - a.lat, -5 * dt, 5 * dt);
  a.speed += (target - a.speed) * Math.min(1, 1.6 * dt);
  a.p += a.speed * dt / SP;

  a.rampCool -= dt; if (a.airT > 0) a.airT -= dt;
  else if (a.rampCool <= 0 && racing) for (const it of items) if (it.type === 'ramp' && Math.abs(sdiff(it.idx, ip)) < 1.7 && Math.abs(it.lat - a.lat) < 3.4) { a.airT = 0.95; a.rampCool = 3.1; a.rampT = 2.7; a.speed = Math.max(a.speed, 18) * 1.18; break; }
  a.y = a.airT > 0 ? Math.sin((1 - a.airT / 0.9) * Math.PI) * 2.2 : 0;

  const s = sampleAt(a.p, a.lat);
  a.mesh.position.set(s.x, a.y, s.z); a.mesh.rotation.set(0, s.h + (a.slipT > 0 ? Math.sin(a.slipT * 10) * 0.5 : 0), 0);
  const u = a.mesh.userData; u.wheels.forEach(w => w.rotation.x += a.speed * dt / 0.4); u.flame.visible = (a.nOn > 0 || a.rampT > 0) && racing;
}

function updateRemotes(dt) {
  for (const r of Object.values(remotes)) {
    const k = 1 - Math.exp(-11.5 * dt);
    if (Math.hypot(r.tx - r.x, r.tz - r.z) > 100) { r.x = r.tx; r.z = r.tz; }
    r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.y += (r.ty - r.y) * k; r.h += angDiff(r.th, r.h) * Math.min(1, 1 - Math.exp(-9.5 * dt));
    r.mesh.position.set(r.x, r.y, r.z); r.mesh.rotation.y = r.h; r.mesh.userData.wheels.forEach(w => w.rotation.x += r.speed * dt / 0.4);
  }
}

let collisionCooldown = 0, impactBursts = [];
function spawnSparks(x,y,z,count=12) {
  if (resolvedGfx()==='verylow' || resolvedGfx()==='low') count=Math.min(count,8);
  while(impactBursts.length>=7){const old=impactBursts.shift();scene.remove(old.points);old.geometry.dispose();old.material.dispose();}
  const positions=new Float32Array(count*3), velocities=[];
  for(let i=0;i<count;i++){positions[i*3]=x;positions[i*3+1]=y;positions[i*3+2]=z;const a=Math.random()*Math.PI*2,sp=4+Math.random()*15;velocities.push([Math.cos(a)*sp,2+Math.random()*8,Math.sin(a)*sp]);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:0xffb348,size:resolvedGfx()==='rt'?0.36:0.27,transparent:true,opacity:0.95,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);impactBursts.push({points,geometry,material,velocities,life:0.38,age:0});
}
function updateImpactBursts(dt){
  for(let i=impactBursts.length-1;i>=0;i--){const b=impactBursts[i];b.age+=dt;const a=b.geometry.attributes.position;
    for(let j=0;j<b.velocities.length;j++){const v=b.velocities[j];v[1]-=18*dt;a.array[j*3]+=v[0]*dt;a.array[j*3+1]+=v[1]*dt;a.array[j*3+2]+=v[2]*dt;}a.needsUpdate=true;b.material.opacity=Math.max(0,1-b.age/b.life);
    if(b.age>=b.life){scene.remove(b.points);b.geometry.dispose();b.material.dispose();impactBursts.splice(i,1);}
  }
}
function collide(dt) {
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  const pm = player.mesh.position;
  for (const a of [...ais, ...Object.values(remotes)]) {
    a.hitCooldown = Math.max(0, (a.hitCooldown || 0) - dt);
    const am = a.mesh.position, dx = pm.x - am.x, dz = pm.z - am.z, d = Math.hypot(dx, dz);
    if (d < 3.65 && d > 0.01 && Math.abs(pm.y - am.y) < 1.7) {
      const nx = dx / d, nz = dz / d, push = 3.65 - d;
      // Separate both vehicles and add a small lateral impulse so contact feels physical.
      pm.x += nx * push * 0.58; pm.z += nz * push * 0.58;
      player.vx += nx * Math.min(4.2,push*1.15); player.vz += nz * Math.min(4.2,push*1.15);
      if (a.isAI) {
        a.lat += (player.lat < a.lat ? 1 : -1) * 1.6;
        a.mesh.position.x -= nx * push * 0.42; a.mesh.position.z -= nz * push * 0.42;
      } else if (a.isRemote) {
        a.tx -= nx * 1.35; a.tz -= nz * 1.35;
      }
      // Only one impact per pair cooldown: the player's and rival's speeds both drop by 30%.
      if (a.hitCooldown <= 0) {
        const impactSpeed = Math.max(Math.abs(player.speed), Math.abs(a.speed || 0));
        player.speed *= 0.70; player.vx *= 0.70; player.vz *= 0.70;
        if (a.isAI || a.isRemote) a.speed *= 0.70;
        if (a.isRemote && cfg && cfg.mode === 'online') Net.send({ t: 'bump', target: a.id });
        if (performance.now() - bumpT > 300) { Snd.bump(); bumpT = performance.now(); }
        const impactDmg=clamp(impactSpeed*0.052,0.8,6.2); addDmg(impactDmg); spawnSparks(pm.x,pm.y+0.55,pm.z,clamp(Math.floor(impactSpeed*0.2),7,18)); a.hitCooldown = 0.62; collisionCooldown = 0.62;
      }
    }
  }
}
function itemsUpdate(dt) {
  const m = player.mesh.position; let ry = 0;
  const coinV = cfg.mode === 'train' ? 0 : 25;
  for (const it of items) {
    if (it.type === 'ramp') {
      // Два независимых условия (расстояние в дорожных сегментах и поперечная полоса)
      // делают срабатывание стабильным даже при низком FPS и на мобильном экране.
      const trackDelta = Math.abs(sdiff(it.idx, player.idx));
      const lateralDelta = Math.abs((player.lat || 0) - it.lat);
      const dx = m.x - it.x, dz = m.z - it.z;
      const along = dx * Math.sin(it.h) + dz * Math.cos(it.h);
      if (!player.air && player.rampCooldown <= 0 && trackDelta <= 2.35 && lateralDelta < 4.35 && Math.abs(along) < 9.6) {
        player.air = true; player.vy = 8.2 + Math.min(5.8, Math.abs(player.speed) * 0.14);
        player.speed = Math.max(18, player.speed) * 1.28; player.rampT = 2.8; player.rampCooldown = 1.35;
        player.y = Math.max(player.y, 0.18); ry = 0.55; Snd.jump(); toast('Трамплин! Прыжок активирован');
      }
      continue;
    }
    if (!it.on) continue;
    const dx = m.x - it.x, dz = m.z - it.z, d2 = dx * dx + dz * dz;
    switch (it.type) {
      case 'coin': if (d2 < 5) { it.on = false; it.mesh.visible = false; raceCoins += coinV; Snd.coin(); } break;
      case 'nitro': if (d2 < 5) { it.on = false; it.mesh.visible = false; nitro = Math.min(phys.nCap, nitro + phys.nCap * 0.4); Snd.pickup(); toast('Нитро +'); } break;
      case 'repair': if (d2 < 5) { it.on = false; it.mesh.visible = false; setDamage(Math.max(0, player.dmg - 18)); player.immobilized = player.dmg >= 100; if(!player.immobilized && player.speed===0) player.engineStall=0; Snd.pickup(); toast('Ремонтный набор: −18% повреждений'); } break;
      case 'oil': if (d2 < 5.2 && !player.air && player.slip <= 0) { player.slip = 1.2; player.spin = Math.random() < 0.5 ? 1 : -1; toast('Масло!'); Snd.oil(); } break;
      case 'cone': if (d2 < 4 && !player.air) { it.on = false; it.mesh.visible = false; player.speed *= 0.45; addDmg(8); Snd.crash(); toast('Препятствие!'); } break;
    }
  }
  if (!player.air) player.y += (ry - player.y) * Math.min(1, 15 * dt);
}

function fullOrder() { const fin = finishOrder.slice(); return [...fin, ...all().filter(c => !fin.includes(c)).sort((a, b) => b.p - a.p)]; }
function finishCheck() {
  for (const c of all()) {
    if (c.finished || c.p < curLaps * N) continue;
    c.finished = true; finishOrder.push(c);
    if (c === player) { if (cfg.mode === 'online') Net.send({ t: 'finish' }); finishRace(); }
  }
}
function finishRace() {
  state = 'done'; $('touch').hidden = true; $('fx').style.opacity = 0; $('fixBtn').hidden = true;
  const c = $('count'); c.hidden = false; c.textContent = 'ФИНИШ!'; setTimeout(() => { if (state === 'done') c.hidden = true; }, 1300);
  const order = fullOrder(); let place = order.indexOf(player) + 1;
  save.cars[save.cur].dmg = Math.min(100, player.dmg); applyDamageVisual();
  let reward = 0, title, sub = '', table = '', btn = 'Ещё раз', act = startCareer;
  if (cfg.mode === 'career') {
    const L = cfg.L, base = (80 + L * 15) * (isBoss(L) ? 2 : isMini(L) ? 1.5 : 1);
    reward = Math.round(base * [1, 0.55, 0.3, 0.15, 0.08, 0.05][place - 1]); const adv = place <= 3;
    if (adv && save.level === L) save.level++;
    sub = adv ? `Уровень ${L} пройден` : 'Чтобы пройти уровень, финишируйте в тройке'; btn = adv ? 'Дальше' : 'Ещё раз'; act = startCareer;
  } else if (cfg.mode === 'train') {
    sub = 'Тренировка: награды нет, только практика'; act = () => $('trStart').onclick();
  } else if (cfg.mode === 'online') {
    if (onlinePlace) place = onlinePlace; reward = [150, 90, 60, 40, 25, 15][place - 1] || 10;
    sub = 'Онлайн-гонка'; btn = 'К онлайну'; act = () => { toMenu(); openScreen('online'); };
  } else if (cfg.mode === 'tour') {
    const t = save.tour, def = TOURS.find(x => x.id === t.id);
    order.forEach((e, i) => { const k = e === player ? '__you' : e.name; t.pts[k] = (t.pts[k] || 0) + (PTS[i] || 0); });
    t.race++;
    const st = Object.entries(t.pts).sort((a, b) => b[1] - a[1]);
    table = st.map(([n, p], i) => `<div class="trow ${n === '__you' ? 'me' : ''}"><span>${i + 1}. ${n === '__you' ? save.name : n}</span><b>${p}</b></div>`).join('');
    if (t.race >= def.Ls.length) {
      const rank = st.findIndex(s => s[0] === '__you'); reward = def.prize[rank] || 0; save.tour = null;
      sub = `Турнир завершён · итог: ${rank + 1}-е место`; btn = 'К турнирам'; act = () => { toMenu(); openScreen('tour'); };
    } else { sub = `Гонка ${t.race}/${def.Ls.length} завершена · очки`; btn = 'Следующая гонка'; act = () => startTour(def.id); }
  }
  const elapsed = Math.max(0, (performance.now() - raceStartedAt) / 1000);
  const bankedRaceCoins = place === 1 ? raceCoins : Math.floor(raceCoins * 0.2);
  if (place !== 1 && raceCoins > 0) sub += ` · за проигрыш сохранено 20% собранных монет (${bankedRaceCoins}/${raceCoins})`;
  sub += ` · Время: ${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}.${String(Math.floor((elapsed%1)*100)).padStart(2,'0')}`;
  save.coins += reward + bankedRaceCoins; store();
  title = place === 1 ? 'Победа!' : place + '-е место';
  if (place <= 3) Snd.fanfare(); else Snd.lose();
  $('resTitle').textContent = title; $('resSub').textContent = sub; $('resTable').innerHTML = table;
  $('resCoins').textContent = reward + bankedRaceCoins; $('againBtn').textContent = btn; $('againBtn').onclick = act;
  setTimeout(() => { if (state === 'done') { $('hud').hidden = true; show('result'); } }, 1400);
}

let minimapTimer=0;
function drawMinimap(dt=0) {
  if($('minimap').hidden || pos.length<10) return;
  minimapTimer-=dt;if(minimapTimer>0)return;minimapTimer=0.14;
  const c=$('minimap'),ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(5,12,22,.9)';ctx.fillRect(0,0,w,h);
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of pos){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
  const sx=(w-24)/Math.max(1,maxX-minX),sz=(h-24)/Math.max(1,maxZ-minZ),scale=Math.min(sx,sz);
  const px=x=>(x-(minX+maxX)/2)*scale+w/2,py=z=>(z-(minZ+maxZ)/2)*scale+h/2;
  ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  pos.forEach((p,i)=>i?ctx.lineTo(px(p.x),py(p.z)):ctx.moveTo(px(p.x),py(p.z)));
  ctx.closePath();ctx.strokeStyle='#06090d';ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle='#e7eaf0';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#5d6979';ctx.lineWidth=2;ctx.stroke();
  const start=pos[0];ctx.beginPath();ctx.moveTo(px(start.x)-4,py(start.z));ctx.lineTo(px(start.x)+4,py(start.z));ctx.strokeStyle='#ff9c35';ctx.lineWidth=3;ctx.stroke();
  for(const a of [...ais,...Object.values(remotes)]){const q=a.mesh.position;ctx.beginPath();ctx.arc(px(q.x),py(q.z),3,0,Math.PI*2);ctx.fillStyle=a.isRemote?'#52e0e8':'#ef5366';ctx.fill();}
  const m=player.mesh.position;const x=px(m.x),y=py(m.z),ang=player.h;ctx.save();ctx.translate(x,y);ctx.rotate(-ang);ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4.2,4);ctx.lineTo(0,2);ctx.lineTo(-4.2,4);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#ffb22e';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  ctx.strokeStyle='#ffffff22';ctx.lineWidth=1;ctx.strokeRect(.5,.5,w-1,h-1);
}
function updateHUD() {
  const rank = all().sort((a, b) => b.p - a.p).indexOf(player) + 1;
  $('pos').textContent = rank + '/' + all().length;
  $('lap').textContent = clamp(Math.floor(player.p / N) + 1, 1, curLaps) + '/' + curLaps;
  $('spd').textContent = Math.round(Math.abs(player.speed) * 3.6); $('rc').textContent = raceCoins;
  const n = $('nitro'); n.style.width = (nitro / phys.nCap * 100) + '%'; n.classList.toggle('lock', player.nLock);
  $('fx').style.opacity = player.boosting ? 1 : 0;
  $('fixBtn').hidden = !(state === 'race' && stuckT > 1);
}

function updateCamera(dt) {
  if (state === 'world') { updateWorldCamera(dt); return; }
  if (state === 'touchsetup') return;
  if (IDLE.has(state)) {
    menuT += dt * 0.3; const ch = state === 'char' && charMesh, m = ch ? charMesh.position : player.mesh.position, r = ch ? 4.2 : 8;
    cam.position.set(m.x + Math.sin(menuT) * r, ch ? 1.5 : 2.8, m.z + Math.cos(menuT) * r);
    cam.lookAt(m.x, ch ? 1 : 0.9, m.z); cam.fov = 55; cam.updateProjectionMatrix(); return;
  }
  const m = player.mesh.position;
  camH += angDiff(player.h, camH) * Math.min(1, 4 * dt);
  const sh = player.boosting ? 0.06 : 0;
  cam.position.set(m.x - Math.sin(camH) * 9 + (Math.random() - 0.5) * sh * 4, 4.6 + player.y * 0.6 + (Math.random() - 0.5) * sh * 4, m.z - Math.cos(camH) * 9);
  cam.lookAt(m.x + Math.sin(camH) * 6, 1.4 + player.y * 0.5, m.z + Math.cos(camH) * 6);
  const fov = 68 + clamp(Math.abs(player.speed) / 70, 0, 1) * 14 + (player.boosting ? 8 : 0);
  cam.fov += (fov - cam.fov) * Math.min(1, 5 * dt); cam.updateProjectionMatrix();
}

let last = performance.now(), tAcc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = (now - last) / 1000; const dt = Math.min(rawDt, 0.05); last = now; tAcc += dt; fixCool -= dt;
  fpsSamples += 1; fpsTime += rawDt; if (fpsTime >= 2) { const fps=fpsSamples/fpsTime; { if (fps<49) lowFpsWindows++; else lowFpsWindows=Math.max(0,lowFpsWindows-1); if (lowFpsWindows>=2 && adaptiveScale>0.56) { adaptiveScale=Math.max(0.56,adaptiveScale-0.1); applyGfx(); lowFpsWindows=0; } else if (fps>59 && adaptiveScale<1) { adaptiveScale=Math.min(1,adaptiveScale+0.035); applyGfx(); } } fpsSamples=0; fpsTime=0; }
  if (state === 'world') {
    updateOpenWorld(dt); $('minimap').hidden = true;
  } else if (inRace()) {
    updatePlayer(dt);
    ais.forEach(a => updateAI(a, dt));
    updateRemotes(dt);
    if (state === 'race') {
      collide(dt); itemsUpdate(dt); finishCheck();
      if (Math.abs(player.speed) < 4 && !player.air) stuckT += dt; else stuckT = 0;
      if (cfg.mode === 'online') { sendT += dt; if (sendT > 0.08) { sendT = 0; const m = player.mesh.position; Net.send({ t: 's', x: +m.x.toFixed(2), z: +m.z.toFixed(2), h: +player.h.toFixed(3), s: +player.speed.toFixed(1), p: +player.p.toFixed(1), y: +player.y.toFixed(2) }); } }
    }
    updateHUD(); drawMinimap(dt);
  } else { $('minimap').hidden=true; }
  for (const it of items) if (it.on && it.mesh.userData.spin) it.mesh.userData.body.rotation.y = tAcc * 2.5;
  if (charMesh) charMesh.rotation.y = tAcc * 0.4;
  if (inRace()) Snd.update({ speed01: clamp(Math.abs(player.speed) / 80, 0, 1), boost: player.boosting, slip: player.skid || 0, racing: true }); else if(state==='world' && worldDriving) Snd.update({speed01:clamp(Math.abs(player.speed)/80,0,1),boost:false,slip:0,racing:true}); else Snd.idle();
  Snd.ambTick(dt, true);
  const focus = state==='world' && !worldDriving && charMesh ? charMesh.position : player.mesh.position;
  sun.position.set(focus.x + 60, 100, focus.z + 40); sun.target.position.copy(focus);
  const aimYaw = state==='world' && !worldDriving ? worldYaw : player.h;
  spot.position.set(focus.x, 1.3, focus.z); spot.target.position.set(focus.x + Math.sin(aimYaw) * 25, 0, focus.z + Math.cos(aimYaw) * 25);
  updateCamera(dt);
  if (starsG) starsG.position.copy(cam.position);
  updateRain(dt); updateImpactBursts(dt);
  const smoke=player.mesh&&player.mesh.userData&&player.mesh.userData.damageSmoke;if(smoke&&smoke.visible){smoke.material.opacity=(player.dmg>=90?0.38:0.18)+0.08*(0.5+0.5*Math.sin(tAcc*5));smoke.position.y+=Math.sin(tAcc*2)*0.0008;}
  renderer.render(scene, cam);
}


// ================= открытый мир: город, квартира, пешеходы, магазины и телефон =================
let worldG = null, apartmentG = null, worldPedestrians = [], worldTraffic = [], worldBuildings = [], worldInteractables = [];
let worldInterior = false, worldDriving = false, worldYaw = 0, worldCamMode = 2, worldNear = null, worldCollisionTimer = 0, worldAnimT = 0, worldWeather = 'Ясно', worldTime = 'День';
const WORLD_RANGE = 650;
const WORLD_NAMES = ['Артём','Саша','Мира','Даня','Ника','Рустам','Лейла','Тимур','Алиса','Марк','Илья','Зара','Амир','Ева','Матвей','Амина','Дамир','Лина','Рома','Самира','Эмир','Даша','Камиль','Яна','Тим','Адель','Ренат','Малика','Вадим','Алия','Женя','Марат'];
const WORLD_LINES = ['Классная машина!','Сегодня в городе настоящий движ.','На площади скоро стартует турнир.','Заедь в мастерскую — там хорошие детали.','Неплохой дрифт видел на южной улице!','Добро пожаловать в наш район.','У меня сегодня выходной — гуляю по городу.','Говорят, ночной заезд будет сложным.'];
function wmat(color, roughness=0.8, metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function wbox(parent,w,h,d,mat,x,y,z,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=opts.shadow!==false && ['high','veryhigh','ultra','rt'].includes(resolvedGfx());m.receiveShadow=true;parent.add(m);return m;}
function signTexture(title,sub,color='#102338'){
  return canvasTex(512,160,(ctx,w,h)=>{ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.fillStyle='#ffffff';ctx.fillRect(6,6,w-12,h-12);ctx.fillStyle=color;ctx.fillRect(12,12,w-24,h-24);ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.font='900 42px Arial';ctx.fillText(title,w/2,69);ctx.fillStyle='#81ecf4';ctx.font='700 20px Arial';ctx.fillText(sub,w/2,111);});
}
function makeWorldPedestrian(gender='boy', outfit=0, skin=0){
  const g=new THREE.Group(), sk=wmat(SKINS[skin%SKINS.length],0.65), shirt=wmat(OUTFITS[outfit%OUTFITS.length],0.72), shirt2=wmat(OUTFITS[(outfit+2)%OUTFITS.length],0.75), pants=wmat(gender==='girl'?0x293d62:0x263044,0.86), shoe=wmat(0xd7dce2,0.62), sole=wmat(0x181c24,0.9), hair=wmat(gender==='girl'?0x4c2613:0x211a16,0.8), dark=wmat(0x111821,0.7), white=wmat(0xf9fafb,0.35);
  const sph=(r,ws=12,hs=8)=>new THREE.SphereGeometry(r,ws,hs), cyl=(r1,r2,h)=>new THREE.CylinderGeometry(r1,r2,h,10);
  const torso=new THREE.Mesh(cyl(0.24,0.19,0.52),shirt);torso.position.y=1.12;torso.castShadow=true;g.add(torso);
  const vest=new THREE.Mesh(new THREE.BoxGeometry(0.27,0.30,0.035),shirt2);vest.position.set(0,1.14,0.13);g.add(vest);
  const belt=new THREE.Mesh(new THREE.BoxGeometry(0.37,0.065,0.25),dark);belt.position.y=0.84;g.add(belt);
  const head=new THREE.Mesh(sph(0.18,16,12),sk);head.position.y=1.68;head.castShadow=true;g.add(head);
  const haircap=new THREE.Mesh(sph(0.185,14,9),hair);haircap.position.set(0,1.75,-0.02);haircap.scale.set(1,0.65,1);g.add(haircap);
  if(gender==='girl'){const pony=new THREE.Mesh(sph(0.08,10,7),hair);pony.position.set(0.13,1.65,-0.12);g.add(pony);}
  for(const side of [-1,1]){const eye=new THREE.Mesh(sph(0.024,8,6),white);eye.position.set(side*0.065,1.69,0.158);g.add(eye);const pupil=new THREE.Mesh(sph(0.012,6,5),dark);pupil.position.set(side*0.065,1.69,0.18);g.add(pupil);const ear=new THREE.Mesh(sph(0.04,8,6),sk);ear.position.set(side*0.177,1.67,0);g.add(ear);}
  const armG=[],legG=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*0.25,1.32,0);g.add(arm);const upper=new THREE.Mesh(cyl(0.085,0.11,0.42),shirt);upper.position.y=-0.22;arm.add(upper);const sleeve=new THREE.Mesh(cyl(0.09,0.08,0.13),shirt2);sleeve.position.y=-0.08;arm.add(sleeve);const hand=new THREE.Mesh(sph(0.075,8,6),sk);hand.position.y=-0.48;arm.add(hand);armG.push(arm);
    const leg=new THREE.Group();leg.position.set(side*0.12,0.79,0);g.add(leg);const thigh=new THREE.Mesh(cyl(0.105,0.12,0.42),pants);thigh.position.y=-0.22;leg.add(thigh);const foot=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.12,0.29),shoe);foot.position.set(0,-0.45,0.065);leg.add(foot);const outsole=new THREE.Mesh(new THREE.BoxGeometry(0.175,0.045,0.3),sole);outsole.position.set(0,-0.51,0.065);leg.add(outsole);legG.push(leg);
  }
  const phone=new THREE.Mesh(new THREE.BoxGeometry(0.085,0.13,0.018),dark);phone.position.set(-0.28,1.04,0.06);phone.rotation.z=0.15;g.add(phone);
  g.userData={arms:armG,legs:legG,phase:Math.random()*Math.PI*2,walk:0,wave:0,jump:0,gender,outfit,skin,phone,playerPed:false};return g;
}
function addWorldTree(parent,x,z,scale=1){
  const trunk=wmat(0x55402d),leaf=wmat(0x2d7045,0.9),g=new THREE.Group();
  const t=new THREE.Mesh(new THREE.CylinderGeometry(0.28*scale,0.4*scale,3.8*scale,7),trunk);t.position.y=1.9*scale;g.add(t);
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.ConeGeometry((2.2-i*0.3)*scale,2.8*scale,7),leaf);c.position.y=(3.7+i*1.3)*scale;g.add(c);}
  g.position.set(x,0,z);parent.add(g);return g;
}
function createApartmentInterior(){
  const g=new THREE.Group();const floor=wmat(0x987858,0.86),wall=wmat(0xd9d4c7,0.95),accent=wmat(0xb9c7d3),dark=wmat(0x453a33),fabric=wmat(0x3b607c),white=wmat(0xece7da),wood=wmat(0x7f5835),screen=new THREE.MeshBasicMaterial({color:0x68d9ee});
  wbox(g,26,0.3,26,floor,0,-0.18,0);wbox(g,26,5.5,0.35,wall,0,2.55,-13);wbox(g,0.35,5.5,26,wall,-13,2.55,0);wbox(g,0.35,5.5,26,wall,13,2.55,0);
  wbox(g,26,5.5,0.35,wall,0,2.55,13);wbox(g,26,0.4,0.35,dark,0,5.2,-13);wbox(g,26,0.4,0.35,dark,0,5.2,13);
  // окно с рамами и видом на город
  wbox(g,5.5,2.7,0.12,screen,-5,3.25,-12.72);wbox(g,0.16,2.9,0.16,white,-7.8,3.25,-12.6);wbox(g,0.16,2.9,0.16,white,-2.2,3.25,-12.6);wbox(g,5.8,0.16,0.18,white,-5,1.8,-12.6);wbox(g,5.8,0.16,0.18,white,-5,4.7,-12.6);
  // sofa, armrests, coffee table and TV
  wbox(g,5.6,0.65,1.6,fabric,4,0.48,-7);wbox(g,5.6,1.25,0.45,fabric,4,0.95,-7.6);wbox(g,0.4,0.8,1.8,accent,1.2,0.45,-7);wbox(g,0.4,0.8,1.8,accent,6.8,0.45,-7);
  wbox(g,3.2,0.18,1.7,wood,3,0.5,-2);for(const x of [1.7,4.3])for(const z of [-2.6,-1.4])wbox(g,0.13,0.5,0.13,dark,x,0.25,z);
  wbox(g,4.1,2.5,0.3,dark,-3.7,1.4,-11.4);wbox(g,3.7,2.1,0.14,screen,-3.7,1.4,-11.2);
  // кухонный гарнитур, шкаф и кровать
  wbox(g,6,1.3,1.4,wood,8.7,0.65,4.5);wbox(g,6,0.22,1.4,white,8.7,1.4,4.5);wbox(g,1.8,2.6,0.9,accent,10,1.3,7.3);
  wbox(g,5,0.45,7,wood,-7.2,0.25,6.3);wbox(g,4.7,0.4,6.7,white,-7.2,0.65,6.3);wbox(g,4.5,0.15,1.2,fabric,-7.2,0.94,3.7);
  for(const x of [-10,10]){const lamp=new THREE.PointLight(0xffdca0,0.35,16);lamp.position.set(x,4.3,0);g.add(lamp);}
  g.visible=false;scene.add(g);return g;
}
function buildOpenWorld(){
  if(worldG)return;
  worldG=new THREE.Group();scene.add(worldG);worldBuildings=[];worldPedestrians=[];worldTraffic=[];worldInteractables=[];
  const asphalt=wmat(0x30353b,0.94),concrete=wmat(0x9ba2a8,0.98),grass=wmat(0x3c654b,1),lane=new THREE.MeshBasicMaterial({color:0xd9d5b5}),buildingColors=[0x8595a4,0x9a8c80,0xb4a18a,0x687d91,0xb2b9bf,0x6c777f,0x9a9e8d,0x6e7085],windowMat=new THREE.MeshStandardMaterial({color:0x9de9f2,emissive:0x285e75,emissiveIntensity:0.45,roughness:0.18,metalness:0.25});
  wbox(worldG,1500,0.5,1500,grass,0,-0.42,0,{shadow:false});
  // Сетка широких городских улиц и отдельные тротуары.
  for(let i=-6;i<=6;i++){
    const v=i*100;wbox(worldG,19,0.14,1400,asphalt,v,0,0,{shadow:false});wbox(worldG,1400,0.14,19,asphalt,0,0,v,{shadow:false});
    for(const side of [-1,1]){wbox(worldG,2.8,0.18,1400,concrete,v+side*11,0.015,0,{shadow:false});wbox(worldG,1400,0.18,2.8,concrete,0,0.015,v+side*11,{shadow:false});}
  }
  // Центральная разметка одним инстанс-мешем, чтобы не перегружать слабые устройства.
  const dashGeom=new THREE.BoxGeometry(0.18,0.025,4.4),dashes=new THREE.InstancedMesh(dashGeom,lane,Math.floor(13*1400/19));const dummy=new THREE.Object3D();let dk=0;
  for(let i=-6;i<=6;i++)for(let z=-690;z<=690;z+=19){dummy.position.set(i*100,0.085,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();dashes.setMatrixAt(dk++,dummy.matrix);}dashes.count=dk;worldG.add(dashes);
  // Фасады — отдельные здания, оконные панели и кондиционеры инстансированы.
  const winMax=['verylow','low'].includes(resolvedGfx())?1700:5200,winMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,1.35,0.12),windowMat,winMax);winMesh.castShadow=false;
  let wn=0;const colliders=[];const specialCells=new Map([['-1,-1',{kind:'apartment',name:'АПАРТАМЕНТЫ',sub:'HOME · 24/7',col:0x7e8d9d}],['0,-1',{kind:'market',name:'MARKET 24/7',sub:'ЕЖЕДНЕВНЫЕ ТОВАРЫ',col:0x2c7867}],['1,0',{kind:'garage',name:'AUTO LAB',sub:'РЕМОНТ · ТЮНИНГ',col:0x305c7d}],['-1,0',{kind:'fashion',name:'CITY MODA',sub:'ОДЕЖДА · СТИЛЬ',col:0x82537d}]]);
  const addFacade=(x,z,w,d,h,color,special=null)=>{
    const mat=wmat(color,0.78,0.05);wbox(worldG,w,h,d,mat,x,h/2,z);wbox(worldG,w+0.8,0.42,d+0.8,wmat(0x343d47,0.82,0.2),x,h+0.12,z);
    // Вертикальные угловые колонны и тонкая цокольная полоса делают объём менее «коробочным».
    const trim=wmat(0xd2d8de,0.55,0.25);for(const sx of [-1,1]){wbox(worldG,0.35,h,0.35,trim,x+sx*w/2,h/2,z+d/2);wbox(worldG,0.35,h,0.35,trim,x+sx*w/2,h/2,z-d/2);}
    const cols=Math.max(2,Math.floor(w/7)),rows=Math.min(10,Math.floor((h-4)/5));
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      if(wn>=winMax)break;const wx=x+(col-(cols-1)/2)*(w/(cols+0.5)),wy=3.2+row*4.6,wz=z+d/2+0.075;dummy.position.set(wx,wy,wz);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();winMesh.setMatrixAt(wn++,dummy.matrix);
      if(special && row===0 && col===Math.floor(cols/2)){/* keep entrance unobstructed visually at the ground floor */}
    }
    for(let row=0;row<Math.min(6,Math.floor((h-4)/5));row++)for(let col=0;col<Math.max(1,Math.floor(d/9));col++){
      if(wn>=winMax)break;const wx=x+w/2+0.075,wy=3.2+row*4.6,wz=z+(col-(Math.max(1,Math.floor(d/9))-1)/2)*(d/(Math.max(1,Math.floor(d/9))+0.4));dummy.position.set(wx,wy,wz);dummy.rotation.set(0,Math.PI/2,0);dummy.updateMatrix();winMesh.setMatrixAt(wn++,dummy.matrix);
    }
    colliders.push({x,z,hw:w/2+0.5,hd:d/2+0.5,h});
    if(special){
      // Входная группа, витрины, навес и неоновая вывеска.
      wbox(worldG,Math.min(w*0.72,19),2.7,0.32,wmat(0x183242,0.25,0.2),x,1.5,z+d/2+0.25);
      wbox(worldG,Math.min(w*0.76,20),0.25,3.2,wmat(special.col,0.4,0.25),x,3.1,z+d/2+1.4);
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w*0.8,24),2.0),new THREE.MeshBasicMaterial({map:signTexture(special.name,special.sub,'#15293d'),transparent:false}));sign.position.set(x,4.65,z+d/2+0.35);worldG.add(sign);
    }
    // Крыша, вентиляция и случайные рекламные панели.
    wbox(worldG,2.3,0.9,1.4,wmat(0x59616b,0.75,0.15),x-w/4,h+0.75,z-d/5);
    if(h>30){wbox(worldG,3,0.8,1.6,wmat(0x4b5661,0.7,0.2),x+w/4,h+0.7,z+d/6);}
  };
  const quality=resolvedGfx(),cities=quality==='verylow'?3:quality==='low'?4:['med','high','veryhigh'].includes(quality)?5:6;
  for(let gx=-cities;gx<cities;gx++)for(let gz=-cities;gz<cities;gz++){
    const cx=gx*100+50,cz=gz*100+50,key=`${gx},${gz}`,sp=specialCells.get(key);
    if(sp){const w=sp.kind==='apartment'?40:36,d=sp.kind==='apartment'?42:38,h=sp.kind==='apartment'?42:sp.kind==='garage'?13:18;addFacade(cx,cz,w,d,h,sp.col,sp);worldInteractables.push({type:sp.kind,x:cx,z:cz+d/2+4,r:12,name:sp.name});continue;}
    if(Math.random()<0.12)continue;
    const w=24+Math.random()*31,d=24+Math.random()*33,h=12+Math.random()*(['ultra','rt'].includes(quality)?106:76),c=buildingColors[Math.floor(Math.random()*buildingColors.length)];
    addFacade(cx+(Math.random()-.5)*17,cz+(Math.random()-.5)*17,w,d,h,c,null);
    if(Math.random()<0.24 && !['verylow','low'].includes(quality)){const w2=14+Math.random()*15,d2=15+Math.random()*15,h2=8+Math.random()*24;addFacade(cx+17,cz-8,w2,d2,h2,buildingColors[Math.floor(Math.random()*buildingColors.length)],null);}
  }
  winMesh.count=wn;worldG.add(winMesh);worldBuildings=colliders;
  // Уличные фонари, клумбы и зелёные островки на перекрёстках.
  const lampPole=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12,0.16,6.5,8),wmat(0x454e58,0.6,0.65),320),lampGlow=new THREE.InstancedMesh(new THREE.SphereGeometry(0.3,8,6),new THREE.MeshStandardMaterial({color:0xffe5a1,emissive:0xffb849,emissiveIntensity:0.8}),320);let li=0;
  for(let i=-5;i<=5;i++)for(let j=-5;j<=5;j++)for(const side of [-1,1]){if(li>=320)break;const x=i*100+side*14,z=j*100+14;dummy.position.set(x,3.25,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();lampPole.setMatrixAt(li,dummy.matrix);dummy.position.set(x,6.6,z);dummy.scale.set(1,1,1);dummy.updateMatrix();lampGlow.setMatrixAt(li,dummy.matrix);li++;}
  lampPole.count=li;lampGlow.count=li;worldG.add(lampPole,lampGlow);
  for(let i=-5;i<=5;i++)for(let j=-5;j<=5;j++)if((i+j)%3===0)addWorldTree(worldG,i*100+18,j*100+18,0.65+Math.random()*0.35);
  // Личная машина на парковочном кармане рядом с персонажем.
  if(!player.mesh){showCar(save.cur);}player.mesh.position.set(9,0,8);player.mesh.rotation.set(0,0,0);player.mesh.visible=false;worldYaw=0;
  worldInteractables.push({type:'raceboard',x:-28,z:12,r:10,name:'Городские заезды'},{type:'plaza',x:0,z:50,r:12,name:'Центральная площадь'});
  // Пешеходы: разнообразные лица, куртки и обувь; прохожие гуляют, машут рукой и радуются рядом с гонщиком.
  const pedCount=quality==='verylow'?8:quality==='low'?12:quality==='med'?24:quality==='high'?36:quality==='veryhigh'?48:56;
  for(let i=0;i<pedCount;i++){
    const axis=Math.random()<0.5?'x':'z',road=Math.floor(Math.random()*9-4)*100+(Math.random()<0.5?-1:1)*13;
    const centerX=axis==='x'?road:(Math.random()*850-425),centerZ=axis==='z'?road:(Math.random()*850-425);
    const ped=makeWorldPedestrian(Math.random()<0.42?'girl':'boy',Math.floor(Math.random()*OUTFITS.length),Math.floor(Math.random()*SKINS.length));
    ped.position.set(centerX,0,centerZ);ped.rotation.y=Math.random()*Math.PI*2;worldG.add(ped);
    const rec={mesh:ped,name:WORLD_NAMES[i%WORLD_NAMES.length],centerX,centerZ,axis,phase:Math.random()*6.28,amp:2+Math.random()*5,walk:0.45+Math.random()*0.7,waveT:Math.random()*2,jumpT:0,nextCheer:2+Math.random()*6,baseYaw:ped.rotation.y};worldPedestrians.push(rec);
  }
  // Движущийся городской транспорт для масштаба и жизни города.
  const trafficCount=quality==='verylow'?2:quality==='low'?3:quality==='med'?5:quality==='high'?7:9;
  for(let i=0;i<trafficCount;i++){
    const def=CARS[Math.floor(Math.random()*Math.min(7,CARS.length))],mesh=makeCarModel(def,Math.random()<0.5?undefined:Math.floor(Math.random()*0xffffff),{neon:false,rimStyle:Math.floor(Math.random()*3)});seatDriver(mesh,Math.random()<0.5?'boy':'girl',Math.floor(Math.random()*6),Math.floor(Math.random()*3));
    const dir=Math.random()<0.5?1:-1,z=Math.floor(Math.random()*9-4)*100+(Math.random()<0.5?-5:5),x=Math.random()*1200-600;mesh.position.set(x,0,z);mesh.rotation.y=dir>0?Math.PI/2:-Math.PI/2;worldG.add(mesh);worldTraffic.push({mesh,x,z,dir,speed:6+Math.random()*8,axis:'x',phase:Math.random()*6.28});
  }
  // Уютная квартира с окном, гостиной, кухней и спальней.
  apartmentG=createApartmentInterior();
}
function currentWorldActor(){return worldDriving?player.mesh:charMesh;}
function worldPos(){const a=currentWorldActor();return a?a.position:new THREE.Vector3();}
function startOpenWorld(){
  held.clear(); buildOpenWorld();state='world';worldInterior=false;worldDriving=false;worldCamMode=2;worldNear=null;worldCollisionTimer=0;
  const times=[['Рассвет',0x8fa9c9,0x8a7b85,0.8,0.8],['День',0x9dc8e1,0xa8b5c1,1.15,1.12],['Закат',0x715d80,0x876979,0.7,0.78],['Ночь',0x11192e,0x30384d,0.34,0.52]];
  const time=times[Math.floor(Math.random()*times.length)],weatherList=['Ясно','Облачно','Дождь','Туман'];worldTime=time[0];worldWeather=weatherList[Math.floor(Math.random()*weatherList.length)];
  scene.background=new THREE.Color(time[1]);const fogColor=worldWeather==='Туман'?0xa4b0b5:time[2];scene.fog=new THREE.Fog(fogColor,worldWeather==='Туман'?26:worldWeather==='Дождь'?65:120,worldWeather==='Туман'?205:worldWeather==='Дождь'?420:1050);
  hemi.intensity=time[3]*(worldWeather==='Облачно'?0.8:1);sun.intensity=time[4]*(worldWeather==='Облачно'?0.58:1);spot.visible=worldTime==='Ночь';
  rainOn=!['verylow','low'].includes(resolvedGfx());if(rainG){rainG.userData.want=worldWeather==='Дождь'?2:0;rainG.visible=rainOn&&worldWeather==='Дождь';}
  $('worldWeatherTag').textContent=({День:'☀',Рассвет:'🌅',Закат:'🌇',Ночь:'🌙'})[worldTime]+' '+worldTime+' · '+({Ясно:'Чистое небо',Облачно:'Облачно',Дождь:'🌧 Дождь',Туман:'🌫 Туман'})[worldWeather];
  if(trackG)trackG.visible=false;worldG.visible=true;apartmentG.visible=false;
  // Clear race entities and place the selected car beside the player as a usable vehicle.
  clearRemotes();ais.forEach(a=>{scene.remove(a.mesh);disposeModel(a.mesh);});ais=[];
  if(charMesh){scene.remove(charMesh);disposeModel(charMesh);}charMesh=makeWorldPedestrian(save.char.g,save.char.col,save.char.skin);charMesh.userData.playerPed=true;charMesh.position.set(9,0,1.8);charMesh.rotation.y=0;scene.add(charMesh);worldYaw=0;
  player.mesh.position.set(9,0,8);player.mesh.rotation.set(0,0,0);player.h=0;player.mesh.visible=false;player.speed=0;player.vx=0;player.vz=0;player.dmg=save.cars[save.cur]?.dmg||0;player.immobilized=player.dmg>=100;phys=physFor(save.cur);applyDamageVisual();
  show(null);$('hud').hidden=true;$('minimap').hidden=true;$('worldHud').hidden=false;$('worldPhone').hidden=true;$('worldShop').hidden=true;$('touch').hidden=!isTouch;$('fixBtn').hidden=true;$('worldLocation').textContent='ТУРБО-СИТИ · УЛИЧНЫЙ РАЙОН';Snd.music('menu');applyTouchSettings();updateWorldCameraLabel();toast('Открытый мир (бета) · E — взаимодействовать');
}
function updateWorldCameraLabel(){const labels=['1-е лицо','2-е лицо · плечо','3-е лицо'];$('worldCamBtn').textContent='Камера: '+labels[worldCamMode];}
function cycleWorldCamera(){worldCamMode=(worldCamMode+1)%3;updateWorldCameraLabel();toast('Камера: '+['от первого лица','с плеча','от третьего лица'][worldCamMode]);}
function openWorldPhone(tab='home'){$('worldPhone').hidden=false;renderWorldPhone(tab);}
function closeWorldPhone(){$('worldPhone').hidden=true;}
function renderWorldPhone(tab='home'){
  const el=$('worldPhoneContent'),p=worldPos(),loc=worldInterior?'Квартира':Math.hypot(p.x,p.z)<100?'Центр города':p.x<0?'Западный район':'Восточный район';
  if(tab==='map')el.innerHTML=`<h2>Карта города</h2><p>Ты находишься: <b>${loc}</b></p><div class="card"><b>🏠 Апартаменты</b><div class="muted">Запад, около X −50 / Z −25</div></div><div class="card"><b>🛠 AUTO LAB</b><div class="muted">Восток, около X 150 / Z 20</div></div><div class="card"><b>🏁 Городской клуб</b><div class="muted">Рядом с центральным перекрёстком</div></div><p>В городе можно свободно ходить, садиться в свою машину, посещать магазины и запускать заезды.</p>`;
  else if(tab==='services')el.innerHTML=`<h2>Сервисы</h2><div class="phone-metric"><div><b>${Math.round(save.coins).toLocaleString('ru-RU')}</b><span>монет на счету</span></div><div><b>${Math.round(player.dmg)}%</b><span>повреждение машины</span></div></div><div class="card"><b>Эвакуатор и механик</b><p>Вызвать сервис, сбросить критическую поломку или заказать ремонт.</p><button class="btn" data-phone-action="tow">Вызвать эвакуатор · 600</button></div><div class="card"><b>Автосервис</b><p>Улучшить двигатель, ускорение и нитро за игровые монеты.</p><button class="btn" data-phone-action="garage">Открыть магазин тюнинга</button></div>`;
  else if(tab==='events')el.innerHTML=`<h2>События</h2><div class="card"><b>🏁 Уличный спринт</b><p>Короткий заезд против соперников, которые ускоряются, используют нитро и пытаются объезжать ловушки.</p><button class="btn" data-phone-action="race">Начать заезд</button></div><div class="card"><b>🏆 Турниры</b><p>Открывай турниры в главном меню: дождевой кубок, дрифт, марафон и Hyper League.</p><button class="btn" data-phone-action="menu-tours">Список турниров</button></div>`;
  else el.innerHTML=`<h2>Добро пожаловать</h2><p>Город открыт для исследования. Жители гуляют, машут руками, прыгают от радости, читают телефон и реагируют на твою машину.</p><div class="phone-metric"><div><b>${Math.round(save.coins).toLocaleString('ru-RU')}</b><span>баланс · монеты</span></div><div><b>${Math.round(player.dmg)}%</b><span>состояние авто</span></div></div><div class="card"><b>Подсказки</b><p>WASD — ходить/ехать · E — взаимодействие · V — смена камеры · P — телефон · Esc — в меню.</p></div><button class="btn" data-phone-action="tow">Эвакуатор / ремонт</button><button class="btn" data-phone-action="race">Быстрый уличный заезд</button>`;
}
$('worldPhoneBtn').onclick=()=>openWorldPhone('home');$('worldPhoneClose').onclick=closeWorldPhone;$('worldCamBtn').onclick=cycleWorldCamera;$('worldExitBtn').onclick=toMenu;$('worldInteractBtn').onclick=interactWorld;$('worldPhone').addEventListener('click',e=>{const t=e.target.closest('[data-phone-tab]');if(t){renderWorldPhone(t.dataset.phoneTab);return;}const a=e.target.closest('[data-phone-action]');if(!a)return;const act=a.dataset.phoneAction;if(act==='tow'){if(save.coins<600){toast('Не хватает 600 монет на выезд механика');return;}save.coins-=600;setDamage(Math.max(0,player.dmg-45));player.immobilized=false;player.engineStall=0;player.speed=0;player.mesh.position.set(9,0,8);store();renderWorldPhone('services');toast('Механик прибыл: восстановлено 45% прочности');}else if(act==='garage'){closeWorldPhone();openWorldShop('garage');}else if(act==='race'){closeWorldPhone();toMenu();setTimeout(startCareer,20);}else if(act==='menu-tours'){closeWorldPhone();toMenu();setTimeout(()=>openScreen('tour'),20);}});
document.querySelectorAll('[data-phone-tab]').forEach(()=>{});
function openWorldShop(kind){
  const title=kind==='market'?'MARKET 24/7':kind==='fashion'?'CITY MODA':'AUTO LAB';$('worldShopTitle').textContent=title;$('worldShopDesc').textContent=kind==='market'?'Городской магазин и полезные вещи':kind==='fashion'?'Одежда и внешний вид персонажа':'Ремонт, двигатель и спортивные детали';
  const own=save.cars[save.cur],engineCost=Math.round((own.up[0]+1)*(1100+carIdx(save.cur)*320)),accCost=Math.round((own.up[1]+1)*(900+carIdx(save.cur)*280)),nitroCost=Math.round((own.up[5]+1)*(1300+carIdx(save.cur)*360)),repairCost=Math.max(350,Math.ceil(own.dmg*28));
  let items=[];
  if(kind==='garage')items=[['repair',`Полный ремонт кузова · ${repairCost.toLocaleString('ru-RU')} монет`,`Сейчас повреждение ${Math.round(own.dmg)}%` ,own.dmg>0],['engine',`Спортивный двигатель · ${engineCost.toLocaleString('ru-RU')} монет`,`Уровень ${own.up[0]}/5`,own.up[0]<5],['accel',`Ускорение PRO · ${accCost.toLocaleString('ru-RU')} монет`,`Уровень ${own.up[1]}/5`,own.up[1]<5],['nitro',`Нитро Stage · ${nitroCost.toLocaleString('ru-RU')} монет`,`Уровень ${own.up[5]}/5`,own.up[5]<5]];
  else if(kind==='fashion')items=[['outfit','Новый комплект одежды · 850 монет','Случайный городской стиль',true],['style','Стиль кузова · 2 500 монет','Переключить форму кузова',true],['neon','Неоновая подсветка · 1 800 монет','Изменить внешний вид авто',true]];
  else items=[['repair-kit','Ремкомплект · 500 монет','Небольшой ремонт машины в пути',true],['snack','Энергетик · 150 монет','Для настроения и городской прогулки',true],['event','Билет на гонку · бесплатно','Перейти к городскому заезду',true]];
  $('worldShopItems').innerHTML=items.map(([id,name,desc,enabled])=>`<div class="card"><b>${name}</b><div class="muted">${desc}</div><button class="btn" data-shop-action="${id}" ${enabled?'':'disabled'}>Купить / использовать</button></div>`).join('');$('worldShop').hidden=false;
  $('worldShopItems').onclick=e=>{const b=e.target.closest('[data-shop-action]');if(!b)return;const act=b.dataset.shopAction;let cost=0;
    if(act==='repair'){cost=repairCost;if(own.dmg<=0){toast('Машина уже в отличном состоянии');return;}if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;setDamage(0);player.immobilized=false;player.engineStall=0;}
    else if(['engine','accel','nitro'].includes(act)){const i=act==='engine'?0:act==='accel'?1:5,base=act==='engine'?1100:act==='accel'?900:1300;cost=Math.round((own.up[i]+1)*(base+carIdx(save.cur)*280));if(own.up[i]>=5){toast('Улучшение уже максимальное');return;}if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;own.up[i]++;phys=physFor(save.cur);}
    else if(act==='outfit'){cost=850;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;save.char.col=(save.char.col+1+Math.floor(Math.random()*5))%OUTFITS.length;replaceWorldPlayer();}
    else if(act==='style'){cost=2500;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;save.style[save.cur]=((save.style[save.cur]||0)+1)%STYLE_SHAPES.length;showCar(save.cur);player.mesh.position.set(9,0,8);player.mesh.visible=!worldDriving;}
    else if(act==='neon'){cost=1800;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;save.neon[save.cur]=save.neon[save.cur]===false;showCar(save.cur);player.mesh.position.set(9,0,8);player.mesh.visible=!worldDriving;}
    else if(act==='repair-kit'){cost=500;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;setDamage(Math.max(0,player.dmg-20));player.immobilized=player.dmg>=100;}
    else if(act==='snack'){cost=150;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;toast('Вкусный перерыв!');}
    else if(act==='event'){ $('worldShop').hidden=true;closeWorldPhone();toMenu();setTimeout(startCareer,20);return;}
    store();refreshMenu();$('coins').textContent=save.coins;openWorldShop(kind);toast('Покупка выполнена');
  };
}
$('worldShopClose').onclick=()=>{$('worldShop').hidden=true;};
function replaceWorldPlayer(){if(!charMesh)return;const p=charMesh.position.clone(),r=charMesh.rotation.y;scene.remove(charMesh);disposeModel(charMesh);charMesh=makeWorldPedestrian(save.char.g,save.char.col,save.char.skin);charMesh.userData.playerPed=true;charMesh.position.copy(p);charMesh.rotation.y=r;scene.add(charMesh);}
function enterApartment(){worldInterior=true;worldG.visible=false;apartmentG.visible=true;charMesh.position.set(-2,0,2);charMesh.rotation.y=Math.PI;player.mesh.visible=false;$('worldLocation').textContent='МОЯ КВАРТИРА · ГОСТИНАЯ';toast('Ты дома. Нажми E у двери, чтобы выйти.');}
function leaveApartment(){worldInterior=false;apartmentG.visible=false;worldG.visible=true;charMesh.position.set(-50,0,-23);charMesh.rotation.y=Math.PI;worldYaw=Math.PI;$('worldLocation').textContent='ЗАПАДНЫЙ РАЙОН · АПАРТАМЕНТЫ';}
function worldActorNear(x,z){const p=worldPos();return Math.hypot(p.x-x,p.z-z);}
function worldInteractablesAt(){const p=worldPos();let best=null,dist=Infinity;
  for(const it of worldInteractables){const d=Math.hypot(p.x-it.x,p.z-it.z);if(d<it.r&&d<dist){best=it;dist=d;}}
  for(const rec of worldPedestrians){const d=Math.hypot(p.x-rec.mesh.position.x,p.z-rec.mesh.position.z);if(d<4.3&&d<dist){best={type:'npc',x:rec.mesh.position.x,z:rec.mesh.position.z,r:4.3,name:rec.name,rec};dist=d;}}
  if(!worldInterior){const car=player.mesh.position,d=Math.hypot(p.x-car.x,p.z-car.z);if(d<9&&d<dist){best={type:'car',x:car.x,z:car.z,r:9,name:'Твоя машина'};dist=d;}}
  return best;
}
function interactWorld(){
  if(state!=='world')return;if(worldInterior){leaveApartment();return;}
  const target=worldInteractablesAt();if(!target){toast('Поблизости нет объектов для взаимодействия');return;}worldNear=target;
  if(target.type==='apartment'){enterApartment();return;}
  if(target.type==='market'||target.type==='garage'||target.type==='fashion'){openWorldShop(target.type);return;}
  if(target.type==='car'){
    if(!worldDriving){worldDriving=true;worldYaw=player.h;player.mesh.visible=true;charMesh.visible=false;toast('Ты за рулём. WASD — управление, E — выйти.');}
    else{worldDriving=false;charMesh.visible=true;charMesh.position.set(player.mesh.position.x-Math.cos(player.h)*3,0,player.mesh.position.z+Math.sin(player.h)*3);worldYaw=player.h;player.mesh.visible=true;player.speed=0;toast('Ты вышел из машины. E — снова сесть.');}
    return;
  }
  if(target.type==='npc'){const rec=target.rec;rec.waveT=2.4;rec.jumpT=Math.random()<0.45?0.7:0;toast(rec.name+': «'+WORLD_LINES[Math.floor(Math.random()*WORLD_LINES.length)]+'»');return;}
  if(target.type==='raceboard'||target.type==='plaza'){openWorldPhone('events');return;}
}
function updateOpenWorld(dt){
  if($('worldPhone').hidden===false||$('worldShop').hidden===false)return;
  worldAnimT+=dt;worldCollisionTimer=Math.max(0,worldCollisionTimer-dt);
  for(const rec of worldPedestrians){
    const p=rec.mesh,near=worldDriving?Math.hypot(player.mesh.position.x-p.position.x,player.mesh.position.z-p.position.z):charMesh?Math.hypot(charMesh.position.x-p.position.x,charMesh.position.z-p.position.z):999;
    rec.phase+=dt*rec.walk;rec.nextCheer-=dt;if(near<20&&rec.nextCheer<=0){rec.waveT=1.8+Math.random()*1.8;rec.jumpT=Math.random()<0.58?0.55:0;rec.nextCheer=3+Math.random()*6;if(Math.random()<0.58 && Snd.crowd) Snd.crowd();}
    rec.waveT=Math.max(0,rec.waveT-dt);rec.jumpT=Math.max(0,rec.jumpT-dt);
    p.position.x=rec.centerX+(rec.axis==='x'?Math.sin(rec.phase)*rec.amp:Math.sin(rec.phase*.42)*1.2);p.position.z=rec.centerZ+(rec.axis==='z'?Math.cos(rec.phase)*rec.amp:Math.cos(rec.phase*.42)*1.2);
    if(rec.axis==='x')p.rotation.y=Math.cos(rec.phase)>=0?Math.PI/2:-Math.PI/2;else p.rotation.y=Math.sin(rec.phase)>=0?0:Math.PI;
    const u=p.userData;u.legs[0].rotation.x=Math.sin(rec.phase*2)*0.22;u.legs[1].rotation.x=-Math.sin(rec.phase*2)*0.22;
    const cheering=near<22||rec.waveT>0;u.arms[0].rotation.z=cheering?1.9+Math.sin(worldAnimT*8+rec.phase)*0.28:Math.sin(rec.phase*2)*0.18;u.arms[1].rotation.z=rec.waveT>0?-1.8+Math.sin(worldAnimT*9+rec.phase)*0.2:-Math.sin(rec.phase*2)*0.18;
    p.position.y=rec.jumpT>0?Math.sin((1-rec.jumpT/.7)*Math.PI)*0.85:0;
  }
  for(const car of worldTraffic){car.x+=car.speed*car.dir*dt;if(car.x>WORLD_RANGE)car.x=-WORLD_RANGE;if(car.x< -WORLD_RANGE)car.x=WORLD_RANGE;car.mesh.position.set(car.x,0,car.z);car.mesh.userData.wheels.forEach(w=>w.rotation.x+=car.speed*dt/0.4);}
  const actor=worldDriving?player.mesh:charMesh;if(!actor)return;
  if(worldDriving){
    const gas=held.has('gas')&&!player.immobilized&&player.engineStall<=0,brake=held.has('brake'),steer=(held.has('right')?1:0)-(held.has('left')?1:0);player.engineStall=Math.max(0,player.engineStall-dt);
    const max=player.immobilized?0:Math.max(18,phys.max*0.92);if(gas)player.speed+=phys.acc*0.82*dt;if(brake)player.speed-=phys.brk*dt;if(!gas&&!brake)player.speed-=player.speed*0.48*dt;player.speed=player.immobilized?0:clamp(player.speed,-8,max);
    player.h-=steer*(0.4+Math.min(Math.abs(player.speed)/45,1)*0.85)*dt*Math.sign(player.speed||1);player.mesh.rotation.y=player.h;
    const oldX=player.mesh.position.x,oldZ=player.mesh.position.z;player.mesh.position.x+=Math.sin(player.h)*player.speed*dt;player.mesh.position.z+=Math.cos(player.h)*player.speed*dt;player.mesh.userData.wheels.forEach(w=>w.rotation.x+=player.speed*dt/0.4);
    const radX=2.15,radZ=2.65;
    let struck=false;for(const b of worldBuildings){const dx=player.mesh.position.x-b.x,dz=player.mesh.position.z-b.z,ox=b.hw+radX-Math.abs(dx),oz=b.hd+radZ-Math.abs(dz);if(ox>0&&oz>0){if(ox<oz)player.mesh.position.x=b.x+Math.sign(dx||1)*(b.hw+radX);else player.mesh.position.z=b.z+Math.sign(dz||1)*(b.hd+radZ);struck=true;break;}}
    if(struck&&worldCollisionTimer<=0){worldCollisionTimer=0.5;const impact=Math.abs(player.speed);player.speed*=-0.28;player.h+=Math.sign(Math.random()-0.5)*Math.min(0.2,impact*0.003);addDmg(clamp(impact*0.14,1.8,11));spawnSparks(player.mesh.position.x,0.7,player.mesh.position.z,clamp(Math.floor(impact*.35),8,20));Snd.bump();toast('Удар о препятствие · повреждения '+Math.round(player.dmg)+'%');}
    for(const tr of worldTraffic){const dx=player.mesh.position.x-tr.mesh.position.x,dz=player.mesh.position.z-tr.mesh.position.z,d=Math.hypot(dx,dz);if(d<4.4&&worldCollisionTimer<=0){worldCollisionTimer=0.5;const impact=Math.abs(player.speed),nx=d>0.1?dx/d:Math.cos(player.h),nz=d>0.1?dz/d:-Math.sin(player.h);player.mesh.position.x=tr.mesh.position.x+nx*4.65;player.mesh.position.z=tr.mesh.position.z+nz*4.65;player.speed*=0.58;player.vx*=0.58;player.vz*=0.58;addDmg(clamp(impact*0.085,1.4,7));tr.dir*=-1;tr.speed=Math.max(4,tr.speed*0.78);spawnSparks(player.mesh.position.x,0.7,player.mesh.position.z,clamp(Math.floor(impact*.28),6,14));Snd.bump();toast('Столкновение с городским транспортом');break;}}
    if(Math.abs(player.speed)>0.7){player.vx=Math.sin(player.h)*player.speed;player.vz=Math.cos(player.h)*player.speed;}
  }else{
    const oldX=charMesh.position.x,oldZ=charMesh.position.z;const turn=(held.has('right')?1:0)-(held.has('left')?1:0);worldYaw-=turn*2.15*dt;const forward=(held.has('gas')?1:0)-(held.has('brake')?1:0),walkSpeed=held.has('nitro')?14:8.3;
    charMesh.position.x+=Math.sin(worldYaw)*forward*walkSpeed*dt;charMesh.position.z+=Math.cos(worldYaw)*forward*walkSpeed*dt;charMesh.rotation.y=worldYaw;
    let bump=false;for(const b of worldBuildings){if(Math.abs(charMesh.position.x-b.x)<b.hw+0.45&&Math.abs(charMesh.position.z-b.z)<b.hd+0.45){bump=true;break;}}if(bump){charMesh.position.x=oldX;charMesh.position.z=oldZ;}
    const moving=Math.abs(forward)>0;const u=charMesh.userData;u.legs[0].rotation.x=moving?Math.sin(worldAnimT*10)*0.55:0;u.legs[1].rotation.x=moving?-Math.sin(worldAnimT*10)*0.55:0;u.arms[0].rotation.x=moving?-Math.sin(worldAnimT*10)*0.22:0;u.arms[1].rotation.x=moving?Math.sin(worldAnimT*10)*0.22:0;
  }
  if(!worldInterior){const target=worldInteractablesAt();worldNear=target;if(target){$('worldInteractBtn').textContent='E · '+(target.type==='npc'?'Поговорить с '+target.name:target.type==='car'?(worldDriving?'Выйти из машины':'Сесть в машину'):target.type==='apartment'?'Войти домой':target.type==='market'?'Зайти в магазин':target.type==='garage'?'Тюнинг авто':target.type==='fashion'?'Магазин одежды':target.type==='raceboard'||target.type==='plaza'?'Городские события':'Взаимодействовать');$('worldActionHint').textContent='E — '+target.name+' · V — камера · P — телефон';}else{$('worldInteractBtn').textContent='E · Осмотреться';$('worldActionHint').textContent='WASD — движение · E — взаимодействие · V — камера · P — телефон';}}
  else{$('worldInteractBtn').textContent='E · Выйти из квартиры';$('worldActionHint').textContent='Квартира · E — выйти в город · P — телефон';}
  const p=worldPos();const d=Math.hypot(p.x,p.z);$('worldLocation').textContent=worldInterior?'МОЯ КВАРТИРА · ГОСТИНАЯ':d<85?'ЦЕНТР ГОРОДА':p.x<0?'ЗАПАДНЫЙ РАЙОН':'ВОСТОЧНЫЙ РАЙОН';
}
function updateWorldCamera(dt){
  const a=worldDriving?player.mesh:charMesh;if(!a)return;const p=a.position,yaw=worldDriving?player.h:worldYaw;
  if(worldCamMode===0){a.visible=false;const eyeY=worldDriving?1.28:1.64;cam.position.lerp(new THREE.Vector3(p.x,eyeY+(worldInterior?0.1:0),p.z),Math.min(1,9*dt));cam.lookAt(p.x+Math.sin(yaw)*14,eyeY+(worldDriving?0.15:0),p.z+Math.cos(yaw)*14);cam.fov=worldDriving?76:72;}
  else{a.visible=true;let ox=-Math.sin(yaw),oz=-Math.cos(yaw),dist=worldCamMode===1?2.7:7.6,height=worldCamMode===1?2.7:4.1;if(worldInterior){dist=worldCamMode===1?2:6;height=worldCamMode===1?2.6:3.5;}const target=new THREE.Vector3(p.x+ox*dist+(worldCamMode===1?Math.cos(yaw)*0.9:0),height+(worldDriving?0.25:0),p.z+oz*dist-(worldCamMode===1?Math.sin(yaw)*0.9:0));cam.position.lerp(target,Math.min(1,6*dt));cam.lookAt(p.x,worldDriving?1.15:1.25,p.z);cam.fov=worldDriving?72:66;}
  cam.updateProjectionMatrix();
}
function worldKey(code){if(state!=='world')return false;if(code==='KeyE'){interactWorld();return true;}if(code==='KeyV'){cycleWorldCamera();return true;}if(code==='KeyP'){if($('worldPhone').hidden)openWorldPhone('home');else closeWorldPhone();return true;}if(code==='Escape'){if(!$('worldPhone').hidden)closeWorldPhone();else if(!$('worldShop').hidden)$('worldShop').hidden=true;else toMenu();return true;}if(code==='KeyR'){if(worldDriving){if(player.immobilized){setDamage(Math.max(0,player.dmg-32));player.immobilized=false;player.engineStall=0;toast('Эвакуатор запустил двигатель');}player.mesh.position.set(9,0,8);player.speed=0;}return true;}return false;}


// ================= запуск =================
applyGfx(); resize(); refreshSettings(); wakeServer(); applyTouchSettings();
buildTrack(save.level); builtL = save.level;
showCar(save.cur); previewPos(); refreshMenu(); show('menu');
requestAnimationFrame(loop);
})();
