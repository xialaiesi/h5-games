(() => {
  'use strict';

  // ==================== 常量 ====================
  const COLS = 9;
  const ROWS = 10;
  const BOARD_COLOR = '#d4a04a';
  const LINE_COLOR  = '#6b4c14';
  const TURN_TIME_LIMIT = 60;

  const PIECES = {
    K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
    k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒',
  };

  function isRed(p)   { return p >= 'A' && p <= 'Z'; }
  function isBlack(p) { return p >= 'a' && p <= 'z'; }
  function sameColor(a, b) {
    if (!a || !b) return false;
    return (isRed(a) && isRed(b)) || (isBlack(a) && isBlack(b));
  }
  function pieceColor(p) { return isRed(p) ? 'red' : 'black'; }

  // ==================== URL 参数 ====================
  const urlParams = new URLSearchParams(location.search);
  const urlRoomId = urlParams.get('roomId');
  const urlMode   = urlParams.get('mode') || 'pvp';

  // ==================== 初始棋盘 ====================
  const INIT_BOARD = [
    ['r','n','b','a','k','a','b','n','r'],
    [' ',' ',' ',' ',' ',' ',' ',' ',' '],
    [' ','c',' ',' ',' ',' ',' ','c',' '],
    ['p',' ','p',' ','p',' ','p',' ','p'],
    [' ',' ',' ',' ',' ',' ',' ',' ',' '],
    [' ',' ',' ',' ',' ',' ',' ',' ',' '],
    ['P',' ','P',' ','P',' ','P',' ','P'],
    [' ','C',' ',' ',' ',' ',' ','C',' '],
    [' ',' ',' ',' ',' ',' ',' ',' ',' '],
    ['R','N','B','A','K','A','B','N','R'],
  ];

  // ==================== 状态 ====================
  const state = {
    board:      [],
    current:    'red',
    selected:   null,
    validMoves: [],
    history:    [],
    gameOver:   false,
    mode:       urlMode,

    // 在线扩展
    onlineMode:   !!urlRoomId,
    roomId:       urlRoomId || null,
    myColor:      null,       // 'red' | 'black'
    opponentInfo: null,
    selfInfo:     null,

    timerInterval: null,
    selfSeconds:   TURN_TIME_LIMIT,
    oppSeconds:    TURN_TIME_LIMIT,

    get isMyTurn() {
      return this.onlineMode && this.myColor === this.current && !this.gameOver;
    },
  };

  // ==================== DOM ====================
  const canvas       = document.getElementById('board');
  const ctx          = canvas.getContext('2d');
  const indRed       = document.getElementById('ind-red');
  const indBlack     = document.getElementById('ind-black');
  const modal        = document.getElementById('modal');
  const modalTitle   = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalDelta   = document.getElementById('modal-delta');
  const btnMode      = document.getElementById('btn-mode');

  const onlineHeader     = document.getElementById('online-header');
  const onlineFooter     = document.getElementById('online-footer');
  const offlineHeader    = document.getElementById('offline-header');
  const offlineControls  = document.getElementById('offline-controls');
  const onlineControls   = document.getElementById('online-controls');
  const barOpponent      = document.getElementById('bar-opponent');
  const barSelf          = document.getElementById('bar-self');
  const opponentTimerEl  = document.getElementById('opponent-timer');
  const selfTimerEl      = document.getElementById('self-timer');
  const disconnectBanner = document.getElementById('disconnect-banner');

  let cellW, cellH, padX, padY, stoneR, boardW, boardH;

  // ==================== 尺寸 ====================
  function resize() {
    const maxW = Math.min(window.innerWidth - 16, 440);
    const maxH = window.innerHeight - (state.onlineMode ? 260 : 200);
    const ratioWH = 9 / 10;
    let w = maxW;
    let h = w / ratioWH * 1.08;
    if (h > maxH) { h = maxH; w = h * ratioWH / 1.08; }

    boardW = Math.floor(w);
    boardH = Math.floor(h);
    canvas.width  = boardW;
    canvas.height = boardH;

    padX   = boardW * 0.06;
    padY   = boardH * 0.04;
    cellW  = (boardW - padX * 2) / (COLS - 1);
    cellH  = (boardH - padY * 2) / (ROWS - 1);
    stoneR = Math.min(cellW, cellH) * 0.44;

    draw();
  }

  function gx(col) { return padX + col * cellW; }
  function gy(row) { return padY + row * cellH; }

  // ==================== 绘制 ====================
  function draw() {
    drawBoard();
    drawPieces();
    drawSelection();
    drawValidMoves();
  }

  function drawBoard() {
    ctx.fillStyle = BOARD_COLOR;
    ctx.beginPath();
    ctx.roundRect(0, 0, boardW, boardH, 8);
    ctx.fill();

    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;

    for (let c = 0; c < COLS; c++) {
      if (c === 0 || c === COLS - 1) {
        ctx.beginPath();
        ctx.moveTo(gx(c), gy(0));
        ctx.lineTo(gx(c), gy(ROWS - 1));
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(gx(c), gy(0));
        ctx.lineTo(gx(c), gy(4));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx(c), gy(5));
        ctx.lineTo(gx(c), gy(ROWS - 1));
        ctx.stroke();
      }
    }

    for (let r = 0; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(gx(0), gy(r));
      ctx.lineTo(gx(COLS - 1), gy(r));
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(gx(3), gy(0)); ctx.lineTo(gx(5), gy(2));
    ctx.moveTo(gx(5), gy(0)); ctx.lineTo(gx(3), gy(2));
    ctx.moveTo(gx(3), gy(7)); ctx.lineTo(gx(5), gy(9));
    ctx.moveTo(gx(5), gy(7)); ctx.lineTo(gx(3), gy(9));
    ctx.stroke();

    ctx.save();
    ctx.font = `${cellH * 0.45}px STKaiti, KaiTi, serif`;
    ctx.fillStyle = LINE_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = (gy(4) + gy(5)) / 2;
    ctx.fillText('楚 河', gx(2), riverY);
    ctx.fillText('汉 界', gx(6), riverY);
    ctx.restore();

    const markPositions = [
      [2,1],[2,7],[3,0],[3,2],[3,4],[3,6],[3,8],
      [6,0],[6,2],[6,4],[6,6],[6,8],[7,1],[7,7],
    ];
    for (const [r, c] of markPositions) drawCrossMark(gx(c), gy(r), c, r);
  }

  function drawCrossMark(x, y, col, row) {
    const s = cellW * 0.12;
    const g = cellW * 0.06;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    const dirs = [];
    if (col > 0)        { dirs.push([-1, -1]); dirs.push([-1, 1]); }
    if (col < COLS - 1) { dirs.push([1, -1]);  dirs.push([1, 1]);  }
    for (const [dx, dy] of dirs) {
      ctx.beginPath();
      ctx.moveTo(x + dx * g, y + dy * (g + s));
      ctx.lineTo(x + dx * g, y + dy * g);
      ctx.lineTo(x + dx * (g + s), y + dy * g);
      ctx.stroke();
    }
  }

  function drawPieces() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = state.board[r][c];
        if (p !== ' ') drawPiece(r, c, p);
      }
    }
  }

  function drawPiece(row, col, piece) {
    const x = gx(col);
    const y = gy(row);
    const r = stoneR;
    const red = isRed(piece);

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r);
    grad.addColorStop(0, '#fdf0d0');
    grad.addColorStop(1, '#c8a860');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
    ctx.strokeStyle = red ? '#c03030' : '#333';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = red ? '#c03030' : '#333';
    ctx.font = `bold ${r * 1.1}px STKaiti, KaiTi, "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PIECES[piece], x, y + 1);
  }

  function drawSelection() {
    if (!state.selected) return;
    const { row, col } = state.selected;
    ctx.save();
    ctx.strokeStyle = '#ff6644';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(gx(col), gy(row), stoneR + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawValidMoves() {
    for (const { row, col } of state.validMoves) {
      const hasTarget = state.board[row][col] !== ' ';
      ctx.save();
      ctx.globalAlpha = 0.5;
      if (hasTarget) {
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(gx(col), gy(row), stoneR + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#44bb44';
        ctx.beginPath();
        ctx.arc(gx(col), gy(row), cellW * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ==================== 走法生成（完整保留） ====================
  function getMoves(row, col) {
    const p = state.board[row][col];
    if (p === ' ') return [];
    const type = p.toUpperCase();
    const red  = isRed(p);
    let moves = [];
    switch (type) {
      case 'K': moves = kingMoves(row, col, red);    break;
      case 'A': moves = advisorMoves(row, col, red); break;
      case 'B': moves = bishopMoves(row, col, red);  break;
      case 'N': moves = knightMoves(row, col, red);  break;
      case 'R': moves = rookMoves(row, col);          break;
      case 'C': moves = cannonMoves(row, col);        break;
      case 'P': moves = pawnMoves(row, col, red);    break;
    }
    return moves.filter(m => {
      const target = state.board[m.row][m.col];
      if (target !== ' ' && sameColor(p, target)) return false;
      return !wouldBeInCheck(row, col, m.row, m.col, red ? 'red' : 'black');
    });
  }

  function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  function kingMoves(row, col, red) {
    const moves = [];
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const r = row + dr, c = col + dc;
      if (inBoard(r, c) && inPalace(r, c, red)) moves.push({ row: r, col: c });
    }
    const oppKing = red ? 'k' : 'K';
    const dir = red ? -1 : 1;
    let r = row + dir;
    while (inBoard(r, col)) {
      if (state.board[r][col] !== ' ') {
        if (state.board[r][col] === oppKing) moves.push({ row: r, col });
        break;
      }
      r += dir;
    }
    return moves;
  }

  function inPalace(r, c, red) {
    if (c < 3 || c > 5) return false;
    return red ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
  }

  function advisorMoves(row, col, red) {
    const moves = [];
    for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const r = row + dr, c = col + dc;
      if (inBoard(r, c) && inPalace(r, c, red)) moves.push({ row: r, col: c });
    }
    return moves;
  }

  function bishopMoves(row, col, red) {
    const moves = [];
    for (const [dr, dc] of [[2,2],[2,-2],[-2,2],[-2,-2]]) {
      const r = row + dr, c = col + dc;
      if (!inBoard(r, c)) continue;
      if (red && r < 5) continue;
      if (!red && r > 4) continue;
      if (state.board[row + dr/2][col + dc/2] !== ' ') continue;
      moves.push({ row: r, col: c });
    }
    return moves;
  }

  function knightMoves(row, col) {
    const moves = [];
    const jumps = [
      [-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],
      [-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1],
    ];
    for (const [dr, dc, br, bc] of jumps) {
      const r = row + dr, c = col + dc;
      if (!inBoard(r, c)) continue;
      if (state.board[row + br][col + bc] !== ' ') continue;
      moves.push({ row: r, col: c });
    }
    return moves;
  }

  function rookMoves(row, col) {
    const moves = [];
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      let r = row + dr, c = col + dc;
      while (inBoard(r, c)) {
        moves.push({ row: r, col: c });
        if (state.board[r][c] !== ' ') break;
        r += dr; c += dc;
      }
    }
    return moves;
  }

  function cannonMoves(row, col) {
    const moves = [];
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      let r = row + dr, c = col + dc;
      let jumped = false;
      while (inBoard(r, c)) {
        if (state.board[r][c] !== ' ') {
          if (!jumped) { jumped = true; }
          else { moves.push({ row: r, col: c }); break; }
        } else if (!jumped) {
          moves.push({ row: r, col: c });
        }
        r += dr; c += dc;
      }
    }
    return moves;
  }

  function pawnMoves(row, col, red) {
    const moves = [];
    const forward = red ? -1 : 1;
    if (inBoard(row + forward, col)) moves.push({ row: row + forward, col });
    const crossed = red ? (row <= 4) : (row >= 5);
    if (crossed) {
      if (inBoard(row, col - 1)) moves.push({ row, col: col - 1 });
      if (inBoard(row, col + 1)) moves.push({ row, col: col + 1 });
    }
    return moves;
  }

  function findKing(color) {
    const king = color === 'red' ? 'K' : 'k';
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (state.board[r][c] === king) return { row: r, col: c };
    return null;
  }

  function isInCheck(color) {
    const king = findKing(color);
    if (!king) return true;
    const oppColor = color === 'red' ? 'black' : 'red';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = state.board[r][c];
        if (p === ' ') continue;
        if ((oppColor === 'red'   && !isRed(p))   ||
            (oppColor === 'black' && !isBlack(p))) continue;
        if (getRawAttacks(r, c, p).some(m => m.row === king.row && m.col === king.col)) return true;
      }
    }
    return false;
  }

  function getRawAttacks(row, col, piece) {
    const type = piece.toUpperCase();
    const red  = isRed(piece);
    switch (type) {
      case 'K': return kingRawMoves(row, col, red);
      case 'A': return advisorMoves(row, col, red);
      case 'B': return bishopMoves(row, col, red);
      case 'N': return knightMoves(row, col);
      case 'R': return rookMoves(row, col);
      case 'C': return cannonMoves(row, col);
      case 'P': return pawnMoves(row, col, red);
      default:  return [];
    }
  }

  function kingRawMoves(row, col, red) {
    const moves = [];
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const r = row + dr, c = col + dc;
      if (inBoard(r, c) && inPalace(r, c, red)) moves.push({ row: r, col: c });
    }
    const dir = red ? -1 : 1;
    let r = row + dir;
    while (inBoard(r, col)) {
      if (state.board[r][col] !== ' ') {
        if (state.board[r][col].toUpperCase() === 'K') moves.push({ row: r, col });
        break;
      }
      r += dir;
    }
    return moves;
  }

  function wouldBeInCheck(fromR, fromC, toR, toC, color) {
    const captured = state.board[toR][toC];
    const piece    = state.board[fromR][fromC];
    state.board[toR][toC]   = piece;
    state.board[fromR][fromC] = ' ';
    const check = isInCheck(color);
    state.board[fromR][fromC] = piece;
    state.board[toR][toC]    = captured;
    return check;
  }

  function hasAnyMove(color) {
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const p = state.board[r][c];
        if (p === ' ') continue;
        if (color === 'red'   && !isRed(p))   continue;
        if (color === 'black' && !isBlack(p)) continue;
        if (getMoves(r, c).length > 0) return true;
      }
    return false;
  }

  // ==================== 游戏逻辑 ====================
  function initBoard() {
    state.board     = INIT_BOARD.map(row => [...row]);
    state.current   = 'red';
    state.selected  = null;
    state.validMoves = [];
    state.history   = [];
    state.gameOver  = false;
    updateIndicator();
  }

  // 单机点击处理
  function handleClick(row, col) {
    if (state.gameOver) return;

    if (state.onlineMode) {
      handleOnlineClick(row, col);
      return;
    }

    const clickedPiece = state.board[row][col];

    if (state.selected) {
      // 切换选中自己的子
      if (clickedPiece !== ' ' && (
        (state.current === 'red'   && isRed(clickedPiece)) ||
        (state.current === 'black' && isBlack(clickedPiece))
      )) {
        state.selected  = { row, col };
        state.validMoves = getMoves(row, col);
        draw();
        return;
      }

      const isValid = state.validMoves.some(m => m.row === row && m.col === col);
      if (isValid) { movePiece(state.selected.row, state.selected.col, row, col); return; }

      state.selected  = null;
      state.validMoves = [];
      draw();
      return;
    }

    if (clickedPiece === ' ') return;
    if (state.current === 'red'   && !isRed(clickedPiece))   return;
    if (state.current === 'black' && !isBlack(clickedPiece)) return;

    state.selected  = { row, col };
    state.validMoves = getMoves(row, col);
    draw();
  }

  function movePiece(fromR, fromC, toR, toC) {
    const piece    = state.board[fromR][fromC];
    const captured = state.board[toR][toC];

    state.history.push({ from: { row: fromR, col: fromC }, to: { row: toR, col: toC }, captured, piece });
    state.board[toR][toC]   = piece;
    state.board[fromR][fromC] = ' ';
    state.selected  = null;
    state.validMoves = [];

    if (captured === 'K' || captured === 'k') {
      state.gameOver = true;
      draw();
      const winner = captured === 'K' ? '黑方' : '红方';
      setTimeout(() => showResult(winner), 300);
      return;
    }

    state.current = state.current === 'red' ? 'black' : 'red';
    updateIndicator();
    draw();

    if (!hasAnyMove(state.current)) {
      state.gameOver = true;
      const winner = state.current === 'red' ? '黑方' : '红方';
      const reason = isInCheck(state.current) ? '将杀' : '困毙';
      setTimeout(() => showResult(winner, reason), 300);
    }
  }

  function undo() {
    if (state.gameOver || state.history.length === 0) return;
    const last = state.history.pop();
    state.board[last.from.row][last.from.col] = last.piece;
    state.board[last.to.row][last.to.col]     = last.captured;
    state.current   = pieceColor(last.piece) === 'red' ? 'red' : 'black';
    state.selected  = null;
    state.validMoves = [];
    updateIndicator();
    draw();
  }

  function restart() {
    modal.classList.remove('show');
    if (state.onlineMode) { location.href = '/chinese-chess/hall.html'; return; }
    initBoard();
    draw();
  }

  // ==================== UI 更新 ====================
  function updateIndicator() {
    if (state.onlineMode) {
      barSelf.classList.toggle('active',     state.current === state.myColor);
      barOpponent.classList.toggle('active', state.current !== state.myColor);
    } else {
      indRed.classList.toggle('active',   state.current === 'red');
      indBlack.classList.toggle('active', state.current === 'black');
    }
  }

  function showResult(winner, reason, extra = {}) {
    stopTimer();

    if (state.onlineMode) {
      const ratingDelta = extra.ratingDelta;
      const iWin = (winner === 'red' && state.myColor === 'red') ||
                   (winner === 'black' && state.myColor === 'black');

      if (winner === '平局' || winner === 0) {
        modalTitle.textContent   = '平局';
        modalSubtitle.textContent = '势均力敌';
      } else if (iWin) {
        modalTitle.textContent   = '你赢了！';
        modalSubtitle.textContent = (reason || '') || '精彩对局';
      } else {
        modalTitle.textContent   = '你输了';
        modalSubtitle.textContent = (reason || '') || '再接再厉';
      }

      if (ratingDelta !== undefined) {
        const sign = ratingDelta > 0 ? '+' : '';
        modalDelta.textContent = `积分 ${sign}${ratingDelta}`;
        modalDelta.className   = 'modal-delta ' + (ratingDelta >= 0 ? 'positive' : 'negative');
        modalDelta.classList.remove('hidden');
      }
    } else {
      modalTitle.textContent   = `${winner}获胜!`;
      modalSubtitle.textContent = reason ? `${reason}，精彩对局` : '精彩对局';
    }

    modal.classList.add('show');
  }

  // ==================== 在线模式 ====================
  // 应用服务器下发的棋步
  function applyMove(from, to, piece, captured) {
    state.history.push({ from, to, captured: captured || ' ', piece });
    state.board[to.row][to.col]     = piece;
    state.board[from.row][from.col]  = ' ';
    state.selected  = null;
    state.validMoves = [];

    // 检查胜负（简化：检查将/帅是否被吃）
    if (captured === 'K' || captured === 'k') {
      state.gameOver = true;
    }

    state.current = state.current === 'red' ? 'black' : 'red';
    updateIndicator();
    draw();
    resetTimer();
  }

  function initOnlineGame(roomId) {
    offlineHeader.style.display   = 'none';
    offlineControls.style.display = 'none';
    onlineHeader.style.display    = 'block';
    onlineFooter.style.display    = 'block';
    onlineControls.style.display  = 'flex';

    const user = window.Auth && Auth.isLoggedIn() ? Auth.getUser() : null;
    if (user) document.getElementById('self-name').textContent = user.nickname || '我';

    WS.connect();
    registerOnlineHandlers(roomId);

    WS.on('auth_ok', () => { WS.send('ready', {}, roomId); });
    if (WS.isConnected) { WS.send('ready', {}, roomId); }
  }

  function registerOnlineHandlers(roomId) {
    WS.on('game_start', (payload) => {
      if (!payload) return;
      // myColor: 服务器下发 'red'/'black' 字符串，直接使用
      state.myColor = payload.myColor || 'red';

      state.opponentInfo = payload.opponent || {};
      state.selfInfo     = payload.self     || {};

      // boardState 是直接的二维数组，firstTurn 是 'red'/'black' 字符串
      if (payload.boardState && Array.isArray(payload.boardState)) {
        state.board   = payload.boardState;
        state.current = payload.firstTurn || 'red';
      } else {
        state.current = payload.firstTurn || 'red';
      }

      updateOnlinePlayerBars();
      updateIndicator();
      draw();
      startTimer();
    });

    // 服务器确认走棋
    // 服务器广播格式: { moveData: {from, to}, boardState, nextTurn, timeLeft }
    WS.on('move_applied', (payload) => {
      if (!payload) return;
      const move = payload.moveData || {};
      // 如果服务器下发了最新棋盘状态，直接同步
      if (payload.boardState && Array.isArray(payload.boardState)) {
        state.board = payload.boardState;
      }
      applyMove(move.from, move.to, move.piece, move.captured);
    });

    // 对方走棋（兼容另一种消息名）
    WS.on('opponent_move', (payload) => {
      if (!payload) return;
      const move = payload.moveData || payload;
      applyMove(move.from, move.to, move.piece, move.captured);
    });

    // game_over: winner 是 'red'/'black' 字符串或 null（平局）
    WS.on('game_over', (payload) => {
      if (!payload) return;
      state.gameOver = true;
      // showResult 期望 winner 为 'red'/'black' 字符串用于 iWin 判断，或 '平局'/0 表示平局
      const winner = payload.winner || null;
      showResult(winner, payload.reason, { ratingDelta: payload.ratingDelta });
    });

    WS.on('opponent_disconnected', (payload) => {
      const seconds = (payload && payload.waitSeconds) || 60;
      disconnectBanner.classList.add('show');
      const countEl = document.getElementById('disconnect-countdown');
      let remaining = seconds;
      const interval = setInterval(() => {
        remaining--;
        if (countEl) countEl.textContent = `(${remaining}s)`;
        if (remaining <= 0) clearInterval(interval);
      }, 1000);
    });

    WS.on('opponent_reconnected', () => {
      disconnectBanner.classList.remove('show');
    });

    WS.on('timeout_warning', (payload) => {
      const seconds = (payload && payload.secondsLeft) || 10;
      if (state.current === state.myColor) setTimerDisplay(selfTimerEl, seconds);
      else setTimerDisplay(opponentTimerEl, seconds);
    });

    WS.on('timeout', (payload) => {
      state.gameOver = true;
      const loser  = payload && payload.loser; // 'red' | 'black'
      const winner = loser === 'red' ? '黑方' : '红方';
      showResult(winner, '超时判负', { ratingDelta: payload && payload.ratingDelta });
    });

    WS.on('draw_offered', () => {
      document.getElementById('draw-offer-modal').classList.add('show');
    });

    // draw_accepted 不需要监听，和棋通过 game_over(reason='draw') 通知
    WS.on('draw_rejected', () => {
      if (window.UI) UI.toast('对手拒绝了和棋', 'info');
    });
  }

  function updateOnlinePlayerBars() {
    const opp  = state.opponentInfo || {};
    const self = state.selfInfo     || {};
    const user = window.Auth && Auth.getUser();

    document.getElementById('opponent-name').textContent   = opp.nickname || '对手';
    document.getElementById('opponent-rating').textContent = opp.rating ? (opp.rating + ' 分') : '';
    document.getElementById('self-name').textContent       = self.nickname || (user && user.nickname) || '我';
    document.getElementById('self-rating').textContent     = self.rating ? (self.rating + ' 分') : '';

    // 颜色标签
    const myColorLabel  = state.myColor === 'red' ? '红方' : '黑方';
    const oppColorLabel = state.myColor === 'red' ? '黑方' : '红方';
    const myColorCls  = state.myColor === 'red' ? 'red' : 'black';
    const oppColorCls = state.myColor === 'red' ? 'black' : 'red';

    document.getElementById('self-color-tag').textContent  = myColorLabel;
    document.getElementById('self-color-tag').className    = 'color-tag ' + myColorCls;
    document.getElementById('opponent-color-tag').textContent = oppColorLabel;
    document.getElementById('opponent-color-tag').className   = 'color-tag ' + oppColorCls;
  }

  // ==================== 在线点击处理 ====================
  function handleOnlineClick(row, col) {
    if (!state.isMyTurn) return;

    const clickedPiece = state.board[row][col];
    const myIsRed      = state.myColor === 'red';

    if (state.selected) {
      // 切换选中
      if (clickedPiece !== ' ' && (
        (myIsRed   && isRed(clickedPiece))  ||
        (!myIsRed  && isBlack(clickedPiece))
      )) {
        state.selected   = { row, col };
        state.validMoves  = getMoves(row, col);
        draw();
        return;
      }

      const isValid = state.validMoves.some(m => m.row === row && m.col === col);
      if (isValid) {
        const from     = state.selected;
        const piece    = state.board[from.row][from.col];
        const captured = state.board[row][col];

        // 发送走棋，乐观渲染
        WS.send('move', {
          roomId: state.roomId,
          moveData: { from, to: { row, col }, piece, captured },
        });

        // 乐观更新
        state.board[row][col]       = piece;
        state.board[from.row][from.col] = ' ';
        state.history.push({ from, to: { row, col }, captured, piece });
        state.selected  = null;
        state.validMoves = [];
        state.current   = state.current === 'red' ? 'black' : 'red';
        updateIndicator();
        draw();
        return;
      }

      state.selected  = null;
      state.validMoves = [];
      draw();
      return;
    }

    // 选中自己的子
    if (clickedPiece === ' ') return;
    if (myIsRed  && !isRed(clickedPiece))   return;
    if (!myIsRed && !isBlack(clickedPiece)) return;

    state.selected  = { row, col };
    state.validMoves = getMoves(row, col);
    draw();
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
        setTimerDisplay(opponentTimerEl, state.oppSeconds);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  }

  function resetTimer() {
    state.selfSeconds = TURN_TIME_LIMIT;
    state.oppSeconds  = TURN_TIME_LIMIT;
    updateTimerDisplays();
  }

  function updateTimerDisplays() {
    setTimerDisplay(selfTimerEl,     state.selfSeconds);
    setTimerDisplay(opponentTimerEl, state.oppSeconds);
  }

  function setTimerDisplay(el, seconds) {
    if (!el) return;
    el.textContent = seconds;
    el.classList.remove('warning', 'danger');
    if (seconds <= 10) el.classList.add('danger');
    else if (seconds <= 20) el.classList.add('warning');
  }

  // ==================== 点击事件 ====================
  function getGridPos(clientX, clientY) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = boardW / rect.width;
    const scaleY = boardH / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top)  * scaleY;
    const col = Math.round((x - padX) / cellW);
    const row = Math.round((y - padY) / cellH);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    const dx = x - gx(col);
    const dy = y - gy(row);
    if (Math.sqrt(dx * dx + dy * dy) > stoneR * 1.3) return null;
    return { row, col };
  }

  canvas.addEventListener('click', (e) => {
    const pos = getGridPos(e.clientX, e.clientY);
    if (pos) handleClick(pos.row, pos.col);
  });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      const pos = getGridPos(t.clientX, t.clientY);
      if (pos) handleClick(pos.row, pos.col);
    }
  });

  // ==================== 按钮绑定 ====================
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-restart').addEventListener('click', restart);
  document.getElementById('btn-modal-restart').addEventListener('click', restart);

  btnMode.addEventListener('click', () => {
    // 象棋暂无 AI，仅切换模式提示
    if (window.UI) UI.toast('象棋 AI 模式敬请期待', 'info');
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
  }

  resize();
})();
