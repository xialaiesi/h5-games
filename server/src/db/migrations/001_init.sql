-- 001_init.sql
-- 首次启动自动执行，建立所有表结构

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ============================================================
-- 1. 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  email         TEXT        UNIQUE,
  phone         TEXT        UNIQUE,
  password_hash TEXT,
  nickname      TEXT        NOT NULL,
  avatar        TEXT,
  rating_gomoku INTEGER     NOT NULL DEFAULT 1000,
  rating_chess  INTEGER     NOT NULL DEFAULT 1000,
  is_guest      INTEGER     NOT NULL DEFAULT 0,
  tenant_id     TEXT,
  created_at    TEXT        NOT NULL,
  updated_at    TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone         ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_rating_gomoku ON users(rating_gomoku DESC);
CREATE INDEX IF NOT EXISTS idx_users_rating_chess  ON users(rating_chess  DESC);

-- ============================================================
-- 2. 用户战绩表（按游戏类型分行存储）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_stats (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type   TEXT    NOT NULL,
  wins        INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  draws       INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, game_type)
);

CREATE INDEX IF NOT EXISTS idx_user_stats_user ON user_stats(user_id);

-- ============================================================
-- 3. 房间/对局表
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
  id            TEXT    PRIMARY KEY,
  invite_code   TEXT    UNIQUE,
  game_type     TEXT    NOT NULL,
  mode          TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'waiting',
  player1_id    TEXT    REFERENCES users(id),
  player2_id    TEXT    REFERENCES users(id),
  player1_color TEXT,
  player2_color TEXT,
  winner_id     TEXT    REFERENCES users(id),
  end_reason    TEXT,
  started_at    TEXT,
  finished_at   TEXT,
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_player1   ON rooms(player1_id);
CREATE INDEX IF NOT EXISTS idx_rooms_player2   ON rooms(player2_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status    ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_game_type ON rooms(game_type);

-- ============================================================
-- 4. 对局步骤表
-- ============================================================
CREATE TABLE IF NOT EXISTS game_moves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     TEXT    NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  move_number INTEGER NOT NULL,
  player_id   TEXT    NOT NULL REFERENCES users(id),
  move_data   TEXT    NOT NULL,
  time_spent  INTEGER,
  created_at  TEXT    NOT NULL,
  UNIQUE (room_id, move_number)
);

CREATE INDEX IF NOT EXISTS idx_moves_room ON game_moves(room_id);

-- ============================================================
-- 5. 积分变动记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS rating_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT    NOT NULL REFERENCES users(id),
  room_id       TEXT    NOT NULL REFERENCES rooms(id),
  game_type     TEXT    NOT NULL,
  rating_before INTEGER NOT NULL,
  rating_after  INTEGER NOT NULL,
  delta         INTEGER NOT NULL,
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rating_logs_user ON rating_logs(user_id);

-- ============================================================
-- 6. 租户表（SaaS 多租户，预留结构）
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  domain     TEXT,
  api_key    TEXT    UNIQUE NOT NULL,
  config     TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL
);

-- ============================================================
-- 7. JWT 黑名单（登出时写入，过期后定时清理）
-- ============================================================
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti        TEXT    PRIMARY KEY,
  expires_at TEXT    NOT NULL
);
