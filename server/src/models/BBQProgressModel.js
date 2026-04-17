'use strict'

const { queryOne, queryAll, execute } = require('../db')

class BBQProgressModel {
  async findByUserId(userId) {
    const row = await queryOne('SELECT * FROM user_bbq_progress WHERE user_id = ?', [userId])
    if (!row) return null

    return {
      ...row,
      coins: row.coins || 0,
      level_stars: JSON.parse(row.level_stars || '{}'),
    }
  }

  async create(userId) {
    const now = new Date().toISOString()
    await execute(
      `INSERT INTO user_bbq_progress (
         user_id, max_level, total_score, level_stars, coins, last_played, created_at, updated_at
       )
       VALUES (?, 1, 0, '{}', 0, ?, ?, ?)`,
      [userId, now, now, now]
    )

    return this.findByUserId(userId)
  }

  async getOrCreate(userId) {
    let progress = await this.findByUserId(userId)
    if (!progress) {
      progress = await this.create(userId)
    }
    return progress
  }

  async update(userId, { max_level, total_score, level_stars, coins, last_played }) {
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
    if (coins !== undefined) {
      fields.push('coins = ?')
      values.push(coins)
    }
    if (last_played !== undefined) {
      fields.push('last_played = ?')
      values.push(last_played)
    }

    if (fields.length === 0) return this.findByUserId(userId)

    fields.push('updated_at = ?')
    values.push(now, userId)

    await execute(`UPDATE user_bbq_progress SET ${fields.join(', ')} WHERE user_id = ?`, values)
    return this.findByUserId(userId)
  }

  async saveLevelComplete(userId, level, stars, score) {
    const now = new Date().toISOString()
    const progress = await this.getOrCreate(userId)

    const levelStars = { ...(progress.level_stars || {}) }
    const prevStars = levelStars[level] || 0
    if (stars > prevStars) {
      levelStars[level] = stars
    }

    const newMaxLevel = Math.min(50, Math.max(progress.max_level, level + 1))
    const newTotalScore = progress.total_score + score
    const coinReward = this._calcCoinReward(stars)
    const newCoins = (progress.coins || 0) + coinReward

    await this.update(userId, {
      max_level: newMaxLevel,
      total_score: newTotalScore,
      level_stars: levelStars,
      coins: newCoins,
      last_played: now,
    })

    return {
      ...(await this.findByUserId(userId)),
      coin_reward: coinReward,
    }
  }

  async getLeaderboard(limit = 20) {
    return queryAll(
      `SELECT
         u.id AS "userId",
         u.nickname,
         u.avatar,
         p.max_level,
         p.total_score
       FROM user_bbq_progress p
       JOIN users u ON u.id = p.user_id
       WHERE u.is_guest = 0
       ORDER BY p.total_score DESC
       LIMIT ?`,
      [limit]
    )
  }

  _calcCoinReward(stars) {
    return Math.max(0, stars) * 20
  }
}

module.exports = new BBQProgressModel()
