'use strict'

/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误，返回统一格式的 JSON 响应
 */
function errorHandler(err, req, res, next) {
  // 避免在响应已发送后继续处理
  if (res.headersSent) return next(err)

  const status = err.status || err.statusCode || 500
  const code = err.code || 'INTERNAL_ERROR'
  const message = (process.env.NODE_ENV === 'production' && status === 500)
    ? '服务器内部错误'
    : err.message || '未知错误'

  if (status === 500) {
    console.error('[Error]', err)
  }

  res.status(status).json({
    ok: false,
    error: { code, message },
  })
}

/**
 * 404 处理中间件（放在所有路由之后）
 */
function notFound(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: `路径 ${req.path} 不存在` },
  })
}

module.exports = { errorHandler, notFound }
