'use strict'

const { getDB } = require('../db')

/**
 * 走棋步骤数据模型
 * 封装 game_moves 表的数据库操作
 */
class MoveModel {
  /**
   * 批量写入对局步骤（对局结束后一次性持久化）
   * @param {string} roomId
   * @param {Array<{ userId, moveData, timeSpent, timestamp }>} moves
   */
  bulkInsert(roomId, moves) {
    const db = getDB()
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO game_moves (room_id, move_number, player_id, move_data, time_spent, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    db.transaction(() => {
      moves.forEach((move, index) => {
        stmt.run(
          roomId,
          index + 1,
          move.userId,
          JSON.stringify(move.moveData),
          move.timeSpent || null,
          new Date(move.timestamp || Date.now()).toISOString()
        )
      })
    })()
  }

  /**
   * 查询指定房间的全部步骤
   * @param {string} roomId
   * @returns {object[]}
   */
  findByRoomId(roomId) {
    return getDB().prepare(`
      SELECT id, room_id, move_number, player_id, move_data, time_spent, created_at
      FROM game_moves
      WHERE room_id = ?
      ORDER BY move_number ASC
    `).all(roomId).map(row => ({
      ...row,
      moveData: JSON.parse(row.move_data),
    }))
  }
}

module.exports = new MoveModel()
