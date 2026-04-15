'use strict'

const { v4: uuidv4 } = require('uuid')
const gomokuRules = require('../../../shared/gomoku-rules')
const chessRules = require('../../../shared/chess-rules')
const RoomModel = require('../models/RoomModel')
const MoveModel = require('../models/MoveModel')
const UserModel = require('../models/UserModel')
const GameValidator = require('./GameValidator')
const RatingCalculator = require('./RatingCalculator')
const TimerManager = require('./TimerManager')

const ROOM_CLEANUP_DELAY = 5 * 60 * 1000  // 5 分钟后清理结束房间

/**
 * 生成 6 位大写字母数字邀请码
 */
function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * 获取指定游戏类型的初始棋盘
 */
function createInitialBoard(gameType) {
  if (gameType === 'gomoku') {
    return gomokuRules.createEmptyBoard()
  } else if (gameType === 'chinese-chess') {
    return chessRules.createInitialBoard()
  }
  return []
}

/**
 * 获取指定游戏的先手颜色
 */
function getColors(gameType) {
  if (gameType === 'gomoku') return ['black', 'white']
  return ['red', 'black']   // 中国象棋红方先手
}

/**
 * 房间管理服务（内存）
 * 管理所有活跃房间的生命周期
 */
class RoomManager {
  constructor() {
    this.rooms = new Map()      // roomId -> RoomState
    this.userRoom = new Map()   // userId -> roomId
    // WebSocket send 函数，由 ws.js 注入
    this._send = null
    this._broadcast = null
  }

  /**
   * 注入 WebSocket 发送函数（ws.js 调用）
   * @param {Function} send - send(ws, type, payload, roomId)
   * @param {Function} broadcast - broadcast(room, type, payload)
   */
  injectWS(send, broadcast) {
    this._send = send
    this._broadcast = broadcast
  }

  // ===== 创建房间 =====

  /**
   * 创建邀请房间（邀请码模式）
   * @param {{ gameType, mode, player }} data
   * @returns {object} RoomState
   */
  createRoom({ gameType, mode, player }) {
    if (this.userRoom.has(player.userId)) {
      const err = new Error('已在房间中')
      err.code = 'ALREADY_IN_ROOM'
      throw err
    }

    const roomId = uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()
    const inviteCode = genInviteCode()
    const [color1] = getColors(gameType)

    const room = {
      roomId,
      inviteCode,
      gameType,
      mode,
      status: 'waiting',
      players: {
        [color1]: {
          userId: player.userId,
          nickname: player.nickname,
          socket: player.socket,
          rating: player.rating || 1000,
          connected: true,
          ready: false,
          timeLeft: 60,
          extraTime: 3,
        },
      },
      boardState: createInitialBoard(gameType),
      moveHistory: [],
      currentTurn: color1,   // 五子棋黑先，象棋红先
      moveCount: 0,
      stepTimer: null,
      reconnectTimer: null,
      _reconnectUserId: null,
      _stepTimerStart: null,
      pendingDraw: null,     // 发起和棋请求的 userId
      pendingUndo: null,     // 发起悔棋请求的 userId
      createdAt: Date.now(),
      startedAt: null,
    }

    this.rooms.set(roomId, room)
    this.userRoom.set(player.userId, roomId)

    // 写入数据库
    try {
      RoomModel.create({
        id: roomId,
        invite_code: inviteCode,
        game_type: gameType,
        mode,
        player1_id: player.userId,
        player1_color: color1,
      })
    } catch (err) {
      console.error('[RoomManager] 写入 room 失败:', err.message)
    }

    return room
  }

