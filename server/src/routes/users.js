'use strict'

const express = require('express')

const UserModel = require('../models/UserModel')
const bbqProgressModel = require('../models/BBQProgressModel')
const { verifyToken } = require('../middleware/auth')

const router = express.Router()
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user.userId)
  if (!user) {
    return res.status(404).json({
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
    })
  }

  const stats = await UserModel.getStats(user.id)
  const bbq = await bbqProgressModel.getOrCreate(user.id)
  const { password_hash, ...pub } = user

  res.json({
    ok: true,
    data: {
      ...pub,
      createdAt: pub.created_at,
      updatedAt: pub.updated_at,
      stats,
      bbq: {
        maxLevel: bbq.max_level,
        totalScore: bbq.total_score,
        levelStars: bbq.level_stars,
        lastPlayed: bbq.last_played,
        resources: {
          coins: bbq.coins || 0,
        },
      },
    },
  })
}))

router.patch('/me', verifyToken, asyncHandler(async (req, res) => {
  const { nickname, avatar } = req.body

  if (nickname !== undefined) {
    if (typeof nickname !== 'string' || nickname.length < 2 || nickname.length > 12) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_NICKNAME', message: '昵称长度须在 2~12 字符之间' },
      })
    }
  }

  const updated = await UserModel.updateProfile(req.user.userId, { nickname, avatar })
  if (!updated) {
    return res.status(404).json({
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
    })
  }

  const { password_hash, ...pub } = updated
  res.json({ ok: true, data: pub })
}))

router.get('/me/records', verifyToken, asyncHandler(async (req, res) => {
  const { gameType, page, limit } = req.query
  const result = await UserModel.getRecords(req.user.userId, {
    gameType: gameType || null,
    page: parseInt(page, 10) || 1,
    limit: Math.min(parseInt(limit, 10) || 20, 100),
  })
  res.json({ ok: true, data: result })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.params.id)
  if (!user) {
    return res.status(404).json({
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
    })
  }

  const stats = await UserModel.getStats(user.id)
  res.json({
    ok: true,
    data: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      rating_gomoku: user.rating_gomoku,
      rating_chess: user.rating_chess,
      created_at: user.created_at,
      stats,
    },
  })
}))

router.get('/:id/records', asyncHandler(async (req, res) => {
  const { gameType, page, limit } = req.query
  const result = await UserModel.getRecords(req.params.id, {
    gameType: gameType || null,
    page: parseInt(page, 10) || 1,
    limit: Math.min(parseInt(limit, 10) || 20, 100),
  })
  res.json({ ok: true, data: result })
}))

module.exports = router
