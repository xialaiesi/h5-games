'use strict'

const { queryAll, execute } = require('../db')

class RatingLogModel {
  async insert({ userId, roomId, gameType, ratingBefore, ratingAfter, delta }) {
    const now = new Date().toISOString()
    await execute(
      `INSERT INTO rating_logs (user_id, room_id, game_type, rating_before, rating_after, delta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, roomId, gameType, ratingBefore, ratingAfter, delta, now]
    )
  }

  async findByUserId(userId, limit = 50) {
    return queryAll(
      'SELECT * FROM rating_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    )
  }

  async findByRoomId(roomId) {
    return queryAll(
      `SELECT rl.*, u.nickname
       FROM rating_logs rl
       LEFT JOIN users u ON u.id = rl.user_id
       WHERE rl.room_id = ?`,
      [roomId]
    )
  }
}

module.exports = new RatingLogModel()
