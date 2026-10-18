(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rr = (a, b) => a + Math.random() * (b - a);
const N = 520, ROAD_W = 10.5, WALL = ROAD_W + 2.35;
const tg = window.Telegram && Telegram.WebApp;
let telegramFullscreenRequested = false;
function syncTelegramSafeArea() {
  if (!tg) return;
  const safe = tg.safeAreaInset || {};
  const content = tg.contentSafeAreaInset || {};
  const root = document.documentElement;
  root.style.setProperty('--tg-safe-top', `${Math.max(safe.top || 0, content.top || 0)}px`);
  root.style.setProperty('--tg-safe-right', `${Math.max(safe.right || 0, content.right || 0)}px`);
  root.style.setProperty('--tg-safe-bottom', `${Math.max(safe.bottom || 0, content.bottom || 0)}px`);
  root.style.setProperty('--tg-safe-left', `${Math.max(safe.left || 0, content.left || 0)}px`);
}
function requestGameFullscreen() {
  if (!tg) return;
  try {
    tg.ready();
    if (typeof tg.requestFullscreen === 'function') { const result=tg.requestFullscreen(); if(result&&typeof result.catch==='function')result.catch(()=>{try{tg.expand();}catch(_){}}); }
    else if (typeof tg.expand === 'function') tg.expand();
    telegramFullscreenRequested = true;
  } catch (_) { try { tg.expand(); } catch (_) {} }
  syncTelegramSafeArea();
}
if (tg) {
  tg.ready(); tg.expand(); syncTelegramSafeArea();
  // Keep the Mini App open while the player swipes vertically to look around.
  // Telegram still lets the player close it using the native header controls.
  try { if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes(); } catch (_) {}
  if (typeof tg.onEvent === 'function') {
    try { tg.onEvent('safeAreaChanged', syncTelegramSafeArea); tg.onEvent('contentSafeAreaChanged', syncTelegramSafeArea); } catch (_) {}
  }
  document.addEventListener('pointerdown', function firstGameTouch() {
    requestGameFullscreen();
    document.removeEventListener('pointerdown', firstGameTouch);
  }, { passive: true });
}

// ================= сохранение (localStorage: только это устройство, без серверной защиты) =================
const defSave = () => ({ v: 4, name: 'Гонщик', coins: 0, cur: 'rust', cars: { rust: { up: [0, 0, 0, 0, 0, 0], dmg: 0 } }, level: 1, paint: {}, style: {}, neon: {}, tune: {}, char: { g: 'boy', col: 0, skin: 0 }, tour: null, set: { snd: 1, mus: 1, gfx: 'auto', resolution: 'recommended', theme: 'dark', server: SERVER_URL, touchLayout: 'left', touchSize: 'normal', keys: { gas: 'ArrowUp', brake: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', nitro: 'Space', drift: 'ShiftLeft' } } });
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
const WORLD_REGIONS = {
  newyork: { id:'newyork', name:'США · Нью-Йорк', short:'NEW YORK', style:'manhattan', landmark:'empire', ground:0x6f7a68, asphalt:0x2f3236, concrete:0xb9b7b0, lane:0xf2d36b, window:0xb5d9f2, windowGlow:0x2c4a63, lamp:0xffd9a0, bcol:[0x8d9399,0x6f7882,0xa49b90,0x7c8791,0x5f6a75,0x9a8f84,0x838d98,0xb0a79b], palm:false, sky:[0x7d9fc0,0xcfd7de], fog:0xaab3ba, landmarkAt:{x:0,z:-190}, welcome:'MANHATTAN · NEW YORK', roadW:20 },
  tashkent: { id:'tashkent', name:'Узбекистан · Ташкент', short:'ТАШКЕНТ', style:'central-asian', landmark:'bazaar', ground:0x6a8064, asphalt:0x353a3c, concrete:0xc1b9a7, lane:0xf0e2b6, window:0x8de9ed, windowGlow:0x236e79, lamp:0xffd48a, bcol:[0xd4b995,0xb79d7b,0xceb991,0x93a6a4,0xd9c9a5,0x8f9d9b,0xb8a58a,0xa3b5b3], palm:false, sky:[0x96bad4,0xd8c4a1], fog:0xc6b69c, landmarkAt:{x:-130,z:-180}, welcome:'ШАҲАР · ТАШКЕНТ', roadW:24 },
  paris: { id:'paris', name:'Франция · Париж', short:'PARIS', style:'haussmann', landmark:'eiffel', ground:0x6f8560, asphalt:0x35383d, concrete:0xc9c7c1, lane:0xf3e6b9, window:0xd5e8f4, windowGlow:0x263d58, lamp:0xffdca1, bcol:[0xd1c3ad,0xb6a48d,0xe0d5c1,0x9e8f7f,0xc6b8a3,0x8f969d,0xe6dcc9,0xb6aaa0], palm:false, sky:[0x829bb2,0xd3c1ae], fog:0xb7b5b0, landmarkAt:{x:0,z:-190}, welcome:'RIVE GAUCHE · PARIS', roadW:17 },
  italy: { id:'italy', name:'Италия · Рим', short:'ROMA', style:'roman', landmark:'colosseum', ground:0x81825a, asphalt:0x393938, concrete:0xd2c3aa, lane:0xe8d5a6, window:0xd9edee, windowGlow:0x56453a, lamp:0xffd19a, bcol:[0xc58d69,0xd5ae8c,0xb98161,0xe1c4a3,0xbfa58a,0x9f775b,0xd9b797,0xc5a78a], palm:false, sky:[0x9cbdd3,0xe8c9a4], fog:0xd4b08e, landmarkAt:{x:0,z:-190}, welcome:'CENTRO STORICO · ROMA', roadW:18 },
  losangeles: { id:'losangeles', name:'США · Лос-Анджелес', short:'LOS ANGELES', style:'california', landmark:'hollywood', ground:0x7b8758, asphalt:0x31363a, concrete:0xc8c6bd, lane:0xf5e8b3, window:0xb8e9f1, windowGlow:0x214c60, lamp:0xffdb99, bcol:[0xb7b5a6,0x9b9b91,0xd6c8ad,0x8b969b,0xc2b6a2,0xa9b5b5,0xd5d2c4,0x929eaa], palm:true, sky:[0x8fc8e8,0xf1c8a4], fog:0xd7c2a1, landmarkAt:{x:-170,z:-220}, welcome:'SUNSET BOULEVARD · LOS ANGELES', roadW:27 },
  miami: { id:'miami', name:'США · Майами', short:'MIAMI', style:'art-deco', landmark:'ocean', ground:0xd6c09b, asphalt:0x3c4247, concrete:0xf0dfc4, lane:0xf8efcc, window:0x9cf4f0, windowGlow:0x255c76, lamp:0xffb8a1, bcol:[0xf0bcae,0x9dd6d2,0xe7c7a2,0xf1d5b7,0xa7c7d8,0xf4b1b1,0xc0ded0,0xe4b8cf], palm:true, sky:[0x64b6df,0xffc3a2], fog:0xb6d8de, landmarkAt:{x:770,z:0}, welcome:'OCEAN DRIVE · MIAMI', roadW:22 }
};
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
function updateResponsiveMode() {
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
  document.body.classList.toggle('mobile-ui', mobile);
  document.body.classList.toggle('desktop-ui', !mobile);
}
updateResponsiveMode();
const LOW_DEVICE = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4) || matchMedia('(max-width: 700px)').matches;
let adaptiveScale = 1, fpsSamples = 0, fpsTime = 0, lowFpsWindows = 0;
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !LOW_DEVICE, powerPreference: 'high-performance' });
window.gameRenderer = renderer;
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
  // Keep the canvas crisp: adaptive resolution is capped more conservatively in the RT-look tier.
  const maxRatio = ({verylow:0.72,low:0.9,med:1.12,high:1.35,veryhigh:1.45,ultra:1.5,rt:1.35})[g] || 1.1;
  const scaleFloor = g === 'rt' ? 0.88 : g === 'ultra' ? 0.78 : 0.56;
  adaptiveScale = Math.max(scaleFloor, adaptiveScale);
  const resolutionMode = ['720p','1080p','2k','4k'].includes(save.set.resolution) ? save.set.resolution : 'recommended';
  const targetLongestEdge = ({'720p':1280,'1080p':1920,'2k':2560,'4k':3840})[resolutionMode];
  const screenLongestEdge = Math.max(innerWidth, innerHeight, 1);
  const basePixelRatio = targetLongestEdge
    ? Math.min(3, targetLongestEdge / screenLongestEdge)
    : Math.min(devicePixelRatio || 1, maxRatio);
  renderer.setPixelRatio(Math.max(0.55, basePixelRatio * adaptiveScale));
  renderer.setSize(innerWidth, innerHeight);
  const shadowOn = ['high','veryhigh','ultra','rt'].includes(g);
  renderer.shadowMap.enabled = shadowOn; sun.castShadow = shadowOn;
  const sz = ({verylow:256,low:384,med:512,high:1024,veryhigh:1536,ultra:2048,rt:2048})[g] || 512;
  if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  spot.visible = !['verylow','low'].includes(g); rainOn = !['verylow','low'].includes(g);
  // Large PCF radii smear fine edges and look like blur; use smaller, sharper shadows.
  sun.shadow.radius = g === 'rt' ? 1.25 : g === 'ultra' ? 1.5 : g === 'veryhigh' ? 2 : 1;
  renderer.toneMappingExposure = g === 'rt' ? 1.08 : g === 'ultra' ? 1.1 : 1.1;
  if (rainG) rainG.visible = rainOn && !!rainG.userData.want;
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
}
function resize() {
  applyGfx();
  renderer.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); updateResponsiveMode();
  if (typeof applyTouchSettings === 'function') {
    // If controls are still on their default layout, recalculate it for portrait/landscape instead of freezing the old arrangement.
    if (!Object.keys((save.set && save.set.touchPos) || {}).length) applyTouchSettings();
    else { clampStoredTouchPositions(); applyTouchSettings(); }
  }
}
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
    const levelScale = 0.62 + clamp((Number(L) || 1) - 1, 0, 99) / 99 * 0.68;
    const rX = (355 + rnd() * 150) * levelScale, rZ = (325 + rnd() * 145) * levelScale;
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

  const s0 = sampleAt(0, 0), t0=tan[0], lateralX=t0.z, lateralZ=-t0.x, halfW=ROAD_W, halfT=0.72;
  const finishGeo=new THREE.BufferGeometry();
  const finishVerts=[s0.x+lateralX*halfW+t0.x*halfT,0.075,s0.z+lateralZ*halfW+t0.z*halfT, s0.x-lateralX*halfW+t0.x*halfT,0.075,s0.z-lateralZ*halfW+t0.z*halfT, s0.x-lateralX*halfW-t0.x*halfT,0.075,s0.z-lateralZ*halfW-t0.z*halfT, s0.x+lateralX*halfW-t0.x*halfT,0.075,s0.z+lateralZ*halfW-t0.z*halfT];
  finishGeo.setAttribute('position',new THREE.Float32BufferAttribute(finishVerts,3));finishGeo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));finishGeo.setIndex([0,1,2,0,2,3]);finishGeo.computeVertexNormals();
  const finishTex=canvasTex(512,64,(ctx,w,h)=>{const cells=24,rows=2;for(let y=0;y<rows;y++)for(let x=0;x<cells;x++){ctx.fillStyle=(x+y)%2?'#101317':'#f7f8fa';ctx.fillRect(x*w/cells,y*h/rows,w/cells+0.5,h/rows+0.5);}});finishTex.wrapS=finishTex.wrapT=THREE.ClampToEdgeWrapping;
  const sl=new THREE.Mesh(finishGeo,new THREE.MeshBasicMaterial({map:finishTex,side:THREE.DoubleSide}));sl.name='TR perpendicular checker finish line';trackG.add(sl);
  const arch = new THREE.Group(), am = new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x330000 });
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), am); p.position.set(s * (ROAD_W + 2), 4, 0); arch.add(p); });
  const bm = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W * 2 + 4.6, 1.2, 0.8), am); bm.position.y = 8; arch.add(bm);
  arch.position.set(s0.x, 0, s0.z); arch.rotation.y = s0.h; trackG.add(arch);

  const dum = new THREE.Object3D(),fenceMat=new THREE.MeshStandardMaterial({color:0x9ca5ad,roughness:0.42,metalness:0.68});
  const segmentCount=Math.ceil(N/3),fenceRails=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045,0.045,1,6),fenceMat,segmentCount*2*3),fencePosts=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075,0.085,1.65,7),fenceMat,segmentCount*2);let rk=0,pk=0;
  for(let i=0;i<N;i+=3){const j=(i+3)%N;for(const side of [-1,1]){const ox=tan[i].z*(ROAD_W+1.8)*side,oz=-tan[i].x*(ROAD_W+1.8)*side,ox2=tan[j].z*(ROAD_W+1.8)*side,oz2=-tan[j].x*(ROAD_W+1.8)*side;const ax=pos[i].x+ox,az=pos[i].z+oz,bx=pos[j].x+ox2,bz=pos[j].z+oz2;const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);const dir=new THREE.Vector3(dx,0,dz).normalize();for(const y of [0.42,0.92,1.42]){dum.position.set((ax+bx)/2,y,(az+bz)/2);dum.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);dum.scale.set(1,len,1);dum.updateMatrix();fenceRails.setMatrixAt(rk++,dum.matrix);}dum.position.set(ax,0.83,az);dum.quaternion.identity();dum.scale.set(1,1,1);dum.updateMatrix();fencePosts.setMatrixAt(pk++,dum.matrix);}}
  fenceRails.instanceMatrix.needsUpdate=true;fencePosts.instanceMatrix.needsUpdate=true;trackG.add(fenceRails,fencePosts);
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
  // Compact, reusable low-poly grandstands with animated-game-style crowd silhouettes.
  // Their placement follows the generated track tangent so they stay outside every bend.
  const standCount=['verylow','low'].includes(resolvedGfx())?2:4;
  const standBody=new THREE.MeshStandardMaterial({color:0x303544,roughness:0.78,metalness:0.1});
  const standSteps=new THREE.MeshStandardMaterial({color:0x535d71,roughness:0.8});
  const crowdMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9});
  for(let si=0;si<standCount;si++){
    const idx=Math.floor((si+0.5)*N/standCount),side=si%2? -1:1,sp=sideAt(idx,ROAD_W+16,side),stand=new THREE.Group();
    stand.name='TR track grandstand '+(si+1);stand.position.set(sp.x,0,sp.z);stand.rotation.y=sp.h;
    const base=new THREE.Mesh(new THREE.BoxGeometry(10,1.0,38),standBody);base.position.set(side*3.4,0.6,0);stand.add(base);
    for(let tier=0;tier<4;tier++){
      const step=new THREE.Mesh(new THREE.BoxGeometry(7.5,0.85,36),standSteps);step.position.set(side*(1.3+tier*1.15),1.25+tier*0.93,0);stand.add(step);
    }
    const lightMat=new THREE.MeshStandardMaterial({color:si%2?0xff4dba:0x3be8ff,emissive:si%2?0x8f1459:0x08788e,emissiveIntensity:1.1});
    const banner=new THREE.Mesh(new THREE.BoxGeometry(0.18,1.05,35),lightMat);banner.position.set(side*6.9,5.2,0);stand.add(banner);
    const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(0.20,6,5),crowdMat,56);heads.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const colors=[0xffce9e,0xf3f2ed,0x2e9fbd,0xe45b6a,0xffcf52,0x8bdc9b,0x9f8ae6];
    for(let j=0;j<56;j++){
      const row=Math.floor(j/14),col=j%14,dx=side*(1.2+row*1.13),dz=(col-6.5)*2.2;
      dum.position.set(dx,1.85+row*0.93,dz);dum.rotation.set(0,0,0);dum.scale.set(1,1.15,1);dum.updateMatrix();heads.setMatrixAt(j,dum.matrix);
      if(heads.setColorAt)heads.setColorAt(j,new THREE.Color(colors[Math.floor(rnd()*colors.length)]));
    }
    heads.instanceMatrix.needsUpdate=true;if(heads.instanceColor)heads.instanceColor.needsUpdate=true;stand.add(heads);
    stand.traverse(o=>{o.castShadow=false;o.receiveShadow=true;});trackG.add(stand);
  }
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
  for (let i = 0; i < 7; i++) put('ramp', 36 + i * 68 + rnd() * 12, (rnd() - 0.5) * 1.25);
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

