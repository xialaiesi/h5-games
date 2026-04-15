'use strict'

const express = require('express')
const router = express.Router()
const AuthService = require('../services/AuthService')
const { verifyToken } = require('../middleware/auth')
const { authLimiter } = require('../middleware/rateLimiter')

/**
 * POST /api/auth/register
 * 模拟手机号注册
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { phone, password, nickname } = req.body
    const result = await AuthService.register({ phone, password, nickname })
    res.json({ ok: true, data: result })
  } catch (err) {
    if (err.code) {
      return res.status(400).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    next(err)
  }
})

/**
 * POST /api/auth/login
 * 手机号登录
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { phone, email, password } = req.body
    const result = await AuthService.login({ phone, email, password })
    res.json({ ok: true, data: result })
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS' || err.code === 'MISSING_FIELDS') {
      return res.status(401).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    next(err)
  }
})

/**
 * POST /api/auth/reset-password
 * 通过手机号重置密码
 */
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { phone, password } = req.body
    const result = await AuthService.resetPassword({ phone, password })
    res.json({ ok: true, data: result })
  } catch (err) {
    if (err.code) {
      return res.status(err.code === 'PHONE_NOT_FOUND' ? 404 : 400).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    next(err)
  }
})

/**
 * POST /api/auth/change-password
 * 当前登录用户修改密码
 */
router.post('/change-password', verifyToken, authLimiter, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    const result = await AuthService.changePassword({
      userId: req.user.userId,
      currentPassword,
      newPassword,
    })
    res.json({ ok: true, data: result })
  } catch (err) {
    if (err.code) {
      return res.status(400).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    next(err)
  }
})

/**
 * POST /api/auth/refresh
 * 刷新 Token（携带旧 token）
 */
router.post('/refresh', (req, res, next) => {
  try {
    const header = req.headers['authorization']
    const token = header && header.startsWith('Bearer ') ? header.slice(7) : null
    const result = AuthService.refresh(token)
    res.json({ ok: true, data: result })
  } catch (err) {
    res.status(401).json({
      ok: false,
      error: { code: err.code || 'INVALID_TOKEN', message: err.message },
    })
  }
})

/**
 * POST /api/auth/logout
 * 登出（将 token 加入黑名单）
 */
router.post('/logout', verifyToken, (req, res) => {
  const header = req.headers['authorization']
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null
  AuthService.logout(token)
  res.json({ ok: true, data: { message: '已退出登录' } })
})

module.exports = router
