'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const http = require('http')
const path = require('path')
const express = require('express')
const cors = require('cors')

const { initDB } = require('./db')
const { errorHandler, notFound } = require('./middleware/errorHandler')

const app = express()
app.set('trust proxy', true)

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

app.use(cors((req, callback) => {
  const origin = req.get('origin')

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

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false }))

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

app.use('/api/auth', require('./routes/auth'))
app.use('/api/users', require('./routes/users'))
app.use('/api/bbq', require('./routes/bbq'))
app.use('/api/shop', require('./routes/shop'))
app.use('/api/friends', require('./routes/friends'))

const staticDir = process.env.STATIC_DIR
  ? path.resolve(__dirname, process.env.STATIC_DIR)
  : path.resolve(__dirname, '../../public')

app.use(express.static(staticDir))
app.use(notFound)
app.use(errorHandler)

let httpServer = null

async function startServer() {
  if (httpServer) return httpServer

  await initDB()

  httpServer = http.createServer(app)
  const port = parseInt(process.env.PORT, 10) || 3000

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, () => {
      httpServer.off('error', reject)
      console.log('[App] 服务器已启动')
      console.log(`[App] HTTP: http://localhost:${port}`)
      console.log(`[App] 环境: ${process.env.NODE_ENV || 'development'}`)
      resolve()
    })
  })

  return httpServer
}

function gracefulShutdown(signal) {
  console.log(`\n[App] 收到 ${signal}，开始优雅退出...`)

  if (!httpServer) {
    process.exit(0)
    return
  }

  httpServer.close(() => {
    console.log('[App] HTTP 服务器已关闭')
    process.exit(0)
  })

  setTimeout(() => {
    console.error('[App] 强制退出')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', err => {
  console.error('[App] 未捕获异常:', err)
})

process.on('unhandledRejection', reason => {
  console.error('[App] 未处理的 Promise 拒绝:', reason)
})

if (require.main === module) {
  startServer().catch(err => {
    console.error('[App] 启动失败:', err)
    process.exit(1)
  })
}

module.exports = {
  app,
  startServer,
  get httpServer() {
    return httpServer
  },
}
