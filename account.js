(() => {
  const $ = id => document.getElementById(id);
  const status = (s, bad=false) => {
    const el = $('accountStatus');
    if (!el) return;
    el.textContent = s;
    el.style.color = bad ? '#ff8989' : '#a8ffc4';
  };
  const readJSON = (key, fallback={}) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const savedGame = readJSON('tr_save');
  const savedSession = readJSON('tr_session', null);
  const DEFAULT_SERVER = (typeof SERVER_URL !== 'undefined' && SERVER_URL) || 'https://cars-y7s9.onrender.com';
  const toHttp = value => String(value || DEFAULT_SERVER).trim().replace(/^wss:/i,'https:').replace(/^ws:/i,'http:').replace(/\/$/,'');
  const currentSession = () => readJSON('tr_session', null);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let cloudReady = false, profileTimer = null, restoring = false;

  $('accountName').value = localStorage.getItem('tr_account_name') || savedGame.name || '';
  $('accountServer').value = toHttp(savedSession && savedSession.server || DEFAULT_SERVER);
  if (savedSession && savedSession.server) {
    const game = readJSON('tr_save');
    game.set = Object.assign({}, game.set || {}, { server: String(savedSession.server).replace(/^https:/i,'wss:').replace(/^http:/i,'ws:') });
    try { localStorage.setItem('tr_save', JSON.stringify(game)); } catch (_) {}
  }

  function loggedIn(name) {
    const safeName = String(name || 'Гонщик').slice(0,14);
    localStorage.setItem('tr_account_name', safeName);
    $('accountName').value = safeName;
    $('account').hidden = true;
    $('menu').hidden = false;
    window.dispatchEvent(new CustomEvent('tr-account-login', { detail: { name: safeName } }));
    syncInitialProfile();
  }

  async function auth(mode) {
    // Вход только по нику: без пароля и без сервера.
    { const nm = ($('accountName').value || '').trim().slice(0, 14);
      if (!nm) { status('Введите ник', true); return; }
      localStorage.setItem('tr_account_name', nm); $('accountName').value = nm;
      $('account').hidden = true; $('menu').hidden = false;
      window.dispatchEvent(new CustomEvent('tr-account-login', { detail: { name: nm } }));
      return; }
    const name = $('accountName').value.trim(), password = $('accountPass').value;
    if (!name || !password) { status('Введите имя и пароль', true); return; }
    const base = toHttp($('accountServer').value || DEFAULT_SERVER);
    if (!/^https?:\/\//i.test(base)) { status('Укажите адрес сервера аккаунтов', true); return; }
    $('loginAccount').disabled = $('registerAccount').disabled = true;
    status('Подключаемся к серверу…');
    try {
      const r = await fetch(base + '/api/' + mode, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,password}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка сервера');
      if (!d.token) throw new Error('Сервер не вернул токен входа. Обновите server.js.');
      localStorage.setItem('tr_session', JSON.stringify({ token:d.token, server:base }));
      const save = readJSON('tr_save');
      save.name = d.name;
      save.set = Object.assign({}, save.set || {}, { server:base.replace(/^https:/i,'wss:').replace(/^http:/i,'ws:') });
      localStorage.setItem('tr_save', JSON.stringify(save));
      $('accountPass').value = '';
      $('accountServer').value = base;
      cloudReady = false;
      loggedIn(d.name);
      status('Вход выполнен. Этот браузер запомнит сессию.');
    } catch (e) { status((e.message || 'Не удалось войти') + ' · проверьте адрес сервера', true); }
    finally { $('loginAccount').disabled = $('registerAccount').disabled = false; }
  }

  async function restoreSession() {
    if (restoring) return;
    restoring = true;
    const sess = currentSession();
    if (!sess || !sess.token) {
      $('account').hidden = false; $('menu').hidden = true; restoring = false; return;
    }
    const base = toHttp(sess.server || DEFAULT_SERVER);
    $('accountServer').value = base;
    status('Восстанавливаем сохранённый вход…');
    let lastError = null;
    for (let attempt = 0; attempt < 7; attempt++) {
      try {
        const r = await fetch(base + '/api/session', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({token:sess.token}), cache:'no-store'
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) {
          localStorage.removeItem('tr_session');
          $('account').hidden = false; $('menu').hidden = true;
          status('Сессия истекла. Войдите снова.', true);
          restoring = false; return;
        }
        if (!r.ok) throw new Error(d.error || 'Сервер временно недоступен');
        $('accountPass').value = '';
        loggedIn(d.name || localStorage.getItem('tr_account_name') || savedGame.name || 'Гонщик');
        status('Вход восстановлен автоматически');
        restoring = false; return;
      } catch (e) {
        lastError = e;
        if (attempt < 6) {
          status(attempt < 2 ? 'Пробуждаем сервер…' : `Сервер пока не отвечает · попытка ${attempt + 2}/7`);
          await wait(1200 + attempt * 250);
        }
      }
    }
    // Network/server sleep must not erase a valid device session or block offline play.
    const fallbackName = localStorage.getItem('tr_account_name') || savedGame.name || 'Гонщик';
    $('account').hidden = true; $('menu').hidden = false;
    cloudReady = false;
    window.dispatchEvent(new CustomEvent('tr-account-login', { detail:{name:fallbackName, offline:true} }));
    status('Сервер недоступен. Вход сохранён на устройстве; синхронизация возобновится при подключении.', false);
    if (lastError) console.info('Turbo Rivals: session restore deferred:', lastError.message);
    restoring = false;
  }

  async function postSession(path, payload={}) {
    const sess = currentSession();
    if (!sess || !sess.token) throw new Error('Сначала войдите в аккаунт');
    const r = await fetch(toHttp(sess.server) + '/api/' + path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({token:sess.token}, payload))
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Ошибка запроса');
    return d;
  }

  async function syncInitialProfile() {
    cloudReady = false;
    try {
      const data = await postSession('profile');
      cloudReady = true;
      if (data.profile && typeof data.profile === 'object') {
        window.dispatchEvent(new CustomEvent('tr-cloud-profile-load', { detail:{profile:data.profile} }));
      } else {
        window.dispatchEvent(new CustomEvent('tr-cloud-profile-empty'));
      }
    } catch (e) {
      // Keep the local game playable and do not upload over a profile when the server is offline.
      cloudReady = false;
      console.info('Turbo Rivals: cloud profile not available:', e.message);
    }
  }

  window.TRAccount = {
    changePassword: async (current, next) => {
      await postSession('password', {current, next});
      return {message:'Пароль изменён. Для входа на другом устройстве используйте новый пароль.'};
    },
    syncProfile: profile => {
      if (!cloudReady || !profile || typeof profile !== 'object') return;
      clearTimeout(profileTimer);
      let snapshot;
      try { snapshot = JSON.parse(JSON.stringify(profile)); } catch (_) { return; }
      profileTimer = setTimeout(() => {
        postSession('profile', {profile:snapshot}).catch(e => console.info('Turbo Rivals: profile sync deferred:', e.message));
      }, 900);
    },
    logout: async () => {
      try { await postSession('logout'); } catch (_) {}
      cloudReady = false; clearTimeout(profileTimer);
      localStorage.removeItem('tr_session'); localStorage.removeItem('tr_account_name');
      $('accountPass').value = ''; $('account').hidden = false; $('menu').hidden = true;
      window.dispatchEvent(new CustomEvent('tr-account-logout'));
      status('Вы вышли. Локальный прогресс на этом устройстве не удалён.');
    }
  };

  $('loginAccount').addEventListener('click', () => auth('login'));
  $('registerAccount').addEventListener('click', () => auth('register'));
  $('accountPass').addEventListener('keydown', e => { if (e.key === 'Enter') auth('login'); });
  $('accountServer').addEventListener('keydown', e => { if (e.key === 'Enter') auth('login'); });
  // Ник сохраняется на устройстве; сервер для входа не нужен.
  (() => { const nm = (localStorage.getItem('tr_account_name') || '').trim(); if (nm) { $('account').hidden = true; $('menu').hidden = false; window.dispatchEvent(new CustomEvent('tr-account-login', { detail: { name: nm, offline: true } })); } })();
})();
