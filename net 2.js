// Клиент онлайн-гонок. Старые сокеты после тайм-аута не должны влиять на новое соединение.
const SERVER_URL = 'wss://cars-y7s9.onrender.com';

const Net = (() => {
  let ws = null, open = false;
  const h = Object.create(null);
  function connect(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let socket;
      try { socket = new WebSocket(url); }
      catch (e) { reject(e); return; }
      ws = socket;
      let settled = false, wasOpen = false;
      const settleError = err => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { socket.close(); } catch (_) {}
        reject(err instanceof Error ? err : new Error('WebSocket connection failed'));
      };
      const timer = setTimeout(() => settleError(new Error('timeout')), timeoutMs);
      socket.onopen = () => {
        if (ws !== socket) { try { socket.close(); } catch (_) {} return; }
        if (settled) return;
        settled = true; wasOpen = true; open = true; clearTimeout(timer); resolve();
      };
      socket.onerror = () => { if (ws === socket && !wasOpen) settleError(new Error('error')); };
      socket.onclose = () => {
        if (ws !== socket) return;
        open = false;
        if (wasOpen && typeof h.close === 'function') h.close();
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('closed')); }
      };
      socket.onmessage = event => {
        if (ws !== socket) return;
        let message; try { message = JSON.parse(event.data); } catch (_) { return; }
        if (message && typeof message.t === 'string' && typeof h[message.t] === 'function') h[message.t](message);
      };
    });
  }
  const wake = url => {
    try {
      const base = String(url || '').trim().replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '');
      if (/^https?:\/\//i.test(base)) fetch(base + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
    } catch (_) {}
  };
  return {
    connect, wake,
    send: message => { if (open && ws && ws.readyState === 1) ws.send(JSON.stringify(message)); },
    on: (type, fn) => { h[type] = fn; },
    close: () => { const socket = ws; open = false; if (socket) { try { socket.close(); } catch (_) {} } },
    isOpen: () => open
  };
})();