function disposeModel(root) {
  if (!root) return;
  if (window.TRModels && typeof window.TRModels.unregister === 'function') window.TRModels.unregister(root);
  root.traverse(o => { if (o.geometry && o.geometry !== WEDGE && !(o.userData && o.userData.trSharedAsset)) o.geometry.dispose(); });
}
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
const WORLD_DEFAULT_KEYMAP = { KeyW: 'gas', KeyA: 'left', KeyS: 'brake', KeyD: 'right' };
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
  if (e.code === 'KeyV' && state === 'race') { cycleRaceCamera(); e.preventDefault(); return; }
  if (e.code === 'KeyF' && (state === 'race' || state === 'world')) { photoRequested = true; e.preventDefault(); return; }
  if (e.code === 'KeyR') { fixPlayer(); return; }
  const k = activeKeyMap()[e.code] || (state === 'world' ? WORLD_DEFAULT_KEYMAP[e.code] : null); if (k) { held.add(k); e.preventDefault(); }
});
addEventListener('keyup', e => { const k = activeKeyMap()[e.code] || (state === 'world' ? WORLD_DEFAULT_KEYMAP[e.code] : null); if (k) held.delete(k); });
function releaseAllInputs() {
  held.clear();
  document.querySelectorAll('.tb.on').forEach(b => { b.classList.remove('on'); delete b.dataset.activeAction; });
  touchDrag = null;
}
addEventListener('blur', releaseAllInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllInputs(); });
let touchEditing = false, touchDrag = null;
function saveTouchPositions() { store(); }
function defaultTouchPositions() {
  const landscape = innerWidth > innerHeight;
  let p = landscape ? {
    left:{x:.075,y:.77}, right:{x:.185,y:.77}, nitro:{x:.70,y:.77}, brake:{x:.825,y:.79}, drift:{x:.70,y:.92}, gas:{x:.86,y:.91}
  } : {
    left:{x:.12,y:.82}, right:{x:.255,y:.82}, nitro:{x:.70,y:.73}, brake:{x:.86,y:.81}, drift:{x:.70,y:.91}, gas:{x:.86,y:.91}
  };
  if (save.set.touchLayout === 'right') {
    const swapX = q => ({x:1-q.x,y:q.y});
    const a=swapX(p.left), b=swapX(p.right), c=swapX(p.nitro), d=swapX(p.brake), e=swapX(p.drift), f=swapX(p.gas);
    p={left:a,right:b,nitro:c,brake:d,drift:e,gas:f};
  }
  return p;
}
function clampTouchCenter(x, y, b) {
  const scale = clamp(Number((save.set.touchScale || {})[b.dataset.button]) || 1, .6, 1.6);
  const halfW = (b.offsetWidth || 72) * scale / 2 + 7;
  const halfH = (b.offsetHeight || 72) * scale / 2 + 8;
  const minX = Math.min(.49, halfW / Math.max(1, innerWidth));
  const minY = Math.min(.44, (halfH + 8) / Math.max(1, innerHeight));
  const maxX = 1 - minX;
  const maxY = 1 - Math.min(.48, (halfH + 20) / Math.max(1, innerHeight));
  return { x: clamp(Number(x) || .5, minX, Math.max(minX, maxX)), y: clamp(Number(y) || .5, minY, Math.max(minY, maxY)) };
}
function clampStoredTouchPositions() {
  if (!save.set.touchPos) return;
  document.querySelectorAll('.tb[data-button]').forEach(b => {
    const p = save.set.touchPos[b.dataset.button];
    if (p) save.set.touchPos[b.dataset.button] = clampTouchCenter(p.x,p.y,b);
  });
}
function captureDefaultTouchPositions() {
  save.set.touchPos = {};
  save.set.touchScale = {};
  const pos = defaultTouchPositions();
  document.querySelectorAll('.tb[data-button]').forEach(b => {
    const p = pos[b.dataset.button];
    save.set.touchPos[b.dataset.button] = clampTouchCenter(p.x,p.y,b);
  });
}
function touchGlyph(action) {
  // The same screen controls adapt their labels to the current mode instead of confusing pedestrians with racing actions.
  if (state === 'world' && !worldDriving) return ({left:'↶',right:'↷',gas:'▲',brake:'▼',nitro:'БЕГ',drift:'ПРЫЖОК'})[action] || action;
  return ({left:'◀',right:'▶',gas:'▲',brake:'▼',nitro:'N',drift:'DRIFT'})[action] || action;
}
function touchActionTitle(action) {
  if (state === 'world' && !worldDriving) return ({left:'Повернуть налево',right:'Повернуть направо',gas:'Идти вперёд',brake:'Идти назад',nitro:'Бежать быстрее',drift:'Прыгнуть'})[action] || action;
  return keyNames[action] || action;
}
document.querySelectorAll('.tb').forEach(b => {
  b.addEventListener('pointerdown', e => {
    if (touchEditing) {
      const id=b.dataset.button, rect=b.getBoundingClientRect();
      touchDrag={button:b,id,pointer:e.pointerId,dx:e.clientX-(rect.left+rect.width/2),dy:e.clientY-(rect.top+rect.height/2)};
      try { b.setPointerCapture(e.pointerId); } catch (_) {}
      b.classList.add('dragging'); e.preventDefault(); e.stopPropagation(); return;
    }
    const k = b.dataset.k; b.dataset.activeAction = k; held.add(k); b.classList.add('on'); e.preventDefault();
  });
  b.addEventListener('pointermove', e => {
    if (!touchEditing || !touchDrag || touchDrag.button!==b) return;
    const proposed=clampTouchCenter((e.clientX-touchDrag.dx)/Math.max(1,innerWidth),(e.clientY-touchDrag.dy)/Math.max(1,innerHeight),b);
    b.style.left=(proposed.x*100)+'%'; b.style.top=(proposed.y*100)+'%';
    save.set.touchPos=save.set.touchPos||{}; save.set.touchPos[touchDrag.id]=proposed; e.preventDefault();
  });
  ['pointerup','pointercancel'].forEach(ev => b.addEventListener(ev, e => {
    if (touchEditing) {
      if (touchDrag && touchDrag.button===b) { touchDrag=null; b.classList.remove('dragging'); saveTouchPositions(); }
      e.preventDefault(); return;
    }
    const k=b.dataset.activeAction||b.dataset.k; held.delete(k); delete b.dataset.activeAction; b.classList.remove('on'); e.preventDefault();
  }));
  b.addEventListener('pointerleave', e => {
    if (touchEditing) return;
    const k=b.dataset.activeAction; if(k){held.delete(k);delete b.dataset.activeAction;b.classList.remove('on');}
  });
});
function applyTouchSettings() {
  const touch = $('touch');
  touch.classList.toggle('swap', save.set.touchLayout === 'right');
  touch.classList.toggle('small-controls', save.set.touchSize === 'small');
  touch.classList.toggle('large-controls', save.set.touchSize === 'large');
  touch.classList.toggle('editing', touchEditing);
  save.set.touchKeys = Object.assign({left:'left',right:'right',nitro:'nitro',brake:'brake',drift:'drift',gas:'gas'}, save.set.touchKeys || {});
  save.set.touchPos = Object.assign({}, save.set.touchPos || {}); save.set.touchScale = Object.assign({}, save.set.touchScale || {});
  const hasCustom = Object.keys(save.set.touchPos).length > 0;
  const defaults = defaultTouchPositions();
  touch.classList.toggle('has-custom-positions', hasCustom);
  document.querySelectorAll('.tb[data-button]').forEach(b => {
    const id=b.dataset.button, action=save.set.touchKeys[id]||id;
    b.dataset.k=action; b.innerHTML=touchGlyph(action); b.title=touchActionTitle(action)+(touchEditing?' · перетащить':'');
    b.classList.toggle('world-run',state==='world'&&!worldDriving&&action==='nitro'); b.classList.toggle('world-jump',state==='world'&&!worldDriving&&action==='drift');
    let q=save.set.touchPos[id];
    // Old/cloud profiles can contain only some coordinates. Never let the missing buttons stack at (0,0).
    if (!q && hasCustom) { const d=defaults[id]||{x:.5,y:.8}; q=clampTouchCenter(d.x,d.y,b); save.set.touchPos[id]=q; }
    if(q){const fixed=clampTouchCenter(q.x,q.y,b); b.style.position='fixed';b.style.left=(fixed.x*100)+'%';b.style.top=(fixed.y*100)+'%';save.set.touchPos[id]=fixed;}
    else{b.style.position='';b.style.left='';b.style.top='';}
    const scale=clamp(Number(save.set.touchScale[id])||1,.6,1.6);
    b.style.transform=(q||touchEditing?'translate(-50%,-50%) ':'')+'scale('+scale+')';
  });
  if($('touchScaleTarget')) { const id=$('touchScaleTarget').value; $('touchScaleRange').value=Math.round((Number(save.set.touchScale[id])||1)*100); $('touchScaleValue').textContent=$('touchScaleRange').value+'%'; }
}
function resetTouchLayout() {
  const keepEditing = touchEditing;
  save.set.touchPos={}; save.set.touchScale={};
  if (keepEditing) captureDefaultTouchPositions();
  else { $('touch').classList.remove('has-custom-positions'); }
  store(); applyTouchSettings(); if (typeof syncTouchEditorSize === 'function') syncTouchEditorSize();
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
  ['hud', 'count', 'fixBtn','raceCamBtn','minimap','worldMiniMap','worldHud','worldPhone','worldShop','worldSelect','worldLoading','worldDevPanel','touchEditDone','touchEditPanel'].forEach(i => {const el=$(i);if(el)el.hidden=true;}); $('touch').hidden = true; $('touch').classList.remove('editing'); $('fx').style.opacity = 0;
  if (worldG) worldG.visible = false; if (apartmentG) apartmentG.visible = false; if (schoolG) schoolG.visible = false; worldInterior=false; worldDriving=false; worldNear=null;
  if(leavingWorld){scene.background=null;scene.fog=null;spot.visible=true;hemi.intensity=0.8;sun.intensity=0.8;sun.color.setHex(0xffffff);if(snowG)snowG.visible=false;}
  ais.forEach(a => { scene.remove(a.mesh); disposeModel(a.mesh); }); ais = [];
  if (leavingWorld || builtL !== save.level) { buildTrack(save.level); builtL = save.level; }
  showCar(save.cur); previewPos(); refreshMenu(); state = 'menu'; show('menu'); applyTouchSettings(); Snd.music('menu'); Snd.idle();
}
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Snd.click(); toMenu(); }));
$('garageBtn').onclick = () => openScreen('garage');
$('charBtn').onclick = () => openScreen('char');
$('trainBtn').onclick = () => openScreen('train');
$('tourBtn').onclick = () => openScreen('tour');
$('onlineBtn').onclick = () => openScreen('online');
$('setBtn').onclick = () => openScreen('settings');
$('helpBtn').onclick = () => openScreen('help');
function showWorldSelect(){
  requestGameFullscreen();const box=$('worldRegionCards');
  box.innerHTML=Object.values(WORLD_REGIONS).filter(r=>r.id==='newyork').map(r=>`<button class="world-region-card" data-region="${r.id}"><span class="region-art ${r.id}"><i></i><b>${r.short}</b></span><strong>${r.name}</strong><small>Единая большая карта Манхэттена · свободное исследование города</small></button>`).join('');
  $('worldSelect').hidden=false;
}
$('worldRegionCards').addEventListener('click',e=>{const b=e.target.closest('[data-region]');if(!b)return;$('worldSelect').hidden=true;startOpenWorld(b.dataset.region);});
$('worldSelectClose').onclick=()=>{$('worldSelect').hidden=true;};
$('worldBtn').onclick=showWorldSelect;
if($('tutorialStartBtn'))$('tutorialStartBtn').onclick=()=>{save.set.tutorialComplete=true;store();$('tutorialOverlay').hidden=true;tutorialPermitStart=true;startOpenWorld(pendingTutorialRegion||'newyork');};
if($('tutorialSkipBtn'))$('tutorialSkipBtn').onclick=()=>{$('tutorialOverlay').hidden=true;save.set.tutorialComplete=true;store();tutorialPermitStart=true;startOpenWorld(pendingTutorialRegion||'newyork');};
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
const TUNE_PRICES = { paint:450, style:1200, neon:1800, rim:650, wing:1400 };
function payForTuning(cost, label) { if (save.coins < cost) { toast('Не хватает монет: нужно '+cost.toLocaleString('ru-RU')); return false; } save.coins-=cost; toast(label+' · −'+cost.toLocaleString('ru-RU')+' монет'); return true; }
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
  $('gStyleBtn').textContent = 'Кузов: ' + ['Стандарт','Мускул','Суперкар','Гиперкар'][save.style[d.id] || 0] + ' · '+TUNE_PRICES.style; $('gStyleBtn').disabled = !own || save.coins<TUNE_PRICES.style;
  $('gNeonBtn').textContent = 'Неон: ' + (save.neon[d.id] === false ? 'выкл.' : 'вкл.') + (save.neon[d.id]===false?' · '+TUNE_PRICES.neon:''); $('gNeonBtn').disabled = !own || (save.neon[d.id]===false && save.coins<TUNE_PRICES.neon);
  const tune = carTune(d.id), rimNames = ['Серебро','Бронза','Чёрный','Кибер','Золото'], wingNames = ['Без спойлера','Низкий','GT','Гипер','Заводской'];
  $('gRimBtn').textContent = 'Диски: ' + rimNames[((tune.rimStyle|0) + rimNames.length) % rimNames.length] + ' · '+TUNE_PRICES.rim; $('gRimBtn').disabled = !own || save.coins<TUNE_PRICES.rim;
  $('gWingBtn').textContent = 'Спойлер: ' + (tune.wing == null ? wingNames[4] : wingNames[Math.max(0, Math.min(3, tune.wing|0))]) + ' · '+TUNE_PRICES.wing; $('gWingBtn').disabled = !own || save.coins<TUNE_PRICES.wing;
}
$('paintOptions').onclick = e => { const b=e.target.closest('[data-paint]'); if(!b) return; const id=CARS[gSel].id; if(!save.cars[id]) return; const next=b.dataset.paint==='factory'?null:parseInt(b.dataset.paint,10); if((save.paint[id]??null)===next) return; const cost=next===null?0:TUNE_PRICES.paint; if(cost&&!payForTuning(cost,'Покраска')) return; save.paint[id]=next; store(); refreshMenu(); showCar(id); previewPos(); renderGarage(); };
$('gStyleBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]||!payForTuning(TUNE_PRICES.style,'Стиль кузова')) return; save.style[id]=((save.style[id]||0)+1)%STYLE_SHAPES.length; store(); refreshMenu(); showCar(id); previewPos(); renderGarage(); };
$('gNeonBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]) return; const turningOn=save.neon[id]===false; if(turningOn&&!payForTuning(TUNE_PRICES.neon,'Неоновая подсветка')) return; save.neon[id]=!turningOn; store(); refreshMenu(); showCar(id); previewPos(); renderGarage(); };
$('gRimBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]||!payForTuning(TUNE_PRICES.rim,'Новые диски')) return; const t=carTune(id); t.rimStyle=((t.rimStyle|0)+1)%5; save.tune[id]=t; store(); refreshMenu(); showCar(id); previewPos(); renderGarage(); };
$('gWingBtn').onclick = () => { const id=CARS[gSel].id; if(!save.cars[id]||!payForTuning(TUNE_PRICES.wing,'Спойлер')) return; const t=carTune(id); t.wing=t.wing==null?0:t.wing>=3?null:t.wing+1; save.tune[id]=t; store(); refreshMenu(); showCar(id); previewPos(); renderGarage(); };
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
const GFX = { auto: 'Рекомендации', verylow: 'Очень низкая', low: 'Низкая', med: 'Средняя', high: 'Высокая', veryhigh: 'Очень высокая', ultra: 'Ультра', rt: 'RT-стиль · чёткая картинка' };
const RESOLUTION_LABELS = { recommended: 'Рекомендации', '720p': '720 пикселей · экономно', '1080p': '1080 пикселей', '2k': '2K', '4k': '4K · нагрузка выше' };
function renderKeyBindings() {
  $('keyBindings').innerHTML = actionKeys.map(a => `<button class="btn" data-key-action="${a}">${keyNames[a]}: <b>${waitingKey===a?'Нажмите клавишу…':prettyKey(save.set.keys[a])}</b></button>`).join('');
  const opts = actionKeys.map(a => `<option value="${a}">${keyNames[a]}</option>`).join('');
  save.set.touchKeys = Object.assign({ left:'left', right:'right', nitro:'nitro', brake:'brake', drift:'drift', gas:'gas' }, save.set.touchKeys || {});
  $('touchBindings').innerHTML = ['left','right','nitro','brake','drift','gas'].map(b => `<label class="touch-bind-row"><span>${({left:'Левая кнопка руля',right:'Правая кнопка руля',nitro:'Кнопка N',brake:'Кнопка ▼',drift:'Кнопка DRIFT',gas:'Кнопка ▲'})[b]}</span><select data-touch-button="${b}">${opts.replace(`value="${save.set.touchKeys[b]}"`,`value="${save.set.touchKeys[b]}" selected`)}</select></label>`).join('');
}
function refreshSettings() {
  $('nameIn').value = save.name; $('srvIn').value = save.set.server || '';
  $('sndBtn').textContent = save.set.snd ? 'Вкл' : 'Выкл'; $('musBtn').textContent = save.set.mus ? 'Вкл' : 'Выкл';
  $('gfxBtn').textContent = GFX[save.set.gfx] || GFX.auto; if ($('resolutionBtn')) $('resolutionBtn').textContent = RESOLUTION_LABELS[save.set.resolution] || RESOLUTION_LABELS.recommended; $('themeBtn').textContent = save.set.theme === 'light' ? 'Светлая' : 'Тёмная';
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
$('gfxBtn').onclick = () => { const k = ['auto','verylow','low','med','high','veryhigh','ultra','rt']; save.set.gfx = k[(k.indexOf(save.set.gfx) + 1) % k.length]; adaptiveScale=1; store(); refreshSettings(); applyGfx(); builtL = -1; toast('Детализация: '+GFX[save.set.gfx]); };
if ($('resolutionBtn')) $('resolutionBtn').onclick = () => { const k = ['recommended','720p','1080p','2k','4k']; save.set.resolution = k[(k.indexOf(save.set.resolution || 'recommended') + 1) % k.length]; adaptiveScale=1; store(); refreshSettings(); applyGfx(); toast('Разрешение: '+RESOLUTION_LABELS[save.set.resolution]); };
$('themeBtn').onclick = () => { save.set.theme = save.set.theme === 'light' ? 'dark' : 'light'; store(); refreshSettings(); };
$('touchLayoutBtn').onclick = () => {
  save.set.touchLayout = save.set.touchLayout === 'right' ? 'left' : 'right';
  // Keep the player's custom layout useful: mirror every saved control across the screen when swapping sides.
  if(save.set.touchPos && Object.keys(save.set.touchPos).length){
    for(const p of Object.values(save.set.touchPos)) if(p && Number.isFinite(p.x)) p.x=1-p.x;
  }
  store(); refreshSettings(); toast('Стороны управления поменяны');
};
$('touchSizeBtn').onclick = () => { const k=['normal','small','large']; save.set.touchSize=k[(k.indexOf(save.set.touchSize||'normal')+1)%k.length]; store(); refreshSettings(); };
$('editTouchBtn').onclick = () => {
  held.clear(); $('touch').hidden=false; touchEditing=false; $('touch').classList.remove('editing');
  if (!Object.keys(save.set.touchPos||{}).length) captureDefaultTouchPositions();
  else clampStoredTouchPositions();
  touchEditing=true; $('touchEditHint').hidden=false; $('touchEditDone').hidden=false; $('touchEditPanel').hidden=false; $('hud').hidden=true;
  show(null); state='touchsetup'; applyTouchSettings(); syncTouchEditorSize(); toast('Перетащи кнопки в удобные места');
};
$('touchScaleTarget').onchange = () => applyTouchSettings();
$('touchScaleRange').oninput = () => {
  const id=$('touchScaleTarget').value;save.set.touchScale=save.set.touchScale||{};
  save.set.touchScale[id]=clamp(Number($('touchScaleRange').value)/100,.6,1.6);
  applyTouchSettings(); // Re-clamp the selected button after resizing so its edge cannot slip off-screen.
  store();
};
$('touchResetBtn').onclick = () => { resetTouchLayout(); toast('Восстановлено расположение по умолчанию'); };
function syncTouchEditorSize(){const id=$('touchEditTarget').value;const v=Math.round((Number((save.set.touchScale||{})[id])||1)*100);$('touchEditRange').value=v;$('touchEditValue').textContent=v+'%';}
$('touchEditTarget').onchange=syncTouchEditorSize;
$('touchEditRange').oninput=()=>{
  const id=$('touchEditTarget').value;save.set.touchScale=save.set.touchScale||{};
  save.set.touchScale[id]=clamp(Number($('touchEditRange').value)/100,.6,1.6);
  $('touchEditValue').textContent=$('touchEditRange').value+'%';
  applyTouchSettings();store();
};
$('touchEditReset').onclick=()=>{resetTouchLayout();toast('Раскладка сброшена на стандартную');};
$('touchEditDone').onclick = () => {
  touchEditing=false; touchDrag=null; held.clear(); clampStoredTouchPositions(); saveTouchPositions(); $('touchEditHint').hidden=true; $('touchEditDone').hidden=true; $('touchEditPanel').hidden=true; $('touch').hidden=true;
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
  leaveChar(); showCar(save.cur); phys = physFor(save.cur); player.dmg = save.cars[save.cur].dmg; player.immobilized=player.dmg>=100; criticalRespawnAt=player.immobilized?performance.now():0;criticalRespawnReady=false;player.engineStall=0; applyDamageVisual();
  if (cfg.mode !== 'online') mySlot = ais.length;     // игрок на последнем месте решётки
  placeGrid(mySlot); resetItems();
  nitro = phys.nCap; raceCoins = 0; raceStartedAt = performance.now(); player.finished = false; stuckT = 0; fixCool = 0; held.clear();
  state = 'count'; raceCamMode=2;updateRaceCameraLabel();$('raceCamBtn').hidden=false; show(null); $('hud').hidden = false; $('minimap').hidden=false; $('worldHud').hidden=true; $('worldSelect').hidden=true; $('touch').hidden = !isTouch; $('fixBtn').hidden = true; applyTouchSettings();requestGameFullscreen();
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
$('startBtn').onclick = () => { requestGameFullscreen(); startCareer(); };
$('quitBtn').onclick = toMenu;
$('raceCamBtn').onclick = cycleRaceCamera;
$('toMenu').onclick = toMenu;

function applyDamageVisual() {
  if (!player.mesh || !player.mesh.userData) return;
  const u=player.mesh.userData;
  (u.damageMarks||[]).forEach(x => { x.mesh.visible = !u.externalCarRoot && player.dmg >= x.threshold; });
  if(u.damageSmoke){u.damageSmoke.visible=player.dmg>=72;u.damageSmoke.material.opacity=player.dmg>=90?0.48:0.2;u.damageSmoke.scale.setScalar(player.dmg>=90?2.2:1.25);}
  if(u.damageBumper){u.damageBumper.rotation.x=player.dmg>=84?-0.32:player.dmg>=68?-0.13:0;u.damageBumper.position.y=player.dmg>=84?0.12:0.29;}
  if(u.damageChip){u.damageChip.rotation.z=player.dmg>=82?0.42:0.12;u.damageChip.position.x=player.dmg>=82?-u.S.w*0.34:-u.S.w*0.31;}
  document.body.classList.toggle('crash-dark', player.dmg>=80);
}
function setDamage(value) {
  const before=player.dmg; player.dmg=clamp(Number(value)||0,0,100);
  if(save.cars[save.cur]) save.cars[save.cur].dmg=player.dmg;
  phys=physFor(save.cur); applyDamageVisual();
  if(player.dmg>=100 && !player.immobilized){player.immobilized=true;player.speed=0;player.vx=0;player.vz=0;criticalRespawnAt=performance.now();criticalRespawnReady=false;toast('КРИТИЧЕСКАЯ ПОЛОМКА — эвакуатор будет доступен через 3 секунды');}
  if(player.dmg<100){criticalRespawnAt=0;criticalRespawnReady=false;}
  else if(player.dmg>=86 && before<86 && Math.random()<0.65){player.engineStall=rr(1.4,3.4);player.speed*=0.18;toast('Двигатель заглох от сильного удара!');}
}
function addDmg(v) { const amt=Math.max(0,Number(v)||0); if(amt>=1.8&&window.TRModels&&typeof window.TRModels.dentCar==='function')window.TRModels.dentCar(player.mesh,amt); setDamage(player.dmg + amt); if(amt>=1.6) spawnCrashDebris(amt); }
const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

function fixPlayer() {
  if ((state !== 'race' && state !== 'world') || fixCool > 0) return;
  if(player.immobilized && state==='race' && performance.now()-criticalRespawnAt<3000){toast('Эвакуатор появится через '+Math.max(1,Math.ceil((3000-(performance.now()-criticalRespawnAt))/1000))+' с.');return;}
  fixCool = 1.5;
  if(player.immobilized){setDamage(Math.max(0,player.dmg-32));player.immobilized=false;criticalRespawnAt=0;criticalRespawnReady=false;player.engineStall=0;toast('Эвакуатор: двигатель запущен, но машина повреждена');} const m = player.mesh.position, [bi] = nearest(m, player.idx), s = sampleAt(bi + 2, 0);
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
  player.h -= player.steerS * P.hnd * (player.mesh.userData.trWheelLost ? 0.56 : 1) * (player.air ? 0.34 : 1) * 1.25 * clamp(sp / 18, 0, 1) / (1 + sp / 55) * dt * (player.speed >= 0 ? 1 : -1);

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
      // A solid guardrail removes outward velocity; it does not launch the car backwards.
      // Remaining tangential velocity lets the body scrape and slide along the rail.
      player.vx -= vn * wt.z;
      player.vz += vn * wt.x;
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
  ud.wheels.forEach(w => w.rotation.x += player.speed * dt / 0.4); (ud.externalWheels||[]).forEach(w => w.rotation.x += player.speed * dt / 0.4);
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
  const u = a.mesh.userData; u.wheels.forEach(w => w.rotation.x += a.speed * dt / 0.4); (u.externalWheels||[]).forEach(w => w.rotation.x += a.speed * dt / 0.4); u.flame.visible = (a.nOn > 0 || a.rampT > 0) && racing;
}

function updateRemotes(dt) {
  for (const r of Object.values(remotes)) {
    const k = 1 - Math.exp(-11.5 * dt);
    if (Math.hypot(r.tx - r.x, r.tz - r.z) > 100) { r.x = r.tx; r.z = r.tz; }
    r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.y += (r.ty - r.y) * k; r.h += angDiff(r.th, r.h) * Math.min(1, 1 - Math.exp(-9.5 * dt));
    r.mesh.position.set(r.x, r.y, r.z); r.mesh.rotation.y = r.h; r.mesh.userData.wheels.forEach(w => w.rotation.x += r.speed * dt / 0.4); (r.mesh.userData.externalWheels||[]).forEach(w => w.rotation.x += r.speed * dt / 0.4);
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
function carFootprintOverlap(a, b) {
  const pa=a.mesh.position,pb=b.mesh.position,ha=Number.isFinite(a.h)?a.h:(Number(a.mesh.rotation.y)||0),hb=Number.isFinite(b.h)?b.h:(Number(b.mesh.rotation.y)||0);
  const ua={x:Math.sin(ha),z:Math.cos(ha)}, va={x:Math.cos(ha),z:-Math.sin(ha)};
  const ub={x:Math.sin(hb),z:Math.cos(hb)}, vb={x:Math.cos(hb),z:-Math.sin(hb)};
  const Sa=a.mesh.userData.S||{},Sb=b.mesh.userData.S||{};
  const la=Math.max(1.35,(Number(a.mesh.userData.hitboxLength)||Number(Sa.l)||4.3)*0.48),wa=Math.max(0.72,(Number(a.mesh.userData.hitboxWidth)||Number(Sa.w)||2)*0.48);
  const lb=Math.max(1.35,(Number(b.mesh.userData.hitboxLength)||Number(Sb.l)||4.3)*0.48),wb=Math.max(0.72,(Number(b.mesh.userData.hitboxWidth)||Number(Sb.w)||2)*0.48);
  const dx=pb.x-pa.x,dz=pb.z-pa.z;
  const axes=[ua,va,ub,vb];let minOverlap=Infinity,nx=1,nz=0;
  for(const axis of axes){
    const distance=dx*axis.x+dz*axis.z;
    const ra=la*Math.abs(ua.x*axis.x+ua.z*axis.z)+wa*Math.abs(va.x*axis.x+va.z*axis.z);
    const rb=lb*Math.abs(ub.x*axis.x+ub.z*axis.z)+wb*Math.abs(vb.x*axis.x+vb.z*axis.z);
    const overlap=ra+rb-Math.abs(distance);if(overlap<=0)return null;
    if(overlap<minOverlap){minOverlap=overlap;const sign=distance>=0?1:-1;nx=-axis.x*sign;nz=-axis.z*sign;}
  }
  return {overlap:minOverlap,nx,nz};
}
function collide(dt) {
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  const pm = player.mesh.position;
  const playerRadius = 1.88;
  for (const a of [...ais, ...Object.values(remotes)]) {
    a.hitCooldown = Math.max(0, (a.hitCooldown || 0) - dt);
    const am = a.mesh.position;
    if (Math.abs(pm.y - am.y) >= 1.75) continue;
    // Rotated bounding boxes follow the actual vehicle length and width; nearby cars
    // no longer collide merely because their circular centre distances are small.
    const contact=carFootprintOverlap(player,a);if(!contact)continue;
    const {nx,nz}=contact;const overlap=contact.overlap;
    // Push both cars out of the shared volume. AI is driven by lane position, so also
    // update its lane offset; remote cars are corrected via their interpolation target.
    pm.x += nx * overlap * 0.53; pm.z += nz * overlap * 0.53;
    if (a.isAI) {
      const side = (nx * Math.cos(a.h || 0) - nz * Math.sin(a.h || 0)) >= 0 ? 1 : -1;
      a.lat = clamp(a.lat - side * overlap * 0.53, -ROAD_W + 2.1, ROAD_W - 2.1);
      a.mesh.position.x -= nx * overlap * 0.47; a.mesh.position.z -= nz * overlap * 0.47;
    } else if (a.isRemote) {
      a.tx = (Number.isFinite(a.tx) ? a.tx : am.x) - nx * overlap * 0.47;
      a.tz = (Number.isFinite(a.tz) ? a.tz : am.z) - nz * overlap * 0.47;
    }
    if (a.hitCooldown > 0) continue;
    const otherSpeed = Number.isFinite(a.speed) ? a.speed : 0;
    const playerVx = Number.isFinite(player.vx) ? player.vx : Math.sin(player.h) * player.speed;
    const playerVz = Number.isFinite(player.vz) ? player.vz : Math.cos(player.h) * player.speed;
    const otherVx = Number.isFinite(a.vx) ? a.vx : Math.sin(a.h || 0) * otherSpeed;
    const otherVz = Number.isFinite(a.vz) ? a.vz : Math.cos(a.h || 0) * otherSpeed;
    const relNormal = (playerVx - otherVx) * nx + (playerVz - otherVz) * nz;
    const impactSpeed = Math.abs(relNormal);
    // Cars should recoil a little, not pinball away. A glancing contact mostly changes
    // lateral velocity; a head-on contact loses more forward speed.
    const playerMass=Number(player.mesh.userData.mass)||1.0;
    const otherMass=Number(a.mesh.userData.mass)||1.0;
    const invA=1/playerMass,invB=1/otherMass;
    const impulse=clamp(impactSpeed*0.72,0,12)/(invA+invB||1);
    player.vx = playerVx + nx * impulse * invA;
    player.vz = playerVz + nz * impulse * invA;
    const nextOtherVx=otherVx-nx*impulse*invB,nextOtherVz=otherVz-nz*impulse*invB;
    if(a.isAI){a.vx=nextOtherVx;a.vz=nextOtherVz;a.speed=Math.hypot(a.vx,a.vz);}
    else if(a.isRemote){a.tx=(Number.isFinite(a.tx)?a.tx:am.x)+nx*overlap*0.35;a.tz=(Number.isFinite(a.tz)?a.tz:am.z)+nz*overlap*0.35;a.speed=Math.hypot(nextOtherVx,nextOtherVz);}
    if(Math.abs(relNormal)>0.2) player.speed *= impactSpeed>14?0.68:0.84;
    else player.speed *= 0.94;
    player.lat = clamp(player.lat + (nx * Math.cos(player.h) - nz * Math.sin(player.h)) * overlap * 0.16, -ROAD_W + 1.9, ROAD_W - 1.9);
    if (a.isRemote && cfg && cfg.mode === 'online') Net.send({ t: 'bump', target: a.id });
    if (performance.now() - bumpT > 300) { Snd.bump(); bumpT = performance.now(); }
    if (impactSpeed > 4.5) {
      addDmg(clamp((impactSpeed - 3) * 0.16, 0.5, 5.5));
      spawnSparks(pm.x, pm.y + 0.55, pm.z, clamp(Math.floor(impactSpeed * 0.24), 5, 16));
    }
    a.hitCooldown = 0.48; collisionCooldown = 0.28;
  }
}
function itemsUpdate(dt) {
  const m = player.mesh.position; let ry = 0;
  const coinV = cfg.mode === 'train' ? 0 : 25;
  for (const it of items) {
    if (it.type === 'ramp') {
      // Collision footprint follows the actual ramp mesh in world space. This is more
      // reliable than mixing track-index, lane-offset and world coordinates.
      const dx = m.x - it.x, dz = m.z - it.z;
      const forward = Math.sin(player.h) * dx + Math.cos(player.h) * dz;
      const side = Math.cos(player.h) * dx - Math.sin(player.h) * dz;
      const onRamp = Math.abs(forward) < 7.6 && Math.abs(side) < 4.7;
      if (!player.air && player.rampCooldown <= 0 && onRamp && Math.abs(player.speed) > 5) {
        player.air = true; player.vy = 8.6 + Math.min(6.2, Math.abs(player.speed) * 0.15);
        player.speed = Math.max(16, player.speed) * 1.16; player.rampT = 2.2; player.rampCooldown = 0.72;
        player.y = Math.max(player.y, 0.2); ry = 0.55; Snd.jump(); toast('Трамплин! Прыжок активирован');
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
      case 'cone': if (d2 < 4 && !player.air) { it.on = false; it.mesh.visible = false; player.speed *= 0.88; addDmg(1.2); Snd.bump(); toast('Небольшое препятствие'); } break;
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
  if(state==='race'&&player.immobilized){criticalRespawnReady=performance.now()-criticalRespawnAt>=3000;$('fixBtn').hidden=!criticalRespawnReady;$('fixBtn').textContent=criticalRespawnReady?'↻ Эвакуатор · R':'⏳ Эвакуатор: 3 с';}
  else{$('fixBtn').hidden=!(state==='race'&&stuckT>1);$('fixBtn').textContent='↺ Поправить (R)';} 
}

function updateRaceCameraLabel(){const labels=['Камера: 1-е лицо','Камера: с плеча','Камера: 3-е лицо'];const b=$('raceCamBtn');if(b)b.textContent=labels[raceCamMode];}
function cycleRaceCamera(){raceCamMode=(raceCamMode+1)%3;updateRaceCameraLabel();toast(['Камера от первого лица','Камера с плеча','Камера от третьего лица'][raceCamMode]);}
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
  let wanted, look, fov;
  if(state==='race'&&raceCamMode===0){
    // Dashboard-height cockpit view, aimed along the actual vehicle heading.
    wanted=new THREE.Vector3(m.x-Math.sin(camH)*0.18,0.92+player.y*0.45,m.z-Math.cos(camH)*0.18);
    look=new THREE.Vector3(wanted.x+Math.sin(camH)*24,wanted.y+Math.sin(camH)*24*0.012,wanted.z+Math.cos(camH)*24);fov=80+clamp(Math.abs(player.speed)/100,0,1)*7;
  }else if(state==='race'&&raceCamMode===1){
    const side=0.9;wanted=new THREE.Vector3(m.x-Math.sin(camH)*5.4+Math.cos(camH)*side,2.55+player.y*0.6,m.z-Math.cos(camH)*5.4-Math.sin(camH)*side);
    look=new THREE.Vector3(m.x+Math.sin(camH)*7,1.35+player.y*0.45,m.z+Math.cos(camH)*7);fov=72+clamp(Math.abs(player.speed)/90,0,1)*7;
  }else{
    wanted=new THREE.Vector3(m.x-Math.sin(camH)*9+(Math.random()-0.5)*sh*4,4.6+player.y*0.6+(Math.random()-0.5)*sh*4,m.z-Math.cos(camH)*9);
    look=new THREE.Vector3(m.x+Math.sin(camH)*6,1.4+player.y*0.5,m.z+Math.cos(camH)*6);fov=68+clamp(Math.abs(player.speed)/70,0,1)*14+(player.boosting?8:0);
  }
  const follow=raceCamMode===0?14:5.5;cam.position.lerp(wanted,Math.min(1,follow*dt));cam.lookAt(look);
  cam.fov+=(fov-cam.fov)*Math.min(1,5*dt);cam.updateProjectionMatrix();
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
  if (charMesh && state !== 'world') charMesh.rotation.y = tAcc * 0.4;
  if (inRace()) Snd.update({ speed01: clamp(Math.abs(player.speed) / 80, 0, 1), boost: player.boosting, slip: player.skid || 0, racing: true }); else if(state==='world' && worldDriving) Snd.update({speed01:clamp(Math.abs(player.speed)/80,0,1),boost:false,slip:0,racing:true}); else Snd.idle();
  Snd.ambTick(dt, true);
  const focus = state==='world' && !worldDriving && charMesh ? charMesh.position : player.mesh.position;
  sun.position.set(focus.x + 60, 100, focus.z + 40); sun.target.position.copy(focus);
  const aimYaw = state==='world' && !worldDriving ? worldYaw : player.h;
  spot.position.set(focus.x, 1.3, focus.z); spot.target.position.set(focus.x + Math.sin(aimYaw) * 25, 0, focus.z + Math.cos(aimYaw) * 25);
  updateCamera(dt);
  if(window.TRModels){
    if(typeof window.TRModels.setCamera==='function')window.TRModels.setCamera(cam);
    const firstRace=state==='race'&&raceCamMode===0;
    const firstWorld=state==='world'&&worldCamMode===0&&!worldInterior;
    const context=(state==='world'&&worldDriving)||state==='race'?'drive':state==='world'?'world':'race';
    window.TRModels.setFirstPerson(firstRace||firstWorld,context,player.mesh);
    if(typeof window.TRModels.setSteer==='function')window.TRModels.setSteer(state==='world'&&worldDriving?((held.has('right')?1:0)-(held.has('left')?1:0)):player.steerS||0);
    window.TRModels.update(dt);
  }
  if (starsG) starsG.position.copy(cam.position);
  updateRain(dt); updateWorldSnow(dt); updateImpactBursts(dt); updateCrashDebris(dt);
  // A car with a missing wheel scrapes its exposed rim against the road while moving.
  if(player.mesh&&player.mesh.userData.trWheelLost&&player.mesh.userData.trWheelLostPos&&Math.abs(player.speed)>3){
    player.mesh.userData.trWheelSparkClock=(player.mesh.userData.trWheelSparkClock||0)-dt;
    if(player.mesh.userData.trWheelSparkClock<=0){const wp=player.mesh.localToWorld(player.mesh.userData.trWheelLostPos.clone());spawnSparks(wp.x,Math.max(0.08,wp.y),wp.z,4);player.mesh.userData.trWheelSparkClock=0.24;}
  }
  const smoke=player.mesh&&player.mesh.userData&&player.mesh.userData.damageSmoke;if(smoke&&smoke.visible){smoke.material.opacity=(player.dmg>=90?0.38:0.18)+0.08*(0.5+0.5*Math.sin(tAcc*5));smoke.position.y+=Math.sin(tAcc*2)*0.0008;}
  renderer.render(scene, cam);
  if(state==='world'){renderWorldMinimap();if(!worldInterior)pollSharedWorldEdits();}
  if(photoRequested){photoRequested=false;savePhoto();}if(socialPublishRequested){socialPublishRequested=false;try{const caption=$('socialCaption')?.value||'Мой момент в Turbo Rivals',image=captureSocialPhoto();void publishSocialPost(caption,image);}catch(err){console.warn('social photo',err);toast('Не удалось сделать фото');}}
}


// ================= открытый мир: город, квартира, пешеходы, магазины и телефон =================
let worldG = null, apartmentG = null, worldPedestrians = [], worldTraffic = [], worldBuildings = [], worldInteractables = [];
let worldRegionId = 'tashkent', worldBuiltRegion = null, raceCamMode = 2, criticalRespawnAt = 0, criticalRespawnReady = false;
let worldInterior = false, worldDriving = false, worldYaw = 0, worldCamMode = 2, worldNear = null, worldCollisionTimer = 0, worldAnimT = 0, worldWeather = 'Ясно', worldTime = 'День';
let worldCarVisibleBeforeInterior = false;
let worldJumpRemaining = 0, worldJumpCooldown = 0, worldJumpWasHeld = false;
let worldFallState = { character: { vy: 0, grounded: true }, car: { vy: 0, grounded: true } };
let worldBounds = { minX: -526, maxX: 526, minZ: -414, maxZ: 414 }, worldGroundY = 0;
let cityWallRay = new THREE.Raycaster();
const devRaycaster = new THREE.Raycaster(), devPointer = new THREE.Vector2();
let worldRouteTarget = { x: 0, z: -190, name: 'Empire State Building' };
let worldMinimapLast = 0, worldMiniMapBaseCanvas = null, worldMiniMapWorldSpan = 1080, worldMiniMapCenterX = 0, worldMiniMapCenterZ = 0;
let devUnlocked = false, devPassword = '', devPickMode = false, devSelected = null, devDragState = null;
let worldGhostMode=false,worldFlyMode=false,worldEnteringCar=false,worldEnterCarTimer=0,worldMapSelectedPoint=null,radioStationIndex=0;
const WORLD_RADIO_LABELS=['Neon Highway','Vice Night','Sunset Drive'];
let devGlobalEdits = {}, devLocalEdits = {}, devGlobalRevision = 0, devLastPollAt = 0;
let worldCamOrbitYaw = 0, worldCamOrbitPitch = 0, worldLookDrag = null;
let pendingTutorialRegion='newyork',tutorialPermitStart=false;
const WORLD_RANGE = 650;
// Drag the scene to look around in the open world. Desktop uses right-drag; touchscreens use a one-finger drag on empty scene space.
const worldCanvas = $('c');
worldCanvas.addEventListener('contextmenu', e => { if (state === 'world') e.preventDefault(); });
worldCanvas.addEventListener('pointerdown', e => {
  if (state !== 'world' || !$('worldPhone').hidden || !$('worldShop').hidden) return;
  if (e.pointerType === 'mouse' && e.button !== 2) return;
  // Don't start a camera gesture if a top-level UI panel overlaps this pointer's screen point.
  const ui = document.elementFromPoint(e.clientX, e.clientY);
  if (ui && ui !== worldCanvas && ui.closest && ui.closest('#worldHud, #worldPhone, #worldShop, #touch, #touchEditPanel, #touchEditDone')) return;
  worldLookDrag = { id:e.pointerId, x:e.clientX, y:e.clientY, type:e.pointerType };
  try { worldCanvas.setPointerCapture(e.pointerId); } catch (_) {}
  // Prevent browser/WebView scrolling from stealing the gesture. Telegram vertical
  // swipes are disabled separately via WebApp.disableVerticalSwipes().
  e.preventDefault();
});
worldCanvas.addEventListener('pointermove', e => {
  if (!worldLookDrag || worldLookDrag.id !== e.pointerId || state !== 'world') return;
  const dx=e.clientX-worldLookDrag.x, dy=e.clientY-worldLookDrag.y; worldLookDrag.x=e.clientX; worldLookDrag.y=e.clientY;
  worldCamOrbitYaw -= dx*0.006; worldCamOrbitPitch=clamp(worldCamOrbitPitch-dy*0.004,-0.36,0.38); e.preventDefault();
});
['pointerup','pointercancel','lostpointercapture'].forEach(type => worldCanvas.addEventListener(type, e => { if(worldLookDrag&&worldLookDrag.id===e.pointerId)worldLookDrag=null; }));
const WORLD_NAMES = ['Артём','Саша','Мира','Даня','Ника','Рустам','Лейла','Тимур','Алиса','Марк','Илья','Зара','Амир','Ева','Матвей','Амина','Дамир','Лина','Рома','Самира','Эмир','Даша','Камиль','Яна','Тим','Адель','Ренат','Малика','Вадим','Алия','Женя','Марат'];
const WORLD_LINES = ['Классная машина!','Сегодня в городе настоящий движ.','На площади скоро стартует турнир.','Заедь в мастерскую — там хорошие детали.','Неплохой дрифт видел на южной улице!','Добро пожаловать в наш район.','У меня сегодня выходной — гуляю по городу.','Говорят, ночной заезд будет сложным.'];
function wmat(color, roughness=0.8, metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function wbox(parent,w,h,d,mat,x,y,z,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=opts.shadow!==false && ['high','veryhigh','ultra','rt'].includes(resolvedGfx());m.receiveShadow=true;parent.add(m);return m;}
function signTexture(title,sub,color='#102338'){
  return canvasTex(512,160,(ctx,w,h)=>{ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.fillStyle='#ffffff';ctx.fillRect(6,6,w-12,h-12);ctx.fillStyle=color;ctx.fillRect(12,12,w-24,h-24);ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.font='900 42px Arial';ctx.fillText(title,w/2,69);ctx.fillStyle='#81ecf4';ctx.font='700 20px Arial';ctx.fillText(sub,w/2,111);});
}
function makeWorldPedestrian(gender='boy', outfit=0, skin=0){
  // Стилизованный человек с читаемыми пропорциями, лицом и одеждой — не механический манекен.
  const g=new THREE.Group(), sk=wmat(SKINS[skin%SKINS.length],0.65), shirt=wmat(OUTFITS[outfit%OUTFITS.length],0.72), shirt2=wmat(OUTFITS[(outfit+2)%OUTFITS.length],0.75), pants=wmat(gender==='girl'?0x293d62:0x263044,0.86), shoe=wmat(0xd7dce2,0.62), sole=wmat(0x181c24,0.9), hair=wmat(gender==='girl'?0x4c2613:0x211a16,0.8), dark=wmat(0x111821,0.7), white=wmat(0xf9fafb,0.35), lip=wmat(0x8e4f47,0.85);
  const sph=(r,ws=12,hs=8)=>new THREE.SphereGeometry(r,ws,hs), cyl=(r1,r2,h)=>new THREE.CylinderGeometry(r1,r2,h,10);
  const torso=new THREE.Mesh(cyl(0.24,0.19,0.52),shirt);torso.position.y=1.12;torso.castShadow=true;g.add(torso);
  const shoulders=new THREE.Mesh(new THREE.SphereGeometry(0.255,12,8),shirt);shoulders.position.set(0,1.29,0);shoulders.scale.set(1,0.48,0.72);g.add(shoulders);
  const collar=new THREE.Mesh(new THREE.TorusGeometry(0.09,0.025,6,12),shirt2);collar.rotation.x=Math.PI/2;collar.position.set(0,1.39,0.015);g.add(collar);
  const vest=new THREE.Mesh(new THREE.BoxGeometry(0.27,0.30,0.035),shirt2);vest.position.set(0,1.14,0.13);g.add(vest);
  const zipper=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.25,0.012),white);zipper.position.set(0,1.15,0.154);g.add(zipper);
  const pocket1=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.075,0.018),shirt);pocket1.position.set(-0.105,1.17,0.16);g.add(pocket1);
  const pocket2=pocket1.clone();pocket2.position.x=0.105;g.add(pocket2);
  const belt=new THREE.Mesh(new THREE.BoxGeometry(0.37,0.065,0.25),dark);belt.position.y=0.84;g.add(belt);
  const buckle=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.045,0.02),wmat(0xc3a66b,0.4,0.65));buckle.position.set(0,0.84,0.14);g.add(buckle);
  const neck=new THREE.Mesh(cyl(0.075,0.08,0.16),sk);neck.position.y=1.43;g.add(neck);
  const head=new THREE.Mesh(sph(0.18,16,12),sk);head.position.y=1.68;head.castShadow=true;g.add(head);
  const haircap=new THREE.Mesh(sph(0.185,14,9),hair);haircap.position.set(0,1.75,-0.02);haircap.scale.set(1,0.65,1);g.add(haircap);
  // Чёлка и виски дают голове естественный силуэт, особенно при камере от первого лица NPC.
  const fringe=new THREE.Mesh(new THREE.SphereGeometry(0.105,10,7),hair);fringe.position.set(0,1.735,0.12);fringe.scale.set(1.25,0.36,0.58);g.add(fringe);
  for(const side of [-1,1]){const sideHair=new THREE.Mesh(sph(0.045,8,6),hair);sideHair.position.set(side*0.145,1.68,-0.015);g.add(sideHair);}
  if(gender==='girl'){const pony=new THREE.Mesh(sph(0.08,10,7),hair);pony.position.set(0.13,1.65,-0.12);g.add(pony);const bun=new THREE.Mesh(sph(0.06,8,6),hair);bun.position.set(0.08,1.82,-0.1);g.add(bun);}
  for(const side of [-1,1]){const eye=new THREE.Mesh(sph(0.022,8,6),white);eye.position.set(side*0.064,1.69,0.158);g.add(eye);const pupil=new THREE.Mesh(sph(0.011,6,5),dark);pupil.position.set(side*0.064,1.69,0.178);g.add(pupil);const brow=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.012,0.018),hair);brow.position.set(side*0.064,1.724,0.155);g.add(brow);const ear=new THREE.Mesh(sph(0.035,8,6),sk);ear.position.set(side*0.177,1.67,0);g.add(ear);}
  const nose=new THREE.Mesh(new THREE.ConeGeometry(0.027,0.065,8),sk);nose.rotation.x=Math.PI/2;nose.position.set(0,1.655,0.181);g.add(nose);
  const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.012,0.016),lip);mouth.position.set(0,1.615,0.168);g.add(mouth);
  const armG=[],legG=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*0.25,1.32,0);g.add(arm);const upper=new THREE.Mesh(cyl(0.085,0.11,0.42),shirt);upper.position.y=-0.22;arm.add(upper);const sleeve=new THREE.Mesh(cyl(0.09,0.08,0.13),shirt2);sleeve.position.y=-0.08;arm.add(sleeve);const hand=new THREE.Mesh(sph(0.075,8,6),sk);hand.position.y=-0.48;arm.add(hand);armG.push(arm);
    const leg=new THREE.Group();leg.position.set(side*0.12,0.79,0);g.add(leg);
    const thigh=new THREE.Mesh(cyl(0.105,0.12,0.4),pants);thigh.position.y=-0.2;leg.add(thigh);
    const knee=new THREE.Mesh(sph(0.086,9,7),pants);knee.position.y=-0.405;leg.add(knee);
    const calf=new THREE.Mesh(cyl(0.074,0.09,0.38),pants);calf.position.y=-0.59;leg.add(calf);
    const sock=new THREE.Mesh(cyl(0.076,0.074,0.1),white);sock.position.y=-0.72;leg.add(sock);
    const foot=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.12,0.29),shoe);foot.position.set(0,-0.70,0.065);leg.add(foot);
    const outsole=new THREE.Mesh(new THREE.BoxGeometry(0.175,0.035,0.3),sole);outsole.position.set(0,-0.775,0.065);leg.add(outsole);legG.push(leg);
  }
  const phone=new THREE.Mesh(new THREE.BoxGeometry(0.085,0.13,0.018),dark);phone.position.set(-0.28,1.04,0.06);phone.rotation.z=0.15;g.add(phone);
  const bodyGroup=mergePedestrianStaticMeshes(g);
  g.userData={arms:armG,legs:legG,bodyGroup,phase:Math.random()*Math.PI*2,walk:0,wave:0,jump:0,gender,outfit,skin,phone,playerPed:false};
  if(window.TRModels)window.TRModels.registerWorldCharacter(g);
  return g;
}
function mergePedestrianStaticMeshes(root){
  const statics=root.children.filter(o=>o.isMesh);
  if(!statics.length)return null;
  const groups=new Map();
  for(const mesh of statics){
    mesh.updateMatrix();
    const geometry=mesh.geometry.clone();geometry.applyMatrix4(mesh.matrix);
    const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    let rec=groups.get(material);
    if(!rec){rec={material,positions:[],normals:[],uvs:[],indices:[],vertexCount:0,castShadow:false,receiveShadow:false};groups.set(material,rec);}
    const pos=geometry.getAttribute('position'),norm=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv'),idx=geometry.index;
    const count=pos.count,base=rec.vertexCount;
    for(let i=0;i<count;i++){
      rec.positions.push(pos.getX(i),pos.getY(i),pos.getZ(i));
      if(norm)rec.normals.push(norm.getX(i),norm.getY(i),norm.getZ(i));
      else rec.normals.push(0,1,0);
      if(uv)rec.uvs.push(uv.getX(i),uv.getY(i));else rec.uvs.push(0,0);
    }
    if(idx){for(let i=0;i<idx.count;i++)rec.indices.push(idx.getX(i)+base);}
    else{for(let i=0;i<count;i++)rec.indices.push(base+i);}
    rec.vertexCount+=count;rec.castShadow=rec.castShadow||mesh.castShadow;rec.receiveShadow=rec.receiveShadow||mesh.receiveShadow;
    geometry.dispose();mesh.geometry.dispose();root.remove(mesh);
  }
  const body=new THREE.Group();body.name='pedestrianBody';
  for(const rec of groups.values()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(rec.positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(rec.normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(rec.uvs,2));
    geometry.setIndex(rec.vertexCount>65535?new THREE.Uint32BufferAttribute(rec.indices,1):new THREE.Uint16BufferAttribute(rec.indices,1));
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,rec.material);mesh.castShadow=rec.castShadow;mesh.receiveShadow=true;body.add(mesh);
  }
  root.add(body);return body;
}
function addTrafficSignal(parent,x,z,rotation=0){
  const group=new THREE.Group();group.name='TR Custom Traffic Signal';group.position.set(x,0,z);group.rotation.y=rotation;group.userData.trKeepInImportedCity=true;group.userData.trCustomAddon=true;
  const poleMat=wmat(0x343c44,0.52,0.55),housingMat=wmat(0x161d24,0.35,0.35),redMat=new THREE.MeshStandardMaterial({color:0xff342c,emissive:0x8b0803,emissiveIntensity:0.75}),yellowMat=new THREE.MeshStandardMaterial({color:0xffc744,emissive:0x886010,emissiveIntensity:0.65}),greenMat=new THREE.MeshStandardMaterial({color:0x42e888,emissive:0x0a6c31,emissiveIntensity:0.65});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.09,4.2,8),poleMat);pole.position.y=2.1;pole.castShadow=false;group.add(pole);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(1.25,0.09,0.09),poleMat);arm.position.set(0.5,4.05,0);group.add(arm);
  const housing=new THREE.Mesh(new THREE.BoxGeometry(0.48,1.23,0.32),housingMat);housing.position.set(0.86,3.35,0);housing.castShadow=false;group.add(housing);
  [redMat,yellowMat,greenMat].forEach((mat,i)=>{const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.125,10,8),mat);lamp.position.set(0.86,3.76-i*0.41,0.176);lamp.castShadow=false;group.add(lamp);});
  parent.add(group);
  if(window.TRModels&&window.TRModels.registerCityCollision)group.children.forEach(o=>{if(o.isMesh)window.TRModels.registerCityCollision(o);});
  return group;
}
function addWorldTree(parent,x,z,scale=1){
  const trunk=wmat(0x55402d),leaf=wmat(0x2d7045,0.9),lod=new THREE.LOD();
  const detailed=new THREE.Group(),low=new THREE.Group();
  const t=new THREE.Mesh(new THREE.CylinderGeometry(0.28*scale,0.4*scale,3.8*scale,9),trunk);t.position.y=1.9*scale;detailed.add(t);
  for(let i=0;i<3;i++){const c=new THREE.Mesh(new THREE.ConeGeometry((2.2-i*0.3)*scale,2.8*scale,9),leaf);c.position.y=(3.7+i*1.3)*scale;c.castShadow=true;detailed.add(c);}
  const trunkLow=new THREE.Mesh(new THREE.CylinderGeometry(0.34*scale,0.42*scale,3.4*scale,6),trunk);trunkLow.position.y=1.7*scale;low.add(trunkLow);
  const crown=new THREE.Mesh(new THREE.SphereGeometry(2.2*scale,7,5),leaf);crown.position.y=4.3*scale;low.add(crown);
  lod.addLevel(detailed,0);lod.addLevel(low,70);lod.position.set(x,0,z);lod.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});parent.add(lod);return lod;
}
function addBeamBetween(parent, a, b, radius, material, radial=8) {
  const start=new THREE.Vector3(a.x,a.y,a.z), end=new THREE.Vector3(b.x,b.y,b.z), dir=end.clone().sub(start);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*0.82,radius,dir.length(),radial),material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  mesh.castShadow=true; parent.add(mesh); return mesh;
}
function addWorldPalm(parent,x,z,scale=1){
  const g=new THREE.Group(), bark=wmat(0x876648,0.9), leafMats=[wmat(0x27724c,0.92),wmat(0x37855a,0.9),wmat(0x579760,0.9)];
  const base={x:0,y:0,z:0}, top={x:0.22*scale,y:6.0*scale,z:0.08*scale};
  addBeamBetween(g,base,top,0.26*scale,bark,9);
  const crown=new THREE.Vector3(top.x,top.y,top.z);
  for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9+0.15, len=(3.0+0.4*Math.sin(i*2.1))*scale;
    const end={x:crown.x+Math.cos(a)*len,y:crown.y-0.8*scale+Math.sin(i*1.7)*0.3*scale,z:crown.z+Math.sin(a)*len};
    addBeamBetween(g,{x:crown.x,y:crown.y,z:crown.z},end,0.055*scale,leafMats[i%leafMats.length],6);
    const dir=new THREE.Vector3(end.x-crown.x,end.y-crown.y,end.z-crown.z);
    const frond=new THREE.Mesh(new THREE.ConeGeometry(0.36*scale,len*0.54,7),leafMats[(i+1)%leafMats.length]);
    frond.position.set(crown.x+dir.x*0.62,crown.y+dir.y*0.62,crown.z+dir.z*0.62);frond.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());frond.rotation.z+=0.4;g.add(frond);
  }
  g.position.set(x,0,z);parent.add(g);return g;
}
function addLandmarkSign(parent,text,x,y,z,width,height,bg,fg){
  const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle='#'+bg.toString(16).padStart(6,'0');ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#ffffff';ctx.globalAlpha=0.75;ctx.lineWidth=10;ctx.strokeRect(8,8,c.width-16,c.height-16);ctx.globalAlpha=1;
  ctx.fillStyle='#'+fg.toString(16).padStart(6,'0');ctx.font='900 116px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,c.width/2,c.height/2,950);
  const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;const mat=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);sign.position.set(x,y,z);parent.add(sign);return sign;
}
function addDomeComplex(parent,x,z,scale=1){
  const g=new THREE.Group(),stucco=wmat(0xd6c39c,0.88),tile=wmat(0x287e9e,0.5,0.35),dark=wmat(0x594c3d,0.85),gold=wmat(0xd2a342,0.32,0.65),glass=wmat(0x9ce4e8,0.3,0.25);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(11*scale,12*scale,7*scale,20),stucco);body.position.y=3.5*scale;body.castShadow=true;g.add(body);
  const roof=new THREE.Mesh(new THREE.SphereGeometry(8.5*scale,24,14,0,Math.PI*2,0,Math.PI/2),tile);roof.position.y=7*scale;g.add(roof);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(8.25*scale,0.22*scale,8,32),gold);ring.rotation.x=Math.PI/2;ring.position.y=7.25*scale;g.add(ring);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const win=new THREE.Mesh(new THREE.BoxGeometry(1.0*scale,2.1*scale,0.18*scale),glass);win.position.set(Math.sin(a)*11.85*scale,3.6*scale,Math.cos(a)*11.85*scale);win.rotation.y=a;g.add(win);}
  for(const side of [-1,1]){const mx=side*15*scale;const tower=new THREE.Mesh(new THREE.CylinderGeometry(1.65*scale,2.0*scale,17*scale,12),stucco);tower.position.set(mx,8.5*scale,1*scale);g.add(tower);const cap=new THREE.Mesh(new THREE.ConeGeometry(2.3*scale,4*scale,12),tile);cap.position.set(mx,19*scale,1*scale);g.add(cap);const fin=new THREE.Mesh(new THREE.SphereGeometry(0.45*scale,8,6),gold);fin.position.set(mx,21*scale,1*scale);g.add(fin);}
  const doorway=new THREE.Mesh(new THREE.BoxGeometry(3.2*scale,4.1*scale,0.3*scale),dark);doorway.position.set(0,2.05*scale,12.0*scale);g.add(doorway);
  g.position.set(x,0,z);parent.add(g);return g;
}
function addEiffelLandmark(parent,x,z){
  const g=new THREE.Group(),iron=wmat(0x504b42,0.52,0.7),gold=wmat(0xd8b475,0.42,0.7);const h=88,half=23;
  const base=[[-half,-half],[half,-half],[half,half],[-half,half]];
  base.forEach(([bx,bz])=>addBeamBetween(g,{x:bx,y:0,z:bz},{x:bx*0.18,y:h,z:bz*0.18},0.9,iron,9));
  for(const y of [18,36,55,74]){const f=1-y/h;for(const [bx,bz] of base){const a={x:bx*(1-(y-3)/h),y:y-3,z:bz*(1-(y-3)/h)},b={x:bx*f,y:y,z:bz*f};addBeamBetween(g,a,b,0.26,iron,6);}const ring=new THREE.Mesh(new THREE.BoxGeometry(half*2*f*1.8,1.1,half*2*f*1.8),iron);ring.position.y=y;g.add(ring);}
  for(let level=5;level<74;level+=7){const f=1-level/h;for(let side=0;side<4;side++){const next=(side+1)%4,[ax,az]=base[side],[bx,bz]=base[next];addBeamBetween(g,{x:ax*f,y:level,z:az*f},{x:bx*f,y:level,z:bz*f},0.18,iron,5);}}
  const top=new THREE.Mesh(new THREE.ConeGeometry(1.35,11,8),iron);top.position.y=h+5.5;g.add(top);
  const platform=new THREE.Mesh(new THREE.BoxGeometry(42,1.4,42),gold);platform.position.y=0.7;g.add(platform);
  g.position.set(x,0,z);parent.add(g);addLandmarkSign(parent,'TOUR EIFFEL',x,10,z+30,48,4,0x23354b,0xf7deab);return g;
}
function addColosseumLandmark(parent,x,z){
  const g=new THREE.Group(),stone=wmat(0xc5a27c,0.96),stone2=wmat(0x9f805f,0.98),inside=wmat(0x584c41,0.95);
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(1,1,18,64,1,true),stone);shell.scale.set(27,1,18);shell.position.y=9;g.add(shell);
  const topRing=new THREE.Mesh(new THREE.TorusGeometry(1,1.0,8,64),stone2);topRing.rotation.x=Math.PI/2;topRing.scale.set(27,1,18);topRing.position.y=18;g.add(topRing);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(1,1,5,48,1,true),inside);inner.scale.set(19,1,11);inner.position.y=2.5;g.add(inner);
  for(let row=0;row<3;row++)for(let i=0;i<48;i++){const a=i*Math.PI*2/48,rx=25-row*2.4,rz=16-row*1.6,xx=Math.sin(a)*rx,zz=Math.cos(a)*rz,y=2+row*5.0;const col=new THREE.Mesh(new THREE.BoxGeometry(0.72,4.3,0.75),row===1?stone2:stone);col.position.set(xx,y,zz);col.rotation.y=a;g.add(col);if(i%2===0){const arch=new THREE.Mesh(new THREE.TorusGeometry(0.88,0.15,6,12,Math.PI),stone2);arch.position.set(xx,y+1.15,zz);arch.rotation.set(Math.PI/2,0,a);arch.scale.set(1,1.35,1);g.add(arch);}}
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(1,1,0.5,48),wmat(0x9a835f));floor.scale.set(19,1,11);floor.position.y=0.05;g.add(floor);g.position.set(x,0,z);parent.add(g);addLandmarkSign(parent,'ROMA ANTICA',x,23,z+24,36,3.3,0x4c3429,0xf1d4a4);return g;
}
function addHollywoodLandmark(parent,x,z){
  const hillMat=wmat(0x8a8c64,1),hill2=wmat(0x6f7a53,1),g=new THREE.Group();
  for(let i=0;i<8;i++){const hill=new THREE.Mesh(new THREE.ConeGeometry(38+Math.random()*20,48+Math.random()*28,8),i%2?hillMat:hill2);hill.position.set((i-3.5)*47,10,-80-Math.random()*50);g.add(hill);}
  parent.add(g);g.position.set(x,0,z);
  addLandmarkSign(parent,'HOLLYWOOD',x,47,z+8,80,9,0xeee7cf,0x28313c);
  // Roadside palms make the Southern California silhouette distinct.
  for(let i=0;i<9;i++)addWorldPalm(parent,x-110+i*27,z+42+(i%2)*10,0.75+Math.random()*0.22);
}
function addMiamiOcean(parent,x,z){
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(300,1450),new THREE.MeshStandardMaterial({color:0x278cb4,roughness:0.25,metalness:0.18,transparent:true,opacity:0.93}));ocean.rotation.x=-Math.PI/2;ocean.position.set(x,-0.08,z);parent.add(ocean);
  const sand=new THREE.Mesh(new THREE.PlaneGeometry(62,1450),wmat(0xe4cb9b,0.9));sand.rotation.x=-Math.PI/2;sand.position.set(x-182,-0.06,z);parent.add(sand);
  for(let i=-6;i<=6;i++)addWorldPalm(parent,x-160+(i%3)*8,z+i*82,0.8+Math.random()*0.18);
  addLandmarkSign(parent,'OCEAN DRIVE',x-150,7,z-28,35,3.5,0x1f8ca4,0xffded3);
}
function addRegionLandmarks(parent, cfg){
  const p=cfg.landmarkAt;
  if(cfg.landmark==='bazaar'){
    addDomeComplex(parent,p.x,p.z,1.0);addLandmarkSign(parent,'CHOR-SU BAZAAR',p.x,25,p.z+20,32,3.2,0x1b5362,0xe8d69e);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;const stall=new THREE.Group();const mat=wmat([0xb83e2f,0x287a91,0xc29b43,0x41805b][i%4],0.7,0.15);const roof=new THREE.Mesh(new THREE.ConeGeometry(3.2,2.2,4),mat);roof.position.y=4.6;roof.rotation.y=Math.PI/4;stall.add(roof);const base=new THREE.Mesh(new THREE.BoxGeometry(4.5,2.2,3.5),wmat(0xd7b68a,0.9));base.position.y=1.1;stall.add(base);stall.position.set(p.x+Math.cos(a)*27,0,p.z+Math.sin(a)*27);parent.add(stall);}
  } else if(cfg.landmark==='empire') addNewYorkLandmark(parent,p.x,p.z);
  else if(cfg.landmark==='eiffel') addEiffelLandmark(parent,p.x,p.z);
  else if(cfg.landmark==='colosseum') addColosseumLandmark(parent,p.x,p.z);
  else if(cfg.landmark==='hollywood') addHollywoodLandmark(parent,p.x,p.z);
  else if(cfg.landmark==='ocean') addMiamiOcean(parent,p.x,p.z);
  if(cfg.style==='haussmann'){
    for(let i=0;i<6;i++){const b=new THREE.Group(),c=wmat(0xd5c6af,0.86),roof=wmat(0x525563,0.65,0.25);wbox(b,24,24,16,c,0,12,0);wbox(b,25,1.1,17,roof,0,24.5,0);wbox(b,25,0.65,17,wmat(0xc0ad95),0,7,0);for(let f=1;f<5;f++)for(let j=-2;j<=2;j++){wbox(b,2.5,2.3,0.15,wmat(0x5f7888,0.3),j*4.1,3+f*4,8.1);}b.position.set(160+(i%3)*31,0,-210+Math.floor(i/3)*27);parent.add(b);}
    // Seine: a reflective ribbon through the Paris district.
    const river=new THREE.Mesh(new THREE.PlaneGeometry(120,950),new THREE.MeshStandardMaterial({color:0x3d88ac,roughness:0.23,metalness:0.18}));river.rotation.x=-Math.PI/2;river.position.set(455,-0.09,0);parent.add(river);
    const bridge=wmat(0x6b7077,0.65,0.35),rail=wmat(0x3b414a,0.46,0.6);
    for(let z=-600;z<=600;z+=100){wbox(parent,122,0.32,20,bridge,455,0.06,z,{shadow:false});for(const side of [-1,1]){wbox(parent,122,0.72,0.22,rail,455,0.52,z+side*9.2,{shadow:false});for(let i=0;i<16;i++)wbox(parent,0.12,0.56,0.12,rail,397+i*7.7,0.45,z+side*9.2,{shadow:false});}}
  } else if(cfg.style==='art-deco'){
    // Art-deco stepped hotel with pastel bands and a rooftop crown.
    const hotel=new THREE.Group(),pink=wmat(0xf0b6a7,0.7),cream=wmat(0xf2d7b9,0.76),teal=wmat(0x68c6c6,0.45,0.2);
    wbox(hotel,32,22,20,pink,0,11,0);wbox(hotel,28,4,18,cream,0,22,0);wbox(hotel,21,5,15,pink,0,26.5,0);wbox(hotel,16,2,12,teal,0,30,0);
    for(let f=0;f<5;f++){wbox(hotel,33,0.35,20,cream,0,3+f*4,0);for(let k=-3;k<=3;k++)wbox(hotel,2.1,2,0.12,teal,k*4.1,4+f*4,10.1);}
    hotel.position.set(300,0,-180);parent.add(hotel);addLandmarkSign(parent,'MIAMI BEACH',300,32,-168,28,3,0x117c8b,0xffe3c5);
  } else if(cfg.style==='california'){
    const freeway=wmat(0x55595e,0.85),pillar=wmat(0x8d8f8d,0.9);
    wbox(parent,36,0.7,450,freeway,410,7,60);for(const z0 of [-120,30,180])wbox(parent,1.4,7,1.4,pillar,395,3.5,z0);for(let i=0;i<16;i++)addWorldPalm(parent,330+i*10,250+(i%2)*7,0.7+Math.random()*0.15);
  }
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
// ---- Отлетающие детали при ударе ----
const crashDebris=[];const debrisGeoCache={};
function removeDebris(d){
  scene.remove(d.mesh);
  // Source GLB parts share their geometry/material with the vehicle catalogue. Do not
  // dispose those shared resources while a detached panel is flying away.
  if(!d.actualPart){
    if(d.mesh.material)d.mesh.material.dispose();
    if(d.mesh.geometry)d.mesh.geometry.dispose();
  }
}
function makeGlassShard(color=0x98e5ff){
  const w=rr(0.09,0.24),h=rr(0.10,0.30),lean=rr(-0.08,0.08);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-w,0,lean,w*0.7,-h,0,w*0.1,h,lean],3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({color,roughness:0.12,metalness:0.08,transparent:true,opacity:0.83,side:THREE.DoubleSide});
  return new THREE.Mesh(geometry,material);
}
function spawnCrashDebris(amount){
  if(!player.mesh||!player.mesh.visible||amount<3.7)return;
  const S=player.mesh.userData.S||{},sw=S.w||2,sl=S.l||4.4,fx=Math.sin(player.h),fz=Math.cos(player.h),p=player.mesh.position;
  const pushPart=(part,glass=false,wheel=false)=>{
    const mesh=part;mesh.updateMatrixWorld(true);
    const wp=new THREE.Vector3();mesh.getWorldPosition(wp);
    // Detach the actual named GLB piece; this preserves its model geometry and shape.
    scene.attach(mesh);mesh.userData.trDetachedPart=true;
    const side=rr(-1,1),speed=2+Math.min(13,amount*1.0)+Math.random()*3;
    const vel=new THREE.Vector3(-fx*speed+fz*side*speed*0.5+(player.vx||0)*0.48,2.5+Math.random()*4+amount*0.28,-fz*speed-fx*side*speed*0.5+(player.vz||0)*0.48);
    const spin=new THREE.Vector3(rr(-7,7),rr(-10,10),rr(-7,7));
    crashDebris.push({mesh,vel,spin,life:0,ttl:5+Math.random()*2,actualPart:true});
    spawnSparks(wp.x,wp.y,wp.z,wheel?12:glass?4:9);
    return wp;
  };
  let detached=[];
  if(window.TRModels&&typeof window.TRModels.detachCrashParts==='function'){
    try{detached=window.TRModels.detachCrashParts(player.mesh,amount)||[];}catch(err){console.warn('[Turbo Rivals] Не удалось отделить деталь машины:',err);}
  }
  let brokeGlass=false;
  for(const item of detached){const wp=pushPart(item.part,item.glass,item.wheel);if(item.glass)brokeGlass=true;if(item.wheel){player.mesh.userData.trWheelLost=true;player.mesh.userData.trWheelLostPos=player.mesh.worldToLocal(wp.clone());}}
  // Glass breaks into small triangular shards, not placeholder rectangular blocks.
  if(amount>=5.1&&(brokeGlass||Math.random()<Math.min(0.72,0.18+amount*0.055))){
    const count=clamp(Math.round(amount*0.55),3,7);
    for(let i=0;i<count;i++){
      const shard=makeGlassShard(i%3===0?0xeffcff:0x72bbd9);
      shard.position.set(p.x+fx*sl*0.35+rr(-sw*0.42,sw*0.42),0.65+Math.random()*1.05,p.z+fz*sl*0.35+rr(-0.3,0.3));
      const vel=new THREE.Vector3(-fx*rr(1.5,6)+rr(-2,2)+(player.vx||0)*0.22,rr(2,6),-fz*rr(1.5,6)+rr(-2,2)+(player.vz||0)*0.22);
      crashDebris.push({mesh:shard,vel,spin:new THREE.Vector3(rr(-12,12),rr(-12,12),rr(-12,12)),life:0,ttl:2.6+Math.random()*1.8,actualPart:false});scene.add(shard);
    }
  }
  // No generic cubes are spawned: visible flying parts are imported car components or shards.
  while(crashDebris.length>48)removeDebris(crashDebris.shift());
}
function updateCrashDebris(dt){
  for(let i=crashDebris.length-1;i>=0;i--){
    const d=crashDebris[i];d.life+=dt;d.vel.y-=18*dt;d.mesh.position.addScaledVector(d.vel,dt);
    d.mesh.rotation.x+=d.spin.x*dt;d.mesh.rotation.y+=d.spin.y*dt;d.mesh.rotation.z+=d.spin.z*dt;
    if(d.mesh.position.y<0.08){d.mesh.position.y=0.08;d.vel.y*=-0.22;d.vel.x*=0.78;d.vel.z*=0.78;d.spin.multiplyScalar(0.55);if(Math.abs(d.vel.y)<0.6)d.vel.y=0;}
    if(d.life>d.ttl-0.6){const base=1;d.mesh.scale.multiplyScalar(Math.max(0.1,1-dt*3));}
    if(d.life>=d.ttl){removeDebris(d);crashDebris.splice(i,1);}
  }
}
// ---- Фото: клавиша F в гонке и открытом мире ----
let photoRequested=false,socialPublishRequested=false;
function captureSocialPhoto(){
  const src=renderer.domElement,cv=document.createElement('canvas');cv.width=640;cv.height=360;const c=cv.getContext('2d');if(!c)throw new Error('Canvas недоступен');c.drawImage(src,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',0.66);
}
function publishWorldPhoto(){socialPublishRequested=true;toast('Снимок делается…');}
function escapeHTML(value){return String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function readSocialPosts(){try{const v=JSON.parse(localStorage.getItem('tr_world_social_v1')||'[]');return Array.isArray(v)?v:[];}catch(_){return[];}}
function writeSocialPosts(posts){try{localStorage.setItem('tr_world_social_v1',JSON.stringify(posts.slice(0,8)));return true;}catch(_){toast('Недостаточно памяти для сохранения публикации');return false;}}
let socialFeedPosts=null,socialFeedLoading=false;
function currentSocialPosts(){return Array.isArray(socialFeedPosts)?socialFeedPosts:readSocialPosts();}
function storeSocialFeed(posts){socialFeedPosts=Array.isArray(posts)?posts.slice(0,12):[];try{localStorage.setItem('tr_world_social_v1',JSON.stringify(socialFeedPosts.slice(0,8)));}catch(_){} }
async function refreshSocialFeed(){if(socialFeedLoading)return;const base=getWorldApiBase();if(!base){socialFeedPosts=null;return;}socialFeedLoading=true;try{const r=await fetch(base+'/api/social-posts',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();if(!data||!Array.isArray(data.posts))throw new Error('bad social feed');storeSocialFeed(data.posts);if(!$('worldPhone').hidden&&$('worldPhoneContent').innerHTML.includes('data-social-publish'))renderSocialFeed();}catch(e){console.warn('Shared social feed unavailable; using local cache',e);socialFeedPosts=null;}finally{socialFeedLoading=false;}}
async function postSocialAction(path,payload){const base=getWorldApiBase();if(!base)throw new Error('Сервер недоступен');const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('HTTP '+r.status));if(Array.isArray(data.posts))storeSocialFeed(data.posts);return data;}
async function publishSocialPost(caption,image){const post={id:Date.now(),author:String(save.name||'Гонщик').slice(0,18),caption:String(caption||'Мой момент в Turbo Rivals').slice(0,180),image,likes:0,comments:[]};try{await postSocialAction('/api/social-posts',post);toast('Фото опубликовано для всех игроков');}catch(e){const posts=readSocialPosts();posts.unshift(post);writeSocialPosts(posts);socialFeedPosts=null;toast('Опубликовано локально: серверная лента недоступна');console.warn('Social publish fallback',e);}renderSocialFeed();}
async function likeSocialPost(id){try{await postSocialAction('/api/social-posts/like',{id});}catch(e){const posts=readSocialPosts(),post=posts.find(p=>Number(p.id)===Number(id));if(post){post.likes=(Number(post.likes)||0)+1;writeSocialPosts(posts);socialFeedPosts=null;toast('Лайк сохранён только на этом устройстве');}}renderSocialFeed();}
async function commentSocialPost(id,text){text=String(text||'').trim().slice(0,120);if(!text)return;try{await postSocialAction('/api/social-posts/comment',{id,text,author:String(save.name||'Гонщик').slice(0,18)});}catch(e){const posts=readSocialPosts(),post=posts.find(p=>Number(p.id)===Number(id));if(post){post.comments=post.comments||[];post.comments.push({author:'Ты',text});writeSocialPosts(posts);socialFeedPosts=null;toast('Комментарий сохранён локально');}}renderSocialFeed();}
function renderSocialFeed(){const el=$('worldPhoneContent');const posts=currentSocialPosts();const shared=Array.isArray(socialFeedPosts);el.innerHTML=`<h2>📸 TR Social</h2><p>Сделай снимок заезда и поделись им с другими игроками.</p><div class="card"><input id="socialCaption" maxlength="180" placeholder="Подпись к фото…" style="width:100%;padding:10px;border:1px solid #ccdbea;border-radius:9px"><button class="btn" data-social-publish style="margin-top:8px">📷 Сфотографировать и опубликовать</button></div>${posts.map(post=>`<div class="social-post"><b>${escapeHTML(post.author||'Гонщик')}</b><p>${escapeHTML(post.caption||'Без подписи')}</p><img src="${post.image}" alt="Фото игрока"><div class="social-actions"><button class="btn" data-social-like="${Number(post.id)}">❤️ ${Number(post.likes)||0} лайков</button><span>${(post.comments||[]).length} комментариев</span></div>${(post.comments||[]).slice(-3).map(c=>`<p><b>${escapeHTML(c.author||'Гонщик')}:</b> ${escapeHTML(c.text)}</p>`).join('')}<div class="social-comment-row"><input data-social-comment-input="${Number(post.id)}" maxlength="120" placeholder="Комментарий"><button class="btn" data-social-comment="${Number(post.id)}">Отправить</button></div></div>`).join('')||'<p class="sub">Лента пока пустая. Первая публикация появится здесь.</p>'}<p class="sub">${shared?'Общая лента: публикации, лайки и комментарии передаются через игровой сервер.':'Локальный кэш: подключись к игровому серверу, чтобы увидеть общую ленту.'}</p>`;}
function savePhoto(){
  try{const url=renderer.domElement.toDataURL('image/png');const a=document.createElement('a');a.href=url;a.download='turbo-rivals-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';document.body.appendChild(a);a.click();a.remove();toast('Фото сохранено');}
  catch(err){toast('Не удалось сохранить фото');}
}
// ---- Интерьер школы №103 ----
let schoolG=null,activeInteriorG=null,interiorExit={x:-50,z:-23};
function createSchoolInterior(){
  const g=new THREE.Group();
  const floor=wmat(0xb88d5b,0.7),wall=wmat(0xe9e4d0,0.95),lower=wmat(0x7fb8a6,0.85),board=wmat(0x1f3d2c,0.9),frame=wmat(0x8d939a,0.5,0.4),desk=wmat(0x9b6b3f,0.7),seat=wmat(0x3d5a80,0.6),dark=wmat(0x33363b),glass=new THREE.MeshBasicMaterial({color:0xbfe9ff});
  wbox(g,24,0.3,24,floor,0,-0.18,0);
  wbox(g,24,5.8,0.35,wall,0,2.9,-12);wbox(g,24,5.8,0.35,wall,0,2.9,12);
  wbox(g,0.35,5.8,24,wall,-12,2.9,0);wbox(g,0.35,5.8,24,wall,12,2.9,0);
  for(const [x,z,ry] of [[0,-11.8,0],[0,11.8,0],[-11.8,0,1],[11.8,0,1]]){
    if(ry===0)wbox(g,24,1.1,0.4,lower,x,0.55,z);else wbox(g,0.4,1.1,24,lower,x,0.55,z);
  }
  // Доска с надписью
  wbox(g,12.4,3.4,0.16,frame,0,3.2,-11.7);
  const label=new THREE.Mesh(new THREE.PlaneGeometry(12,3),new THREE.MeshBasicMaterial({map:canvasTex(768,192,(ctx,w,h)=>{ctx.fillStyle='#1f3d2c';ctx.fillRect(0,0,w,h);ctx.fillStyle='#f2f2f2';ctx.font='bold 84px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ШКОЛА № 103',w/2,h/2);})}));
  label.position.set(0,3.2,-11.55);g.add(label);
  wbox(g,12,3,0.12,board,0,3.2,-11.6);
  // Окна на боковых стенах
  for(const z of [-7,-1,5]){wbox(g,0.12,2.2,3,glass,-11.8,3,z);wbox(g,0.12,2.2,3,glass,11.8,3,z);}
  // Учительский стол
  wbox(g,3.2,0.12,1.3,desk,0,0.95,-8.3);for(const x of [-1.4,1.4])for(const z of [-8.9,-7.7])wbox(g,0.1,0.95,0.1,dark,x,0.47,z);
  wbox(g,0.9,0.1,0.9,seat,0,0.5,-7.2);wbox(g,0.9,0.9,0.1,seat,0,0.95,-6.8);
  // Парты и стулья
  for(const z of [-3,1,5]) for(const x of [-7,-2.3,2.3,7]){
    wbox(g,1.8,0.1,1.0,desk,x,0.85,z);
    for(const dx of [-0.8,0.8])for(const dz of [-0.4,0.4])wbox(g,0.08,0.85,0.08,dark,x+dx,0.42,z+dz);
    wbox(g,0.9,0.1,0.9,seat,x,0.5,z+0.95);wbox(g,0.9,0.9,0.1,seat,x,0.95,z+1.4);
  }
  // Флаг в углу и часы на стене
  wbox(g,0.12,6,0.12,frame,10.8,3,-10.8);wbox(g,0.05,1.2,1.8,wmat(0x2f9e5b,0.6),10.8,5.2,-9.8);
  const clock=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.6,0.1,20),wmat(0xf4f4f4,0.6));clock.rotation.x=Math.PI/2;clock.position.set(-4,4.4,-11.6);g.add(clock);
  for(const x of [-6,6]){const lamp=new THREE.PointLight(0xfff1d6,0.5,18);lamp.position.set(x,4.5,0);g.add(lamp);}
  g.visible=false;scene.add(g);return g;
}
function enterSchool(target){
  if(!schoolG)schoolG=createSchoolInterior();
  worldCarVisibleBeforeInterior=!!player.mesh.visible;
  worldInterior=true;worldJumpRemaining=0;worldJumpWasHeld=held.has('drift');if(charMesh)charMesh.position.y=0;
  worldG.visible=false;apartmentG.visible=false;schoolG.visible=true;activeInteriorG=schoolG;
  interiorExit={x:target.x,z:target.z+1.5};
  charMesh.position.set(0,0,8);charMesh.rotation.y=Math.PI;
  player.mesh.visible=false;worldLookDrag=null;
  $('worldLocation').textContent='ШКОЛА № 103 · УЛ. ГАГАРИНА';toast('Ты в школе №103. Нажми E, чтобы выйти.');
}
// ---- Время суток, погода, снег ----
const WORLD_TIMES=['Утро','День','Вечер','Ночь'], WORLD_WEATHERS=['Ясно','Облачно','Дождь','Туман','Снег'];
const WORLD_TIME_ICON={Утро:'🌅',День:'☀',Вечер:'🌇',Ночь:'🌙'}, WORLD_WX_LABEL={Ясно:'Чистое небо',Облачно:'Облачно',Дождь:'🌧 Дождь',Туман:'🌫 Туман',Снег:'❄ Снег'};
let worldKeepAtmo=false, snowG=null;
const SNOW_N=1100, snowB=new Float32Array(SNOW_N*3);
function ensureSnow(){
  if(snowG)return;
  for(let i=0;i<SNOW_N;i++){snowB[i*3]=(Math.random()-.5)*70;snowB[i*3+1]=Math.random()*38;snowB[i*3+2]=(Math.random()-.5)*70;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(snowB),3));
  snowG=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.22,transparent:true,opacity:0.9,depthWrite:false,sizeAttenuation:true}));
  snowG.frustumCulled=false;snowG.visible=false;scene.add(snowG);
}
function updateWorldSnow(dt){
  if(!snowG||!snowG.visible)return;
  const a=snowG.geometry.attributes.position.array;
  for(let i=0;i<SNOW_N;i++){
    let y=snowB[i*3+1]-dt*(2.2+(i%5)*0.35);if(y<0)y+=38;snowB[i*3+1]=y;
    a[i*3]=snowB[i*3]+Math.sin(worldAnimT*0.8+i)*0.6;a[i*3+1]=y;a[i*3+2]=snowB[i*3+2]+Math.cos(worldAnimT*0.7+i*1.3)*0.6;
  }
  snowG.geometry.attributes.position.needsUpdate=true;
  snowG.position.set(cam.position.x,cam.position.y-12,cam.position.z);
}
function applyWorldAtmosphere(){
  const cfg=WORLD_REGIONS[worldRegionId]||WORLD_REGIONS.tashkent;
  const T={
    'Утро':{bg:0x9db8d8,fog:0xdcc6aa,hemi:0.85,sun:0.85,sunC:0xffdcae},
    'День':{bg:cfg.sky[0],fog:cfg.sky[1],hemi:1.15,sun:1.12,sunC:0xffffff},
    'Вечер':worldRegionId==='newyork'?{bg:0x9b668e,fog:0x7d6b91,hemi:0.82,sun:0.88,sunC:0xffa16e}:{bg:0x715d80,fog:cfg.fog,hemi:0.7,sun:0.78,sunC:0xffa56b},
    'Ночь':worldRegionId==='newyork'?{bg:0x14254b,fog:0x392b59,hemi:0.42,sun:0.38,sunC:0x91bdff}:{bg:0x0d1530,fog:0x262e46,hemi:0.34,sun:0.45,sunC:0x9fb4ff}
  }[worldTime]||{bg:cfg.sky[0],fog:cfg.sky[1],hemi:1,sun:1,sunC:0xffffff};
  const bg=new THREE.Color(T.bg),fog=new THREE.Color(T.fog);
  let hm=1,sm=1,near=120,far=1050;const grey=new THREE.Color(worldTime==='Ночь'?0x1a2036:0x8f98a3);
  if(worldWeather==='Облачно'){bg.lerp(grey,0.45);fog.lerp(grey,0.4);hm=0.8;sm=0.58;far=800;}
  else if(worldWeather==='Дождь'){bg.lerp(grey,0.6);fog.lerp(grey,0.55);hm=0.78;sm=0.4;near=65;far=420;}
  else if(worldWeather==='Туман'){bg.lerp(grey,0.3);fog.set(worldTime==='Ночь'?0x2c3346:0xaab4bd);hm=0.85;sm=0.5;near=26;far=205;}
  else if(worldWeather==='Снег'){const w=new THREE.Color(worldTime==='Ночь'?0x2a3350:0xd5dde6);bg.lerp(w,0.55);fog.lerp(w,0.6);hm=0.95;sm=0.55;near=40;far=330;}
  scene.background=bg;scene.fog=new THREE.Fog(fog.getHex(),near,far);
  hemi.intensity=T.hemi*hm;sun.intensity=T.sun*sm;sun.color.setHex(T.sunC);spot.visible=worldTime==='Ночь';
  rainOn=!['verylow','low'].includes(resolvedGfx());
  if(rainG){rainG.userData.want=worldWeather==='Дождь'?2:0;rainG.visible=rainOn&&worldWeather==='Дождь';}
  ensureSnow();snowG.visible=worldWeather==='Снег'&&rainOn;
  if(worldG){
    const wm=worldG.userData.winMat;if(wm)wm.emissiveIntensity=worldTime==='Ночь'?1.7:worldTime==='Вечер'?0.9:0.2;
    let cover=worldG.userData.snowCover;
    if(!cover){cover=new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),new THREE.MeshBasicMaterial({color:0xf2f6fa,transparent:true,opacity:0.5,depthWrite:false}));cover.rotation.x=-Math.PI/2;cover.position.y=0.19;cover.renderOrder=1;worldG.add(cover);worldG.userData.snowCover=cover;}
    cover.visible=worldWeather==='Снег';
  }
  const tag=$('worldWeatherTag');if(tag)tag.textContent=WORLD_TIME_ICON[worldTime]+' '+worldTime+' · '+WORLD_WX_LABEL[worldWeather];
}
function cycleWorldTime(){worldTime=WORLD_TIMES[(WORLD_TIMES.indexOf(worldTime)+1)%WORLD_TIMES.length];applyWorldAtmosphere();toast('Время: '+worldTime);}
function cycleWorldWeather(){worldWeather=WORLD_WEATHERS[(WORLD_WEATHERS.indexOf(worldWeather)+1)%WORLD_WEATHERS.length];applyWorldAtmosphere();toast('Погода: '+worldWeather);}
function ensureWorldAtmoButtons(){
  if($('worldTimeBtn'))return;const host=$('worldWeatherTag').parentNode;
  for(const [id,label,fn] of [['worldTimeBtn','🕒 Время',cycleWorldTime],['worldWxBtn','🌦 Погода',cycleWorldWeather]]){
    const b=document.createElement('button');b.id=id;b.type='button';b.textContent=label;b.className='btn';b.style.cssText='pointer-events:auto;margin:4px 4px 0 0;padding:4px 10px;font-size:12px;';b.onclick=fn;host.appendChild(b);
  }
}
// ---- Аэропорт и перелёты ----
const AIRPORT_DESTS=[['tashkent','🇺🇿 Ташкент'],['newyork','🗽 Нью-Йорк'],['paris','🇫🇷 Париж'],['italy','🇮🇹 Рим'],['losangeles','🌴 Лос-Анджелес'],['miami','🏖 Майами']];
function openAirportMenu(){
  $('worldPhone').hidden=false;
  $('worldPhoneContent').innerHTML='<h2>✈ Аэропорт · вылеты</h2><p>Выберите город. Перелёт бесплатный, время суток и погода сохранятся.</p>'+AIRPORT_DESTS.filter(d=>d[0]!==worldRegionId).map(d=>`<div class="card"><b>${d[1]}</b><button class="btn" data-travel="${d[0]}">Лететь</button></div>`).join('');
}
function travelTo(dest){
  closeWorldPhone();
  let f=$('flightFade');if(!f){f=document.createElement('div');f.id='flightFade';f.style.cssText='position:fixed;inset:0;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;font:700 26px sans-serif;z-index:9999;opacity:0;transition:opacity .5s;pointer-events:none;';document.body.appendChild(f);}
  f.textContent='✈ Перелёт…';f.style.opacity='1';
  setTimeout(()=>{worldKeepAtmo=true;startOpenWorld(dest);toast('Добро пожаловать: '+WORLD_REGIONS[dest].name);setTimeout(()=>{f.style.opacity='0';},300);},650);
}
function addAirportApron(parent,x,z){
  const tarmac=wmat(0x2b2e33,0.95),white=wmat(0xf1f3f5,0.5,0.2),blue=wmat(0x1c5aa6,0.5),dark=wmat(0x14181d,0.6);
  wbox(parent,92,0.22,92,tarmac,x,0.05,z,{shadow:false});
  for(let i=-3;i<=3;i++)wbox(parent,0.6,0.02,10,wmat(0xf2d14b,0.9),x-40,0.2,z+i*12,{shadow:false});
  const plane=new THREE.Group();
  const fus=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.6,36,16),white);fus.rotation.z=Math.PI/2;fus.position.y=4.6;fus.castShadow=true;plane.add(fus);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(2.6,16,10),white);nose.position.set(18,4.6,0);nose.scale.set(1.8,1,1);plane.add(nose);
  const tailCone=new THREE.Mesh(new THREE.ConeGeometry(2.6,7,16),white);tailCone.rotation.z=Math.PI/2;tailCone.position.set(-21.5,5,0);plane.add(tailCone);
  wbox(plane,7,0.35,34,white,1,4.0,0);wbox(plane,3.6,0.3,12,white,-18,5.4,0);wbox(plane,4.2,6.5,0.4,blue,-18.5,8.4,0);
  wbox(plane,36,0.5,2.4,blue,0,4.7,2.62);wbox(plane,36,0.5,2.4,blue,0,4.7,-2.62);
  for(let i=0;i<16;i++)for(const s of [-1,1])wbox(plane,0.7,0.8,0.1,dark,-14+i*1.9,5.6,s*2.62);
  wbox(plane,1.5,0.9,0.1,dark,19.5,5.4,0);
  for(const s of [-1,1]){const eng=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.3,4.2,12),wmat(0x9aa3ad,0.4,0.6));eng.rotation.z=Math.PI/2;eng.position.set(3,2.8,s*8.5);plane.add(eng);}
  for(const [px,pz] of [[14,0],[-4,3],[-4,-3]]){const w=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,0.5,10),dark);w.rotation.x=Math.PI/2;w.position.set(px,0.7,pz);plane.add(w);wbox(plane,0.25,2.6,0.25,wmat(0x777f88,0.5,0.5),px,1.9,pz,{shadow:false});}
  plane.position.set(x,0,z);plane.rotation.y=0.12;parent.add(plane);
  addLandmarkSign(parent,'AIRPORT · GATE 1',x,9,z-44,22,2.2,0x1c5aa6,0xffffff);
  worldBuildings.push({x:x,z:z,hw:22,hd:4,h:9});
}
// ---- Нью-Йорк ----
function addNewYorkLandmark(parent,x,z){
  const stone=wmat(0xb9b2a4,0.7),dark=wmat(0x6b7077,0.6,0.3),glow=new THREE.MeshBasicMaterial({color:0xfff1c4});
  wbox(parent,26,30,26,stone,x,15,z);wbox(parent,20,22,20,stone,x,41,z);wbox(parent,14,22,14,stone,x,63,z);wbox(parent,9,14,9,stone,x,81,z);
  wbox(parent,5,10,5,dark,x,93,z);const spire=new THREE.Mesh(new THREE.ConeGeometry(1.2,20,8),dark);spire.position.set(x,108,z);parent.add(spire);
  for(let f=0;f<7;f++){wbox(parent,26.2,0.4,26.2,dark,x,4+f*4,z,{shadow:false});}
  for(let k=-2;k<=2;k++)wbox(parent,2,22,0.12,glow,x+k*4.5,18,z+13.2,{shadow:false});
  addLandmarkSign(parent,'EMPIRE TOWER',x,34,z+14,24,2.6,0x1a2a44,0xffe7ac);
  const cols=[0xff3b6b,0x35d0ff,0xffd23b,0x7dff6a,0xb86bff];
  for(let i=0;i<10;i++){const m=new THREE.MeshBasicMaterial({color:cols[i%5]});wbox(parent,9,5,0.3,m,x-60+i*13,10+(i%3)*4,z+70+(i%2)*3,{shadow:false});wbox(parent,0.4,10+(i%3)*4,0.4,dark,x-60+i*13,5,z+70+(i%2)*3,{shadow:false});}
  addLandmarkSign(parent,'TIMES SQUARE',x,22,z+66,26,3,0x111418,0xffffff);
}
// ---- Чиланзар: панельный дом и вывески ----
function addChilanzarBlock(parent,cx,cz){
  const panel=wmat(0xc9c2b2,0.95),seam=wmat(0xa49d8f,0.95),roof=wmat(0x4a4f55,0.9),door=wmat(0x2d4f6e,0.7),glass=new THREE.MeshStandardMaterial({color:0x9fd3e6,emissive:0x1c4455,emissiveIntensity:0.35,roughness:0.2});
  const L=64,D=12,H=16;
  wbox(parent,L,H,D,panel,cx,H/2,cz);wbox(parent,L+1,0.8,D+1,roof,cx,H+0.4,cz);
  for(let s=-3;s<=3;s++)wbox(parent,0.25,H,D+0.1,seam,cx+s*8,H/2,cz,{shadow:false});
  for(let f=1;f<=4;f++)wbox(parent,L+0.1,0.22,D+0.1,seam,cx,f*3.1,cz,{shadow:false});
  const win=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,1.7,0.14),glass,5*16*2);const dm=new THREE.Object3D();let n=0;
  for(let f=0;f<5;f++)for(let c=0;c<16;c++){for(const side of [-1,1]){if(f===0&&side===1&&c%4===2)continue;dm.position.set(cx-30+c*4,2+f*3.1,cz+side*(D/2+0.02));dm.updateMatrix();win.setMatrixAt(n++,dm.matrix);}}
  win.count=n;parent.add(win);
  const doors=[];
  for(let i=0;i<4;i++){
    const dx=cx-24+i*16;wbox(parent,2.6,3.2,0.3,door,dx,1.6,cz+D/2+0.1);wbox(parent,4.2,0.3,2.2,roof,dx,3.5,cz+D/2+1);
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.6),new THREE.MeshBasicMaterial({map:canvasTex(128,128,(ctx,w,h)=>{ctx.fillStyle='#1b3a5c';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff';ctx.font='bold 88px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),w/2,h/2+4);})}));
    plate.position.set(dx,4.8,cz+D/2+0.2);parent.add(plate);doors.push(dx);
  }
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(14,2.6),new THREE.MeshBasicMaterial({map:signTexture('КАТТА ЧИЛАНЗАР 1','ДОМ 11А · ПОДЪЕЗДЫ 1–4','#1b3a5c')}));
  sign.position.set(cx-6,H+2.2,cz+D/2+0.4);parent.add(sign);wbox(parent,0.3,2.6,0.3,roof,cx-12,H+1.3,cz+D/2+0.3);wbox(parent,0.3,2.6,0.3,roof,cx,H+1.3,cz+D/2+0.3);
  for(let i=0;i<6;i++){const b=wmat(0x5b6b73,0.8);wbox(parent,2.2,0.2,0.7,b,cx-20+i*8,0.55,cz+D/2+4);wbox(parent,2.2,0.5,0.15,b,cx-20+i*8,0.9,cz+D/2+4.3);}
  worldBuildings.push({x:cx,z:cz,hw:L/2,hd:D/2,h:H});
  return {entrance4:{x:doors[3],z:cz+D/2+3.5}};
}
function addStreetSign(parent,text,x,z){
  const pole=wmat(0x4a525a,0.5,0.6);wbox(parent,0.14,5,0.14,pole,x,2.5,z);
  const s=new THREE.Mesh(new THREE.PlaneGeometry(5.5,1.1),new THREE.MeshBasicMaterial({map:signTexture(text,'','#0f4c81')}));s.position.set(x,5.1,z+0.1);parent.add(s);
  const s2=s.clone();s2.rotation.y=Math.PI;s2.position.z=z-0.1;parent.add(s2);
}
function disposeWorldGroup(group){
  if(!group)return;
  group.traverse(o=>{
    if(o.userData&&o.userData.trSharedAsset)return;
    if(o.geometry)o.geometry.dispose();
    if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m.map&&m.map.dispose)m.map.dispose();if(m.dispose)m.dispose();});}
  });
  if(group.parent)group.parent.remove(group);
}
function buildOpenWorld(regionId=worldRegionId){
  const cfg=WORLD_REGIONS[regionId]||WORLD_REGIONS.tashkent;
  if(worldG&&worldBuiltRegion===cfg.id)return;
  if(worldG)disposeWorldGroup(worldG); if(apartmentG)disposeWorldGroup(apartmentG);
  worldG=new THREE.Group();worldG.name='TurboRivals_'+cfg.id;scene.add(worldG);worldBuildings=[];worldPedestrians=[];worldTraffic=[];worldInteractables=[];worldBuiltRegion=cfg.id;
  const asphalt=wmat(cfg.asphalt,0.94),concrete=wmat(cfg.concrete,0.98),grass=wmat(cfg.ground,1),lane=new THREE.MeshBasicMaterial({color:cfg.lane}),buildingColors=cfg.bcol,windowMat=new THREE.MeshStandardMaterial({color:cfg.window,emissive:cfg.windowGlow,emissiveIntensity:0.45,roughness:0.18,metalness:0.25});
  wbox(worldG,1500,0.5,1500,grass,0,-0.42,0,{shadow:false});
  // Сетка широких городских улиц и отдельные тротуары.
  const roadW=cfg.roadW||19, sidewalkW=3.0, sidewalkOffset=roadW/2+sidewalkW/2;
  for(let i=-6;i<=6;i++){
    const v=i*100;wbox(worldG,roadW,0.14,1400,asphalt,v,0,0,{shadow:false});wbox(worldG,1400,0.14,roadW,asphalt,0,0,v,{shadow:false});
    for(const side of [-1,1]){wbox(worldG,sidewalkW,0.18,1400,concrete,v+side*sidewalkOffset,0.015,0,{shadow:false});wbox(worldG,1400,0.18,sidewalkW,concrete,0,0.015,v+side*sidewalkOffset,{shadow:false});}
  }
  // Центральная разметка одним инстанс-мешем, чтобы не перегружать слабые устройства.
  const dashGeom=new THREE.BoxGeometry(0.18,0.025,4.4),dashes=new THREE.InstancedMesh(dashGeom,lane,Math.floor(13*1400/19));const dummy=new THREE.Object3D();let dk=0;
  for(let i=-6;i<=6;i++)for(let z=-690;z<=690;z+=19){dummy.position.set(i*100,0.085,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();dashes.setMatrixAt(dk++,dummy.matrix);}dashes.count=dk;worldG.add(dashes);
  // Crosswalks at junctions: bright zebra bars, instantiated to keep draw calls low.
  const crossMat=new THREE.MeshBasicMaterial({color:0xe7e8df}),crossGeom=new THREE.BoxGeometry(1.05,0.035,4.8),crossEdge=roadW/2+2.0;
  const crossCount=13*13*16,cross=new THREE.InstancedMesh(crossGeom,crossMat,crossCount);let ci=0;
  for(let gx=-6;gx<=6;gx++)for(let gz=-6;gz<=6;gz++)for(const axis of [0,1])for(let k=0;k<4;k++){
    const off=(k-1.5)*1.55;dummy.position.set(gx*100+(axis===0?off:crossEdge),0.09,gz*100+(axis===0?crossEdge:off));dummy.rotation.set(0,axis===0?0:Math.PI/2,0);dummy.updateMatrix();cross.setMatrixAt(ci++,dummy.matrix);
  }cross.count=ci;worldG.add(cross);
  // Street furniture and parking markings make the city feel occupied without hundreds of draw calls.
  const benchWood=wmat(0x805638,0.8),benchMetal=wmat(0x414c56,0.55,0.45),binMat=wmat(0x385e5b,0.65,0.25),parkMat=new THREE.MeshBasicMaterial({color:0xbec7c7});
  const benchSeat=new THREE.InstancedMesh(new THREE.BoxGeometry(2.2,0.16,0.55),benchWood,170),benchLeg=new THREE.InstancedMesh(new THREE.BoxGeometry(0.14,0.7,0.14),benchMetal,340),trashBins=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.38,0.32,1.0,8),binMat,180),parking=new THREE.InstancedMesh(new THREE.BoxGeometry(0.12,0.025,7.4),parkMat,260);let bi=0,ti=0,pi=0;
  for(let gx=-5;gx<=5;gx++)for(let gz=-5;gz<=5;gz++){
    const x=gx*100,z=gz*100;
    if(bi<170){dummy.position.set(x+15,0.72,z+16);dummy.rotation.set(0,0,0);dummy.updateMatrix();benchSeat.setMatrixAt(bi++,dummy.matrix);}
    if(ti<180){dummy.position.set(x+12,0.55,z+19);dummy.rotation.set(0,0,0);dummy.updateMatrix();trashBins.setMatrixAt(ti++,dummy.matrix);}
    for(const side of [-1,1])if(pi<260){dummy.position.set(x+side*15,0.085,z+26);dummy.rotation.set(0,0,0);dummy.updateMatrix();parking.setMatrixAt(pi++,dummy.matrix);}
  }
  benchSeat.count=bi;trashBins.count=ti;parking.count=pi;worldG.add(benchSeat,trashBins,parking);
  for(let i=0;i<bi;i++){const x=(Math.floor(i/11)-5)*100+15,z=(i%11-5)*100+16;dummy.position.set(x,0.38,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();benchLeg.setMatrixAt(i*2,dummy.matrix);dummy.position.x+=2.0;dummy.updateMatrix();benchLeg.setMatrixAt(i*2+1,dummy.matrix);}benchLeg.count=bi*2;worldG.add(benchLeg);
  // Это временная сетка старого города. Для NYC скрываем её целиком и используем
  // дороги/тротуары из GLB; специальные сервисные фасады отмечаются отдельно ниже.
  worldG.children.forEach(child=>{child.userData=child.userData||{};child.userData.trLegacyBlockout=true;});
  // Фасады — отдельные здания, оконные панели и кондиционеры инстансированы.
  const winMax=['verylow','low'].includes(resolvedGfx())?1700:5200,winMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,1.35,0.12),windowMat,winMax);winMesh.castShadow=false;
  let wn=0;const colliders=[];const specialCells=new Map([['-1,-1',{kind:'apartment',name:'АПАРТАМЕНТЫ',sub:'HOME · 24/7',col:0x7e8d9d}],['0,-1',{kind:'market',name:'MARKET 24/7',sub:'ЕЖЕДНЕВНЫЕ ТОВАРЫ',col:0x2c7867}],['1,0',{kind:'garage',name:'AUTO LAB',sub:'РЕМОНТ · ТЮНИНГ',col:0x305c7d}],['-1,0',{kind:'fashion',name:'CITY MODA',sub:'ОДЕЖДА · СТИЛЬ',col:0x82537d}]]);
  const addFacade=(x,z,w,d,h,color,special=null)=>{
    const facadeStart=worldG.children.length;
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
    if(special)for(let k=facadeStart;k<worldG.children.length;k++)worldG.children[k].userData.keepForNY=true;
  };
  if(cfg.id==='tashkent'){
    specialCells.delete('-1,-1');
    specialCells.set('2,2',{kind:'school',name:'ШКОЛА № 103',sub:'УЛ. ГАГАРИНА',col:0xc9a64b});
  }
  specialCells.set('2,-2',{kind:'airport',name:'АЭРОПОРТ',sub:'AIRPORT · ВЫЛЕТЫ',col:0x2f6fb3});specialCells.set('3,-2',{kind:'apron'});
  const quality=resolvedGfx(),cities=quality==='verylow'?3:quality==='low'?4:['med','high','veryhigh'].includes(quality)?5:6;
  for(let gx=-cities;gx<cities;gx++)for(let gz=-cities;gz<cities;gz++){
    const cx=gx*100+50,cz=gz*100+50,key=`${gx},${gz}`,sp=specialCells.get(key);
    if(sp&&sp.kind==='apron')continue;
    if(sp){const w=sp.kind==='apartment'?40:36,d=sp.kind==='apartment'?42:38,h=sp.kind==='apartment'?42:sp.kind==='garage'?13:sp.kind==='school'?16:sp.kind==='airport'?14:18;addFacade(cx,cz,w,d,h,sp.col,sp);worldInteractables.push({type:sp.kind,x:cx,z:cz+d/2+4,r:12,name:sp.name});continue;}
    if(Math.random()<0.035)continue;
    // Keep a clear plaza around the selected region's signature landmark.
    if(cfg.landmarkAt && Math.hypot(cx-cfg.landmarkAt.x,cz-cfg.landmarkAt.z)<78)continue;
    const w=24+Math.random()*31,d=24+Math.random()*33,h=(12+Math.random()*(['ultra','rt'].includes(quality)?106:76))*(cfg.style==='manhattan'?1.8:1),c=buildingColors[Math.floor(Math.random()*buildingColors.length)];
    addFacade(cx+(Math.random()-.5)*17,cz+(Math.random()-.5)*17,w,d,h,c,null);
    if(Math.random()<(quality==='verylow'?0.12:0.46)){const w2=12+Math.random()*17,d2=12+Math.random()*18,h2=7+Math.random()*28;addFacade(cx+(Math.random()<0.5?-1:1)*25,cz+(Math.random()<0.5?-1:1)*23,w2,d2,h2,buildingColors[Math.floor(Math.random()*buildingColors.length)],null);}
  }
  winMesh.count=wn;worldG.add(winMesh);worldG.userData.winMat=winMesh.material;worldBuildings=colliders;
  // Уличные фонари, клумбы и зелёные островки на перекрёстках.
  const lampPole=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12,0.16,6.5,8),wmat(0x454e58,0.6,0.65),320),lampGlow=new THREE.InstancedMesh(new THREE.SphereGeometry(0.3,8,6),new THREE.MeshStandardMaterial({color:0xffe5a1,emissive:0xffb849,emissiveIntensity:0.8}),320);let li=0;
  for(let i=-5;i<=5;i++)for(let j=-5;j<=5;j++)for(const side of [-1,1]){if(li>=320)break;const x=i*100+side*14,z=j*100+14;dummy.position.set(x,3.25,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();lampPole.setMatrixAt(li,dummy.matrix);dummy.position.set(x,6.6,z);dummy.scale.set(1,1,1);dummy.updateMatrix();lampGlow.setMatrixAt(li,dummy.matrix);li++;}
  lampPole.count=li;lampGlow.count=li;worldG.add(lampPole,lampGlow);
  for(let i=-5;i<=5;i++)for(let j=-5;j<=5;j++)if((i+j)%3===0){
    const tx=i*100+18,tz=j*100+18;
    if(cfg.palm)addWorldPalm(worldG,tx,tz,0.72+Math.random()*0.28);else addWorldTree(worldG,tx,tz,0.65+Math.random()*0.35);
  }
  // Custom add-on signals are not part of the imported city root, so the map editor
  // can move/scale the city without dragging them along with the background model.
  if(cfg.id==='newyork'){
    addTrafficSignal(worldG,-8,12,0);addTrafficSignal(worldG,92,12,Math.PI/2);
    addTrafficSignal(worldG,-8,112,0);addTrafficSignal(worldG,92,112,Math.PI/2);
  }
  addRegionLandmarks(worldG,cfg);
  // Monument and waterfront collision bounds keep cars from clipping straight through landmarks.
  const lm=cfg.landmarkAt;
  if(cfg.landmark==='bazaar')worldBuildings.push({x:lm.x,z:lm.z,hw:16,hd:16,h:25});
  else if(cfg.landmark==='eiffel')worldBuildings.push({x:lm.x,z:lm.z,hw:19,hd:19,h:90});
  else if(cfg.landmark==='empire')worldBuildings.push({x:lm.x,z:lm.z,hw:14,hd:14,h:110});
  else if(cfg.landmark==='colosseum')worldBuildings.push({x:lm.x,z:lm.z,hw:28,hd:19,h:19});
  else if(cfg.landmark==='hollywood')worldBuildings.push({x:lm.x,z:lm.z-54,hw:78,hd:35,h:65});
  else if(cfg.landmark==='ocean')worldBuildings.push({x:620,z:0,hw:1.6,hd:720,h:4});
  addAirportApron(worldG,350,-150);
  if(cfg.id==='tashkent'){
    const blk=addChilanzarBlock(worldG,-150,-50);
    worldInteractables.push({type:'apartment',x:blk.entrance4.x,z:blk.entrance4.z,r:8,name:'Подъезд 4 · дом 11А',exit:{x:blk.entrance4.x,z:blk.entrance4.z+1.5}});
    addStreetSign(worldG,'УЛ. ГАГАРИНА',311,215);addStreetSign(worldG,'КАТТА ЧИЛАНЗАР',-111,-30);
    wbox(worldG,0.2,12,0.2,wmat(0x8d939a,0.5,0.4),228,6,224);wbox(worldG,3.2,0.9,0.05,wmat(0x1d9bd7,0.6),229.7,11.4,224);wbox(worldG,3.2,0.9,0.05,wmat(0xffffff,0.6),229.7,10.5,224);wbox(worldG,3.2,0.9,0.05,wmat(0x2fa05b,0.6),229.7,9.6,224);
  }
  // Личная машина на парковочном кармане рядом с персонажем.
  if(!player.mesh){showCar(save.cur);}player.mesh.position.set(9,0,8);player.mesh.rotation.set(0,0,0);player.mesh.visible=false;worldYaw=0;
  worldInteractables.push({type:'raceboard',x:-28,z:12,r:10,name:'Городские заезды'},{type:'plaza',x:0,z:50,r:12,name:'Центральная площадь'});
  // Пешеходы: разнообразные лица, куртки и обувь; прохожие гуляют, машут рукой и радуются рядом с гонщиком.
  const pedCount=quality==='verylow'?6:quality==='low'?12:quality==='med'?18:quality==='high'?26:quality==='veryhigh'?34:40;
  for(let i=0;i<pedCount;i++){
    const axis=Math.random()<0.5?'x':'z',road=Math.floor(Math.random()*9-4)*100+(Math.random()<0.5?-1:1)*13;
    const centerX=axis==='x'?road:(Math.random()*850-425),centerZ=axis==='z'?road:(Math.random()*850-425);
    const ped=makeWorldPedestrian(Math.random()<0.42?'girl':'boy',Math.floor(Math.random()*OUTFITS.length),Math.floor(Math.random()*SKINS.length));
    ped.position.set(centerX,0,centerZ);ped.rotation.y=Math.random()*Math.PI*2;worldG.add(ped);
    const rec={mesh:ped,name:WORLD_NAMES[i%WORLD_NAMES.length],centerX,centerZ,axis,phase:Math.random()*6.28,amp:2+Math.random()*5,walk:0.45+Math.random()*0.7,waveT:Math.random()*2,jumpT:0,nextCheer:2+Math.random()*6,baseYaw:ped.rotation.y};ped.userData.trWalkSpeed=rec.walk;ped.userData.trMotionPhase=rec.phase;if(window.TRModels&&window.TRModels.registerCharacter)window.TRModels.registerCharacter(ped);worldPedestrians.push(rec);
  }
  // Движущийся городской транспорт для масштаба и жизни города.
  const trafficCount=quality==='verylow'?2:quality==='low'?4:quality==='med'?6:quality==='high'?8:quality==='veryhigh'?10:12;
  for(let i=0;i<trafficCount;i++){
    const def=CARS[Math.floor(Math.random()*Math.min(7,CARS.length))],mesh=makeCarModel(def,Math.random()<0.5?undefined:Math.floor(Math.random()*0xffffff),{neon:false,rimStyle:Math.floor(Math.random()*3)});seatDriver(mesh,Math.random()<0.5?'boy':'girl',Math.floor(Math.random()*6),Math.floor(Math.random()*3));
    const dir=Math.random()<0.5?1:-1,z=Math.floor(Math.random()*9-4)*100+(Math.random()<0.5?-5:5),x=Math.random()*1200-600;mesh.position.set(x,0,z);mesh.rotation.y=dir>0?Math.PI/2:-Math.PI/2;worldG.add(mesh);worldTraffic.push({mesh,x,z,dir,speed:6+Math.random()*8,axis:'x',phase:Math.random()*6.28});
  }
  // Уютная квартира с окном, гостиной, кухней и спальней.
  apartmentG=createApartmentInterior();
}
function setCityLoadProgress(percent, text){
  const bar=document.querySelector('.loading-track i');if(bar)bar.style.width=clamp(percent,0,100)+'%';
  const label=$('worldLoadingText');if(label&&text)label.textContent=text;
}
window.setCityLoadProgress=setCityLoadProgress;
function buildWorldMinimapBase(city){
  if(!$('worldMiniMap')||!city)return false;
  let target=null,oldTarget=null,oldClearColor=null,oldClearAlpha=1,stateSaved=false;
  try{
    city.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(city);
    if(bounds.isEmpty())return false;
    const size=bounds.getSize(new THREE.Vector3());
    worldMiniMapWorldSpan=Math.max(100,size.x,size.z);
    worldMiniMapCenterX=(bounds.min.x+bounds.max.x)/2;
    worldMiniMapCenterZ=(bounds.min.z+bounds.max.z)/2;
    const mobile=LOW_DEVICE||isTouch,sizePx=mobile?384:768;
    const mapScene=new THREE.Scene();mapScene.background=new THREE.Color(0x27313a);
    const mapRoot=city.clone(true);mapScene.add(mapRoot);mapRoot.updateMatrixWorld(true);
    mapScene.add(new THREE.HemisphereLight(0xffffff,0x4a5360,2.0));
    const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(worldMiniMapCenterX+250,Math.max(bounds.max.y+worldMiniMapWorldSpan,bounds.max.y+300),worldMiniMapCenterZ+150);mapScene.add(sun);
    const half=worldMiniMapWorldSpan/2;
    const mapCamera=new THREE.OrthographicCamera(-half,half,half,-half,0.1,Math.max(4000,worldMiniMapWorldSpan*5));
    mapCamera.position.set(worldMiniMapCenterX,bounds.max.y+worldMiniMapWorldSpan*1.2+50,worldMiniMapCenterZ);
    mapCamera.up.set(0,0,-1);mapCamera.lookAt(worldMiniMapCenterX,(bounds.min.y+bounds.max.y)/2,worldMiniMapCenterZ);mapCamera.updateProjectionMatrix();
    target=new THREE.WebGLRenderTarget(sizePx,sizePx,{format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false});
    oldTarget=renderer.getRenderTarget();oldClearColor=renderer.getClearColor(new THREE.Color()).clone();oldClearAlpha=renderer.getClearAlpha();stateSaved=true;
    let pixels;
    try{
      renderer.setRenderTarget(target);renderer.setClearColor(0x27313a,1);renderer.clear(true,true,true);renderer.render(mapScene,mapCamera);
      pixels=new Uint8Array(sizePx*sizePx*4);renderer.readRenderTargetPixels(target,0,0,sizePx,sizePx,pixels);
    }finally{
      if(stateSaved){renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldClearColor,oldClearAlpha);}
      if(target)target.dispose();
    }
    const base=document.createElement('canvas');base.width=sizePx;base.height=sizePx;const bctx=base.getContext('2d');if(!bctx)throw new Error('Canvas 2D недоступен');const image=bctx.createImageData(sizePx,sizePx);
    for(let y=0;y<sizePx;y++){const sourceY=sizePx-1-y;for(let x=0;x<sizePx;x++){const a=(sourceY*sizePx+x)*4,d=(y*sizePx+x)*4;image.data[d]=pixels[a];image.data[d+1]=pixels[a+1];image.data[d+2]=pixels[a+2];image.data[d+3]=255;}}
    bctx.putImageData(image,0,0);worldMiniMapBaseCanvas=base;
    return true;
  }catch(error){
    if(stateSaved){try{renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldClearColor,oldClearAlpha);}catch(_){} }
    if(target){try{target.dispose();}catch(_){}}
    console.warn('[Turbo Rivals] Не удалось построить карту мини-карты:',error);worldMiniMapBaseCanvas=null;return false;
  }
}
function renderWorldMinimap(){
  const canvas=$('worldMiniMap');if(!canvas||canvas.hidden||state!=='world'||worldInterior)return;
  const now=performance.now();if(now-worldMinimapLast<90)return;worldMinimapLast=now;
  const ctx=canvas.getContext('2d');if(!ctx)return;const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2;
  const actor=currentWorldActor();if(!actor)return;const px=actor.position.x,pz=actor.position.z;
  const range=145,scale=w/(range*2);
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#222d36';ctx.fillRect(0,0,w,h);
  if(worldMiniMapBaseCanvas){
    const base=worldMiniMapBaseCanvas,span=worldMiniMapWorldSpan;
    const srcX=(px-range-worldMiniMapCenterX+span/2)/span*base.width;
    const srcY=(pz-range-worldMiniMapCenterZ+span/2)/span*base.height;
    const srcW=(range*2)/span*base.width,srcH=(range*2)/span*base.height;
    const ix0=Math.max(0,srcX),iy0=Math.max(0,srcY),ix1=Math.min(base.width,srcX+srcW),iy1=Math.min(base.height,srcY+srcH);
    if(ix1>ix0&&iy1>iy0){const dx0=(ix0-srcX)/srcW*w,dy0=(iy0-srcY)/srcH*h,dw=(ix1-ix0)/srcW*w,dh=(iy1-iy0)/srcH*h;ctx.drawImage(base,ix0,iy0,ix1-ix0,iy1-iy0,dx0,dy0,dw,dh);}
  }else{
    // Fallback only while the city is loading or if the WebGL readback is unavailable.
    ctx.fillStyle='#303a43';ctx.fillRect(0,0,w,h);
  }
  const mapX=x=>cx+(x-px)*scale,mapY=z=>cy+(z-pz)*scale;
  if(worldRouteTarget){
    const tx=worldRouteTarget.x,tz=worldRouteTarget.z;
    ctx.strokeStyle='#ffd75e';ctx.lineWidth=3;ctx.lineCap='round';ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(mapX(px),mapY(pz));ctx.lineTo(mapX(tx),mapY(pz));ctx.lineTo(mapX(tx),mapY(tz));ctx.stroke();ctx.setLineDash([]);
    const dx=mapX(tx),dy=mapY(tz);ctx.fillStyle='#ffd75e';ctx.beginPath();ctx.arc(dx,dy,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#17202b';ctx.lineWidth=2;ctx.stroke();
  }
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-(worldDriving?player.h:worldYaw));ctx.fillStyle='#65e4ff';ctx.strokeStyle='#06121c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  ctx.fillStyle='#fff';ctx.font='bold 10px Arial';ctx.textAlign='left';ctx.fillText('NYC · МАРШРУТ',7,13);
}
function getCityEditorRoot(){return worldG&&worldG.userData&&worldG.userData.importedCityRoot;}
function editorKeyFor(obj){if(!obj)return null;if(obj===getCityEditorRoot())return '__city__';return obj.userData&&obj.userData.trEditorPath!=null?'city:'+obj.userData.trEditorPath:null;}
function editorObjectByKey(key){if(key==='__city__')return getCityEditorRoot();const map=window.TRModels&&window.TRModels.getEditorObjects?window.TRModels.getEditorObjects():null;return map&&key&&key.startsWith('city:')?map.get(key.slice(5)):null;}
function editRecord(obj){return {x:+obj.position.x.toFixed(3),y:+obj.position.y.toFixed(3),z:+obj.position.z.toFixed(3),sx:+obj.scale.x.toFixed(4),sy:+obj.scale.y.toFixed(4),sz:+obj.scale.z.toFixed(4)};}
function writeEditorFields(obj){if(!obj)return;const p=editRecord(obj);['x','y','z','sx','sy','sz'].forEach(k=>{const el=$('dev'+k.toUpperCase());if(el)el.value=p[k];});$('devSelected').textContent=(obj.name||'Объект')+' · '+(obj===getCityEditorRoot()?'вся карта':(obj.userData.trEditorPath||''));}
function applyEditRecord(key,rec,obj){obj=obj||editorObjectByKey(key);if(!obj||!rec)return;obj.position.set(clamp(Number(rec.x)||0,-10000,10000),clamp(Number(rec.y)||0,-10000,10000),clamp(Number(rec.z)||0,-10000,10000));obj.scale.set(clamp(Number(rec.sx)||1,.01,100),clamp(Number(rec.sy)||1,.01,100),clamp(Number(rec.sz)||1,.01,100));obj.updateMatrixWorld(true);}
function syncCityBoundsAndMiniMap(rebuildMap=false){const city=getCityEditorRoot();if(!city)return;city.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(city);worldGroundY=city.position.y-0.045;if(!b.isEmpty()){worldBounds={minX:b.min.x+3,maxX:b.max.x-3,minZ:b.min.z+3,maxZ:b.max.z-3};if(worldG&&worldG.userData)worldG.userData.importedCityBounds=Object.assign({},worldBounds);}if(rebuildMap)buildWorldMinimapBase(city);}
function applySharedWorldEdits(){if(!window.TRModels||!window.TRModels.getEditorObjects)return;let cityChanged=false;for(const [key,rec] of Object.entries(devGlobalEdits||{})){if((devDragState&&devDragState.key===key)||(devSelected&&devSelected.key===key&&!$('worldDevPanel').hidden))continue;const obj=editorObjectByKey(key);if(obj){const before=editRecord(obj);const changed=['x','y','z','sx','sy','sz'].some(k=>Math.abs(Number(before[k])-Number(rec[k]))>0.001);if(changed){applyEditRecord(key,rec,obj);if(key==='__city__')cityChanged=true;}}}if(cityChanged)syncCityBoundsAndMiniMap(true);}
function applyLocalWorldEdits(){try{devLocalEdits=JSON.parse(localStorage.getItem('tr_world_edits_local')||'{}')||{};}catch(_){devLocalEdits={};}let cityChanged=false;for(const [key,rec] of Object.entries(devLocalEdits)){const obj=editorObjectByKey(key);if(obj){const before=editRecord(obj);const changed=['x','y','z','sx','sy','sz'].some(k=>Math.abs(Number(before[k])-Number(rec[k]))>0.001);if(changed){applyEditRecord(key,rec,obj);if(key==='__city__')cityChanged=true;}}}if(cityChanged)syncCityBoundsAndMiniMap(true);}
function getWorldApiBase(){let u=String(save.set.server||SERVER_URL||'').trim();if(!u)return'';u=u.replace(/^wss:/i,'https:').replace(/^ws:/i,'http:');return u.replace(/\/+$/,'');}
async function loadSharedWorldEdits(){const base=getWorldApiBase();if(!base)return;try{const r=await fetch(base+'/api/world-edits',{cache:'no-store'});if(!r.ok)return;const data=await r.json();if(data&&data.edits&&typeof data.edits==='object'){devGlobalEdits=data.edits;devGlobalRevision=Number(data.updatedAt)||0;applySharedWorldEdits();applyLocalWorldEdits();}}catch(e){console.warn('Shared map edits unavailable',e);}}
async function pollSharedWorldEdits(){if(performance.now()-devLastPollAt<5000)return;devLastPollAt=performance.now();await loadSharedWorldEdits();}
function refreshEditorSelection(obj,key){if(!obj)return;devSelected={object:obj,key:key||editorKeyFor(obj)};writeEditorFields(obj);}
function editorRaycast(event){const canvas=$('c'),rect=canvas.getBoundingClientRect();devPointer.x=((event.clientX-rect.left)/rect.width)*2-1;devPointer.y=-((event.clientY-rect.top)/rect.height)*2+1;devRaycaster.setFromCamera(devPointer,cam);const city=getCityEditorRoot();if(!city)return null;city.updateMatrixWorld(true);const hits=devRaycaster.intersectObject(city,true);return hits.find(h=>h.object&&h.object.isMesh&&!h.object.userData.trEditorSkip)||null;}
function registerWorldEditor(){
  const panel=$('worldDevPanel'),btn=$('worldDevBtn');if(!panel||panel.dataset.bound)return;panel.dataset.bound='1';
  btn.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){$('devPass').focus();loadSharedWorldEdits();}};
  $('devClose').onclick=()=>{panel.hidden=true;devPickMode=false;devDragState=null;};
  $('devUnlock').onclick=async()=>{devPassword=$('devPass').value;const base=getWorldApiBase();let globalOK=false;try{if(!base)throw new Error('Не указан API URL сервера');const r=await fetch(base+'/api/world-edits/auth',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Pass':devPassword},body:'{}'});globalOK=r.ok;if(!r.ok)throw new Error('Пароль сервера не принят');}catch(e){console.warn(e);}
    devUnlocked=true;$('devLockRow').hidden=true;$('devControls').hidden=false;$('devStatus').textContent=globalOK?'Доступ открыт · общие изменения включены':'Локальный доступ · для всех недоступно';$('devApplyAll').disabled=!globalOK;$('devApplyAll').title=globalOK?'Изменения будут отправлены на сервер':'Нужны ADMIN_PASSWORD и правильный адрес сервера';toast(globalOK?'Редактор открыт':'Редактор открыт только для себя');};
  $('devPick').onclick=()=>{devPickMode=true;$('devStatus').textContent='Нажми на объект в городе';toast('Коснись здания или предмета');};
  $('devPickCity').onclick=()=>{const city=getCityEditorRoot();if(city)refreshEditorSelection(city,'__city__');else toast('Сначала загрузи Нью-Йорк');};
  ['X','Y','Z','SX','SY','SZ'].forEach(k=>$('dev'+k).addEventListener('change',()=>{if(!devSelected)return;const obj=devSelected.object;const rec={x:Number($('devX').value),y:Number($('devY').value),z:Number($('devZ').value),sx:Number($('devSX').value),sy:Number($('devSY').value),sz:Number($('devSZ').value)};applyEditRecord(devSelected.key,rec,obj);if(devSelected.key==='__city__')syncCityBoundsAndMiniMap(true);}));
  const collect=()=>{if(!devSelected)return null;const rec={x:Number($('devX').value),y:Number($('devY').value),z:Number($('devZ').value),sx:Number($('devSX').value),sy:Number($('devSY').value),sz:Number($('devSZ').value)};applyEditRecord(devSelected.key,rec,devSelected.object);return rec;};
  $('devApplySelf').onclick=()=>{const rec=collect();if(!rec)return toast('Сначала выбери объект');devLocalEdits[devSelected.key]=rec;localStorage.setItem('tr_world_edits_local',JSON.stringify(devLocalEdits));if(devSelected.key==='__city__')syncCityBoundsAndMiniMap(true);toast('Изменение сохранено только на этом устройстве');};
  $('devApplyAll').onclick=async()=>{const rec=collect();if(!rec)return toast('Сначала выбери объект');if(!devUnlocked||!devPassword)return toast('Сначала введи пароль разработчика');const next=Object.assign({},devGlobalEdits,{[devSelected.key]:rec});try{const r=await fetch(getWorldApiBase()+'/api/world-edits',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Pass':devPassword},body:JSON.stringify({edits:next})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Сервер отказал');devGlobalEdits=data.edits||next;devGlobalRevision=Number(data.updatedAt)||Date.now();if(devSelected.key==='__city__')syncCityBoundsAndMiniMap(true);toast('Общее изменение опубликовано для всех игроков');}catch(e){toast('Не удалось сохранить для всех: '+e.message);}};
  $('devDrag').addEventListener('change',()=>toast($('devDrag').checked?'Перетаскивание включено':'Перетаскивание выключено'));
  $('c').addEventListener('pointerdown',e=>{if(state!=='world'||panel.hidden||!devUnlocked)return;if(devPickMode){const hit=editorRaycast(e);devPickMode=false;if(hit){const obj=hit.object;refreshEditorSelection(obj,editorKeyFor(obj));toast('Выбран объект: '+(obj.name||'меш'));}else toast('Не удалось выбрать этот объект — попробуй нажать на его видимую часть');e.preventDefault();e.stopImmediatePropagation();return;}if($('devDrag').checked&&devSelected){const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-devSelected.object.position.y);const p=new THREE.Vector3();devRaycaster.setFromCamera(devPointer.set(((e.clientX/window.innerWidth)*2)-1,-((e.clientY/window.innerHeight)*2)+1),cam);if(devRaycaster.ray.intersectPlane(plane,p)){devDragState={id:e.pointerId,plane,key:devSelected.key,offset:devSelected.object.position.clone().sub(p)};e.preventDefault();e.stopImmediatePropagation();}}},true);
  $('c').addEventListener('pointermove',e=>{if(!devDragState||!devSelected||e.pointerId!==devDragState.id)return;devPointer.set(((e.clientX/window.innerWidth)*2)-1,-((e.clientY/window.innerHeight)*2)+1);devRaycaster.setFromCamera(devPointer,cam);const p=new THREE.Vector3();if(devRaycaster.ray.intersectPlane(devDragState.plane,p)){devSelected.object.position.copy(p.add(devDragState.offset));devSelected.object.updateMatrixWorld(true);writeEditorFields(devSelected.object);if(devSelected.key==='__city__')syncCityBoundsAndMiniMap(false);}e.preventDefault();},true);
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>$('c').addEventListener(type,e=>{if(devDragState&&e.pointerId===devDragState.id){const cityKey=devDragState.key==='__city__';devDragState=null;if(cityKey)syncCityBoundsAndMiniMap(true);}},true));
}
registerWorldEditor();
$('devRunCommand')?.addEventListener('click',()=>{runDeveloperCommand($('devCommand')?.value||'');if($('devConsoleLog'))$('devConsoleLog').textContent='Выполнено: '+($('devCommand')?.value||'');});
$('devCommand')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runDeveloperCommand($('devCommand').value);if($('devConsoleLog'))$('devConsoleLog').textContent='Команда: '+$('devCommand').value;}});
$('devTeleportToMark')?.addEventListener('click',()=>runDeveloperCommand('/tpmark'));
$('worldBigMapBtn')?.addEventListener('click',showWorldBigMap);$('worldBigMapClose')?.addEventListener('click',hideWorldBigMap);
$('worldBigMapCanvas')?.addEventListener('pointerdown',e=>{const c=$('worldBigMapCanvas'),r=c.getBoundingClientRect();worldMapSelectedPoint={x:worldMiniMapCenterX-worldMiniMapWorldSpan/2+((e.clientX-r.left)/r.width)*worldMiniMapWorldSpan,z:worldMiniMapCenterZ-worldMiniMapWorldSpan/2+((e.clientY-r.top)/r.height)*worldMiniMapWorldSpan};worldMapSelectedPoint.x=clamp(worldMapSelectedPoint.x,worldBounds.minX+3,worldBounds.maxX-3);worldMapSelectedPoint.z=clamp(worldMapSelectedPoint.z,worldBounds.minZ+3,worldBounds.maxZ-3);drawWorldBigMap();if($('worldMapMarkName')&&!$('worldMapMarkName').value)$('worldMapMarkName').value='Моя отметка';});
$('worldMapSaveMark')?.addEventListener('click',()=>{if(!worldMapSelectedPoint){toast('Сначала нажми на точку карты');return;}const marks=readWorldMapMarks();marks.push({id:Date.now(),name:($('worldMapMarkName')?.value||'Моя отметка').slice(0,48),x:worldMapSelectedPoint.x,z:worldMapSelectedPoint.z});saveWorldMapMarks(marks);renderWorldMapMarks();drawWorldBigMap();toast('Место сохранено на карте');});
$('worldMapRouteBtn')?.addEventListener('click',()=>{if(!worldMapSelectedPoint){toast('Нажми на место на карте');return;}worldRouteTarget={...worldMapSelectedPoint,name:($('worldMapMarkName')?.value||'Маршрут')};hideWorldBigMap();toast('Маршрут построен · он отмечен на мини-карте');});
$('worldMapMarks')?.addEventListener('click',e=>{const rb=e.target.closest('[data-map-route]'),tb=e.target.closest('[data-map-tp]');const id=Number((rb||tb)?.dataset.mapRoute||(tb&&tb.dataset.mapTp));if(!Number.isFinite(id))return;const m=readWorldMapMarks().find(v=>Number(v.id)===id);if(!m)return;if(rb){worldRouteTarget={x:m.x,z:m.z,name:m.name};hideWorldBigMap();toast('Маршрут к '+m.name+' построен');}else if(tb){if(!devUnlocked){toast('Телепорт доступен после входа в режим разработчика');return;}worldRouteTarget={x:m.x,z:m.z,name:m.name};runDeveloperCommand('/tp '+m.x+' '+m.z);}});
$('worldMiniMap').addEventListener('click',e=>{if(state!=='world'||worldInterior)return;const c=$('worldMiniMap'),r=c.getBoundingClientRect(),actor=currentWorldActor();if(!actor)return;const range=145,scale=c.width/(range*2),x=(e.clientX-r.left)/r.width*c.width,z=(e.clientY-r.top)/r.height*c.height;worldRouteTarget={x:clamp(actor.position.x+(x-c.width/2)/scale,worldBounds.minX+3,worldBounds.maxX-3),z:clamp(actor.position.z+(z-c.height/2)/scale,worldBounds.minZ+3,worldBounds.maxZ-3),name:'пользовательская точка'};toast('Маршрут установлен');});

