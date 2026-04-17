'use strict'

const { queryAll, execute, withTransaction } = require('../db')

class MoveModel {
  async bulkInsert(roomId, moves) {
    await withTransaction(async db => {
      for (const [index, move] of moves.entries()) {
        await db.exec(
          `INSERT INTO game_moves (room_id, move_number, player_id, move_data, time_spent, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (room_id, move_number) DO NOTHING`,
          [
            roomId,
            index + 1,
            move.userId,
            JSON.stringify(move.moveData),
            move.timeSpent || null,
            new Date(move.timestamp || Date.now()).toISOString(),
          ]
        )
      }
    })
  }

  async findByRoomId(roomId) {
    const rows = await queryAll(
      `SELECT id, room_id, move_number, player_id, move_data, time_spent, created_at
       FROM game_moves
       WHERE room_id = ?
       ORDER BY move_number ASC`,
      [roomId]
    )

    return rows.map(row => ({
      ...row,
      moveData: JSON.parse(row.move_data),
    }))
  }
}

module.exports = new MoveModel()
