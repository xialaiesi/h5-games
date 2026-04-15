'use strict'

const RoomManager = require('./RoomManager')

const MATCHMAKING_INTERVAL = 2000   // 匹配轮询间隔（毫秒）
const WIDEN_TIME1 = 15 * 1000       // 15s 扩大到 ±500
const WIDEN_TIME2 = 30 * 1000       // 30s 不限积分差
const THRESHOLD_NARROW = 200        // 精准匹配积分差
const THRESHOLD_WIDE = 500          // 宽松匹配积分差

/**
 * 匹配引擎
 * 维护各游戏类型和模式的匹配队列，每 2 秒执行一次匹配
 */
class MatchmakingEngine {
  constructor() {
    // `${gameType}:${mode}` -> QueueEntry[]
    this.queues = new Map()
    // userId -> QueueEntry（快速反查）
    this.userQueue = new Map()
    this.interval = null
    // WebSocket send 函数，由 ws.js 注入
    this._send = null
  }

  /**
   * 注入 WebSocket send 函数
   */
  injectSend(send) {
    this._send = send
  }

  /**
   * 启动定时匹配（每 2 秒执行一次）
   */
  start() {
    if (this.interval) return
    this.interval = setInterval(() => this._tick(), MATCHMAKING_INTERVAL)
    console.log('[Matchmaking] 匹配引擎已启动')
  }

  /**
   * 停止匹配引擎
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /**
   * 玩家加入匹配队列
   * @param {{ userId, nickname, socket, rating, gameType, mode }} entry
   * @returns {{ position: number }}
   */
  enqueue({ userId, nickname, socket, rating, gameType, mode }) {
    if (this.userQueue.has(userId)) {
      const err = new Error('已在匹配队列中')
      err.code = 'ALREADY_IN_QUEUE'
      throw err
    }

    const key = `${gameType}:${mode}`
    if (!this.queues.has(key)) {
      this.queues.set(key, [])
    }

    const entry = {
      userId,
      nickname,
      socket,
      rating: rating || 1000,
      gameType,
      mode,
      joinedAt: Date.now(),
    }

    this.queues.get(key).push(entry)
    this.userQueue.set(userId, entry)

    const position = this.queues.get(key).length
    return { position }
  }

  /**
   * 玩家离开匹配队列
   * @param {string} userId
   * @returns {boolean} 是否成功移除
   */
  dequeue(userId) {
    const entry = this.userQueue.get(userId)
    if (!entry) return false

    const key = `${entry.gameType}:${entry.mode}`
    const queue = this.queues.get(key)
    if (queue) {
      const idx = queue.findIndex(e => e.userId === userId)
      if (idx !== -1) queue.splice(idx, 1)
    }

    this.userQueue.delete(userId)
    return true
  }

  /**
   * 获取玩家在队列中的位置
   */
  getPosition(userId, gameType, mode) {
    const key = `${gameType}:${mode}`
    const queue = this.queues.get(key)
    if (!queue) return -1
    return queue.findIndex(e => e.userId === userId) + 1
  }

  /**
   * 清理断线玩家的队列记录
   */
  removeBySocket(socket) {
    for (const [userId, entry] of this.userQueue.entries()) {
      if (entry.socket === socket) {
        this.dequeue(userId)
        break
      }
    }
  }

  // ===== 私有方法 =====

  /**
   * 定时匹配逻辑（每 2s 执行）
   */
  _tick() {
    for (const [key, queue] of this.queues.entries()) {
      if (queue.length < 2) continue

      let matched = false

      for (let i = 0; i < queue.length && !matched; i++) {
        const a = queue[i]
        const waitMs = Date.now() - a.joinedAt

        // 根据等待时长动态调整积分差阈值
        let threshold
        if (waitMs < WIDEN_TIME1) {
          threshold = THRESHOLD_NARROW
        } else if (waitMs < WIDEN_TIME2) {
          threshold = THRESHOLD_WIDE
        } else {
          threshold = Infinity  // 30s 后不限积分差
        }

        // 找分差最小的对手
        let bestJ = -1
        let bestDiff = Infinity

        for (let j = i + 1; j < queue.length; j++) {
          const b = queue[j]
          const diff = Math.abs(a.rating - b.rating)
          if (diff <= threshold && diff < bestDiff) {
            bestDiff = diff
            bestJ = j
          }
        }

        if (bestJ === -1) continue

        const b = queue[bestJ]

        // 从队列移除
        // 先移除 index 大的，避免 splice 后 index 错位
        queue.splice(bestJ, 1)
        queue.splice(i, 1)
        this.userQueue.delete(a.userId)
        this.userQueue.delete(b.userId)

        // 创建房间并通知双方
        this._createMatch(a, b)
        matched = true
        i--  // 调整 i，因为 i 位置已被删除
      }
    }
  }

  /**
   * 匹配成功，创建房间并通知双方
   */
  _createMatch(playerA, playerB) {
    try {
      // 创建房间（playerA 先手）
      const room = RoomManager.createRoom({
        gameType: playerA.gameType,
        mode: playerA.mode,
        player: {
          userId: playerA.userId,
          nickname: playerA.nickname,
          socket: playerA.socket,
          rating: playerA.rating,
        },
      })

      // playerB 加入房间
      RoomManager.joinRoom(room.roomId, {
        userId: playerB.userId,
        nickname: playerB.nickname,
        socket: playerB.socket,
        rating: playerB.rating,
      })

      // 通知双方匹配成功
      if (this._send) {
        this._send(playerA.socket, 'matched', {
          roomId: room.roomId,
          opponent: { nickname: playerB.nickname, rating: playerB.rating },
        })
        this._send(playerB.socket, 'matched', {
          roomId: room.roomId,
          opponent: { nickname: playerA.nickname, rating: playerA.rating },
        })
      }

      console.log(`[Matchmaking] 匹配成功: ${playerA.userId} vs ${playerB.userId} → 房间 ${room.roomId}`)
    } catch (err) {
      console.error('[Matchmaking] 创建对局失败:', err.message)
    }
  }
}

module.exports = new MatchmakingEngine()
