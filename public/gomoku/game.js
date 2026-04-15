(() => {
  'use strict';

  // ==================== 配置 ====================
  const GRID_COUNT   = 15;
  const PADDING_RATIO = 0.06;
  const STONE_RATIO   = 0.42;

  const BOARD_COLOR = '#d4a04a';
  const LINE_COLOR  = '#8b6914';
  const DOT_COLOR   = '#8b6914';

  // 每步时限（秒）
  const TURN_TIME_LIMIT = 60;

  // ==================== URL 参数解析 ====================
  const urlParams = new URLSearchParams(location.search);
  const urlRoomId = urlParams.get('roomId');
  const urlMode   = urlParams.get('mode') || 'pvp'; // pvp | pve

  // ==================== 状态 ====================
  const state = {
    // --- 棋盘基础状态（单机和在线共用）---
    board:     [],          // 0=空, 1=黑, 2=白
    current:   1,           // 1=黑, 2=白
    history:   [],          // [{row, col, player}]
    gameOver:  false,
    winLine:   null,        // [{row, col}, ...]
    mode:      urlMode,     // 'pvp' | 'pve'
    score:     { black: 0, white: 0 },
    aiThinking: false,

    // --- 在线模式扩展状态 ---
    onlineMode: !!urlRoomId,
    roomId:     urlRoomId || null,
    myColor:    null,         // 1=黑 | 2=白（服务器分配）
    opponentInfo: null,       // { nickname, rating }
    selfInfo:     null,       // { nickname, rating }

    // 倒计时
    timerInterval: null,
    selfSeconds:   TURN_TIME_LIMIT,
    oppSeconds:    TURN_TIME_LIMIT,

    // 是否轮到自己
    get isMyTurn() {
      return this.onlineMode && this.myColor === this.current && !this.gameOver;
    },
  };

  // ==================== DOM ====================
  const canvas       = document.getElementById('board');
  const ctx          = canvas.getContext('2d');
  const indBlack     = document.getElementById('ind-black');
  const indWhite     = document.getElementById('ind-white');
  const modal        = document.getElementById('modal');
  const modalTitle   = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalDelta   = document.getElementById('modal-delta');
  const scoreBoard   = document.getElementById('score-board');
  const btnMode      = document.getElementById('btn-mode');

  // 在线模式 DOM
  const onlineHeader   = document.getElementById('online-header');
  const onlineFooter   = document.getElementById('online-footer');
  const offlineHeader  = document.getElementById('offline-header');
  const offlineControls = document.getElementById('offline-controls');
  const onlineControls  = document.getElementById('online-controls');
  const barOpponent    = document.getElementById('bar-opponent');
  const barSelf        = document.getElementById('bar-self');
  const opponentTimer  = document.getElementById('opponent-timer');
  const selfTimerEl    = document.getElementById('self-timer');
  const disconnectBanner = document.getElementById('disconnect-banner');

  // ==================== 尺寸计算 ====================
  let cellSize, padding, boardPx, stoneRadius;

  function resize() {
    const maxW = Math.min(window.innerWidth - 24, 560);
    const maxH = window.innerHeight - (state.onlineMode ? 260 : 220);
    const size = Math.min(maxW, maxH);
    boardPx = Math.floor(size);
    canvas.width  = boardPx;
    canvas.height = boardPx;
    padding    = Math.floor(boardPx * PADDING_RATIO);
    cellSize   = (boardPx - padding * 2) / (GRID_COUNT - 1);
    stoneRadius = cellSize * STONE_RATIO;
    draw();
  }

  function gridX(col) { return padding + col * cellSize; }
  function gridY(row) { return padding + row * cellSize; }

  // ==================== 绘制 ====================
  function draw() {
    drawBoard();
    drawStones();
    if (state.winLine) drawWinLine();
  }

  function drawBoard() {
    ctx.fillStyle = BOARD_COLOR;
    ctx.beginPath();
    ctx.roundRect(0, 0, boardPx, boardPx, 8);
    ctx.fill();

    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    for (let i = 0; i < GRID_COUNT; i++) {
      ctx.beginPath();
      ctx.moveTo(gridX(i), gridY(0));
      ctx.lineTo(gridX(i), gridY(GRID_COUNT - 1));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(gridX(0), gridY(i));
      ctx.lineTo(gridX(GRID_COUNT - 1), gridY(i));
      ctx.stroke();
    }

    const dots = [3, 7, 11];
    ctx.fillStyle = DOT_COLOR;
    for (const r of dots) {
      for (const c of dots) {
        ctx.beginPath();
        ctx.arc(gridX(c), gridY(r), cellSize * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawStones() {
    for (let r = 0; r < GRID_COUNT; r++) {
      for (let c = 0; c < GRID_COUNT; c++) {
        if (state.board[r][c] !== 0) drawStone(r, c, state.board[r][c]);
      }
    }

    if (state.history.length > 0) {
      const last = state.history[state.history.length - 1];
      const x = gridX(last.col);
      const y = gridY(last.row);
      ctx.fillStyle = last.player === 1 ? '#fff' : '#333';
      ctx.beginPath();
      ctx.arc(x, y, stoneRadius * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStone(row, col, player) {
    const x = gridX(col);
    const y = gridY(row);
    const r = stoneRadius;

    if (player === 1) {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#555');
      g.addColorStop(1, '#111');
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#bbb');
      ctx.fillStyle = g;
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWinLine() {
    if (!state.winLine) return;
    const first = state.winLine[0];
    const last  = state.winLine[state.winLine.length - 1];

    ctx.save();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gridX(first.col), gridY(first.row));
    ctx.lineTo(gridX(last.col),  gridY(last.row));
    ctx.stroke();
    ctx.restore();
  }

  // ==================== 游戏逻辑（单机） ====================
  function initBoard() {
    state.board     = Array.from({ length: GRID_COUNT }, () => new Array(GRID_COUNT).fill(0));
    state.current   = 1;
    state.history   = [];
    state.gameOver  = false;
    state.winLine   = null;
    state.aiThinking = false;
    updateIndicator();
    updateScore();
  }

  // 单机落子（PvP / PvE）
  function placeStone(row, col) {
    if (state.gameOver || state.board[row][col] !== 0) return false;
    if (state.aiThinking) return false;

    state.board[row][col] = state.current;
    state.history.push({ row, col, player: state.current });

    const win = checkWin(row, col, state.current);
    if (win) {
      state.winLine  = win;
      state.gameOver = true;
      if (state.current === 1) state.score.black++;
      else state.score.white++;
      draw();
      setTimeout(() => showResult(state.current), 400);
      return true;
    }

    if (state.history.length === GRID_COUNT * GRID_COUNT) {
      state.gameOver = true;
      draw();
      setTimeout(() => showResult(0), 400);
      return true;
    }

    state.current = state.current === 1 ? 2 : 1;
    updateIndicator();
    draw();

    if (state.mode === 'pve' && state.current === 2 && !state.gameOver) {
      state.aiThinking = true;
      setTimeout(() => {
        aiMove();
        state.aiThinking = false;
      }, 200);
    }

    return true;
  }

  function checkWin(row, col, player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
      const line = [{ row, col }];
      for (let d = -1; d <= 1; d += 2) {
        for (let i = 1; i < 5; i++) {
          const r = row + dr * i * d;
          const c = col + dc * i * d;
          if (r < 0 || r >= GRID_COUNT || c < 0 || c >= GRID_COUNT) break;
          if (state.board[r][c] !== player) break;
          if (d === -1) line.unshift({ row: r, col: c });
          else line.push({ row: r, col: c });
        }
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  function undo() {
    if (state.gameOver || state.history.length === 0) return;
    if (state.aiThinking) return;

    const steps = (state.mode === 'pve' && state.history.length >= 2) ? 2 : 1;
    for (let i = 0; i < steps && state.history.length > 0; i++) {
      const last = state.history.pop();
      state.board[last.row][last.col] = 0;
      state.current = last.player;
    }
    updateIndicator();
    draw();
  }

  function restart() {
    modal.classList.remove('show');
    if (state.onlineMode) {
      // 在线模式下「再来一局」跳回大厅
      location.href = '/gomoku/hall.html';
      return;
    }
    initBoard();
    draw();
  }

  // ==================== AI ====================
  const SCORE_TABLE = {
    five: 1000000, liveFour: 100000, deadFour: 10000,
    liveThree: 10000, deadThree: 1000, liveTwo: 500, deadTwo: 100, one: 10,
  };

  function aiMove() {
    if (state.gameOver) return;
    let bestScore = -Infinity;
    let bestMoves = [];
    const candidates = getAiCandidates();

    for (const [r, c] of candidates) {
      const score = evaluatePosition(r, c);
      if (score > bestScore)      { bestScore = score; bestMoves = [[r, c]]; }
      else if (score === bestScore) bestMoves.push([r, c]);
    }

    if (bestMoves.length > 0) {
      const [r, c] = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      placeStone(r, c);
    }
  }

  function getAiCandidates() {
    const set = new Set();
    if (state.history.length === 0) return [[7, 7]];
    for (const { row, col } of state.history) {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = row + dr, c = col + dc;
          if (r >= 0 && r < GRID_COUNT && c >= 0 && c < GRID_COUNT && state.board[r][c] === 0)
            set.add(r * GRID_COUNT + c);
        }
      }
    }
    return Array.from(set).map(v => [Math.floor(v / GRID_COUNT), v % GRID_COUNT]);
  }

  function evaluatePosition(row, col) {
    return evaluatePoint(row, col, 2) * 1.1 + evaluatePoint(row, col, 1);
  }

  function evaluatePoint(row, col, player) {
    let totalScore = 0;
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    const opp  = player === 1 ? 2 : 1;

    for (const [dr, dc] of dirs) {
      let count = 1, block = 0, empty = 0;
      for (let i = 1; i <= 4; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (r < 0 || r >= GRID_COUNT || c < 0 || c >= GRID_COUNT) { block++; break; }
        if (state.board[r][c] === player) count++;
        else if (state.board[r][c] === 0) { empty++; break; }
        else { block++; break; }
      }
      for (let i = 1; i <= 4; i++) {
        const r = row - dr * i, c = col - dc * i;
        if (r < 0 || r >= GRID_COUNT || c < 0 || c >= GRID_COUNT) { block++; break; }
        if (state.board[r][c] === player) count++;
        else if (state.board[r][c] === 0) { empty++; break; }
        else { block++; break; }
      }
      totalScore += getPatternScore(count, block, empty);
    }
    return totalScore;
  }

  function getPatternScore(count, block, empty) {
    if (count >= 5) return SCORE_TABLE.five;
    if (block === 2) return 0;
    if (count === 4) return block === 0 ? SCORE_TABLE.liveFour  : SCORE_TABLE.deadFour;
    if (count === 3) return block === 0 ? SCORE_TABLE.liveThree : SCORE_TABLE.deadThree;
    if (count === 2) return block === 0 ? SCORE_TABLE.liveTwo   : SCORE_TABLE.deadTwo;
    if (count === 1) return SCORE_TABLE.one;
    return 0;
  }

  // ==================== UI 更新 ====================
  function updateIndicator() {
    if (state.onlineMode) {
      // 在线模式：高亮当前行棋方的信息条
      barSelf.classList.toggle('active', state.current === state.myColor);
      barOpponent.classList.toggle('active', state.current !== state.myColor);
    } else {
      indBlack.classList.toggle('active', state.current === 1);
      indWhite.classList.toggle('active', state.current === 2);
    }
  }

  function updateScore() {
    if (scoreBoard) scoreBoard.textContent = `黑 ${state.score.black} : ${state.score.white} 白`;
  }

  function showResult(winner, extra = {}) {
    stopTimer();

    if (state.onlineMode) {
      // 在线模式：展示积分变化
      const ratingDelta = extra.ratingDelta;
      if (winner === state.myColor) {
        modalTitle.textContent   = '你赢了！';
        modalSubtitle.textContent = extra.reason || '精彩对局';
      } else if (winner === 0) {
        modalTitle.textContent   = '平局';
        modalSubtitle.textContent = '势均力敌';
      } else {
        modalTitle.textContent   = '你输了';
        modalSubtitle.textContent = extra.reason || '再接再厉';
      }

      if (ratingDelta !== undefined && ratingDelta !== null) {
        const sign = ratingDelta > 0 ? '+' : '';
        modalDelta.textContent = `积分 ${sign}${ratingDelta}`;
        modalDelta.className   = 'modal-delta ' + (ratingDelta >= 0 ? 'positive' : 'negative');
        modalDelta.classList.remove('hidden');
      }
    } else {
      // 单机模式
      if (winner === 0) {
        modalTitle.textContent   = '平局!';
        modalSubtitle.textContent = '棋逢对手';
      } else {
        modalTitle.textContent   = (winner === 1 ? '黑棋' : '白棋') + ' 获胜!';
        modalSubtitle.textContent = winner === 1 ? '黑方势不可挡' : '白方后来居上';
      }
      updateScore();
    }

    modal.classList.add('show');
  }

  // ==================== 在线模式 ====================
  // 应用服务器下发的棋步（收到 move_applied 后调用）
  function applyMove(row, col, player) {
    if (state.board[row][col] !== 0) return;
    state.board[row][col] = player;
    state.history.push({ row, col, player });

    const win = checkWin(row, col, player);
    if (win) {
      state.winLine  = win;
      state.gameOver = true;
    }

    state.current = player === 1 ? 2 : 1;
    updateIndicator();
    draw();
    resetTimer();
  }

  // 发起在线模式，连接 WS 并等待 game_start
  function initOnlineGame(roomId) {
    // 切换 UI 为在线模式
    offlineHeader.style.display   = 'none';
    offlineControls.style.display = 'none';
    onlineHeader.style.display    = 'block';
    onlineFooter.style.display    = 'block';
    onlineControls.style.display  = 'flex';

    // 填充自身信息
    const user = window.Auth && Auth.isLoggedIn() ? Auth.getUser() : null;
    if (user) {
      document.getElementById('self-name').textContent = user.nickname || '我';
    }

    // 连接 WS
    WS.connect();
    registerOnlineHandlers(roomId);

    // 发送 ready
    WS.on('auth_ok', () => {
      WS.send('ready', {}, roomId);
    });

    // 如果 WS 已经连接（已鉴权），直接 ready
    if (WS.isConnected) {
      WS.send('ready', {}, roomId);
    }
  }

  function registerOnlineHandlers(roomId) {
    // 游戏开始
    WS.on('game_start', (payload) => {
      if (!payload) return;
      // myColor: 服务器下发 'black'/'white' 字符串，映射为数字 1/2
      const colorMap = { black: 1, white: 2 };
      state.myColor = colorMap[payload.myColor] || 1;

      // 对手信息
      state.opponentInfo = payload.opponent || {};
      state.selfInfo     = payload.self     || {};

      // boardState 是直接的二维数组 number[][]
      // firstTurn 是字符串 'black'/'white'
      if (payload.boardState && Array.isArray(payload.boardState)) {
        state.board   = payload.boardState;
        state.current = colorMap[payload.firstTurn] || 1;
      } else {
        state.current = colorMap[payload.firstTurn] || 1;
      }

      updateOnlinePlayerBars();
      updateIndicator();
      draw();
      startTimer();
    });

    // 服务器确认落子
    // 服务器广播格式: { moveData: {row, col}, boardState, nextTurn, timeLeft }
    WS.on('move_applied', (payload) => {
      if (!payload) return;
      const moveData = payload.moveData || {};
      const { row, col } = moveData;
      // nextTurn 是字符串 'black'/'white'，刚走棋的是另一方
      const colorMap = { black: 1, white: 2 };
      const nextTurnNum = colorMap[payload.nextTurn] || (state.current === 1 ? 2 : 1);
      // 刚走棋的 player = 下一回合的对方
      const player = nextTurnNum === 1 ? 2 : 1;
      // 如果服务器下发了最新棋盘状态，直接同步
      if (payload.boardState && Array.isArray(payload.boardState)) {
        state.board = payload.boardState;
      }
      applyMove(row, col, player);
    });

    // 对方走棋（部分实现可能用这个消息名）
    WS.on('opponent_move', (payload) => {
      if (!payload) return;
      const move = payload.moveData || payload;
      applyMove(move.row, move.col, move.player || (state.myColor === 1 ? 2 : 1));
    });

    // 对局结束
    // 服务器 winner 是 'black'/'white' 字符串或 null（平局）
    WS.on('game_over', (payload) => {
      if (!payload) return;
      state.gameOver = true;
      const colorMap = { black: 1, white: 2 };
      const winner = payload.winner ? (colorMap[payload.winner] || 0) : 0;
      showResult(winner, { reason: payload.reason, ratingDelta: payload.ratingDelta });
    });

    // 对方掉线
    WS.on('opponent_disconnected', (payload) => {
      const seconds = (payload && payload.waitSeconds) || 60;
      disconnectBanner.classList.add('show');
      let countEl = document.getElementById('disconnect-countdown');

      let remaining = seconds;
      const countdownInterval = setInterval(() => {
        remaining--;
        if (countEl) countEl.textContent = `(${remaining}s)`;
        if (remaining <= 0) clearInterval(countdownInterval);
      }, 1000);
    });

    // 对方重连
    WS.on('opponent_reconnected', () => {
      disconnectBanner.classList.remove('show');
    });

    // 超时警告
    WS.on('timeout_warning', (payload) => {
      const seconds = (payload && payload.secondsLeft) || 10;
      if (state.current === state.myColor) {
        setTimerDisplay(selfTimerEl, seconds);
      } else {
        setTimerDisplay(opponentTimer, seconds);
      }
    });

    // 超时判负
    WS.on('timeout', (payload) => {
      state.gameOver = true;
      const loser    = payload && payload.loser;
      const winner   = loser === state.myColor ? (state.myColor === 1 ? 2 : 1) : state.myColor;
      showResult(winner, { reason: '超时判负', ratingDelta: payload && payload.ratingDelta });
    });

    // 和棋提议
    WS.on('draw_offered', () => {
      document.getElementById('draw-offer-modal').classList.add('show');
    });

    // 和棋被拒（draw_accepted 不需要监听，和棋通过 game_over(reason='draw') 通知）
    WS.on('draw_rejected', () => {
      if (window.UI) UI.toast('对手拒绝了和棋', 'info');
    });
  }

  // 更新在线玩家信息条
  function updateOnlinePlayerBars() {
    const opp  = state.opponentInfo || {};
    const self = state.selfInfo     || {};
    const user = window.Auth && Auth.getUser();

    // 对手信息条
    document.getElementById('opponent-name').textContent = opp.nickname || '对手';
    document.getElementById('opponent-rating').textContent = opp.rating ? (opp.rating + ' 分') : '';

    // 自身信息条
    const selfNick = self.nickname || (user && user.nickname) || '我';
    document.getElementById('self-name').textContent = selfNick;
    document.getElementById('self-rating').textContent = self.rating ? (self.rating + ' 分') : '';

    // 设置棋子颜色
    const myColorCls  = state.myColor === 1 ? 'black' : 'white';
    const oppColorCls = state.myColor === 1 ? 'white' : 'black';
    document.getElementById('self-stone').className     = 'stone-dot ' + myColorCls;
    document.getElementById('opponent-stone').className = 'stone-dot ' + oppColorCls;
  }

  // ==================== 倒计时 ====================
  function startTimer() {
    stopTimer();
    state.selfSeconds = TURN_TIME_LIMIT;
    state.oppSeconds  = TURN_TIME_LIMIT;
    updateTimerDisplays();

    state.timerInterval = setInterval(() => {
      if (state.gameOver) { stopTimer(); return; }

      if (state.current === state.myColor) {
        state.selfSeconds = Math.max(0, state.selfSeconds - 1);
        setTimerDisplay(selfTimerEl, state.selfSeconds);
      } else {
        state.oppSeconds = Math.max(0, state.oppSeconds - 1);
        setTimerDisplay(opponentTimer, state.oppSeconds);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function resetTimer() {
    state.selfSeconds = TURN_TIME_LIMIT;
    state.oppSeconds  = TURN_TIME_LIMIT;
    updateTimerDisplays();
  }

  function updateTimerDisplays() {
    setTimerDisplay(selfTimerEl,   state.selfSeconds);
    setTimerDisplay(opponentTimer, state.oppSeconds);
  }

  function setTimerDisplay(el, seconds) {
    if (!el) return;
    el.textContent = seconds;
    el.classList.remove('warning', 'danger');
    if (seconds <= 10) el.classList.add('danger');
    else if (seconds <= 20) el.classList.add('warning');
  }

  // ==================== 点击处理 ====================
  function getGridPos(clientX, clientY) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = boardPx / rect.width;
    const scaleY = boardPx / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top)  * scaleY;
    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);
    if (row < 0 || row >= GRID_COUNT || col < 0 || col >= GRID_COUNT) return null;
    return { row, col };
  }

  function handleClick(clientX, clientY) {
    const pos = getGridPos(clientX, clientY);
    if (!pos) return;

    if (state.onlineMode) {
      handleOnlineClick(pos.row, pos.col);
    } else {
      placeStone(pos.row, pos.col);
    }
  }

  // 在线模式下的点击处理
  function handleOnlineClick(row, col) {
    if (state.gameOver) return;
    if (!state.isMyTurn) return;            // 不是自己的回合，忽略
    if (state.board[row][col] !== 0) return; // 已有子

    // 发送 move，等服务器确认后再渲染（服务器权威模式）
    WS.send('move', { moveData: { row, col } }, state.roomId);

    // 乐观预渲染：立即显示棋子（服务器不通过则会被 boardState 覆盖）
    state.board[row][col] = state.myColor;
    state.history.push({ row, col, player: state.myColor });
    draw();
  }

  canvas.addEventListener('click', (e) => handleClick(e.clientX, e.clientY));
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      handleClick(t.clientX, t.clientY);
    }
  });

  // ==================== 按钮事件 ====================
  // 单机按钮
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-restart').addEventListener('click', restart);
  document.getElementById('btn-modal-restart').addEventListener('click', restart);

  btnMode.addEventListener('click', () => {
    state.mode = state.mode === 'pvp' ? 'pve' : 'pvp';
    btnMode.textContent = state.mode === 'pvp' ? '模式: 双人' : '模式: 人机';
    // 重置游戏
    modal.classList.remove('show');
    initBoard();
    draw();
  });

  // 在线按钮
  document.getElementById('btn-resign').addEventListener('click', async () => {
    if (!state.roomId || state.gameOver) return;
    if (window.UI) {
      const ok = await UI.confirm({ title: '认输', message: '确认认输吗？', confirmText: '确认认输', danger: true });
      if (!ok) return;
    }
    WS.send('resign', { roomId: state.roomId });
    state.gameOver = true;
  });

  document.getElementById('btn-draw-offer').addEventListener('click', () => {
    if (!state.roomId || state.gameOver) return;
    WS.send('draw_offer', { roomId: state.roomId });
    if (window.UI) UI.toast('已发送和棋请求', 'info');
  });

  // 和棋弹窗按钮
  document.getElementById('btn-draw-accept').addEventListener('click', () => {
    document.getElementById('draw-offer-modal').classList.remove('show');
    WS.send('draw_response', { roomId: state.roomId, accept: true });
  });

  document.getElementById('btn-draw-reject').addEventListener('click', () => {
    document.getElementById('draw-offer-modal').classList.remove('show');
    WS.send('draw_response', { roomId: state.roomId, accept: false });
  });

  window.addEventListener('resize', resize);

  // ==================== 启动 ====================
  initBoard();

  if (state.onlineMode) {
    initOnlineGame(state.roomId);
  } else {
    // 根据 URL 参数设置初始模式
    if (urlMode === 'pve') {
      state.mode = 'pve';
      btnMode.textContent = '模式: 人机';
    }
  }

  resize();
})();