  /**
   * 通过邀请码加入房间（也用于匹配成功后加入）
   * @param {string} roomId
   * @param {object} player
   * @returns {object} RoomState
   */
  joinRoom(roomId, player) {
    const room = this.rooms.get(roomId)
    if (!room) {
      const err = new Error('房间不存在')
      err.code = 'ROOM_NOT_FOUND'
      throw err
    }

    if (room.status !== 'waiting') {
      const err = new Error('房间已满或已开始')
      err.code = 'ROOM_FULL'
      throw err
    }

    // 断线重连：已在此房间的玩家重连
    const existingColor = this._getPlayerColor(room, player.userId)
    if (existingColor) {
      return this.reconnect(roomId, player.userId, player.socket)
    }

    if (this.userRoom.has(player.userId)) {
      const err = new Error('已在其他房间中')
      err.code = 'ALREADY_IN_ROOM'
      throw err
    }

    // 确定第二个玩家的颜色
    const [color1, color2] = getColors(room.gameType)
    const takenColor = Object.keys(room.players)[0]
    const joinColor = takenColor === color1 ? color2 : color1

    room.players[joinColor] = {
      userId: player.userId,
      nickname: player.nickname,
      socket: player.socket,
      rating: player.rating || 1000,
      connected: true,
      ready: false,
      timeLeft: 60,
      extraTime: 3,
    }

    this.userRoom.set(player.userId, roomId)

    // 通知房间内已有玩家：有新玩家加入
    const firstColor = takenColor
    const firstPlayer = room.players[firstColor]
    if (firstPlayer && firstPlayer.socket && this._send) {
      this._send(firstPlayer.socket, 'player_joined', {
        userId: player.userId,
        nickname: player.nickname,
      }, roomId)
    }

    return room
  }

  /**
   * 断线重连：更新 socket，恢复状态
   * @param {string} roomId
   * @param {string} userId
   * @param {WebSocket} newSocket
   * @returns {object} RoomState
   */
  reconnect(roomId, userId, newSocket) {
    const room = this.rooms.get(roomId)
    if (!room) {
      const err = new Error('房间不存在')
      err.code = 'ROOM_NOT_FOUND'
      throw err
    }

    const color = this._getPlayerColor(room, userId)
    if (!color) {
      const err = new Error('不在此房间中')
      err.code = 'NOT_IN_ROOM'
      throw err
    }

    room.players[color].socket = newSocket
    room.players[color].connected = true

    // 停止重连计时器
    TimerManager.stopReconnectTimer(room)

    // 恢复步骤计时（如果是自己的回合）
    if (room.status === 'playing' && room.currentTurn === color) {
      TimerManager.startStepTimer(
        room,
        (r, sec) => this._onTimerWarning(r, sec),
        (r) => this._onTimerTimeout(r)
      )
    }

    // 通知对方重连成功
    const oppColor = color === Object.keys(room.players)[0]
      ? Object.keys(room.players)[1]
      : Object.keys(room.players)[0]
    const opp = room.players[oppColor]
    if (opp && opp.socket && this._send) {
      this._send(opp.socket, 'opponent_reconnected', {}, roomId)
    }

    return room
  }

  // ===== 准备 =====

  /**
   * 玩家标记准备就绪
   * @param {string} roomId
   * @param {string} userId
   * @returns {{ room: object, gameStarted: boolean }}
   */
  playerReady(roomId, userId) {
    const room = this.rooms.get(roomId)
    if (!room) {
      const err = new Error('房间不存在')
      err.code = 'ROOM_NOT_FOUND'
      throw err
    }

    const color = this._getPlayerColor(room, userId)
    if (!color) {
      const err = new Error('不在此房间中')
      err.code = 'NOT_IN_ROOM'
      throw err
    }

    room.players[color].ready = true

    const colors = Object.keys(room.players)
    const allReady = colors.length === 2 && colors.every(c => room.players[c].ready)

    if (allReady && room.status === 'waiting') {
      room.status = 'playing'
      room.startedAt = Date.now()

      // 双方都已加入且准备就绪后，写入第二位玩家信息到数据库
      // colors[0] 是先手（创建房间时已写入），colors[1] 是后手
      try {
        const [color1, color2] = getColors(room.gameType)
        // 找到后手颜色（非先手颜色）
        const p2Color = colors.find(c => c !== color1) || colors[1]
        if (room.players[p2Color] && room.players[p2Color].userId) {
          RoomModel.playerJoin(
            roomId,
            room.players[p2Color].userId,
            p2Color
          )
        }
      } catch (err) {
        console.error('[RoomManager] playerJoin DB 写入失败:', err.message)
      }

      // 启动第一步计时器
      TimerManager.startStepTimer(
        room,
        (r, sec) => this._onTimerWarning(r, sec),
        (r) => this._onTimerTimeout(r)
      )
    }

    return { room, gameStarted: allReady }
  }

