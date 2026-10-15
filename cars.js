// Данные машин, процедурные 3D-модели машин и персонажей (оригинальные, без чужих брендов).
// Добавить машину: допишите объект в CARS. Порядок статов: speed, accel, brake, handle, grip, nitro.
const STATS = [['speed', 'Скорость'], ['accel', 'Ускорение'], ['brake', 'Торможение'], ['handle', 'Управление'], ['grip', 'Сцепление'], ['nitro', 'Нитро']];

// Силуэт сбоку (z вперёд): l длина, w ширина, belt линия капота/дверей, roof крыша, nose/tail высота носа/кормы,
// wb/wt низ/верх лобового, rt/rb верх/низ заднего стекла, R радиус колеса, sp тип антикрыла (0 нет)
const SHAPES = {
  retro:  { l: 4.8, w: 1.95, belt: 0.98, roof: 1.45, nose: 0.72, tail: 0.94, wb: 0.75, wt: 0.25, rt: -0.95, rb: -1.65, R: 0.38, sp: 0 },
  muscle: { l: 4.8, w: 2.0,  belt: 0.95, roof: 1.38, nose: 0.66, tail: 0.98, wb: 0.5,  wt: 0.0,  rt: -0.7,  rb: -1.9,  R: 0.39, sp: 1 },
  sedan:  { l: 4.6, w: 1.9,  belt: 0.95, roof: 1.43, nose: 0.76, tail: 0.92, wb: 0.9,  wt: 0.35, rt: -0.9,  rb: -1.5,  R: 0.37, sp: 0 },
  coupe:  { l: 4.3, w: 1.9,  belt: 0.88, roof: 1.30, nose: 0.64, tail: 0.88, wb: 0.6,  wt: 0.05, rt: -0.7,  rb: -1.4,  R: 0.37, sp: 0 },
  wedge:  { l: 4.4, w: 1.95, belt: 0.78, roof: 1.20, nose: 0.46, tail: 0.86, wb: 0.9,  wt: 0.1,  rt: -0.9,  rb: -1.7,  R: 0.37, sp: 1 },
  super:  { l: 4.5, w: 2.02, belt: 0.72, roof: 1.13, nose: 0.42, tail: 0.82, wb: 1.0,  wt: 0.25, rt: -0.7,  rb: -1.7,  R: 0.38, sp: 2 },
  hyper:  { l: 4.7, w: 2.12, belt: 0.66, roof: 1.05, nose: 0.36, tail: 0.78, wb: 1.2,  wt: 0.35, rt: -0.8,  rb: -1.9,  R: 0.39, sp: 3 }
};

const CARS = [
  { id: 'rust',    name: 'Ржавый Волк 72', price: 0,      col: 0xc9a227, shape: 'retro',  s: [3, 3, 3, 3, 3, 3] },
  { id: 'bulldog', name: 'Бульдог 74',     price: 700,    col: 0x8a3b2b, shape: 'muscle', s: [4, 5, 3, 3, 3, 4] , stripe: 0xf2f2f2 },
  { id: 'topol',   name: 'Тополь Т4',      price: 1600,   col: 0x3b6ea5, shape: 'sedan',  s: [5, 4, 4, 4, 4, 4] },
  { id: 'kolibri', name: 'Колибри GT',     price: 3200,   col: 0x3aa56a, shape: 'coupe',  s: [5, 5, 5, 6, 5, 4] },
  { id: 'skat',    name: 'Скат Р1',        price: 5600,   col: 0xd8d8d0, shape: 'wedge',  s: [6, 6, 5, 6, 5, 5] , stripe: 0x1d5fb0 },
  { id: 'yastreb', name: 'Ястреб ЛС',      price: 9000,   col: 0xe0562a, shape: 'coupe',  s: [7, 6, 6, 7, 6, 5] },
  { id: 'mamba',   name: 'Мамба V8',       price: 14000,  col: 0x1d1d22, shape: 'muscle', s: [8, 7, 6, 6, 6, 6] , stripe: 0xd8a020 },
  { id: 'phantom', name: 'Фантом Z',       price: 21000,  col: 0x6a3fd0, shape: 'wedge',  s: [8, 8, 7, 7, 7, 7] },
  { id: 'corsar',  name: 'Корсар S',       price: 30000,  col: 0xd6b13a, shape: 'super',  s: [9, 8, 8, 8, 7, 7] },
  { id: 'eclipse', name: 'Эклипс 900',     price: 42000,  col: 0x2fb7c9, shape: 'super',  s: [9, 9, 8, 9, 8, 8] },
  { id: 'viper',   name: 'Вайпер Эво',     price: 58000,  col: 0xc42b2b, shape: 'super',  s: [10, 9, 9, 9, 9, 8] , stripe: 0xf2f2f2 },
  { id: 'nova',    name: 'Нова Хайпер',    price: 80000,  col: 0xf2f2f2, shape: 'hyper',  s: [10, 10, 9, 9, 9, 9] , stripe: 0x2a2a30 },
  { id: 'titan',   name: 'Титан X',        price: 110000, col: 0xff8a1a, shape: 'hyper',  s: [11, 10, 10, 10, 9, 10] , stripe: 0x151515 },
  { id: 'aurora',  name: 'Аврора ∞',       price: 150000, col: 0xe030a0, shape: 'hyper',  s: [12, 11, 10, 11, 10, 11] }
];