function findSafeCitySpawn(x=0,z=0,radius=2){
  const loX=worldBounds.minX+7,hiX=worldBounds.maxX-7,loZ=worldBounds.minZ+7,hiZ=worldBounds.maxZ-7;
  const city=worldG&&worldG.userData&&worldG.userData.importedCityRoot;
  const meshes=window.TRModels&&window.TRModels.getCityMeshes?window.TRModels.getCityMeshes():[];
  if(!city||!meshes||!meshes.length)return{x:clamp(x,loX,hiX),z:clamp(z,loZ,hiZ)};
  const top=(city.userData.importedBounds?.maxY||city.userData.importedBounds?.max?.y||worldGroundY+260)+20;
  const pts=[{x,z}];
  for(let r=5;r<=100;r+=5)for(let a=0;a<Math.PI*2;a+=Math.PI/4)pts.push({x:x+Math.cos(a)*r,z:z+Math.sin(a)*r});
  const ray=new THREE.Raycaster();
  for(const q of pts){const cx=clamp(q.x,loX,hiX),cz=clamp(q.z,loZ,hiZ);ray.set(new THREE.Vector3(cx,top,cz),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=top-worldGroundY+10;const hits=ray.intersectObjects(meshes,false).filter(h=>h.point.y>=worldGroundY-0.6);if(hits.length&&hits[0].point.y>worldGroundY+2.2)continue;
    let occupied=false;for(const [dx,dz] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){ray.set(new THREE.Vector3(cx,worldGroundY+1.1,cz),new THREE.Vector3(dx||0,dz?0:0,dz||0).normalize());ray.near=0.05;ray.far=Math.max(0.3,radius*1.15);const wh=ray.intersectObjects(meshes,false).find(h=>h.point.y>worldGroundY-.1&&h.point.y<worldGroundY+2.3);if(wh){occupied=true;break;}}
    if(!occupied)return{x:cx,z:cz};
  }
  return{x:clamp(x,loX,hiX),z:clamp(z,loZ,hiZ)};
}
function createWorldEdgeFence(bounds){
  if(!worldG||worldG.userData.trEdgeFenceAdded)return;
  const group=new THREE.Group();group.name='TR New York world boundary fence';group.userData.trCustomAddon=true;group.userData.trEditorSkip=true;
  const x0=bounds.minX+0.65,x1=bounds.maxX-0.65,z0=bounds.minZ+0.65,z1=bounds.maxZ-0.65,step=9;
  const posts=[],rails=[];
  function edge(ax,az,bx,bz){const len=Math.hypot(bx-ax,bz-az),n=Math.ceil(len/step);for(let i=0;i<=n;i++){const t=i/n;posts.push([ax+(bx-ax)*t,az+(bz-az)*t]);}for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n;const a={x:ax+(bx-ax)*t0,z:az+(bz-az)*t0},b={x:ax+(bx-ax)*t1,z:az+(bz-az)*t1};rails.push({a,b});}}
  edge(x0,z0,x1,z0);edge(x1,z0,x1,z1);edge(x1,z1,x0,z1);edge(x0,z1,x0,z0);
  const mat=new THREE.MeshStandardMaterial({color:0x626d78,metalness:0.72,roughness:0.45});
  const postGeo=new THREE.CylinderGeometry(0.055,0.065,2.3,6),postMesh=new THREE.InstancedMesh(postGeo,mat,posts.length),dummy=new THREE.Object3D();
  posts.forEach((q,i)=>{dummy.position.set(q[0],1.15,q[1]);dummy.updateMatrix();postMesh.setMatrixAt(i,dummy.matrix);});postMesh.instanceMatrix.needsUpdate=true;group.add(postMesh);
  const rodGeo=new THREE.CylinderGeometry(0.025,0.025,1,5),rodMat=mat.clone(),rodMesh=new THREE.InstancedMesh(rodGeo,rodMat,rails.length*3);let ri=0;
  for(const r of rails){const a=r.a,b=r.b,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),dir=new THREE.Vector3(dx,0,dz).normalize();for(const y of [0.35,0.95,1.55]){dummy.position.set((a.x+b.x)/2,y,(a.z+b.z)/2);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);dummy.scale.set(1,len,1);dummy.updateMatrix();rodMesh.setMatrixAt(ri++,dummy.matrix);}}
  rodMesh.instanceMatrix.needsUpdate=true;group.add(rodMesh);worldG.add(group);worldG.userData.trEdgeFenceAdded=true;
}
function readWorldMapMarks(){try{const v=JSON.parse(localStorage.getItem('tr_world_map_marks_v1')||'[]');return Array.isArray(v)?v:[];}catch(_){return[];}}
function saveWorldMapMarks(m){try{localStorage.setItem('tr_world_map_marks_v1',JSON.stringify(m.slice(-80)));}catch(_){toast('Не удалось сохранить отметку на устройстве');}}
function drawWorldBigMap(){
 const canvas=$('worldBigMapCanvas');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#1d2933';ctx.fillRect(0,0,canvas.width,canvas.height);
 if(worldMiniMapBaseCanvas)ctx.drawImage(worldMiniMapBaseCanvas,0,0,canvas.width,canvas.height);else{ctx.fillStyle='#293945';ctx.fillRect(0,0,canvas.width,canvas.height);}
 const span=worldMiniMapWorldSpan||500,cx=worldMiniMapCenterX,cz=worldMiniMapCenterZ;
 const mapX=x=>(x-(cx-span/2))/span*canvas.width,mapY=z=>(z-(cz-span/2))/span*canvas.height;
 for(const m of readWorldMapMarks()){const x=mapX(m.x),y=mapY(m.z);ctx.fillStyle='#ffd44f';ctx.strokeStyle='#111b22';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font='bold 16px Arial';ctx.fillStyle='#fff';ctx.strokeStyle='#17212a';ctx.lineWidth=3;ctx.strokeText(m.name||'Отметка',x+11,y+5);ctx.fillText(m.name||'Отметка',x+11,y+5);}
 if(worldRouteTarget){ctx.strokeStyle='#ffe16b';ctx.lineWidth=4;ctx.setLineDash([10,6]);ctx.beginPath();const actor=currentWorldActor();if(actor){ctx.moveTo(mapX(actor.position.x),mapY(actor.position.z));ctx.lineTo(mapX(worldRouteTarget.x),mapY(worldRouteTarget.z));}ctx.stroke();ctx.setLineDash([]);}
 const a=currentWorldActor();if(a){ctx.fillStyle='#50ebff';ctx.beginPath();ctx.arc(mapX(a.position.x),mapY(a.position.z),7,0,Math.PI*2);ctx.fill();}
}
function renderWorldMapMarks(){const el=$('worldMapMarks');if(!el)return;el.innerHTML=readWorldMapMarks().map(m=>`<div class="world-map-mark"><span>📍 ${String(m.name||'Отметка').replace(/[<>]/g,'')}</span><button class="btn" data-map-route="${m.id}">Маршрут</button><button class="btn" data-map-tp="${m.id}">Телепорт</button></div>`).join('')||'<p class="sub">Пока нет отметок. Нажми на карту и сохрани место.</p>';}
function showWorldBigMap(){const el=$('worldBigMapOverlay');if(!el)return;el.hidden=false;worldMapSelectedPoint=null;drawWorldBigMap();renderWorldMapMarks();}
function hideWorldBigMap(){const el=$('worldBigMapOverlay');if(el)el.hidden=true;}
function runDeveloperCommand(raw){if(!devUnlocked){toast('Сначала открой панель разработчика');return;}const txt=String(raw||'').trim().toLowerCase();const parts=txt.split(/\s+/);const cmd=parts[0];
 if(cmd==='/ghost'){worldGhostMode=!worldGhostMode;if(worldGhostMode)worldFlyMode=false;toast('Ghost '+(worldGhostMode?'включён':'выключен'));return;}
 if(cmd==='/fly'){worldFlyMode=!worldFlyMode;if(worldFlyMode)worldGhostMode=true;else worldGhostMode=false;toast('Fly '+(worldFlyMode?'включён':'выключен'));return;}
 if(cmd==='/tp'||cmd==='/teleport'){let x=Number(parts[1]),z=Number(parts[2]);if(!Number.isFinite(x)||!Number.isFinite(z)){toast('Формат: /tp X Z');return;}x=clamp(x,worldBounds.minX+7,worldBounds.maxX-7);z=clamp(z,worldBounds.minZ+7,worldBounds.maxZ-7);const safe=window.TRModels&&worldG?.userData?.importedCityActive?findSafeCitySpawn(x,z,worldDriving?2.2:0.5):{x,z};const a=currentWorldActor();if(!a)return;a.position.set(safe.x,worldGroundY+10,safe.z);if(worldDriving){player.speed=0;player.vx=0;player.vz=0;worldFallState.car={vy:0,grounded:false};}else worldFallState.character={vy:0,grounded:false};toast('Телепорт: '+Math.round(safe.x)+', '+Math.round(safe.z));return;}
 if(cmd==='/tpmark'){if(!worldRouteTarget){toast('Сначала построй маршрут на карте');return;}runDeveloperCommand('/tp '+worldRouteTarget.x+' '+worldRouteTarget.z);return;}
 toast('Команды: /ghost, /fly, /tp X Z, /tpmark');
}

