'use strict'

const { getDB } = require('../db')

class BBQProgressModel {
  /**
   * 获取用户的烧烤游戏进度
   * @param {string} userId
   * @returns {object|null}
   */
  findByUserId(userId) {
    const row = getDB().prepare('SELECT * FROM user_bbq_progress WHERE user_id = ?').get(userId)
    if (!row) return null
    return {
      ...row,
      level_stars: JSON.parse(row.level_stars || '{}'),
    }
  }

  /**
   * 创建用户烧烤进度（首次进入游戏时调用）
   * @param {string} userId
   * @returns {object}
   */
  create(userId) {
    const db = getDB()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO user_bbq_progress (user_id, max_level, total_score, level_stars, last_played, created_at, updated_at)
      VALUES (?, 1, 0, '{}', ?, ?, ?)
    `).run(userId, now, now, now)

    return this.findByUserId(userId)
  }

  /**
   * 获取或创建用户烧烤进度
   * @param {string} userId
   * @returns {object}
   */
  getOrCreate(userId) {
    let progress = this.findByUserId(userId)
    if (!progress) {
      progress = this.create(userId)
    }
    return progress
  }

  /**
   * 更新用户烧烤进度
   * @param {string} userId
   * @param {{ max_level?, total_score?, level_stars?, last_played? }} data
   * @returns {object|null}
   */
  update(userId, { max_level, total_score, level_stars, last_played }) {
    const db = getDB()
    const now = new Date().toISOString()
    const fields = []
    const values = []

    if (max_level !== undefined) {
      fields.push('max_level = ?')
      values.push(max_level)
    }
    if (total_score !== undefined) {
      fields.push('total_score = ?')
      values.push(total_score)
    }
    if (level_stars !== undefined) {
      fields.push('level_stars = ?')
      values.push(JSON.stringify(level_stars))
    }
    if (last_played !== undefined) {
      fields.push('last_played = ?')
      values.push(last_played)
    }

    if (fields.length === 0) return this.findByUserId(userId)

    fields.push('updated_at = ?')
    values.push(now, userId)

    db.prepare(`UPDATE user_bbq_progress SET ${fields.join(', ')} WHERE user_id = ?`).run(...values)
    return this.findByUserId(userId)
  }

  /**
   * 保存关卡通关进度
   * @param {string} userId
   * @param {number} level
   * @param {number} stars
   * @param {number} score
   */
  saveLevelComplete(userId, level, stars, score) {
    const db = getDB()
    const now = new Date().toISOString()
    
    const progress = this.getOrCreate(userId)
    
    let levelStars = progress.level_stars || {}
    const prevStars = levelStars[level] || 0
    if (stars > prevStars) {
      levelStars[level] = stars
    }

    const newMaxLevel = Math.max(progress.max_level, level + 1)
    const newTotalScore = progress.total_score + score

    this.update(userId, {
      max_level: newMaxLevel,
      total_score: newTotalScore,
      level_stars: levelStars,
      last_played: now,
    })

    return this.findByUserId(userId)
  }

  /**
   * 获取烧烤游戏排行榜（按总分）
   * @param {number} limit
   * @returns {object[]}
   */
  getLeaderboard(limit = 20) {
    return getDB().prepare(`
      SELECT 
        u.id AS userId,
        u.nickname,
        u.avatar,
        p.max_level,
        p.total_score
      FROM user_bbq_progress p
      JOIN users u ON u.id = p.user_id
      WHERE u.is_guest = 0
      ORDER BY p.total_score DESC
      LIMIT ?
    `).all(limit)
  }
}

module.exports = new BBQProgressModel()
