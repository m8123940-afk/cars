/* Turbo Rivals 3D — подключение предоставленных GLB-моделей.
 * Three.js r128 + его GLTFLoader. При ошибке загрузки остаются процедурные модели.
 */
(() => {
  'use strict';
  const MODEL_DIR = './';
  const loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
  const carRoots = new Map();
  const worldCharacters = new Set();
  const staticCharacters = new Set();
  const packNames = [
    'M8', 'Urus', 'P1GTR', 'GTR', 'Mustang', 'Mercedes', 'Porsche',
    'Urus.001', 'Porsche.001', 'P1GTR.001', 'Mustang.001', 'Mercedes.001',
    'M8.001', 'GTR.001'
  ];
  let carAssetsPromise = null, personPromise = null, cityPromise = null, armsPromise = null;
  let fordTemplate = null, carPackTemplates = [], personTemplate = null, cityTemplate = null;
  let armsRoot = null, armsMixer = null, armsActions = {}, armsCurrent = null, armsOverlay = null, gameCamera = null;
  let firstPersonWanted = false, firstPersonContext = 'race', characterMotion = 'idle';

  function loadGLB(file) {
    return new Promise((resolve, reject) => {
      if (!loader) { reject(new Error('GLTFLoader CDN недоступен')); return; }
      loader.load(MODEL_DIR + file, gltf => resolve(gltf), undefined, reject);
    });
  }

  // GitHub's browser uploader limits individual files, so New York is stored
  // in four binary parts. Fetch them strictly one-by-one, report progress and
  // yield between parts so mobile browsers can render the loading screen.
  let cityLoadingUI = null;
  function ensureCityLoadingUI() {
    if (cityLoadingUI) return cityLoadingUI;
    const style = document.createElement('style');
    style.textContent = `
      #trCityLoader{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse at top,#20334d 0%,#090d14 72%);color:#f4f7ff;font:15px/1.45 system-ui,-apple-system,sans-serif;text-align:center}
      #trCityLoader .tr-card{width:min(440px,100%);padding:28px 22px;border:1px solid #ffffff24;border-radius:22px;background:#101722ed;box-shadow:0 24px 80px #0009}
      #trCityLoader .tr-title{font-size:24px;font-weight:850;letter-spacing:.04em;margin:0 0 8px}
      #trCityLoader .tr-sub{color:#b6c4d9;margin:0 0 20px}
      #trCityLoader .tr-track{height:12px;border-radius:99px;background:#273345;overflow:hidden}
      #trCityLoader .tr-fill{height:100%;width:0;background:linear-gradient(90deg,#27d7ff,#6af5a5);border-radius:99px;transition:width .18s ease}
      #trCityLoader .tr-percent{font-size:28px;font-weight:800;margin:13px 0 2px;font-variant-numeric:tabular-nums}
      #trCityLoader .tr-status{color:#d3deee;min-height:22px}
      #trCityLoader .tr-note{font-size:12px;color:#8294ad;margin:16px 0 0}
    `;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'trCityLoader';
    el.innerHTML = '<div class="tr-card" role="status" aria-live="polite"><p class="tr-title">NEW YORK</p><p class="tr-sub">Подготовка открытого мира</p><div class="tr-track"><div class="tr-fill"></div></div><div class="tr-percent">0%</div><div class="tr-status">Подготовка загрузки…</div><p class="tr-note">Части загружаются по очереди, чтобы снизить нагрузку на телефон.</p></div>';
    document.body.appendChild(el);
    cityLoadingUI = { el, fill: el.querySelector('.tr-fill'), percent: el.querySelector('.tr-percent'), status: el.querySelector('.tr-status') };
    return cityLoadingUI;
  }
  function setCityLoading(percent, status, visible = true) {
    const ui = ensureCityLoadingUI();
    ui.el.style.display = visible ? 'flex' : 'none';
    ui.fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
    ui.percent.textContent = Math.round(Math.max(0, Math.min(100, percent))) + '%';
    ui.status.textContent = status || '';
  }
  function yieldToBrowser(ms = 180) {
    return new Promise(resolve => setTimeout(() => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else resolve();
    }, ms));
  }
  async function loadSplitCityGLB() {
    if (!loader) throw new Error('GLTFLoader CDN недоступен');
    const parts = [
      { file: 'new_york_city.glb.part1', label: 'Часть 1 из 4', size: 16777216 },
      { file: 'new_york_city.glb.part2', label: 'Часть 2 из 4', size: 16777216 },
      { file: 'new_york_city.glb.part3', label: 'Часть 3 из 4', size: 16777216 },
      { file: 'new_york_city.glb.part4', label: 'Часть 4 из 4', size: 12960828 }
    ];
    const totalBytes = parts.reduce((sum, part) => sum + part.size, 0);
    // Allocate the final buffer once; only one network part is in flight at a time.
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    setCityLoading(0, 'Подключение к GitHub…');
    await yieldToBrowser(80);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      setCityLoading(offset / totalBytes * 88, `Загрузка ${part.label}…`);
      const response = await fetch(MODEL_DIR + part.file, { cache: 'force-cache' });
      if (!response.ok) throw new Error('Не удалось загрузить часть города: ' + part.file + ' (' + response.status + ')');
      if (response.body && response.body.getReader) {
        const reader = response.body.getReader();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const chunk = result.value;
          if (offset + chunk.byteLength > totalBytes) throw new Error('Размер частей Нью-Йорка больше ожидаемого.');
          combined.set(chunk, offset);
          offset += chunk.byteLength;
          const pct = (offset / totalBytes) * 88;
          setCityLoading(pct, `Загрузка ${part.label}… ${Math.round(offset / totalBytes * 100)}% города`);
        }
      } else {
        const buffer = await response.arrayBuffer();
        if (offset + buffer.byteLength > totalBytes) throw new Error('Размер частей Нью-Йорка больше ожидаемого.');
        combined.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      if (i < parts.length - 1) {
        setCityLoading(offset / totalBytes * 88, `${part.label} готова. Подготовка памяти…`);
        // Give iOS Safari time to paint progress and process the previous chunk before next fetch.
        await yieldToBrowser(260);
      }
    }
    if (offset !== totalBytes) throw new Error(`Неполная модель Нью-Йорка: получено ${offset} из ${totalBytes} байт.`);
    setCityLoading(90, 'Все части получены. Проверка и сборка модели…');
    await yieldToBrowser(120);
    const parsed = await new Promise((resolve, reject) => {
      loader.parse(combined.buffer, MODEL_DIR, resolve, reject);
    });
    setCityLoading(98, 'Оптимизация сцены и подготовка города…');
    await yieldToBrowser(180);
    setCityLoading(100, 'Нью-Йорк готов!', true);
    await yieldToBrowser(450);
    setCityLoading(100, '', false);
    return parsed;
  }
  function mod(n, m) { return ((n % m) + m) % m; }
  function markSharedTree(root) {
    root.traverse(o => { o.userData = o.userData || {}; o.userData.trSharedAsset = true; });
    return root;
  }
  function isCollisionMesh(o) {
    return /bullet[_ .-]*col|collision|shadowmesh/i.test(o.name || '');
  }
  function removeCollisionMeshes(root) {
    const doomed = [];
    root.traverse(o => { if (o.isMesh && isCollisionMesh(o)) doomed.push(o); });
    doomed.forEach(o => { if (o.parent) o.parent.remove(o); });
  }

  function makeNormalisedInstance(source, options = {}) {
    const holder = new THREE.Group();
    holder.name = options.name || 'TR imported model';
    const model = source.clone(true);
    holder.add(model);
    if (options.rotateY !== undefined) model.rotation.y = options.rotateY;
    holder.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    let scale = 1;
    if (options.height && size.y > 1e-5) scale = options.height / size.y;
    else if (options.length && Math.max(size.x, size.z) > 1e-5) scale = options.length / Math.max(size.x, size.z);
    holder.scale.setScalar(scale);
    holder.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    markSharedTree(holder);
    holder.userData.trImportedModel = true;
    return holder;
  }

  // GLB-колёса не имеют анимационных клипов, поэтому ставим pivot в центр каждой детали колеса.
  function prepareWheelPivots(model) {
    model.updateMatrixWorld(true);
    const wheelMeshes = [];
    model.traverse(o => {
      if (o.isMesh && /wheel|tire|tyre|rim/i.test(o.name || '') && !isCollisionMesh(o)) wheelMeshes.push(o);
    });
    const pivots = [];
    for (const mesh of wheelMeshes) {
      if (!mesh.parent) continue;
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) continue;
      const centerWorld = box.getCenter(new THREE.Vector3());
      const centerLocal = model.worldToLocal(centerWorld.clone());
      const pivot = new THREE.Group();
      pivot.name = 'TR animated wheel pivot';
      pivot.position.copy(centerLocal);
      model.add(pivot);
      pivot.attach(mesh); // сохраняет положение детали и переносит её вращение на центр колеса
      pivots.push(pivot);
    }
    return pivots;
  }

  function buildCarVisual(record) {
    const root = record.root;
    if (!root || !root.userData || root.userData.externalCarRoot) return;
    const index = Math.max(0, Number(record.index) || 0);
    const useFord = index >= 20 && !!fordTemplate;
    const source = useFord ? fordTemplate : carPackTemplates.length ? carPackTemplates[mod(index, carPackTemplates.length)] : null;
    if (!source) return;

    const model = source.clone(true);
    removeCollisionMeshes(model);
    const pivots = prepareWheelPivots(model);
    const external = new THREE.Group();
    external.name = useFord ? '2006 Ford GT — external visual' : 'Ultimate pack — external visual';
    model.rotation.y = Math.PI; // исходные модели смотрят по -Z, игровой автомобиль — по +Z
    external.add(model);
    external.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(external);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetLength = Math.max(4.0, Math.min(5.0, Number(root.userData.len) || 4.55));
    const scale = targetLength / Math.max(size.x, size.z, 0.001);
    external.scale.setScalar(scale);
    external.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    markSharedTree(external);
    external.userData.trSharedAsset = true;
    root.add(external);

    const u = root.userData;
    u.externalCarRoot = external;
    u.externalWheels = pivots;
    const retain = new Set([u.flame, u.damageSmoke]);
    (u.damageMarks || []).forEach(item => retain.add(item.mesh));
    (u.baseParts || []).forEach(part => { if (part && !retain.has(part)) part.visible = false; });
  }

  function applyAllCars() {
    for (const record of carRoots.values()) {
      try { buildCarVisual(record); }
      catch (error) { console.warn('[Turbo Rivals] Не удалось подключить модель машины:', error); }
    }
  }
  function ensureCarAssets() {
    if (carAssetsPromise) return carAssetsPromise;
    carAssetsPromise = Promise.all([
      loadGLB('ultimate_car_pack.glb'),
      loadGLB('ford_gt_2006.glb')
    ]).then(([packGltf, fordGltf]) => {
      const packRoot = packGltf.scene.getObjectByName('RootNode');
      carPackTemplates = packNames.map(name => packRoot && packRoot.children.find(child => child.name === name)).filter(Boolean);
      if (!carPackTemplates.length) throw new Error('В Ultimate-паке не найдены отдельные модели машин');
      fordTemplate = fordGltf.scene;
      removeCollisionMeshes(fordTemplate);
      applyAllCars();
      console.info(`[Turbo Rivals] GLB-машины готовы: ${carPackTemplates.length} моделей из Ultimate-пака + Ford GT 2006.`);
    }).catch(error => {
      console.warn('[Turbo Rivals] GLB-машины недоступны, оставлены процедурные модели.', error);
      carAssetsPromise = null;
    });
    return carAssetsPromise;
  }

  function makePersonInstance() {
    if (!personTemplate) return null;
    return makeNormalisedInstance(personTemplate, { height: 1.78, name: 'New Person — character model' });
  }
  function attachWorldCharacter(root) {
    if (!root || !root.userData || root.userData.trNewPersonAttached || !personTemplate) return;
    const u = root.userData;
    const model = makePersonInstance();
    if (!model) return;
    const body = u.bodyGroup || root;
    if (u.bodyGroup) {
      body.children.forEach(child => { child.visible = false; });
      (u.arms || []).forEach(arm => { arm.visible = false; });
      (u.legs || []).forEach(leg => { leg.visible = false; });
    } else {
      (u.trOriginalCharacterParts || []).forEach(part => { if (part) part.visible = false; });
    }
    body.add(model);
    u.trNewPersonAttached = true;
    u.trNewPersonModel = model;
  }
  function ensurePerson() {
    if (personPromise) return personPromise;
    personPromise = loadGLB('new_person.glb').then(gltf => {
      personTemplate = gltf.scene;
      markSharedTree(personTemplate);
      worldCharacters.forEach(attachWorldCharacter);
      staticCharacters.forEach(attachWorldCharacter);
      console.info('[Turbo Rivals] Модель персонажа New Person загружена.');
    }).catch(error => {
      console.warn('[Turbo Rivals] New Person не загрузился; используется прежний персонаж.', error);
      personPromise = null;
    });
    return personPromise;
  }

  function ensureCity() {
    if (cityPromise) return cityPromise;
    cityPromise = loadSplitCityGLB().then(gltf => {
      cityTemplate = gltf.scene;
      markSharedTree(cityTemplate);
      console.info('[Turbo Rivals] Модель открытого мира Нью-Йорк загружена.');
      return cityTemplate;
    }).catch(error => {
      setCityLoading(0, 'Не удалось загрузить Нью-Йорк. Используется стандартный город.', true);
      console.warn('[Turbo Rivals] New York GLB не загрузился; используется процедурный город.', error);
      setTimeout(() => setCityLoading(0, '', false), 2200);
      cityPromise = null;
      return null;
    });
    return cityPromise;
  }
  function createCityInstance() {
    if (!cityTemplate) return null;
    // Сохраняем широкий городской план и масштабируем его до игрового района ~1 км.
    return makeNormalisedInstance(cityTemplate, { length: 1080, name: 'New York City — imported open world' });
  }

  function ensureArms() {
    if (armsPromise) return armsPromise;
    armsPromise = loadGLB('fps_arms.glb').then(gltf => {
      armsRoot = gltf.scene;
      armsRoot.scale.setScalar(0.18);
      armsOverlay = new THREE.Group();
      armsOverlay.name = 'TR first-person animated arms';
      armsOverlay.add(armsRoot);
      armsOverlay.position.set(0, -0.54, -0.72);
      markSharedTree(armsOverlay);
      if (gameCamera && gameCamera.add) gameCamera.add(armsOverlay);
      armsMixer = new THREE.AnimationMixer(armsRoot);
      for (const clip of (gltf.animations || [])) {
        const shortName = String(clip.name || '').split('|').pop();
        armsActions[shortName] = armsMixer.clipAction(clip);
      }
      armsOverlay.visible = firstPersonWanted;
      playArmsAction(wantedArmsClip());
      console.info('[Turbo Rivals] Загружены анимации рук от первого лица.');
    }).catch(error => {
      console.warn('[Turbo Rivals] FPS-анимации не загрузились; камера останется без рук.', error);
      armsPromise = null;
    });
    return armsPromise;
  }
  function wantedArmsClip() {
    if (firstPersonContext === 'world' && characterMotion === 'sprint') return armsActions.Sprint_Type_1 ? 'Sprint_Type_1' : 'Walk';
    if (firstPersonContext === 'world' && characterMotion === 'walk') return 'Walk';
    return 'Idle';
  }
  function playArmsAction(name) {
    if (!armsMixer || !armsActions[name] || armsCurrent === name) return;
    const next = armsActions[name];
    next.reset().fadeIn(0.18).play();
    if (armsCurrent && armsActions[armsCurrent]) armsActions[armsCurrent].fadeOut(0.18);
    armsCurrent = name;
  }

  window.TRModels = {
    registerCar(root, id, index) {
      if (!root || !root.userData) return;
      root.userData.carId = id;
      root.userData.carIndex = index;
      carRoots.set(root, { root, id, index });
      ensureCarAssets();
    },
    unregister(root) {
      carRoots.delete(root);
      worldCharacters.delete(root);
      staticCharacters.delete(root);
    },
    registerWorldCharacter(root) {
      if (!root) return;
      worldCharacters.add(root);
      ensurePerson();
      if (personTemplate) attachWorldCharacter(root);
    },
    registerCharacter(root) {
      if (!root || !root.userData) return;
      root.userData.trOriginalCharacterParts = root.children.slice();
      staticCharacters.add(root);
      ensurePerson();
      if (personTemplate) attachWorldCharacter(root);
    },
    ensureCity,
    createCityInstance,
    setCamera(camera) {
      gameCamera = camera || null;
      if (armsOverlay && gameCamera && armsOverlay.parent !== gameCamera) gameCamera.add(armsOverlay);
    },
    setFirstPerson(active, context = 'race') {
      firstPersonWanted = !!active;
      firstPersonContext = context;
      if (firstPersonWanted) ensureArms();
      if (armsOverlay) {
        armsOverlay.visible = firstPersonWanted;
        playArmsAction(wantedArmsClip());
      }
    },
    setCharacterMotion(moving, sprinting) {
      characterMotion = !moving ? 'idle' : sprinting ? 'sprint' : 'walk';
      if (firstPersonWanted) playArmsAction(wantedArmsClip());
    },
    update(dt) {
      if (armsMixer && firstPersonWanted) armsMixer.update(Math.min(0.05, Math.max(0, dt || 0)));
    }
  };
})();
