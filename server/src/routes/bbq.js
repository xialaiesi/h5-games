'use strict'

const express = require('express')
const router = express.Router()
const { verifyToken } = require('../middleware/auth')
const bbqProgressModel = require('../models/BBQProgressModel')

/**
 * 获取当前用户的烧烤游戏进度
 * GET /api/bbq/progress
 */
router.get('/progress', verifyToken, (req, res) => {
  try {
    const progress = bbqProgressModel.getOrCreate(req.user.userId)
    res.json({
      ok: true,
      data: {
        maxLevel:   progress.max_level,
        totalScore: progress.total_score,
        levelStars: progress.level_stars,
        lastPlayed: progress.last_played,
      },
    })
  } catch (err) {
    console.error('获取烧烤进度失败:', err)
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: '获取进度失败' } })
  }
})

/**
 * 保存关卡通关进度
 * POST /api/bbq/save
 */
router.post('/save', verifyToken, (req, res) => {
  try {
    const { level, stars, score } = req.body

    if (!level || typeof level !== 'number' || level < 1) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_LEVEL', message: '无效的关卡号' } })
    }
    if (!stars || typeof stars !== 'number' || stars < 1 || stars > 3) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_STARS', message: '无效的星级' } })
    }
    if (!score || typeof score !== 'number' || score < 0) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_SCORE', message: '无效的分数' } })
    }

    const progress = bbqProgressModel.saveLevelComplete(req.user.userId, level, stars, score)

    res.json({
      ok: true,
      data: {
        maxLevel:   progress.max_level,
        totalScore: progress.total_score,
        levelStars: progress.level_stars,
      },
    })
  } catch (err) {
    console.error('保存烧烤进度失败:', err)
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: '保存进度失败' } })
  }
})

/**
 * 获取烧烤游戏排行榜
 * GET /api/bbq/leaderboard
 */
router.get('/leaderboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const list = bbqProgressModel.getLeaderboard(limit)
    res.json({ ok: true, data: list })
  } catch (err) {
    console.error('获取烧烤排行榜失败:', err)
    res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: '获取排行榜失败' } })
  }
})

module.exports = router