  // ===== 走棋 =====

  /**
   * 应用走棋（服务器权威）
   * @param {string} roomId
   * @param {string} userId
   * @param {object} moveData
   * @returns {{ room, moveData, boardState, gameOver, winner, reason, timeSpent }}
   */
  applyMove(roomId, userId, moveData) {
    const room = this.rooms.get(roomId)
    if (!room) {
      const err = new Error('房间不存在')
      err.code = 'ROOM_NOT_FOUND'
      throw err
    }

    if (room.status !== 'playing') {
      const err = new Error('对局未开始')
      err.code = 'GAME_NOT_STARTED'
      throw err
    }

    const color = this._getPlayerColor(room, userId)
    if (!color) {
      const err = new Error('不在此房间中')
      err.code = 'NOT_IN_ROOM'
      throw err
    }

    if (room.currentTurn !== color) {
      const err = new Error('不是你的回合')
      err.code = 'NOT_YOUR_TURN'
      throw err
    }

    // 校验走法合法性
    const validation = GameValidator.validate(room.gameType, room.boardState, moveData, color)
    if (!validation.valid) {
      const err = new Error(validation.reason || '非法走法')
      err.code = 'INVALID_MOVE'
      throw err
    }

    // 停止计时，记录耗时
    const timeSpent = TimerManager.stopStepTimer(room)

    // 应用走棋并检测胜负
    const { newBoardState, gameOver, winner, reason } =
      GameValidator.applyAndCheck(room.gameType, room.boardState, moveData, color)

    // 更新房间状态
    room.boardState = newBoardState
    room.moveCount += 1
    room.moveHistory.push({
      userId,
      moveData,
      timeSpent,
      timestamp: Date.now(),
    })

    room.pendingDraw = null    // 走棋后清除和棋请求
    room.pendingUndo = null

    if (gameOver) {
      room.status = 'finished'
      this._persistAndCleanup(room, winner ? room.players[winner]?.userId : null, reason)
    } else {
      // 切换回合
      const colors = Object.keys(room.players)
      room.currentTurn = colors.find(c => c !== color)
      // 只重置下一个行棋方的剩余时间，不重置走棋方的
      if (room.players[room.currentTurn]) {
        room.players[room.currentTurn].timeLeft = 60
      }

      // 启动下一步计时器
      TimerManager.startStepTimer(
        room,
        (r, sec) => this._onTimerWarning(r, sec),
        (r) => this._onTimerTimeout(r)
      )
    }

    return {
      room,
      moveData,
      boardState: newBoardState,
      gameOver,
      winner,
      reason,
      timeSpent,
      nextTurn: room.currentTurn,
    }
  }

  // ===== 认输 =====

  /**
   * 玩家认输
   * @param {string} roomId
   * @param {string} userId
   */
  resign(roomId, userId) {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing') return

    const color = this._getPlayerColor(room, userId)
    if (!color) return

    const colors = Object.keys(room.players)
    const winnerColor = colors.find(c => c !== color)
    const winnerId = room.players[winnerColor]?.userId

    room.status = 'finished'
    TimerManager.stopStepTimer(room)
    this._persistAndCleanup(room, winnerId, 'resign')

    return { winnerId, winnerColor }
  }

  // ===== 和棋 =====

