'use strict'

const WebSocket = require('ws')
const AuthService = require('./services/AuthService')
const RoomManager = require('./services/RoomManager')
const MatchmakingEngine = require('./services/MatchmakingEngine')
const UserModel = require('./models/UserModel')

const AUTH_TIMEOUT = 10 * 1000      // 10s 内未鉴权断开
const HEARTBEAT_TIMEOUT = 90 * 1000 // 90s 无消息断开

// ===== 工具函数 =====

/**
 * 向单个 WebSocket 连接发送消息
 * @param {WebSocket} ws
 * @param {string} type
 * @param {object} payload
 * @param {string|null} roomId
 */
function send(ws, type, payload = {}, roomId = null) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type, roomId, payload }))
    } catch (err) {
      console.error('[WS] send 失败:', err.message)
    }
  }
}

/**
 * 向房间内所有玩家广播消息
 * @param {object} room - RoomState
 * @param {string} type
 * @param {object} payload
 */
function broadcast(room, type, payload = {}) {
  for (const player of Object.values(room.players)) {
    if (player && player.socket) {
      send(player.socket, type, payload, room.roomId)
    }
  }
}

// ===== 消息处理器 =====

/**
 * auth: WebSocket 鉴权
 */
function handleAuth(ws, payload, connections) {
  const { token } = payload || {}

  let user
  try {
    user = AuthService.verify(token)
  } catch (err) {
    send(ws, 'auth_fail', { reason: err.message })
    ws.close(1008, 'auth failed')
    return
  }

  // 清除鉴权超时
  if (ws._authTimeout) {
    clearTimeout(ws._authTimeout)
    ws._authTimeout = null
  }

  // 如果同一用户已有连接，关闭旧连接（顶号）
  if (connections.has(user.userId)) {
    const oldWs = connections.get(user.userId)
    if (oldWs !== ws) {
      send(oldWs, 'error', { code: 'SESSION_REPLACED', message: '账号在其他设备登录' })
      oldWs.close(1000, 'replaced')
    }
  }

  ws.userId = user.userId
  ws.nickname = user.nickname
  ws.isAuthenticated = true
  connections.set(user.userId, ws)

  // 获取用户信息（含积分）
  const dbUser = UserModel.findById(user.userId)

  send(ws, 'auth_ok', {
    userId: user.userId,
    nickname: user.nickname,
    rating_gomoku: dbUser?.rating_gomoku || 1000,
    rating_chess: dbUser?.rating_chess || 1000,
  })

  // 检查是否有未完成的房间（断线重连场景）
  const existingRoomId = RoomManager.getUserRoom(user.userId)
  if (existingRoomId) {
    const room = RoomManager.getRoom(existingRoomId)
    if (room && (room.status === 'playing' || room.status === 'waiting')) {
      // 更新 socket，推送房间状态
      try {
        RoomManager.reconnect(existingRoomId, user.userId, ws)
        send(ws, 'room_joined', {
          roomId: existingRoomId,
          roomState: _serializeRoom(room, user.userId),
        }, existingRoomId)
      } catch (err) {
        // 重连失败忽略
      }
    }
  }
}

/**
 * join_queue: 加入匹配队列
 */
function handleJoinQueue(ws, payload) {
  const { gameType, mode } = payload || {}
  if (!gameType || !mode) {
    return send(ws, 'error', { code: 'PARSE_ERROR', message: '缺少 gameType 或 mode' })
  }

  // 检查是否已在房间
  if (RoomManager.getUserRoom(ws.userId)) {
    return send(ws, 'error', { code: 'ALREADY_IN_ROOM', message: '已在房间中，请先离开' })
  }

  try {
    const dbUser = UserModel.findById(ws.userId)
    const rating = gameType === 'gomoku'
      ? (dbUser?.rating_gomoku || 1000)
      : (dbUser?.rating_chess || 1000)

    const result = MatchmakingEngine.enqueue({
      userId: ws.userId,
      nickname: ws.nickname,
      socket: ws,
      rating,
      gameType,
      mode,
    })

    send(ws, 'queue_joined', {
      position: result.position,
      gameType,
      mode,
    })
  } catch (err) {
    send(ws, 'error', { code: err.code || 'INTERNAL_ERROR', message: err.message })
  }
}

/**
 * leave_queue: 离开匹配队列
 */
function handleLeaveQueue(ws) {
  MatchmakingEngine.dequeue(ws.userId)
  send(ws, 'queue_updated', { position: 0 })
}

/**
 * create_room: 创建邀请房间
 */
