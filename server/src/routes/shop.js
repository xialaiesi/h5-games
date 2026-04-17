'use strict'

const express = require('express')

const { verifyToken } = require('../middleware/auth')
const ShopModel = require('../models/ShopModel')

const router = express.Router()
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

router.get('/state', verifyToken, asyncHandler(async (req, res) => {
  const state = await ShopModel.getState(req.user.userId)
  res.json({ ok: true, data: state })
}))

router.post('/purchase', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { itemKey, quantity } = req.body
    const result = await ShopModel.purchase(req.user.userId, itemKey, quantity)
    res.json({ ok: true, data: result })
  } catch (err) {
    if (err.code) {
      return res.status(
        err.code === 'ITEM_NOT_FOUND' ? 404
          : err.code === 'INSUFFICIENT_COINS' ? 409
            : 400
      ).json({
        ok: false,
        error: { code: err.code, message: err.message },
      })
    }
    throw err
  }
}))

module.exports = router