  /**
   * 发起和棋请求
   * @param {string} roomId
   * @param {string} userId
   * @returns {boolean} 是否成功发起
   */
  drawOffer(roomId, userId) {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing') return false
    if (!this._getPlayerColor(room, userId)) return false
    room.pendingDraw = userId
    return true
  }

  /**
   * 响应和棋请求
   * @param {string} roomId
   * @param {string} userId
   * @param {boolean} accept
   * @returns {{ accepted: boolean }}
   */
  drawResponse(roomId, userId, accept) {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing') return { accepted: false }
    if (!room.pendingDraw || room.pendingDraw === userId) return { accepted: false }

    room.pendingDraw = null

    if (accept) {
      room.status = 'finished'
      TimerManager.stopStepTimer(room)
      this._persistAndCleanup(room, null, 'draw')
    }

    return { accepted: accept }
  }

  // ===== 悔棋 =====

  /**
   * 发起悔棋请求（仅休闲赛）
   * @param {string} roomId
   * @param {string} userId
   * @returns {{ ok: boolean, lastMove?: object }}
   */
  undoRequest(roomId, userId) {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing') return { ok: false }
    if (room.mode !== 'casual') return { ok: false }
    if (room.moveHistory.length === 0) return { ok: false }
    const color = this._getPlayerColor(room, userId)
    if (!color) return { ok: false }

    room.pendingUndo = userId
    const lastMove = room.moveHistory[room.moveHistory.length - 1]
    return { ok: true, lastMove: lastMove.moveData }
  }

  /**
   * 响应悔棋请求
   * @param {string} roomId
   * @param {string} userId - 响应者
   * @param {boolean} accept
   * @returns {{ accepted: boolean, newBoardState?, currentTurn? }}
   */
  undoResponse(roomId, userId, accept) {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing') return { accepted: false }
    if (!room.pendingUndo || room.pendingUndo === userId) return { accepted: false }

    room.pendingUndo = null

    if (!accept) return { accepted: false }

    // 回退一步
    if (room.moveHistory.length === 0) return { accepted: false }

    room.moveHistory.pop()
    room.moveCount -= 1

    // 重建棋盘（重播所有步骤）
    const board = createInitialBoard(room.gameType)
    const colors = Object.keys(room.players)
    let turn = colors[0]  // 先手

    const newBoard = room.moveHistory.reduce((b, move) => {
      const color = this._getPlayerColor(room, move.userId)
      if (room.gameType === 'gomoku') {
        const player = color === 'black' ? 1 : 2
        return gomokuRules.applyMove(b, move.moveData.row, move.moveData.col, player)
      } else {
        return chessRules.applyMove(b, move.moveData.from, move.moveData.to)
      }
    }, board)

    room.boardState = newBoard

    // 切换回合到悔棋方
    const undoRequesterColor = this._getPlayerColor(room, room._undoRequesterId || '')
    // 悔棋后，回到悔的那一步的行棋方
    room.currentTurn = this._getPlayerColor(room, room.moveHistory.length > 0
      ? room.moveHistory[room.moveHistory.length - 1].userId
      : colors[0]) || colors[0]
    // 实际上悔棋后应轮到被悔棋的一方再走
    const lastPlayerColor = room.moveHistory.length > 0
      ? this._getPlayerColor(room, room.moveHistory[room.moveHistory.length - 1].userId)
      : null
    room.currentTurn = lastPlayerColor
      ? colors.find(c => c !== lastPlayerColor) || colors[0]
      : colors[0]

    // 重置计时器
    TimerManager.stopStepTimer(room)
    if (room.players[room.currentTurn]) {
      room.players[room.currentTurn].timeLeft = 60
    }
    TimerManager.startStepTimer(
      room,
      (r, sec) => this._onTimerWarning(r, sec),
      (r) => this._onTimerTimeout(r)
    )

    return { accepted: true, newBoardState: room.boardState, currentTurn: room.currentTurn }
  }

