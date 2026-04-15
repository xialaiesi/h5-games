'use strict'

const express = require('express')
const router = express.Router()
const UserModel = require('../models/UserModel')

const VALID_GAME_TYPES = ['gomoku', 'chinese-chess']

/**
 * GET /api/leaderboard/:gameType
 * 获取指定游戏类型的积分排行榜
 * Query: ?limit=10
 */
router.get('/:gameType', (req, res, next) => {
  try {
    const { gameType } = req.params
    if (!VALID_GAME_TYPES.includes(gameType)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_GAME_TYPE', message: '游戏类型无效' },
      })
    }

    const limit = Math.min(parseInt(req.query.limit) || 10, 100)
    const players = UserModel.getLeaderboard(gameType, limit)

    const data = players.map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      nickname: p.nickname,
      avatar: p.avatar,
      rating: p.rating,
      wins: p.wins || 0,
      losses: p.losses || 0,
      draws: p.draws || 0,
    }))

    res.json({ ok: true, data })
  } catch (err) {
    next(err)
  }
})

module.exports = router
