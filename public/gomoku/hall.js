// ==================== 五子棋大厅逻辑 ====================
(function () {
  'use strict';

  const GAME_TYPE = 'gomoku';

  // ===== 登录守卫 =====
  if (!Auth.requireAuth()) return;

  const user = Auth.getUser();

  // ===== 状态 =====
  const state = {
    matchTimerCount: 0,
    matchTimerInterval: null,
    currentRoomId: null,
    currentInviteCode: null,
  };

  // ===== 渲染用户信息 =====
  function renderUserInfo(data) {
    document.getElementById('user-name').textContent = data.nickname || user.nickname || '玩家';
    const stats  = (data.stats && data.stats[GAME_TYPE]) || { rating: 1000, wins: 0, losses: 0, draws: 0 };
    const rating = stats.rating || 1000;
    document.getElementById('user-rating').textContent = rating + ' 分';
    document.getElementById('user-rank-badge').innerHTML = UI.rankBadgeHTML(rating);
  }

  async function loadUserInfo() {
    try {
      const data = await API.users.me();
      renderUserInfo(data);
    } catch (_) {
      document.getElementById('user-name').textContent = user ? user.nickname : '玩家';
    }
  }

  // ===== WebSocket 连接 =====
  function initWS() {
    const statusEl = document.getElementById('ws-status');

    WS.onState(state => {
      statusEl.textContent = state === 'connected' ? '已连接' : '连接中';
      statusEl.style.color = state === 'connected'
        ? 'var(--color-success)' : 'var(--color-warning)';
    });

    WS.connect();
    registerWSHandlers();
  }

  // ===== WS 消息处理 =====
  function registerWSHandlers() {
    // 在线人数更新
    WS.on('online_count', (payload) => {
      if (payload && payload[GAME_TYPE] !== undefined) {
        document.getElementById('online-count').textContent = payload[GAME_TYPE];
      }
    });

    // 匹配队列确认
    WS.on('queue_joined', (payload) => {
      document.getElementById('match-status-text').textContent =
        '已进入匹配队列，寻找对手中...';
    });

    // 匹配成功
    WS.on('matched', (payload) => {
      stopMatchTimer();
      hideModal('modal-matching');
      if (payload && payload.roomId) {
        UI.toast('匹配成功！即将进入对局', 'success');
        setTimeout(() => {
          location.href = '/gomoku/index.html?roomId=' + payload.roomId;
        }, 800);
      }
    });

    // 房间创建成功
    WS.on('room_created', (payload) => {
      if (!payload) return;
      state.currentRoomId    = payload.roomId;
      state.currentInviteCode = payload.inviteCode;
      showCreateRoomModal(payload.inviteCode);
    });

    // 对方加入房间（创建房间方收到）：直接跳转到对局页
    WS.on('room_joined', (payload) => {
      document.getElementById('room-wait-status').textContent = '对手已加入，游戏即将开始...';
      if (state.currentRoomId) {
        UI.toast('对局开始！', 'success');
        setTimeout(() => {
          location.href = '/gomoku/index.html?roomId=' + state.currentRoomId;
        }, 800);
      }
    });

    // 错误消息
    WS.on('error', (payload) => {
      const msg = (payload && payload.message) || '操作失败，请重试';
      UI.toast(msg, 'error');
      // 如果在匹配中，恢复状态
      stopMatchTimer();
      hideModal('modal-matching');
    });
  }

  // ===== 快速匹配 =====
  document.getElementById('btn-quick-match').addEventListener('click', () => {
    if (!WS.isConnected) {
      UI.toast('正在连接服务器，请稍候...', 'warning');
      return;
    }
    showModal('modal-matching');
    startMatchTimer();
    WS.send('join_queue', { gameType: GAME_TYPE, mode: 'ranked' });
  });

  document.getElementById('btn-cancel-match').addEventListener('click', () => {
    stopMatchTimer();
    hideModal('modal-matching');
    WS.send('leave_queue', {});
    UI.toast('已取消匹配', 'info');
  });

  function startMatchTimer() {
    state.matchTimerCount = 0;
    updateMatchTimerDisplay();
    state.matchTimerInterval = setInterval(() => {
      state.matchTimerCount++;
      updateMatchTimerDisplay();

      // 15s 扩大范围提示
      if (state.matchTimerCount === 15) {
        document.getElementById('match-status-text').textContent = '扩大匹配范围中...';
      }
      // 60s 超时提示
      if (state.matchTimerCount >= 60) {
        stopMatchTimer();
        hideModal('modal-matching');
        WS.send('leave_queue', {});
        UI.toast('匹配超时，暂无合适对手，请稍后再试', 'warning');
      }
    }, 1000);
  }

  function stopMatchTimer() {
    if (state.matchTimerInterval) {
      clearInterval(state.matchTimerInterval);
      state.matchTimerInterval = null;
    }
    state.matchTimerCount = 0;
  }

  function updateMatchTimerDisplay() {
    document.getElementById('match-timer').textContent = state.matchTimerCount;
  }

  // ===== 创建房间 =====
  document.getElementById('btn-create-room').addEventListener('click', () => {
    if (!WS.isConnected) {
      UI.toast('正在连接服务器，请稍候...', 'warning');
      return;
    }
    WS.send('create_room', { gameType: GAME_TYPE, mode: 'casual' });
  });

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = state.currentInviteCode;
    if (!code) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => UI.toast('邀请码已复制', 'success'));
    } else {
      // 降级方案
      const tmp = document.createElement('input');
      tmp.value = code;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      UI.toast('邀请码已复制', 'success');
    }
  });

  document.getElementById('btn-cancel-room').addEventListener('click', () => {
    if (state.currentRoomId) {
      WS.send('leave_room', { roomId: state.currentRoomId });
      state.currentRoomId    = null;
      state.currentInviteCode = null;
    }
    hideModal('modal-create-room');
  });

  function showCreateRoomModal(code) {
    document.getElementById('invite-code-text').textContent = code;
    document.getElementById('room-wait-status').textContent = '等待对手加入...';
    showModal('modal-create-room');
  }

  // ===== 加入房间 =====
  document.getElementById('btn-join-room').addEventListener('click', () => {
    document.getElementById('join-code-input').value = '';
    document.getElementById('join-code-err').textContent = '';
    showModal('modal-join-room');
    setTimeout(() => document.getElementById('join-code-input').focus(), 200);
  });

  document.getElementById('btn-cancel-join').addEventListener('click', () => {
    hideModal('modal-join-room');
  });

  document.getElementById('btn-confirm-join').addEventListener('click', handleJoinRoom);

  document.getElementById('join-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleJoinRoom();
    // 自动大写
    setTimeout(() => {
      e.target.value = e.target.value.toUpperCase();
    }, 0);
  });

  function handleJoinRoom() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    const errEl = document.getElementById('join-code-err');

    if (!code) { errEl.textContent = '请输入邀请码'; return; }
    if (code.length !== 6) { errEl.textContent = '邀请码为6位'; return; }
    if (!WS.isConnected) {
      UI.toast('正在连接服务器，请稍候...', 'warning');
      return;
    }

    errEl.textContent = '';
    const btn = document.getElementById('btn-confirm-join');
    btn.disabled = true;
    btn.textContent = '加入中...';

    // 注册一次性响应：加入成功后直接跳转到对局页
    function onRoomJoined(payload) {
      WS.off('room_joined', onRoomJoined);
      WS.off('error', onJoinError);
      hideModal('modal-join-room');
      const roomId = (payload && payload.roomId) ? payload.roomId : code;
      state.currentRoomId = roomId;
      UI.toast('加入成功！即将进入对局', 'success');
      setTimeout(() => {
        location.href = '/gomoku/index.html?roomId=' + roomId;
      }, 800);
    }

    function onJoinError(payload) {
      WS.off('room_joined', onRoomJoined);
      WS.off('error', onJoinError);
      btn.disabled = false;
      btn.textContent = '加入';
      errEl.textContent = (payload && payload.message) || '加入失败，邀请码无效';
    }

    WS.on('room_joined', onRoomJoined);
    WS.on('error', onJoinError);
    WS.send('join_room', { roomId: code });
  }

  // ===== 单机模式 =====
  document.getElementById('btn-pve').addEventListener('click', () => {
    location.href = '/gomoku/index.html?mode=pve';
  });

  document.getElementById('btn-pvp').addEventListener('click', () => {
    location.href = '/gomoku/index.html?mode=pvp';
  });

  // ===== Modal 工具 =====
  function showModal(id) {
    document.getElementById(id).classList.add('show');
  }

  function hideModal(id) {
    document.getElementById(id).classList.remove('show');
  }

  // 点击遮罩关闭（加入房间弹窗不需要）
  document.getElementById('modal-matching').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      // 不允许点遮罩关闭匹配弹窗，防止误操作
    }
  });

  // ===== 初始化 =====
  loadUserInfo();
  initWS();
})();
