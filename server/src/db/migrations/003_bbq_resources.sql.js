'use strict'

const { getDB } = require('..')

function columnExists(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return columns.some(col => col.name === columnName)
}

/**
 * 为烧烤游戏进度表补充资源字段
 */
function up() {
  const db = getDB()

  if (!columnExists(db, 'user_bbq_progress', 'coins')) {
    db.prepare(`
      ALTER TABLE user_bbq_progress
      ADD COLUMN coins INTEGER NOT NULL DEFAULT 0
    `).run()
  }
}

function down() {
  // SQLite 不支持直接删除列，这里保留空实现
}

module.exports = { up, down }
