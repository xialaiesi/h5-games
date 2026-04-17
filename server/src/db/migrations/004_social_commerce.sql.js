'use strict'

const { getDB } = require('..')

function up() {
  const db = getDB()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_store_items (
      id          TEXT    PRIMARY KEY,
      user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_key    TEXT    NOT NULL,
      item_name   TEXT    NOT NULL,
      item_tag    TEXT,
      quantity    INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL,
      UNIQUE (user_id, item_key)
    )
  `).run()

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_user_store_items_user
    ON user_store_items(user_id)
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS shop_purchase_logs (
      id          TEXT    PRIMARY KEY,
      user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_key    TEXT    NOT NULL,
      item_name   TEXT    NOT NULL,
      item_tag    TEXT,
      unit_price  INTEGER NOT NULL,
      quantity    INTEGER NOT NULL DEFAULT 1,
      total_price INTEGER NOT NULL,
      created_at  TEXT    NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_shop_purchase_logs_user
    ON shop_purchase_logs(user_id)
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS friendships (
      id           TEXT    PRIMARY KEY,
      user_low_id  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_by TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT    NOT NULL DEFAULT 'pending',
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL,
      accepted_at  TEXT,
      CHECK (user_low_id <> user_high_id),
      UNIQUE (user_low_id, user_high_id)
    )
  `).run()

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_friendships_low_high
    ON friendships(user_low_id, user_high_id)
  `).run()

  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_friendships_requested_by
    ON friendships(requested_by)
  `).run()
}

function down() {
  const db = getDB()
  db.prepare('DROP TABLE IF EXISTS friendships').run()
  db.prepare('DROP TABLE IF EXISTS shop_purchase_logs').run()
  db.prepare('DROP TABLE IF EXISTS user_store_items').run()
}

module.exports = { up, down }
