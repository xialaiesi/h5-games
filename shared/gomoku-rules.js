'use strict';

// ==================== 五子棋规则模块 ====================
// 纯函数，无副作用，前后端通用（UMD）

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GomokuRules = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // 棋盘格子数（15x15）
  var GRID_COUNT = 15;

  /**
   * 创建空棋盘
   * @returns {number[][]} 15x15 二维数组，全部填充 0
   */
  function createEmptyBoard() {
    var board = [];
    for (var r = 0; r < GRID_COUNT; r++) {
      board.push(new Array(GRID_COUNT).fill(0));
    }
    return board;
  }

  /**
   * 深拷贝棋盘
   * @param {number[][]} boardState
   * @returns {number[][]}
   */
  function cloneBoard(boardState) {
    return boardState.map(function (row) { return row.slice(); });
  }

  /**
   * 判断落子是否合法（坐标在范围内且该位置为空）
   * @param {number[][]} boardState - 15x15 棋盘，0=空, 1=黑, 2=白
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  function isValidMove(boardState, row, col) {
    if (row < 0 || row >= GRID_COUNT || col < 0 || col >= GRID_COUNT) {
      return false;
    }
    return boardState[row][col] === 0;
  }

  /**
   * 落子并返回新棋盘（不修改原棋盘）
   * @param {number[][]} boardState
   * @param {number} row
   * @param {number} col
   * @param {number} player - 1=黑, 2=白
   * @returns {number[][]} 新棋盘
   */
  function applyMove(boardState, row, col, player) {
    var newBoard = cloneBoard(boardState);
    newBoard[row][col] = player;
    return newBoard;
  }

  /**
   * 检测是否形成五连珠
   * @param {number[][]} boardState
   * @param {number} row - 最后落子的行
   * @param {number} col - 最后落子的列
   * @param {number} player - 1=黑, 2=白
   * @returns {Array<{row:number, col:number}>|null} 五连珠坐标数组，无则返回 null
   */
  function checkWin(boardState, row, col, player) {
    // 四个方向：横、竖、右斜、左斜
    var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d][0];
      var dc = dirs[d][1];
      var line = [{ row: row, col: col }];

      // 双向延伸
      for (var sign = -1; sign <= 1; sign += 2) {
        for (var i = 1; i < 5; i++) {
          var r = row + dr * i * sign;
          var c = col + dc * i * sign;
          if (r < 0 || r >= GRID_COUNT || c < 0 || c >= GRID_COUNT) break;
          if (boardState[r][c] !== player) break;
          if (sign === -1) {
            line.unshift({ row: r, col: c });
          } else {
            line.push({ row: r, col: c });
          }
        }
      }

      if (line.length >= 5) {
        return line;
      }
    }

    return null;
  }

  return {
    GRID_COUNT: GRID_COUNT,
    createEmptyBoard: createEmptyBoard,
    isValidMove: isValidMove,
    applyMove: applyMove,
    checkWin: checkWin,
  };

}));
