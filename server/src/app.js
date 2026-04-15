'use strict'

// 加载环境变量（必须在最顶部）
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const http = require('http')
const path = require('path')
const express = require('express')
const cors = require('cors')

const { initDB } = require('./db')
const { errorHandler, notFound } = require('./middleware/errorHandler')

// ===== 初始化数据库 =====
initDB()

// ===== 创建 Express 应用 =====
const app = express()
app.set('trust proxy', true)

// ===== 中间件 =====

// CORS 配置
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use(cors((req, callback) => {
  const origin = req.get('origin')

  // 允许无 origin 请求（如 curl、服务端调用）
  if (!origin) {
    return callback(null, { origin: true, credentials: true })
  }

  const forwardedHost = req.get('x-forwarded-host')
  const host = forwardedHost || req.get('host')
  const forwardedProto = req.get('x-forwarded-proto')
  const proto = forwardedProto || req.protocol || 'http'

  let sameOrigin = false
  try {
    const originUrl = new URL(origin)
    sameOrigin = Boolean(host) && originUrl.host === host && originUrl.protocol === `${proto}:`
  } catch {
    sameOrigin = false
  }

  if (sameOrigin || allowedOrigins.includes(origin)) {
    return callback(null, { origin: true, credentials: true })
  }

  const err = new Error(`CORS: ${origin} 不在允许列表中`)
  err.status = 403
  err.code = 'CORS_FORBIDDEN'
  return callback(err)
}))

// JSON 请求体解析（限制 1MB）
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false }))

// 健康检查接口（无需鉴权）
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    data: {
      status: 'healthy',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  })
})

// ===== 路由挂载 =====
app.use('/api/auth',        require('./routes/auth'))
app.use('/api/users',       require('./routes/users'))
app.use('/api/bbq',         require('./routes/bbq'))

// 静态文件（生产环境由 Nginx 处理，这里保留用于开发和简单部署）
const staticDir = process.env.STATIC_DIR
  ? path.resolve(__dirname, process.env.STATIC_DIR)
  : path.resolve(__dirname, '../../public')

app.use(express.static(staticDir))

// 404 和错误处理（必须在路由最后）
app.use(notFound)
app.use(errorHandler)

// ===== 创建 HTTP 服务器 =====
const httpServer = http.createServer(app)

// ===== 监听端口 =====
const PORT = parseInt(process.env.PORT) || 3000

httpServer.listen(PORT, () => {
  console.log(`[App] 服务器已启动`)
  console.log(`[App] HTTP: http://localhost:${PORT}`)
  console.log(`[App] 环境: ${process.env.NODE_ENV || 'development'}`)
})

// ===== 优雅退出 =====
function gracefulShutdown(signal) {
  console.log(`\n[App] 收到 ${signal}，开始优雅退出...`)

  httpServer.close(() => {
    console.log('[App] HTTP 服务器已关闭')
    process.exit(0)
  })

  // 强制退出超时
  setTimeout(() => {
    console.error('[App] 强制退出')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))

// 未捕获异常（记录但不退出，让 PM2 决策）
process.on('uncaughtException', (err) => {
  console.error('[App] 未捕获异常:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[App] 未处理的 Promise 拒绝:', reason)
})

module.exports = { app, httpServer }