function handleCreateRoom(ws, payload) {
  const { gameType, mode } = payload || {}
  if (!gameType || !mode) {
    return send(ws, 'error', { code: 'PARSE_ERROR', message: '缺少 gameType 或 mode' })
  }

  try {
    const room = RoomManager.createRoom({
      gameType,
      mode,
      player: {
        userId: ws.userId,
        nickname: ws.nickname,
        socket: ws,
        rating: _getUserRating(ws.userId, gameType),
      },
    })

    send(ws, 'room_created', { roomId: room.roomId, inviteCode: room.inviteCode }, room.roomId)
  } catch (err) {
    send(ws, 'error', { code: err.code || 'INTERNAL_ERROR', message: err.message })
  }
}

/**
 * join_room: 通过邀请码加入房间
 */
function handleJoinRoom(ws, payload) {
  const { roomId } = payload || {}
  if (!roomId) {
    return send(ws, 'error', { code: 'PARSE_ERROR', message: '缺少 roomId' })
  }

  try {
    // 支持邀请码（6位）和房间 ID 两种形式
    let targetRoomId = roomId
    if (roomId.length === 6) {
      // 遍历内存找邀请码对应的房间
      for (const [rid, room] of RoomManager.rooms.entries()) {
        if (room.inviteCode === roomId.toUpperCase()) {
          targetRoomId = rid
          break
        }
      }
    }

    const room = RoomManager.joinRoom(targetRoomId, {
      userId: ws.userId,
      nickname: ws.nickname,
      socket: ws,
      rating: _getUserRating(ws.userId, null),
    })

    send(ws, 'room_joined', {
      roomId: room.roomId,
      roomState: _serializeRoom(room, ws.userId),
    }, room.roomId)
  } catch (err) {
    send(ws, 'error', { code: err.code || 'INTERNAL_ERROR', message: err.message })
  }
}

/**
 * leave_room: 主动离开房间（等待中）
 */
function handleLeaveRoom(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  if (!rid) return
  RoomManager.playerLeave(rid, ws.userId)
}

/**
 * ready: 玩家准备就绪
 */
function handleReady(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  if (!rid) {
    return send(ws, 'error', { code: 'PARSE_ERROR', message: '缺少 roomId' })
  }

  try {
    const { room, gameStarted } = RoomManager.playerReady(rid, ws.userId)

    // 通知对方准备状态
    broadcast(room, 'player_ready', { userId: ws.userId })

    // 如果双方都准备好了，发送 game_start
    if (gameStarted) {
      for (const [color, player] of Object.entries(room.players)) {
        if (player && player.socket) {
          send(player.socket, 'game_start', {
            firstTurn: room.currentTurn,
            boardState: room.boardState,
            myColor: color,
            timeLimit: 60,
          }, rid)
        }
      }
    }
  } catch (err) {
    send(ws, 'error', { code: err.code || 'INTERNAL_ERROR', message: err.message })
  }
}

/**
 * move: 走棋
 */
function handleMove(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  const moveData = payload?.moveData

  if (!rid || !moveData) {
    return send(ws, 'error', { code: 'PARSE_ERROR', message: '缺少 roomId 或 moveData' })
  }

  try {
    const result = RoomManager.applyMove(rid, ws.userId, moveData)
    const { room, boardState, gameOver, winner, reason, nextTurn } = result

    // 广播走棋结果给双方
    broadcast(room, 'move_applied', {
      moveData,
      boardState,
      nextTurn: nextTurn || room.currentTurn,
      timeLeft: room.players[nextTurn || room.currentTurn]?.timeLeft || 60,
    })

    // 对局结束
    if (gameOver) {
      const ratingMap = RoomManager._getRatingResult(room)

      // 给每个玩家发送定制的 game_over（包含自己的积分变动）
      for (const [color, player] of Object.entries(room.players)) {
        if (!player || !player.socket) continue
        const myRating = ratingMap[player.userId] || {}
        send(player.socket, 'game_over', {
          winner: winner || null,
          reason: reason || 'unknown',
          ratingDelta: myRating.ratingDelta || 0,
          newRating: myRating.newRating || null,
        }, rid)
      }
    }
  } catch (err) {
    send(ws, 'error', { code: err.code || 'INTERNAL_ERROR', message: err.message })
  }
}

/**
 * resign: 认输
 */
