'use strict'

const express = require('express')

const { verifyToken } = require('../middleware/auth')
const bbqProgressModel = require('../models/BBQProgressModel')

const router = express.Router()
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

router.get('/progress', verifyToken, asyncHandler(async (req, res) => {
  const progress = await bbqProgressModel.getOrCreate(req.user.userId)
  res.json({
    ok: true,
    data: {
      maxLevel: progress.max_level,
      totalScore: progress.total_score,
      levelStars: progress.level_stars,
      lastPlayed: progress.last_played,
      resources: {
        coins: progress.coins || 0,
      },
    },
  })
}))

router.post('/save', verifyToken, asyncHandler(async (req, res) => {
  const { level, stars, score } = req.body

  if (!level || typeof level !== 'number' || level < 1) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_LEVEL', message: '无效的关卡号' } })
  }
  if (!stars || typeof stars !== 'number' || stars < 1 || stars > 3) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_STARS', message: '无效的星级' } })
  }
  if (typeof score !== 'number' || score < 0) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_SCORE', message: '无效的分数' } })
  }

  const progress = await bbqProgressModel.saveLevelComplete(req.user.userId, level, stars, score)
  res.json({
    ok: true,
    data: {
      maxLevel: progress.max_level,
      totalScore: progress.total_score,
      levelStars: progress.level_stars,
      coinReward: progress.coin_reward || 0,
      resources: {
        coins: progress.coins || 0,
      },
    },
  })
}))

router.get('/leaderboard', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100)
  const list = await bbqProgressModel.getLeaderboard(limit)
  res.json({ ok: true, data: list })
}))

module.exports = router
