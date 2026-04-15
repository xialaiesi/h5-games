// ==================== WebSocket 客户端模块 ====================
// 管理 WebSocket 连接、消息收发、自动重连、心跳
// 挂载到 window.WS

(function (root) {
  'use strict';

  const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

  const RECONNECT_DELAY_BASE = 1000;  // 初始重连间隔 1s
  const RECONNECT_DELAY_MAX  = 16000; // 最大重连间隔 16s
  const RECONNECT_MAX_TRIES  = 8;
  const HEARTBEAT_INTERVAL   = 25000; // 25s 心跳
  const HEARTBEAT_TIMEOUT    = 8000;  // 8s 等待 pong

  let socket        = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let pongTimer      = null;
  let reconnectCount = 0;
  let manualClose    = false;

  // 消息监听器 Map：type -> [handler, ...]
  const listeners = new Map();
  // 连接状态监听器
  const stateListeners = [];

  function getState() {
    if (!socket) return 'disconnected';
    switch (socket.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN:       return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:     return 'disconnected';
      default:                   return 'disconnected';
    }
  }

  function notifyState(state) {
    stateListeners.forEach(fn => { try { fn(state); } catch (e) {} });
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        WS.send('ping', {});
        // 等待 pong，超时则认为连接断开
        pongTimer = setTimeout(() => {
          console.warn('[WS] pong timeout, reconnecting...');
          if (socket) socket.close();
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (pongTimer)      { clearTimeout(pongTimer);       pongTimer = null; }
  }

  function scheduleReconnect() {
    if (manualClose || reconnectCount >= RECONNECT_MAX_TRIES) return;
    const delay = Math.min(RECONNECT_DELAY_BASE * Math.pow(2, reconnectCount), RECONNECT_DELAY_MAX);
    reconnectCount++;
    console.log(`[WS] reconnect #${reconnectCount} in ${delay}ms`);
    reconnectTimer = setTimeout(() => WS.connect(), delay);
  }

  const WS = {
    // 建立 WebSocket 连接并完成 auth 鉴权
    connect() {
      if (socket && socket.readyState === WebSocket.OPEN) return;

      manualClose = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      notifyState('connecting');

      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        console.log('[WS] connected');
        reconnectCount = 0;
        notifyState('connected');
        startHeartbeat();

        // 自动发送 auth 鉴权
        const token = root.Auth && root.Auth.getToken();
        if (token) {
          this.send('auth', { token });
        }
      };

      socket.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        // 心跳 pong 处理
        if (msg.type === 'pong') {
          if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
          return;
        }

        // 分发消息
        const handlers = listeners.get(msg.type) || [];
        handlers.forEach(fn => { try { fn(msg.payload, msg); } catch (e) { console.error(e); } });

        // 通配监听器（type='*'）
        const wildcards = listeners.get('*') || [];
        wildcards.forEach(fn => { try { fn(msg); } catch (e) { console.error(e); } });
      };

      socket.onerror = (e) => {
        console.warn('[WS] error', e);
      };

      socket.onclose = (e) => {
        console.log('[WS] closed', e.code, e.reason);
        stopHeartbeat();
        notifyState('disconnected');
        if (!manualClose) scheduleReconnect();
      };
    },

    // 发送消息
    send(type, payload, roomId) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('[WS] send failed: not connected', type);
        return false;
      }
      const msg = { type, payload: payload || {} };
      if (roomId) msg.roomId = roomId;
      socket.send(JSON.stringify(msg));
      return true;
    },

    // 注册消息监听器
    on(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },

    // 注销消息监听器
    off(type, handler) {
      if (!listeners.has(type)) return;
      if (!handler) {
        listeners.delete(type);
        return;
      }
      const arr = listeners.get(type).filter(fn => fn !== handler);
      if (arr.length) listeners.set(type, arr);
      else listeners.delete(type);
    },

    // 监听连接状态变化
    onState(fn) {
      stateListeners.push(fn);
    },

    offState(fn) {
      const idx = stateListeners.indexOf(fn);
      if (idx >= 0) stateListeners.splice(idx, 1);
    },

    // 主动断开（不触发重连）
    disconnect() {
      manualClose = true;
      stopHeartbeat();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (socket) { socket.close(); socket = null; }
      notifyState('disconnected');
    },

    // 清空某个 type 的所有监听器（页面销毁时调用）
    clearListeners(type) {
      if (type) listeners.delete(type);
      else listeners.clear();
    },

    getState,

    get isConnected() { return getState() === 'connected'; },
  };

  root.WS = WS;
})(window);