const SKINS = [0xf1c8a0, 0xd9a577, 0x8d5a3b];
const OUTFITS = [0xe04a3a, 0x2f7fd8, 0x3ab56a, 0xf5c542, 0x8a4fd0, 0x2a2a2a];

// ---------- общие материалы ----------
const _M = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1620, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.72, clearcoat: 1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.5, metalness: 0.4 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.85 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.25, metalness: 0.95 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.15, metalness: 1 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff3c8 }),
  caliper: new THREE.MeshStandardMaterial({ color: 0xd01818, roughness: 0.4 }),
  disc: new THREE.MeshStandardMaterial({ color: 0x70757c, roughness: 0.4, metalness: 0.9 })
};
function _cv(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }
const _grilleTex = _cv(64, 32, (x, w, h) => { x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, w, h); x.fillStyle = '#888'; for (let y = 4; y < h; y += 6) x.fillRect(2, y, w - 4, 2); });
const _plateFn = bg => (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = '#222'; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, h - 4); x.fillStyle = '#111'; x.font = 'bold 22px monospace'; x.textAlign = 'center'; x.fillText('TR 777', w / 2, h * 0.72); };
const _plateTex = _cv(128, 32, _plateFn('#f4f4f0')), _plateTexY = _cv(128, 32, _plateFn('#e8c030'));
const _numTex = {};
function _numberTex(n) { return _numTex[n] || (_numTex[n] = _cv(64, 64, (x, w, h) => { x.fillStyle = '#f4f4f0'; x.beginPath(); x.arc(32, 32, 29, 0, 7); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 3; x.stroke(); x.fillStyle = '#111'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.fillText(String(n), 32, 44); })); }
const _M2 = {
  orange: new THREE.MeshBasicMaterial({ color: 0xff9020 }), red: new THREE.MeshBasicMaterial({ color: 0xff2020 }), white: new THREE.MeshBasicMaterial({ color: 0xf4f8ff })
};
const _glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
})();

// профиль сбоку -> выдавливание по ширине (z модели = вперёд)
function _sideGeo(shape, width, bs, bt) {
  bs = bs === undefined ? 0.07 : bs; bt = bt === undefined ? 0.09 : bt;
  const depth = Math.max(0.05, width - 2 * bt);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bs, bevelThickness: bt, bevelSegments: 3, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(depth / 2, 0, 0); return g;
}
function _poly(pts) { const s = new THREE.Shape(); pts.forEach(([a, b], i) => i ? s.lineTo(a, b) : s.moveTo(a, b)); s.closePath(); return s; }