function handleResign(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  if (!rid) return

  const result = RoomManager.resign(rid, ws.userId)
  if (!result) return

  const room = RoomManager.getRoom(rid)
  if (!room) return

  const ratingMap = RoomManager._getRatingResult(room)

  for (const [color, player] of Object.entries(room.players)) {
    if (!player || !player.socket) continue
    const myRating = ratingMap[player.userId] || {}
    send(player.socket, 'game_over', {
      winner: result.winnerColor,
      reason: 'resign',
      ratingDelta: myRating.ratingDelta || 0,
      newRating: myRating.newRating || null,
    }, rid)
  }
}

/**
 * draw_offer: 发起和棋请求
 */
function handleDrawOffer(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  if (!rid) return

  const ok = RoomManager.drawOffer(rid, ws.userId)
  if (!ok) {
    return send(ws, 'error', { code: 'GAME_NOT_STARTED', message: '无法发起和棋' })
  }

  const room = RoomManager.getRoom(rid)
  if (!room) return

  // 通知对方有和棋请求
  for (const [color, player] of Object.entries(room.players)) {
    if (player && player.userId !== ws.userId && player.socket) {
      send(player.socket, 'draw_offered', {}, rid)
    }
  }
}

/**
 * draw_response: 响应和棋请求
 */
function handleDrawResponse(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  const accept = payload?.accept === true

  if (!rid) return

  const { accepted } = RoomManager.drawResponse(rid, ws.userId, accept)
  const room = RoomManager.getRoom(rid)
  if (!room) return

  if (accepted) {
    const ratingMap = RoomManager._getRatingResult(room)
    for (const [color, player] of Object.entries(room.players)) {
      if (!player || !player.socket) continue
      const myRating = ratingMap[player.userId] || {}
      send(player.socket, 'game_over', {
        winner: null,
        reason: 'draw',
        ratingDelta: myRating.ratingDelta || 0,
        newRating: myRating.newRating || null,
      }, rid)
    }
  } else {
    // 通知发起方被拒绝
    for (const [color, player] of Object.entries(room.players)) {
      if (player && player.userId !== ws.userId && player.socket) {
        send(player.socket, 'draw_rejected', {}, rid)
      }
    }
  }
}

/**
 * undo_request: 请求悔棋
 */
function handleUndoRequest(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  if (!rid) return

  const { ok, lastMove } = RoomManager.undoRequest(rid, ws.userId)
  if (!ok) {
    return send(ws, 'error', { code: 'INVALID_MOVE', message: '无法悔棋' })
  }

  const room = RoomManager.getRoom(rid)
  if (!room) return

  // 通知对方有悔棋请求
  for (const [color, player] of Object.entries(room.players)) {
    if (player && player.userId !== ws.userId && player.socket) {
      send(player.socket, 'undo_requested', { moveData: lastMove }, rid)
    }
  }
}

/**
 * undo_response: 响应悔棋请求
 */
function handleUndoResponse(ws, payload, roomId) {
  const rid = roomId || payload?.roomId
  const accept = payload?.accept === true

  if (!rid) return

  const result = RoomManager.undoResponse(rid, ws.userId, accept)
  const room = RoomManager.getRoom(rid)
  if (!room) return

  if (result.accepted) {
    broadcast(room, 'undo_accepted', {
      boardState: result.newBoardState,
      currentTurn: result.currentTurn,
    })
  } else {
    // 通知发起方被拒绝
    for (const [color, player] of Object.entries(room.players)) {
      if (player && player.userId !== ws.userId && player.socket) {
        send(player.socket, 'undo_rejected', {}, rid)
      }
    }
  }
}

/**
 * ping: 心跳
 */
function handlePing(ws) {
  ws._lastPing = Date.now()
  send(ws, 'pong')
}

// ===== 主路由表 =====
const handlers = {
  auth:          handleAuth,
  join_queue:    handleJoinQueue,
  leave_queue:   handleLeaveQueue,
  create_room:   handleCreateRoom,
  join_room:     handleJoinRoom,
  leave_room:    handleLeaveRoom,
  ready:         handleReady,
  move:          handleMove,
  resign:        handleResign,
  draw_offer:    handleDrawOffer,
  draw_response: handleDrawResponse,
  undo_request:  handleUndoRequest,
  undo_response: handleUndoResponse,
  ping:          handlePing,
}

// ===== WebSocket 服务主类 =====

class WSServer {
  /**
   * @param {http.Server} httpServer
   */
  constructor(httpServer) {
    this.wss = new WebSocket.Server({ server: httpServer, path: '/ws' })
    // userId -> WebSocket（已鉴权连接）
    this.connections = new Map()

    // 注入 send/broadcast 到 RoomManager 和 MatchmakingEngine
    RoomManager.injectWS(send, broadcast)
    MatchmakingEngine.injectSend(send)

    this.wss.on('connection', (ws, req) => this._onConnection(ws, req))

    // 心跳检测：每 30s 检查一次，90s 无消息断开
    this._heartbeatInterval = setInterval(() => this._checkHeartbeat(), 30 * 1000)

    console.log('[WS] WebSocket 服务已启动，路径: /ws')
  }

