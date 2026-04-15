'use strict'

const express = require('express')
const router = express.Router()
const AuthService = require('../services/AuthService')
const { verifyToken } = require('../middleware/auth')
const { authLimiter } = require('../middleware/rateLimiter')

/**
 * POST /api/auth/register
 * 邮箱注册
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, nickname } = req.body
    const result = await AuthService.register({ email, password, nickname })
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
 * 邮箱登录
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body
    const result = await AuthService.login({ email, password })
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
