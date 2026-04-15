'use strict'

const AuthService = require('../services/AuthService')

/**
 * JWT 验证中间件
 * 从 Authorization: Bearer <token> 头中提取并验证 token
 * 验证成功后将用户信息挂载到 req.user
 */
function verifyToken(req, res, next) {
  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false,
      error: { code: 'MISSING_TOKEN', message: '缺少认证 token' },
    })
  }

  const token = header.slice(7)

  try {
    req.user = AuthService.verify(token)
    next()
  } catch (err) {
    return res.status(401).json({
      ok: false,
      error: {
        code: err.code || 'INVALID_TOKEN',
        message: err.message || 'token 无效',
      },
    })
  }
}

module.exports = { verifyToken }
