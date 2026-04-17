'use strict'

const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')
const { Pool } = require('pg')

let dbType = null
let sqliteDb = null
let pgPool = null
let cleanupHandle = null

function resolveDbType() {
  if (process.env.DB_CLIENT) {
    return String(process.env.DB_CLIENT).trim().toLowerCase()
  }
  if (process.env.DATABASE_URL || process.env.PGHOST || process.env.PGDATABASE) {
    return 'postgres'
  }
  return 'sqlite'
}

function toPostgresSql(sql) {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

function createSqliteAdapter(db) {
  return {
    async one(sql, params = []) {
      return db.prepare(sql).get(...params) || null
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...params)
    },
    async exec(sql, params = []) {
      const result = db.prepare(sql).run(...params)
      return {
        rowCount: result.changes || 0,
        lastInsertId: result.lastInsertRowid || null,
        rows: [],
      }
    },
    async batch(sql) {
      db.exec(sql)
    },
  }
}

function createPostgresAdapter(client) {
  return {
    async one(sql, params = []) {
      const result = await client.query(toPostgresSql(sql), params)
      return result.rows[0] || null
    },
    async all(sql, params = []) {
      const result = await client.query(toPostgresSql(sql), params)
      return result.rows
    },
    async exec(sql, params = []) {
      const result = await client.query(toPostgresSql(sql), params)
      return {
        rowCount: result.rowCount || 0,
        lastInsertId: null,
        rows: result.rows || [],
      }
    },
    async batch(sql) {
      await client.query(sql)
    },
  }
}

function getSqliteProjectRoot() {
  return path.resolve(__dirname, '../../..')
}

function getSqliteDbPath() {
  const projectRoot = getSqliteProjectRoot()
  return process.env.DB_PATH
    ? path.resolve(projectRoot, process.env.DB_PATH)
    : path.resolve(projectRoot, 'data/qiju.db')
}

async function initSQLite() {
  if (sqliteDb) return

  const dbPath = getSqliteDbPath()
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  sqliteDb = new Database(dbPath)
  sqliteDb.pragma('journal_mode = WAL')
  sqliteDb.pragma('foreign_keys = ON')
  sqliteDb.pragma('synchronous = NORMAL')
  sqliteDb.pragma('cache_size = -8000')
  sqliteDb.pragma('temp_store = MEMORY')

  runSqliteMigrations()
  scheduleTokenCleanup()

  console.log(`[DB] SQLite 已就绪: ${dbPath}`)
}

async function initPostgres() {
  if (pgPool) return

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || undefined,
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || undefined,
    max: parseInt(process.env.PGPOOL_MAX || '10', 10),
    idleTimeoutMillis: 30_000,
  })

  const client = await pgPool.connect()
  try {
    await client.query('SELECT 1')
  } finally {
    client.release()
  }

  await runPostgresMigrations()
  scheduleTokenCleanup()

  const displayDb = process.env.PGDATABASE || '(from DATABASE_URL)'
  const displayHost = process.env.PGHOST || '127.0.0.1'
  console.log(`[DB] PostgreSQL 已就绪: ${displayHost}/${displayDb}`)
}

async function initDB() {
  if (dbType) return

  dbType = resolveDbType()
  if (dbType === 'postgres' || dbType === 'postgresql') {
    dbType = 'postgres'
    await initPostgres()
    return
  }

  dbType = 'sqlite'
  await initSQLite()
}

function runSqliteMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') || file.endsWith('.sql.js'))
    .sort()

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file)
    if (file.endsWith('.sql.js')) {
      const migration = require(fullPath)
      if (migration.up) {
        migration.up()
        console.log(`[DB] Migration 执行完毕: ${file}`)
      }
      continue
    }

    const sql = fs.readFileSync(fullPath, 'utf-8')
    sqliteDb.exec(sql)
    console.log(`[DB] Migration 执行完毕: ${file}`)
  }
}