function activateImportedNewYork(){
  if(!window.TRModels||!worldG||worldRegionId!=='newyork'||worldG.userData.importedCityActive)return;
  const city=window.TRModels.createCityInstance();if(!city)return;
  // Keep only genuinely moving actors from the placeholder blockout. Static buildings,
  // placeholder roads and the legacy districts are hidden and never collide.
  const keep=new Set([...worldPedestrians.map(r=>r.mesh),...worldTraffic.map(r=>r.mesh)]);
  const ib=city.userData.importedBounds||{minX:-540,maxX:540,minZ:-440,maxZ:440};
  worldG.children.slice().forEach(child=>{
    // The imported New York GLB is the only static city. Physically remove and dispose
    // every legacy blockout road/building/landmark so it cannot render, collide, or
    // waste phone memory. Keep only moving actors and deliberately-added extras.
    if(keep.has(child)||child.userData.trCustomAddon)return;
    disposeWorldGroup(child);
  });
  worldG.userData.winMat=null;
  city.userData.trSharedAsset=true;city.userData.importedNYCity=true;city.name='Imported New York City';
  // A real, invisible walkable floor at y=0 prevents the player/car from falling through
  // the visual ground. It is not part of the selectable city geometry.
  const floorScaleX=Math.max(0.01,Math.abs(city.scale.x)),floorScaleZ=Math.max(0.01,Math.abs(city.scale.z)),floorScaleY=Math.max(0.01,Math.abs(city.scale.y));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1,((ib.maxX??ib.max.x)-(ib.minX??ib.min.x)+8)/floorScaleX),Math.max(1,((ib.maxZ??ib.max.z)-(ib.minZ??ib.min.z)+8)/floorScaleZ)),new THREE.MeshBasicMaterial({color:0xffffff,colorWrite:false,depthWrite:false,side:THREE.DoubleSide}));
  floor.name='TR Walkable floor collider';floor.rotation.x=-Math.PI/2;floor.position.y=-0.045/floorScaleY;floor.userData.trEditorSkip=true;city.add(floor);
  worldG.add(city);worldG.visible=true;worldG.userData.importedCityActive=true;worldG.userData.importedCityRoot=city;
  city.updateMatrixWorld(true);syncCityBoundsAndMiniMap(false);
  player.mesh.position.set(9,worldGroundY+10,8);player.mesh.speed=0;player.speed=0;player.vx=0;player.vz=0;worldFallState.car={vy:0,grounded:false};
  if(charMesh){charMesh.position.set(9,worldGroundY+10,1.8);charMesh.visible=!worldDriving;worldFallState.character={vy:0,grounded:false};}
  const b=city.userData.importedBounds||new THREE.Box3().setFromObject(city);
  worldBounds={minX:(b.minX??b.min.x)+3,maxX:(b.maxX??b.max.x)-3,minZ:(b.minZ??b.min.z)+3,maxZ:(b.maxZ??b.max.z)-3};
  worldG.userData.importedCityBounds=Object.assign({},worldBounds);
  createWorldEdgeFence(worldBounds);
  const safeStart=findSafeCitySpawn(0,0,2.4);player.mesh.position.set(safeStart.x,worldGroundY+10,safeStart.z);player.mesh.rotation.set(0,0,0);player.h=0;player.speed=0;player.vx=0;player.vz=0;worldFallState.car={vy:0,grounded:false};
  if(charMesh){const safePed=findSafeCitySpawn(safeStart.x-3,safeStart.z,0.5);charMesh.position.set(safePed.x,worldGroundY+10,safePed.z);charMesh.rotation.y=0;charMesh.visible=!worldDriving;worldFallState.character={vy:0,grounded:false};}
  worldInteractables=worldInteractables.filter(it=>(it.type==='raceboard'||it.type==='plaza')&&it.x>worldBounds.minX+8&&it.x<worldBounds.maxX-8&&it.z>worldBounds.minZ+8&&it.z<worldBounds.maxZ-8);
  // Do not turn the bounding box of a whole grouped building mesh into a giant wall.
  // Actual city triangles and the visible, separately-created service/signal meshes
  // are the only obstacles tested; hidden legacy scenery never collides.
  worldBuildings=[];
  if(window.TRModels&&window.TRModels.registerCityCollision){for(const child of worldG.children){if(!child.visible||!(child.userData.trKeepInImportedCity||child.userData.keepForNY))continue;child.traverse(o=>{if(o.isMesh&&o.visible)window.TRModels.registerCityCollision(o);});}}
  applySharedWorldEdits();applyLocalWorldEdits();syncCityBoundsAndMiniMap(false);buildWorldMinimapBase(city);
  $('worldMiniMap').hidden=false;
  toast('Нью-Йорк загружен · коллизии проверяются по геометрии объектов');
}
function currentWorldActor(){return worldDriving?player.mesh:charMesh;}
function worldPos(){const a=currentWorldActor();return a?a.position:new THREE.Vector3();}
function startOpenWorld(regionId=worldRegionId){
  if(!save.set.tutorialComplete&&!tutorialPermitStart){pendingTutorialRegion=regionId||'newyork';const panel=$('tutorialOverlay');if(panel){panel.hidden=false;return;}}
  tutorialPermitStart=false;requestGameFullscreen();worldRegionId='newyork';const cfg=WORLD_REGIONS.newyork;
  held.clear();worldGhostMode=false;worldFlyMode=false;worldEnteringCar=false;worldEnterCarTimer=0;buildOpenWorld('newyork');state='world';worldInterior=false;worldDriving=false;worldJumpRemaining=0;worldJumpCooldown=0;worldJumpWasHeld=false;worldCamMode=2;worldCamOrbitYaw=0;worldCamOrbitPitch=0;worldLookDrag=null;worldNear=null;worldCollisionTimer=0;
  if(trackG)trackG.visible=false;worldG.visible=false;apartmentG.visible=false;if(schoolG)schoolG.visible=false;activeInteriorG=null;
  if($('worldLoading')){$('worldLoading').hidden=false;$('worldLoadingText').textContent='Загружаем карту Нью-Йорка и оптимизированные текстуры…';}
  if(window.TRModels){window.TRModels.ensureCity().then(()=>{
    if(state!=='world'||worldRegionId!=='newyork')return;
    if(window.TRModels.createCityInstance){activateImportedNewYork();if(worldG.userData.importedCityActive){setCityLoadProgress(100,'Готово!');$('worldLoading').hidden=true;worldG.visible=true;}}
    if(!worldG.userData.importedCityActive){worldG.visible=false;worldBuildings=[];$('worldLoading').hidden=true;toast('Нью-Йорк не загрузился. Старая карта и её коллизии отключены — проверь файлы new_york_city*.glb.gz.');}
  });}else{$('worldLoading').hidden=true;}
  if(!worldKeepAtmo){worldTime='Вечер';worldWeather='Ясно';}worldKeepAtmo=false;applyWorldAtmosphere();ensureWorldAtmoButtons();
  clearRemotes();ais.forEach(a=>{scene.remove(a.mesh);disposeModel(a.mesh);});ais=[];
  if(charMesh){scene.remove(charMesh);disposeModel(charMesh);}charMesh=makeWorldPedestrian(save.char.g,save.char.col,save.char.skin);charMesh.userData.playerPed=true;charMesh.position.set(9,10,1.8);charMesh.rotation.y=0;scene.add(charMesh);if(window.TRModels&&window.TRModels.registerWorldCharacter)window.TRModels.registerWorldCharacter(charMesh);worldYaw=0;
  player.mesh.position.set(9,10,8);player.mesh.rotation.set(0,0,0);player.h=0;player.mesh.visible=true;player.speed=0;player.vx=0;player.vz=0;player.dmg=save.cars[save.cur]?.dmg||0;player.immobilized=player.dmg>=100;phys=physFor(save.cur);applyDamageVisual();
  worldFallState={character:{vy:0,grounded:false},car:{vy:0,grounded:false}};
  show(null);$('hud').hidden=true;$('minimap').hidden=true;$('worldHud').hidden=false;$('worldPhone').hidden=true;$('worldShop').hidden=true;$('worldMiniMap').hidden=false;$('worldDevPanel').hidden=true;$('touch').hidden=!isTouch;$('fixBtn').hidden=true;$('worldLocation').textContent=cfg.welcome+' · СВОБОДНАЯ ЕЗДА';$('worldActionHint').textContent=isTouch?'Двигайся кнопками · проведи пальцем по пустой области, чтобы повернуть камеру':'WASD — движение · перетащи мышь по сцене, чтобы повернуть камеру · E — действие';Snd.music('menu');applyTouchSettings();updateWorldCameraLabel();toast('Нью-Йорк · город загружается');
  loadSharedWorldEdits();
}
function updateWorldCameraLabel(){const labels=['1-е лицо','2-е лицо · плечо','3-е лицо'];$('worldCamBtn').textContent='Камера: '+labels[worldCamMode];}
function cycleWorldCamera(){worldCamMode=(worldCamMode+1)%3;updateWorldCameraLabel();toast('Камера: '+['от первого лица','с плеча','от третьего лица'][worldCamMode]);}
function openWorldPhone(tab='home'){$('worldPhone').hidden=false;renderWorldPhone(tab);}
function closeWorldPhone(){$('worldPhone').hidden=true;}
function renderWorldPhone(tab='home'){
  const el=$('worldPhoneContent'),p=worldPos(),loc=worldInterior?'Квартира':Math.hypot(p.x,p.z)<100?'Центр города':p.x<0?'Западный район':'Восточный район';
  if(tab==='map')el.innerHTML=`<h2>Карта · ${(WORLD_REGIONS[worldRegionId]||WORLD_REGIONS.tashkent).name}</h2><p>Ты находишься: <b>${loc}</b></p><div class="card"><b>🏠 Апартаменты</b><div class="muted">${worldRegionId==='tashkent'?'Катта Чиланзар 1, дом 11А, подъезд 4 · X −126 / Z −40':'Запад, около X −50 / Z −25'}</div></div><div class="card"><b>🛠 AUTO LAB</b><div class="muted">Восток, около X 150 / Z 20</div></div><div class="card"><b>🏁 Городской клуб</b><div class="muted">Рядом с центральным перекрёстком</div></div><p>В городе можно свободно ходить, садиться в свою машину, посещать магазины и запускать заезды.</p>`;
  else if(tab==='services')el.innerHTML=`<h2>Сервисы</h2><div class="phone-metric"><div><b>${Math.round(save.coins).toLocaleString('ru-RU')}</b><span>монет на счету</span></div><div><b>${Math.round(player.dmg)}%</b><span>повреждение машины</span></div></div><div class="card"><b>Эвакуатор и механик</b><p>Вызвать сервис, сбросить критическую поломку или заказать ремонт.</p><button class="btn" data-phone-action="tow">Вызвать эвакуатор · 600</button></div><div class="card"><b>Автосервис</b><p>Улучшить двигатель, ускорение и нитро за игровые монеты.</p><button class="btn" data-phone-action="garage">Открыть магазин тюнинга</button></div><div class="card"><b>🚕 Городское такси</b><p>Вызови такси, чтобы быстро добраться к городской точке.</p><button class="btn" data-phone-action="taxi">Вызвать такси · 150</button></div>`;
  else if(tab==='social'){renderSocialFeed();void refreshSocialFeed();return;}
  else if(tab==='events')el.innerHTML=`<h2>События</h2><div class="card"><b>🏁 Уличный спринт</b><p>Короткий заезд против соперников, которые ускоряются, используют нитро и пытаются объезжать ловушки.</p><button class="btn" data-phone-action="race">Начать заезд</button></div><div class="card"><b>🏆 Турниры</b><p>Открывай турниры в главном меню: дождевой кубок, дрифт, марафон и Hyper League.</p><button class="btn" data-phone-action="menu-tours">Список турниров</button></div>`;
  else el.innerHTML=`<h2>Добро пожаловать</h2><p>Город открыт для исследования. Жители гуляют, машут руками, прыгают от радости, читают телефон и реагируют на твою машину.</p><div class="phone-metric"><div><b>${Math.round(save.coins).toLocaleString('ru-RU')}</b><span>баланс · монеты</span></div><div><b>${Math.round(player.dmg)}%</b><span>состояние авто</span></div></div><div class="card"><b>Подсказки</b><p>WASD — ходить/ехать · E — взаимодействие · V — смена камеры · P — телефон · Esc — в меню.</p></div><button class="btn" data-phone-action="tow">Эвакуатор / ремонт</button><button class="btn" data-phone-action="race">Быстрый уличный заезд</button>`;
}
$('worldPhoneContent').addEventListener('click',e=>{const b=e.target.closest('[data-travel]');if(b)travelTo(b.dataset.travel);});
$('worldPhoneBtn').onclick=()=>openWorldPhone('home');$('worldPhoneClose').onclick=closeWorldPhone;
$('worldRadioBtn')?.addEventListener('click',()=>{if(state!=='world')return;if(!worldDriving){toast('Сначала садись в машину, чтобы слушать радио');return;}Snd.init();let info=Snd.radioInfo();if(info.on&&info.index>=2){Snd.toggleRadio();radioStationIndex=-1;$('worldRadioBtn').textContent='📻 Включить радио';toast('Радио выключено');}else if(!info.on){if(info.index!==0){while(Snd.radioInfo().index!==0)Snd.nextRadio();}const r=Snd.toggleRadio();radioStationIndex=0;$('worldRadioBtn').textContent='📻 '+r.name;toast('Радио: '+r.name);}else{const name=Snd.nextRadio();radioStationIndex=Snd.radioInfo().index;$('worldRadioBtn').textContent='📻 '+name;toast('Радио: '+name);}});
$('worldPhoneContent').addEventListener('click',e=>{const publish=e.target.closest('[data-social-publish]');if(publish){publishWorldPhoto();return;}const like=e.target.closest('[data-social-like]');if(like){void likeSocialPost(Number(like.dataset.socialLike));return;}const comment=e.target.closest('[data-social-comment]');if(comment){const id=Number(comment.dataset.socialComment),field=document.querySelector(`[data-social-comment-input="${id}"]`),txt=(field?.value||'').trim();if(txt)void commentSocialPost(id,txt);return;}});
$('worldPhoneContent').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-social-comment-input]')){const id=e.target.getAttribute('data-social-comment-input'),btn=document.querySelector(`[data-social-comment="${id}"]`);if(btn)btn.click();}});$('worldCamBtn').onclick=cycleWorldCamera;$('worldExitBtn').onclick=toMenu;$('worldInteractBtn').onclick=interactWorld;$('worldPhone').addEventListener('click',e=>{const t=e.target.closest('[data-phone-tab]');if(t){renderWorldPhone(t.dataset.phoneTab);return;}const a=e.target.closest('[data-phone-action]');if(!a)return;const act=a.dataset.phoneAction;if(act==='taxi'){if(save.coins<150){toast('Не хватает 150 монет на такси');return;}save.coins-=150;store();closeWorldPhone();toast('🚕 Такси едет к тебе…');setTimeout(()=>{if(state!=='world')return;const dest=worldRouteTarget||{x:0,z:0,name:'центр города'};const tx=clamp(dest.x,worldBounds.minX+8,worldBounds.maxX-8),tz=clamp(dest.z,worldBounds.minZ+8,worldBounds.maxZ-8);player.mesh.position.set(tx,worldGroundY,tz);player.speed=0;worldFallState.car={vy:0,grounded:true};if(charMesh){charMesh.position.set(tx-2,worldGroundY,tz-2);charMesh.visible=!worldDriving;worldFallState.character={vy:0,grounded:true};}worldRouteTarget={x:0,z:0,name:'Центр города'};toast('🚕 Такси доставило к '+(dest.name||'месту назначения'));},1200);return;}else if(act==='tow'){if(save.coins<600){toast('Не хватает 600 монет на выезд механика');return;}save.coins-=600;setDamage(Math.max(0,player.dmg-45));player.immobilized=false;player.engineStall=0;player.speed=0;player.mesh.position.set(9,worldGroundY,8);worldFallState.car={vy:0,grounded:true};store();renderWorldPhone('services');toast('Механик прибыл: восстановлено 45% прочности');}else if(act==='garage'){closeWorldPhone();openWorldShop('garage');}else if(act==='race'){closeWorldPhone();toMenu();setTimeout(startCareer,20);}else if(act==='menu-tours'){closeWorldPhone();toMenu();setTimeout(()=>openScreen('tour'),20);}});
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
    else if(act==='style'){cost=2500;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;save.style[save.cur]=((save.style[save.cur]||0)+1)%STYLE_SHAPES.length;showCar(save.cur);player.mesh.position.set(9,worldGroundY,8);player.mesh.visible=!worldDriving;}
    else if(act==='neon'){cost=1800;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;save.neon[save.cur]=save.neon[save.cur]===false;showCar(save.cur);player.mesh.position.set(9,worldGroundY,8);player.mesh.visible=!worldDriving;}
    else if(act==='repair-kit'){cost=500;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;setDamage(Math.max(0,player.dmg-20));player.immobilized=player.dmg>=100;}
    else if(act==='snack'){cost=150;if(save.coins<cost){toast('Недостаточно монет');return;}save.coins-=cost;toast('Вкусный перерыв!');}
    else if(act==='event'){ $('worldShop').hidden=true;closeWorldPhone();toMenu();setTimeout(startCareer,20);return;}
    store();refreshMenu();$('coins').textContent=save.coins;openWorldShop(kind);toast('Покупка выполнена');
  };
}
$('worldShopClose').onclick=()=>{$('worldShop').hidden=true;};
function replaceWorldPlayer(){if(!charMesh)return;const p=charMesh.position.clone(),r=charMesh.rotation.y;scene.remove(charMesh);disposeModel(charMesh);charMesh=makeWorldPedestrian(save.char.g,save.char.col,save.char.skin);charMesh.userData.playerPed=true;charMesh.position.copy(p);charMesh.rotation.y=r;scene.add(charMesh);if(window.TRModels&&window.TRModels.registerWorldCharacter)window.TRModels.registerWorldCharacter(charMesh);}
function enterApartment(){
  worldCarVisibleBeforeInterior=!!player.mesh.visible;
  worldInterior=true;worldJumpRemaining=0;worldJumpWasHeld=held.has('drift');if(charMesh)charMesh.position.y=0;worldG.visible=false;apartmentG.visible=true;activeInteriorG=apartmentG;interiorExit={x:-50,z:-23};
  charMesh.position.set(-2,0,2);charMesh.rotation.y=Math.PI;
  player.mesh.visible=false;worldLookDrag=null;
  $('worldLocation').textContent='МОЯ КВАРТИРА · ГОСТИНАЯ';toast('Ты дома. Нажми E у двери, чтобы выйти.');
}
function leaveApartment(){
  worldInterior=false;worldJumpRemaining=0;worldJumpWasHeld=held.has('drift');if(charMesh)charMesh.position.y=0;(activeInteriorG||apartmentG).visible=false;activeInteriorG=null;worldG.visible=true;
  charMesh.position.set(interiorExit.x,0,interiorExit.z);charMesh.rotation.y=Math.PI;worldYaw=Math.PI;
  // Restore the parked car's previous visibility; otherwise entering/leaving home made the car disappear.
  player.mesh.visible=worldCarVisibleBeforeInterior;worldLookDrag=null;
  $('worldLocation').textContent='ЗАПАДНЫЙ РАЙОН · АПАРТАМЕНТЫ';
}
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
  if(worldDriving && target.type!=='car'){toast('Сначала выйди из машины, чтобы взаимодействовать');return;}
  if(target.type==='apartment'){enterApartment();if(target.exit)interiorExit=target.exit;return;}
  if(target.type==='airport'){openAirportMenu();return;}
  if(target.type==='school'){enterSchool(target);return;}
  if(target.type==='market'||target.type==='garage'||target.type==='fashion'){openWorldShop(target.type);return;}
  if(target.type==='car'){
    if(!worldDriving){if(worldEnteringCar)return;worldEnteringCar=true;worldEnterCarTimer=0.72;if(window.TRModels&&window.TRModels.playCharacterAction)window.TRModels.playCharacterAction('EnterCar',0.72,charMesh);toast('Садишься в машину…');}
    else{worldDriving=false;charMesh.visible=true;charMesh.position.set(player.mesh.position.x-Math.cos(player.h)*3,worldGroundY,player.mesh.position.z+Math.sin(player.h)*3);worldFallState.character={vy:0,grounded:true};worldYaw=player.h;player.mesh.visible=true;player.speed=0;applyTouchSettings();toast('Ты вышел из машины. E — снова сесть.');}
    return;
  }
  if(target.type==='npc'){const rec=target.rec;rec.waveT=2.4;rec.jumpT=Math.random()<0.45?0.7:0;toast(rec.name+': «'+WORLD_LINES[Math.floor(Math.random()*WORLD_LINES.length)]+'»');return;}
  if(target.type==='raceboard'||target.type==='plaza'){openWorldPhone('events');return;}
}
function stepWorldFall(actor,key,dt){
  if(!actor||!worldFallState[key]||worldInterior)return;
  const f=worldFallState[key];
  if(f.grounded){actor.position.y=worldGroundY;return;}
  f.vy-=25*dt;actor.position.y+=f.vy*dt;
  if(actor.position.y<=worldGroundY){actor.position.y=worldGroundY;f.vy=0;f.grounded=true;}
}
let lastCityCollisionWeight=1;
function cityWallHit(ax,az,bx,bz,radius,y=1.0){
  lastCityCollisionWeight=1;const city=worldG&&worldG.userData&&worldG.userData.importedCityActive;
  if(!city||!window.TRModels||!window.TRModels.getCityMeshes)return false;
  const meshes=window.TRModels.getCityMeshes();if(!meshes||!meshes.length)return false;
  const dx=bx-ax,dz=bz-az,dist=Math.hypot(dx,dz);if(dist<0.025)return false;
  const perpX=-dz/dist,perpZ=dx/dist;
  for(const offset of [0, radius*0.62, -radius*0.62]){
    const rayY=worldGroundY+y;cityWallRay.set(new THREE.Vector3(ax+perpX*offset,rayY,az+perpZ*offset),new THREE.Vector3(dx/dist,0,dz/dist));cityWallRay.near=0.02;cityWallRay.far=dist+radius*0.3;
    const hits=cityWallRay.intersectObjects(meshes,false);
    const hit=hits.find(h=>h.distance<=dist+radius*0.3&&h.point.y>worldGroundY-0.1&&h.point.y<worldGroundY+2.7);if(hit){try{const box=new THREE.Box3().setFromObject(hit.object),size=box.getSize(new THREE.Vector3());lastCityCollisionWeight=clamp(Math.max(size.x,size.y,size.z)/5,0.12,1.15);}catch(_){lastCityCollisionWeight=1;}return true;}
  }
  return false;
}
function resolveCityMotion(oldX,oldZ,newX,newZ,radius,isCar){
  if(!(worldG&&worldG.userData&&worldG.userData.importedCityActive))return{x:newX,z:newZ,hit:false};
  if(!cityWallHit(oldX,oldZ,newX,newZ,radius,isCar?0.9:1.0))return{x:newX,z:newZ,hit:false,weight:0};
  const hitWeight=lastCityCollisionWeight;
  // Slide along walls rather than trapping the actor in an oversized rectangle.
  const xFree=!cityWallHit(oldX,oldZ,newX,oldZ,radius,isCar?0.9:1.0);
  const zFree=!cityWallHit(oldX,oldZ,oldX,newZ,radius,isCar?0.9:1.0);
  if(xFree&&!zFree)return{x:newX,z:oldZ,hit:true,weight:hitWeight};
  if(zFree&&!xFree)return{x:oldX,z:newZ,hit:true,weight:hitWeight};
  if(xFree&&zFree){const dx=Math.abs(newX-oldX),dz=Math.abs(newZ-oldZ);return dx>dz?{x:newX,z:oldZ,hit:true,weight:hitWeight}:{x:oldX,z:newZ,hit:true,weight:hitWeight};}
  return{x:oldX,z:oldZ,hit:true,weight:hitWeight};
}
function updateOpenWorld(dt){
  if($('worldPhone').hidden===false||$('worldShop').hidden===false)return;
  // Do not let movement collide with invisible placeholder buildings while the GLB is loading.
  if(worldRegionId==='newyork'&&!(worldG&&worldG.userData&&worldG.userData.importedCityActive))return;
  worldAnimT+=dt;worldCollisionTimer=Math.max(0,worldCollisionTimer-dt);
  if(worldEnteringCar){worldEnterCarTimer-=dt;if(worldEnterCarTimer<=0){worldEnteringCar=false;worldDriving=true;worldYaw=player.h;player.mesh.visible=true;if(charMesh)charMesh.visible=false;applyTouchSettings();toast('Ты за рулём. WASD — управление, E — выйти.');}}
  if(!worldInterior&&!worldFlyMode){stepWorldFall(charMesh,'character',dt);stepWorldFall(player.mesh,'car',dt);}
  worldJumpCooldown=Math.max(0,worldJumpCooldown-dt);
  const jumpHeld=held.has('drift');
  if(!worldDriving&&!worldInterior&&!worldFlyMode&&jumpHeld&&!worldJumpWasHeld&&worldJumpCooldown<=0){worldJumpRemaining=0.62;worldJumpCooldown=0.88;if(window.TRModels&&window.TRModels.playCharacterAction)window.TRModels.playCharacterAction('Jump',0.62,charMesh);}
  worldJumpWasHeld=jumpHeld;
  if(charMesh){
    if(worldJumpRemaining>0&&!worldInterior&&!worldDriving&&worldFallState.character.grounded){worldJumpRemaining=Math.max(0,worldJumpRemaining-dt);charMesh.position.y=worldGroundY+Math.sin((0.62-worldJumpRemaining)/0.62*Math.PI)*0.78;}
    else {if(worldInterior||worldDriving)worldJumpRemaining=0;if(worldInterior)charMesh.position.y=0;else if(worldFallState.character.grounded)charMesh.position.y=worldGroundY;}
  }
  if(!worldInterior){
    for(const rec of worldPedestrians){
      const p=rec.mesh,near=worldDriving?Math.hypot(player.mesh.position.x-p.position.x,player.mesh.position.z-p.position.z):charMesh?Math.hypot(charMesh.position.x-p.position.x,charMesh.position.z-p.position.z):999;
      rec.phase+=dt*rec.walk;
      rec.nextCheer-=dt;if(near<20&&rec.nextCheer<=0){rec.waveT=1.8+Math.random()*1.8;rec.jumpT=Math.random()<0.58?0.55:0;rec.nextCheer=3+Math.random()*6;if(Math.random()<0.58 && Snd.crowd) Snd.crowd();}
      rec.waveT=Math.max(0,rec.waveT-dt);rec.jumpT=Math.max(0,rec.jumpT-dt);
      p.position.x=rec.centerX+(rec.axis==='x'?Math.sin(rec.phase)*rec.amp:Math.sin(rec.phase*.42)*1.2);
      p.position.z=rec.centerZ+(rec.axis==='z'?Math.cos(rec.phase)*rec.amp:Math.cos(rec.phase*.42)*1.2);
      if(rec.axis==='x')p.rotation.y=Math.cos(rec.phase)>=0?Math.PI/2:-Math.PI/2;else p.rotation.y=Math.sin(rec.phase)>=0?0:Math.PI;
      const u=p.userData;u.legs[0].rotation.x=Math.sin(rec.phase*2)*0.5;u.legs[1].rotation.x=-Math.sin(rec.phase*2)*0.5;u.arms[0].rotation.x=-Math.sin(rec.phase*2)*0.38;u.arms[1].rotation.x=Math.sin(rec.phase*2)*0.38;
      const cheering=near<22||rec.waveT>0;u.arms[0].rotation.z=cheering?1.9+Math.sin(worldAnimT*8+rec.phase)*0.28:Math.sin(rec.phase*2)*0.18;u.arms[1].rotation.z=rec.waveT>0?-1.8+Math.sin(worldAnimT*9+rec.phase)*0.2:-Math.sin(rec.phase*2)*0.18;
      p.position.y=rec.jumpT>0?Math.sin((1-rec.jumpT/.7)*Math.PI)*0.85:0;
      if(u.bodyGroup){u.bodyGroup.position.y=Math.abs(Math.sin(rec.phase*2))*0.022;u.bodyGroup.rotation.z=cheering?Math.sin(worldAnimT*3+rec.phase)*0.025:Math.sin(rec.phase)*0.008;}
    }
    for(const car of worldTraffic){car.x+=car.speed*car.dir*dt;if(car.x>WORLD_RANGE)car.x=-WORLD_RANGE;if(car.x< -WORLD_RANGE)car.x=WORLD_RANGE;car.mesh.position.set(car.x,0,car.z);car.mesh.userData.wheels.forEach(w=>w.rotation.x+=car.speed*dt/0.4);(car.mesh.userData.externalWheels||[]).forEach(w=>w.rotation.x+=car.speed*dt/0.4);}
  }
  const actor=worldDriving?player.mesh:charMesh;if(!actor)return;
  if(worldDriving){
    const gas=held.has('gas')&&!player.immobilized&&player.engineStall<=0,brake=held.has('brake'),steer=(held.has('right')?1:0)-(held.has('left')?1:0);player.engineStall=Math.max(0,player.engineStall-dt);
    const max=player.immobilized?0:Math.max(18,phys.max*0.92);if(gas)player.speed+=phys.acc*0.82*dt;if(brake)player.speed-=phys.brk*dt;if(!gas&&!brake)player.speed-=player.speed*0.48*dt;player.speed=player.immobilized?0:clamp(player.speed,-8,max);
    player.h-=steer*(0.4+Math.min(Math.abs(player.speed)/45,1)*0.85)*(player.mesh.userData.trWheelLost?0.56:1)*dt*Math.sign(player.speed||1);player.mesh.rotation.y=player.h;
    const oldX=player.mesh.position.x,oldZ=player.mesh.position.z;player.mesh.position.x+=Math.sin(player.h)*player.speed*dt;player.mesh.position.z+=Math.cos(player.h)*player.speed*dt;player.mesh.userData.wheels.forEach(w=>w.rotation.x+=player.speed*dt/0.4);(player.mesh.userData.externalWheels||[]).forEach(w=>w.rotation.x+=player.speed*dt/0.4);
    if(worldFlyMode){if(held.has('nitro'))player.mesh.position.y+=12*dt;if(held.has('drift'))player.mesh.position.y-=12*dt;player.mesh.position.y=clamp(player.mesh.position.y,worldGroundY+0.65,worldGroundY+100);worldFallState.car={vy:0,grounded:true};}
    const cityActive=!!(worldG&&worldG.userData&&worldG.userData.importedCityActive);let struck=false,struckWeight=1;
    if(cityActive){if(worldGhostMode||worldFlyMode){struck=false;}else{const r=resolveCityMotion(oldX,oldZ,player.mesh.position.x,player.mesh.position.z,2.1,true);player.mesh.position.x=r.x;player.mesh.position.z=r.z;struck=r.hit;struckWeight=r.weight||1;}
      if(!(worldGhostMode||worldFlyMode)){const beforeX=player.mesh.position.x,beforeZ=player.mesh.position.z;player.mesh.position.x=clamp(beforeX,worldBounds.minX,worldBounds.maxX);player.mesh.position.z=clamp(beforeZ,worldBounds.minZ,worldBounds.maxZ);if(beforeX!==player.mesh.position.x||beforeZ!==player.mesh.position.z)struck=true;}
    }else{const radX=2.15,radZ=2.65;for(const b of worldBuildings){const dx=player.mesh.position.x-b.x,dz=player.mesh.position.z-b.z,ox=b.hw+radX-Math.abs(dx),oz=b.hd+radZ-Math.abs(dz);if(ox>0&&oz>0){if(ox<oz)player.mesh.position.x=b.x+Math.sign(dx||1)*(b.hw+radX);else player.mesh.position.z=b.z+Math.sign(dz||1)*(b.hd+radZ);struck=true;break;}}}
    if(struck&&worldCollisionTimer<=0){worldCollisionTimer=0.34;const impact=Math.abs(player.speed);player.speed*=0.22;player.vx*=0.24;player.vz*=0.24;if(impact>9)addDmg(clamp(impact*0.065*struckWeight,0.25,7));if(impact>12)spawnSparks(player.mesh.position.x,0.7,player.mesh.position.z,clamp(Math.floor(impact*.28),5,15));Snd.bump();if(impact>5)toast('Столкновение · машина затормозила у препятствия');}
    // Городской транспорт сталкивается по повёрнутым прямоугольным хитбоксам,
    // без старого телепорта машины на 4.65 м и без автоматического разворота трафика.
    for(const tr of worldTraffic){
      if(worldCollisionTimer>0)break;
      const hit=carFootprintOverlap(player,tr);if(!hit)continue;
      const nx=hit.nx,nz=hit.nz,overlap=hit.overlap;
      const tvx=Math.cos(0)*tr.speed*tr.dir,tvz=0;
      const pvx=Number.isFinite(player.vx)?player.vx:Math.sin(player.h)*player.speed;
      const pvz=Number.isFinite(player.vz)?player.vz:Math.cos(player.h)*player.speed;
      const rel=(pvx-tvx)*nx+(pvz-tvz)*nz,impact=Math.abs(rel);
      // Небольшое разделение тел: более тяжёлая/быстрая машина не отлетает далеко,
      // а вытесняет вторую в соответствии с импульсом столкновения.
      const playerMass=Number(player.mesh.userData.mass)||1.25,otherMass=Number(tr.mesh.userData.mass)||1.0;
      player.mesh.position.x+=nx*overlap*0.42;player.mesh.position.z+=nz*overlap*0.42;
      tr.mesh.position.x-=nx*overlap*0.58;tr.mesh.position.z-=nz*overlap*0.58;
      const impulse=clamp(impact*0.52,0,10)/(1/playerMass+1/otherMass);
      player.vx=pvx+nx*impulse/playerMass;player.vz=pvz+nz*impulse/playerMass;
      // In the open world the car is driven by heading + speed, so convert the
      // impulse back into those controls instead of discarding the sideways shove.
      player.speed=Math.hypot(player.vx,player.vz);
      if(player.speed>0.35){player.h=Math.atan2(player.vx,player.vz);player.mesh.rotation.y=player.h;}
      const otherVX=tvx-nx*impulse/otherMass;tr.speed=clamp(Math.abs(otherVX),2,Math.max(9,Math.abs(tvx)+3));
      if(otherVX<0)tr.dir=-1;else if(otherVX>0)tr.dir=1;
      tr.mesh.rotation.y=tr.dir>0?Math.PI/2:-Math.PI/2;tr.x=tr.mesh.position.x;tr.z=tr.mesh.position.z;
      if(impact>1){player.speed*=impact>16?0.68:impact>7?0.82:0.94;player.vx*=impact>16?0.68:impact>7?0.82:0.94;player.vz*=impact>16?0.68:impact>7?0.82:0.94;}
      if(impact>8)addDmg(clamp((impact-5)*0.16,0.5,7));
      if(impact>5)spawnSparks(player.mesh.position.x,0.7,player.mesh.position.z,clamp(Math.floor(impact*.28),4,14));
      worldCollisionTimer=0.34;Snd.bump();toast('Столкновение с городским транспортом');break;
    }
    if(Math.abs(player.speed)>0.7){player.vx=Math.sin(player.h)*player.speed;player.vz=Math.cos(player.h)*player.speed;}
  }else if(worldEnteringCar){
    if(charMesh)charMesh.rotation.y=worldYaw;
  }else{
    const oldX=charMesh.position.x,oldZ=charMesh.position.z;const turn=(held.has('right')?1:0)-(held.has('left')?1:0);worldYaw-=turn*1.55*dt;const forward=(held.has('gas')?1:0)-(held.has('brake')?1:0),walkSpeed=held.has('nitro')?14:8.3,strafe=turn;
    charMesh.position.x+=(Math.sin(worldYaw)*forward+Math.cos(worldYaw)*strafe)*walkSpeed*dt;charMesh.position.z+=(Math.cos(worldYaw)*forward-Math.sin(worldYaw)*strafe)*walkSpeed*dt;charMesh.rotation.y=worldYaw;
    if(worldInterior){
      // Apartment interior has its own walkable bounds; don't let the character pass through the room's walls.
      charMesh.position.x=clamp(charMesh.position.x,-11.55,11.55);
      charMesh.position.z=clamp(charMesh.position.z,-11.55,11.55);
    } else {
      const cityActive=!!(worldG&&worldG.userData&&worldG.userData.importedCityActive);
      if(cityActive){if(!(worldGhostMode||worldFlyMode)){const r=resolveCityMotion(oldX,oldZ,charMesh.position.x,charMesh.position.z,0.42,false);charMesh.position.x=r.x;charMesh.position.z=r.z;}
        if(!(worldGhostMode||worldFlyMode)){charMesh.position.x=clamp(charMesh.position.x,worldBounds.minX,worldBounds.maxX);charMesh.position.z=clamp(charMesh.position.z,worldBounds.minZ,worldBounds.maxZ);}
      }else if(!(worldGhostMode||worldFlyMode)){
        for(const b of worldBuildings){const dx=charMesh.position.x-b.x,dz=charMesh.position.z-b.z,ox=b.hw+0.42-Math.abs(dx),oz=b.hd+0.42-Math.abs(dz);if(ox>0&&oz>0){if(Math.abs(charMesh.position.x-oldX)>Math.abs(charMesh.position.z-oldZ))charMesh.position.x=b.x+Math.sign(dx||1)*(b.hw+0.42);else charMesh.position.z=b.z+Math.sign(dz||1)*(b.hd+0.42);}}
        charMesh.position.x=clamp(charMesh.position.x,-WORLD_RANGE+8,WORLD_RANGE-8);charMesh.position.z=clamp(charMesh.position.z,-WORLD_RANGE+8,WORLD_RANGE-8);
      }
    }
    if(worldFlyMode){if(held.has('nitro'))charMesh.position.y+=9*dt;if(held.has('drift'))charMesh.position.y-=9*dt;charMesh.position.y=clamp(charMesh.position.y,worldGroundY+0.6,worldGroundY+80);worldFallState.character={vy:0,grounded:true};}
    const moving=Math.abs(forward)>0||Math.abs(strafe)>0;
    if(window.TRModels)window.TRModels.setCharacterMotion(moving,held.has('nitro'));
    const u=charMesh.userData;u.legs[0].rotation.x=moving?Math.sin(worldAnimT*10)*0.55:0;u.legs[1].rotation.x=moving?-Math.sin(worldAnimT*10)*0.55:0;u.arms[0].rotation.x=moving?-Math.sin(worldAnimT*10)*0.22:0;u.arms[1].rotation.x=moving?Math.sin(worldAnimT*10)*0.22:0;
    if(u.bodyGroup){u.bodyGroup.position.y=moving?Math.abs(Math.sin(worldAnimT*10))*0.035:Math.sin(worldAnimT*1.6)*0.012;u.bodyGroup.rotation.z=moving?Math.sin(worldAnimT*5)*0.018:Math.sin(worldAnimT*0.8)*0.008;}
  }
  if(!worldInterior){const target=worldInteractablesAt();worldNear=target;if(target){$('worldInteractBtn').textContent='E · '+(target.type==='npc'?'Поговорить с '+target.name:target.type==='car'?(worldDriving?'Выйти из машины':'Сесть в машину'):target.type==='apartment'?'Войти домой':target.type==='market'?'Зайти в магазин':target.type==='garage'?'Тюнинг авто':target.type==='fashion'?'Магазин одежды':target.type==='raceboard'||target.type==='plaza'?'Городские события':'Взаимодействовать');$('worldActionHint').textContent=(isTouch?'Свайп по сцене — обзор · ':'')+'E — '+target.name+' · V — камера · P — телефон';}else{$('worldInteractBtn').textContent='E · Осмотреться';$('worldActionHint').textContent=isTouch?'Экранные кнопки · свайп по миру — камера · Телефон — сервисы':'WASD — движение · E — взаимодействие · V — камера · P — телефон';}}
  else{$('worldInteractBtn').textContent='E · Выйти из квартиры';$('worldActionHint').textContent='Квартира · E — выйти в город · P — телефон';}
  const p=worldPos();const d=Math.hypot(p.x,p.z),cfg=WORLD_REGIONS[worldRegionId]||WORLD_REGIONS.tashkent;$('worldLocation').textContent=worldInterior?'МОЯ КВАРТИРА · ГОСТИНАЯ':d<85?cfg.welcome:p.x<0?'ЗАПАДНЫЙ РАЙОН':'ВОСТОЧНЫЙ РАЙОН';
}
function segmentAabbHitT(origin, target, b, pad=0.15) {
  const dir=target.clone().sub(origin); let tMin=0,tMax=1;
  const axes=[['x',b.x-b.hw-pad,b.x+b.hw+pad],['y',0,b.h+0.35],['z',b.z-b.hd-pad,b.z+b.hd+pad]];
  for(const [axis,min,max] of axes){const o=origin[axis],d=dir[axis];if(Math.abs(d)<1e-6){if(o<min||o>max)return null;continue;}let t1=(min-o)/d,t2=(max-o)/d;if(t1>t2){const swap=t1;t1=t2;t2=swap;}tMin=Math.max(tMin,t1);tMax=Math.min(tMax,t2);if(tMin>tMax)return null;}
  return tMin>=0&&tMin<=1?tMin:null;
}
function updateWorldCamera(dt){
  const a=worldDriving?player.mesh:charMesh;if(!a)return;
  const p=a.position, actorYaw=worldDriving?player.h:worldYaw, yaw=actorYaw+worldCamOrbitYaw;
  let wanted,look,fov;
  if(worldCamMode===0){
    a.visible=!!worldDriving;
    const eyeY=worldDriving?0.94:1.62;
    wanted=new THREE.Vector3(p.x-Math.sin(actorYaw)*(worldDriving?.18:0),p.y+eyeY+(worldInterior?.06:0),p.z-Math.cos(actorYaw)*(worldDriving?.18:0));
    const sight=15, pitchOffset=Math.sin(worldCamOrbitPitch)*sight;
    look=new THREE.Vector3(wanted.x+Math.sin(yaw)*sight,wanted.y+pitchOffset,wanted.z+Math.cos(yaw)*sight);
    fov=worldDriving?77:73;
  } else {
    a.visible=true;
    let dist=worldCamMode===1?2.9:7.8,height=worldCamMode===1?2.65:4.25;
    if(worldInterior){dist=worldCamMode===1?2.2:5.8;height=worldCamMode===1?2.55:3.6;}
    const focus=new THREE.Vector3(p.x,worldDriving?1.15:1.25,p.z);
    const horizontal=dist*Math.cos(worldCamOrbitPitch), vertical=Math.sin(worldCamOrbitPitch)*dist;
    const side=worldCamMode===1?0.85:0;
    wanted=new THREE.Vector3(p.x-Math.sin(yaw)*horizontal+Math.cos(yaw)*side,height+vertical+(worldDriving?.2:0),p.z-Math.cos(yaw)*horizontal-Math.sin(yaw)*side);
    // Clamp the camera before buildings so the view never clips through city facades.
    if(!worldInterior&&worldBuildings.length){let nearest=1;for(const b of worldBuildings){if(Math.abs(b.x-focus.x)>dist+4||Math.abs(b.z-focus.z)>dist+4)continue;const hit=segmentAabbHitT(focus,wanted,b,.32);if(hit!==null&&hit>0.015)nearest=Math.min(nearest,hit);}if(nearest<1){const dir=wanted.clone().sub(focus);wanted.copy(focus).addScaledVector(dir,Math.max(.08,nearest-.035));}}
    if(worldInterior){wanted.x=clamp(wanted.x,-12.0,12.0);wanted.z=clamp(wanted.z,-12.0,12.0);wanted.y=clamp(wanted.y,0.8,4.8);}
    look=focus.clone();look.y+=Math.sin(worldCamOrbitPitch)*2.7;fov=worldDriving?73:67;
  }
  const follow=Math.min(1,(worldCamMode===0?15:9)*Math.max(0,dt));
  cam.position.lerp(wanted,follow);cam.lookAt(look);cam.fov += (fov-cam.fov)*Math.min(1,7*Math.max(0,dt));cam.updateProjectionMatrix();
}

