(() => {
  'use strict';

  // ==================== 配置 ====================
  const GRID_COUNT = 15;
  const PADDING_RATIO = 0.06;
  const STONE_RATIO = 0.42;

  const BOARD_COLOR = '#d4a04a';
  const LINE_COLOR = '#8b6914';
  const DOT_COLOR = '#8b6914';

  // ==================== 状态 ====================
  const state = {
    board: [],        // 0=空, 1=黑, 2=白
    current: 1,       // 1=黑, 2=白
    history: [],      // [{row, col, player}]
    gameOver: false,
    winLine: null,    // [{row, col}, ...]
    mode: 'pvp',      // 'pvp' | 'pve'
    score: { black: 0, white: 0 },
    aiThinking: false,
  };

  // ==================== DOM ====================
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const indBlack = document.getElementById('ind-black');
  const indWhite = document.getElementById('ind-white');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const scoreBoard = document.getElementById('score-board');
  const btnMode = document.getElementById('btn-mode');

  // ==================== 尺寸计算 ====================
  let cellSize, padding, boardPx, stoneRadius;

  function resize() {
    const maxW = Math.min(window.innerWidth - 24, 560);
    const maxH = window.innerHeight - 220;
    const size = Math.min(maxW, maxH);
    boardPx = Math.floor(size);
    canvas.width = boardPx;
    canvas.height = boardPx;
    padding = Math.floor(boardPx * PADDING_RATIO);
    cellSize = (boardPx - padding * 2) / (GRID_COUNT - 1);
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
    // 棋盘底色
    ctx.fillStyle = BOARD_COLOR;
    ctx.beginPath();
    ctx.roundRect(0, 0, boardPx, boardPx, 8);
    ctx.fill();

    // 网格线
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

    // 星位
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
        if (state.board[r][c] !== 0) {
          drawStone(r, c, state.board[r][c]);
        }
      }
    }

    // 最后一手标记
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
      // 黑子
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#555');
      g.addColorStop(1, '#111');
      ctx.fillStyle = g;
    } else {
      // 白子
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#bbb');
      ctx.fillStyle = g;
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 阴影效果
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
    const last = state.winLine[state.winLine.length - 1];

    ctx.save();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gridX(first.col), gridY(first.row));
    ctx.lineTo(gridX(last.col), gridY(last.row));
    ctx.stroke();
    ctx.restore();
  }

  // ==================== 游戏逻辑 ====================
  function initBoard() {
    state.board = Array.from({ length: GRID_COUNT }, () => new Array(GRID_COUNT).fill(0));
    state.current = 1;
    state.history = [];
    state.gameOver = false;
    state.winLine = null;
    state.aiThinking = false;
    updateIndicator();
    updateScore();
  }

  function placeStone(row, col) {
    if (state.gameOver || state.board[row][col] !== 0) return false;
    if (state.aiThinking) return false;

    state.board[row][col] = state.current;
    state.history.push({ row, col, player: state.current });

    const win = checkWin(row, col, state.current);
    if (win) {
      state.winLine = win;
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

    // AI 回合
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

  // ==================== AI（评分式） ====================
  const SCORE_TABLE = {
    five: 1000000,
    liveFour: 100000,
    deadFour: 10000,
    liveThree: 10000,
    deadThree: 1000,
    liveTwo: 500,
    deadTwo: 100,
    one: 10,
  };

  function aiMove() {
    if (state.gameOver) return;

    let bestScore = -Infinity;
    let bestMoves = [];

    // 只搜索有子的位置周围
    const candidates = getAiCandidates();

    for (const [r, c] of candidates) {
      const score = evaluatePosition(r, c);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [[r, c]];
      } else if (score === bestScore) {
        bestMoves.push([r, c]);
      }
    }

    if (bestMoves.length > 0) {
      const [r, c] = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      placeStone(r, c);
    }
  }

  function getAiCandidates() {
    const set = new Set();

    if (state.history.length === 0) {
      return [[7, 7]];
    }

    for (const { row, col } of state.history) {
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r < GRID_COUNT && c >= 0 && c < GRID_COUNT && state.board[r][c] === 0) {
            set.add(r * GRID_COUNT + c);
          }
        }
      }
    }

    return Array.from(set).map(v => [Math.floor(v / GRID_COUNT), v % GRID_COUNT]);
  }

  function evaluatePosition(row, col) {
    // AI 是白棋(2)，评估进攻和防守
    const atkScore = evaluatePoint(row, col, 2);
    const defScore = evaluatePoint(row, col, 1);
    return atkScore * 1.1 + defScore;
  }

  function evaluatePoint(row, col, player) {
    let totalScore = 0;
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    const opp = player === 1 ? 2 : 1;

    for (const [dr, dc] of dirs) {
      let count = 1;
      let block = 0;
      let empty = 0;

      // 正向扫描
      for (let i = 1; i <= 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r < 0 || r >= GRID_COUNT || c < 0 || c >= GRID_COUNT) { block++; break; }
        if (state.board[r][c] === player) { count++; }
        else if (state.board[r][c] === 0) { empty++; break; }
        else { block++; break; }
      }

      // 反向扫描
      for (let i = 1; i <= 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r < 0 || r >= GRID_COUNT || c < 0 || c >= GRID_COUNT) { block++; break; }
        if (state.board[r][c] === player) { count++; }
        else if (state.board[r][c] === 0) { empty++; break; }
        else { block++; break; }
      }

      totalScore += getPatternScore(count, block, empty);
    }

    return totalScore;
  }

  function getPatternScore(count, block, empty) {
    if (count >= 5) return SCORE_TABLE.five;
    if (block === 2) return 0; // 两头都堵死

    if (count === 4) {
      return block === 0 ? SCORE_TABLE.liveFour : SCORE_TABLE.deadFour;
    }
    if (count === 3) {
      return block === 0 ? SCORE_TABLE.liveThree : SCORE_TABLE.deadThree;
    }
    if (count === 2) {
      return block === 0 ? SCORE_TABLE.liveTwo : SCORE_TABLE.deadTwo;
    }
    if (count === 1) {
      return SCORE_TABLE.one;
    }
    return 0;
  }

  // ==================== UI ====================
  function updateIndicator() {
    indBlack.classList.toggle('active', state.current === 1);
    indWhite.classList.toggle('active', state.current === 2);
  }

  function updateScore() {
    scoreBoard.textContent = `黑 ${state.score.black} : ${state.score.white} 白`;
  }

  function showResult(winner) {
    if (winner === 0) {
      modalTitle.textContent = '平局!';
      modalSubtitle.textContent = '棋逢对手';
    } else {
      modalTitle.textContent = (winner === 1 ? '黑棋' : '白棋') + ' 获胜!';
      modalSubtitle.textContent = winner === 1 ? '黑方势不可挡' : '白方后来居上';
    }
    updateScore();
    modal.classList.add('show');
  }

  function restart() {
    modal.classList.remove('show');
    initBoard();
    draw();
  }

  // ==================== 事件 ====================
  function getGridPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = boardPx / rect.width;
    const scaleY = boardPx / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);
    if (row < 0 || row >= GRID_COUNT || col < 0 || col >= GRID_COUNT) return null;
    return { row, col };
  }

  canvas.addEventListener('click', (e) => {
    const pos = getGridPos(e.clientX, e.clientY);
    if (pos) placeStone(pos.row, pos.col);
  });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      const pos = getGridPos(t.clientX, t.clientY);
      if (pos) placeStone(pos.row, pos.col);
    }
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-restart').addEventListener('click', restart);
  document.getElementById('btn-modal-restart').addEventListener('click', restart);

  btnMode.addEventListener('click', () => {
    state.mode = state.mode === 'pvp' ? 'pve' : 'pvp';
    btnMode.textContent = state.mode === 'pvp' ? '模式: 双人' : '模式: 人机';
    restart();
  });

  window.addEventListener('resize', resize);

  // ==================== 启动 ====================
  initBoard();
  resize();
})();
