'use strict'

const express = require('express')
const router = express.Router()
const UserModel = require('../models/UserModel')
const { verifyToken } = require('../middleware/auth')

/**
 * GET /api/users/me
 * 获取当前用户完整信息（含战绩）
 */
router.get('/me', verifyToken, (req, res, next) => {
  try {
    const user = UserModel.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
      })
    }

    const stats = UserModel.getStats(user.id)
    const { password_hash, ...pub } = user

    res.json({
      ok: true,
      data: { ...pub, stats },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /api/users/me
 * 修改昵称/头像
 */
router.patch('/me', verifyToken, (req, res, next) => {
  try {
    const { nickname, avatar } = req.body

    // 参数校验
    if (nickname !== undefined) {
      if (typeof nickname !== 'string' || nickname.length < 2 || nickname.length > 12) {
        return res.status(400).json({
          ok: false,
          error: { code: 'INVALID_NICKNAME', message: '昵称长度须在 2~12 字符之间' },
        })
      }
    }

    const updated = UserModel.updateProfile(req.user.userId, { nickname, avatar })
    if (!updated) {
      return res.status(404).json({
        ok: false,
        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
      })
    }

    const { password_hash, ...pub } = updated
    res.json({ ok: true, data: pub })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/users/:id
 * 获取指定用户公开信息
 */
router.get('/:id', (req, res, next) => {
  try {
    const user = UserModel.findById(req.params.id)
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: 'USER_NOT_FOUND', message: '用户不存在' },
      })
    }

    const stats = UserModel.getStats(user.id)
    // 返回公开信息，不含敏感字段
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
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/users/:id/records
 * 获取用户对局记录（分页）
 * Query: ?gameType=gomoku&page=1&limit=20
 */
router.get('/:id/records', (req, res, next) => {
  try {
    const { gameType, page, limit } = req.query
    const result = UserModel.getRecords(req.params.id, {
      gameType: gameType || null,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 100),
    })
    res.json({ ok: true, data: result })
  } catch (err) {
    next(err)
  }
})

module.exports = router
