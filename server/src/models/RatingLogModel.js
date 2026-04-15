'use strict'

const { getDB } = require('../db')

/**
 * 积分变动记录数据模型
 * 封装 rating_logs 表的数据库操作
 */
class RatingLogModel {
  /**
   * 写入积分变动记录
   * @param {{ userId, roomId, gameType, ratingBefore, ratingAfter, delta }} data
   */
  insert({ userId, roomId, gameType, ratingBefore, ratingAfter, delta }) {
    const now = new Date().toISOString()
    getDB().prepare(`
      INSERT INTO rating_logs (user_id, room_id, game_type, rating_before, rating_after, delta, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, roomId, gameType, ratingBefore, ratingAfter, delta, now)
  }

  /**
   * 查询用户的积分变动记录
   * @param {string} userId
   * @param {number} limit
   * @returns {object[]}
   */
  findByUserId(userId, limit = 50) {
    return getDB().prepare(`
      SELECT * FROM rating_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit)
  }

  /**
   * 查询某场对局双方的积分变动
   * @param {string} roomId
   * @returns {object[]}
   */
  findByRoomId(roomId) {
    return getDB().prepare(`
      SELECT rl.*, u.nickname
      FROM rating_logs rl
      LEFT JOIN users u ON u.id = rl.user_id
      WHERE rl.room_id = ?
    `).all(roomId)
  }
}

module.exports = new RatingLogModel()
