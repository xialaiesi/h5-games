'use strict'

const { queryOne, execute } = require('../db')

class RoomModel {
  async findById(id) {
    return queryOne('SELECT * FROM rooms WHERE id = ?', [id])
  }

  async findByInviteCode(inviteCode) {
    return queryOne('SELECT * FROM rooms WHERE invite_code = ?', [inviteCode])
  }

  async create({ id, invite_code = null, game_type, mode, player1_id, player1_color }) {
    const now = new Date().toISOString()
    await execute(
      `INSERT INTO rooms (id, invite_code, game_type, mode, status, player1_id, player1_color, created_at)
       VALUES (?, ?, ?, ?, 'waiting', ?, ?, ?)`,
      [id, invite_code, game_type, mode, player1_id, player1_color, now]
    )
  }

  async playerJoin(id, player2_id, player2_color) {
    await execute(
      `UPDATE rooms
       SET player2_id = ?, player2_color = ?, status = 'playing', started_at = ?
       WHERE id = ?`,
      [player2_id, player2_color, new Date().toISOString(), id]
    )
  }

  async finish(id, { winner_id = null, end_reason, status = 'finished' }) {
    await execute(
      `UPDATE rooms
       SET status = ?, winner_id = ?, end_reason = ?, finished_at = ?
       WHERE id = ?`,
      [status, winner_id, end_reason, new Date().toISOString(), id]
    )
  }

  async getDetail(id) {
    return queryOne(
      `SELECT
         r.*,
         u1.nickname AS player1_nickname,
         u2.nickname AS player2_nickname
       FROM rooms r
       LEFT JOIN users u1 ON u1.id = r.player1_id
       LEFT JOIN users u2 ON u2.id = r.player2_id
       WHERE r.id = ?`,
      [id]
    )
  }
}

module.exports = new RoomModel()
