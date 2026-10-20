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
  let personClips = [];
  const characterAnimations = new Map();
  let carPackTemplates = [], personTemplate = null, cityTemplate = null;
  let personTemplates = {}, personClipsByGender = {}, personHasOwnHair = false;
  const GEN_CAR_NAMES = ['gen_sedan', 'gen_muscle', 'gen_wedge', 'gen_hyper', 'gen_suv', 'gen_retro'];
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

  function cloneModel(source) {
    if (THREE.SkeletonUtils && typeof THREE.SkeletonUtils.clone === 'function') return THREE.SkeletonUtils.clone(source);
    const clone = source.clone(true);
    const sourceBones=[],cloneBones=[];source.traverse(o=>{if(o.isBone)sourceBones.push(o);});clone.traverse(o=>{if(o.isBone)cloneBones.push(o);});
    const boneMap=new Map();sourceBones.forEach((b,i)=>{if(cloneBones[i])boneMap.set(b,cloneBones[i]);});
    clone.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton){const sk=o.skeleton.clone();sk.bones=o.skeleton.bones.map(b=>boneMap.get(b)||b);o.bind(sk,o.bindMatrix);}});
    return clone;
  }
  function makeNormalisedInstance(source, options = {}) {
    const holder = new THREE.Group();
    holder.name = options.name || 'TR imported model';
    const model = cloneModel(source);
    if (options.rotateX !== undefined) model.rotation.x = options.rotateX;
    if (options.rotateY !== undefined) model.rotation.y = options.rotateY;
    holder.add(model);
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

  // ---- Оптимизация шаблонов машин (один раз на модель, клоны используют общие геометрию/материалы) ----
  function optimizeCarTemplate(template) {
    if (!template || template.userData.trOptimized) return;
    template.userData.trOptimized = true;
    template.updateMatrixWorld(true);
    const whole = new THREE.Box3().setFromObject(template);
    const L = Math.max(whole.getSize(new THREE.Vector3()).length() * 0.5, 0.001);
    const cache = new Map();
    const lite = m => {
      if (!m) return m;
      if (Array.isArray(m)) return m.map(lite);
      if (cache.has(m)) return cache.get(m);
      let out = m;
      // MeshPhysicalMaterial (clearcoat/specular) очень дорог на телефоне
      if (isMobileGPU && m.isMeshPhysicalMaterial) {
        out = new THREE.MeshStandardMaterial({
          color: m.color, map: m.map, normalMap: m.normalMap, roughness: m.roughness, metalness: m.metalness,
          roughnessMap: m.roughnessMap, metalnessMap: m.metalnessMap, emissive: m.emissive, emissiveMap: m.emissiveMap,
          emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, side: m.side,
          alphaTest: m.alphaTest, vertexColors: m.vertexColors
        });
        out.name = m.name;
      }
      [out.map, out.normalMap, out.roughnessMap, out.metalnessMap, out.emissiveMap].forEach(t => { if (t) t.anisotropy = isMobileGPU ? 1 : Math.min(4, t.anisotropy || 4); });
      cache.set(m, out); return out;
    };
    template.traverse(o => {
      if (!o.isMesh) return;
      // дублирующее «разбитое» стекло Ford даёт мерцание и лишний draw call
      if (/glass_dam|_dam$/i.test(o.name || '')) { o.visible = false; return; }
      o.material = lite(o.material);
      o.frustumCulled = true;
      if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const b = new THREE.Box3().setFromObject(o);
      const big = b.getSize(new THREE.Vector3()).length() > L * 0.55;
      o.castShadow = !isMobileGPU ? true : big;   // на телефоне тени бросают только крупные детали
      o.receiveShadow = false;
    });
  }

  // ---- Автоопределение ориентации машины (перед = +Z, верх = +Y) ----
  // В паках у моделей есть собственные повороты (Ultimate: X -90°, Ford: матрица Sketchfab).
  // Раньше код ставил model.rotation.y = PI: это ЗАМЕНЯЛО Y-угол Эйлера и ломало поворот,
  // из-за чего машины ехали задом наперёд и стояли «вверх ногами».
  // Теперь поворот делается через отдельную обёртку и подбирается по самой геометрии.
  const carOrientCache = new WeakMap();
  function measureCarOrientation(pivot) {
    pivot.updateMatrixWorld(true);
    const all = new THREE.Box3(), tires = [], front = [], rear = [];
    pivot.traverse(o => {
      if (!o.isMesh) return;
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty()) return;
      all.union(b);
      const c = b.getCenter(new THREE.Vector3());
      const nm = String(o.name || '') + ' ' + String((o.parent && o.parent.name) || '');
      if (/tire|tyre|wheel|rim/i.test(nm)) { tires.push(c); return; }
      if (/front/i.test(nm)) front.push(c);
      else if (/rear|back/i.test(nm)) rear.push(c);
    });
    const mean = list => list.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, list.length));
    const size = all.getSize(new THREE.Vector3()), center = all.getCenter(new THREE.Vector3());
    return {
      size, center,
      upDelta: tires.length ? mean(tires).y - center.y : null,
      fwdDelta: front.length && rear.length ? mean(front).z - mean(rear).z : null
    };
  }
  function rotateWorld(pivot, axis, angle) {
    pivot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  }
  function getCarOrientation(source, pivot) {
    const cached = carOrientCache.get(source);
    if (cached) return cached.clone();
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    pivot.quaternion.identity();
    let m = measureCarOrientation(pivot);
    // 1) модель лежит на боку / стоит торчком: высота должна быть минимальной осью
    if (m.size.y > Math.max(m.size.x, m.size.z) * 0.85) {
      const q0 = pivot.quaternion.clone(); let best = null;
      for (const [axis, ang] of [[X, Math.PI / 2], [X, -Math.PI / 2], [Z, Math.PI / 2], [Z, -Math.PI / 2]]) {
        pivot.quaternion.copy(q0); rotateWorld(pivot, axis, ang);
        const t = measureCarOrientation(pivot);
        if (!best || t.size.y < best.h) best = { h: t.size.y, q: pivot.quaternion.clone() };
      }
      pivot.quaternion.copy(best.q); m = measureCarOrientation(pivot);
    }
    // 2) вверх ногами: колёса выше центра кузова
    if (m.upDelta !== null && m.upDelta > 0) { rotateWorld(pivot, Z, Math.PI); m = measureCarOrientation(pivot); }
    // 3) длинная ось должна идти по Z
    if (m.size.x > m.size.z * 1.15) { rotateWorld(pivot, Y, Math.PI / 2); m = measureCarOrientation(pivot); }
    // 4) нос должен смотреть в +Z (в игре машина едет по направлению (sin h, cos h))
    if (m.fwdDelta !== null) { if (m.fwdDelta < 0) rotateWorld(pivot, Y, Math.PI); }
    else rotateWorld(pivot, Y, Math.PI); // нет имён деталей — прежнее поведение (нос в -Z)
    const result = pivot.quaternion.clone();
    carOrientCache.set(source, result);
    return result.clone();
  }

  // Finds the wheel nodes (Tires/Rims) of an imported car and groups each wheel into a
  // steer pivot (front wheels turn with the steering) containing a spin group (wheel rolls).
  // Works in the car's own frame, so it must run after the nose-forward orientation is applied.
  function setupWheelRigs(carFrame) {
    try {
      carFrame.updateMatrixWorld(true);
      const inv = carFrame.matrixWorld.clone().invert();
      const nodes = [];
      carFrame.traverse(o => {
        const isWheelName = /^(tires?|rims?|wheels?)(\.\d+)?$/i.test(o.name);
        // Take the outermost matching node only, so a wheel group is not collected twice.
        let nested = false; for (let p = o.parent; p && p !== carFrame; p = p.parent) if (/^(tires?|rims?|wheels?)(\.\d+)?$/i.test(p.name)) nested = true;
        if (isWheelName && !nested && !o.userData.trWheelRig) nodes.push(o);
      });
      if (!nodes.length) return [];
      const bodyBox = new THREE.Box3().setFromObject(carFrame);
      const bodyCenter = bodyBox.getCenter(new THREE.Vector3());
      const bodyLen = Math.max(bodyBox.max.x - bodyBox.min.x, bodyBox.max.z - bodyBox.min.z) || 1;
      const items = nodes.map(o => {
        const b = new THREE.Box3().setFromObject(o);
        const c = b.getCenter(new THREE.Vector3()).applyMatrix4(inv);
        return { o, c };
      });
      const clusters = [];
      for (const it of items) {
        const hit = clusters.find(cl => cl.c.distanceTo(it.c) < bodyLen * 0.22);
        if (hit) { hit.items.push(it); hit.c.multiplyScalar(0); hit.items.forEach(x => hit.c.add(x.c)); hit.c.multiplyScalar(1 / hit.items.length); }
        else clusters.push({ c: it.c.clone(), items: [it] });
      }
      const rigs = [];
      for (const cl of clusters) {
        const box = new THREE.Box3();
        cl.items.forEach(x => box.expandByObject(x.o));
        const size = box.getSize(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(carFrame.quaternion.clone().invert()));
        const dims = [Math.abs(size.x), Math.abs(size.y), Math.abs(size.z)];
        const diameter = Math.max(...dims.filter((_, i) => i !== dims.indexOf(Math.min(...dims))));
        // A wheel is small relative to the car; skip clusters that cover the whole body (merged geometry).
        if (diameter > bodyLen * 0.45 || diameter < bodyLen * 0.05) continue;
        const axisIdx = dims.indexOf(Math.min(...dims));
        const axis = ['x', 'y', 'z'][axisIdx];
        const pivot = new THREE.Group(); pivot.name = 'TR wheel steer';
        pivot.rotation.order = 'YXZ';
        const spin = new THREE.Group(); spin.name = 'TR wheel spin';
        pivot.add(spin);
        pivot.position.copy(cl.c);
        carFrame.add(pivot);
        pivot.updateMatrixWorld(true);
        cl.items.forEach(x => { x.o.userData.trWheelRig = true; spin.attach(x.o); });
        pivot.userData.front = cl.c.z > bodyCenter.z;
        pivot.userData.spin = spin;
        pivot.userData.spinAxis = axis;
        rigs.push(pivot);
      }
      return rigs;
    } catch (err) {
      console.warn('Wheel rig setup skipped', err);
      return [];
    }
  }

  function buildCarVisual(record) {
    const root = record.root;
    if (!root || !root.userData || root.userData.externalCarRoot) return;
    const index = Math.max(0, Number(record.index) || 0);
    // Every garage and traffic slot uses a model from Ultimate Car Pack.
    // Класс машины -> модель: самые дешёвые получают самую простую модель, самые дорогие — самую красивую (Ford GT).
    const total = (typeof CARS !== 'undefined' && CARS.length) ? CARS.length : 22;
    const tier = Math.min(carPackTemplates.length - 1, Math.floor(Math.max(0, index) * carPackTemplates.length / total));
    const source = carPackTemplates.length ? carPackTemplates[tier] : null;
    if (!source) return;

    const model = cloneModel(source);
    removeCollisionMeshes(model);
    // Give each car its own colour: the body panels get a per-instance material copy,
    // so cars that share a body model still look different and the template stays untouched.
    if (Number.isFinite(root.userData.col)) {
      const tint = new THREE.Color(root.userData.col);
      model.traverse(o => {
        if (!o.isMesh || !o.material || !/^(paint|body|front|rear|bonnet|boot|door)/i.test(o.name || '')) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const copies = mats.map(m => { if (!m || !m.color || /glass|window|tire|rim|light|carbon|seam|grille|trim|chrome|handle|arch|vent/i.test(m.name || '')) return m; const c = m.clone(); c.color.copy(tint); return c; });
        o.material = Array.isArray(o.material) ? copies : copies[0];
      });
    }
    const pivots = [];
    const external = new THREE.Group();
    external.name = 'Ultimate pack — external visual';
    // Every car in the Ultimate pack faces -Z in the source scene; rotate its local
    // model once so the game's +Z forward direction is used for every garage slot.
    const orient = new THREE.Group();
    orient.name = 'TR car orientation fix';
    orient.add(model);
    orient.quaternion.copy(getCarOrientation(source, orient));
    external.add(orient);
    external.visible = !(firstPersonWanted && (firstPersonContext === 'drive' || firstPersonContext === 'race'));
    const wheelRigs = setupWheelRigs(orient);
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
    u.externalWheels = wheelRigs;
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
      loadGLB('ford_gt_2006.glb'),
      ...GEN_CAR_NAMES.map(n => loadGLB('car_' + n + '.glb').catch(() => null))
    ]).then(([packGltf, fordGltf, ...genGltfs]) => {
      // Объединяем обе коллекции: модели Ultimate + Ford GT 2006.
      // Каждая модель выбирается по индексу автомобиля в гараже/трафике.
      const packRoot = packGltf.scene.getObjectByName('RootNode');
      const ultimateModels = packNames
        .map(name => packRoot && packRoot.children.find(child => child.name === name))
        .filter(Boolean);
      // От самой простой к самой красивой. В паке Ultimate модели с суффиксом .001 — копии, их не берём.
      // Generated bodies (car_gen_*.glb) are wrapped in a group so they behave like pack templates.
      const genTemplates = {};
      GEN_CAR_NAMES.forEach((n, i) => {
        const g = genGltfs[i];
        if (!g || !g.scene) return;
        const grp = new THREE.Group(); grp.name = 'gen_' + n;
        [...g.scene.children].forEach(c => grp.add(c));
        genTemplates[n] = grp;
      });
      // Weakest class first, strongest last. Ultimate bodies and generated bodies are interleaved by looks.
      const rankOrder = ['Urus', 'gen_suv', 'Mercedes', 'gen_sedan', 'gen_retro', 'Mustang', 'M8', 'gen_muscle', 'Porsche', 'gen_wedge', 'GTR', 'gen_hyper', 'P1GTR'];
      const ranked = rankOrder.map(n => (n.startsWith('gen_') ? genTemplates[n] : ultimateModels.find(m => m.name === n))).filter(Boolean);
      ultimateModels.forEach(m => { if (!/\.001$/.test(m.name) && !ranked.includes(m)) ranked.push(m); });
      carPackTemplates = [...ranked, fordGltf.scene];
      carPackTemplates.forEach(optimizeCarTemplate);
      if (!carPackTemplates.length) throw new Error('Не найдены модели Ultimate или Ford');
      applyAllCars();
      console.info(`[Turbo Rivals] Подключены Ultimate (${ultimateModels.length}) + Ford GT 2006.`);
    }).catch(error => {
      console.error('[Turbo Rivals] Не удалось загрузить оба автомобильных пака.', error);
      carAssetsPromise = null;
    });
    return carAssetsPromise;
  }

  function makePersonInstance(gender='boy') {
    const tpl = personTemplates[gender] || personTemplates.boy || personTemplate;
    if (!tpl) return null;
    return makeNormalisedInstance(tpl, { height: 1.78, name: 'Person — rigged character model (' + gender + ')' });
  }
  // A copy of a clip played faster: the same motion at a higher pace (used for running).
  function retimeClip(clip, factor, name) {
    const tracks = clip.tracks.map(t => new t.constructor(t.name, t.times.map(x => x / factor), t.values.slice()));
    return new THREE.AnimationClip(name, clip.duration / factor, tracks);
  }
  function bindCharacterAnimations(root, model, clips) {
    clips = clips || personClips;
    if(!root||!model||!clips||!clips.length)return;
    try{
      const mixer=new THREE.AnimationMixer(model),actions={};
      for(const clip of clips){actions[clip.name]=mixer.clipAction(clip);}
      // Fill in the clip names the game uses but this model does not have: a single-frame
      // Idle pose from the walk cycle, and Walk/Run/Jump/EnterCar falling back to what exists.
      const walkClip = clips.find(c => c.name === 'Walk') || clips[0];
      if (!actions.Idle && walkClip) actions.Idle = mixer.clipAction(THREE.AnimationUtils.subclip(walkClip, 'Idle', 0, 1, 30));
      if (!actions.Walk && walkClip) actions.Walk = mixer.clipAction(walkClip);
      if (!actions.Run && walkClip) actions.Run = mixer.clipAction(retimeClip(walkClip, 1.75, 'Run'));
      if (!actions.Jump && actions.Walk) actions.Jump = actions.Walk;
      if (!actions.EnterCar && actions.Idle) actions.EnterCar = actions.Idle;
      // Pace: the game moves the person at 2.0 m/s walking and 3.5 m/s sprinting. The Mixamo clips
      // were made for 0.89 and 1.57 m/s, so play them faster to keep the feet on the ground.
      if (clips.paced) {
        if (actions.Walk) actions.Walk.timeScale = 2.0 / 0.893;
        if (actions.Run) actions.Run.timeScale = 3.5 / 1.565;
      }
      characterAnimations.set(root,{mixer,actions,current:'',forcedUntil:0,forcedName:''});
      playCharacterAnimation(root,'Idle');
    }catch(error){console.warn('[Turbo Rivals] Не удалось активировать риг персонажа:',error);}
  }
  function playCharacterAnimation(root,name,forceSeconds=0) {
    const state=characterAnimations.get(root);if(!state||!state.actions[name])return;
    if(state.current!==name){
      const next=state.actions[name];next.reset();
      if(name==='Jump'||name==='EnterCar'){next.setLoop(THREE.LoopOnce,1);next.clampWhenFinished=true;}
      else next.setLoop(THREE.LoopRepeat,Infinity);
      next.fadeIn(0.12).play();
      if(state.current&&state.actions[state.current])state.actions[state.current].fadeOut(0.12);
      state.current=name;
    }
    if(forceSeconds>0){state.forcedName=name;state.forcedUntil=characterMotionClock+forceSeconds;}
  }
  function addFemaleStyling(model) {
    if (!model || !model.userData || model.getObjectByName('TR female hairstyle')) return;
    // The exact same new_person.glb is retained for both characters; a compact hair assembly gives the girl avatar a clear silhouette.
    const hair = new THREE.Group(); hair.name = 'TR female hairstyle';
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x382017, roughness: 0.88, metalness: 0.02 });
    const hairLight = new THREE.MeshStandardMaterial({ color: 0x5b3021, roughness: 0.78, metalness: 0.02 });
    const accessory = new THREE.MeshStandardMaterial({ color: 0xe78bbf, roughness: 0.42, metalness: 0.1 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    cap.position.set(0, 1.735, -0.005); cap.scale.set(1.02, 1.0, 1.0); hair.add(cap);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 8), hairLight);
    fringe.position.set(0, 1.72, 0.115); fringe.scale.set(1.04, 0.36, 0.58); hair.add(fringe);
    for (const side of [-1, 1]) {
      const strand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 9, 7), hairMat);
      strand.position.set(side * 0.15, 1.655, 0.005); strand.scale.set(0.72, 1.2, 0.82); hair.add(strand);
    }
    const pony = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.072, 0.28, 10), hairMat);
    pony.position.set(0.135, 1.535, -0.145); pony.rotation.x = -0.28; pony.rotation.z = -0.18; hair.add(pony);
    const ponyTip = new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 8), hairLight);
    ponyTip.position.set(0.145, 1.405, -0.19); ponyTip.scale.set(0.72, 1.25, 0.72); hair.add(ponyTip);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 6, 12), accessory);
    tie.position.set(0.135, 1.62, -0.145); tie.rotation.x = Math.PI / 2; hair.add(tie);
    for (const side of [-1, 1]) {
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.012), accessory);
      clip.position.set(side * 0.095, 1.725, 0.157); clip.rotation.z = side * 0.16; hair.add(clip);
    }
    hair.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    model.add(hair);
  }

  function attachWorldCharacter(root) {
    if (!root || !root.userData || root.userData.trNewPersonAttached || !personTemplate) return;
    const model = makePersonInstance();
    if (!model) return;
    const gender = (root.userData.trGender || root.userData.gender) === 'girl' ? 'girl' : 'boy';
    if (gender === 'girl' && !personHasOwnHair) addFemaleStyling(model);
    model.name = 'TR visible player character';
    model.visible = true;
    model.traverse(o => { if (o.isMesh) { o.visible = true; o.frustumCulled = false; } });
    // Keep the imported model directly under the actor root. Parenting it under the
    // merged procedural body caused bad inherited transforms on some Three.js clones.
    root.add(model);
    bindCharacterAnimations(root, model, personClipsByGender[gender]);
    // Only hide the fallback body AFTER the imported model has been attached.
    // If new_person.glb fails to load, the player remains visible and controllable.
    const u = root.userData;
    // This root may contain separate old fallback meshes plus a merged copy. Hide
    // every old direct child only after the rigged GLB has been attached successfully.
    root.children.forEach(child => { if (child !== model) child.visible = false; });
    model.visible = true;
    model.userData.trNewPersonBaseY = model.position.y;
    model.userData.trNewPersonBaseRotZ = model.rotation.z;
    u.trNewPersonAttached = true;
    u.trNewPersonModel = model;
  }
  function attachDriverCharacter(root) {
    if (!root || !root.userData || root.userData.trNewPersonAttached || !personTemplate) return;
    const gender = (root.userData.trGender || root.userData.gender) === 'girl' ? 'girl' : 'boy';
    const model = makePersonInstance(gender);
    if (!model) return;
    if (gender === 'girl' && !personHasOwnHair) addFemaleStyling(model);
    // Attach the supplied model first; only then hide the old driver meshes.
    model.rotation.x = -0.08;
    model.scale.y *= 0.94;
    model.userData.trDriverModel = true;
    root.add(model);
    model.visible = true;
    root.children.forEach(child => { if (child !== model) child.visible = false; });
    bindCharacterAnimations(root, model, personClipsByGender[gender]);
    root.userData.trNewPersonAttached = true;
    root.userData.trNewPersonModel = model;
  }
  function ensurePerson() {
    if (personPromise) return personPromise;
    // Two rigged people: a man (person_man.glb) and a woman (person_woman.glb). Either falls back to new_person.glb.
    personPromise = Promise.all([
      loadGLB('person_man.glb').catch(() => loadGLB('new_person.glb')),
      loadGLB('person_woman.glb').catch(() => null)
    ]).then(([man, woman]) => {
      const manClips = Array.isArray(man.animations) ? man.animations : [];
      manClips.forEach((c, i) => { if (!c.name) c.name = i === 0 ? 'Walk' : 'Clip' + i; });
      manClips.paced = true; // Mixamo clips: Walk ~0.89 m/s, Run ~1.57 m/s at their native pace
      personTemplates.boy = man.scene;
      personClipsByGender.boy = manClips;
      if (woman) {
        personTemplates.girl = woman.scene;
        personClipsByGender.girl = Array.isArray(woman.animations) ? woman.animations : [];
        personHasOwnHair = true;
      } else {
        personTemplates.girl = man.scene;
        personClipsByGender.girl = manClips;
        personHasOwnHair = false;
      }
      personTemplate = personTemplates.boy;
      personClips = manClips;
      markSharedTree(personTemplates.boy);
      if (personTemplates.girl !== personTemplates.boy) markSharedTree(personTemplates.girl);
      worldCharacters.forEach(attachWorldCharacter);
      staticCharacters.forEach(attachWorldCharacter);
      driverCharacters.forEach(attachDriverCharacter);
      console.info('[Turbo Rivals] Модели персонажей загружены: мужчина и женщина.');
    }).catch(error => {
      console.error('[Turbo Rivals] New Person не загрузился; остаётся видимый процедурный персонаж, проверьте файл new_person.glb.', error);
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
    const scale = 2.2; // постоянный размер города по требованию: 2.2 × 2.2 × 2.2
    // The map root itself stays exactly at world origin; only its inner content
    // is normalized and centered. This keeps editor coordinates predictable.
    // Keep the imported road surface aligned to world Y=0. Moving the content by -box.min.y
    // lifted the pavement about 0.36 m and buried the player's feet below the visible street.
    content.position.set(-center.x, 0, -center.z);
    holder.scale.setScalar(scale);
    holder.position.set(0, 0, 0);
    holder.updateMatrixWorld(true);
    holder.userData.importedNYCity = true;
    holder.userData.trSharedAsset = true;
    const sourceBounds = new THREE.Box3().setFromObject(holder);
    holder.userData.importedBounds = { minX: sourceBounds.min.x, maxX: sourceBounds.max.x, minY: sourceBounds.min.y, maxY: sourceBounds.max.y, minZ: sourceBounds.min.z, maxZ: sourceBounds.max.z };
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
    if (!root || !root.userData || !root.userData.externalCarRoot || severity < 3.2) return [];
    const external=root.userData.externalCarRoot,candidates=[],wheelCandidates=[],glassCandidates=[];
    const pattern=/^(front|rear|door|bonnet|boot|wind|window|glass|mirror|spoiler|wing|bumper|tire|tyre|wheel|rim|body|paint)/i;
    external.updateMatrixWorld(true);
    external.traverse(o=>{
      if(o===external||o.userData.trDetachedPart||!pattern.test(String(o.name||'')))return;
      // Prefer a complete named assembly/group so it flies away as one real panel,
      // rather than detaching every tiny material triangle as a separate object.
      const name=String(o.name||'');
      // The Ultimate GLB exposes panels as named mesh nodes (Front/Rear/Window).
      // Tires and rims are combined meshes in this asset, so don't detach the entire
      // four-wheel assembly as if it were a single realistic wheel.
      const isPackPanel=(o.isGroup||o.isMesh) && /^(front|rear|window|glass|mirror|spoiler|wing|bumper|door|paint)/i.test(name);
      if(!isPackPanel)return;
      const box=new THREE.Box3().setFromObject(o);if(box.isEmpty())return;
      const size=box.getSize(new THREE.Vector3()),largest=Math.max(size.x,size.y,size.z);
      if(largest>6.0)return;
      const wheel=false,glass=/window|glass/i.test(name);
      const candidate={part:o,object:o,glass:!!glass,wheel,score:glass?1:/door|bumper|front|rear/i.test(name)?2:3};
      (wheel?wheelCandidates:glass?glassCandidates:candidates).push(candidate);
    });
    // Do not offer a child when its enclosing door/window assembly is already a choice.
    const all=[...candidates,...glassCandidates,...wheelCandidates];
    for(const item of all){let parent=item.part.parent;while(parent&&parent!==external){if(all.some(other=>other!==item&&other.part===parent)){item._nested=true;break;}parent=parent.parent;}}
    const valid=a=>a.filter(v=>!v._nested&&v.part.parent&&!v.part.userData.trDetachedPart);
    const wheels=valid(wheelCandidates),glass=valid(glassCandidates),panels=valid(candidates);
    const severityRatio=Math.max(0,Math.min(1,(severity-4.2)/3.1));
    // Wheels: the rig pivot (tyre + rim + spokes) tears off as one piece.
    const rigs=(root.userData.externalWheels||[]).filter(w=>w&&w.parent&&!w.userData.trDetachedPart);
    if(rigs.length&&severity>=4.0&&Math.random()<0.14+severityRatio*0.36){
      const rig=rigs[Math.floor(Math.random()*rigs.length)];
      rig.userData.trDetachedPart=true;
      root.userData.externalWheels=(root.userData.externalWheels||[]).filter(w=>w!==rig);
      return [{part:rig,object:rig,glass:false,wheel:true,score:0}];
    }
    let pool=(glass.length&&severity>=5.0&&Math.random()<0.34+severityRatio*0.28)?glass:panels;
    if(!pool.length)pool=glass;
    if(!pool.length||Math.random()>Math.max(0.35,Math.min(0.95,(severity-2.8)*0.25)))return [];
    const picked=[];
    const picks=severity>=6&&pool.length>1&&Math.random()<0.5?2:1;
    for(let k=0;k<picks;k++){
      pool.sort((a,b)=>a.score-b.score);
      const best=pool[0].score,near=pool.filter(c=>c.score<=best+1&&!c.part.userData.trDetachedPart&&c.part.parent),choice=near[Math.floor(Math.random()*near.length)];
      if(!choice)break;
      choice.part.userData.trDetachedPart=true;picked.push(choice);
    }
    return picked;
  }
  function dentCar(root,severity){
    if(!root||!root.userData||!root.userData.externalCarRoot||severity<1.8)return false;
    const ext=root.userData.externalCarRoot;const already=root.userData.trDentedMeshSet||(root.userData.trDentedMeshSet=new Set());
    const options=[];ext.traverse(o=>{if(!o.isMesh||o.userData.trDetachedPart||o.userData.trDentedPermanently||!o.geometry||!o.geometry.attributes||!o.geometry.attributes.position)return;const n=String(o.name||'');if(/body|paint|front|rear|bonnet|boot|door/i.test(n)&&!already.has(o)){const box=new THREE.Box3().setFromObject(o);if(!box.isEmpty()&&box.getSize(new THREE.Vector3()).length()>0.18)options.push(o);}});
    if(!options.length)return false;
    const mesh=options[Math.floor(Math.random()*options.length)];mesh.geometry=mesh.geometry.clone();mesh.userData.trDentedPermanently=true;already.add(mesh);
    const attr=mesh.geometry.attributes.position;if(!attr||attr.count<8)return false;
    const box=mesh.geometry.boundingBox||new THREE.Box3().setFromBufferAttribute(attr);if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    const cx=box.min.x+Math.random()*(box.max.x-box.min.x),cy=box.min.y+Math.random()*(box.max.y-box.min.y),cz=box.min.z+Math.random()*(box.max.z-box.min.z);
    const radius=Math.min(0.85,0.16+severity*0.07),depth=Math.min(0.42,0.05+severity*0.05);
    for(let i=0;i<attr.count;i++){
      const dx=attr.getX(i)-cx,dy=attr.getY(i)-cy,dz=attr.getZ(i)-cz,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(d<radius){const k=(1-d/radius)*(0.35+Math.random()*0.2)*depth;const inv=1/(d+0.03);attr.setXYZ(i,attr.getX(i)-dx*inv*k,attr.getY(i)-dy*inv*k,attr.getZ(i)-dz*inv*k);}
    }
    attr.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();return true;
  }
  // Interior view from the driver's seat: wide dashboard with violet ambient light, a touch screen
  // with a map, a digital cluster behind the wheel, and the windscreen pillars.
  let cockpitSpeedCanvas = null, cockpitSpeedTex = null, cockpitNavCanvas = null, cockpitNavTex = null, cockpitLastKmh = -1;
  function drawCockpitNav(ctx, w, h) {
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,150,190,0.35)'; ctx.lineWidth = 6;
    for (let i = -2; i < 9; i++) { ctx.beginPath(); ctx.moveTo(i * 70, 0); ctx.lineTo(i * 70 + 180, h); ctx.stroke(); }
    for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.moveTo(0, j * 60 + 20); ctx.lineTo(w, j * 60 - 10); ctx.stroke(); }
    ctx.strokeStyle = '#3fb4ff'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(w * 0.5, h); ctx.lineTo(w * 0.5, h * 0.55); ctx.lineTo(w * 0.78, h * 0.45); ctx.lineTo(w * 0.78, 0); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.8); ctx.lineTo(w * 0.47, h * 0.9); ctx.lineTo(w * 0.53, h * 0.9); ctx.closePath(); ctx.fill();
  }
  function drawCockpitSpeed(ctx, w, h, kmh, rpm) {
    ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,180,255,0.25)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(w / 2, h * 1.05, h * 0.9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.strokeStyle = '#8a5bff'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(w / 2, h * 1.05, h * 0.9, Math.PI * 1.1, Math.PI * 1.1 + Math.PI * 0.8 * Math.min(1, rpm)); ctx.stroke();
    ctx.fillStyle = '#8aa3c4'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = Math.round(h * 0.13) + 'px system-ui, sans-serif'; ctx.fillText('gear ' + Math.min(6, Math.floor(rpm * 6) + 1), w * 0.07, h * 0.08);
    ctx.fillStyle = '#e8f1ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(h * 0.52) + 'px system-ui, sans-serif'; ctx.fillText(String(kmh), w / 2, h * 0.55);
    ctx.font = Math.round(h * 0.16) + 'px system-ui, sans-serif'; ctx.fillStyle = '#8aa3c4'; ctx.fillText('km/h', w / 2, h * 0.88);
  }
  function makeCockpit() {
    if(cockpitOverlay)return cockpitOverlay;
    cockpitOverlay=new THREE.Group();cockpitOverlay.name='TR first-person cockpit controls';
    const dashMat=new THREE.MeshStandardMaterial({color:0x14181d,roughness:0.7,metalness:0.2});
    const dashTop=new THREE.MeshStandardMaterial({color:0x1d2229,roughness:0.55,metalness:0.1});
    const trimMat=new THREE.MeshStandardMaterial({color:0x4a505a,roughness:0.4,metalness:0.7});
    const wheelMat=new THREE.MeshStandardMaterial({color:0x0b0d10,roughness:0.45,metalness:0.2});
    const violet=new THREE.MeshBasicMaterial({color:0x9b4dff});
    const blue=new THREE.MeshBasicMaterial({color:0x4fb8ff});
    const pillarMat=new THREE.MeshStandardMaterial({color:0x0d0f12,roughness:0.6});
    // dashboard: main slab, soft-touch top pad, centre console
    const dash=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.26,0.38),dashMat);dash.position.set(0,-0.56,-0.98);cockpitOverlay.add(dash);
    const pad=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.06,0.44),dashTop);pad.position.set(0,-0.42,-0.96);cockpitOverlay.add(pad);
    const cons=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.34,0.3),dashMat);cons.position.set(0.56,-0.66,-0.9);cockpitOverlay.add(cons);
    // violet ambient strip along the dash top, blue accent under the screen
    const strip=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.014,0.014),violet);strip.position.set(0,-0.385,-0.75);cockpitOverlay.add(strip);
    const strip2=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.01,0.01),blue);strip2.position.set(0.56,-0.5,-0.76);cockpitOverlay.add(strip2);
    // side door sills lit in violet
    for(const x of [-0.92,0.92]){const sill=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.012,0.9),violet);sill.position.set(x,-0.7,-0.62);cockpitOverlay.add(sill);}
    // centre touch screen with a map
    cockpitNavCanvas=document.createElement('canvas');cockpitNavCanvas.width=512;cockpitNavCanvas.height=300;
    drawCockpitNav(cockpitNavCanvas.getContext('2d'),512,300);
    cockpitNavTex=new THREE.CanvasTexture(cockpitNavCanvas);
    const nav=new THREE.Mesh(new THREE.PlaneGeometry(0.36,0.21),new THREE.MeshBasicMaterial({map:cockpitNavTex}));
    nav.position.set(0.56,-0.5,-1.13);nav.rotation.x=-0.22;cockpitOverlay.add(nav);
    // digital cluster behind the wheel
    cockpitSpeedCanvas=document.createElement('canvas');cockpitSpeedCanvas.width=256;cockpitSpeedCanvas.height=140;
    drawCockpitSpeed(cockpitSpeedCanvas.getContext('2d'),256,140,0,0);
    cockpitSpeedTex=new THREE.CanvasTexture(cockpitSpeedCanvas);
    const cluster=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.165),new THREE.MeshBasicMaterial({map:cockpitSpeedTex}));
    cluster.position.set(-0.02,-0.2,-0.99);cluster.rotation.x=-0.25;cockpitOverlay.add(cluster);
    // steering wheel with a violet accent ring
    steeringWheel=new THREE.Group();steeringWheel.name='TR steering wheel';
    const rim=new THREE.Mesh(new THREE.TorusGeometry(0.245,0.031,8,28),wheelMat);steeringWheel.add(rim);
    const accent=new THREE.Mesh(new THREE.TorusGeometry(0.245,0.006,6,28),violet);steeringWheel.add(accent);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.045,12),trimMat);hub.rotation.x=Math.PI/2;steeringWheel.add(hub);
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.22,0.025),trimMat);spoke.position.y=-0.095;steeringWheel.add(spoke);
    const leftSpoke=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.025,0.025),trimMat);leftSpoke.position.set(-0.07,0.015,0);leftSpoke.rotation.z=-0.35;steeringWheel.add(leftSpoke);
    const rightSpoke=leftSpoke.clone();rightSpoke.position.x=0.07;rightSpoke.rotation.z=0.35;steeringWheel.add(rightSpoke);
    steeringWheel.position.set(0,-0.36,-0.9);cockpitOverlay.add(steeringWheel);
    // windscreen pillars on both sides and the rear-view mirror
    for(const x of [-0.95,0.95]){const pil=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.9,0.05),pillarMat);pil.position.set(x,0.25,-0.75);pil.rotation.z=x<0?0.28:-0.28;cockpitOverlay.add(pil);}
    const mirror=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.05,0.02),pillarMat);mirror.position.set(0,0.22,-0.82);cockpitOverlay.add(mirror);
    const mirrorGlass=new THREE.Mesh(new THREE.PlaneGeometry(0.19,0.035),new THREE.MeshBasicMaterial({color:0x1a2a3a}));mirrorGlass.position.set(0,0.22,-0.809);cockpitOverlay.add(mirrorGlass);
    // steering column and lower dash vents
    const column=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.42,10),trimMat);column.rotation.x=Math.PI/2-0.45;column.position.set(0,-0.52,-0.9);cockpitOverlay.add(column);
    for(const x of [-0.48,0.48]){const vent=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.06,0.02),dashMat);vent.position.set(x,-0.66,-0.79);cockpitOverlay.add(vent);
      for(let k=0;k<4;k++){const slat=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.008,0.01),trimMat);slat.position.set(x,-0.645+k*0.02,-0.775);cockpitOverlay.add(slat);}}
    // bezel around the touch screen and the cluster
    const bezel=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.23,0.02),dashMat);bezel.position.set(0.56,-0.5,-1.14);bezel.rotation.x=-0.22;cockpitOverlay.add(bezel);
    const cbezel=new THREE.Mesh(new THREE.BoxGeometry(0.31,0.18,0.02),dashMat);cbezel.position.set(-0.02,-0.2,-1.0);cbezel.rotation.x=-0.25;cockpitOverlay.add(cbezel);
    // door panels with violet light lines on both sides
    for(const sx of [-1,1]){
      const panel=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.5,1.0),dashMat);panel.position.set(sx*1.0,-0.72,-0.8);cockpitOverlay.add(panel);
      const dl=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.012,0.9),violet);dl.position.set(sx*1.04,-0.52,-0.8);cockpitOverlay.add(dl);
    }
    // two metallic pedals near the lower edge
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
  // Called every frame from the race HUD with the current speed (km/h) and an rpm-like fraction.
  function updateCockpit(kmh, rpm) {
    if(!cockpitSpeedCanvas||!cockpitOverlay||!cockpitOverlay.visible)return;
    const v = Math.round(kmh);
    if(v===cockpitLastKmh)return;
    cockpitLastKmh = v;
    drawCockpitSpeed(cockpitSpeedCanvas.getContext('2d'),256,140,v,Math.max(0,Math.min(1,rpm)));
    cockpitSpeedTex.needsUpdate = true;
  }

  function ensureArms() {
    if (armsPromise) return armsPromise;
    armsPromise = loadGLB('fps_arms.glb').then(gltf => {
      armsRoot = gltf.scene;
      const background=armsRoot.getObjectByName('Background_Background_0');if(background)background.visible=false;
      const helperCamera=armsRoot.getObjectByName('Camera');if(helperCamera)helperCamera.visible=false;
      armsRoot.traverse(o=>{if(o.isMesh){if(o===background||/background/i.test(o.name||'')){o.visible=false;return;}o.frustumCulled=false;o.visible=true;if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m){m.side=THREE.DoubleSide;m.depthTest=false;m.depthWrite=false;m.needsUpdate=true;}});}}});
      // Centre the source pack inside a wrapper; the raw asset uses an off-centre
      // authoring origin, which otherwise pushed the hands above/below the camera.
      // Box3.setFromObject also counts invisible helper meshes in this Three.js
      // revision. The pack's hidden background plane has a huge bounding box and
      // was moving the real arms off-screen. Compute bounds from visible skinned
      // meshes only (the actual pair of arms), in the GLTF scene's world space.
      armsRoot.updateMatrixWorld(true);
      const armBounds=new THREE.Box3();
      armsRoot.traverse(o=>{
        if(!o.isMesh||!o.visible||!o.geometry)return;
        if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
        if(o.geometry.boundingBox){const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);armBounds.union(b);}
      });
      const armCenter=armBounds.isEmpty()?new THREE.Vector3():armBounds.getCenter(new THREE.Vector3());
      const armsRigHolder=new THREE.Group();armsRigHolder.name='TR FPS arms centered holder';
      armsRigHolder.add(armsRoot);armsRigHolder.position.set(-armCenter.x,-armCenter.y,-armCenter.z);
      armsOverlay = new THREE.Group();
      armsOverlay.name = 'TR first-person animated arms';
      armsOverlay.add(armsRigHolder);
      armsOverlay.position.set(0, -0.34, -0.78);
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
      ensurePerson();
      if (personTemplate) attachDriverCharacter(root);
    },
    registerWorldCharacter(root) {
      if (!root) return;
      worldCharacters.add(root);
      // Keep the fallback body visible until the supplied rigged GLB is attached.
      // This avoids an invisible avatar when the network/CDN/model load is delayed.
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
    getCityMeshes() { return importedCityMeshes.concat([...extraCityCollisionMeshes]); },
    registerCityCollision(mesh) { if(mesh&&mesh.isMesh)extraCityCollisionMeshes.add(mesh); },
    getEditorObjects() { return editorObjects; },
    setCamera(camera) {
      gameCamera = camera || null;
      if (armsOverlay && gameCamera && armsOverlay.parent !== gameCamera) gameCamera.add(armsOverlay);
      if (cockpitOverlay && gameCamera && cockpitOverlay.parent !== gameCamera) gameCamera.add(cockpitOverlay);
    },
    setFirstPerson(active, context = 'race', playerCar = null) {
      firstPersonWanted = !!active;
      firstPersonContext = context;
      if (firstPersonWanted) ensureArms();
      const driving=firstPersonContext==='drive'||firstPersonContext==='race';
      if(driving)makeCockpit();
      if(playerCar&&playerCar.userData&&playerCar.userData.externalCarRoot){playerCar.userData.externalCarRoot.visible=!(firstPersonWanted&&driving);}
      if(playerCar&&playerCar.userData&&playerCar.userData.driver){playerCar.userData.driver.visible=!(firstPersonWanted&&driving);}
      if (armsOverlay) {
        armsOverlay.visible = firstPersonWanted;
        armsOverlay.rotation.z = 0;
        if(firstPersonContext==='drive'){armsOverlay.position.set(0,-0.43,-0.67);armsOverlay.scale.setScalar(0.72);}
        else {armsOverlay.position.set(0,-0.43,-0.67);armsOverlay.scale.setScalar(0.78);}
        armsOverlay.renderOrder=995;
        armsOverlay.traverse(o=>{if(o.isMesh){o.renderOrder=995;if(o.material){o.material.depthTest=false;o.material.depthWrite=false;}}});
        playArmsAction(wantedArmsClip());
      }
      if(cockpitOverlay)cockpitOverlay.visible=firstPersonWanted&&driving;
    },
    setSteer(value) {
      const a = Math.max(-1, Math.min(1, Number(value) || 0)) * 0.48;
      if (steeringWheel) steeringWheel.rotation.z = a;
      // While driving, the FPS arms turn around the wheel centre, so the hands stay on the rim.
      if (armsOverlay && firstPersonWanted && (firstPersonContext === 'drive' || firstPersonContext === 'race')) {
        const wheelY = -0.36, wheelZ = -0.9, offY = -0.07, offZ = 0.23;   // arms rest point relative to the wheel centre
        armsOverlay.rotation.z = a;
        armsOverlay.position.set(-offY * Math.sin(a), wheelY + offY * Math.cos(a), wheelZ + offZ);
      }
    },
    isArmsReady() {
      if(!armsOverlay||!gameCamera||armsOverlay.parent!==gameCamera||!armsOverlay.visible)return false;
      let visibleMesh=false;armsOverlay.traverse(o=>{if(o.isMesh&&o.visible&&o.geometry&&o.geometry.attributes&&o.geometry.attributes.position&&o.geometry.attributes.position.count>20)visibleMesh=true;});
      return visibleMesh;
    },
    isPersonReady() { return !!personTemplate; },
    loadProp(file) { return loadGLB(file).then(g => g.scene).catch(() => null); },
    updateCockpit(kmh, rpm) { return updateCockpit(kmh, rpm); },
    detachCrashParts,
    dentCar,
    playCharacterAction(name,seconds=0.65,root=null){if(root)playCharacterAnimation(root,name,seconds);else{const playerRoot=[...worldCharacters,...staticCharacters].find(r=>r&&r.userData&&r.userData.playerPed);if(playerRoot)playCharacterAnimation(playerRoot,name,seconds);}},
    setCharacterMotion(moving, sprinting, root = null) {
      characterMotion = !moving ? 'idle' : sprinting ? 'sprint' : 'walk';
      if(root)playCharacterAnimation(root,characterMotion==='sprint'?'Run':characterMotion==='walk'?'Walk':'Idle');
      if (firstPersonWanted) playArmsAction(wantedArmsClip());
    },
    update(dt) {
      const step = Math.min(0.05, Math.max(0, dt || 0));
      characterMotionClock += step;
      if (armsMixer && firstPersonWanted) armsMixer.update(step);
      const roots=new Set([...worldCharacters,...staticCharacters,...driverCharacters]);
      for(const root of roots){
        if(!root)continue;
        const state=characterAnimations.get(root);
        if(state){
          let desired='Idle';
          if(state.forcedUntil>characterMotionClock&&state.forcedName) desired=state.forcedName;
          else if(root.userData&&root.userData.playerPed) desired=characterMotion==='sprint'?'Run':characterMotion==='walk'?'Walk':'Idle';
          else if(Number(root.userData&&root.userData.trWalkSpeed)>0) desired='Walk';
          if(!state.actions[desired])desired=state.actions.Idle?'Idle':Object.keys(state.actions)[0];
          if(desired)playCharacterAnimation(root,desired);
          state.mixer.update(step);
        }
        const model=root.userData&&root.userData.trNewPersonModel;
        if(!model)continue;
        const isPlayer=!!(root.userData&&root.userData.playerPed);
        const moving=isPlayer?(characterMotion==='walk'||characterMotion==='sprint'):Number(root.userData.trWalkSpeed||0)>0;
        const speed=isPlayer&&characterMotion==='sprint'?13:8+(Number(root.userData.trWalkSpeed)||0)*2;
        const phase=characterMotionClock*speed+(Number(root.userData.trMotionPhase)||0);
        // Small body bob is an additive motion on top of real skeletal clips.
        model.position.y=(model.userData.trNewPersonBaseY||0)+(moving?Math.abs(Math.sin(phase))*0.012:Math.sin(characterMotionClock*1.6)*0.002);
      }
    }
  };
})();
