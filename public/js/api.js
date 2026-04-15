// ==================== API 模块 ====================
// 基于 fetch 的 HTTP 请求封装，自动携带 JWT 认证头
// 挂载到 window.API

(function (root) {
  'use strict';

  const BASE_URL = '/api';

  // 核心请求方法
  async function request(method, path, body, opts = {}) {
    const token = root.Auth && root.Auth.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.headers) Object.assign(headers, opts.headers);

    const config = { method, headers };
    if (body !== undefined && body !== null) {
      config.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(BASE_URL + path, config);
    } catch (err) {
      throw new Error('网络连接失败，请检查网络');
    }

    // 401 自动清除登录态
    if (res.status === 401 && token) {
      if (root.Auth) root.Auth.clearAuth();
      // 不在登录页时跳转
      if (!location.pathname.includes('/login.html')) {
        location.href = '/login.html';
      }
      throw new Error('登录已过期，请重新登录');
    }

    let payload;
    try {
      payload = await res.json();
    } catch {
      payload = {};
    }

    if (!res.ok) {
      const message =
        (payload && payload.error && payload.error.message) ||
        payload.message ||
        payload.error ||
        `请求失败(${res.status})`;
      const err = new Error(message);
      err.code = (payload && payload.error && payload.error.code) || payload.code || 'REQUEST_FAILED';
      throw err;
    }

    return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
  }

  const API = {
    get:    (path, opts)          => request('GET',    path, null, opts),
    post:   (path, body, opts)    => request('POST',   path, body, opts),
    put:    (path, body, opts)    => request('PUT',    path, body, opts),
    patch:  (path, body, opts)    => request('PATCH',  path, body, opts),
    delete: (path, opts)          => request('DELETE', path, null, opts),

    // 内部方法：获取认证头
    _authHeader() {
      const token = root.Auth && root.Auth.getToken();
      return token ? { 'Authorization': 'Bearer ' + token } : {};
    },

    // 检查是否已登录
    isLoggedIn() {
      return !!(root.Auth && root.Auth.getToken());
    },

    // ===== Auth 接口 =====
    auth: {
      register: (data) => request('POST', '/auth/register', data),
      login:    (data) => request('POST', '/auth/login',    data),
      logout:   ()     => request('POST', '/auth/logout',   {}),
      refresh:  ()     => request('POST', '/auth/refresh',  {}),
    },

    // ===== Users 接口 =====
    users: {
      me:          ()     => request('GET',   '/users/me'),
      updateMe:    (data) => request('PATCH', '/users/me', data),
      getById:     (id)   => request('GET',   `/users/${id}`),
      getRecords:  (id, params) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const target = id === 'me' ? '/users/me/records' : `/users/${id}/records`;
        return request('GET', `${target}${qs}`);
      },
    },

    // ===== BBQ 接口 =====
    bbq: {
      getProgress: () => request('GET', '/bbq/progress'),
      save: (level, stars, score) => request('POST', '/bbq/save', { level, stars, score }),
      getLeaderboard: (limit = 20) => request('GET', `/bbq/leaderboard?limit=${limit}`),
    },

    // ===== Leaderboard 接口 =====
    leaderboard: {
      get: (gameType, limit = 5) =>
        request('GET', `/leaderboard/${gameType}?limit=${limit}`),
    },

    // ===== Rooms 接口 =====
    rooms: {
      getById: (id) => request('GET', `/rooms/${id}`),
    },

    // ===== Records 接口 =====
    records: {
      getById: (id) => request('GET', `/records/${id}`),
    },
  };

  root.API = API;
})(window);