  /**
   * 新连接建立
   */
  _onConnection(ws, req) {
    ws.isAuthenticated = false
    ws._lastPing = Date.now()
    ws.userId = null
    ws.nickname = null

    ws.on('message', (raw) => this._onMessage(ws, raw))
    ws.on('close', () => this._onClose(ws))
    ws.on('error', (err) => this._onError(ws, err))

    // 10s 内未鉴权则断开
    ws._authTimeout = setTimeout(() => {
      if (!ws.isAuthenticated) {
        send(ws, 'auth_fail', { reason: '鉴权超时' })
        ws.terminate()
      }
    }, AUTH_TIMEOUT)
  }

  /**
   * 收到消息
   */
  _onMessage(ws, raw) {
    ws._lastPing = Date.now()

    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      send(ws, 'error', { code: 'PARSE_ERROR', message: '消息格式错误，需要 JSON' })
      return
    }

    const { type, roomId, payload } = msg

    if (!type || typeof type !== 'string') {
      send(ws, 'error', { code: 'PARSE_ERROR', message: '缺少消息类型 type' })
      return
    }

    // 未鉴权时只允许 auth 和 ping
    if (!ws.isAuthenticated) {
      if (type === 'auth') {
        handleAuth(ws, payload, this.connections)
      } else if (type === 'ping') {
        send(ws, 'pong')
      } else {
        send(ws, 'auth_fail', { reason: '请先鉴权' })
      }
      return
    }

    const handler = handlers[type]
    if (!handler) {
      send(ws, 'error', { code: 'PARSE_ERROR', message: `未知消息类型: ${type}` })
      return
    }

    try {
      handler(ws, payload, roomId, this.connections)
    } catch (err) {
      console.error(`[WS] handler[${type}] 异常:`, err)
      send(ws, 'error', { code: 'INTERNAL_ERROR', message: '服务器内部错误' })
    }
  }

  /**
   * 连接关闭
   */
  _onClose(ws) {
    if (ws._authTimeout) {
      clearTimeout(ws._authTimeout)
      ws._authTimeout = null
    }

    if (!ws.isAuthenticated || !ws.userId) return

    this.connections.delete(ws.userId)

    // 从匹配队列移除
    MatchmakingEngine.dequeue(ws.userId)

    // 处理房间断线
    const roomId = RoomManager.getUserRoom(ws.userId)
    if (roomId) {
      RoomManager.playerDisconnect(roomId, ws.userId)
    }
  }

  /**
   * 连接错误
   */
  _onError(ws, err) {
    console.error('[WS] 连接错误:', err.message)
  }

  /**
   * 心跳检测：关闭超时连接
   */
  _checkHeartbeat() {
    const now = Date.now()
    for (const ws of this.wss.clients) {
      if (now - ws._lastPing > HEARTBEAT_TIMEOUT) {
        console.log(`[WS] 心跳超时，断开连接: userId=${ws.userId}`)
        ws.terminate()
      }
    }
  }

  /**
   * 关闭服务
   */
  close() {
    clearInterval(this._heartbeatInterval)
    this.wss.close()
  }
}

// ===== 辅助函数 =====

/**
 * 序列化房间状态（去除 socket 引用，用于下行消息）
 */
function _serializeRoom(room, viewerUserId) {
  const players = {}
  for (const [color, player] of Object.entries(room.players)) {
    if (!player) continue
    players[color] = {
      userId: player.userId,
      nickname: player.nickname,
      rating: player.rating,
      connected: player.connected,
      ready: player.ready,
      timeLeft: player.timeLeft,
    }
  }

  return {
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    gameType: room.gameType,
    mode: room.mode,
    status: room.status,
    players,
    boardState: room.boardState,
    currentTurn: room.currentTurn,
    moveCount: room.moveCount,
    myColor: Object.entries(room.players).find(([, p]) => p?.userId === viewerUserId)?.[0],
  }
}

/**
 * 获取用户在指定游戏类型的积分
 */
function _getUserRating(userId, gameType) {
  const user = UserModel.findById(userId)
  if (!user) return 1000
  if (gameType === 'gomoku') return user.rating_gomoku
  if (gameType === 'chinese-chess') return user.rating_chess
  return 1000
}

module.exports = WSServer
