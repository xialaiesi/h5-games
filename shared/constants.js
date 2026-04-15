'use strict';

// ==================== 全局常量模块 ====================
// 前后端通用（UMD）

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Constants = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // 游戏类型
  var GAME_TYPES = {
    GOMOKU: 'gomoku',
    CHINESE_CHESS: 'chinese-chess',
  };

  // 房间状态
  var ROOM_STATUS = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished',
    ABANDONED: 'abandoned',
  };

  // 对局模式
  var GAME_MODES = {
    RANKED: 'ranked',
    CASUAL: 'casual',
  };

  // 棋子颜色
  var COLORS = {
    BLACK: 'black',
    WHITE: 'white',
    RED: 'red',
  };

  // 计时器参数
  var TIMER = {
    STEP_TIMEOUT: 60,       // 每步操作时限（秒）
    WARNING_AT: 10,         // 剩余多少秒时发 warning
    RECONNECT_TIMEOUT: 60,  // 断线等待重连时间（秒）
  };

  // WebSocket 消息类型（客户端 -> 服务端）
  var MSG_TYPES = {
    // 上行（客户端发送）
    AUTH: 'auth',
    PING: 'ping',
    JOIN_QUEUE: 'join_queue',
    LEAVE_QUEUE: 'leave_queue',
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    READY: 'ready',
    MOVE: 'move',
    RESIGN: 'resign',
    DRAW_OFFER: 'draw_offer',
    DRAW_RESPONSE: 'draw_response',
    UNDO_REQUEST: 'undo_request',
    UNDO_RESPONSE: 'undo_response',

    // 下行（服务端推送）
    AUTH_OK: 'auth_ok',
    AUTH_FAIL: 'auth_fail',
    PONG: 'pong',
    QUEUE_JOINED: 'queue_joined',
    QUEUE_UPDATED: 'queue_updated',
    MATCHED: 'matched',
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    PLAYER_JOINED: 'player_joined',
    PLAYER_READY: 'player_ready',
    GAME_START: 'game_start',
    MOVE_APPLIED: 'move_applied',
    GAME_OVER: 'game_over',
    DRAW_OFFERED: 'draw_offered',
    DRAW_ACCEPTED: 'draw_accepted',
    DRAW_REJECTED: 'draw_rejected',
    UNDO_REQUESTED: 'undo_requested',
    UNDO_ACCEPTED: 'undo_accepted',
    UNDO_REJECTED: 'undo_rejected',
    TIMEOUT_WARNING: 'timeout_warning',
    TIMEOUT: 'timeout',
    OPPONENT_DISCONNECTED: 'opponent_disconnected',
    OPPONENT_RECONNECTED: 'opponent_reconnected',
    ERROR: 'error',
  };

  // 错误码
  var ERROR_CODES = {
    INVALID_MOVE: 'INVALID_MOVE',
    NOT_YOUR_TURN: 'NOT_YOUR_TURN',
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    ROOM_FULL: 'ROOM_FULL',
    ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
    ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
    GAME_NOT_STARTED: 'GAME_NOT_STARTED',
    PARSE_ERROR: 'PARSE_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  };

  // 游戏配置参数
  var GAME_CONFIG = {
    STEP_TIME_LIMIT: 60,
    TIMEOUT_WARNING_AT: 10,
    RECONNECT_WAIT: 60,
    EXTRA_TIME_COUNT: 3,
    EXTRA_TIME_SECONDS: 30,
    ROOM_CLEANUP_DELAY: 300000,
    AUTH_TIMEOUT: 10000,
    HEARTBEAT_TIMEOUT: 90000,
    MATCHMAKING_INTERVAL: 2000,
    RATING_THRESHOLD_NARROW: 200,
    RATING_THRESHOLD_WIDE: 500,
    QUEUE_WIDEN_TIME1: 15000,
    QUEUE_WIDEN_TIME2: 30000,
  };

  return {
    GAME_TYPES: GAME_TYPES,
    ROOM_STATUS: ROOM_STATUS,
    GAME_MODES: GAME_MODES,
    COLORS: COLORS,
    TIMER: TIMER,
    MSG_TYPES: MSG_TYPES,
    ERROR_CODES: ERROR_CODES,
    GAME_CONFIG: GAME_CONFIG,
  };

}));
