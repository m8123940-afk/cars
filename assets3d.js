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

  function buildCarVisual(record) {
    const root = record.root;
    if (!root || !root.userData || root.userData.externalCarRoot) return;
    const index = Math.max(0, Number(record.index) || 0);
    // Every garage and traffic slot uses a model from Ultimate Car Pack.
    const source = carPackTemplates.length ? carPackTemplates[mod(index, carPackTemplates.length)] : null;
    if (!source) return;

    const model = cloneModel(source);
    removeCollisionMeshes(model);
    const pivots = [];
    const external = new THREE.Group();
    external.name = 'Ultimate pack — external visual';
    // Every car in the Ultimate pack faces -Z in the source scene; rotate its local
    // model once so the game's +Z forward direction is used for every garage slot.
    model.rotation.y = Math.PI;
    external.add(model);
    external.visible = !(firstPersonWanted && (firstPersonContext === 'drive' || firstPersonContext === 'race'));
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
    carAssetsPromise = loadGLB('ford_gt_2006.glb').then(fordGltf => {
      // Используем Ford GT как единственную импортированную модель для машин.
      // Все автомобили получают эту модель; характеристики/цены остаются из каталога.
      carPackTemplates = [fordGltf.scene];
      applyAllCars();
      console.info('[Turbo Rivals] Подключена модель Ford GT 2006.');
    }).catch(error => {
      console.error('[Turbo Rivals] Не удалось загрузить Ford GT 2006.', error);
      carAssetsPromise = null;
    });
    return carAssetsPromise;
  }

  function makePersonInstance() {
    if (!personTemplate) return null;
    return makeNormalisedInstance(personTemplate, { height: 1.78, name: 'New Person — rigged character model' });
  }
  function bindCharacterAnimations(root, model) {
    if(!root||!model||!personClips.length)return;
    try{
      const mixer=new THREE.AnimationMixer(model),actions={};
      for(const clip of personClips){actions[clip.name]=mixer.clipAction(clip);}
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
  function attachWorldCharacter(root) {
    if (!root || !root.userData || root.userData.trNewPersonAttached || !personTemplate) return;
    const model = makePersonInstance();
    if (!model) return;
    model.name = 'TR visible player character';
    model.visible = true;
    model.traverse(o => { if (o.isMesh) { o.visible = true; o.frustumCulled = false; } });
    // Keep the imported model directly under the actor root. Parenting it under the
    // merged procedural body caused bad inherited transforms on some Three.js clones.
    root.add(model);
    bindCharacterAnimations(root, model);
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
    const model = makePersonInstance();
    if (!model) return;
    // Attach the supplied model first; only then hide the old driver meshes.
    model.rotation.x = -0.08;
    model.scale.y *= 0.94;
    model.userData.trDriverModel = true;
    root.add(model);
    model.visible = true;
    root.children.forEach(child => { if (child !== model) child.visible = false; });
    bindCharacterAnimations(root,model);
    root.userData.trNewPersonAttached = true;
    root.userData.trNewPersonModel = model;
  }
  function ensurePerson() {
    if (personPromise) return personPromise;
    personPromise = loadGLB('new_person.glb').then(gltf => {
      personTemplate = gltf.scene;
      personClips = Array.isArray(gltf.animations) ? gltf.animations : [];
      markSharedTree(personTemplate);
      worldCharacters.forEach(attachWorldCharacter);
      staticCharacters.forEach(attachWorldCharacter);
      driverCharacters.forEach(attachDriverCharacter);
      console.info('[Turbo Rivals] Модель персонажа New Person загружена.');
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
    if (!root || !root.userData || !root.userData.externalCarRoot || severity < 4.4) return [];
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
    if(wheels.length&&severity>=5.7&&Math.random()<0.025+severityRatio*0.07){
      const item=wheels[Math.floor(Math.random()*wheels.length)];item.part.userData.trDetachedPart=true;return [item];
    }
    let pool=(glass.length&&severity>=5.0&&Math.random()<0.34+severityRatio*0.28)?glass:panels;
    if(!pool.length)pool=glass;
    if(!pool.length||Math.random()>Math.max(0.18,Math.min(0.9,(severity-3.5)*0.2)))return [];
    pool.sort((a,b)=>a.score-b.score);
    const best=pool[0].score,near=pool.filter(c=>c.score<=best+1),choice=near[Math.floor(Math.random()*near.length)];
    if(!choice||!choice.part.parent)return [];
    choice.part.userData.trDetachedPart=true;
    return [choice];
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
    const radius=Math.min(0.55,0.12+severity*0.045),depth=Math.min(0.22,0.035+severity*0.027);
    for(let i=0;i<attr.count;i++){
      const dx=attr.getX(i)-cx,dy=attr.getY(i)-cy,dz=attr.getZ(i)-cz,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(d<radius){const k=(1-d/radius)*(0.35+Math.random()*0.2)*depth;const inv=1/(d+0.03);attr.setXYZ(i,attr.getX(i)-dx*inv*k,attr.getY(i)-dy*inv*k,attr.getZ(i)-dz*inv*k);}
    }
    attr.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();return true;
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
        if(firstPersonContext==='drive'){armsOverlay.position.set(0,-0.43,-0.67);armsOverlay.scale.setScalar(0.72);}
        else {armsOverlay.position.set(0,-0.43,-0.67);armsOverlay.scale.setScalar(0.78);}
        armsOverlay.renderOrder=995;
        armsOverlay.traverse(o=>{if(o.isMesh){o.renderOrder=995;if(o.material){o.material.depthTest=false;o.material.depthWrite=false;}}});
        playArmsAction(wantedArmsClip());
      }
      if(cockpitOverlay)cockpitOverlay.visible=firstPersonWanted&&driving;
    },
    setSteer(value) { if(steeringWheel)steeringWheel.rotation.z=Math.max(-1,Math.min(1,Number(value)||0))*0.48; },
    isArmsReady() {
      if(!armsOverlay||!gameCamera||armsOverlay.parent!==gameCamera||!armsOverlay.visible)return false;
      let visibleMesh=false;armsOverlay.traverse(o=>{if(o.isMesh&&o.visible&&o.geometry&&o.geometry.attributes&&o.geometry.attributes.position&&o.geometry.attributes.position.count>20)visibleMesh=true;});
      return visibleMesh;
    },
    isPersonReady() { return !!personTemplate; },
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
