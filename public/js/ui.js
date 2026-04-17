// ==================== UI 公共组件模块 ====================
// Toast 提示、Modal 弹窗、Loading 遮罩、Confirm 确认框
// 挂载到 window.UI

(function (root) {
  'use strict';

  // ===== Toast 提示 =====
  let toastContainer = null;

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  function toast(message, type = 'info', duration = 3000) {
    const container = ensureToastContainer();

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;

    const icons = { success: 'OK', error: 'NO', warning: '!', info: 'i' };
    el.innerHTML = `
      <span class="toast-badge">${icons[type] || 'i'}</span>
      <span>${message}</span>
    `;

    container.appendChild(el);

    // duration 后移除
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, duration);
  }

  // ===== Loading 遮罩 =====
  let loadingOverlay = null;
  let loadingCount   = 0;

  function ensureLoadingOverlay() {
    if (!loadingOverlay) {
      loadingOverlay = document.getElementById('loading-overlay');
      if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.innerHTML = `
          <div class="loading-spinner"></div>
          <div class="loading-text" id="loading-text">加载中...</div>
        `;
        document.body.appendChild(loadingOverlay);
      }
    }
    return loadingOverlay;
  }

  function showLoading(text = '加载中...') {
    const el = ensureLoadingOverlay();
    const textEl = el.querySelector('#loading-text');
    if (textEl) textEl.textContent = text;
    loadingCount++;
    el.classList.add('show');
  }

  function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) {
      const el = ensureLoadingOverlay();
      el.classList.remove('show');
    }
  }

  // ===== Modal 弹窗 =====
  // 通用：动态创建并挂载到 body
  function createModal({ title, body, buttons = [], onClose, closeOnOverlay = true }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';

    const box = document.createElement('div');
    box.className = 'modal-box';

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = title || '';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof HTMLElement) bodyEl.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    buttons.forEach(({ text, type = 'outline', onClick, closeOnClick = true }) => {
      const btn = document.createElement('button');
      btn.className = `btn btn-${type}`;
      btn.textContent = text;
      btn.addEventListener('click', () => {
        if (onClick) onClick();
        if (closeOnClick) closeModal();
      });
      footer.appendChild(btn);
    });

    box.appendChild(titleEl);
    box.appendChild(bodyEl);
    if (buttons.length) box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // 阻止冒泡
    box.addEventListener('click', e => e.stopPropagation());

    if (closeOnOverlay) {
      overlay.addEventListener('click', () => closeModal());
    }

    function closeModal() {
      overlay.classList.remove('show');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 300);
      if (onClose) onClose();
    }

    return { overlay, closeModal };
  }

  // ===== Confirm 确认框 =====
  function confirm({ title, message, confirmText = '确认', cancelText = '取消', onConfirm, onCancel, danger = false }) {
    return new Promise(resolve => {
      const { closeModal } = createModal({
        title,
        body: message,
        buttons: [
          {
            text: cancelText,
            type: 'ghost',
            onClick: () => { if (onCancel) onCancel(); resolve(false); },
          },
          {
            text: confirmText,
            type: danger ? 'danger' : 'gold',
            onClick: () => { if (onConfirm) onConfirm(); resolve(true); },
          },
        ],
        closeOnOverlay: false,
        onClose: () => resolve(false),
      });
    });
  }

  // ===== 工具：渲染段位徽章 =====
  function getRankInfo(rating) {
    const ranks = [
      { min: 2000, name: '招牌店长', cls: 'rank-legend' },
      { min: 1700, name: '炭火大师', cls: 'rank-grandmaster' },
      { min: 1500, name: '掌炉高手', cls: 'rank-master' },
      { min: 1300, name: '夜市红人', cls: 'rank-knight' },
      { min: 1100, name: '小摊主', cls: 'rank-apprentice' },
      { min: 0,    name: '试营业', cls: 'rank-novice' },
    ];
    return ranks.find(r => rating >= r.min) || ranks[ranks.length - 1];
  }

  function rankBadgeHTML(rating) {
    const info = getRankInfo(rating);
    return `<span class="rank-badge ${info.cls}">${info.name}</span>`;
  }

  // ===== 工具：格式化时间 =====
  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000)   return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000)return Math.floor(diff / 3600000) + '小时前';

    const yyyy = d.getFullYear();
    const MM   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    if (yyyy === now.getFullYear()) return `${MM}-${dd}`;
    return `${yyyy}-${MM}-${dd}`;
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ===== 工具：随机昵称 =====
  function randomNickname() {
    const adjs  = ['火候','炭香','鲜辣','稳准','秘制','利落','掌火','夜摊'];
    const nouns = ['摊主','烤手','厨神','串王','炉长','调味师','烧烤家','掌勺'];
    const num   = Math.floor(Math.random() * 900) + 100;
    return adjs[Math.floor(Math.random() * adjs.length)] +
           nouns[Math.floor(Math.random() * nouns.length)] + num;
  }

  // ===== 工具：倒计时环绘制 =====
  // 返回一个包含 update(secondsLeft, total) 方法的对象
  function createTimerRing(container, radius = 20) {
    const circumference = 2 * Math.PI * radius;
    container.innerHTML = `
      <div class="timer-ring">
        <svg width="${radius * 2 + 8}" height="${radius * 2 + 8}">
          <circle class="timer-ring-track" cx="${radius + 4}" cy="${radius + 4}" r="${radius}"/>
          <circle class="timer-ring-progress" cx="${radius + 4}" cy="${radius + 4}" r="${radius}"
            stroke-dasharray="${circumference}" stroke-dashoffset="0"/>
        </svg>
        <span class="timer-value">--</span>
      </div>
    `;

    const progress = container.querySelector('.timer-ring-progress');
    const value    = container.querySelector('.timer-value');
    progress.style.strokeDasharray = circumference;

    return {
      update(secondsLeft, total) {
        const ratio = Math.max(0, Math.min(1, secondsLeft / total));
        progress.style.strokeDashoffset = circumference * (1 - ratio);
        value.textContent = secondsLeft;

        progress.classList.remove('warning', 'danger');
        if (secondsLeft <= 10) progress.classList.add('danger');
        else if (secondsLeft <= 20) progress.classList.add('warning');
      },
      reset() {
        progress.style.strokeDashoffset = 0;
        value.textContent = '--';
        progress.classList.remove('warning', 'danger');
      },
    };
  }

  const UI = {
    toast,
    showLoading,
    hideLoading,
    createModal,
    confirm,
    getRankInfo,
    rankBadgeHTML,
    formatTime,
    formatDate,
    randomNickname,
    createTimerRing,
  };

  root.UI = UI;
})(window);
