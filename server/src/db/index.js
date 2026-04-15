'use strict'

const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

// 单例实例
let db = null

/**
 * 初始化数据库连接（单例）
 * 自动执行 migrations，启用 WAL 模式等性能配置
 * @returns {Database} better-sqlite3 实例
 */
function initDB() {
  if (db) return db

  // DB_PATH 若设置则相对于项目根目录（process.cwd()），默认也指向根目录 data/qiju.db
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(process.cwd(), 'data/qiju.db')
  const dbDir = path.dirname(dbPath)

  // 确保数据目录存在
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  db = new Database(dbPath)

  // 性能与可靠性配置
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -8000')   // 8MB 页缓存
  db.pragma('temp_store = MEMORY')

  // 执行迁移脚本
  runMigrations()

  // 启动定时清理过期 token 黑名单（每小时一次）
  scheduleTokenCleanup()

  console.log(`[DB] SQLite 已就绪: ${dbPath}`)
  return db
}

/**
 * 执行所有迁移文件（按文件名排序，幂等）
 */
function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    db.exec(sql)
    console.log(`[DB] Migration 执行完毕: ${file}`)
  }
}

/**
 * 定时清理过期 JWT 黑名单条目
 */
function scheduleTokenCleanup() {
  const cleanup = () => {
    try {
      const result = db.prepare(
        "DELETE FROM token_blacklist WHERE expires_at < datetime('now')"
      ).run()
      if (result.changes > 0) {
        console.log(`[DB] 清理过期 token 黑名单: ${result.changes} 条`)
      }
    } catch (err) {
      console.error('[DB] token 黑名单清理失败:', err.message)
    }
  }

  // 启动时立即清理一次
  cleanup()
  // 每小时定时清理
  setInterval(cleanup, 60 * 60 * 1000).unref()
}

/**
 * 获取数据库实例（必须先调用 initDB）
 * @returns {Database}
 */
function getDB() {
  if (!db) throw new Error('数据库未初始化，请先调用 initDB()')
  return db
}

module.exports = { initDB, getDB }
