'use strict'

const express = require('express')

const AuthService = require('../services/AuthService')
const { verifyToken } = require('../middleware/auth')
const { authLimiter } = require('../middleware/rateLimiter')

const router = express.Router()
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
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
    throw err
  }
}))

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
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
    throw err
  }
}))

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
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
    throw err
  }
}))

router.post('/change-password', verifyToken, authLimiter, asyncHandler(async (req, res) => {
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
    throw err
  }
}))

router.post('/refresh', asyncHandler(async (req, res) => {
  try {
    const header = req.headers['authorization']
    const token = header && header.startsWith('Bearer ') ? header.slice(7) : null
    const result = await AuthService.refresh(token)
    res.json({ ok: true, data: result })
  } catch (err) {
    res.status(401).json({
      ok: false,
      error: { code: err.code || 'INVALID_TOKEN', message: err.message },
    })
  }
}))

router.post('/logout', verifyToken, asyncHandler(async (req, res) => {
  const header = req.headers['authorization']
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null
  await AuthService.logout(token)
  res.json({ ok: true, data: { message: '已退出登录' } })
}))

module.exports = router
