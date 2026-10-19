// Turbo Rivals 3D — сервер онлайн-гонок и админ-панели (Node.js + ws).
// Переменные окружения: ADMIN_PASSWORD (обязательно для админки), ALLOWED_ORIGINS (через запятую, напр. https://user.github.io), PORT.
// ВАЖНО: позиции машин присылают клиенты (client-authoritative) — сервер проверяет формат и частоту, но не физику.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_ROOM = 6, START_DELAY = 7000, ROOM_IDLE_MS = 15 * 60 * 1000;
const GAME_CAR_IDS = ['rust','bulldog','topol','kolibri','skat','yastreb','mamba','phantom','corsar','eclipse','viper','nova','titan','aurora','raven','comet','inferno','spectre','falcon','tempest','phantomx','zenith'];
const ADMIN_COIN_LIMIT = 1000000000000000;

let maintenance = false, nextId = 1, nextRoom = 1;
const banned = new Set();
const clients = new Map();   // id -> client
const rooms = new Map();     // id -> room
let queue = [];              // clients waiting
const failed = new Map();    // ip -> {n, t}
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');
const WORLD_EDITS_FILE = path.join(__dirname, 'world-edits.json');
const SOCIAL_FILE = path.join(__dirname, 'social-posts.json');
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
let leaderboardEntries = {};
try {
  const loaded = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
  if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) leaderboardEntries = loaded;
} catch (_) {}
function saveLeaderboard(){ const tmp=LEADERBOARD_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(leaderboardEntries)); fs.renameSync(tmp, LEADERBOARD_FILE); }
function publicLeaderboard(){ return Object.values(leaderboardEntries).filter(p=>p && typeof p.name==='string').sort((a,b)=>(Number(b.level)||1)-(Number(a.level)||1)||(Number(b.coins)||0)-(Number(a.coins)||0)||(Number(a.updatedAt)||0)-(Number(b.updatedAt)||0)).slice(0,100).map(p=>({name:String(p.name).slice(0,18),level:Math.max(1,Number(p.level)||1),coins:Math.max(0,Number(p.coins)||0)})); }
let socialPosts = [];
const socialRate = new Map();
try { const saved = JSON.parse(fs.readFileSync(SOCIAL_FILE, 'utf8')); if(Array.isArray(saved)) socialPosts=saved.slice(0,80); } catch (_) {}
function saveSocialPosts(){ const tmp=SOCIAL_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(socialPosts)); fs.renameSync(tmp,SOCIAL_FILE); }
function publicSocialPosts(){ return socialPosts.slice(0,12).map(p=>({id:p.id,author:p.author,caption:p.caption,image:p.image,likes:Number(p.likes)||0,comments:Array.isArray(p.comments)?p.comments.slice(-30):[]})); }
function socialRateAllowed(key,interval){const now=Date.now(),prev=socialRate.get(key)||0;if(now-prev<interval)return false;socialRate.set(key,now);if(socialRate.size>4000){for(const [k,t] of socialRate)if(now-t>60*60*1000)socialRate.delete(k);}return true;}
function socialText(v,max){return String(v||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,max);}
let worldEditsState = { edits: {}, updatedAt: 0 };
try { const saved = JSON.parse(fs.readFileSync(WORLD_EDITS_FILE, 'utf8')); if(saved && saved.edits && typeof saved.edits==='object') worldEditsState={edits:saved.edits,updatedAt:Number(saved.updatedAt)||0}; } catch (_) {}
function saveWorldEdits(){ const tmp=WORLD_EDITS_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(worldEditsState)); fs.renameSync(tmp,WORLD_EDITS_FILE); }
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8')); } catch (_) {}
function saveAccounts(){ const tmp=ACCOUNT_FILE+'.tmp'; fs.writeFileSync(tmp, JSON.stringify(accounts)); fs.renameSync(tmp, ACCOUNT_FILE); }
function validAccountName(s){ return /^[a-zA-Z0-9_]{3,14}$/.test(String(s||'')); }
function passwordHash(pass, salt){ return crypto.scryptSync(String(pass), salt, 64).toString('hex'); }
function authAccount(name, pass){ const a=accounts[name.toLowerCase()]; if(!a || String(pass||'').length<6) return false; const x=Buffer.from(passwordHash(pass,a.salt),'hex'), y=Buffer.from(a.hash,'hex'); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function tokenHash(token){ return crypto.createHash('sha256').update(String(token||'')).digest('hex'); }
function issueSession(key){ const token=crypto.randomBytes(32).toString('base64url'), hash=tokenHash(token), a=accounts[key]; a.sessions=a.sessions||{}; const now=Date.now(); for(const [h,exp] of Object.entries(a.sessions)) if(!Number.isFinite(exp)||exp<now) delete a.sessions[h]; a.sessions[hash]=now+180*24*60*60*1000; saveAccounts(); return token; }
function findSession(token){ const h=tokenHash(token), now=Date.now(); for(const [key,a] of Object.entries(accounts)){ if(!a.sessions) continue; const exp=a.sessions[h]; if(exp && exp>now) return {key,a,hash:h}; if(exp) { delete a.sessions[h]; saveAccounts(); } } return null; }
function publicPlayer(c){ return { id:c.id, name:c.name, carId:c.carId, gender:c.gender, outfit:c.outfit, skin:c.skin, paint:c.paint===undefined?null:c.paint, style:c.style||0, neon:c.neon!==false, rimStyle:c.rimStyle||0, wing:Number.isInteger(c.wing)?c.wing:null, slot:c.slot }; }
function roomMembers(r){ return r.players.map(publicPlayer); }
function sendRoomLobby(r){ const players=roomMembers(r); r.players.forEach(p=>send(p,{t:'roomLobby',code:r.code,maxPlayers:r.maxPlayers||6,host:p.id===r.hostId,players})); broadcastOnline(); }
function startRoom(r){
  if(!r || r.started || !rooms.has(r.id)) return;
  if(r.players.length<2){ const host=r.players.find(p=>p.id===r.hostId)||r.players[0]; if(host) send(host,{t:'roomError',error:'Для гонки нужны минимум 2 игрока'}); return; }
  r.started=true; clearTimeout(r.idleTimer); r.finished=0; r.players.forEach((c,i)=>{c.place=0;c.st=null;c.slot=i;});
  const list=roomMembers(r), startIn=START_DELAY, seed=r.seed||r.L*977+13;
  r.players.forEach(c=>send(c,{t:'room',roomId:r.id,code:r.code||null,L:r.L,laps:r.laps,seed,startIn,you:c.slot,players:list}));
  clearTimeout(r.launchTimer);
  r.launchTimer=setTimeout(()=>{
    if(!rooms.has(r.id)) return;
    r.timer=setInterval(()=>{ const snap=r.players.filter(p=>p.st).map(p=>[p.id,p.st.x,p.st.z,p.st.h,p.st.s,p.st.p,p.st.y,p.place?1:0]); if(snap.length) r.players.forEach(p=>send(p,{t:'snap',p:snap})); },66);
    r.killTimer=setTimeout(()=>{ if(rooms.has(r.id)) closeRoom(r,false); },6*60*1000);
  },START_DELAY);
  broadcastOnline();
}
function scheduleRoomExpiry(r){
  clearTimeout(r.idleTimer);
  r.idleTimer=setTimeout(()=>{
    if(rooms.has(r.id) && !r.started){ r.closeReason='Комната закрыта из-за 15 минут бездействия.'; closeRoom(r,true); }
  },ROOM_IDLE_MS);
}
function createPrivateRoom(c, requestedSize){
  if(c.room) leaveRoom(c); queue=queue.filter(x=>x!==c);
  const maxPlayers=Math.max(2,Math.min(6,Number(requestedSize)||4));
  let code; do { code=crypto.randomBytes(6).toString('base64url').replace(/[-_]/g,'').slice(0,8).toUpperCase(); } while([...rooms.values()].some(r=>r.code===code));
  const L=1+Math.floor(Math.random()*55), r={id:nextRoom++,code,private:true,hostId:c.id,maxPlayers,L,laps:3,seed:crypto.randomInt(1,2147483646),players:[c],started:false,finished:0,timer:null,launchTimer:null,killTimer:null,idleTimer:null};
  c.room=r;c.slot=0;c.place=0;c.st=null;rooms.set(r.id,r);scheduleRoomExpiry(r);sendRoomLobby(r);
}
function joinPrivateRoom(c, rawCode){
  const code=String(rawCode||'').replace(/[^a-z0-9]/gi,'').toUpperCase().slice(0,16), r=[...rooms.values()].find(x=>x.private&&x.code===code);
  if(!r) return send(c,{t:'roomError',error:'Комната не найдена. Проверьте код или ссылку.'});
  if(r.started) return send(c,{t:'roomError',error:'Гонка в этой комнате уже началась.'});
  if(r.players.length>=r.maxPlayers) return send(c,{t:'roomError',error:'В комнате уже нет свободных мест.'});
  if(c.room) leaveRoom(c); queue=queue.filter(x=>x!==c); c.room=r;c.slot=r.players.length;c.place=0;c.st=null;r.players.push(c);scheduleRoomExpiry(r);sendRoomLobby(r);
}


const clean = s => String(s || '').replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, 14);
const num = (v, lim) => (typeof v === 'number' && isFinite(v)) ? Math.max(-lim, Math.min(lim, v)) : 0;
const send = (c, o) => { try { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); } catch (e) {} };
const ipOf = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

