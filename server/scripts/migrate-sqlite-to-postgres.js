'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const path = require('path')
const Database = require('better-sqlite3')
const { Pool } = require('pg')

const { initDB, getDBType } = require('../src/db')

function resolveSqlitePath() {
  const projectRoot = path.resolve(__dirname, '../..')
  const configured = process.env.SQLITE_DB_PATH || process.env.DB_PATH || 'data/qiju.db'
  return path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured)
}

function tableExists(sqlite, tableName) {
  const row = sqlite.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName)
  return !!row
}

async function main() {
  await initDB()
  if (getDBType() !== 'postgres') {
    throw new Error('当前环境未启用 PostgreSQL，请先设置 DB_CLIENT=postgres 和 PG* 连接信息')
  }

  const sqlitePath = resolveSqlitePath()
  const sqlite = new Database(sqlitePath, { readonly: true })
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || undefined,
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || undefined,
  })

  const client = await pool.connect()
  const summary = {}

  try {
    await client.query('BEGIN')

    await client.query(`
      TRUNCATE TABLE
        game_moves,
        rating_logs,
        shop_purchase_logs,
        user_store_items,
        friendships,
        user_bbq_progress,
        user_stats,
        token_blacklist,
        rooms,
        tenants,
        users
      RESTART IDENTITY CASCADE
    `)

    const users = sqlite.prepare(`
      SELECT id, email, phone, password_hash, nickname, avatar, rating_gomoku, rating_chess, is_guest, tenant_id, created_at, updated_at
      FROM users
    `).all()
    for (const row of users) {
      await client.query(
        `INSERT INTO users (
           id, email, phone, password_hash, nickname, avatar, rating_gomoku, rating_chess, is_guest, tenant_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          row.id,
          row.email,
          row.phone,
          row.password_hash,
          row.nickname,
          row.avatar,
          row.rating_gomoku,
          row.rating_chess,
          row.is_guest,
          row.tenant_id,
          row.created_at,
          row.updated_at,
        ]
      )
    }
    summary.users = users.length

    const userStats = sqlite.prepare(`
      SELECT id, user_id, game_type, wins, losses, draws, total_games
      FROM user_stats
    `).all()
    for (const row of userStats) {
      await client.query(
        `INSERT INTO user_stats (id, user_id, game_type, wins, losses, draws, total_games)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.user_id, row.game_type, row.wins, row.losses, row.draws, row.total_games]
      )
    }
    summary.user_stats = userStats.length

    const tenants = sqlite.prepare(`
      SELECT id, name, domain, api_key, config, is_active, created_at
      FROM tenants
    `).all()
    for (const row of tenants) {
      await client.query(
        `INSERT INTO tenants (id, name, domain, api_key, config, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.name, row.domain, row.api_key, row.config, row.is_active, row.created_at]
      )
    }
    summary.tenants = tenants.length

    const rooms = sqlite.prepare(`
      SELECT id, invite_code, game_type, mode, status, player1_id, player2_id, player1_color, player2_color, winner_id, end_reason, started_at, finished_at, created_at
      FROM rooms
    `).all()
    for (const row of rooms) {
      await client.query(
        `INSERT INTO rooms (
           id, invite_code, game_type, mode, status, player1_id, player2_id, player1_color, player2_color, winner_id, end_reason, started_at, finished_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          row.id,
          row.invite_code,
          row.game_type,
          row.mode,
          row.status,
          row.player1_id,
          row.player2_id,
          row.player1_color,
          row.player2_color,
          row.winner_id,
          row.end_reason,
          row.started_at,
          row.finished_at,
          row.created_at,
        ]
      )
    }
    summary.rooms = rooms.length

    const ratingLogs = sqlite.prepare(`
      SELECT user_id, room_id, game_type, rating_before, rating_after, delta, created_at
      FROM rating_logs
      ORDER BY id ASC
    `).all()
    for (const row of ratingLogs) {
      await client.query(
        `INSERT INTO rating_logs (user_id, room_id, game_type, rating_before, rating_after, delta, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.user_id, row.room_id, row.game_type, row.rating_before, row.rating_after, row.delta, row.created_at]
      )
    }
    summary.rating_logs = ratingLogs.length

    const gameMoves = sqlite.prepare(`
      SELECT room_id, move_number, player_id, move_data, time_spent, created_at
      FROM game_moves
      ORDER BY id ASC
    `).all()
    for (const row of gameMoves) {
      await client.query(
        `INSERT INTO game_moves (room_id, move_number, player_id, move_data, time_spent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.room_id, row.move_number, row.player_id, row.move_data, row.time_spent, row.created_at]
      )
    }
    summary.game_moves = gameMoves.length

    const blacklist = sqlite.prepare(`
      SELECT jti, expires_at
      FROM token_blacklist
    `).all()
    for (const row of blacklist) {
      await client.query(
        'INSERT INTO token_blacklist (jti, expires_at) VALUES ($1, $2)',
        [row.jti, row.expires_at]
      )
    }
    summary.token_blacklist = blacklist.length

    const bbqProgress = sqlite.prepare(`
      SELECT user_id, max_level, total_score, level_stars, coins, last_played, created_at, updated_at
      FROM user_bbq_progress
    `).all()
    for (const row of bbqProgress) {
      await client.query(
        `INSERT INTO user_bbq_progress (
           user_id, max_level, total_score, level_stars, coins, last_played, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.user_id,
          row.max_level,
          row.total_score,
          row.level_stars,
          row.coins || 0,
          row.last_played,
          row.created_at,
          row.updated_at,
        ]
      )
    }
    summary.user_bbq_progress = bbqProgress.length

    const storeItems = tableExists(sqlite, 'user_store_items')
      ? sqlite.prepare(`
        SELECT id, user_id, item_key, item_name, item_tag, quantity, total_spent, created_at, updated_at
        FROM user_store_items
      `).all()
      : []
    for (const row of storeItems) {
      await client.query(
        `INSERT INTO user_store_items (
           id, user_id, item_key, item_name, item_tag, quantity, total_spent, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.user_id,
          row.item_key,
          row.item_name,
          row.item_tag,
          row.quantity,
          row.total_spent,
          row.created_at,
          row.updated_at,
        ]
      )
    }
    summary.user_store_items = storeItems.length

    const purchaseLogs = tableExists(sqlite, 'shop_purchase_logs')
      ? sqlite.prepare(`
        SELECT id, user_id, item_key, item_name, item_tag, unit_price, quantity, total_price, created_at
        FROM shop_purchase_logs
      `).all()
      : []
    for (const row of purchaseLogs) {
      await client.query(
        `INSERT INTO shop_purchase_logs (
           id, user_id, item_key, item_name, item_tag, unit_price, quantity, total_price, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.id,
          row.user_id,
          row.item_key,
          row.item_name,
          row.item_tag,
          row.unit_price,
          row.quantity,
          row.total_price,
          row.created_at,
        ]
      )
    }
    summary.shop_purchase_logs = purchaseLogs.length

    const friendships = tableExists(sqlite, 'friendships')
      ? sqlite.prepare(`
        SELECT id, user_low_id, user_high_id, requested_by, status, created_at, updated_at, accepted_at
        FROM friendships
      `).all()
      : []
    for (const row of friendships) {
      await client.query(
        `INSERT INTO friendships (
           id, user_low_id, user_high_id, requested_by, status, created_at, updated_at, accepted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.id,
          row.user_low_id,
          row.user_high_id,
          row.requested_by,
          row.status,
          row.created_at,
          row.updated_at,
          row.accepted_at,
        ]
      )
    }
    summary.friendships = friendships.length

    await client.query('COMMIT')
    console.log('[migrate] 迁移完成')
    console.log(JSON.stringify({ sqlitePath, summary }, null, 2))
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
    sqlite.close()
  }
}

main().catch(err => {
  console.error('[migrate] 迁移失败:', err)
  process.exit(1)
})
