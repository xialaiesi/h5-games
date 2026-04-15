'use strict'

const STEP_TIME_LIMIT = 60      // 每步时限（秒）
const WARNING_AT = 10           // 剩余多少秒时发 warning
const RECONNECT_WAIT = 60       // 断线等待秒数

/**
 * 计时器管理服务
 * 管理每步操作的倒计时和断线重连计时器
 */
class TimerManager {
  /**
   * 启动当前行棋方的步骤倒计时
   * @param {object} room - RoomState 对象（内存）
   * @param {Function} onWarning - (room, secondsLeft) => void
   * @param {Function} onTimeout - (room) => void
   */
  startStepTimer(room, onWarning, onTimeout) {
    this.stopStepTimer(room)

    const currentPlayer = room.players[room.currentTurn]
    if (!currentPlayer) return

    // 初始化剩余时间（若未设置）
    if (currentPlayer.timeLeft === undefined || currentPlayer.timeLeft === null) {
      currentPlayer.timeLeft = STEP_TIME_LIMIT
    }

    let warned = false
    room._stepTimerStart = Date.now()

    room.stepTimer = setInterval(() => {
      currentPlayer.timeLeft -= 1

      // 剩余 10 秒发送 warning
      if (currentPlayer.timeLeft <= WARNING_AT && !warned) {
        warned = true
        if (typeof onWarning === 'function') {
          onWarning(room, currentPlayer.timeLeft)
        }
      }

      // 超时
      if (currentPlayer.timeLeft <= 0) {
        this.stopStepTimer(room)
        if (typeof onTimeout === 'function') {
          onTimeout(room)
        }
      }
    }, 1000)
  }

  /**
   * 停止步骤倒计时（走棋后调用）
   * @param {object} room
   * @returns {number} 本步实际耗时（秒）
   */
  stopStepTimer(room) {
    if (room.stepTimer) {
      clearInterval(room.stepTimer)
      room.stepTimer = null
    }
    // 返回耗时
    if (room._stepTimerStart) {
      const elapsed = Math.round((Date.now() - room._stepTimerStart) / 1000)
      room._stepTimerStart = null
      return elapsed
    }
    return 0
  }

  /**
   * 启动断线等待计时器（60s 后判负）
   * @param {object} room
   * @param {string} userId - 断线玩家的 userId
   * @param {Function} onTimeout - () => void
   */
  startReconnectTimer(room, userId, onTimeout) {
    this.stopReconnectTimer(room)
    room._reconnectUserId = userId
    room.reconnectTimer = setTimeout(() => {
      room.reconnectTimer = null
      room._reconnectUserId = null
      if (typeof onTimeout === 'function') {
        onTimeout()
      }
    }, RECONNECT_WAIT * 1000)
  }

  /**
   * 停止断线等待计时器（重连后调用）
   * @param {object} room
   */
  stopReconnectTimer(room) {
    if (room.reconnectTimer) {
      clearTimeout(room.reconnectTimer)
      room.reconnectTimer = null
      room._reconnectUserId = null
    }
  }

  /**
   * 暂停步骤计时器（断线时暂停）
   * @param {object} room
   */
  pauseStepTimer(room) {
    if (room.stepTimer) {
      clearInterval(room.stepTimer)
      room.stepTimer = null
      // 记录暂停时剩余时间，不重置 timeLeft
    }
  }
}

module.exports = new TimerManager()