function makeCarModel(def, colOverride) {
  const S = SHAPES[def.shape], g = new THREE.Group(), h = S.l / 2, y0 = 0.22;
  const body = new THREE.MeshPhysicalMaterial({ color: colOverride || def.col, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 });
  const add = (geo, mat, x, y, z, sh) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !!sh; g.add(m); return m; };

  // нижняя часть кузова
  const lo = new THREE.Shape();
  lo.moveTo(-h + 0.15, y0); lo.lineTo(h - 0.15, y0); lo.quadraticCurveTo(h, y0, h, y0 + 0.12); lo.lineTo(h, S.nose);
  lo.bezierCurveTo(h - 0.1, S.nose + (S.belt - S.nose) * 0.35, S.wb + (h - S.wb) * 0.6, S.belt - 0.04, S.wb, S.belt);
  lo.lineTo(S.rb, S.belt); lo.lineTo(-h + 0.35, S.tail); lo.quadraticCurveTo(-h, S.tail, -h, S.tail - 0.15);
  lo.lineTo(-h, y0 + 0.12); lo.quadraticCurveTo(-h, y0, -h + 0.15, y0);
  add(_sideGeo(lo, S.w), body, 0, 0, 0, true);

  // салон (зауженный) + стёкла + крыша
  const cw = S.w * 0.84, bl = S.belt - 0.02;
  const cab = new THREE.Shape();
  cab.moveTo(S.wb, bl); cab.lineTo(S.wt + 0.08, S.roof - 0.04); cab.quadraticCurveTo(S.wt, S.roof, S.wt - 0.1, S.roof);
  cab.lineTo(S.rt + 0.12, S.roof); cab.quadraticCurveTo(S.rt, S.roof, S.rt - 0.1, S.roof - 0.05); cab.lineTo(S.rb, bl); cab.closePath();
  add(_sideGeo(cab, cw, 0.03, 0.05), body, 0, 0, 0, true);
  const dz = S.wt - S.wb, rz = S.rt - S.rb, dh = S.roof - S.belt;
  // боковые стёкла
  add(_sideGeo(_poly([[S.wb - 0.22, S.belt + 0.04], [S.wt + 0.17, S.roof - 0.1], [S.rt - 0.04, S.roof - 0.1], [S.rb + 0.24, S.belt + 0.04]]), cw + 0.05, 0.0, 0.0), _M.glass, 0, 0, 0, false);
  // лобовое и заднее
  const fw = (a, bb, off, t) => _poly([[a[0] + off, a[1]], [bb[0] + off, bb[1]], [bb[0] + off + t, bb[1]], [a[0] + off + t, a[1]]]);
  add(_sideGeo(fw([S.wb + dz * 0.1 + 0.02, S.belt + dh * 0.1], [S.wb + dz * 0.92 + 0.02, S.belt + dh * 0.92], 0.02, -0.06), cw - 0.24, 0, 0.0), _M.glass, 0, 0, 0, false);
  add(_sideGeo(fw([S.rb + rz * 0.1 - 0.02, S.belt + dh * 0.1], [S.rb + rz * 0.9 - 0.02, S.belt + dh * 0.9], -0.02, 0.06), cw - 0.24, 0, 0.0), _M.glass, 0, 0, 0, false);
  // стойка B
  add(new THREE.BoxGeometry(cw + 0.06, dh - 0.12, 0.07), body, 0, S.belt + dh / 2 - 0.02, (S.wt + S.rt) / 2 - 0.05);

  // колёса, арки
  const wheels = [], R = S.R;
  const tireG = new THREE.CylinderGeometry(R, R, 0.32, 20), rimG = new THREE.CylinderGeometry(R * 0.66, R * 0.66, 0.34, 16), hubG = new THREE.CylinderGeometry(0.06, 0.06, 0.36, 8);
  const nutG = new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), archG = new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.05, 20), discG = new THREE.CylinderGeometry(R * 0.52, R * 0.52, 0.03, 16);
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const wz = sz * (h - 0.95), wx = sx * (S.w / 2 - 0.14);
    const arch = add(archG, _M.dark, sx * (S.w / 2 + 0.01), R, wz, false); arch.rotation.z = Math.PI / 2;
    const piv = new THREE.Group(); piv.position.set(wx, R, wz);
    const t = new THREE.Mesh(tireG, _M.tire); t.rotation.z = Math.PI / 2; t.castShadow = true; piv.add(t);
    const r = new THREE.Mesh(rimG, _M.rim); r.rotation.z = Math.PI / 2; piv.add(r);
    const hb = new THREE.Mesh(hubG, _M.dark); hb.rotation.z = Math.PI / 2; piv.add(hb);
    const disc = new THREE.Mesh(discG, _M.disc); disc.rotation.z = Math.PI / 2; disc.position.x = -sx * 0.09; piv.add(disc);
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5, nut = new THREE.Mesh(nutG, _M.chrome); nut.rotation.z = Math.PI / 2; nut.position.set(sx * 0.17, Math.cos(a) * 0.09, Math.sin(a) * 0.09); piv.add(nut); }
    for (let k = 0; k < 5; k++) { // спицы
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.36, R * 1.1, 0.05), _M.dark); sp.rotation.x = k * Math.PI * 2 / 5; piv.add(sp);
    }
    g.add(piv); wheels.push(piv);
  });

  // швы дверей, решётка, номера, воздухозаборники, суппорты, подсветка днища
  const seamH = S.belt - y0 - 0.25, seamY = y0 + 0.2 + seamH / 2;
  [-1, 1].forEach(sx => {
    [S.wb - 0.12, (S.wt + S.rt) / 2 - 0.05, S.rb + 0.4].forEach(z => add(new THREE.BoxGeometry(0.014, seamH, 0.02), _M.dark, sx * (S.w / 2 + 0.012), seamY, z, false));
    add(new THREE.BoxGeometry(0.014, 0.02, S.wb - S.rb - 0.3), _M.dark, sx * (S.w / 2 + 0.012), S.belt - 0.06, (S.wb + S.rb) / 2, false);
  });
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(S.w * 0.46, 0.15), new THREE.MeshBasicMaterial({ map: _grilleTex })); grille.position.set(0, S.nose - 0.16, h + 0.092); g.add(grille);
  [[0, h + 0.093, 0], [0, -h - 0.093, Math.PI]].forEach(([x, z, ry]) => {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshBasicMaterial({ map: def.shape === 'retro' ? _plateTexY : _plateTex })); pl.position.set(x, y0 + 0.3, z); pl.rotation.y = ry; g.add(pl);
  });
  if (S.sp >= 1) [-0.32, 0.32].forEach(x => add(new THREE.BoxGeometry(0.3, 0.03, 0.5), _M.dark, x, S.belt + 0.015, S.wb + (h - S.wb) * 0.45, false));
  if (def.shape === 'muscle') { add(new THREE.BoxGeometry(0.55, 0.1, 0.65), body, 0, S.belt + 0.06, S.wb + 0.55, true); add(new THREE.BoxGeometry(0.45, 0.06, 0.05), _M.dark, 0, S.belt + 0.07, S.wb + 0.9, false); }
  if (S.sp === 0) add(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 5), _M.chrome, -0.7, S.tail + 0.3, S.rb + 0.2, false);
  if (S.sp >= 2) [-1, 1].forEach(sx => [1, -1].forEach(sz => add(new THREE.BoxGeometry(0.12, 0.1, R * 2.3), body, sx * (S.w / 2 + 0.01), R * 2 + 0.03, sz * (h - 0.95), true)));
  [-1, 1].forEach(sx => [1, -1].forEach(sz => add(new THREE.BoxGeometry(0.05, 0.16, 0.1), _M.caliper, sx * (S.w / 2 - 0.2), R + R * 0.4, sz * (h - 0.95), false)));
  const glowCol = colOverride || def.col;
  const ug = new THREE.Mesh(new THREE.PlaneGeometry(S.w * 1.25, S.l * 1.1), new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: S.sp >= 1 ? 0.35 : 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  ug.rotation.x = -Math.PI / 2; ug.position.y = 0.06; g.add(ug);
  if (S.sp >= 3) [-0.3, -0.15, 0.15, 0.3].forEach(x => { const e = add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), _M.chrome, x, y0 + 0.16, -h - 0.06, false); e.rotation.x = Math.PI / 2; });

  // ---- дополнительная детализация ----
  const cIdx = Math.max(0, CARS.indexOf(def));
  if (def.shape !== 'retro') [-1, 1].forEach(sx => {
    const hx = sx * S.w * 0.3;
    add(new THREE.BoxGeometry(0.58, 0.12, 0.04), _M.dark, hx, S.nose - 0.02, h + 0.07, false);                       // рамка фары
    const lens = add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14), _M2.white, hx + sx * 0.12, S.nose - 0.02, h + 0.1, false); lens.rotation.x = Math.PI / 2; // линза-проектор
    add(new THREE.BoxGeometry(0.5, 0.018, 0.03), _M2.white, hx, S.nose + 0.045, h + 0.095, false);                   // дневные огни
    add(new THREE.BoxGeometry(0.14, 0.06, 0.03), _M.head, sx * S.w * 0.37, y0 + 0.17, h + 0.06, false);              // противотуманка
  });
  [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.02, 0.04, 0.12), _M2.orange, sx * (S.w / 2 + 0.012), S.belt - 0.12, h - 0.65, false)); // повторители
  add(new THREE.BoxGeometry(0.4, 0.03, 0.03), _M2.red, 0, S.tail + 0.075, -h + 0.5, false);                          // третий стоп-сигнал
  [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.22, 0.05, 0.03), _M2.red, sx * S.w * 0.38, S.tail - 0.02, -h - 0.075, false)); // блоки стопов
  [-0.3, 0.3].forEach(x => { const wp = add(new THREE.BoxGeometry(0.5, 0.012, 0.015), _M.dark, x, S.belt + 0.04, S.wb - 0.04, false); wp.rotation.z = 0.08 * Math.sign(x); }); // дворники
  if (def.shape === 'sedan' || def.shape === 'coupe' || def.shape === 'wedge') add(new THREE.BoxGeometry(cw * 0.55, 0.012, 0.55), _M.glass, 0, S.roof + 0.035, (S.wt + S.rt) / 2, false); // люк
  if (S.sp >= 1) add(new THREE.BoxGeometry(0.04, 0.1, 0.16), _M.dark, 0, S.roof + 0.08, S.rt + 0.2, false);          // антенна-плавник
  const fc = add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 12), _M.chrome, -(S.w / 2 + 0.014), S.belt - 0.2, S.rb + 0.1, false); fc.rotation.z = Math.PI / 2; // лючок бака
  if (S.sp >= 1) [-1, 1].forEach(sx => { const dn = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: _numberTex(cIdx + 1), transparent: true })); dn.position.set(sx * (S.w / 2 + 0.016), S.belt - 0.3, (S.wb + S.rb) / 2 + 0.1); dn.rotation.y = sx * Math.PI / 2; g.add(dn); });
  if (S.sp >= 2) [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.03, 0.3, 0.5), _M.dark, sx * (S.w * 0.46), S.tail + 0.32, -h + 0.4, false)); // торцевые пластины
  if (S.sp >= 3) [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.2, 0.025, 0.14), _M.dark, sx * S.w * 0.42, y0 + 0.07, h - 0.1, false));   // канарды
  if (def.stripe) {
    const sm = new THREE.MeshStandardMaterial({ color: def.stripe, roughness: 0.35, metalness: 0.2 }), SW = 0.34;
    const bz = t => { const u = 1 - t; return [u * u * u * h + 3 * u * u * t * (h - 0.1) + 3 * u * t * t * (S.wb + (h - S.wb) * 0.6) + t * t * t * S.wb, u * u * u * S.nose + 3 * u * u * t * (S.nose + (S.belt - S.nose) * 0.35) + 3 * u * t * t * (S.belt - 0.04) + t * t * t * S.belt]; };
    const top = [], bot = []; for (let k = 1; k <= 8; k++) { const q = bz(0.1 + k * 0.9 / 8); top.push([q[0], q[1] + 0.096]); bot.push([q[0], q[1] + 0.074]); }
    add(_sideGeo(_poly(top.concat(bot.reverse())), SW, 0, 0), sm, 0, 0, 0, false);                                                                       // капот
    add(_sideGeo(_poly([[S.wt - 0.08, S.roof + 0.034], [S.rt + 0.12, S.roof + 0.034], [S.rt + 0.12, S.roof + 0.056], [S.wt - 0.08, S.roof + 0.056]]), SW, 0, 0), sm, 0, 0, 0, false); // крыша
    add(_sideGeo(_poly([[S.rb, S.belt + 0.074], [-h + 0.4, S.tail + 0.074], [-h + 0.4, S.tail + 0.096], [S.rb, S.belt + 0.096]]), SW, 0, 0), sm, 0, 0, 0, false);       // багажник
  }

  // свет
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xaa1010 });
  add(new THREE.BoxGeometry(S.w * 0.8, 0.1, 0.05), tailMat, 0, S.tail - 0.1, -h - 0.09, false);
  if (def.shape === 'retro') {
    [-0.62, 0.62].forEach(x => {
      const l = add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 14), _M.head, x, S.nose + 0.02, h + 0.08, false); l.rotation.x = Math.PI / 2;
      const ring = add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), _M.chrome, x, S.nose + 0.02, h + 0.06, false); ring.rotation.x = Math.PI / 2;
    });
    add(new THREE.BoxGeometry(S.w + 0.05, 0.14, 0.14), _M.chrome, 0, y0 + 0.24, h + 0.1, false);
    add(new THREE.BoxGeometry(S.w + 0.05, 0.14, 0.14), _M.chrome, 0, y0 + 0.24, -h - 0.1, false);
    add(new THREE.BoxGeometry(S.w * 0.5, 0.16, 0.05), _M.chrome, 0, S.nose - 0.12, h + 0.09, false);
  } else {
    [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.5, 0.07, 0.05), _M.head, sx * S.w * 0.3, S.nose - 0.02, h + 0.085, false));
    add(new THREE.BoxGeometry(S.w * 0.5, 0.1, 0.05), _M.dark, 0, S.nose - 0.14, h + 0.085, false);
    add(new THREE.BoxGeometry(S.w * 0.95, 0.04, 0.4), _M.dark, 0, y0 + 0.02, h - 0.1, false);   // сплиттер
    add(new THREE.BoxGeometry(S.w * 0.8, 0.12, 0.3), _M.dark, 0, y0 + 0.08, -h + 0.1, false);   // диффузор
  }
  [-0.45, 0.45].forEach(x => { const e = add(new THREE.CylinderGeometry(0.065, 0.065, 0.25, 10), _M.chrome, x, y0 + 0.12, -h - 0.06, false); e.rotation.x = Math.PI / 2; });
  // зеркала, ручки, пороги, воздухозаборники
  [-1, 1].forEach(sx => {
    add(new THREE.BoxGeometry(0.14, 0.1, 0.2), body, sx * (cw / 2 + 0.1), S.belt + 0.1, S.wb - 0.2, true);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.22), _M.chrome, sx * (S.w / 2 + 0.07), S.belt - 0.12, (S.wb + S.rb) / 2 + 0.2, false);
    if (S.sp) add(new THREE.BoxGeometry(0.05, 0.1, S.l * 0.32), _M.dark, sx * (S.w / 2 + 0.05), y0 + 0.1, 0, false);
    if (S.sp >= 2) add(new THREE.BoxGeometry(0.06, 0.2, 0.55), _M.dark, sx * (S.w / 2 + 0.04), S.belt - 0.2, S.rb - 0.1, false);
  });
  // антикрыло
  if (S.sp) {
    const wy = S.tail + 0.2 + S.sp * 0.1, wz = -h + 0.4;
    add(new THREE.BoxGeometry(S.w * 0.92, 0.05, 0.5), S.sp >= 2 ? _M.dark : body, 0, wy, wz, true);
    [-1, 1].forEach(sx => add(new THREE.BoxGeometry(0.06, wy - S.tail + 0.04, 0.2), _M.dark, sx * S.w * 0.3, (wy + S.tail) / 2, wz, false));
  }
  // блики фар и стопов
  const hm = new THREE.SpriteMaterial({ map: _glowTex, color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 });
  [-1, 1].forEach(sx => { const sp = new THREE.Sprite(hm); sp.scale.set(1.3, 1.3, 1); sp.position.set(sx * S.w * 0.3, S.nose, h + 0.3); g.add(sp); });
  const tm = new THREE.SpriteMaterial({ map: _glowTex, color: 0xff2020, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 });
  const ts = new THREE.Sprite(tm); ts.scale.set(2.6, 1, 1); ts.position.set(0, S.tail - 0.1, -h - 0.3); g.add(ts);

  // пламя нитро
  const flame = new THREE.Group();
  const fm = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.85 });
  const fm2 = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9 });
  [-0.45, 0.45].forEach(x => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 8), fm); c.rotation.x = -Math.PI / 2; c.position.set(x, y0 + 0.12, -h - 1.3); flame.add(c);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.4, 8), fm2); c2.rotation.x = -Math.PI / 2; c2.position.set(x, y0 + 0.12, -h - 0.8); flame.add(c2);
  });
  flame.visible = false; g.add(flame);

  g.userData = { wheels, tailMat, flame, len: S.l, S, driver: null };
  return g;
}

