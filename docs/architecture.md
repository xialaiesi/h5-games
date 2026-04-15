# 棋局（QiJu）H5 在线棋牌平台 — 技术架构文档

> 版本：v1.0
> 日期：2026-04-14
> 作者：架构组
> 对应产品方案：docs/product-design.md v1.0

---

## 目录

1. [技术选型](#一技术选型)
2. [整体架构](#二整体架构)
3. [项目目录结构](#三项目目录结构)
4. [核心模块设计](#四核心模块设计)
5. [数据库 Schema](#五数据库-schema)
6. [API 接口定义](#六api-接口定义)
7. [WebSocket 消息协议](#七websocket-消息协议)
8. [关键流程](#八关键流程)
9. [性能优化策略](#九性能优化策略)
10. [部署架构](#十部署架构)
11. [开发规范](#十一开发规范)

---

## 一、技术选型

| 类别 | 选择 | 版本 | 选型理由 |
|------|------|------|----------|
| 后端运行时 | Node.js | 20 LTS | 与前端同语言，JS 游戏规则逻辑可直接复用；事件驱动模型天然适合 WebSocket 高并发长连接 |
| HTTP 框架 | Express | 4.x | 成熟稳定，中间件生态丰富，上手成本低 |
| WebSocket | ws | 8.x | 轻量无额外协议层，性能优于 Socket.IO；棋类游戏消息结构简单，无需 room/namespace 抽象 |
| 数据库 | SQLite（better-sqlite3） | 9.x | 零安装零配置，单文件部署；同步 API 简化代码；MVP 阶段流量有限，单机 SQLite 完全够用；后期可迁移至 PostgreSQL |
| 缓存 | 内存 Map | — | MVP 阶段不引入 Redis，降低运维复杂度；房间和匹配队列全部存于进程内存，单进程足够 |
| 身份认证 | jsonwebtoken + bcrypt | — | JWT 无状态设计，WebSocket 鉴权简单；bcrypt 是密码哈希行业标准 |
| 进程管理 | PM2 | 5.x | 守护进程、崩溃自动重启、结构化日志、零停机热重载 |
| 前端 | Vanilla JS + Canvas | — | 现有游戏代码质量良好，无需引入框架；Canvas 渲染与框架无强绑定；零依赖保证最小包体 |
| 反向代理 | Nginx | 1.24+ | 处理 SSL 终止、静态文件托管、WebSocket 升级代理 |

---

## 二、整体架构

```
┌─────────────────────────────────────────────────┐
│                   浏览器客户端                    │
│                                                 │
│  public/js/auth.js   ← JWT 存储 / 刷新          │
│  public/js/api.js    ← HTTP fetch 封装          │
│  public/js/ws.js     ← WebSocket 连接管理        │
│  public/js/router.js ← 客户端路由               │
│                                                 │
│  页面: index / login / profile / hall / game    │
└────────────┬──────────────────┬─────────────────┘
             │ HTTP REST        │ WebSocket
             ▼                  ▼
┌────────────────────────────────────────────────┐
│                    Nginx                        │
│  /api/*  → localhost:3000  (HTTP)              │
│  /ws     → localhost:3000  (WebSocket Upgrade) │
│  /*      → /var/www/h5-games/ (静态文件)        │
└────────────────────┬───────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────┐
│            Node.js 应用（单进程 / PM2）          │
│                                                │
│  server/src/app.js  ← Express + ws 共用 3000   │
│                                                │
│  ┌──────────────┐   ┌────────────────────────┐ │
│  │  REST API    │   │   WebSocket 服务        │ │
│  │  /api/auth   │   │  ConnectionManager      │ │
│  │  /api/users  │   │  MessageRouter          │ │
│  │  /api/rooms  │   │  RoomManager (内存)     │ │
│  │  /api/records│   │  MatchmakingEngine(内存)│ │
│  └──────┬───────┘   └───────────┬────────────┘ │
│         │                       │              │
│  ┌──────▼───────────────────────▼────────────┐ │
│  │             Services Layer                │ │
│  │  AuthService  GameValidator  RatingCalc   │ │
│  └──────────────────────┬────────────────────┘ │
│                         │                      │
│  ┌──────────────────────▼────────────────────┐ │
│  │         Models Layer (better-sqlite3)     │ │
│  │   UserModel  RoomModel  MoveModel         │ │
│  └──────────────────────┬────────────────────┘ │
└─────────────────────────┼──────────────────────┘
                          │
                          ▼
             ┌────────────────────┐
             │  SQLite 数据库      │
             │  data/qiju.db      │
             └────────────────────┘

┌────────────────────────────────────────────────┐
│               shared/（前后端共用）              │
│   gomoku-rules.js   chess-rules.js             │
│   constants.js      elo.js                     │
└────────────────────────────────────────────────┘
```

**关键设计决策**：

- HTTP 和 WebSocket 运行在同一个 Node.js 进程和同一端口（3000）。`ws` 库支持 `handleProtocols` 挂载到 `http.Server`，Nginx 通过 `Upgrade` 头区分流量，无需额外端口。
- 房间状态和匹配队列只存于进程内存（Map），不持久化。崩溃重启后活跃对局丢失，但 PM2 崩溃重启窗口极短（< 1 秒），MVP 阶段可接受。
- 游戏规则（走法校验、胜负判断）抽取到 `shared/` 目录，Node.js 用 `require`，浏览器用 `<script>` 引入，确保前后端规则完全一致。

---

## 三、项目目录结构

```
/Users/yuan/h5-games/
│
├── server/                         # 后端代码
│   ├── package.json
│   ├── .env.example                # 环境变量模板
│   ├── ecosystem.config.js         # PM2 配置
│   └── src/
│       ├── app.js                  # 主入口：初始化 Express + ws + 挂载路由
│       ├── ws.js                   # WebSocket 服务：连接管理 + 消息路由
│       │
│       ├── routes/                 # Express 路由（薄层，仅参数解析和响应）
│       │   ├── auth.js             # POST /api/auth/register|login|refresh|logout
│       │   ├── users.js            # GET/PATCH /api/users/me|:id|:id/records
│       │   ├── rooms.js            # GET /api/rooms/:id  （查询历史房间）
│       │   ├── records.js          # GET /api/records/:id（对局详情）
│       │   └── leaderboard.js      # GET /api/leaderboard/:gameType
│       │
│       ├── middleware/
│       │   ├── auth.js             # JWT 验证中间件（verifyToken）
│       │   ├── errorHandler.js     # 全局错误处理
│       │   ├── rateLimiter.js      # 简单内存速率限制（防暴力破解）
│       │   └── validate.js         # 请求参数校验（用正则/手写，不引入 joi）
│       │
│       ├── services/               # 业务逻辑层（无 HTTP 依赖，可单独测试）
│       │   ├── AuthService.js      # 注册、登录、Token 管理
│       │   ├── RoomManager.js      # 房间创建/加入/离开/状态流转（内存）
│       │   ├── MatchmakingEngine.js# 匹配队列管理（内存，定时轮询）
│       │   ├── GameValidator.js    # 走棋合法性校验（调用 shared 规则）
│       │   ├── RatingCalculator.js # ELO 积分计算
│       │   └── TimerManager.js     # 每步操作倒计时管理
│       │
│       ├── models/                 # 数据模型层（封装 SQL，返回纯 JS 对象）
│       │   ├── UserModel.js        # users + user_stats 表操作
│       │   ├── RoomModel.js        # rooms 表操作
│       │   ├── MoveModel.js        # game_moves 表操作
│       │   └── RatingLogModel.js   # rating_logs 表操作
│       │
│       └── db/
│           ├── index.js            # better-sqlite3 实例（单例导出）
│           └── migrations/
│               └── 001_init.sql    # 建表 SQL（首次启动自动执行）
│
├── shared/                         # 前后端共享模块（纯函数，无副作用）
│   ├── gomoku-rules.js             # 五子棋：checkWin、isValidMove
│   ├── chess-rules.js              # 中国象棋：getMoves、isInCheck、hasAnyMove
│   ├── constants.js                # 枚举值（游戏类型、房间状态、消息类型）
│   └── elo.js                      # ELO 计算公式
│
├── public/                         # 前端静态文件（由 Nginx 直接托管）
│   ├── index.html                  # 平台首页/大厅
│   ├── login.html                  # 登录注册页
│   ├── profile.html                # 个人中心
│   ├── leaderboard.html            # 排行榜
│   │
│   ├── js/                         # 公共前端 JS
│   │   ├── api.js                  # HTTP fetch 封装（带 JWT 头、统一错误处理）
│   │   ├── ws.js                   # WebSocket 客户端（自动重连、消息队列）
│   │   ├── auth.js                 # 登录态管理（Token 存取、登录跳转守卫）
│   │   ├── router.js               # 极简客户端路由（history API）
│   │   └── ui.js                   # 公共 UI 组件（Toast、Modal、Loading）
│   │
│   ├── css/
│   │   ├── base.css                # CSS Reset + 全局变量（颜色、字体）
│   │   ├── components.css          # 公共组件样式（按钮、表单、卡片）
│   │   └── layout.css              # 页面布局（移动端优先，max-width: 480px）
│   │
│   ├── gomoku/
│   │   ├── hall.html               # 五子棋大厅（匹配入口、在线人数）
│   │   ├── hall.js                 # 大厅逻辑（匹配、创建房间、加入房间）
│   │   ├── index.html              # 对局页
│   │   └── game.js                 # 对局逻辑（改造后：本地渲染 + 网络层分离）
│   │
│   └── chinese-chess/
│       ├── hall.html
│       ├── hall.js
│       ├── index.html
│       └── game.js
│
├── data/                           # 运行时数据（gitignore）
│   └── qiju.db                     # SQLite 数据库文件
│
├── logs/                           # PM2 日志输出目录（gitignore）
│
├── docs/
│   ├── product-design.md
│   └── architecture.md             # 本文档
│
├── .env                            # 环境变量（gitignore）
├── .gitignore
└── README.md
```

---

## 四、核心模块设计

### 4.1 AuthService

**职责**：用户注册、登录、Token 签发与刷新、Token 黑名单（内存 Set，重启清空）。

```javascript
// server/src/services/AuthService.js

class AuthService {
  // 邮箱注册
  // 校验邮箱格式、昵称长度；bcrypt hash 密码；生成 UUID；
  // 写入 users + user_stats（gomoku/chinese-chess 各一条）；返回 token
  register({ email, password, nickname })

  // 邮箱登录
  // 查用户 → bcrypt.compare → 签发 JWT
  login({ email, password })

  // JWT 刷新
  // 验证旧 token（允许过期 7 天内）→ 签发新 token
  refresh(oldToken)

  // 登出
  // 将 token jti 加入内存黑名单 Set
  logout(token)

  // 中间件使用：验证 token 有效性（检查黑名单）
  verify(token)  // → { userId, nickname, ... }
}
```

**JWT Payload 结构**：

```json
{
  "sub": "user-uuid",
  "nickname": "玩家A",
  "iat": 1712000000,
  "exp": 1712604800,
  "jti": "唯一token id（用于黑名单）"
}
```

**Token 有效期**：7 天（`expiresIn: '7d'`）。黑名单只保存退出登录的 token jti，重启后清空（MVP 可接受）。

---

### 4.2 RoomManager

**职责**：管理所有活跃房间的内存状态。是 WebSocket 服务的核心数据结构。

```javascript
// server/src/services/RoomManager.js

class RoomManager {
  constructor() {
    this.rooms = new Map()      // roomId -> RoomState
    this.userRoom = new Map()   // userId -> roomId（快速反查）
  }

  // 创建房间（快速匹配或邀请码模式）
  // 生成 6 位邀请码；写入 rooms 表；返回 RoomState
  createRoom({ gameType, mode, player1 })  // → RoomState

  // 玩家加入房间
  // 验证房间存在且 status=waiting；分配颜色；触发 game_start（若双方就绪）
  joinRoom(roomId, player)  // → RoomState

  // 玩家离开/断线
  // status=playing 时启动 60s 重连计时器；超时则结算
  playerLeave(roomId, userId, reason)  // reason: 'disconnect' | 'resign' | 'leave'

  // 断线重连
  reconnect(roomId, userId, newSocket)  // → RoomState（含完整 boardState）

  // 应用走棋（服务器权威）
  // 调用 GameValidator 校验 → 更新 boardState → 检测胜负 → 广播
  applyMove(roomId, userId, moveData)  // → { ok, boardState, gameOver, winner }

  // 结束对局（认输 / 超时 / 和棋）
  endGame(roomId, { winner, reason })  // → 触发积分计算、写库、清理资源

  // 获取房间状态
  getRoom(roomId)  // → RoomState | null

  // 玩家当前所在房间
  getUserRoom(userId)  // → roomId | null
}
```

**RoomState 内存结构**：

```javascript
{
  roomId: 'ABC123',           // 6 位大写字母数字
  inviteCode: 'ABC123',       // 同 roomId（邀请码模式）
  gameType: 'gomoku',         // 'gomoku' | 'chinese-chess'
  mode: 'ranked',             // 'ranked' | 'casual'
  status: 'playing',          // 'waiting' | 'playing' | 'finished' | 'abandoned'
  players: {
    black: {                  // 五子棋用 black/white，象棋用 red/black
      userId: 'u1',
      nickname: '玩家A',
      socket: <ws实例>,        // 发送消息用，不持久化
      rating: 1450,
      connected: true,
      timeLeft: 55,           // 本步剩余秒数
      extraTime: 3,           // 剩余延时次数（积分赛）
    },
    white: { ... }
  },
  boardState: [],             // 完整棋盘数组（每步更新）
  moveHistory: [],            // [{ userId, moveData, timeSpent, timestamp }]
  currentTurn: 'black',       // 当前行棋方
  moveCount: 12,
  stepTimer: null,            // setInterval 引用（每秒倒计时）
  reconnectTimer: null,       // setTimeout 引用（断线等待）
  createdAt: 1712000000000,
  startedAt: 1712000010000,
}
```

---

### 4.3 MatchmakingEngine

**职责**：维护各游戏的匹配队列，定时执行匹配算法。

```javascript
// server/src/services/MatchmakingEngine.js

class MatchmakingEngine {
  constructor(roomManager) {
    this.queues = new Map()     // `${gameType}:${mode}` -> QueueEntry[]
    this.roomManager = roomManager
    this.interval = null
  }

  // 启动定时匹配（每 2 秒执行一次）
  start()

  // 玩家加入队列
  // 检查是否已在队列中；推入对应队列
  enqueue({ userId, nickname, socket, rating, gameType, mode })  // → { position }

  // 玩家离开队列
  dequeue(userId)

  // 定时匹配逻辑
  _tick() {
    // 遍历所有队列
    // 根据等待时长动态调整积分差阈值：
    //   <15s → 差 ≤200；<30s → 差 ≤500；≥30s → 不限
    // 找到满足条件的最优对手 → 创建房间 → 推送 matched 消息 → 从队列移除
  }

  // 获取队列位置（用于返回 queue_joined 的 position）
  getPosition(userId, gameType, mode)  // → number
}
```

**队列条目（QueueEntry）**：

```javascript
{
  userId: 'u2',
  nickname: '玩家B',
  socket: <ws实例>,
  rating: 1480,
  gameType: 'gomoku',
  mode: 'ranked',
  joinedAt: 1712000000000,    // 毫秒时间戳，用于计算等待时长
}
```

---

### 4.4 GameValidator

**职责**：调用 `shared/` 规则模块对走棋进行服务端合法性校验，防止作弊。

```javascript
// server/src/services/GameValidator.js
const gomokuRules = require('../../../shared/gomoku-rules')
const chessRules  = require('../../../shared/chess-rules')

class GameValidator {
  // 校验走棋是否合法
  // 返回 { valid: bool, reason?: string }
  validate(gameType, boardState, moveData, currentTurn)

  // 校验后检测胜负
  // 返回 { gameOver: bool, winner?: 'black'|'white', reason?: string }
  checkGameOver(gameType, boardState, lastMoveData, currentTurn)
}
```

**shared/gomoku-rules.js 导出接口**：

```javascript
module.exports = {
  GRID_COUNT: 15,
  isValidMove(boardState, row, col),        // 坐标合法 + 落点为空
  applyMove(boardState, row, col, player),  // 返回新 boardState（不可变）
  checkWin(boardState, row, col, player),   // 返回 bool
}
```

**shared/chess-rules.js 导出接口**：

```javascript
module.exports = {
  INITIAL_BOARD,
  getMoves(boardState, row, col),           // 返回合法落点列表
  applyMove(boardState, from, to),          // 返回新 boardState
  isInCheck(boardState, side),              // 将帅是否被将
  hasAnyMove(boardState, side),             // 是否有任意合法走法（判断绝杀）
  isCheckmate(boardState, side),            // 死局判断
}
```

---

### 4.5 RatingCalculator

**职责**：ELO 积分计算，对局结束后调用。

```javascript
// shared/elo.js（前后端共用，server 端 require 它）

// K 值规则：totalGames < 20 → 32；rating > 1800 → 16；其余 → 24
function getK(rating, totalGames)

// 预期胜率：E_A = 1 / (1 + 10^((R_B - R_A) / 400))
function expectedScore(ratingA, ratingB)

// 新积分：R' = R + K * (S - E)，S: 1=胜 0.5=平 0=负
// 返回 { newRatingA, newRatingB, deltaA, deltaB }
function calculate(ratingA, ratingB, result, statsA, statsB)
```

```javascript
// server/src/services/RatingCalculator.js
const elo = require('../../../shared/elo')

class RatingCalculator {
  // 对局结束后调用
  // 1. 从 DB 读取双方当前积分和总局数
  // 2. 调用 elo.calculate
  // 3. 写入 rating_logs
  // 4. 更新 users.rating_* 和 user_stats
  // 仅积分赛（mode=ranked）执行，休闲赛跳过
  async settle(roomId, winnerId, reason)
}
```

---

### 4.6 WebSocket 消息处理器（MessageRouter）

**职责**：接收客户端消息，分发到对应 Handler，是 WebSocket 服务的入口。

```javascript
// server/src/ws.js

class WSServer {
  constructor(httpServer, services) {
    this.wss = new WebSocket.Server({ server: httpServer, path: '/ws' })
    this.connections = new Map()   // userId -> ws（已鉴权连接）
    this.services = services       // { authService, roomManager, matchmaking, ... }
  }

  _onConnection(ws, req) {
    ws.isAuthenticated = false
    ws.on('message', (raw) => this._onMessage(ws, raw))
    ws.on('close',   ()    => this._onClose(ws))
    ws.on('error',   (err) => this._onError(ws, err))
    // 10 秒内未鉴权则断开
    ws.authTimeout = setTimeout(() => ws.terminate(), 10000)
  }

  _onMessage(ws, raw) {
    // 解析 JSON，校验 type 字段
    // 未鉴权时只处理 auth 类型
    // 路由到对应 handler
  }
}

// 消息路由表（type → handler 函数）
const handlers = {
  auth:          handleAuth,         // 鉴权
  join_queue:    handleJoinQueue,    // 加入匹配队列
  leave_queue:   handleLeaveQueue,   // 离开匹配队列
  create_room:   handleCreateRoom,   // 创建房间
  join_room:     handleJoinRoom,     // 加入房间
  leave_room:    handleLeaveRoom,    // 离开房间
  ready:         handleReady,        // 玩家准备
  move:          handleMove,         // 走棋
  resign:        handleResign,       // 认输
  draw_offer:    handleDrawOffer,    // 请求和棋
  draw_response: handleDrawResponse, // 响应和棋
  undo_request:  handleUndoRequest,  // 请求悔棋
  undo_response: handleUndoResponse, // 响应悔棋
  ping:          handlePing,         // 心跳
}
```

**工具函数**：

```javascript
// 向单个 ws 连接发送消息
function send(ws, type, payload = {}, roomId = null) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, roomId, payload }))
  }
}

// 向房间内所有玩家广播
function broadcast(room, type, payload) {
  for (const side of ['black', 'white']) {
    const player = room.players[side]
    if (player && player.socket) {
      send(player.socket, type, payload, room.roomId)
    }
  }
}
```

---

### 4.7 TimerManager

**职责**：管理每步操作的倒计时，超时自动判负。

```javascript
// server/src/services/TimerManager.js

class TimerManager {
  // 启动某房间当前行棋方的倒计时
  // 每秒减 1，到 10 秒时推送 timeout_warning
  // 到 0 时推送 timeout，调用 roomManager.endGame
  startStepTimer(room)

  // 停止倒计时（走棋后调用）
  stopStepTimer(room)

  // 启动断线等待计时器（60s）
  startReconnectTimer(room, userId, onTimeout)

  // 停止断线等待计时器（重连后调用）
  stopReconnectTimer(room)
}
```

---

## 五、数据库 Schema

SQLite 语法，首次启动由 `server/src/db/index.js` 自动执行 `migrations/001_init.sql`。

```sql
-- 001_init.sql

PRAGMA journal_mode = WAL;   -- 提升并发读性能
PRAGMA foreign_keys = ON;    -- 启用外键约束

-- ============================================================
-- 1. 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,          -- UUID v4
  email         TEXT        UNIQUE,               -- 邮箱（MVP 阶段唯一登录方式）
  phone         TEXT        UNIQUE,               -- 手机号（v1.1 开放）
  password_hash TEXT,                             -- bcrypt hash；游客为 NULL
  nickname      TEXT        NOT NULL,             -- 2~12 字符
  avatar        TEXT,                             -- 头像 URL；NULL 时前端显示默认头像
  rating_gomoku INTEGER     NOT NULL DEFAULT 1000,
  rating_chess  INTEGER     NOT NULL DEFAULT 1000,
  is_guest      INTEGER     NOT NULL DEFAULT 0,   -- SQLite 无 BOOLEAN，用 0/1
  tenant_id     TEXT,                             -- SaaS 租户 ID，NULL 表示平台自有
  created_at    TEXT        NOT NULL,             -- ISO 8601 字符串
  updated_at    TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_rating_gomoku ON users(rating_gomoku DESC);
CREATE INDEX IF NOT EXISTS idx_users_rating_chess  ON users(rating_chess  DESC);

-- ============================================================
-- 2. 用户战绩表（按游戏类型分行存储）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_stats (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type   TEXT    NOT NULL,    -- 'gomoku' | 'chinese-chess'
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
  invite_code   TEXT    UNIQUE,           -- 6 位大写字母数字；NULL 表示快速匹配创建
  game_type     TEXT    NOT NULL,         -- 'gomoku' | 'chinese-chess'
  mode          TEXT    NOT NULL,         -- 'ranked' | 'casual'
  status        TEXT    NOT NULL,         -- 'waiting' | 'playing' | 'finished' | 'abandoned'
  player1_id    TEXT    REFERENCES users(id),
  player2_id    TEXT    REFERENCES users(id),
  player1_color TEXT,                     -- 'black'|'white' 或 'red'|'black'
  player2_color TEXT,
  winner_id     TEXT    REFERENCES users(id),  -- NULL 表示平局或未结束
  end_reason    TEXT,                     -- 'resign'|'timeout'|'checkmate'|'five'|'draw'|'disconnect'
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
  move_number INTEGER NOT NULL,           -- 从 1 开始递增
  player_id   TEXT    NOT NULL REFERENCES users(id),
  move_data   TEXT    NOT NULL,           -- JSON 字符串（SQLite 无原生 JSON 类型）
  time_spent  INTEGER,                    -- 本步耗时（秒）
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
  delta         INTEGER NOT NULL,         -- 正数涨分，负数降分
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rating_logs_user ON rating_logs(user_id);

-- ============================================================
-- 6. 租户表（SaaS 多租户，MVP 暂不启用，预留结构）
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  domain     TEXT,
  api_key    TEXT    UNIQUE NOT NULL,
  config     TEXT,                        -- JSON 字符串（品牌色、Logo 等）
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL
);

-- ============================================================
-- 7. JWT 黑名单（登出时写入，过期后可定时清理）
-- ============================================================
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti        TEXT    PRIMARY KEY,         -- JWT ID
  expires_at TEXT    NOT NULL             -- 过期时间，用于定时清理
);
```

> **关于 token_blacklist**：MVP 阶段可先用内存 Set 存储黑名单（服务重启清空）。若需要持久化黑名单（用户登出后重启仍生效），则写入此表。每天定时清理已过期条目：`DELETE FROM token_blacklist WHERE expires_at < datetime('now')`。

---

## 六、API 接口定义

所有接口统一返回格式：

```json
{ "ok": true,  "data": { } }
{ "ok": false, "error": { "code": "INVALID_PASSWORD", "message": "密码错误" } }
```

HTTP 状态码：200 成功，400 参数错误，401 未认证，403 无权限，404 不存在，429 频率限制，500 服务器错误。

### 6.1 认证模块 `/api/auth`

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| POST | `/api/auth/register` | 否 | 邮箱注册 |
| POST | `/api/auth/login` | 否 | 邮箱登录 |
| POST | `/api/auth/refresh` | 否（携带旧token）| 刷新 Token |
| POST | `/api/auth/logout` | 是 | 登出（token 加入黑名单）|

**POST /api/auth/register**

```
Request:  { "email": "user@example.com", "password": "123456", "nickname": "棋手A" }
Response: { "ok": true, "data": { "token": "eyJ...", "user": { "id", "nickname", "email", "rating_gomoku", "rating_chess" } } }
```

**POST /api/auth/login**

```
Request:  { "email": "user@example.com", "password": "123456" }
Response: { "ok": true, "data": { "token": "eyJ...", "user": { ... } } }
```

**POST /api/auth/refresh**

```
Request Header: Authorization: Bearer <old_token>
Response: { "ok": true, "data": { "token": "eyJ..." } }
```

---

### 6.2 用户模块 `/api/users`

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/users/me` | 是 | 获取当前用户完整信息（含战绩） |
| PATCH | `/api/users/me` | 是 | 修改昵称/头像 |
| GET | `/api/users/:id` | 否 | 获取指定用户公开信息 |
| GET | `/api/users/:id/records` | 否 | 获取用户对局记录（分页） |

**GET /api/users/me**

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "nickname": "棋手A",
    "email": "user@example.com",
    "avatar": null,
    "rating_gomoku": 1450,
    "rating_chess": 1320,
    "created_at": "2026-04-14T10:00:00Z",
    "stats": {
      "gomoku":       { "wins": 10, "losses": 5, "draws": 1, "total_games": 16 },
      "chinese-chess":{ "wins": 3,  "losses": 8, "draws": 0, "total_games": 11 }
    }
  }
}
```

**PATCH /api/users/me**

```
Request:  { "nickname": "新昵称" }   （nickname 和 avatar 均可选）
Response: { "ok": true, "data": { "nickname": "新昵称", ... } }
```

**GET /api/users/:id/records**

```
Query: ?gameType=gomoku&page=1&limit=20
Response: { "ok": true, "data": { "records": [...], "total": 42, "page": 1 } }
```

每条记录：

```json
{
  "roomId": "xxx",
  "gameType": "gomoku",
  "mode": "ranked",
  "opponentNickname": "玩家B",
  "result": "win",           // "win" | "loss" | "draw"
  "ratingDelta": 18,
  "endReason": "five",
  "moveCount": 43,
  "finishedAt": "2026-04-14T11:30:00Z"
}
```

---

### 6.3 排行榜 `/api/leaderboard`

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/leaderboard/:gameType` | 否 | 获取积分前 N 名 |

```
Query: ?limit=10
Response: { "ok": true, "data": [ { "rank": 1, "userId", "nickname", "avatar", "rating", "wins", "losses" }, ... ] }
```

---

### 6.4 对局记录 `/api/records`

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/records/:roomId` | 否 | 获取对局详情（含完整步骤序列） |

```json
{
  "ok": true,
  "data": {
    "roomId": "ABC123",
    "gameType": "gomoku",
    "mode": "ranked",
    "player1": { "id", "nickname", "ratingBefore": 1432, "ratingAfter": 1450 },
    "player2": { "id", "nickname", "ratingBefore": 1498, "ratingAfter": 1480 },
    "winner": "player1",
    "endReason": "five",
    "moves": [ { "moveNumber": 1, "playerId", "moveData": {...}, "timeSpent": 5 }, ... ],
    "startedAt": "2026-04-14T11:00:00Z",
    "finishedAt": "2026-04-14T11:30:00Z"
  }
}
```

---

## 七、WebSocket 消息协议

### 7.1 统一消息格式

```json
// 上行（客户端 → 服务器）
{ "type": "消息类型", "roomId": "ABC123", "payload": { } }

// 下行（服务器 → 客户端）
{ "type": "消息类型", "roomId": "ABC123", "payload": { } }
```

`roomId` 在不涉及房间的消息中可省略（如 `auth`、`ping`、`join_queue`）。

### 7.2 上行消息（客户端 → 服务器）

| type | roomId | payload | 说明 |
|------|--------|---------|------|
| `auth` | — | `{ token }` | WebSocket 建立后第一条消息，必须在 10s 内发送 |
| `ping` | — | — | 客户端心跳，每 30s 发送一次 |
| `join_queue` | — | `{ gameType, mode }` | 加入匹配队列 |
| `leave_queue` | — | — | 离开匹配队列 |
| `create_room` | — | `{ gameType, mode }` | 创建邀请房间 |
| `join_room` | — | `{ roomId }` | 通过邀请码加入 |
| `leave_room` | roomId | — | 主动离开（等待中） |
| `ready` | roomId | — | 双方进入对局页后发送，确认已准备 |
| `move` | roomId | `{ moveData }` | 走棋意图（服务器验证后广播） |
| `resign` | roomId | — | 认输 |
| `draw_offer` | roomId | — | 请求和棋 |
| `draw_response` | roomId | `{ accept: bool }` | 响应和棋 |
| `undo_request` | roomId | — | 请求悔棋（休闲赛） |
| `undo_response` | roomId | `{ accept: bool }` | 响应悔棋 |

### 7.3 下行消息（服务器 → 客户端）

| type | payload | 说明 |
|------|---------|------|
| `auth_ok` | `{ userId, nickname, rating_gomoku, rating_chess }` | 鉴权成功 |
| `auth_fail` | `{ reason }` | 鉴权失败（token 无效/过期） |
| `pong` | — | 心跳响应 |
| `queue_joined` | `{ position, gameType, mode }` | 已加入匹配队列 |
| `queue_updated` | `{ position }` | 队列位置更新（可选，用于前端显示） |
| `matched` | `{ roomId, opponent: { nickname, rating } }` | 匹配成功 |
| `room_created` | `{ roomId, inviteCode }` | 房间创建成功 |
| `room_joined` | `{ roomId, roomState }` | 加入房间成功（含完整状态，断线重连也用此消息恢复） |
| `player_joined` | `{ userId, nickname }` | 对方进入房间 |
| `player_ready` | `{ userId }` | 对方已准备 |
| `game_start` | `{ firstTurn, boardState, myColor, timeLimit }` | 游戏开始 |
| `move_applied` | `{ moveData, boardState, nextTurn, timeLeft }` | 走棋被服务器确认并广播（己方和对方均收到） |
| `game_over` | `{ winner, reason, ratingDelta, newRating }` | 对局结束 |
| `draw_offered` | — | 对方请求和棋 |
| `draw_accepted` | — | 和棋达成 |
| `draw_rejected` | — | 和棋被拒 |
| `undo_requested` | `{ moveData }` | 对方请求悔棋（展示要悔的那步） |
| `undo_accepted` | `{ boardState, currentTurn }` | 悔棋成功，新棋盘状态 |
| `undo_rejected` | — | 悔棋被拒 |
| `timeout_warning` | `{ secondsLeft }` | 操作时间剩余 10s 警告 |
| `timeout` | `{ loser }` | 超时，loser 为超时方颜色 |
| `opponent_disconnected` | `{ waitSeconds: 60 }` | 对方掉线，等待重连 |
| `opponent_reconnected` | — | 对方重连成功，继续对局 |
| `error` | `{ code, message }` | 错误通知 |

**常用错误 code**：

| code | 含义 |
|------|------|
| `INVALID_MOVE` | 走棋不合法 |
| `NOT_YOUR_TURN` | 不是你的回合 |
| `ROOM_NOT_FOUND` | 房间不存在 |
| `ROOM_FULL` | 房间已满 |
| `ALREADY_IN_ROOM` | 已在房间中 |
| `ALREADY_IN_QUEUE` | 已在匹配队列中 |
| `GAME_NOT_STARTED` | 对局未开始 |
| `PARSE_ERROR` | 消息格式错误 |

---

## 八、关键流程

### 8.1 用户注册/登录流程

```
注册流程：
  客户端                            服务器
    │── POST /api/auth/register ──> │
    │   { email, password, nickname}│
    │                               │ 1. 校验参数（邮箱格式、密码长度、昵称长度）
    │                               │ 2. 查询 email 是否已存在
    │                               │ 3. bcrypt.hash(password, 10)
    │                               │ 4. 生成 UUID，写入 users 表
    │                               │ 5. 写入 user_stats（gomoku + chess 各一行）
    │                               │ 6. 签发 JWT（7天有效）
    │<── 200 { token, user } ───────│
    │
    │ 客户端将 token 存入 localStorage
    │ 后续所有请求携带 Authorization: Bearer <token>
    │ WebSocket 建立后立即发送 auth 消息
```

```
登录流程：
  客户端                            服务器
    │── POST /api/auth/login ──────>│
    │   { email, password }         │
    │                               │ 1. 查用户（by email）
    │                               │ 2. bcrypt.compare(password, hash)
    │                               │ 3. 签发新 JWT
    │<── 200 { token, user } ───────│
```

---

### 8.2 快速匹配流程

```
玩家A                    服务器（WS）                  玩家B
  │                          │                           │
  │── join_queue ──────────> │                           │
  │   { gameType, mode }     │ 加入匹配队列              │
  │<── queue_joined ─────────│ { position: 1 }          │
  │                          │                           │
  │                          │ <─── join_queue ──────────│
  │                          │      { gameType, mode }   │
  │                          │ 加入队列                  │
  │                          │ 执行匹配逻辑（每2s一次）  │
  │                          │ 积分差 ≤ 200 → 匹配成功  │
  │                          │ 创建房间（status=waiting）│
  │<── matched ─────────────│ { roomId, opponent }       │── matched ──────────>│
  │                          │                           │
  │ 客户端跳转到对局页        │                          │ 客户端跳转到对局页
  │── ready ───────────────> │                           │
  │                          │ <─── ready ───────────────│
  │                          │ 双方均 ready              │
  │                          │ status → playing          │
  │<── game_start ───────────│ { firstTurn, boardState } │── game_start ────────>│
  │                          │                           │
```

---

### 8.3 创建/加入房间流程

```
创建方（玩家A）             服务器                   加入方（玩家B）
  │                          │                           │
  │── create_room ──────────>│                           │
  │   { gameType, mode }     │ 生成 6 位邀请码           │
  │                          │ 写 rooms 表（status=waiting）
  │<── room_created ─────────│ { roomId, inviteCode }    │
  │                          │                           │
  │ 展示邀请码给玩家A        │                           │
  │                          │                           │
  │                          │ <─── join_room ───────────│
  │                          │      { roomId: inviteCode }│
  │                          │ 查找房间，验证 status     │
  │                          │ 分配颜色给 player2        │
  │<── player_joined ────────│ { nickname: "玩家B" }     │── room_joined ───────>│
  │                          │                           │
  │── ready ───────────────> │ <─── ready ───────────────│
  │                          │ 双方 ready → game_start   │
  │<── game_start ───────────│──────────────────────────>│
```

---

### 8.4 在线对弈走棋流程（服务器权威模式）

```
当前行棋方（黑）            服务器                    等待方（白）
  │                          │                           │
  │ 用户点击棋盘              │                           │
  │ （仅 UI 高亮，不落子）    │                           │
  │── move ────────────────> │ { moveData: {row,col} }   │
  │                          │ 1. 验证是否轮到该玩家      │
  │                          │ 2. GameValidator.validate  │
  │                          │ 3. 更新 boardState         │
  │                          │ 4. 写入 game_moves 表      │
  │                          │ 5. checkGameOver           │
  │                          │ 6. 重置步骤计时器          │
  │<── move_applied ─────────│ { moveData, boardState,   │── move_applied ──────>│
  │   (含己方走棋确认)        │   nextTurn, timeLeft }    │   (对方走棋通知)
  │                          │                           │
  │ 落子渲染                  │                          │ 落子渲染，轮到白方
  │                          │                           │

若 checkGameOver 返回 true：
  │<── game_over ────────────│ { winner, reason,         │── game_over ─────────>│
  │                          │   ratingDelta, newRating }│
  │                          │ 更新积分和战绩             │
```

---

### 8.5 认输流程

```
认输方                      服务器                    对手
  │                          │                           │
  │── resign ──────────────> │                           │
  │                          │ endGame(roomId, {         │
  │                          │   winner: opponentColor,  │
  │                          │   reason: 'resign'        │
  │                          │ })                        │
  │<── game_over ────────────│ { winner, reason,         │── game_over ─────────>│
  │   ratingDelta: -18       │   ratingDelta, newRating }│   ratingDelta: +18
```

---

### 8.6 超时流程

```
行棋方（黑）                服务器（TimerManager）      对手（白）
  │                          │                           │
  │                          │ 步骤计时器倒计时至 10s    │
  │<── timeout_warning ──────│ { secondsLeft: 10 }       │── timeout_warning ───>│
  │                          │                           │
  │                          │ 倒计时至 0                │
  │                          │ （积分赛）endGame →        │
  │                          │   winner=white, reason=timeout
  │<── timeout ──────────────│ { loser: 'black' }        │── timeout ───────────>│
  │<── game_over ────────────│ { winner, ratingDelta }   │── game_over ─────────>│
```

---

### 8.7 断线重连流程

```
断线玩家（黑）              服务器                    在线玩家（白）
  │                          │                           │
  │ 断线                     │ ws.close 事件触发         │
  │                          │ TimerManager.             │
  │                          │   startReconnectTimer     │
  │                          │   (roomId, userId, 60s)   │
  │                          │ room.players.black.       │
  │                          │   connected = false       │
  │                          │──── opponent_disconnected >│ { waitSeconds: 60 }
  │                          │ 步骤计时器暂停             │
  │                          │                           │
  │ （60s 内）重新连接       │                           │
  │── auth ────────────────> │ { token }                 │
  │<── auth_ok ──────────────│                           │
  │                          │ 检测到 userId 有进行中的房间│
  │── join_room ───────────> │ { roomId }                │
  │<── room_joined ──────────│ { roomState（完整棋盘）} │
  │                          │ reconnectTimer 取消       │
  │                          │ connected = true          │
  │                          │──── opponent_reconnected ─>│
  │                          │ 步骤计时器恢复             │
  │                          │                           │
  │ 超过 60s 未重连：        │                           │
  │                          │ endGame({                 │
  │                          │   winner: white,          │
  │                          │   reason: 'disconnect'    │
  │                          │ })                        │
  │                          │──── game_over ────────────>│
```

---

## 九、性能优化策略

### 9.1 SQLite 性能配置

```javascript
// server/src/db/index.js
const db = new Database('./data/qiju.db')
db.pragma('journal_mode = WAL')       // WAL 模式：读写不互斥
db.pragma('synchronous = NORMAL')     // 性能与安全的平衡（WAL 模式下安全）
db.pragma('cache_size = -64000')      // 64MB 页缓存
db.pragma('temp_store = MEMORY')      // 临时表存内存
db.pragma('mmap_size = 268435456')    // 256MB 内存映射
```

批量写入（如对局步骤）使用 `better-sqlite3` 的事务 API（`db.transaction()`），性能比逐条 INSERT 快 50x 以上。

### 9.2 内存管理

- 房间资源在对局结束后不立即释放，保留 5 分钟（供结果查看和断线重连），之后由定时任务清理。
- 匹配队列按 `gameType:mode` 分桶，避免全量扫描。
- WebSocket 连接数：单进程 Node.js 在 Linux 系统下理论支持 65535 个并发连接，棋类平台 MVP 阶段 1000 人在线绰绰有余。

### 9.3 前端资源优化

- `public/js/` 公共脚本按需引入，对局页只加载 `api.js`、`ws.js`、`auth.js` 和对应游戏的 `game.js`。
- 棋盘 Canvas 仅在状态变化时重绘（`requestAnimationFrame` 或事件驱动），不做无意义的全帧重绘。
- `shared/` 规则模块作为普通 `<script>` 在 HTML 中引入，浏览器缓存 `Cache-Control: max-age=86400`。
- CSS 变量（`:root { --primary: #... }`）统一管理主题色，无需构建工具。

### 9.4 WebSocket 心跳机制

- 客户端每 30 秒发送 `ping`，服务器响应 `pong`。
- 服务器侧：若某连接 90 秒内无任何消息（包括 ping），调用 `ws.terminate()` 强制断开，触发正常的断线重连流程。

---

## 十、部署架构

```
┌──────────────────────────────────────────────────────┐
│               服务器 124.222.97.96                    │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Nginx 1.24（80 / 443 端口）                   │  │
│  │                                                │  │
│  │  location /api/   → proxy_pass :3000 (HTTP)   │  │
│  │  location /ws     → proxy_pass :3000 (WS)     │  │
│  │  location /       → /var/www/h5-games/public/ │  │
│  │                                                │  │
│  │  SSL: Let's Encrypt（certbot 自动续期）         │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  PM2（守护进程）                                │  │
│  │  app: server/src/app.js                        │  │
│  │  port: 3000（HTTP + WS 同端口）                │  │
│  │  instances: 1（MVP 单进程）                    │  │
│  │  max_memory_restart: 500M                      │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  SQLite 数据库                                  │  │
│  │  路径: /var/www/h5-games/data/qiju.db          │  │
│  │  备份: 每日 cron 复制到 /backup/               │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Nginx 关键配置**：

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # 静态文件
    location / {
        root /var/www/h5-games/public;
        try_files $uri $uri/ /index.html;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }

    # REST API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;     # 24 小时，保持长连接
    }
}
```

**PM2 配置（ecosystem.config.js）**：

```javascript
module.exports = {
  apps: [{
    name: 'qiju',
    script: 'server/src/app.js',
    cwd: '/var/www/h5-games',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: { NODE_ENV: 'production' },
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
}
```

**环境变量（.env）**：

```
NODE_ENV=production
PORT=3000
JWT_SECRET=<随机64字节hex>
JWT_EXPIRES_IN=7d
DB_PATH=./data/qiju.db
BCRYPT_ROUNDS=10
```

---

## 十一、开发规范

### 11.1 目录和命名

- 文件名：`camelCase.js`（Service、Model）；路由文件用小写 `auth.js`。
- 类名：`PascalCase`。
- 常量：`UPPER_SNAKE_CASE`（集中在 `shared/constants.js`）。
- 数据库字段：`snake_case`；JS 对象属性：`camelCase`（Model 层负责转换）。

### 11.2 错误处理约定

- Service 层抛出结构化错误：`throw { code: 'EMAIL_EXISTS', message: '邮箱已注册', status: 400 }`。
- 路由层用 `try/catch` 捕获，传递给 `errorHandler` 中间件统一响应。
- WebSocket Handler 捕获异常后向客户端发送 `error` 消息，不允许抛出导致进程崩溃。

### 11.3 数据库操作规范

- 所有 DB 操作封装在 `models/` 层，Service 层不直接写 SQL。
- 使用 `better-sqlite3` 的 Prepared Statement（`db.prepare(sql)`），防止 SQL 注入。
- 涉及多表的写操作（如对局结束：更新 rooms + user_stats + rating_logs）必须放在事务中。

### 11.4 WebSocket 消息规范

- 所有消息必须有 `type` 字段；上行消息缺少 `type` 时响应 `error { code: 'PARSE_ERROR' }`。
- 服务端推送统一使用封装的 `send(ws, type, payload)` 和 `broadcast(room, type, payload)`，不直接调用 `ws.send()`。
- 消息 Handler 函数签名统一：`function handleXxx(ws, payload, roomId, ctx)` （`ctx` 为 Services 容器）。

### 11.5 前端规范

- 公共 JS 模块（`api.js`、`ws.js`、`auth.js`）通过全局变量暴露，如 `window.API`、`window.WS`、`window.Auth`，避免模块系统复杂度。
- 游戏改造原则：单机逻辑（`placeStone` / `movePiece`）保持不变，新增 `onlineMode` 分支，在线模式只发消息，等服务器 `move_applied` 后再调用原有渲染函数。
- 所有 HTTP 请求通过 `api.js` 的封装函数发起，不在业务代码中直接使用 `fetch`。

### 11.6 版本开发顺序（建议）

```
Phase 1（基础设施）：
  server/src/db/  → server/src/models/  → server/src/services/AuthService.js
  → server/src/routes/auth.js + users.js → 用 curl 联调

Phase 2（WebSocket 骨架）：
  server/src/ws.js（连接管理 + auth 消息）→ RoomManager → MatchmakingEngine
  → GameValidator（接入 shared 规则模块）→ TimerManager

Phase 3（前端改造）：
  public/js/auth.js + api.js + ws.js → login.html → index.html
  → 游戏大厅 hall.html → 游戏 game.js 改造（在线模式分支）

Phase 4（集成联调）：
  完整走棋流程 → 断线重连 → 积分结算 → 移动端适配验证
```