// ---------- HTTP: health + админка ----------
function authOk(req) {
  if (!ADMIN_PASSWORD) return false;
  const ip = ipOf(req), f = failed.get(ip);
  if (f && f.n >= 10 && Date.now() - f.t < 10 * 60 * 1000) return false;
  const a = crypto.createHash('sha256').update(String(req.headers['x-admin-pass'] || '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  const ok = crypto.timingSafeEqual(a, b);
  if (!ok) failed.set(ip, { n: (f && Date.now() - f.t < 10 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() }); else failed.delete(ip);
  return ok;
}
function readBody(req) {
  return new Promise(res => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 1000000) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch (e) { res({}); } });
  });
}
function adminState() {
  return {
    online: clients.size, maintenance, queue: queue.length, banned: [...banned],
    players: [...clients.values()].map(c => ({ id: c.id, name: c.name, car: c.carId, room: c.room ? c.room.id : null, inQueue: queue.includes(c) })),
    rooms: [...rooms.values()].map(r => ({ id: r.id, L: r.L, started: r.started, players: r.players.map(p => p.name), finished: r.finished })),
    accounts: Object.values(accounts).map(a => {
      const profile = a.profile && typeof a.profile === 'object' && !Array.isArray(a.profile) ? a.profile : {};
      const cars = profile.cars && typeof profile.cars === 'object' && !Array.isArray(profile.cars) ? profile.cars : {};
      const owned = Object.keys(cars).filter(id => GAME_CAR_IDS.includes(id) && cars[id] && typeof cars[id] === 'object');
      return { name: String(a.name || ''), coins: Math.max(0, Number(profile.coins) || 0), level: Math.max(1, Number(profile.level) || 1), carsOwned: owned.length, damagedCars: owned.filter(id => Number(cars[id].dmg) > 0.5).length };
    }).sort((a,b) => a.name.localeCompare(b.name))
  };
}
function kick(c, reason) { send(c, { t: 'kick', reason: reason || '' }); try { c.ws.close(); } catch (e) {} }

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const origin = req.headers.origin || '';
  if (origin && (!ORIGINS.length || ORIGINS.includes(origin))) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Admin-Pass'); res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS'); }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url === '/' || url === '/health') return json(200, { ok: true, online: clients.size });
  // Public cross-device career leaderboard. Submission is rate-limited and only moves an existing record upward.
  if (url === '/api/leaderboard' && req.method === 'GET') return json(200, { players: publicLeaderboard() });
  if (url === '/api/leaderboard' && req.method === 'POST') {
    const b = await readBody(req), ip = ipOf(req);
    if (!socialRateAllowed('leaderboard:' + ip, 4500)) return json(429, { error: 'Подожди немного перед следующей синхронизацией' });
    const name = clean(b.name) || 'Гонщик';
    const key = name.toLocaleLowerCase();
    const level = Math.max(1, Math.min(99999, Math.floor(Number(b.level) || 1)));
    const coins = Math.max(0, Math.min(1000000000000000, Math.floor(Number(b.coins) || 0)));
    const previous = leaderboardEntries[key] || {};
    leaderboardEntries[key] = { name, level: Math.max(Number(previous.level)||1, level), coins: Math.max(Number(previous.coins)||0, coins), updatedAt: Date.now() };
    const entries = Object.entries(leaderboardEntries).sort((a,b)=>(Number(b[1].level)||1)-(Number(a[1].level)||1)||(Number(b[1].coins)||0)-(Number(a[1].coins)||0)).slice(0,1000);
    leaderboardEntries = Object.fromEntries(entries);
    try { saveLeaderboard(); } catch (error) { console.error('Leaderboard could not persist', error); return json(500, { error: 'Не удалось сохранить рейтинг' }); }
    return json(200, { ok: true, player: leaderboardEntries[key], players: publicLeaderboard() });
  }
  if (url === '/api/world-edits' && req.method === 'GET') return json(200, worldEditsState);
  // Public, shared in-game photo feed. Images are small JPEG data URLs captured by the game.
  if (url === '/api/social-posts' && req.method === 'GET') return json(200, { posts: publicSocialPosts() });
  if (url === '/api/social-posts' && req.method === 'POST') {
    const b=await readBody(req), ip=ipOf(req), image=String(b.image||'');
    if(!socialRateAllowed('post:'+ip,15000)) return json(429,{error:'Подожди 15 секунд перед следующей публикацией'});
    if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>480000) return json(400,{error:'Фото должно быть небольшим JPEG-снимком из игры'});
    const post={id:Date.now(),author:socialText(b.author||'Гонщик',18)||'Гонщик',caption:socialText(b.caption||'Мой момент в Turbo Rivals',180),image,likes:0,likedBy:[],comments:[],created:Date.now()};
    socialPosts.unshift(post);socialPosts=socialPosts.slice(0,80);
    try{saveSocialPosts();}catch(e){socialPosts.shift();console.error('Social feed could not persist',e);return json(500,{error:'Не удалось сохранить публикацию на сервере'});}
    return json(200,{ok:true,posts:publicSocialPosts()});
  }
  if (url === '/api/social-posts/like' && req.method === 'POST') {
    const b=await readBody(req),id=Number(b.id),post=socialPosts.find(p=>Number(p.id)===id),who=crypto.createHash('sha256').update(ipOf(req)).digest('hex');
    if(!post)return json(404,{error:'Публикация не найдена'});
    post.likedBy=Array.isArray(post.likedBy)?post.likedBy:[];
    if(!post.likedBy.includes(who)){if(post.likedBy.length>=2000)post.likedBy.shift();post.likedBy.push(who);post.likes=(Number(post.likes)||0)+1;try{saveSocialPosts();}catch(e){return json(500,{error:'Не удалось сохранить лайк'});}}
    return json(200,{ok:true,posts:publicSocialPosts()});
  }
  if (url === '/api/social-posts/comment' && req.method === 'POST') {
    const b=await readBody(req),ip=ipOf(req),id=Number(b.id),post=socialPosts.find(p=>Number(p.id)===id),text=socialText(b.text,120);
    if(!post)return json(404,{error:'Публикация не найдена'});
    if(!text)return json(400,{error:'Напиши комментарий'});
    if(!socialRateAllowed('comment:'+ip,1200))return json(429,{error:'Не отправляй комментарии слишком часто'});
    post.comments=Array.isArray(post.comments)?post.comments:[];post.comments.push({author:socialText(b.author||'Гонщик',18)||'Гонщик',text,created:Date.now()});post.comments=post.comments.slice(-30);
    try{saveSocialPosts();}catch(e){return json(500,{error:'Не удалось сохранить комментарий'});}
    return json(200,{ok:true,posts:publicSocialPosts()});
  }
  if (url === '/api/world-edits/auth' && req.method === 'POST') return authOk(req) ? json(200,{ok:true}) : json(401,{error:'Неверный пароль разработчика или ADMIN_PASSWORD не задан'});
  if (url === '/api/world-edits' && req.method === 'POST') {
    if (!authOk(req)) return json(401,{error:'Неверный пароль разработчика или ADMIN_PASSWORD не задан'});
    const body = await readBody(req), edits = body && body.edits;
    if (!edits || typeof edits !== 'object' || Array.isArray(edits) || Object.keys(edits).length > 5000) return json(400,{error:'Некорректный список объектов'});
    const safe = {};
    for (const [key,value] of Object.entries(edits)) {
      if (!/^(?:__city__|city:[0-9]+(?:\.[0-9]+)*)$/.test(key) || !value || typeof value !== 'object') continue;
      const rec={}; let valid=true;
      for (const k of ['x','y','z','sx','sy','sz']) { const n=Number(value[k]); if(!Number.isFinite(n)) {valid=false;break;} rec[k]=Math.max(k[0]==='s'?0.01:-10000,Math.min(k[0]==='s'?100:10000,n)); }
      if(valid) safe[key]=rec;
    }
    worldEditsState={edits:safe,updatedAt:Date.now()};
    try { saveWorldEdits(); } catch(e) { console.error('World edits could not persist',e); return json(500,{error:'Не удалось записать world-edits.json'}); }
    return json(200,worldEditsState);
  }
  if (url === '/api/register' || url === '/api/login' || url === '/api/session' || url === '/api/logout' || url === '/api/password' || url === '/api/profile') {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    const b = await readBody(req);
    if (url === '/api/register' || url === '/api/login') {
      const name=String(b.name||'').trim(), pass=String(b.password||'');
      if (!validAccountName(name)) return json(400,{error:'Имя: 3–14 символов, латиница, цифры и _'});
      if (pass.length<6 || pass.length>128) return json(400,{error:'Пароль должен быть от 6 до 128 символов'});
      const key=name.toLowerCase();
      if(url==='/api/register') { if(accounts[key]) return json(409,{error:'Это имя уже занято'}); const salt=crypto.randomBytes(16).toString('hex'); accounts[key]={name,salt,hash:passwordHash(pass,salt),created:Date.now(),sessions:{}}; const token=issueSession(key); return json(200,{ok:true,name,token}); }
      if(!authAccount(name,pass)) return json(401,{error:'Неверное имя или пароль'});
      const token=issueSession(key); return json(200,{ok:true,name:accounts[key].name,token});
    }
    const sess=findSession(b.token);
    if(url==='/api/session') return sess ? json(200,{ok:true,name:sess.a.name}) : json(401,{error:'Сессия истекла. Войдите снова.'});
    if(!sess) return json(401,{error:'Сессия истекла. Войдите снова.'});
    if(url==='/api/logout') { delete sess.a.sessions[sess.hash]; saveAccounts(); return json(200,{ok:true}); }
    if(url==='/api/password') {
      const current=String(b.current||''), next=String(b.next||'');
      if(!authAccount(sess.a.name,current)) return json(401,{error:'Текущий пароль указан неверно'});
      if(next.length<6||next.length>128) return json(400,{error:'Новый пароль должен быть от 6 до 128 символов'});
      const salt=crypto.randomBytes(16).toString('hex'); sess.a.salt=salt; sess.a.hash=passwordHash(next,salt); saveAccounts(); return json(200,{ok:true});
    }
    if(url==='/api/profile') {
      if(b.profile !== undefined) {
        let serialized; try { serialized=JSON.stringify(b.profile); } catch(_) { return json(400,{error:'Некорректный профиль'}); }
        if(!b.profile || typeof b.profile!=='object' || Array.isArray(b.profile) || serialized.length>30000) return json(413,{error:'Профиль слишком большой или имеет неверный формат'});
        sess.a.profile=JSON.parse(serialized); sess.a.profileUpdated=Date.now(); saveAccounts(); return json(200,{ok:true});
      }
      return json(200,{ok:true,profile:sess.a.profile||null});
    }
  }
  if (url === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' });
    return res.end(fs.readFileSync(path.join(__dirname, 'admin.html')));
  }
  if (url.startsWith('/admin/api/')) {
    if (!authOk(req)) return json(401, { error: 'unauthorized' });
    if (url === '/admin/api/state') return json(200, adminState());
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    const b = await readBody(req);
    if (url === '/admin/api/grantCoins') {
      const name = String(b.name || '').trim(); const key = name.toLowerCase(); const account = accounts[key];
      if (!account) return json(404, { error: 'Аккаунт не найден. Сначала игрок должен зарегистрироваться.' });
      const amount = Number(b.amount); if (!Number.isFinite(amount) || amount < 0) return json(400, { error: 'Введите неотрицательную сумму.' });
      const limit = 1000000000000000; const value = Math.min(limit, Math.floor(amount));
      account.profile = account.profile && typeof account.profile === 'object' && !Array.isArray(account.profile) ? account.profile : {};
      const previous = Math.max(0, Number(account.profile.coins) || 0);
      account.profile.coins = b.mode === 'set' ? value : Math.min(limit, previous + value);
      account.profileUpdated = Date.now(); saveAccounts();
      return json(200, { ok: true, name: account.name, previous, coins: account.profile.coins });
    }
    if (url === '/admin/api/updatePlayer') {
      const name = String(b.name || '').trim();
      const account = accounts[name.toLowerCase()];
      if (!account) return json(404, { error: 'Аккаунт не найден. Сначала игрок должен зарегистрироваться.' });
      const mode = String(b.mode || '');
      const value = Number(b.value);
      account.profile = account.profile && typeof account.profile === 'object' && !Array.isArray(account.profile) ? account.profile : {};
      const profile = account.profile;
      const ensureCar = id => {
        profile.cars = profile.cars && typeof profile.cars === 'object' && !Array.isArray(profile.cars) ? profile.cars : {};
        const car = profile.cars[id] && typeof profile.cars[id] === 'object' ? profile.cars[id] : { up: [0,0,0,0,0,0], dmg: 0 };
        car.up = Array.isArray(car.up) ? Array.from({length:6}, (_,i) => Math.max(0,Math.min(5,Number(car.up[i])|0))) : [0,0,0,0,0,0];
        car.dmg = Math.max(0,Math.min(100,Number(car.dmg)||0));
        profile.cars[id] = car;
        return car;
      };
      let result = { ok: true, name: account.name };
      if (mode === 'levelSet' || mode === 'levelAdd') {
        if (!Number.isInteger(value) || value < 1 || value > 99999) return json(400, { error: 'Уровень должен быть целым числом от 1 до 99 999.' });
        const current = Math.max(1, Math.min(99999, Number(profile.level)|0 || 1));
        profile.level = mode === 'levelSet' ? value : Math.min(99999, current + value);
        result.level = profile.level;
      } else if (mode === 'unlockCars') {
        for (const id of GAME_CAR_IDS) ensureCar(id);
        result.carsOwned = GAME_CAR_IDS.length;
      } else if (mode === 'maxUpgrades') {
        const existing = profile.cars && typeof profile.cars === 'object' ? Object.keys(profile.cars).filter(id => GAME_CAR_IDS.includes(id)) : ['rust'];
        for (const id of (existing.length ? existing : ['rust'])) ensureCar(id).up = [5,5,5,5,5,5];
        result.upgradedCars = existing.length || 1;
      } else if (mode === 'repairAll') {
        const existing = profile.cars && typeof profile.cars === 'object' ? Object.keys(profile.cars).filter(id => GAME_CAR_IDS.includes(id)) : ['rust'];
        let repaired = 0;
        for (const id of (existing.length ? existing : ['rust'])) { const car = ensureCar(id); if (car.dmg > 0) repaired++; car.dmg = 0; }
        result.repaired = repaired;
      } else {
        return json(400, { error: 'Неизвестная операция изменения профиля.' });
      }
      account.profileUpdated = Date.now(); saveAccounts();
      const cars = profile.cars && typeof profile.cars === 'object' ? profile.cars : {};
      result.carsOwned = Object.keys(cars).filter(id => GAME_CAR_IDS.includes(id) && cars[id] && typeof cars[id] === 'object').length;
      return json(200, result);
    }
    if (url === '/admin/api/kick') { const c = clients.get(+b.id); if (c) kick(c, 'Отключён администратором'); return json(200, { ok: !!c }); }
    if (url === '/admin/api/ban') {
      const n = clean(b.name).toLowerCase(); if (!n) return json(400, { error: 'name' });
      banned.add(n); clients.forEach(c => { if (c.name.toLowerCase() === n) kick(c, 'Вы заблокированы'); }); return json(200, { ok: true });
    }
    if (url === '/admin/api/unban') { banned.delete(clean(b.name).toLowerCase()); return json(200, { ok: true }); }
    if (url === '/admin/api/broadcast') { const text = String(b.text || '').replace(/[\u0000-\u001f]/g, '').slice(0, 120); clients.forEach(c => send(c, { t: 'msg', text })); return json(200, { ok: true }); }
    if (url === '/admin/api/maintenance') { maintenance = !!b.on; if (maintenance) clients.forEach(c => kick(c, 'Технические работы')); return json(200, { ok: true, maintenance }); }
    if (url === '/admin/api/closeRoom') { const r = rooms.get(+b.id); if (r) closeRoom(r, true); return json(200, { ok: !!r }); }
    return json(404, { error: 'not found' });
  }
  json(404, { error: 'not found' });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, maxPayload: 2048 });
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  if (ORIGINS.length && !ORIGINS.includes(origin)) { ws.close(); return; }
  if (maintenance) { ws.send(JSON.stringify({ t: 'kick', reason: 'Технические работы' })); ws.close(); return; }
  if (clients.size >= 300) { ws.close(); return; }
  const c = { ws, id: nextId++, hello: false, name: 'Гонщик', carId: 'rust', gender: 'boy', outfit: 0, skin: 0, paint: null, style: 0, neon: true, rimStyle: 0, wing: null, room: null, st: null, place: 0, tokens: 60, ip: ipOf(req) };
  clients.set(c.id, c);
  send(c, { t: 'welcome', id: c.id, online: clients.size });
  broadcastOnline();

  const refill = setInterval(() => { c.tokens = Math.min(60, c.tokens + 40); }, 1000);
  ws.on('message', raw => {
    if (--c.tokens < 0) return;
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello':
        c.name = clean(m.name) || 'Гонщик'; c.hello = true;
        if (banned.has(c.name.toLowerCase())) return kick(c, 'Вы заблокированы');
        c.carId = String(m.carId || 'rust').slice(0, 12).replace(/[^a-z0-9_]/gi, '');
        c.gender = m.gender === 'girl' ? 'girl' : 'boy'; c.outfit = Math.max(0, Math.min(5, m.outfit | 0)); c.skin = Math.max(0, Math.min(2, m.skin | 0)); c.paint = (typeof m.paint === 'number' && m.paint >= 0 && m.paint <= 0xffffff) ? m.paint|0 : null; c.style = Math.max(0,Math.min(3,m.style|0)); c.neon = m.neon !== false; c.rimStyle = Math.max(0,Math.min(4,m.rimStyle|0)); c.wing = (Number.isInteger(m.wing) && m.wing >= 0 && m.wing <= 3) ? m.wing : null;
        broadcastOnline(); break;
      case 'queue': if (!c.room && !queue.includes(c)) { queue.push(c); c.queuedAt = Date.now(); notifyQueue(); } break;
      case 'createRoom': createPrivateRoom(c,m.maxPlayers); break;
      case 'joinRoom': joinPrivateRoom(c,m.code); break;
      case 'startRoom': if(c.room && c.room.private && c.room.hostId===c.id && !c.room.started) startRoom(c.room); else send(c,{t:'roomError',error:'Начать гонку может только владелец комнаты.'}); break;
      case 'bump': {
        if (c.room && c.room.started && c.room.players.some(p => p.id === +m.target)) {
          const target = c.room.players.find(p => p.id === +m.target);
          if (target && target !== c) {
            const room = c.room, now = Date.now();
            if (!room.bumpCooldowns) room.bumpCooldowns = new Map();
            const pair = [c.id, target.id].sort((a, b) => a - b).join(':');
            if ((room.bumpCooldowns.get(pair) || 0) > now) break;
            room.bumpCooldowns.set(pair, now + 450);
            if (room.bumpCooldowns.size > 120) for (const [key, expiry] of room.bumpCooldowns) if (expiry < now) room.bumpCooldowns.delete(key);
            send(target, { t: 'bump', from: c.id });
          }
        }
        break;
      }
      case 'cancel': queue = queue.filter(x => x !== c); notifyQueue(); break;
      case 's': // состояние машины
        if (c.room && c.room.started && !c.place) c.st = { x: num(m.x, 5000), z: num(m.z, 5000), h: num(m.h, 20), s: num(m.s, 200), p: num(m.p, 100000), y: num(m.y, 50) };
        break;
      case 'finish':
        if (c.room && c.room.started && !c.place) { c.place = ++c.room.finished; send(c, { t: 'place', place: c.place }); if (c.room.finished >= c.room.players.length) closeRoom(c.room); }
        break;
      case 'leave': leaveRoom(c); queue = queue.filter(x => x !== c); notifyQueue(); break;
    }
  });
  ws.on('close', () => { clearInterval(refill); leaveRoom(c); queue = queue.filter(x => x !== c); clients.delete(c.id); notifyQueue(); broadcastOnline(); });
  ws.on('error', () => {});
});

