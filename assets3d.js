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

  // GitHub web uploader rejects individual files over 25 MB. The New York GLB
  // is stored as small binary parts in the repository root and reassembled here.
  function loadSplitCityGLB() {
    if (!loader) return Promise.reject(new Error('GLTFLoader CDN недоступен'));
    const parts = [
      'new_york_city.glb.part1',
      'new_york_city.glb.part2',
      'new_york_city.glb.part3',
      'new_york_city.glb.part4'
    ];
    return Promise.all(parts.map(file => fetch(MODEL_DIR + file).then(response => {
      if (!response.ok) throw new Error('Не удалось загрузить часть города: ' + file);
      return response.arrayBuffer();
    }))).then(buffers => {
      const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      const combined = new Uint8Array(total);
      let offset = 0;
      for (const buffer of buffers) {
        combined.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      return new Promise((resolve, reject) => {
        loader.parse(combined.buffer, MODEL_DIR, resolve, reject);
      });
    });
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
    // new_person.glb is a static, non-rigged full-body model. Placing it on top of
    // the game's animated arms/legs hid those limbs and made the player look frozen.
    // Keep the uploaded GLB available as an asset, but preserve the game's articulated,
    // animated character until a properly rigged player model is provided.
    if (!root || !root.userData || root.userData.trNewPersonChecked || !personTemplate) return;
    root.userData.trNewPersonChecked = true;
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
      console.warn('[Turbo Rivals] New York GLB не загрузился; используется процедурный город.', error);
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
      // The source FPS asset includes an opaque background card closer to the camera
      // than the hands. Remove it or it hides the entire first-person model.
      const backgroundMeshes = [];
      armsRoot.traverse(o => { if (o.isMesh && /background/i.test(o.name || '')) backgroundMeshes.push(o); });
      backgroundMeshes.forEach(mesh => {
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(mat => { if (mat && mat.dispose) mat.dispose(); });
      });
      armsRoot.scale.setScalar(0.36);
      armsOverlay = new THREE.Group();
      armsOverlay.name = 'TR first-person animated arms';
      armsOverlay.add(armsRoot);
      armsOverlay.position.set(0, -0.45, -0.66);
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
    if (characterMotion === 'sprint' && armsActions.Sprint_Type_1) return 'Sprint_Type_1';
    if (characterMotion === 'walk' && armsActions.Walk) return 'Walk';
    return armsActions.Idle_Fidget ? 'Idle_Fidget' : 'Idle';
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
