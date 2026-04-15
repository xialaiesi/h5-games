'use strict'

const { getDB } = require('../db')

/**
 * 用户烧烤游戏进度表
 * 用于存储每个用户的烧烤游戏关卡进度和积分
 */
function up() {
  const db = getDB()
  
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_bbq_progress (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      max_level     INTEGER NOT NULL DEFAULT 1,
      total_score   INTEGER NOT NULL DEFAULT 0,
      level_stars   TEXT    NOT NULL DEFAULT '{}',
      last_played   TEXT    NOT NULL,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL,
      UNIQUE (user_id)
    )
  `).run()

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_user_bbq_progress_user ON user_bbq_progress(user_id)
  `).run()
}

function down() {
  getDB().prepare('DROP TABLE IF EXISTS user_bbq_progress').run()
}

module.exports = { up, down }
