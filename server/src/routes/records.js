'use strict'

const express = require('express')
const router = express.Router()
const RoomModel = require('../models/RoomModel')
const MoveModel = require('../models/MoveModel')
const RatingLogModel = require('../models/RatingLogModel')

/**
 * GET /api/records/:roomId
 * 获取对局详情（含完整步骤序列）
 */
router.get('/:roomId', (req, res, next) => {
  try {
    const room = RoomModel.getDetail(req.params.roomId)
    if (!room) {
      return res.status(404).json({
        ok: false,
        error: { code: 'ROOM_NOT_FOUND', message: '对局记录不存在' },
      })
    }

    const moves = MoveModel.findByRoomId(room.id)
    const ratingLogs = RatingLogModel.findByRoomId(room.id)

    // 构造积分信息
    const ratingMap = {}
    for (const log of ratingLogs) {
      ratingMap[log.user_id] = {
        ratingBefore: log.rating_before,
        ratingAfter: log.rating_after,
        delta: log.delta,
      }
    }

    const player1Rating = ratingMap[room.player1_id] || {}
    const player2Rating = ratingMap[room.player2_id] || {}

    res.json({
      ok: true,
      data: {
        roomId: room.id,
        gameType: room.game_type,
        mode: room.mode,
        status: room.status,
        player1: {
          id: room.player1_id,
          nickname: room.player1_nickname,
          color: room.player1_color,
          ratingBefore: player1Rating.ratingBefore,
          ratingAfter: player1Rating.ratingAfter,
          ratingDelta: player1Rating.delta,
        },
        player2: {
          id: room.player2_id,
          nickname: room.player2_nickname,
          color: room.player2_color,
          ratingBefore: player2Rating.ratingBefore,
          ratingAfter: player2Rating.ratingAfter,
          ratingDelta: player2Rating.delta,
        },
        winnerId: room.winner_id,
        endReason: room.end_reason,
        moveCount: moves.length,
        moves: moves.map(m => ({
          moveNumber: m.move_number,
          playerId: m.player_id,
          moveData: m.moveData,
          timeSpent: m.time_spent,
          createdAt: m.created_at,
        })),
        startedAt: room.started_at,
        finishedAt: room.finished_at,
        createdAt: room.created_at,
      },
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