function worldKey(code){if(state!=='world')return false;if(code==='KeyE'){interactWorld();return true;}if(code==='KeyT'){cycleWorldTime();return true;}if(code==='KeyY'){cycleWorldWeather();return true;}if(code==='KeyV'){cycleWorldCamera();return true;}if(code==='KeyP'){if($('worldPhone').hidden)openWorldPhone('home');else closeWorldPhone();return true;}if(code==='Escape'){if(!$('worldPhone').hidden)closeWorldPhone();else if(!$('worldShop').hidden)$('worldShop').hidden=true;else toMenu();return true;}if(code==='KeyR'){if(worldDriving){if(player.immobilized){setDamage(Math.max(0,player.dmg-32));player.immobilized=false;player.engineStall=0;toast('Эвакуатор запустил двигатель');}const safe=findSafeCitySpawn(0,0,2.4);player.mesh.position.set(safe.x,worldGroundY+10,safe.z);player.speed=0;worldFallState.car={vy:0,grounded:false};}return true;}return false;}


// ================= запуск =================
applyGfx(); resize(); refreshSettings(); wakeServer(); applyTouchSettings();
buildTrack(save.level); builtL = save.level;
showCar(save.cur); previewPos(); refreshMenu(); show('menu');
requestAnimationFrame(loop);
})();
