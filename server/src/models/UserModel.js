'use strict'

const { getDB } = require('../db')
const { v4: uuidv4 } = require('uuid')

/**
 * 用户数据模型
 * 封装 users 和 user_stats 表的所有数据库操作
 */
class UserModel {
  /**
   * 根据 ID 查询用户
   * @param {string} id
   * @returns {object|null}
   */
  findById(id) {
    return getDB().prepare('SELECT * FROM users WHERE id = ?').get(id) || null
  }

  /**
   * 根据邮箱查询用户
   * @param {string} email
   * @returns {object|null}
   */
  findByEmail(email) {
    return getDB().prepare('SELECT * FROM users WHERE email = ?').get(email) || null
  }

  /**
   * 创建新用户（同时初始化两种游戏的战绩记录）
   * @param {{ email, password_hash, nickname, avatar?, tenant_id? }} data
   * @returns {object} 新建的用户对象
   */
  create({ email, password_hash, nickname, avatar = null, tenant_id = null }) {
    const db = getDB()
    const id = uuidv4()
    const now = new Date().toISOString()

    const insertUser = db.prepare(`
      INSERT INTO users (id, email, password_hash, nickname, avatar, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertStats = db.prepare(`
      INSERT INTO user_stats (id, user_id, game_type)
      VALUES (?, ?, ?)
    `)

    // 事务保证用户和战绩同时写入
    db.transaction(() => {
      insertUser.run(id, email, password_hash, nickname, avatar, tenant_id, now, now)
      insertStats.run(uuidv4(), id, 'gomoku')
      insertStats.run(uuidv4(), id, 'chinese-chess')
    })()

    return this.findById(id)
  }

  /**
   * 更新用户资料（昵称/头像）
   * @param {string} id
   * @param {{ nickname?, avatar? }} data
   * @returns {object|null}
   */
  updateProfile(id, { nickname, avatar }) {
    const db = getDB()
    const now = new Date().toISOString()
    const fields = []
    const values = []

    if (nickname !== undefined) { fields.push('nickname = ?'); values.push(nickname) }
    if (avatar !== undefined)   { fields.push('avatar = ?');   values.push(avatar) }

    if (fields.length === 0) return this.findById(id)

    fields.push('updated_at = ?')
    values.push(now, id)

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)
  }

  /**
   * 更新用户积分
   * @param {string} id
   * @param {'gomoku'|'chinese-chess'} gameType
   * @param {number} newRating
   */
  updateRating(id, gameType, newRating) {
    const col = gameType === 'gomoku' ? 'rating_gomoku' : 'rating_chess'
    const now = new Date().toISOString()
    getDB().prepare(`UPDATE users SET ${col} = ?, updated_at = ? WHERE id = ?`)
      .run(newRating, now, id)
  }

  /**
   * 查询用户的所有游戏战绩
   * @param {string} userId
   * @returns {object} { gomoku: {...}, 'chinese-chess': {...} }
   */
  getStats(userId) {
    const rows = getDB().prepare('SELECT * FROM user_stats WHERE user_id = ?').all(userId)
    const stats = {}
    for (const row of rows) {
      stats[row.game_type] = {
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        total_games: row.total_games,
      }
    }
    return stats
  }

  /**
   * 更新用户战绩统计
   * @param {string} userId
   * @param {'gomoku'|'chinese-chess'} gameType
   * @param {'win'|'loss'|'draw'} result
   */
  updateStats(userId, gameType, result) {
    const db = getDB()
    const colMap = { win: 'wins', loss: 'losses', draw: 'draws' }
    const col = colMap[result]
    if (!col) return

    db.prepare(`
      UPDATE user_stats
      SET ${col} = ${col} + 1, total_games = total_games + 1
      WHERE user_id = ? AND game_type = ?
    `).run(userId, gameType)
  }

  /**
   * 查询用户对局记录（分页）
   * @param {string} userId
   * @param {{ gameType?, page?, limit? }} options
   * @returns {{ records: object[], total: number }}
   */
  getRecords(userId, { gameType = null, page = 1, limit = 20 } = {}) {
    const db = getDB()
    const offset = (page - 1) * limit

    let where = '(r.player1_id = ? OR r.player2_id = ?) AND r.status = \'finished\''
    const params = [userId, userId]

    if (gameType) {
      where += ' AND r.game_type = ?'
      params.push(gameType)
    }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM rooms r WHERE ${where}`)
      .get(...params).cnt

    const records = db.prepare(`
      SELECT
        r.id AS roomId,
        r.game_type AS gameType,
        r.mode,
        r.winner_id AS winnerId,
        r.end_reason AS endReason,
        r.finished_at AS finishedAt,
        CASE WHEN r.player1_id = ? THEN r.player2_id ELSE r.player1_id END AS opponentId,
        u.nickname AS opponentNickname,
        (SELECT COUNT(*) FROM game_moves WHERE room_id = r.id) AS moveCount,
        rl.delta AS ratingDelta
      FROM rooms r
      LEFT JOIN users u ON u.id = (CASE WHEN r.player1_id = ? THEN r.player2_id ELSE r.player1_id END)
      LEFT JOIN rating_logs rl ON rl.room_id = r.id AND rl.user_id = ?
      WHERE ${where}
      ORDER BY r.finished_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, userId, userId, ...params, limit, offset)

    return {
      records: records.map(rec => ({
        ...rec,
        result: rec.winnerId === null
          ? 'draw'
          : rec.winnerId === userId ? 'win' : 'loss',
      })),
      total,
      page,
    }
  }

  /**
   * 获取排行榜
   * @param {'gomoku'|'chinese-chess'} gameType
   * @param {number} limit
   * @returns {object[]}
   */
  getLeaderboard(gameType, limit = 10) {
    const col = gameType === 'gomoku' ? 'rating_gomoku' : 'rating_chess'
    return getDB().prepare(`
      SELECT
        u.id AS userId,
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
      LIMIT ?
    `).all(gameType, limit)
  }
}

module.exports = new UserModel()
