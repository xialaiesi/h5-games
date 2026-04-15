'use strict'

const { getDB } = require('../db')

/**
 * 房间数据模型
 * 封装 rooms 表的数据库操作（对局结束后持久化）
 */
class RoomModel {
  /**
   * 根据 ID 查询房间
   * @param {string} id
   * @returns {object|null}
   */
  findById(id) {
    return getDB().prepare('SELECT * FROM rooms WHERE id = ?').get(id) || null
  }

  /**
   * 根据邀请码查询房间
   * @param {string} inviteCode
   * @returns {object|null}
   */
  findByInviteCode(inviteCode) {
    return getDB().prepare('SELECT * FROM rooms WHERE invite_code = ?').get(inviteCode) || null
  }

  /**
   * 创建房间记录（等待玩家加入时写入）
   * @param {{ id, invite_code?, game_type, mode, player1_id, player1_color }} data
   */
  create({ id, invite_code = null, game_type, mode, player1_id, player1_color }) {
    const now = new Date().toISOString()
    getDB().prepare(`
      INSERT INTO rooms (id, invite_code, game_type, mode, status, player1_id, player1_color, created_at)
      VALUES (?, ?, ?, ?, 'waiting', ?, ?, ?)
    `).run(id, invite_code, game_type, mode, player1_id, player1_color, now)
  }

  /**
   * 玩家 2 加入房间（更新 player2 信息）
   * @param {string} id
   * @param {string} player2_id
   * @param {string} player2_color
   */
  playerJoin(id, player2_id, player2_color) {
    getDB().prepare(`
      UPDATE rooms SET player2_id = ?, player2_color = ?, status = 'playing', started_at = ?
      WHERE id = ?
    `).run(player2_id, player2_color, new Date().toISOString(), id)
  }

  /**
   * 对局结束，更新房间状态
   * @param {string} id
   * @param {{ winner_id?, end_reason, status }} data
   */
  finish(id, { winner_id = null, end_reason, status = 'finished' }) {
    getDB().prepare(`
      UPDATE rooms SET status = ?, winner_id = ?, end_reason = ?, finished_at = ?
      WHERE id = ?
    `).run(status, winner_id, end_reason, new Date().toISOString(), id)
  }

  /**
   * 查询对局详情（含双方用户信息）
   * @param {string} id
   * @returns {object|null}
   */
  getDetail(id) {
    return getDB().prepare(`
      SELECT
        r.*,
        u1.nickname AS player1_nickname,
        u2.nickname AS player2_nickname
      FROM rooms r
      LEFT JOIN users u1 ON u1.id = r.player1_id
      LEFT JOIN users u2 ON u2.id = r.player2_id
      WHERE r.id = ?
    `).get(id) || null
  }
}

module.exports = new RoomModel()