function notifyQueue() { queue.forEach(c => send(c, { t: 'queue', n: queue.length, online: clients.size })); broadcastOnline(); }
function broadcastOnline(){
  // Не показываем WebSocket-соединения, которые ещё не прислали hello: так не появляются фантомные «Гонщик».
  const list=[...clients.values()].filter(c=>c.hello).map(c=>({id:c.id,name:c.name,status:c.room?(c.room.private?(c.room.started?'В приватной гонке':'В комнате'):'В гонке'):queue.includes(c)?'Ищет гонку':'В меню'}));
  clients.forEach(c=>send(c,{t:'onlineList',online:clients.size,players:list}));
}
function leaveRoom(c) {
  const r=c.room; if(!r) return; c.room=null; c.st=null; r.players=r.players.filter(p=>p!==c);
  r.players.forEach(p=>send(p,{t:'left',id:c.id}));
  if(!r.players.length) { closeRoom(r); return; }
  if(r.private && !r.started && r.hostId===c.id) { closeRoom(r,true); return; }
  if(r.private && !r.started) { sendRoomLobby(r); }
}
function closeRoom(r, force) {
  clearInterval(r.timer); clearTimeout(r.launchTimer); clearTimeout(r.killTimer); clearTimeout(r.idleTimer); rooms.delete(r.id);
  r.players.forEach(p=>{p.room=null;p.st=null;if(force)send(p,{t:'roomClosed',reason:r.closeReason||'Владелец закрыл комнату или вышел.'});});
  broadcastOnline();
}

// Матчмейкинг: быстрые гонки запускаются только из общей очереди.
setInterval(() => {
  if (queue.length < 2) return;
  const group=queue.splice(0,Math.min(MAX_ROOM,queue.length));
  const L=1+Math.floor(Math.random()*55), id=nextRoom++, r={id,L,seed:crypto.randomInt(1,2147483646),laps:3,players:group,started:false,finished:0,timer:null,launchTimer:null,killTimer:null,idleTimer:null,private:false};
  rooms.set(id,r); group.forEach((c,i)=>{c.room=r;c.place=0;c.st=null;c.slot=i;});
  startRoom(r);
  notifyQueue();
},1000);

server.listen(PORT, () => console.log('Turbo Rivals server on :' + PORT + (ADMIN_PASSWORD ? '' : ' (ADMIN_PASSWORD не задан — админка отключена)')));
