# H5 棋牌游戏平台 SaaS 产品方案

> 版本：v1.0
> 日期：2026-04-14
> 状态：待评审

---

## 目录

1. [产品概述与目标](#一产品概述与目标)
2. [用户系统设计](#二用户系统设计)
3. [游戏大厅设计](#三游戏大厅设计)
4. [在线对弈系统设计](#四在线对弈系统设计)
5. [核心功能模块拆解](#五核心功能模块拆解)
6. [页面与界面设计](#六页面与界面设计)
7. [数据模型设计](#七数据模型设计)
8. [技术选型建议](#八技术选型建议)
9. [版本规划](#九版本规划)
10. [非功能性要求](#十非功能性要求)

---

## 一、产品概述与目标

### 1.1 背景

当前平台已有五子棋（gomoku）和中国象棋（chinese-chess）两款 H5 游戏，均基于纯前端 HTML5 + Vanilla JavaScript + Canvas 2D 实现，支持双人本地对战和单机人机模式。两款游戏代码结构清晰、移动端适配良好，具备扎实的单机基础。

本方案目标是在现有游戏基础上，增加**统一用户系统**和**实时在线对弈**能力，将平台升级为具备 SaaS 能力的多游戏在线棋牌平台。

### 1.2 产品定位

- **产品名称**：棋局（QiJu）—— H5 在线棋牌游戏平台
- **游戏类型**：策略棋类 / 在线对弈
- **目标平台**：H5（Web 浏览器，移动端优先）
- **目标用户**：18~45 岁，偏好传统棋类游戏的休闲玩家
- **核心价值主张**：注册即玩，随时随地与真实对手在线对弈

### 1.3 产品目标

| 目标维度 | 具体描述 |
|---|---|
| 用户体验 | 注册流程 30 秒内完成，进入对局 30 秒内匹配到对手 |
| 功能完整性 | 统一账号、在线匹配、实时对弈、对局记录 |
| 平台扩展性 | 架构支持后续接入更多棋类游戏（围棋、国际象棋等） |
| SaaS 能力 | 支持多租户（不同渠道/品牌）接入，共享用户和对局基础设施 |

### 1.4 SaaS 能力说明

本方案中的 SaaS 化体现在以下三个层面：

1. **平台多游戏共享**：用户注册一次，可进入所有游戏大厅，数据统一管理
2. **多渠道接入（租户）**：平台可向第三方网站/App 提供嵌入式游戏服务，通过 `tenantId` 区分来源，支持品牌定制
3. **能力对外开放**：后期可提供游戏 SDK 和 API，允许第三方开发者接入对弈引擎和匹配系统

---

## 二、用户系统设计

### 2.1 账号体系

所有游戏共用一套账号体系，用户在平台注册一次，即可游玩所有游戏。

**账号标识符（三选一登录）**：

| 登录方式 | 说明 | 优先级 |
|---|---|---|
| 手机号 + 短信验证码 | 国内用户最主流，转化率最高 | 主要 |
| 邮箱 + 密码 | 兜底方案，适合海外/非手机场景 | 次要 |
| 游客模式 | 无需注册直接进入，本地存储临时 ID，功能受限 | 体验入口 |

> 游客模式只能参与人机对战，无法进入在线匹配大厅，适当降低注册门槛。

### 2.2 注册流程

```
访问平台
  └─> 点击「开始游戏」
        ├─> 游客体验（仅人机）
        └─> 注册 / 登录
              ├─> 手机号 → 发送验证码 → 填写昵称 → 完成
              └─> 邮箱 → 设置密码 → 填写昵称 → 完成
```

**注册字段（最小化）**：
- 手机号或邮箱（必填，唯一）
- 验证码或密码（必填）
- 昵称（必填，2~12 字符，注册时随机生成默认值）
- 头像（可选，默认随机选取系统预设头像）

### 2.3 登录态管理

- 使用 **JWT（JSON Web Token）** 进行无状态身份认证
- Token 有效期：7 天
- 客户端将 Token 存储在 `localStorage`
- 每次 WebSocket 建立连接时，携带 Token 进行鉴权
- 支持「记住登录」（默认开启），关闭后 Token 存于 `sessionStorage`

### 2.4 个人资料与成长数据

每个用户拥有独立的个人主页，展示以下信息：

| 字段 | 说明 |
|---|---|
| 昵称 / 头像 | 可修改 |
| 注册时间 | 展示用 |
| 积分（Rating） | ELO 评分体系，初始 1000 分 |
| 段位 | 根据积分映射（见下表） |
| 胜 / 负 / 平 次数 | 分游戏类型统计 |
| 近期对局记录 | 最近 20 场，可回放（后期功能） |

**段位体系（ELO 积分映射）**：

| 段位 | 积分范围 | 图标色 |
|---|---|---|
| 入门 | 0 ~ 1099 | 灰 |
| 学徒 | 1100 ~ 1299 | 绿 |
| 棋士 | 1300 ~ 1499 | 蓝 |
| 强棋 | 1500 ~ 1699 | 紫 |
| 大师 | 1700 ~ 1999 | 金 |
| 宗师 | 2000+ | 红 |

### 2.5 ELO 积分规则

采用标准 ELO 评分公式：

```
预期胜率 E_A = 1 / (1 + 10^((R_B - R_A) / 400))
新积分   R_A' = R_A + K * (S_A - E_A)
  其中 K = 32（新手期 <20 场），K = 24（普通），K = 16（积分 >1800）
  S_A = 1（胜），0.5（平），0（负）
```

---

## 三、游戏大厅设计

### 3.1 大厅结构

平台首页为统一大厅，用户登录后进入。大厅包含：

- **游戏入口区**：五子棋、中国象棋的入口卡片，后续可扩展更多游戏
- **当前在线人数**：实时展示各游戏在线人数和等待匹配人数
- **排行榜**：按游戏分类展示积分前 10 名
- **个人状态栏**：当前用户昵称、积分、段位、未读消息

### 3.2 游戏大厅（进入具体游戏后）

每个游戏有独立的子大厅页面，包含：

**三种进入方式**：

| 方式 | 描述 | 适合场景 |
|---|---|---|
| 快速匹配 | 系统自动按积分匹配一位对手 | 随机对战 |
| 创建房间 | 生成邀请码/链接，等待好友加入 | 熟人对战 |
| 加入房间 | 输入邀请码进入指定房间 | 熟人对战 |

### 3.3 快速匹配机制

**匹配算法**：

1. 用户进入匹配队列，携带游戏类型和积分
2. 优先匹配积分差 ≤ 200 分的对手（精准匹配）
3. 等待超过 15 秒，扩大范围至积分差 ≤ 500 分
4. 等待超过 30 秒，匹配任意在线用户
5. 等待超过 60 秒，提示用户邀请好友或与 AI 对战

**匹配成功后**：
- 双方收到匹配成功通知
- 系统自动创建对局房间，双方跳转进入
- 先到者等待对方确认（最多 10 秒，超时取消并重新匹配）

### 3.4 房间系统

**房间状态流转**：

```
[waiting] 等待玩家 → [ready] 双方就绪 → [playing] 对战中 → [finished] 已结束
                                                          └→ [abandoned] 已放弃（断线）
```

**房间属性**：

| 属性 | 说明 |
|---|---|
| roomId | 唯一标识，6 位大写字母数字 |
| gameType | gomoku / chinese-chess |
| mode | ranked（积分赛）/ casual（休闲赛） |
| players | 最多 2 名玩家（含座位和颜色分配） |
| spectators | 旁观者列表（后期功能） |
| timeLimit | 每步操作时限（默认 60 秒）|

**座位与颜色分配**：
- 五子棋：先加入者执黑，后加入者执白；积分赛由系统随机决定
- 中国象棋：先加入者执红，后加入者执黑；积分赛由系统随机决定

### 3.5 操作时限与超时处理

- 每步棋默认 **60 秒**操作时限，可见倒计时
- 超时自动判负（积分赛）或提示并继续（休闲赛）
- 积分赛中每方有 **3 次 30 秒延时机会**（类似围棋读秒）

---

## 四、在线对弈系统设计

### 4.1 实时通信方案

采用 **WebSocket** 作为实时通信协议，理由：

- 与现有纯前端技术栈无缝集成，原生支持
- 双向全双工，延迟极低，适合棋类对弈
- 实现成本低，运维简单

**WebSocket 消息格式（JSON）**：

```json
{
  "type": "消息类型",
  "roomId": "房间ID",
  "payload": { }
}
```

### 4.2 消息类型定义

**客户端 → 服务器（上行）**：

| 消息类型 | 说明 | payload |
|---|---|---|
| `auth` | WebSocket 连接鉴权 | `{ token }` |
| `join_queue` | 加入匹配队列 | `{ gameType, mode }` |
| `leave_queue` | 离开匹配队列 | - |
| `create_room` | 创建房间 | `{ gameType, mode }` |
| `join_room` | 加入房间 | `{ roomId }` |
| `leave_room` | 离开房间 | `{ roomId }` |
| `ready` | 玩家准备就绪 | `{ roomId }` |
| `move` | 走棋操作 | `{ roomId, moveData }` |
| `resign` | 认输 | `{ roomId }` |
| `draw_offer` | 发起和棋请求 | `{ roomId }` |
| `draw_response` | 响应和棋请求 | `{ roomId, accept: bool }` |
| `undo_request` | 请求悔棋 | `{ roomId }` |
| `undo_response` | 响应悔棋请求 | `{ roomId, accept: bool }` |
| `ping` | 心跳 | - |

**服务器 → 客户端（下行）**：

| 消息类型 | 说明 | payload |
|---|---|---|
| `auth_ok` | 鉴权成功 | `{ userId, nickname }` |
| `auth_fail` | 鉴权失败 | `{ reason }` |
| `queue_joined` | 已进入匹配队列 | `{ position }` |
| `matched` | 匹配成功 | `{ roomId, opponent }` |
| `room_created` | 房间创建成功 | `{ roomId, inviteCode }` |
| `room_joined` | 成功加入房间 | `{ roomId, roomState }` |
| `player_ready` | 对方已准备 | `{ userId }` |
| `game_start` | 游戏开始 | `{ firstMove, boardState }` |
| `opponent_move` | 对方走棋 | `{ moveData, boardState }` |
| `game_over` | 对局结束 | `{ result, reason, ratingDelta }` |
| `draw_offered` | 对方请求和棋 | - |
| `draw_accepted` | 和棋达成 | - |
| `draw_rejected` | 和棋被拒 | - |
| `undo_requested` | 对方请求悔棋 | - |
| `undo_accepted` | 悔棋被接受 | `{ newBoardState }` |
| `undo_rejected` | 悔棋被拒 | - |
| `opponent_disconnected` | 对方掉线 | `{ waitSeconds }` |
| `opponent_reconnected` | 对方重连 | - |
| `timeout_warning` | 操作时间即将超时 | `{ secondsLeft }` |
| `timeout` | 操作超时判负 | `{ loser }` |
| `error` | 错误通知 | `{ code, message }` |
| `pong` | 心跳响应 | - |

### 4.3 走棋数据结构

**五子棋 moveData**：
```json
{
  "row": 7,
  "col": 7,
  "player": 1
}
```

**中国象棋 moveData**：
```json
{
  "from": { "row": 9, "col": 4 },
  "to":   { "row": 8, "col": 4 },
  "piece": "K",
  "captured": " "
}
```

### 4.4 棋局同步策略

采用**服务器权威模式（Server Authoritative）**，保证双方棋局一致性：

1. 玩家客户端发送走棋意图（`move` 消息）
2. 服务器验证走法合法性（防止作弊）
3. 验证通过后，服务器将走棋结果广播给房间内双方
4. 客户端接收 `opponent_move` 后更新本地棋盘状态
5. 服务器保存完整棋局历史记录

**走法合法性校验（服务端实现）**：
- 五子棋：校验坐标范围、落点是否为空
- 中国象棋：复用前端走法生成逻辑，在 Node.js 服务端实现相同的棋规校验

> 注意：现有游戏的走法校验逻辑（getMoves、checkWin 等函数）需要提取为独立模块，供前后端共用。

### 4.5 断线重连机制

- 玩家断线后，服务器保持房间状态，等待 **60 秒**重连
- 断线期间，对方收到 `opponent_disconnected` 提示，对手倒计时暂停
- 玩家重连后，服务器推送完整棋盘状态（`room_joined` 携带最新 boardState）
- 超过 60 秒未重连，判断断线方负

### 4.6 对局结束处理

对局结束后，服务器完成以下操作：

1. 向双方推送 `game_over` 消息，包含胜负结果和积分变动
2. 将对局记录写入数据库（完整步骤序列、胜负结果、时间戳）
3. 更新双方 ELO 积分
4. 更新双方胜负统计
5. 释放房间资源（5 分钟后清理）

---

## 五、核心功能模块拆解

### 5.1 模块总览

```
平台
├── 前端（Frontend）
│   ├── 平台主站（Platform Shell）
│   │   ├── 首页大厅
│   │   ├── 用户中心
│   │   └── 通用组件（导航、模态框、Toast）
│   └── 游戏模块（Game Modules）
│       ├── 游戏大厅（匹配、房间）
│       ├── 五子棋对局界面
│       └── 中国象棋对局界面
│
└── 后端（Backend）
    ├── HTTP API 服务
    │   ├── 用户认证模块（Auth）
    │   ├── 用户资料模块（Profile）
    │   └── 对局记录模块（Records）
    └── WebSocket 服务
        ├── 连接管理（Connection Manager）
        ├── 房间管理（Room Manager）
        ├── 匹配引擎（Matchmaking Engine）
        ├── 游戏逻辑校验（Game Validator）
        └── 积分计算（Rating Calculator）
```

### 5.2 各模块职责

**前端 - 平台主站**

负责统一的页面框架、路由管理、用户状态（登录态、个人信息）的全局维护，以及与后端 HTTP API 和 WebSocket 的通信封装。

**前端 - 游戏模块**

在现有游戏代码基础上进行改造：
- 将单机 `placeStone` / `movePiece` 逻辑拆分为「本地渲染」和「网络操作」两层
- 在线模式下，玩家操作先发送 WebSocket 消息，等待服务器确认后再渲染
- 单机模式（人机/双人）保持原有逻辑不变，向下兼容

**后端 - 用户认证模块（Auth）**

| 接口 | 方法 | 描述 |
|---|---|---|
| `/api/auth/register` | POST | 注册（手机号/邮箱）|
| `/api/auth/login` | POST | 登录 |
| `/api/auth/send-code` | POST | 发送短信验证码 |
| `/api/auth/refresh` | POST | 刷新 Token |
| `/api/auth/logout` | POST | 登出（Token 加入黑名单）|

**后端 - 用户资料模块（Profile）**

| 接口 | 方法 | 描述 |
|---|---|---|
| `/api/users/me` | GET | 获取当前用户信息 |
| `/api/users/me` | PATCH | 修改昵称/头像 |
| `/api/users/:id` | GET | 获取指定用户公开信息 |
| `/api/users/:id/records` | GET | 获取指定用户对局记录 |
| `/api/leaderboard/:gameType` | GET | 获取排行榜 |

**后端 - 房间管理（Room Manager）**

运行在内存中（或 Redis），管理所有活跃房间的状态。采用 Map 结构：`roomId -> RoomState`。每个 RoomState 包含：玩家列表、棋盘状态、步骤历史、操作时限计时器等。

**后端 - 匹配引擎（Matchmaking Engine）**

维护各游戏的匹配队列（内存队列），定时（每 2 秒）执行匹配逻辑，根据积分差和等待时长动态调整匹配范围。

---

## 六、页面与界面设计

### 6.1 页面清单

| 页面 | 路径 | 说明 |
|---|---|---|
| 平台首页/大厅 | `/` | 游戏入口、排行榜、在线人数 |
| 注册页 | `/register` | 手机号/邮箱注册 |
| 登录页 | `/login` | 手机号/邮箱登录 |
| 个人中心 | `/profile` | 个人信息、战绩统计 |
| 用户主页 | `/user/:id` | 他人公开资料（只读）|
| 游戏大厅-五子棋 | `/hall/gomoku` | 匹配入口、在线人数、排行 |
| 游戏大厅-中国象棋 | `/hall/chinese-chess` | 同上 |
| 对局页-五子棋 | `/game/gomoku/:roomId` | 对局界面 |
| 对局页-中国象棋 | `/game/chinese-chess/:roomId` | 对局界面 |
| 对局回放页 | `/replay/:recordId` | 棋局回放（后期功能）|
| 排行榜页 | `/leaderboard` | 全平台积分榜 |
| 404 页 | `*` | 未找到 |

### 6.2 核心页面交互设计

**平台首页**
```
+------------------------------------------+
|  [Logo] 棋局           [登录] [注册]       |
+------------------------------------------+
|                                          |
|   五子棋          中国象棋                |
|  [进入大厅]       [进入大厅]              |
|  在线 128 人       在线 56 人             |
|                                          |
+------------------------------------------+
|  积分排行榜（五子棋）                      |
|  1. 玩家A  2100分                        |
|  2. 玩家B  1980分                        |
+------------------------------------------+
```

**游戏大厅页**
```
+------------------------------------------+
|  < 返回   五子棋大厅        [个人中心]     |
+------------------------------------------+
|  我的积分：1450  段位：棋士               |
|  在线人数：128   等待匹配：12             |
+------------------------------------------+
|  [ 快速匹配 ]   [ 创建房间 ]  [ 加入房间 ] |
+------------------------------------------+
|  [ 人机对战 ]   [ 本地双人 ]              |
+------------------------------------------+
```

**对局页（在线模式）**
```
+------------------------------------------+
|  对手：玩家B  1480分  ⏱ 00:45            |
|  [黑棋 ●]                                |
+------------------------------------------+
|                                          |
|            [ 棋盘 Canvas ]               |
|                                          |
+------------------------------------------+
|  [白棋 ○] 我方：玩家A  1450分  ⏱ 01:00  |
+------------------------------------------+
|  [认输]  [请求和棋]  [请求悔棋]            |
+------------------------------------------+
```

**匹配等待弹窗**
```
+-----------------------------+
|  正在匹配对手...             |
|  已等待：00:12               |
|  积分范围：±200              |
|                             |
|  [取消匹配]                  |
+-----------------------------+
```

**邀请好友弹窗**
```
+-----------------------------+
|  房间码：ABC123              |
|  [复制链接]  [分享]          |
|  等待好友加入...              |
|                             |
|  [取消]                     |
+-----------------------------+
```

### 6.3 移动端适配要点

- 所有页面采用移动端优先设计，最大宽度 480px，居中显示
- 对局页棋盘占满屏幕宽度，操作按钮置于底部
- 手势：点击落子/选子（与现有实现一致，无需更改）
- 倒计时显示在棋盘上方，字号足够大，清晰可见
- 网络异常时显示浮层提示，不遮挡棋盘

---

## 七、数据模型设计

### 7.1 用户表（users）

```sql
CREATE TABLE users (
  id            VARCHAR(36)   PRIMARY KEY,          -- UUID
  phone         VARCHAR(20)   UNIQUE,               -- 手机号（可为空）
  email         VARCHAR(100)  UNIQUE,               -- 邮箱（可为空）
  password_hash VARCHAR(255),                       -- 密码哈希（邮箱注册时有值）
  nickname      VARCHAR(30)   NOT NULL,
  avatar        VARCHAR(255),                       -- 头像 URL
  rating_gomoku     INT       NOT NULL DEFAULT 1000, -- 五子棋积分
  rating_chess      INT       NOT NULL DEFAULT 1000, -- 中国象棋积分
  is_guest      BOOLEAN       NOT NULL DEFAULT FALSE,
  tenant_id     VARCHAR(36),                        -- SaaS 租户 ID（NULL 表示平台自有）
  created_at    DATETIME      NOT NULL,
  updated_at    DATETIME      NOT NULL
);
```

### 7.2 用户战绩表（user_stats）

```sql
CREATE TABLE user_stats (
  id          VARCHAR(36)  PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL REFERENCES users(id),
  game_type   VARCHAR(30)  NOT NULL,    -- gomoku / chinese-chess
  wins        INT          NOT NULL DEFAULT 0,
  losses      INT          NOT NULL DEFAULT 0,
  draws       INT          NOT NULL DEFAULT 0,
  total_games INT          NOT NULL DEFAULT 0,
  UNIQUE (user_id, game_type)
);
```

### 7.3 游戏房间表（rooms）

```sql
CREATE TABLE rooms (
  id            VARCHAR(36)   PRIMARY KEY,
  invite_code   VARCHAR(10)   UNIQUE,              -- 6 位邀请码
  game_type     VARCHAR(30)   NOT NULL,
  mode          VARCHAR(20)   NOT NULL,            -- ranked / casual
  status        VARCHAR(20)   NOT NULL,            -- waiting / playing / finished / abandoned
  player1_id    VARCHAR(36)   REFERENCES users(id),
  player2_id    VARCHAR(36)   REFERENCES users(id),
  player1_color VARCHAR(10),                       -- black/white 或 red/black
  player2_color VARCHAR(10),
  winner_id     VARCHAR(36)   REFERENCES users(id), -- NULL 表示平局
  end_reason    VARCHAR(30),                       -- resign / timeout / checkmate / draw
  started_at    DATETIME,
  finished_at   DATETIME,
  created_at    DATETIME      NOT NULL
);
```

### 7.4 对局步骤表（game_moves）

```sql
CREATE TABLE game_moves (
  id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
  room_id     VARCHAR(36)   NOT NULL REFERENCES rooms(id),
  move_number INT           NOT NULL,              -- 第几步（从 1 开始）
  player_id   VARCHAR(36)   NOT NULL REFERENCES users(id),
  move_data   JSON          NOT NULL,              -- 走棋数据（结构见第四章）
  time_spent  INT,                                 -- 本步耗时（秒）
  created_at  DATETIME      NOT NULL,
  INDEX idx_room_id (room_id)
);
```

### 7.5 积分变动记录表（rating_logs）

```sql
CREATE TABLE rating_logs (
  id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
  user_id     VARCHAR(36)   NOT NULL REFERENCES users(id),
  room_id     VARCHAR(36)   NOT NULL REFERENCES rooms(id),
  game_type   VARCHAR(30)   NOT NULL,
  rating_before INT         NOT NULL,
  rating_after  INT         NOT NULL,
  delta         INT         NOT NULL,              -- 正数涨分，负数降分
  created_at  DATETIME      NOT NULL,
  INDEX idx_user_id (user_id)
);
```

### 7.6 租户表（tenants）—— SaaS 多租户支持

```sql
CREATE TABLE tenants (
  id            VARCHAR(36)   PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  domain        VARCHAR(255),                      -- 绑定域名
  api_key       VARCHAR(64)   UNIQUE NOT NULL,     -- API 密钥
  config        JSON,                              -- 定制化配置（品牌色、Logo 等）
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL
);
```

### 7.7 内存数据结构（运行时，非持久化）

**房间状态（Room State，存储于服务端内存/Redis）**：

```javascript
{
  roomId: "ABC123",
  gameType: "gomoku",           // gomoku / chinese-chess
  mode: "ranked",
  status: "playing",
  players: {
    black: {
      userId: "u1",
      nickname: "玩家A",
      socketId: "s1",
      rating: 1450,
      connected: true,
      timeLeft: 55,             // 本步剩余秒数
      extraTime: 3              // 剩余延时次数
    },
    white: { ... }
  },
  boardState: [ /* 完整棋盘数组 */ ],
  moveHistory: [ /* 所有步骤 */ ],
  currentTurn: "black",
  moveCount: 12,
  timerInterval: null           // 服务端计时器引用
}
```

**匹配队列条目**：

```javascript
{
  userId: "u2",
  nickname: "玩家B",
  socketId: "s2",
  rating: 1480,
  gameType: "gomoku",
  mode: "ranked",
  joinedAt: 1712000000000       // 毫秒时间戳
}
```

---

## 八、技术选型建议

### 8.1 总体架构

```
[浏览器客户端]
     |
     |── HTTP REST API ──> [Node.js HTTP Server]
     |                           |
     └── WebSocket ──────> [Node.js WS Server]
                                 |
                         [MySQL 数据库] + [Redis 缓存]
```

### 8.2 后端技术栈

| 层次 | 技术 | 选型理由 |
|---|---|---|
| 运行时 | Node.js 20 LTS | 与现有前端技术栈同语言，JS 游戏逻辑可复用；事件驱动适合高并发连接 |
| HTTP 框架 | Express.js | 成熟稳定，上手快，中间件生态丰富 |
| WebSocket | ws 库（原生）| 轻量无依赖，性能好；现阶段无需 Socket.IO 的复杂性 |
| 数据库 | MySQL 8.0 | 服务器已有或可快速部署；关系型数据适合对局记录查询 |
| ORM | Prisma | 类型安全，Schema 即文档，迁移管理方便 |
| 缓存 | Redis | 存储房间状态、匹配队列、Token 黑名单；支持后期水平扩展 |
| 认证 | jsonwebtoken | JWT 生成和验证，无状态设计 |
| 密码加密 | bcrypt | 行业标准 |
| 验证码 | 阿里云短信 / Twilio | 手机号注册验证 |
| 进程管理 | PM2 | 生产环境守护进程、日志管理、零停机重启 |

### 8.3 前端改造方案

**不引入框架，保持 Vanilla JS 技术栈**，理由：
- 现有游戏代码质量良好，不必要的框架引入会增加改造成本
- H5 平台首要考虑包体大小和加载速度
- 游戏 Canvas 渲染逻辑与框架无强绑定

**改造策略**：

```
现有文件结构（改造后）
├── index.html                  # 平台首页（新建）
├── login.html                  # 登录注册页（新建）
├── profile.html                # 个人中心（新建）
├── js/
│   ├── api.js                  # HTTP API 封装（新建）
│   ├── ws.js                   # WebSocket 封装（新建）
│   ├── auth.js                 # 登录态管理（新建）
│   └── router.js               # 简单的客户端路由（新建）
├── gomoku/
│   ├── index.html              # 改造：增加在线模式 UI
│   ├── game.js                 # 改造：拆分渲染层和逻辑层
│   ├── hall.html               # 新建：五子棋大厅页
│   └── hall.js                 # 新建：大厅逻辑
└── chinese-chess/
    ├── index.html              # 改造：同上
    ├── game.js                 # 改造：同上
    ├── hall.html               # 新建
    └── hall.js                 # 新建
```

**游戏代码改造核心思路**：

```javascript
// 改造前：直接操作棋盘
function placeStone(row, col) {
  state.board[row][col] = state.current;
  // ...
}

// 改造后：区分单机和在线模式
function placeStone(row, col) {
  if (state.onlineMode) {
    // 在线模式：发送到服务器，等待广播
    ws.send({ type: 'move', roomId: state.roomId, moveData: { row, col } });
    // 不立即修改棋盘，等 opponent_move / 服务器确认
  } else {
    // 单机模式：原有逻辑不变
    applyMove(row, col);
  }
}

// 服务器确认后执行
function applyMove(row, col, player) {
  state.board[row][col] = player || state.current;
  // ... 原有渲染逻辑
}
```

### 8.4 部署架构

**当前服务器（124.222.97.96）部署方案**：

```
服务器（单机）
├── Nginx（80/443 端口）
│   ├── 反向代理 HTTP API → localhost:3000
│   ├── 反向代理 WebSocket → localhost:3001
│   └── 静态文件托管 → /var/www/h5-games/
├── Node.js HTTP Server（3000 端口）
├── Node.js WS Server（3001 端口）
├── MySQL 5.7/8.0（3306 端口，仅本地访问）
└── Redis（6379 端口，仅本地访问）
```

**Nginx WebSocket 代理配置关键点**：
```nginx
location /ws {
  proxy_pass http://localhost:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;   # 长连接超时设为 24 小时
}
```

### 8.5 游戏逻辑复用方案

现有游戏的核心逻辑（走法校验、胜负判断）需要在服务端重新实现，以确保权威性。建议做法：

1. 将 `gomoku/game.js` 中的 `checkWin`、`GRID_COUNT` 等提取为 `shared/gomoku-rules.js`
2. 将 `chinese-chess/game.js` 中的 `getMoves`、`isInCheck`、`hasAnyMove` 等提取为 `shared/chess-rules.js`
3. 前后端均 `import` / `require` 这些共享模块，保证规则一致性

---

## 九、版本规划

### 9.1 MVP 版本（预计 4~6 周）

**目标**：上线核心功能，跑通完整用户链路

**功能列表**：
- [x] 统一用户注册/登录（邮箱+密码，暂不做短信）
- [x] JWT 认证
- [x] 个人信息展示（昵称、积分、胜负统计）
- [x] 平台首页/游戏入口
- [x] 五子棋在线对战（快速匹配 + 邀请码）
- [x] 中国象棋在线对战（快速匹配 + 邀请码）
- [x] 对局中实时通信（走棋同步、认输、超时）
- [x] ELO 积分计算与更新
- [x] 对局记录存储
- [x] 断线重连（60 秒内）
- [x] 移动端适配

**不做（MVP 暂缓）**：
- 短信验证码（成本，用邮箱替代）
- 棋局回放
- 旁观模式
- 排行榜页面（仅首页展示 Top 10）
- 多租户/SaaS 对外能力

### 9.2 v1.1 版本（MVP 后 2~3 周）

- 手机号 + 短信验证码登录
- 排行榜独立页面
- 头像上传
- 段位徽章展示
- 请求悔棋功能
- 和棋请求功能
- 积分赛操作时限延时功能

### 9.3 v1.2 版本（v1.1 后 3~4 周）

- 棋局回放功能
- 旁观模式
- 游戏内聊天（预设短语）
- 邀请好友分享（URL 分享）
- 性能优化（Redis 接管房间状态）

### 9.4 v2.0 版本（中长期）

- SaaS 多租户体系（租户管理后台、API Key 分发）
- 对外 SDK 发布（嵌入第三方页面）
- 新游戏接入（围棋、国际跳棋）
- 赛事/锦标赛系统
- 好友系统

---

## 十、非功能性要求

### 10.1 性能指标

| 指标 | 目标值 |
|---|---|
| 走棋消息端到端延迟 | < 200ms（同大陆） |
| HTTP API 响应时间（P95） | < 500ms |
| 单服务器并发 WebSocket 连接 | > 500 连接 |
| 单服务器并发对局房间 | > 200 个 |
| 前端首屏加载时间 | < 2 秒（4G 网络） |
| 游戏页面 Canvas FPS | ≥ 30 FPS |

### 10.2 安全要求

- 所有 HTTP API 接口强制 HTTPS
- WebSocket 使用 WSS（通过 Nginx TLS 终端）
- JWT Token 设置合理过期时间，登出时加入 Redis 黑名单
- 密码使用 bcrypt hash 存储（cost factor ≥ 10）
- 防作弊：走法合法性由服务端权威校验，拒绝非法走棋
- 防刷：注册接口添加频率限制（同 IP 每分钟最多 5 次）
- SQL 注入：使用 ORM Parameterized Query，禁止拼接 SQL

### 10.3 可观测性

- 使用 PM2 管理进程日志
- 关键事件结构化日志：用户登录、对局开始/结束、异常断线
- 定期备份 MySQL 数据（每日 cron）

---

## 附录：关键决策记录

| 决策点 | 选择 | 理由 |
|---|---|---|
| 实时通信协议 | WebSocket（原生 ws 库）| 技术栈匹配，实现简单，适合当前规模 |
| 认证方案 | JWT | 无状态，适合 WebSocket 鉴权场景 |
| 棋局同步策略 | 服务器权威模式 | 防止作弊，保证一致性 |
| 前端框架 | 不引入（保持 Vanilla JS）| 改造成本最低，性能最好 |
| 数据库 | MySQL | 关系型数据，对局记录查询场景适合 |
| MVP 登录方式 | 邮箱+密码（不做短信）| 快速上线，降低依赖 |
| 游戏逻辑位置 | 前后端共享模块 | 保证规则一致，防作弊 |
