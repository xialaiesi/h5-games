'use strict'

const { v4: uuidv4 } = require('uuid')

const { queryOne, queryAll, execute, withTransaction } = require('../db')

class UserModel {
  async findById(id) {
    return queryOne('SELECT * FROM users WHERE id = ?', [id])
  }

  async findByEmail(email) {
    return queryOne('SELECT * FROM users WHERE email = ?', [email])
  }

  async findByPhone(phone) {
    return queryOne('SELECT * FROM users WHERE phone = ?', [phone])
  }

  async create({ email = null, phone = null, password_hash, nickname, avatar = null, tenant_id = null }) {
    const id = uuidv4()
    const now = new Date().toISOString()

    await withTransaction(async db => {
      await db.exec(
        `INSERT INTO users (id, email, phone, password_hash, nickname, avatar, tenant_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, email, phone, password_hash, nickname, avatar, tenant_id, now, now]
      )

      await db.exec(
        'INSERT INTO user_stats (id, user_id, game_type) VALUES (?, ?, ?)',
        [uuidv4(), id, 'gomoku']
      )
      await db.exec(
        'INSERT INTO user_stats (id, user_id, game_type) VALUES (?, ?, ?)',
        [uuidv4(), id, 'chinese-chess']
      )
    })

    return this.findById(id)
  }

  async updateProfile(id, { nickname, avatar }) {
    const now = new Date().toISOString()
    const fields = []
    const values = []

    if (nickname !== undefined) {
      fields.push('nickname = ?')
      values.push(nickname)
    }
    if (avatar !== undefined) {
      fields.push('avatar = ?')
      values.push(avatar)
    }

    if (fields.length === 0) return this.findById(id)

    fields.push('updated_at = ?')
    values.push(now, id)

    await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
    return this.findById(id)
  }

  async updateRating(id, gameType, newRating) {
    const col = gameType === 'gomoku' ? 'rating_gomoku' : 'rating_chess'
    const now = new Date().toISOString()
    await execute(`UPDATE users SET ${col} = ?, updated_at = ? WHERE id = ?`, [newRating, now, id])
  }

  async updatePassword(id, passwordHash) {
    const now = new Date().toISOString()
    await execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash, now, id])
    return this.findById(id)
  }

  async getStats(userId) {
    const user = await this.findById(userId)
    const rows = await queryAll('SELECT * FROM user_stats WHERE user_id = ?', [userId])

    const stats = {
      gomoku: {
        wins: 0,
        losses: 0,
        draws: 0,
        total_games: 0,
        rating: user?.rating_gomoku || 1000,
      },
      'chinese-chess': {
        wins: 0,
        losses: 0,
        draws: 0,
        total_games: 0,
        rating: user?.rating_chess || 1000,
      },
    }

    for (const row of rows) {
      stats[row.game_type] = {
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        total_games: row.total_games,
        rating: row.game_type === 'gomoku'
          ? (user?.rating_gomoku || 1000)
          : (user?.rating_chess || 1000),
      }
    }

    return stats
  }

  async updateStats(userId, gameType, result) {
    const colMap = { win: 'wins', loss: 'losses', draw: 'draws' }
    const col = colMap[result]
    if (!col) return

    await execute(
      `UPDATE user_stats
       SET ${col} = ${col} + 1, total_games = total_games + 1
       WHERE user_id = ? AND game_type = ?`,
      [userId, gameType]
    )
  }

  async getRecords(userId, { gameType = null, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit
    let where = "(r.player1_id = ? OR r.player2_id = ?) AND r.status = 'finished'"
    const params = [userId, userId]

    if (gameType) {
      where += ' AND r.game_type = ?'
      params.push(gameType)
    }

    const totalRow = await queryOne(`SELECT COUNT(*) AS cnt FROM rooms r WHERE ${where}`, params)
    const total = parseInt(totalRow?.cnt || '0', 10)

    const records = await queryAll(
      `SELECT
         r.id AS "roomId",
         r.game_type AS "gameType",
         r.mode,
         r.winner_id AS "winnerId",
         r.end_reason AS "endReason",
         r.finished_at AS "finishedAt",
         CASE WHEN r.player1_id = ? THEN r.player2_id ELSE r.player1_id END AS "opponentId",
         u.nickname AS "opponentNickname",
         (SELECT COUNT(*) FROM game_moves WHERE room_id = r.id) AS "moveCount",
         rl.delta AS "ratingDelta"
       FROM rooms r
       LEFT JOIN users u ON u.id = (CASE WHEN r.player1_id = ? THEN r.player2_id ELSE r.player1_id END)
       LEFT JOIN rating_logs rl ON rl.room_id = r.id AND rl.user_id = ?
       WHERE ${where}
       ORDER BY r.finished_at DESC
       LIMIT ? OFFSET ?`,
      [userId, userId, userId, ...params, limit, offset]
    )

    return {
      records: records.map(record => ({
        ...record,
        moveCount: parseInt(record.moveCount || '0', 10),
        result: record.winnerId === null
          ? 'draw'
          : record.winnerId === userId ? 'win' : 'loss',
      })),
      total,
      page,
    }
  }

  async getLeaderboard(gameType, limit = 10) {
    const col = gameType === 'gomoku' ? 'rating_gomoku' : 'rating_chess'
    return queryAll(
      `SELECT
         u.id AS "userId",
         u.nickname,
         u.avatar,
         u.${col} AS rating,
         s.wins,
         s.losses,
         s.draws
       FROM users u
       LEFT JOIN user_stats s ON s.user_id = u.id AND s.game_type = ?
       WHERE u.is_guest = 0
       ORDER BY u.${col} DESC
       LIMIT ?`,
      [gameType, limit]
    )
  }
}

module.exports = new UserModel()
