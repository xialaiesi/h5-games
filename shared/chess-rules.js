'use strict';

// ==================== 中国象棋规则模块 ====================
// 纯函数，无副作用，前后端通用（UMD）
// 棋盘：10行9列二维数组
//   row 0 = 顶部（黑方底线），row 9 = 底部（红方底线）
//   大写字母 = 红方，小写字母 = 黑方，' '（空格）= 空位
// 棋子对照：
//   K/k=将帅  A/a=仕士  B/b=相象  N/n=马  R/r=车  C/c=炮  P/p=兵卒

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ChessRules = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var ROWS = 10;
  var COLS = 9;

  // 初始棋盘布局（深拷贝后使用）
  var INITIAL_BOARD = [
    ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', 'c', ' ', ' ', ' ', ' ', ' ', 'c', ' '],
    ['p', ' ', 'p', ' ', 'p', ' ', 'p', ' ', 'p'],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    ['P', ' ', 'P', ' ', 'P', ' ', 'P', ' ', 'P'],
    [' ', 'C', ' ', ' ', ' ', ' ', ' ', 'C', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'],
  ];

  // -------------------- 工具函数 --------------------

  function isRed(p) {
    return p >= 'A' && p <= 'Z';
  }

  function isBlack(p) {
    return p >= 'a' && p <= 'z';
  }

  function sameColor(a, b) {
    if (!a || !b || a === ' ' || b === ' ') return false;
    return (isRed(a) && isRed(b)) || (isBlack(a) && isBlack(b));
  }

  /**
   * 获取棋子所属方
   * @param {string} piece
   * @returns {'red'|'black'|null}
   */
  function getPieceSide(piece) {
    if (!piece || piece === ' ') return null;
    if (isRed(piece)) return 'red';
    if (isBlack(piece)) return 'black';
    return null;
  }

  function inBoard(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  function inPalace(r, c, red) {
    if (c < 3 || c > 5) return false;
    return red ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
  }

  // -------------------- 创建初始棋盘 --------------------

  /**
   * 创建初始棋盘（深拷贝）
   * @returns {string[][]}
   */
  function createInitialBoard() {
    return INITIAL_BOARD.map(function (row) { return row.slice(); });
  }

  /**
   * 深拷贝棋盘
   * @param {string[][]} boardState
   * @returns {string[][]}
   */
  function cloneBoard(boardState) {
    return boardState.map(function (row) { return row.slice(); });
  }

  // -------------------- 原始走法生成（不做将军过滤）--------------------

  function kingRawMoves(board, row, col, red) {
    var moves = [];
    var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (var i = 0; i < dirs.length; i++) {
      var r = row + dirs[i][0];
      var c = col + dirs[i][1];
      if (inBoard(r, c) && inPalace(r, c, red)) {
        moves.push({ row: r, col: c });
      }
    }
    // 飞将检测：将帅同列且中间无子
    var dir = red ? -1 : 1;
    var r = row + dir;
    while (inBoard(r, col)) {
      if (board[r][col] !== ' ') {
        var t = board[r][col];
        if (t.toUpperCase() === 'K') moves.push({ row: r, col: col });
        break;
      }
      r += dir;
    }
    return moves;
  }

  function advisorRawMoves(board, row, col, red) {
    var moves = [];
    var dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var r = row + dirs[i][0];
      var c = col + dirs[i][1];
      if (inBoard(r, c) && inPalace(r, c, red)) {
        moves.push({ row: r, col: c });
      }
    }
    return moves;
  }

  function bishopRawMoves(board, row, col, red) {
    var moves = [];
    var dirs = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    for (var i = 0; i < dirs.length; i++) {
      var dr = dirs[i][0];
      var dc = dirs[i][1];
      var r = row + dr;
      var c = col + dc;
      if (!inBoard(r, c)) continue;
      // 不能过河
      if (red && r < 5) continue;
      if (!red && r > 4) continue;
      // 蹩脚检测（田字中心）
      var mr = row + dr / 2;
      var mc = col + dc / 2;
      if (board[mr][mc] !== ' ') continue;
      moves.push({ row: r, col: c });
    }
    return moves;
  }

  function knightRawMoves(board, row, col) {
    var moves = [];
    // [行偏移, 列偏移, 绊腿行偏移, 绊腿列偏移]
    var jumps = [
      [-2, -1, -1, 0], [-2, 1, -1, 0],
      [2, -1, 1, 0], [2, 1, 1, 0],
      [-1, -2, 0, -1], [1, -2, 0, -1],
      [-1, 2, 0, 1], [1, 2, 0, 1],
    ];
    for (var i = 0; i < jumps.length; i++) {
      var dr = jumps[i][0];
      var dc = jumps[i][1];
      var br = jumps[i][2];
      var bc = jumps[i][3];
      var r = row + dr;
      var c = col + dc;
      if (!inBoard(r, c)) continue;
      // 蹩马腿
      if (board[row + br][col + bc] !== ' ') continue;
      moves.push({ row: r, col: c });
    }
    return moves;
  }

  function rookRawMoves(board, row, col) {
    var moves = [];
    var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (var i = 0; i < dirs.length; i++) {
      var r = row + dirs[i][0];
      var c = col + dirs[i][1];
      while (inBoard(r, c)) {
        if (board[r][c] !== ' ') {
          moves.push({ row: r, col: c }); // 可以吃对方子
          break;
        }
        moves.push({ row: r, col: c });
        r += dirs[i][0];
        c += dirs[i][1];
      }
    }
    return moves;
  }

  function cannonRawMoves(board, row, col) {
    var moves = [];
    var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (var i = 0; i < dirs.length; i++) {
      var r = row + dirs[i][0];
      var c = col + dirs[i][1];
      var jumped = false;
      while (inBoard(r, c)) {
        if (board[r][c] !== ' ') {
          if (!jumped) {
            jumped = true; // 炮架，跳过
          } else {
            moves.push({ row: r, col: c }); // 翻打
            break;
          }
        } else if (!jumped) {
          moves.push({ row: r, col: c });
        }
        r += dirs[i][0];
        c += dirs[i][1];
      }
    }
    return moves;
  }

  function pawnRawMoves(board, row, col, red) {
    var moves = [];
    var forward = red ? -1 : 1;
    // 前进
    var r = row + forward;
    if (inBoard(r, col)) moves.push({ row: r, col: col });
    // 过河后可以横走
    var crossed = red ? (row <= 4) : (row >= 5);
    if (crossed) {
      if (inBoard(row, col - 1)) moves.push({ row: row, col: col - 1 });
      if (inBoard(row, col + 1)) moves.push({ row: row, col: col + 1 });
    }
    return moves;
  }

  /**
   * 获取棋子的原始攻击范围（不过滤将军，用于 isInCheck 检测）
   */
  function getRawAttacks(board, row, col) {
    var piece = board[row][col];
    if (!piece || piece === ' ') return [];
    var type = piece.toUpperCase();
    var red = isRed(piece);
    switch (type) {
      case 'K': return kingRawMoves(board, row, col, red);
      case 'A': return advisorRawMoves(board, row, col, red);
      case 'B': return bishopRawMoves(board, row, col, red);
      case 'N': return knightRawMoves(board, row, col);
      case 'R': return rookRawMoves(board, row, col);
      case 'C': return cannonRawMoves(board, row, col);
      case 'P': return pawnRawMoves(board, row, col, red);
      default: return [];
    }
  }

  // -------------------- 将军检测 --------------------

  function findKing(board, side) {
    var king = side === 'red' ? 'K' : 'k';
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c] === king) return { row: r, col: c };
      }
    }
    return null;
  }

  /**
   * 检测指定方是否被将
   * @param {string[][]} boardState
   * @param {'red'|'black'} side
   * @returns {boolean}
   */
  function isInCheck(boardState, side) {
    var king = findKing(boardState, side);
    if (!king) return true; // 将/帅不存在视为被将死

    var oppSide = side === 'red' ? 'black' : 'red';

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var p = boardState[r][c];
        if (p === ' ') continue;
        if (getPieceSide(p) !== oppSide) continue;
        var attacks = getRawAttacks(boardState, r, c);
        for (var i = 0; i < attacks.length; i++) {
          if (attacks[i].row === king.row && attacks[i].col === king.col) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 模拟走棋后检测是否被将（不修改原棋盘）
   */
  function wouldBeInCheck(boardState, fromR, fromC, toR, toC, side) {
    var newBoard = cloneBoard(boardState);
    newBoard[toR][toC] = newBoard[fromR][fromC];
    newBoard[fromR][fromC] = ' ';
    return isInCheck(newBoard, side);
  }

  // -------------------- 走法生成（带合法性过滤）--------------------

  /**
   * 获取指定位置棋子的所有合法走法
   * @param {string[][]} boardState
   * @param {number} row
   * @param {number} col
   * @returns {Array<{row:number, col:number}>}
   */
  function getMoves(boardState, row, col) {
    var piece = boardState[row][col];
    if (!piece || piece === ' ') return [];

    var type = piece.toUpperCase();
    var red = isRed(piece);
    var side = red ? 'red' : 'black';
    var rawMoves = [];

    switch (type) {
      case 'K': rawMoves = kingRawMoves(boardState, row, col, red); break;
      case 'A': rawMoves = advisorRawMoves(boardState, row, col, red); break;
      case 'B': rawMoves = bishopRawMoves(boardState, row, col, red); break;
      case 'N': rawMoves = knightRawMoves(boardState, row, col); break;
      case 'R': rawMoves = rookRawMoves(boardState, row, col); break;
      case 'C': rawMoves = cannonRawMoves(boardState, row, col); break;
      case 'P': rawMoves = pawnRawMoves(boardState, row, col, red); break;
    }

    // 过滤：不能吃自己的子，走完后不能被将
    return rawMoves.filter(function (m) {
      var target = boardState[m.row][m.col];
      if (sameColor(piece, target)) return false;
      return !wouldBeInCheck(boardState, row, col, m.row, m.col, side);
    });
  }

  /**
   * 落子并返回新棋盘（不修改原棋盘）
   * @param {string[][]} boardState
   * @param {{row:number, col:number}} from
   * @param {{row:number, col:number}} to
   * @returns {string[][]} 新棋盘
   */
  function applyMove(boardState, from, to) {
    var newBoard = cloneBoard(boardState);
    newBoard[to.row][to.col] = newBoard[from.row][from.col];
    newBoard[from.row][from.col] = ' ';
    return newBoard;
  }

  /**
   * 检测指定方是否有合法走法
   * @param {string[][]} boardState
   * @param {'red'|'black'} side
   * @returns {boolean}
   */
  function hasAnyMove(boardState, side) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var p = boardState[r][c];
        if (p === ' ') continue;
        if (getPieceSide(p) !== side) continue;
        if (getMoves(boardState, r, c).length > 0) return true;
      }
    }
    return false;
  }

  /**
   * 检测指定方是否被将死（被将且无合法走法）
   * @param {string[][]} boardState
   * @param {'red'|'black'} side
   * @returns {boolean}
   */
  function isCheckmate(boardState, side) {
    return isInCheck(boardState, side) && !hasAnyMove(boardState, side);
  }

  return {
    INITIAL_BOARD: INITIAL_BOARD,
    createInitialBoard: createInitialBoard,
    getPieceSide: getPieceSide,
    getMoves: getMoves,
    applyMove: applyMove,
    isInCheck: isInCheck,
    hasAnyMove: hasAnyMove,
    isCheckmate: isCheckmate,
  };

}));