  // ===== 离开/断线 =====

  /**
   * 玩家主动离开房间（waiting 状态）
   * @param {string} roomId
   * @param {string} userId
   */
  playerLeave(roomId, userId) {
    const room = this.rooms.get(roomId)
    if (!room) return

    const color = this._getPlayerColor(room, userId)
    if (!color) return

    if (room.status === 'waiting') {
      // 等待状态：直接关闭房间
      this.userRoom.delete(userId)
      room.status = 'abandoned'
      try { RoomModel.finish(roomId, { end_reason: 'leave', status: 'abandoned' }) } catch {}
      setTimeout(() => this.rooms.delete(roomId), 5000)
    } else if (room.status === 'playing') {
      // 对局中：认输处理
      this.resign(roomId, userId)
    }
  }

  /**
   * 玩家断线（WebSocket 关闭时调用）
   * @param {string} roomId
   * @param {string} userId
   */
  playerDisconnect(roomId, userId) {
    const room = this.rooms.get(roomId)
    if (!room) return

    const color = this._getPlayerColor(room, userId)
    if (!color) return

    room.players[color].connected = false
    room.players[color].socket = null

    if (room.status !== 'playing') {
      this.userRoom.delete(userId)
      if (room.status === 'waiting') {
        room.status = 'abandoned'
        try { RoomModel.finish(roomId, { end_reason: 'disconnect', status: 'abandoned' }) } catch {}
        setTimeout(() => this.rooms.delete(roomId), 5000)
      }
      return
    }

    // 对局中断线：暂停计时，启动重连等待
    TimerManager.pauseStepTimer(room)

    const colors = Object.keys(room.players)
    const oppColor = colors.find(c => c !== color)
    const opp = room.players[oppColor]

    // 通知对方掉线
    if (opp && opp.socket && this._send) {
      this._send(opp.socket, 'opponent_disconnected', { waitSeconds: 60 }, roomId)
    }

    // 启动 60s 重连计时器
    TimerManager.startReconnectTimer(room, userId, () => {
      // 超时未重连，断线方负
      const winnerId = opp?.userId
      room.status = 'finished'
      this._persistAndCleanup(room, winnerId, 'disconnect')

      const winnerColor = oppColor
      if (opp && opp.socket && this._send) {
        // 积分变动后通知胜方
        const ratingMap = this._getRatingResult(room)
        this._send(opp.socket, 'game_over', {
          winner: winnerColor,
          reason: 'disconnect',
          ...this._ratingPayloadForUser(ratingMap, winnerId),
        }, roomId)
      }

      this.userRoom.delete(userId)
    })
  }

  // ===== 结束对局 =====

  /**
   * 主动结束对局（超时等）
   * @param {string} roomId
   * @param {{ winnerId?, reason }} options
   */
  endGame(roomId, { winnerId = null, reason = 'unknown' } = {}) {
    const room = this.rooms.get(roomId)
    if (!room || room.status === 'finished') return

    TimerManager.stopStepTimer(room)
    room.status = 'finished'
    this._persistAndCleanup(room, winnerId, reason)
  }

  // ===== 查询 =====

  getRoom(roomId) {
    return this.rooms.get(roomId) || null
  }

  getUserRoom(userId) {
    return this.userRoom.get(userId) || null
  }

  /**
   * 获取所有房间的在线人数统计
   * @returns {{ gomoku: number, 'chinese-chess': number }}
   */
  getOnlineCounts() {
    const counts = { gomoku: 0, 'chinese-chess': 0 }
    for (const room of this.rooms.values()) {
      if (room.status === 'playing' || room.status === 'waiting') {
        const playerCount = Object.keys(room.players).length
        counts[room.gameType] = (counts[room.gameType] || 0) + playerCount
      }
    }
    return counts
  }

  // ===== 私有方法 =====