async function runPostgresMigrations() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE,
        phone         TEXT UNIQUE,
        password_hash TEXT,
        nickname      TEXT NOT NULL,
        avatar        TEXT,
        rating_gomoku INTEGER NOT NULL DEFAULT 1000,
        rating_chess  INTEGER NOT NULL DEFAULT 1000,
        is_guest      INTEGER NOT NULL DEFAULT 0,
        tenant_id     TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)',
    'CREATE INDEX IF NOT EXISTS idx_users_rating_gomoku ON users(rating_gomoku DESC)',
    'CREATE INDEX IF NOT EXISTS idx_users_rating_chess ON users(rating_chess DESC)',
    `
      CREATE TABLE IF NOT EXISTS user_stats (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_type   TEXT NOT NULL,
        wins        INTEGER NOT NULL DEFAULT 0,
        losses      INTEGER NOT NULL DEFAULT 0,
        draws       INTEGER NOT NULL DEFAULT 0,
        total_games INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, game_type)
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_user_stats_user ON user_stats(user_id)',
    `
      CREATE TABLE IF NOT EXISTS rooms (
        id            TEXT PRIMARY KEY,
        invite_code   TEXT UNIQUE,
        game_type     TEXT NOT NULL,
        mode          TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'waiting',
        player1_id    TEXT REFERENCES users(id),
        player2_id    TEXT REFERENCES users(id),
        player1_color TEXT,
        player2_color TEXT,
        winner_id     TEXT REFERENCES users(id),
        end_reason    TEXT,
        started_at    TEXT,
        finished_at   TEXT,
        created_at    TEXT NOT NULL
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_rooms_player1 ON rooms(player1_id)',
    'CREATE INDEX IF NOT EXISTS idx_rooms_player2 ON rooms(player2_id)',
    'CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status)',
    'CREATE INDEX IF NOT EXISTS idx_rooms_game_type ON rooms(game_type)',
    `
      CREATE TABLE IF NOT EXISTS game_moves (
        id          BIGSERIAL PRIMARY KEY,
        room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        move_number INTEGER NOT NULL,
        player_id   TEXT NOT NULL REFERENCES users(id),
        move_data   TEXT NOT NULL,
        time_spent  INTEGER,
        created_at  TEXT NOT NULL,
        UNIQUE (room_id, move_number)
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_moves_room ON game_moves(room_id)',
    `
      CREATE TABLE IF NOT EXISTS rating_logs (
        id            BIGSERIAL PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id),
        room_id       TEXT NOT NULL REFERENCES rooms(id),
        game_type     TEXT NOT NULL,
        rating_before INTEGER NOT NULL,
        rating_after  INTEGER NOT NULL,
        delta         INTEGER NOT NULL,
        created_at    TEXT NOT NULL
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_rating_logs_user ON rating_logs(user_id)',
    `
      CREATE TABLE IF NOT EXISTS tenants (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        domain     TEXT,
        api_key    TEXT UNIQUE NOT NULL,
        config     TEXT,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS token_blacklist (
        jti        TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS user_bbq_progress (
        id          BIGSERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        max_level   INTEGER NOT NULL DEFAULT 1,
        total_score INTEGER NOT NULL DEFAULT 0,
        level_stars TEXT NOT NULL DEFAULT '{}',
        coins       INTEGER NOT NULL DEFAULT 0,
        last_played TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        UNIQUE (user_id)
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_user_bbq_progress_user ON user_bbq_progress(user_id)',
    `
      CREATE TABLE IF NOT EXISTS user_store_items (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_key    TEXT NOT NULL,
        item_name   TEXT NOT NULL,
        item_tag    TEXT,
        quantity    INTEGER NOT NULL DEFAULT 0,
        total_spent INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        UNIQUE (user_id, item_key)
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_user_store_items_user ON user_store_items(user_id)',
    `
      CREATE TABLE IF NOT EXISTS shop_purchase_logs (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_key    TEXT NOT NULL,
        item_name   TEXT NOT NULL,
        item_tag    TEXT,
        unit_price  INTEGER NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 1,
        total_price INTEGER NOT NULL,
        created_at  TEXT NOT NULL
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_shop_purchase_logs_user ON shop_purchase_logs(user_id)',
    `
      CREATE TABLE IF NOT EXISTS friendships (
        id           TEXT PRIMARY KEY,
        user_low_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status       TEXT NOT NULL DEFAULT 'pending',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        accepted_at  TEXT,
        CHECK (user_low_id <> user_high_id),
        UNIQUE (user_low_id, user_high_id)
      )
    `,
    'CREATE INDEX IF NOT EXISTS idx_friendships_low_high ON friendships(user_low_id, user_high_id)',
    'CREATE INDEX IF NOT EXISTS idx_friendships_requested_by ON friendships(requested_by)',
  ]

  for (const statement of statements) {
    await pgPool.query(statement)
  }
}

function scheduleTokenCleanup() {
  if (cleanupHandle) return

  const cleanup = async () => {
    try {
      const now = new Date().toISOString()
      const result = await execute('DELETE FROM token_blacklist WHERE expires_at < ?', [now])
      if (result.rowCount > 0) {
        console.log(`[DB] 清理过期 token 黑名单: ${result.rowCount} 条`)
      }
    } catch (err) {
      console.error('[DB] token 黑名单清理失败:', err.message)
    }
  }

  void cleanup()
  cleanupHandle = setInterval(() => {
    void cleanup()
  }, 60 * 60 * 1000)
  cleanupHandle.unref()
}

function ensureInitialized() {
  if (!dbType) {
    throw new Error('数据库未初始化，请先调用 initDB()')
  }
}

function currentAdapter() {
  ensureInitialized()
  return dbType === 'postgres'
    ? createPostgresAdapter(pgPool)
    : createSqliteAdapter(sqliteDb)
}

async function queryOne(sql, params = []) {
  return currentAdapter().one(sql, params)
}

async function queryAll(sql, params = []) {
  return currentAdapter().all(sql, params)
}

async function execute(sql, params = []) {
  return currentAdapter().exec(sql, params)
}

async function executeBatch(sql) {
  return currentAdapter().batch(sql)
}

async function withTransaction(fn) {
  ensureInitialized()

  if (dbType === 'postgres') {
    const client = await pgPool.connect()
    const tx = createPostgresAdapter(client)
    try {
      await client.query('BEGIN')
      const result = await fn(tx)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  const tx = createSqliteAdapter(sqliteDb)
  sqliteDb.prepare('BEGIN').run()
  try {
    const result = await fn(tx)
    sqliteDb.prepare('COMMIT').run()
    return result
  } catch (err) {
    sqliteDb.prepare('ROLLBACK').run()
    throw err
  }
}

function getDBType() {
  ensureInitialized()
  return dbType
}

function getDB() {
  ensureInitialized()
  return dbType === 'postgres' ? pgPool : sqliteDb
}

module.exports = {
  initDB,
  getDB,
  queryOne,
  queryAll,
  execute,
  executeBatch,
  withTransaction,
  getDBType,
}
