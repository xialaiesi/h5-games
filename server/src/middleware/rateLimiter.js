'use strict'

/**
 * 简单内存速率限制中间件
 * 用于防止暴力破解登录接口
 * 基于 IP + 时间窗口的计数器，不依赖 Redis
 */

// 存储格式：ip -> { count, windowStart }
const store = new Map()

// 定时清理过期记录（每 5 分钟）
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of store.entries()) {
    if (now - record.windowStart > 60 * 60 * 1000) {
      store.delete(ip)
    }
  }
}, 5 * 60 * 1000).unref()

/**
 * 创建速率限制中间件
 * @param {{ windowMs: number, max: number, message?: string }} options
 */
function createRateLimiter({ windowMs = 60 * 1000, max = 10, message = '请求过于频繁，请稍后再试' } = {}) {
  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown'
    const now = Date.now()

    let record = store.get(ip)

    if (!record || now - record.windowStart > windowMs) {
      // 新窗口
      record = { count: 1, windowStart: now }
      store.set(ip, record)
      return next()
    }

    record.count += 1

    if (record.count > max) {
      const retryAfter = Math.ceil((record.windowStart + windowMs - now) / 1000)
      res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({
        ok: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message },
      })
    }

    next()
  }
}

// 登录/注册接口：60s 内最多 10 次
const authLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10 })

// 通用接口：60s 内最多 60 次
const generalLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 })

module.exports = { createRateLimiter, authLimiter, generalLimiter }