  /**
   * 获取玩家在房间中的颜色
   */
  _getPlayerColor(room, userId) {
    for (const [color, player] of Object.entries(room.players)) {
      if (player && player.userId === userId) return color
    }
    return null
  }

  /**
   * 计时器 warning 回调
   */
  _onTimerWarning(room, secondsLeft) {
    const currentPlayer = room.players[room.currentTurn]
    if (currentPlayer && currentPlayer.socket && this._send) {
      this._send(currentPlayer.socket, 'timeout_warning', { secondsLeft }, room.roomId)
    }
  }

  /**
   * 计时器超时回调
   */
  _onTimerTimeout(room) {
    if (room.status !== 'playing') return

    const loserColor = room.currentTurn
    const colors = Object.keys(room.players)
    const winnerColor = colors.find(c => c !== loserColor)
    const winnerId = room.players[winnerColor]?.userId

    room.status = 'finished'
    this._persistAndCleanup(room, winnerId, 'timeout')

    // 通知双方
    if (this._broadcast) {
      this._broadcast(room, 'timeout', { loser: loserColor })
    }

    // 广播 game_over（带积分），每人积分不同，分别发送
    const ratingMap = this._getRatingResult(room)
    if (this._send) {
      for (const [color, player] of Object.entries(room.players)) {
        if (player && player.socket) {
          this._send(player.socket, 'game_over', {
            winner: winnerColor,
            reason: 'timeout',
            ...this._ratingPayloadForUser(ratingMap, player.userId),
          }, room.roomId)
        }
      }
    }
  }

  /**
   * 结束后写入数据库并清理资源
   */
  _persistAndCleanup(room, winnerId, reason) {
    const roomId = room.roomId

    // 写入房间最终状态
    try {
      RoomModel.finish(roomId, { winner_id: winnerId, end_reason: reason })
    } catch (err) {
      console.error('[RoomManager] finish room 失败:', err.message)
    }

    // 批量写入步骤
    try {
      if (room.moveHistory.length > 0) {
        MoveModel.bulkInsert(roomId, room.moveHistory)
      }
    } catch (err) {
      console.error('[RoomManager] bulkInsert moves 失败:', err.message)
    }

    // 积分结算
    try {
      const colors = Object.keys(room.players)
      if (colors.length === 2 && room.players[colors[0]] && room.players[colors[1]]) {
        RatingCalculator.settle(roomId, winnerId, reason, {
          player1Id: room.players[colors[0]].userId,
          player2Id: room.players[colors[1]].userId,
          gameType: room.gameType,
          mode: room.mode,
        })
      }
    } catch (err) {
      console.error('[RoomManager] 积分结算失败:', err.message)
    }

    // 5 分钟后清理内存
    setTimeout(() => {
      for (const [color, player] of Object.entries(room.players)) {
        if (player) this.userRoom.delete(player.userId)
      }
      this.rooms.delete(roomId)
    }, ROOM_CLEANUP_DELAY)
  }

  /**
   * 获取积分变动结果（用于 game_over 消息）
   * 返回按 userId 索引的积分信息 Map，供各路径按需取用
   * @returns {{ [userId]: { ratingDelta: number, newRating: number } }}
   */
  _getRatingResult(room) {
    try {
      const RatingLogModel = require('../models/RatingLogModel')
      const logs = RatingLogModel.findByRoomId(room.roomId)
      const result = {}
      for (const log of logs) {
        result[log.user_id] = {
          ratingDelta: log.delta,
          newRating:   log.rating_after,
        }
      }
      return result
    } catch {
      return {}
    }
  }

  /**
   * 构造发给特定玩家的 game_over 积分字段
   * @param {{ [userId]: { ratingDelta, newRating } }} ratingMap
   * @param {string} userId
   */
  _ratingPayloadForUser(ratingMap, userId) {
    const entry = ratingMap[userId]
    if (!entry) return {}
    return { ratingDelta: entry.ratingDelta, newRating: entry.newRating }
  }
}

module.exports = new RoomManager()
