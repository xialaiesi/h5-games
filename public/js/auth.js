// ==================== Auth 模块 ====================
// 管理登录态：Token 存取、用户信息存取、跳转守卫
// 挂载到 window.Auth

(function (root) {
  'use strict';

  const TOKEN_KEY = 'qiju_token';
  const USER_KEY  = 'qiju_user';
  const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

  function readStorage(storage, key) {
    try {
      return storage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeStorage(storage, key) {
    try {
      storage.removeItem(key);
    } catch (_) {}
  }

  function readCookie(name) {
    try {
      const prefix = `${encodeURIComponent(name)}=`;
      const parts = document.cookie ? document.cookie.split('; ') : [];
      for (const part of parts) {
        if (part.startsWith(prefix)) {
          return decodeURIComponent(part.slice(prefix.length));
        }
      }
    } catch (_) {}
    return null;
  }

  function writeCookie(name, value, maxAgeSeconds) {
    try {
      const segments = [
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
        'Path=/',
        'SameSite=Lax',
      ];
      if (typeof maxAgeSeconds === 'number') {
        segments.push(`Max-Age=${maxAgeSeconds}`);
      }
      document.cookie = segments.join('; ');
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeCookie(name) {
    try {
      document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax`;
    } catch (_) {}
  }

  const Auth = {
    // 获取 token（优先 localStorage，其次 sessionStorage）
    getToken() {
      return (
        readStorage(localStorage, TOKEN_KEY) ||
        readStorage(sessionStorage, TOKEN_KEY) ||
        readCookie(TOKEN_KEY) ||
        null
      );
    },

    // 存储 token 和用户信息
    // sessionStorage 始终保存当前标签页登录态
    // remember=true 时额外写入 localStorage，支持关闭浏览器后保留
    setAuth(token, user, remember = true) {
      this.clearAuth();
      const userText = JSON.stringify(user);

      writeStorage(sessionStorage, TOKEN_KEY, token);
      writeStorage(sessionStorage, USER_KEY, userText);
      writeCookie(TOKEN_KEY, token, remember ? COOKIE_MAX_AGE : undefined);
      writeCookie(USER_KEY, userText, remember ? COOKIE_MAX_AGE : undefined);

      if (remember) {
        writeStorage(localStorage, TOKEN_KEY, token);
        writeStorage(localStorage, USER_KEY, userText);
      }
    },

    // 获取当前用户信息对象
    getUser() {
      try {
        const raw =
          readStorage(localStorage, USER_KEY) ||
          readStorage(sessionStorage, USER_KEY) ||
          readCookie(USER_KEY);
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
      removeStorage(localStorage, TOKEN_KEY);
      removeStorage(localStorage, USER_KEY);
      removeStorage(sessionStorage, TOKEN_KEY);
      removeStorage(sessionStorage, USER_KEY);
      removeCookie(TOKEN_KEY);
      removeCookie(USER_KEY);
    },

    // 更新本地存储的用户信息（如修改昵称后）
    updateUser(patch) {
      const user = this.getUser();
      if (!user) return;
      const updated = Object.assign({}, user, patch);
      const userText = JSON.stringify(updated);
      if (readStorage(sessionStorage, TOKEN_KEY)) {
        writeStorage(sessionStorage, USER_KEY, userText);
      }
      if (readStorage(localStorage, TOKEN_KEY)) {
        writeStorage(localStorage, USER_KEY, userText);
      }
      if (this.getToken()) {
        writeCookie(USER_KEY, userText, readStorage(localStorage, TOKEN_KEY) ? COOKIE_MAX_AGE : undefined);
      }
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
