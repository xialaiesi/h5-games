'use strict'

const elo = require('../../../shared/elo')
const UserModel = require('../models/UserModel')
const RatingLogModel = require('../models/RatingLogModel')
const RoomModel = require('../models/RoomModel')

/**
 * ELO 积分结算服务
 * 仅积分赛（mode=ranked）执行，休闲赛跳过
 */
class RatingCalculator {
  /**
   * 对局结束后结算积分
   * @param {string} roomId
   * @param {string|null} winnerId - null 表示平局
   * @param {string} reason - 结束原因
   * @param {{ player1Id, player2Id, gameType, mode }} roomInfo
   * @returns {{ deltaA: number, deltaB: number, newRatingA: number, newRatingB: number }|null}
   */
  settle(roomId, winnerId, reason, roomInfo) {
    const { player1Id, player2Id, gameType, mode } = roomInfo

    // 休闲赛不计积分
    if (mode !== 'ranked') return null

    const userA = UserModel.findById(player1Id)
    const userB = UserModel.findById(player2Id)
    if (!userA || !userB) return null

    const ratingCol = gameType === 'gomoku' ? 'rating_gomoku' : 'rating_chess'
    const ratingA = userA[ratingCol]
    const ratingB = userB[ratingCol]

    const statsA = this._getStats(userA.id, gameType)
    const statsB = this._getStats(userB.id, gameType)

    // 确定 A 方结果
    let resultA
    if (winnerId === null) {
      resultA = 'draw'
    } else if (winnerId === player1Id) {
      resultA = 'win'
    } else {
      resultA = 'loss'
    }

    const { newRatingA, newRatingB, deltaA, deltaB } =
      elo.calculate(ratingA, ratingB, resultA, statsA, statsB)

    // 写入积分变动记录
    RatingLogModel.insert({
      userId: player1Id,
      roomId,
      gameType,
      ratingBefore: ratingA,
      ratingAfter: newRatingA,
      delta: deltaA,
    })

    RatingLogModel.insert({
      userId: player2Id,
      roomId,
      gameType,
      ratingBefore: ratingB,
      ratingAfter: newRatingB,
      delta: deltaB,
    })

    // 更新用户积分
    UserModel.updateRating(player1Id, gameType, newRatingA)
    UserModel.updateRating(player2Id, gameType, newRatingB)

    // 更新战绩统计
    const resultB = resultA === 'win' ? 'loss' : resultA === 'loss' ? 'win' : 'draw'
    UserModel.updateStats(player1Id, gameType, resultA)
    UserModel.updateStats(player2Id, gameType, resultB)

    return { deltaA, deltaB, newRatingA, newRatingB }
  }

  /**
   * 获取用户在指定游戏的统计（用于 ELO K 值计算）
   */
  _getStats(userId, gameType) {
    const allStats = UserModel.getStats(userId)
    const stats = allStats[gameType] || { total_games: 0 }
    return { totalGames: stats.total_games }
  }
}

module.exports = new RatingCalculator()
