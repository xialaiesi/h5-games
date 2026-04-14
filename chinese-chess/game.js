(() => {
  'use strict';

  // ==================== 常量 ====================
  const COLS = 9;
  const ROWS = 10;
  const BOARD_COLOR = '#d4a04a';
  const LINE_COLOR = '#6b4c14';

  // 棋子类型
  const PIECES = {
    K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
    k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒',
  };

  // 红方大写，黑方小写
  function isRed(p) { return p >= 'A' && p <= 'Z'; }
  function isBlack(p) { return p >= 'a' && p <= 'z'; }
  function sameColor(a, b) {
    if (!a || !b) return false;
    return (isRed(a) && isRed(b)) || (isBlack(a) && isBlack(b));
  }
  function pieceColor(p) { return isRed(p) ? 'red' : 'black'; }

  // ==================== 初始棋盘 ====================
  // board[row][col], row 0=顶(黑方), row 9=底(红方)
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
    board: [],
    current: 'red',
    selected: null,    // {row, col}
    validMoves: [],    // [{row, col}]
    history: [],       // [{from, to, captured, piece}]
    gameOver: false,
  };

  // ==================== DOM ====================
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const indRed = document.getElementById('ind-red');
  const indBlack = document.getElementById('ind-black');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');

  let cellW, cellH, padX, padY, stoneR, boardW, boardH;

  // ==================== 尺寸 ====================
  function resize() {
    const maxW = Math.min(window.innerWidth - 16, 440);
    const maxH = window.innerHeight - 200;
    // 棋盘比例 9:10 (列:行)，加上边距
    const ratioWH = 9 / 10;
    let w = maxW;
    let h = w / ratioWH * 1.08;
    if (h > maxH) {
      h = maxH;
      w = h * ratioWH / 1.08;
    }

    boardW = Math.floor(w);
    boardH = Math.floor(h);
    canvas.width = boardW;
    canvas.height = boardH;

    padX = boardW * 0.06;
    padY = boardH * 0.04;
    cellW = (boardW - padX * 2) / (COLS - 1);
    cellH = (boardH - padY * 2) / (ROWS - 1);
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

    // 竖线
    for (let c = 0; c < COLS; c++) {
      if (c === 0 || c === COLS - 1) {
        // 边线贯穿
        ctx.beginPath();
        ctx.moveTo(gx(c), gy(0));
        ctx.lineTo(gx(c), gy(ROWS - 1));
        ctx.stroke();
      } else {
        // 中间竖线在河界断开
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

    // 横线
    for (let r = 0; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(gx(0), gy(r));
      ctx.lineTo(gx(COLS - 1), gy(r));
      ctx.stroke();
    }

    // 九宫斜线
    ctx.beginPath();
    ctx.moveTo(gx(3), gy(0)); ctx.lineTo(gx(5), gy(2));
    ctx.moveTo(gx(5), gy(0)); ctx.lineTo(gx(3), gy(2));
    ctx.moveTo(gx(3), gy(7)); ctx.lineTo(gx(5), gy(9));
    ctx.moveTo(gx(5), gy(7)); ctx.lineTo(gx(3), gy(9));
    ctx.stroke();

    // 楚河汉界
    ctx.save();
    ctx.font = `${cellH * 0.45}px STKaiti, KaiTi, serif`;
    ctx.fillStyle = LINE_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const riverY = (gy(4) + gy(5)) / 2;
    ctx.fillText('楚 河', gx(2), riverY);
    ctx.fillText('汉 界', gx(6), riverY);
    ctx.restore();

    // 兵/炮位标记
    const markPositions = [
      [2,1],[2,7], // 炮
      [3,0],[3,2],[3,4],[3,6],[3,8], // 卒
      [6,0],[6,2],[6,4],[6,6],[6,8], // 兵
      [7,1],[7,7], // 炮
    ];
    for (const [r, c] of markPositions) {
      drawCrossMark(gx(c), gy(r), c, r);
    }
  }

  function drawCrossMark(x, y, col, row) {
    const s = cellW * 0.12;
    const g = cellW * 0.06;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;

    // 四个角，边界处只画内侧
    const dirs = [];
    if (col > 0) { dirs.push([-1, -1]); dirs.push([-1, 1]); }
    if (col < COLS - 1) { dirs.push([1, -1]); dirs.push([1, 1]); }

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

    // 阴影
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 棋子底色
    const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r);
    grad.addColorStop(0, '#fdf0d0');
    grad.addColorStop(1, '#c8a860');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 外环
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 内环
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
    ctx.strokeStyle = red ? '#c03030' : '#333';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 文字
    ctx.fillStyle = red ? '#c03030' : '#333';
    ctx.font = `bold ${r * 1.1}px STKaiti, KaiTi, "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PIECES[piece], x, y + 1);
  }

  function drawSelection() {
    if (!state.selected) return;
    const { row, col } = state.selected;
    const x = gx(col);
    const y = gy(row);

    ctx.save();
    ctx.strokeStyle = '#ff6644';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, stoneR + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawValidMoves() {
    for (const { row, col } of state.validMoves) {
      const x = gx(col);
      const y = gy(row);
      const hasTarget = state.board[row][col] !== ' ';

      ctx.save();
      ctx.globalAlpha = 0.5;
      if (hasTarget) {
        // 可吃子：画红色圆环
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, stoneR + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 可走：画小绿点
        ctx.fillStyle = '#44bb44';
        ctx.beginPath();
        ctx.arc(x, y, cellW * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ==================== 走法生成 ====================
  function getMoves(row, col) {
    const p = state.board[row][col];
    if (p === ' ') return [];
    const type = p.toUpperCase();
    const red = isRed(p);
    let moves = [];

    switch (type) {
      case 'K': moves = kingMoves(row, col, red); break;
      case 'A': moves = advisorMoves(row, col, red); break;
      case 'B': moves = bishopMoves(row, col, red); break;
      case 'N': moves = knightMoves(row, col, red); break;
      case 'R': moves = rookMoves(row, col, red); break;
      case 'C': moves = cannonMoves(row, col, red); break;
      case 'P': moves = pawnMoves(row, col, red); break;
    }

    // 过滤：不能吃自己的子，走完后不能被将军
    return moves.filter(m => {
      const target = state.board[m.row][m.col];
      if (target !== ' ' && sameColor(p, target)) return false;
      // 模拟走棋，检查是否被将
      return !wouldBeInCheck(row, col, m.row, m.col, red ? 'red' : 'black');
    });
  }

  function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

  function kingMoves(row, col, red) {
    const moves = [];
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of dirs) {
      const r = row + dr, c = col + dc;
      if (!inBoard(r, c)) continue;
      if (!inPalace(r, c, red)) continue;
      moves.push({ row: r, col: c });
    }
    // 对面将帅：飞将
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
    const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr, dc] of dirs) {
      const r = row + dr, c = col + dc;
      if (!inBoard(r, c)) continue;
      if (!inPalace(r, c, red)) continue;
      moves.push({ row: r, col: c });
    }
    return moves;
  }

  function bishopMoves(row, col, red) {
    const moves = [];
    const dirs = [[2,2],[2,-2],[-2,2],[-2,-2]];
    for (const [dr, dc] of dirs) {
      const r = row + dr, c = col + dc;
      if (!inBoard(r, c)) continue;
      // 不能过河
      if (red && r < 5) continue;
      if (!red && r > 4) continue;
      // 田字中心不能有子（蹩脚）
      const mr = row + dr / 2, mc = col + dc / 2;
      if (state.board[mr][mc] !== ' ') continue;
      moves.push({ row: r, col: c });
    }
    return moves;
  }

  function knightMoves(row, col, red) {
    const moves = [];
    const jumps = [
      [-2,-1,-1,0], [-2,1,-1,0],
      [2,-1,1,0],   [2,1,1,0],
      [-1,-2,0,-1],  [1,-2,0,-1],
      [-1,2,0,1],    [1,2,0,1],
    ];
    for (const [dr, dc, br, bc] of jumps) {
      const r = row + dr, c = col + dc;
      if (!inBoard(r, c)) continue;
      // 蹩马腿
      if (state.board[row + br][col + bc] !== ' ') continue;
      moves.push({ row: r, col: c });
    }
    return moves;
  }

  function rookMoves(row, col) {
    const moves = [];
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of dirs) {
      let r = row + dr, c = col + dc;
      while (inBoard(r, c)) {
        if (state.board[r][c] !== ' ') {
          moves.push({ row: r, col: c }); // 可以吃
          break;
        }
        moves.push({ row: r, col: c });
        r += dr; c += dc;
      }
    }
    return moves;
  }

  function cannonMoves(row, col) {
    const moves = [];
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of dirs) {
      let r = row + dr, c = col + dc;
      let jumped = false;
      while (inBoard(r, c)) {
        if (state.board[r][c] !== ' ') {
          if (!jumped) {
            jumped = true; // 炮架
          } else {
            moves.push({ row: r, col: c }); // 翻打
            break;
          }
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
    // 前进
    const r = row + forward;
    if (inBoard(r, col)) moves.push({ row: r, col });
    // 过河后可以横走
    const crossed = red ? (row <= 4) : (row >= 5);
    if (crossed) {
      if (inBoard(row, col - 1)) moves.push({ row, col: col - 1 });
      if (inBoard(row, col + 1)) moves.push({ row, col: col + 1 });
    }
    return moves;
  }

  // ==================== 将军检测 ====================
  function findKing(color) {
    const king = color === 'red' ? 'K' : 'k';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.board[r][c] === king) return { row: r, col: c };
      }
    }
    return null;
  }

  function isInCheck(color) {
    const king = findKing(color);
    if (!king) return true;
    const oppColor = color === 'red' ? 'black' : 'red';
    // 检查所有对方棋子是否能攻击到将/帅
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = state.board[r][c];
        if (p === ' ') continue;
        if ((oppColor === 'red' && !isRed(p)) || (oppColor === 'black' && !isBlack(p))) continue;
        const raw = getRawAttacks(r, c, p);
        if (raw.some(m => m.row === king.row && m.col === king.col)) return true;
      }
    }
    return false;
  }

  // 原始攻击范围（不检查将军，避免递归）
  function getRawAttacks(row, col, piece) {
    const type = piece.toUpperCase();
    const red = isRed(piece);
    switch (type) {
      case 'K': return kingRawMoves(row, col, red);
      case 'A': return advisorMoves(row, col, red);
      case 'B': return bishopMoves(row, col, red);
      case 'N': return knightMoves(row, col, red);
      case 'R': return rookMoves(row, col);
      case 'C': return cannonMoves(row, col);
      case 'P': return pawnMoves(row, col, red);
      default: return [];
    }
  }

  function kingRawMoves(row, col, red) {
    const moves = [];
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of dirs) {
      const r = row + dr, c = col + dc;
      if (inBoard(r, c) && inPalace(r, c, red)) moves.push({ row: r, col: c });
    }
    // 飞将
    const dir = red ? -1 : 1;
    let r = row + dir;
    while (inBoard(r, col)) {
      if (state.board[r][col] !== ' ') {
        const t = state.board[r][col];
        if (t.toUpperCase() === 'K') moves.push({ row: r, col });
        break;
      }
      r += dir;
    }
    return moves;
  }

  function wouldBeInCheck(fromR, fromC, toR, toC, color) {
    const captured = state.board[toR][toC];
    const piece = state.board[fromR][fromC];
    state.board[toR][toC] = piece;
    state.board[fromR][fromC] = ' ';
    const check = isInCheck(color);
    state.board[fromR][fromC] = piece;
    state.board[toR][toC] = captured;
    return check;
  }

  function hasAnyMove(color) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = state.board[r][c];
        if (p === ' ') continue;
        if (color === 'red' && !isRed(p)) continue;
        if (color === 'black' && !isBlack(p)) continue;
        if (getMoves(r, c).length > 0) return true;
      }
    }
    return false;
  }

  // ==================== 游戏逻辑 ====================
  function initBoard() {
    state.board = INIT_BOARD.map(row => [...row]);
    state.current = 'red';
    state.selected = null;
    state.validMoves = [];
    state.history = [];
    state.gameOver = false;
    updateIndicator();
  }

  function handleClick(row, col) {
    if (state.gameOver) return;

    const clickedPiece = state.board[row][col];

    // 如果已选中棋子
    if (state.selected) {
      // 点击自己的其他子：切换选中
      if (clickedPiece !== ' ' && (
        (state.current === 'red' && isRed(clickedPiece)) ||
        (state.current === 'black' && isBlack(clickedPiece))
      )) {
        state.selected = { row, col };
        state.validMoves = getMoves(row, col);
        draw();
        return;
      }

      // 检查是否是合法走法
      const isValid = state.validMoves.some(m => m.row === row && m.col === col);
      if (isValid) {
        movePiece(state.selected.row, state.selected.col, row, col);
        return;
      }

      // 无效点击：取消选择
      state.selected = null;
      state.validMoves = [];
      draw();
      return;
    }

    // 未选中：选择己方棋子
    if (clickedPiece === ' ') return;
    if (state.current === 'red' && !isRed(clickedPiece)) return;
    if (state.current === 'black' && !isBlack(clickedPiece)) return;

    state.selected = { row, col };
    state.validMoves = getMoves(row, col);
    draw();
  }

  function movePiece(fromR, fromC, toR, toC) {
    const piece = state.board[fromR][fromC];
    const captured = state.board[toR][toC];

    state.history.push({ from: { row: fromR, col: fromC }, to: { row: toR, col: toC }, captured, piece });

    state.board[toR][toC] = piece;
    state.board[fromR][fromC] = ' ';
    state.selected = null;
    state.validMoves = [];

    // 检查是否吃掉将/帅
    if (captured === 'K' || captured === 'k') {
      state.gameOver = true;
      draw();
      const winner = captured === 'K' ? '黑方' : '红方';
      setTimeout(() => showResult(winner), 300);
      return;
    }

    // 切换回合
    state.current = state.current === 'red' ? 'black' : 'red';
    updateIndicator();
    draw();

    // 检查对方是否无路可走（被将死/困毙）
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
    state.board[last.to.row][last.to.col] = last.captured;
    state.current = pieceColor(last.piece) === 'red' ? 'red' : 'black';
    state.selected = null;
    state.validMoves = [];
    updateIndicator();
    draw();
  }

  // ==================== UI ====================
  function updateIndicator() {
    indRed.classList.toggle('active', state.current === 'red');
    indBlack.classList.toggle('active', state.current === 'black');
  }

  function showResult(winner, reason) {
    modalTitle.textContent = `${winner}获胜!`;
    modalSubtitle.textContent = reason ? `${reason}，精彩对局` : '精彩对局';
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
    const scaleX = boardW / rect.width;
    const scaleY = boardH / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const col = Math.round((x - padX) / cellW);
    const row = Math.round((y - padY) / cellH);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    // 检查点击距离是否足够近
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

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-restart').addEventListener('click', restart);
  document.getElementById('btn-modal-restart').addEventListener('click', restart);

  window.addEventListener('resize', resize);

  // ==================== 启动 ====================
  initBoard();
  resize();
})();
