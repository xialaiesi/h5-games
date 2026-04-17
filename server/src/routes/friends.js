'use strict'

const express = require('express')

const { verifyToken } = require('../middleware/auth')
const FriendModel = require('../models/FriendModel')
const UserModel = require('../models/UserModel')

const router = express.Router()
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

router.get('/', verifyToken, asyncHandler(async (req, res) => {
  const data = await FriendModel.listForUser(req.user.userId)
  res.json({ ok: true, data })
}))

router.post('/requests', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { targetUserId } = req.body
    if (!targetUserId) {
      return res.status(400).json({
        ok: false,
        error: { code: 'TARGET_USER_REQUIRED', message: '缺少目标用户' },
      })
    }

    const targetUser = await UserModel.findById(targetUserId)
    if (!targetUser) {
      return res.status(404).json({
        ok: false,
        error: { code: 'TARGET_USER_NOT_FOUND', message: '目标用户不存在' },
      })
    }

    const result = await FriendModel.sendRequest(req.user.userId, targetUserId)
    res.json({ ok: true, data: result })
  } catch (err) {
    if (err.code) {
      return res.status(
        err.code === 'TARGET_USER_NOT_FOUND' ? 404
          : err.code === 'FRIEND_EXISTS' || err.code === 'REQUEST_EXISTS' ? 409
            : 400
      ).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    throw err
  }
}))

router.post('/requests/:requestId/accept', verifyToken, asyncHandler(async (req, res) => {
  try {
    await FriendModel.acceptRequest(req.user.userId, req.params.requestId)
    res.json({ ok: true, data: { message: '已成为好友' } })
  } catch (err) {
    if (err.code) {
      return res.status(err.code === 'REQUEST_NOT_FOUND' ? 404 : 400).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    throw err
  }
}))

router.post('/requests/:requestId/reject', verifyToken, asyncHandler(async (req, res) => {
  try {
    await FriendModel.rejectRequest(req.user.userId, req.params.requestId)
    res.json({ ok: true, data: { message: '已拒绝好友请求' } })
  } catch (err) {
    if (err.code) {
      return res.status(err.code === 'REQUEST_NOT_FOUND' ? 404 : 400).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    throw err
  }
}))

router.post('/requests/:requestId/cancel', verifyToken, asyncHandler(async (req, res) => {
  try {
    await FriendModel.cancelRequest(req.user.userId, req.params.requestId)
    res.json({ ok: true, data: { message: '已取消好友请求' } })
  } catch (err) {
    if (err.code) {
      return res.status(err.code === 'REQUEST_NOT_FOUND' ? 404 : 400).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    throw err
  }
}))

router.post('/:friendUserId/remove', verifyToken, asyncHandler(async (req, res) => {
  try {
    await FriendModel.removeFriend(req.user.userId, req.params.friendUserId)
    res.json({ ok: true, data: { message: '已移除好友' } })
  } catch (err) {
    if (err.code) {
      return res.status(err.code === 'FRIEND_NOT_FOUND' ? 404 : 400).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    throw err
  }
}))

module.exports = router
