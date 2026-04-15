// ==================== Auth 模块 ====================
// 管理登录态：Token 存取、用户信息存取、跳转守卫
// 挂载到 window.Auth

(function (root) {
  'use strict';

  const TOKEN_KEY = 'qiju_token';
  const USER_KEY  = 'qiju_user';

  const Auth = {
    // 获取 token（优先 localStorage，其次 sessionStorage）
    getToken() {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
    },

    // 存储 token 和用户信息
    // remember=true 存 localStorage，否则存 sessionStorage
    setAuth(token, user, remember = true) {
      this.clearAuth();
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(TOKEN_KEY, token);
      storage.setItem(USER_KEY, JSON.stringify(user));
    },

    // 获取当前用户信息对象
    getUser() {
      try {
        const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    // 是否已登录（token 存在）
    isLoggedIn() {
      return !!this.getToken();
    },

    // 清除登录态（退出登录）
    clearAuth() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    },

    // 更新本地存储的用户信息（如修改昵称后）
    updateUser(patch) {
      const user = this.getUser();
      if (!user) return;
      const updated = Object.assign({}, user, patch);
      const inLocal = !!localStorage.getItem(TOKEN_KEY);
      const storage = inLocal ? localStorage : sessionStorage;
      storage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    },

    // 路由守卫：要求登录才能访问，未登录跳转 login 页
    requireAuth(redirectBack = true) {
      if (!this.isLoggedIn()) {
        const currentPath = location.pathname + location.search + location.hash;
        const target = redirectBack
          ? '/login.html?redirect=' + encodeURIComponent(currentPath)
          : '/login.html';
        location.href = target;
        return false;
      }
      return true;
    },

    // 路由守卫：已登录时跳转首页（用于登录页）
    redirectIfLoggedIn(target = '/index.html') {
      if (this.isLoggedIn()) {
        location.href = target;
        return true;
      }
      return false;
    },

    // 从 URL 参数获取 redirect 地址
    getRedirectUrl(fallback = '/index.html') {
      const params = new URLSearchParams(location.search);
      const redirect = params.get('redirect');
      // 只允许同域跳转，防止开放重定向
      if (redirect) {
        if (redirect.startsWith('/')) return redirect;
        try {
          const url = new URL(redirect, location.origin);
          if (url.origin === location.origin) {
            return url.pathname + url.search + url.hash;
          }
        } catch (_) {}
      }
      return fallback;
    },

    // 解析 JWT payload（不验证签名，仅客户端读取）
    parseToken(token) {
      try {
        const payload = token.split('.')[1];
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      } catch {
        return null;
      }
    },

    // 检查 token 是否过期
    isTokenExpired(token) {
      const payload = this.parseToken(token || this.getToken());
      if (!payload || !payload.exp) return true;
      return Date.now() / 1000 > payload.exp;
    },
  };

  root.Auth = Auth;
})(window);
