'use strict'

const gomokuRules = require('../../../shared/gomoku-rules')
const chessRules = require('../../../shared/chess-rules')

/**
 * 走棋合法性校验服务
 * 调用 shared 规则模块，服务端权威校验，防止作弊
 */
class GameValidator {
  /**
   * 校验走棋是否合法
   * @param {'gomoku'|'chinese-chess'} gameType
   * @param {any} boardState - 当前棋盘状态
   * @param {object} moveData - 走棋数据
   * @param {'black'|'white'|'red'} currentTurn - 当前行棋方
   * @returns {{ valid: boolean, reason?: string }}
   */
  validate(gameType, boardState, moveData, currentTurn) {
    try {
      if (gameType === 'gomoku') {
        return this._validateGomoku(boardState, moveData, currentTurn)
      } else if (gameType === 'chinese-chess') {
        return this._validateChess(boardState, moveData, currentTurn)
      }
      return { valid: false, reason: '未知游戏类型' }
    } catch (err) {
      console.error('[GameValidator] 校验异常:', err.message)
      return { valid: false, reason: '校验内部错误' }
    }
  }

  /**
   * 应用走棋并检测胜负
   * @param {'gomoku'|'chinese-chess'} gameType
   * @param {any} boardState
   * @param {object} moveData
   * @param {'black'|'white'|'red'} currentTurn
   * @returns {{ newBoardState: any, gameOver: boolean, winner?: string, reason?: string }}
   */
  applyAndCheck(gameType, boardState, moveData, currentTurn) {
    if (gameType === 'gomoku') {
      return this._applyAndCheckGomoku(boardState, moveData, currentTurn)
    } else if (gameType === 'chinese-chess') {
      return this._applyAndCheckChess(boardState, moveData, currentTurn)
    }
    return { newBoardState: boardState, gameOver: false }
  }

  // ===== 五子棋 =====

  _validateGomoku(boardState, moveData, currentTurn) {
    const { row, col } = moveData
    if (row === undefined || col === undefined) {
      return { valid: false, reason: '缺少坐标' }
    }
    if (!gomokuRules.isValidMove(boardState, row, col)) {
      return { valid: false, reason: '落点非法（越界或已有棋子）' }
    }
    return { valid: true }
  }

  _applyAndCheckGomoku(boardState, moveData, currentTurn) {
    const { row, col } = moveData
    const player = currentTurn === 'black' ? 1 : 2
    const newBoardState = gomokuRules.applyMove(boardState, row, col, player)
    const winLine = gomokuRules.checkWin(newBoardState, row, col, player)

    if (winLine) {
      return { newBoardState, gameOver: true, winner: currentTurn, reason: 'five' }
    }

    // 检查平局（棋盘下满）
    const isFull = newBoardState.every(r => r.every(cell => cell !== 0))
    if (isFull) {
      return { newBoardState, gameOver: true, winner: null, reason: 'draw' }
    }

    return { newBoardState, gameOver: false }
  }

  // ===== 中国象棋 =====

  _validateChess(boardState, moveData, currentTurn) {
    const { from, to } = moveData
    if (!from || !to) {
      return { valid: false, reason: '缺少 from/to 坐标' }
    }

    const piece = boardState[from.row][from.col]
    if (!piece || piece === ' ') {
      return { valid: false, reason: '起始位置没有棋子' }
    }

    // 验证棋子归属（红方大写，黑方小写）
    const isRedPiece = piece >= 'A' && piece <= 'Z'
    if (currentTurn === 'red' && !isRedPiece) {
      return { valid: false, reason: '不是你的棋子' }
    }
    if (currentTurn === 'black' && isRedPiece) {
      return { valid: false, reason: '不是你的棋子' }
    }

    // 获取合法走法，检查目标位置是否在其中
    const legalMoves = chessRules.getMoves(boardState, from.row, from.col)
    const isLegal = legalMoves.some(m => m.row === to.row && m.col === to.col)
    if (!isLegal) {
      return { valid: false, reason: '走法不合规则' }
    }

    return { valid: true }
  }

  _applyAndCheckChess(boardState, moveData, currentTurn) {
    const { from, to } = moveData
    const newBoardState = chessRules.applyMove(boardState, from, to)

    // 判断对方是否被将死（下一回合行棋方）
    const nextTurn = currentTurn === 'red' ? 'black' : 'red'
    if (chessRules.isCheckmate(newBoardState, nextTurn)) {
      return { newBoardState, gameOver: true, winner: currentTurn, reason: 'checkmate' }
    }

    return { newBoardState, gameOver: false }
  }
}

module.exports = new GameValidator()