// ---------- персонажи ----------
function makeCharacter(gender, outfit, skinIdx, bust) {
  const girl = gender === 'girl', g = new THREE.Group();
  const M = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.7 : r });
  const skin = M(SKINS[skinIdx] || SKINS[0], 0.6), top = M(OUTFITS[outfit] || OUTFITS[0], 0.75), top2 = M(OUTFITS[(outfit + 2) % 6], 0.75);
  const jeans = M(girl ? 0x20263a : 0x2a3550, 0.85), shoe = M(0xf2f2f2, 0.5), sole = M(0x222222, 0.9), hair = M(girl ? 0x5a2e12 : 0x241811, 0.5);
  const dark = M(0x0c0c0c, 0.4), white = M(0xffffff, 0.3), lip = M(0xb04a4a, 0.5), glove = M(0x151515, 0.6);
  const C = (a, b, h, n) => new THREE.CylinderGeometry(a, b, h, n || 12), Sp = (r, w, h) => new THREE.SphereGeometry(r, w || 14, h || 10), B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const add = (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); if (sx) m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
  };
  // торс: куртка с воротником, молнией и манжетой
  add(C(0.23, 0.19, 0.5, 16), top, 0, 1.12, 0, 0, 0, 0, 1, 1, 0.72);
  add(Sp(0.23, 16, 8), top, 0, 1.38, 0, 0, 0, 0, 1, 0.5, 0.72);
  add(C(0.2, 0.2, 0.07, 16), top2, 0, 0.86, 0, 0, 0, 0, 1, 1, 0.74);
  add(B(0.012, 0.45, 0.02), dark, 0, 1.12, 0.165);
  add(C(0.09, 0.1, 0.06, 12), top2, 0, 1.5, 0);
  add(C(0.055, 0.065, 0.1, 10), skin, 0, 1.52, 0);
  // голова и лицо
  add(Sp(0.17, 20, 16), skin, 0, 1.68, 0, 0, 0, 0, 0.92, 1.08, 1);
  add(new THREE.ConeGeometry(0.02, 0.05, 8), skin, 0, 1.655, 0.165, Math.PI / 2, 0, 0);
  add(B(0.06, 0.012, 0.01), lip, 0, 1.6, 0.158);
  [-1, 1].forEach(s => {
    add(Sp(0.035, 8, 6), skin, s * 0.16, 1.67, 0, 0, 0, 0, 0.6, 1, 1);
    add(Sp(0.034, 10, 8), white, s * 0.062, 1.69, 0.148, 0, 0, 0, 1, 0.8, 0.5);
    add(Sp(0.018, 8, 6), dark, s * 0.062, 1.69, 0.166);
    add(B(0.07, 0.014, 0.02), hair, s * 0.062, 1.73, 0.158, 0, 0, s * -0.15);
  });
  // причёска
  add(Sp(0.185, 18, 12), hair, 0, 1.7, -0.012, -0.12, 0, 0, 1, 0.8, 1).geometry = new THREE.SphereGeometry(0.185, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  if (girl) {
    add(B(0.3, 0.06, 0.05), hair, 0, 1.76, 0.125, -0.35);
    add(C(0.14, 0.07, 0.5, 14), hair, 0, 1.5, -0.12, 0.15, 0, 0, 1, 1, 0.55);
    add(Sp(0.07, 10, 8), hair, 0, 1.8, -0.17);
    add(C(0.045, 0.02, 0.38, 8), hair, 0, 1.62, -0.28, 0.3);
    add(new THREE.TorusGeometry(0.06, 0.016, 6, 14), top2, 0, 1.79, -0.15, 0.4);
    add(B(0.05, 0.02, 0.02), top2, 0.15, 1.75, 0.08);
  } else {
    [[-0.07, 0.15], [0, 0.16], [0.07, 0.15]].forEach(([x, z]) => add(B(0.07, 0.045, 0.03), hair, x, 1.78, z, 0.5));
    [-0.1, 0, 0.1].forEach(x => add(new THREE.ConeGeometry(0.035, 0.1, 6), hair, x, 1.86, -0.03, 0, 0, x * -2));
    [-1, 1].forEach(s => add(B(0.02, 0.07, 0.03), hair, s * 0.165, 1.67, 0.06));
  }
  // руки: плечо, предплечье, перчатка
  [-1, 1].forEach(s => {
    add(C(0.058, 0.052, 0.3, 10), top, s * 0.31, 1.2, 0, 0, 0, s * 0.12);
    add(C(0.05, 0.042, 0.28, 10), top, s * 0.35, 0.93, 0.04, -0.25, 0, s * 0.05);
    add(C(0.053, 0.053, 0.03, 10), top2, s * 0.355, 0.8, 0.08, -0.25, 0, s * 0.05);
    add(Sp(0.055, 10, 8), glove, s * 0.36, 0.76, 0.1);
  });
  if (!bust) {
    if (girl) add(C(0.2, 0.3, 0.22, 16), top2, 0, 0.74, 0);
    [-1, 1].forEach(s => {
      add(C(0.09, 0.075, 0.42, 10), jeans, s * 0.1, 0.52, 0);
      add(Sp(0.072, 8, 6), jeans, s * 0.1, 0.3, 0.01);
      add(C(0.07, 0.06, 0.38, 10), jeans, s * 0.1, 0.17, 0.02);
      add(B(0.12, 0.07, 0.26), shoe, s * 0.1, 0.05, 0.06);
      add(B(0.125, 0.025, 0.27), sole, s * 0.1, 0.012, 0.06);
      add(B(0.1, 0.012, 0.06), top2, s * 0.1, 0.09, 0.1);
    });
  }
  return g;
}
function makeDriver(gender, outfit, skinIdx) {
  const d = makeCharacter(gender, outfit, skinIdx, true); d.scale.setScalar(0.62); return d;
}
// посадить водителя в машину (виден через стёкла)
function seatDriver(car, gender, outfit, skinIdx) {
  const u = car.userData, S = u.S;
  if (u.driver) car.remove(u.driver);
  const d = makeDriver(gender, outfit, skinIdx);
  d.position.set(0.42, S.roof - 0.2 - 1.67 * 0.62, (S.wt + S.rt) / 2 - 0.12);
  car.add(d); u.driver = d;
}
