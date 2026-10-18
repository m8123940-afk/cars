/* Turbo Rivals 3D — подключение предоставленных GLB-моделей.
 * Three.js r128 + его GLTFLoader. Старые визуальные машины/персонажи не возвращаются при ошибке загрузки.
 */
(() => {
  'use strict';
  const MODEL_DIR = './';
  const loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
  const carRoots = new Map();
  const worldCharacters = new Set();
  const staticCharacters = new Set();
  const driverCharacters = new Set();
  const packNames = [
    'M8', 'Urus', 'P1GTR', 'GTR', 'Mustang', 'Mercedes', 'Porsche',
    'Urus.001', 'Porsche.001', 'P1GTR.001', 'Mustang.001', 'Mercedes.001',
    'M8.001', 'GTR.001'
  ];
  const isMobileGPU = /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  let importedCityMeshes = [];
  const extraCityCollisionMeshes = new Set();
  const editorObjects = new Map();
  let carAssetsPromise = null, personPromise = null, cityPromise = null, armsPromise = null;
  let fordTemplate = null, carPackTemplates = [], personTemplate = null, cityTemplate = null;
  let armsRoot = null, armsMixer = null, armsActions = {}, armsCurrent = null, armsOverlay = null, cockpitOverlay = null, steeringWheel = null, gameCamera = null;
  let firstPersonWanted = false, firstPersonContext = 'race', characterMotion = 'idle', characterMotionClock = 0;

  function loadGLB(file) {
    return new Promise((resolve, reject) => {
      if (!loader) { reject(new Error('GLTFLoader CDN недоступен')); return; }
      loader.load(MODEL_DIR + file, gltf => resolve(gltf), undefined, reject);
    });
  }

  // The city is optimized and gzip-compressed to stay below GitHub's 25 MB
  // per-file limit. Decompress in-browser before handing the GLB to GLTFLoader.
  function loadCityGLB() {
    if (!loader) return Promise.reject(new Error('GLTFLoader CDN недоступен'));
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('Этот браузер не поддерживает сжатую карту. Обновите Telegram/WebView.'));
    }
    const file = isMobileGPU ? 'new_york_city_mobile.glb.gz' : 'new_york_city.glb.gz';
    if (typeof window.setCityLoadProgress === 'function') window.setCityLoadProgress(2, 'Подключаем карту Нью-Йорка…');
    return fetch(MODEL_DIR + file, { cache: 'force-cache' }).then(async response => {
      if (!response.ok || !response.body) throw new Error('Не удалось загрузить карту Нью-Йорка: HTTP ' + response.status);
      const total = Number(response.headers.get('content-length')) || 0;
      const reader = response.body.getReader(); const chunks = []; let loaded = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        chunks.push(part.value); loaded += part.value.byteLength;
        if (typeof window.setCityLoadProgress === 'function') window.setCityLoadProgress(total ? Math.min(72, 4 + loaded / total * 68) : 18, 'Загрузка сжатой карты…');
      }
      const payload = await new Blob(chunks).arrayBuffer();
      const magic = new Uint8Array(payload, 0, Math.min(4, payload.byteLength));
      let buffer = payload;
      if (magic[0] === 0x1f && magic[1] === 0x8b) {
        if (typeof window.setCityLoadProgress === 'function') window.setCityLoadProgress(76, 'Распаковываем карту…');
        buffer = await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      } else if (!(magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46)) {
        throw new Error('Сервер вернул не GLB и не gzip-карту. Проверь файлы в корне GitHub Pages.');
      }
      if (typeof window.setCityLoadProgress === 'function') window.setCityLoadProgress(90, 'Подготавливаем здания и материалы…');
      return new Promise((resolve, reject) => loader.parse(buffer, MODEL_DIR, resolve, reject));
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
    // Store a hitbox based on the imported car's actual footprint, not the old
    // procedural shell. OBB collision code consumes these dimensions when ready.
    root.userData.hitboxLength = Math.max(size.x, size.z) * scale;
    root.userData.hitboxWidth = Math.min(size.x, size.z) * scale;
    root.userData.mass = Math.max(0.8, Math.min(2.4, root.userData.hitboxLength * root.userData.hitboxWidth * 0.16));
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
      // This file contains a full vehicle plus separately exported collision/shadow
      // helpers. Use the Ford GT hierarchy only so helper geometry cannot show up.
      fordTemplate = fordGltf.scene.getObjectByName('Ford GT') || fordGltf.scene;
      fordTemplate = fordTemplate.clone(true);
      removeCollisionMeshes(fordTemplate);
      applyAllCars();
      console.info(`[Turbo Rivals] GLB-машины готовы: ${carPackTemplates.length} моделей из Ultimate-пака + Ford GT 2006.`);
    }).catch(error => {
      console.error('[Turbo Rivals] Не удалось загрузить обязательные GLB-машины. Старые модели не включаются.', error);
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
    model.userData.trNewPersonBaseY = model.position.y;
    model.userData.trNewPersonBaseRotZ = model.rotation.z;
    u.trNewPersonAttached = true;
    u.trNewPersonModel = model;
  }
  function attachDriverCharacter(root) {
    if (!root || !root.userData || root.userData.trNewPersonAttached || !personTemplate) return;
    const model = makePersonInstance();
    if (!model) return;
    // Replace all procedural driver's body/helmet geometry with the supplied character.
    root.children.slice().forEach(child => { child.visible = false; });
    model.rotation.x = -0.08; // gentle forward lean while seated; the source model has no sitting rig
    model.scale.y *= 0.94;
    model.userData.trDriverModel = true;
    root.add(model);
    root.userData.trNewPersonAttached = true;
    root.userData.trNewPersonModel = model;
  }
  function ensurePerson() {
    if (personPromise) return personPromise;
    personPromise = loadGLB('new_person.glb').then(gltf => {
      personTemplate = gltf.scene;
      markSharedTree(personTemplate);
      worldCharacters.forEach(attachWorldCharacter);
      staticCharacters.forEach(attachWorldCharacter);
      driverCharacters.forEach(attachDriverCharacter);
      console.info('[Turbo Rivals] Модель персонажа New Person загружена.');
    }).catch(error => {
      console.error('[Turbo Rivals] New Person не загрузился; старый персонаж скрыт, проверьте файл new_person.glb.', error);
      personPromise = null;
    });
    return personPromise;
  }

  function ensureCity() {
    if (cityPromise) return cityPromise;
    cityPromise = loadCityGLB().then(gltf => {
      cityTemplate = gltf.scene;
      const mobileMaterialCache = new Map();
      cityTemplate.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = true;
        o.castShadow = false;
        o.receiveShadow = false;
        const originalList = Array.isArray(o.material) ? o.material : [o.material];
        const materials = originalList.map(original => {
          if (!original) return original;
          let m = original;
          if (isMobileGPU) {
            // Convert physical/transmission materials to simpler standard materials on
            // phones. The base colour and maps remain, but fragile glass/transmission
            // shader branches are skipped; this avoids the all-black WebGL fallback.
            if (!mobileMaterialCache.has(original)) {
              const color = original.color && original.color.clone ? original.color.clone() : new THREE.Color(0xffffff);
              const safe = new THREE.MeshStandardMaterial({
                name: original.name, color, map: original.map || null,
                normalMap: original.normalMap || null, roughnessMap: original.roughnessMap || null,
                metalnessMap: original.metalnessMap || null, aoMap: original.aoMap || null,
                emissiveMap: original.emissiveMap || null,
                emissive: original.emissive && original.emissive.clone ? original.emissive.clone() : new THREE.Color(0x000000),
                roughness: Math.max(Number(original.roughness) || 0.75, 0.68),
                metalness: Math.min(Number(original.metalness) || 0, 0.18),
                opacity: original.opacity == null ? 1 : original.opacity,
                transparent: !!original.transparent, alphaMap: original.alphaMap || null,
                alphaTest: Number(original.alphaTest) || 0, side: THREE.DoubleSide,
                vertexColors: !!original.vertexColors, flatShading: !!original.flatShading,
                depthWrite: original.depthWrite !== false
              });
              safe.userData.trMobileSafeMaterial = true;
              mobileMaterialCache.set(original, safe);
            }
            m = mobileMaterialCache.get(original);
          }
          m.needsUpdate = true;
          if (m.side !== undefined) m.side = THREE.DoubleSide;
          if (m.map) {
            m.map.anisotropy = isMobileGPU ? 1 : Math.min(4, rendererAnisotropy());
            m.map.generateMipmaps = true;
            m.map.minFilter = THREE.LinearMipmapLinearFilter;
            m.map.magFilter = THREE.LinearFilter;
            m.map.needsUpdate = true;
          }
          if (m.emissiveMap) m.emissiveMap.needsUpdate = true;
          return m;
        });
        o.material = Array.isArray(o.material) ? materials : materials[0];
      });
      markSharedTree(cityTemplate);
      console.info('[Turbo Rivals] Оптимизированная карта Нью-Йорка загружена.');
      return cityTemplate;
    }).catch(error => {
      console.error('[Turbo Rivals] Не удалось загрузить New York GLB.', error);
      cityPromise = null;
      return null;
    });
    return cityPromise;
  }
  function rendererAnisotropy() {
    try { return window.gameRenderer ? window.gameRenderer.capabilities.getMaxAnisotropy() : 4; } catch (_) { return 4; }
  }
  function createCityInstance() {
    if (!cityTemplate) return null;
    const holder = new THREE.Group();
    holder.name = 'New York City — world origin (0, 0, 0)';
    const content = cityTemplate.clone(true);
    holder.add(content);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(content);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 1080 / Math.max(size.x, size.z, 1);
    // The map root itself stays exactly at world origin; only its inner content
    // is normalized and centered. This keeps editor coordinates predictable.
    content.position.set(-center.x, -box.min.y, -center.z);
    holder.scale.setScalar(scale);
    holder.position.set(0, 0, 0);
    holder.updateMatrixWorld(true);
    holder.userData.importedNYCity = true;
    holder.userData.trSharedAsset = true;
    const sourceBounds = new THREE.Box3().setFromObject(holder);
    holder.userData.importedBounds = { minX: sourceBounds.min.x, maxX: sourceBounds.max.x, minZ: sourceBounds.min.z, maxZ: sourceBounds.max.z };
    importedCityMeshes = [];
    extraCityCollisionMeshes.clear();
    holder.traverse(o => {
      if (!o.isMesh || o.userData.trEditorSkip) return;
      o.frustumCulled = true;
      o.castShadow = false;
      o.receiveShadow = false;
      // Real triangle raycasts, not oversized boxes around grouped city blocks.
      o.geometry.computeBoundingBox();
      const worldBox = new THREE.Box3().setFromObject(o);
      const sz = worldBox.getSize(new THREE.Vector3());
      if (worldBox.max.y > 2.3 && sz.y > 2.5 && (sz.x > 1 || sz.z > 1)) importedCityMeshes.push(o);
    });
    assignEditorPaths(holder);
    return holder;
  }
  function assignEditorPaths(root) {
    editorObjects.clear();
    const walk = (node, path) => {
      node.userData = node.userData || {};
      node.userData.trEditorPath = path;
      editorObjects.set(path, node);
      node.children.forEach((child, i) => walk(child, path ? path + '.' + i : String(i)));
    };
    root.children.forEach((child, i) => walk(child, String(i)));
  }

  function detachCrashParts(root, severity) {
    if (!root || !root.userData || !root.userData.externalCarRoot || severity < 4.6) return [];
    // Only remove independently modelled GLB parts. Merged geometry cannot become
    // separate debris without modifying the original model, so it is never faked as a cube.
    const external=root.userData.externalCarRoot, candidates=[], wheelCandidates=[], glassCandidates=[];
    const pattern=/^(front|rear|door|bonnet|boot|wind|window|glass|mirror|spoiler|wing|bumper|tire|tyre|wheel|rim)/i;
    external.updateMatrixWorld(true);
    external.traverse(o=>{
      const name=String(o.name||'');
      if(o===external||o.userData.trDetachedPart||!pattern.test(name))return;
      if(!o.isMesh)return;
      const box=new THREE.Box3().setFromObject(o);if(box.isEmpty())return;
      const size=box.getSize(new THREE.Vector3()),largest=Math.max(size.x,size.y,size.z);
      if(largest>5.2)return;
      const wheel=/tire|tyre|wheel|rim/i.test(name),glass=/window|glass|wind/i.test(name);
      // Wheels must be individual, compact meshes. If tires are merged in the asset,
      // do not remove all four as if one wheel could be separated.
      if(wheel){if(largest<=1.55)wheelCandidates.push({object:o,glass:false,wheel:true,score:0});return;}
      if(glass)glassCandidates.push({object:o,glass:true,wheel:false,score:0});
      else if(/door|bonnet|boot|bumper/i.test(name))candidates.push({object:o,glass:false,wheel:false,score:1});
      else candidates.push({object:o,glass:false,wheel:false,score:2});
    });
    const severityRatio=Math.max(0,Math.min(1,(severity-4.2)/3.1));
    // Rare tyre/wheel loss on a hard crash, only if the GLB contains a separately
    // modelled wheel mesh. A remaining rim stays in the car if the pack separates it.
    if(wheelCandidates.length&&severity>=5.6&&Math.random()<0.035+severityRatio*0.075){
      const wheel=wheelCandidates[Math.floor(Math.random()*wheelCandidates.length)];
      if(wheel&&wheel.object.parent){wheel.object.userData.trDetachedPart=true;return [wheel];}
    }
    // Glass can shatter first; otherwise a body panel or bumper may tear away.
    let pool=[];
    if(glassCandidates.length&&severity>=5.1&&Math.random()<0.36+severityRatio*0.25)pool=glassCandidates;
    else pool=candidates;
    if(!pool.length)return [];
    if(Math.random()>Math.max(0.16,Math.min(0.88,(severity-3.6)*0.19)))return [];
    pool.sort((a,b)=>a.score-b.score);
    const best=pool[0].score;pool=pool.filter(c=>c.score<=best+1);
    const choice=pool[Math.floor(Math.random()*pool.length)];
    if(!choice||!choice.object.parent)return [];
    choice.object.userData.trDetachedPart=true;
    return [choice];
  }
  function makeCockpit() {
    if(cockpitOverlay)return cockpitOverlay;
    cockpitOverlay=new THREE.Group();cockpitOverlay.name='TR first-person cockpit controls';
    const dashMat=new THREE.MeshStandardMaterial({color:0x171b20,roughness:0.72,metalness:0.18});
    const trimMat=new THREE.MeshStandardMaterial({color:0x555b64,roughness:0.45,metalness:0.65});
    const screenMat=new THREE.MeshBasicMaterial({color:0x53dff5});
    const wheelMat=new THREE.MeshStandardMaterial({color:0x0c0f12,roughness:0.5,metalness:0.15});
    const dash=new THREE.Mesh(new THREE.BoxGeometry(1.42,0.22,0.34),dashMat);dash.position.set(0,-0.57,-0.98);cockpitOverlay.add(dash);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(1.18,0.035,0.025),trimMat);trim.position.set(0,-0.465,-1.155);cockpitOverlay.add(trim);
    const display=new THREE.Mesh(new THREE.PlaneGeometry(0.25,0.075),screenMat);display.position.set(0,-0.525,-1.16);cockpitOverlay.add(display);
    steeringWheel=new THREE.Group();steeringWheel.name='TR steering wheel';
    const rim=new THREE.Mesh(new THREE.TorusGeometry(0.245,0.031,8,28),wheelMat);steeringWheel.add(rim);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.045,12),trimMat);hub.rotation.x=Math.PI/2;steeringWheel.add(hub);
    const spokeGeo=new THREE.BoxGeometry(0.026,0.22,0.025);
    const spoke=new THREE.Mesh(spokeGeo,trimMat);spoke.position.y=-0.095;steeringWheel.add(spoke);
    const leftSpoke=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.025,0.025),trimMat);leftSpoke.position.set(-0.07,0.015,0);leftSpoke.rotation.z=-0.35;steeringWheel.add(leftSpoke);
    const rightSpoke=leftSpoke.clone();rightSpoke.position.x=0.07;rightSpoke.rotation.z=0.35;steeringWheel.add(rightSpoke);
    steeringWheel.position.set(0,-0.36,-0.9);cockpitOverlay.add(steeringWheel);
    // Two metallic pedals are visible near the lower edge of the cockpit.
    for(const x of [-0.20,0.20]){
      const pedal=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.19,0.035),trimMat);pedal.position.set(x,-0.88,-0.58);pedal.rotation.x=-0.18;cockpitOverlay.add(pedal);
      for(let n=0;n<3;n++){const groove=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.012,0.008),dashMat);groove.position.set(x,-0.83-n*0.045,-0.555);cockpitOverlay.add(groove);}
    }
    cockpitOverlay.visible=false;
    cockpitOverlay.renderOrder=990;
    cockpitOverlay.traverse(o=>{if(o.isMesh){o.renderOrder=990;if(o.material){o.material.depthTest=false;o.material.depthWrite=false;}}});
    if(gameCamera)gameCamera.add(cockpitOverlay);
    markSharedTree(cockpitOverlay);
    return cockpitOverlay;
  }

  function ensureArms() {
    if (armsPromise) return armsPromise;
    armsPromise = loadGLB('fps_arms.glb').then(gltf => {
      armsRoot = gltf.scene;
      const background=armsRoot.getObjectByName('Background_Background_0');if(background)background.visible=false;
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
      // The old procedural body is now only a hidden physics/damage carrier.
      // This avoids a flash of the old car while the supplied GLB pack loads.
      const u = root.userData, preserve = new Set([u.flame, u.damageSmoke]);
      (u.damageMarks || []).forEach(item => preserve.add(item.mesh));
      (u.baseParts || []).forEach(part => {
        if (!part || preserve.has(part)) return;
        if (part.parent) part.parent.remove(part);
        if (part.geometry && typeof part.geometry.dispose === 'function') part.geometry.dispose();
      });
      ensureCarAssets().then(() => { const rec=carRoots.get(root); if(rec) buildCarVisual(rec); });
    },
    unregister(root) {
      carRoots.delete(root);
      worldCharacters.delete(root);
      staticCharacters.delete(root);
      driverCharacters.delete(root);
    },
    registerDriverCharacter(root) {
      if (!root || !root.userData) return;
      driverCharacters.add(root);
      root.children.slice().forEach(child => { child.visible = false; });
      ensurePerson();
      if (personTemplate) attachDriverCharacter(root);
    },
    registerWorldCharacter(root) {
      if (!root) return;
      worldCharacters.add(root);
      // Never show the retired procedural character while New Person is loading.
      const u = root.userData || {};
      if (u.bodyGroup) u.bodyGroup.children.forEach(child => { child.visible = false; });
      (u.arms || []).forEach(part => { part.visible = false; });
      (u.legs || []).forEach(part => { part.visible = false; });
      ensurePerson();
      if (personTemplate) attachWorldCharacter(root);
    },
    registerCharacter(root) {
      if (!root || !root.userData) return;
      root.userData.trOriginalCharacterParts = root.children.slice();
      root.userData.trOriginalCharacterParts.forEach(part => { if (part) part.visible = false; });
      staticCharacters.add(root);
      ensurePerson();
      if (personTemplate) attachWorldCharacter(root);
    },
    ensureCity,
    createCityInstance,
    getCityMeshes() { return importedCityMeshes.concat([...extraCityCollisionMeshes]); },
    registerCityCollision(mesh) { if(mesh&&mesh.isMesh)extraCityCollisionMeshes.add(mesh); },
    getEditorObjects() { return editorObjects; },
    setCamera(camera) {
      gameCamera = camera || null;
      if (armsOverlay && gameCamera && armsOverlay.parent !== gameCamera) gameCamera.add(armsOverlay);
      if (cockpitOverlay && gameCamera && cockpitOverlay.parent !== gameCamera) gameCamera.add(cockpitOverlay);
    },
    setFirstPerson(active, context = 'race') {
      firstPersonWanted = !!active;
      firstPersonContext = context;
      if (firstPersonWanted) ensureArms();
      const driving=firstPersonContext==='drive'||firstPersonContext==='race';
      if(driving)makeCockpit();
      if (armsOverlay) {
        armsOverlay.visible = firstPersonWanted;
        if(firstPersonContext==='drive'){armsOverlay.position.set(0,-0.48,-0.79);armsOverlay.scale.setScalar(0.15);}
        else {armsOverlay.position.set(0,-0.54,-0.72);armsOverlay.scale.setScalar(0.18);}
        armsOverlay.renderOrder=995;
        armsOverlay.traverse(o=>{if(o.isMesh){o.renderOrder=995;if(o.material){o.material.depthTest=false;o.material.depthWrite=false;}}});
        playArmsAction(wantedArmsClip());
      }
      if(cockpitOverlay)cockpitOverlay.visible=firstPersonWanted&&driving;
    },
    setSteer(value) { if(steeringWheel)steeringWheel.rotation.z=Math.max(-1,Math.min(1,Number(value)||0))*0.48; },
    detachCrashParts,
    setCharacterMotion(moving, sprinting) {
      characterMotion = !moving ? 'idle' : sprinting ? 'sprint' : 'walk';
      if (firstPersonWanted) playArmsAction(wantedArmsClip());
    },
    update(dt) {
      const step = Math.min(0.05, Math.max(0, dt || 0));
      if (armsMixer && firstPersonWanted) armsMixer.update(step);
      characterMotionClock += step;
      for (const root of [...worldCharacters, ...staticCharacters]) {
        const model = root && root.userData && root.userData.trNewPersonModel;
        if (!model) continue;
        const isPlayer = !!root.userData.playerPed;
        const moving = isPlayer ? (characterMotion === 'walk' || characterMotion === 'sprint') : Number(root.userData.trWalkSpeed || 0) > 0;
        const speed = isPlayer && characterMotion === 'sprint' ? 13 : 8 + (Number(root.userData.trWalkSpeed) || 0) * 2;
        // The supplied new_person.glb has no skeleton or animation clips. This subtle
        // whole-model bob/sway is a fallback only; limbs cannot be articulated without a rig.
        const phase = characterMotionClock * speed + (Number(root.userData.trMotionPhase) || 0);
        model.position.y = (model.userData.trNewPersonBaseY || 0) + (moving ? Math.abs(Math.sin(phase)) * 0.025 : Math.sin(characterMotionClock * 1.6) * 0.004);
        model.rotation.z = (model.userData.trNewPersonBaseRotZ || 0) + (moving ? Math.sin(phase) * 0.025 : 0);
      }
    }
  };
})();
