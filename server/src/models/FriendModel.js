'use strict'

const { v4: uuidv4 } = require('uuid')

const { queryAll, queryOne, withTransaction } = require('../db')

function normalizePair(userA, userB) {
  return String(userA) < String(userB)
    ? [String(userA), String(userB)]
    : [String(userB), String(userA)]
}

class FriendModel {
  async listForUser(userId) {
    const friends = await queryAll(
      `SELECT
         f.id,
         CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END AS "userId",
         u.nickname,
         u.avatar,
         COALESCE(p.max_level, 1) AS "maxLevel",
         COALESCE(p.total_score, 0) AS "totalScore",
         f.accepted_at AS "acceptedAt"
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END
       LEFT JOIN user_bbq_progress p ON p.user_id = u.id
       WHERE (f.user_low_id = ? OR f.user_high_id = ?)
         AND f.status = 'accepted'
       ORDER BY COALESCE(f.accepted_at, f.updated_at) DESC`,
      [userId, userId, userId, userId]
    )

    const incomingRequests = await queryAll(
      `SELECT
         f.id,
         u.id AS "userId",
         u.nickname,
         u.avatar,
         COALESCE(p.max_level, 1) AS "maxLevel",
         COALESCE(p.total_score, 0) AS "totalScore",
         f.created_at AS "createdAt"
       FROM friendships f
       JOIN users u ON u.id = f.requested_by
       LEFT JOIN user_bbq_progress p ON p.user_id = u.id
       WHERE (f.user_low_id = ? OR f.user_high_id = ?)
         AND f.status = 'pending'
         AND f.requested_by <> ?
       ORDER BY f.created_at DESC`,
      [userId, userId, userId]
    )

    const outgoingRequests = await queryAll(
      `SELECT
         f.id,
         CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END AS "userId",
         u.nickname,
         u.avatar,
         COALESCE(p.max_level, 1) AS "maxLevel",
         COALESCE(p.total_score, 0) AS "totalScore",
         f.created_at AS "createdAt"
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END
       LEFT JOIN user_bbq_progress p ON p.user_id = u.id
       WHERE (f.user_low_id = ? OR f.user_high_id = ?)
         AND f.status = 'pending'
         AND f.requested_by = ?
       ORDER BY f.created_at DESC`,
      [userId, userId, userId, userId, userId]
    )

    return {
      friends,
      incomingRequests,
      outgoingRequests,
      summary: {
        friendCount: friends.length,
        incomingCount: incomingRequests.length,
        outgoingCount: outgoingRequests.length,
      },
    }
  }

  async sendRequest(userId, targetUserId) {
    if (String(userId) === String(targetUserId)) {
      const err = new Error('不能添加自己为好友')
      err.code = 'SELF_FRIEND_DISABLED'
      throw err
    }

    const [userLowId, userHighId] = normalizePair(userId, targetUserId)
    const now = new Date().toISOString()

    return withTransaction(async db => {
      const existing = await db.one(
        `SELECT id, requested_by AS "requestedBy", status
         FROM friendships
         WHERE user_low_id = ? AND user_high_id = ?`,
        [userLowId, userHighId]
      )

      if (existing) {
        if (existing.status === 'accepted') {
          const err = new Error('你们已经是好友了')
          err.code = 'FRIEND_EXISTS'
          throw err
        }
        if (existing.requestedBy === String(userId)) {
          const err = new Error('好友请求已经发出')
          err.code = 'REQUEST_EXISTS'
          throw err
        }

        await db.exec(
          `UPDATE friendships
           SET status = 'accepted', accepted_at = ?, updated_at = ?
           WHERE id = ?`,
          [now, now, existing.id]
        )
        return {
          relationId: existing.id,
          status: 'accepted',
          autoAccepted: true,
        }
      }

      const relationId = uuidv4()
      await db.exec(
        `INSERT INTO friendships (
           id, user_low_id, user_high_id, requested_by, status, created_at, updated_at, accepted_at
         ) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL)`,
        [relationId, userLowId, userHighId, userId, now, now]
      )

      return {
        relationId,
        status: 'pending',
        autoAccepted: false,
      }
    })
  }

  async acceptRequest(userId, requestId) {
    const now = new Date().toISOString()

    return withTransaction(async db => {
      const row = await db.one(
        `SELECT
           id,
           user_low_id AS "userLowId",
           user_high_id AS "userHighId",
           requested_by AS "requestedBy",
           status
         FROM friendships
         WHERE id = ?`,
        [requestId]
      )

      if (!row || row.status !== 'pending') {
        const err = new Error('好友请求不存在')
        err.code = 'REQUEST_NOT_FOUND'
        throw err
      }
      if (row.requestedBy === String(userId)) {
        const err = new Error('不能同意自己发出的请求')
        err.code = 'INVALID_REQUEST_ACTION'
        throw err
      }
      if (row.userLowId !== String(userId) && row.userHighId !== String(userId)) {
        const err = new Error('无权处理这条好友请求')
        err.code = 'REQUEST_FORBIDDEN'
        throw err
      }

      await db.exec(
        `UPDATE friendships
         SET status = 'accepted', accepted_at = ?, updated_at = ?
         WHERE id = ?`,
        [now, now, requestId]
      )
    })
  }

  async rejectRequest(userId, requestId) {
    return this._removePendingRequest(userId, requestId, 'incoming')
  }

  async cancelRequest(userId, requestId) {
    return this._removePendingRequest(userId, requestId, 'outgoing')
  }

  async removeFriend(userId, friendUserId) {
    const [userLowId, userHighId] = normalizePair(userId, friendUserId)

    await withTransaction(async db => {
      const row = await db.one(
        `SELECT id, status
         FROM friendships
         WHERE user_low_id = ? AND user_high_id = ?`,
        [userLowId, userHighId]
      )

      if (!row || row.status !== 'accepted') {
        const err = new Error('好友关系不存在')
        err.code = 'FRIEND_NOT_FOUND'
        throw err
      }

      await db.exec('DELETE FROM friendships WHERE id = ?', [row.id])
    })
  }

  async _removePendingRequest(userId, requestId, mode) {
    await withTransaction(async db => {
      const row = await db.one(
        `SELECT
           id,
           user_low_id AS "userLowId",
           user_high_id AS "userHighId",
           requested_by AS "requestedBy",
           status
         FROM friendships
         WHERE id = ?`,
        [requestId]
      )

      if (!row || row.status !== 'pending') {
        const err = new Error('好友请求不存在')
        err.code = 'REQUEST_NOT_FOUND'
        throw err
      }
      if (row.userLowId !== String(userId) && row.userHighId !== String(userId)) {
        const err = new Error('无权处理这条好友请求')
        err.code = 'REQUEST_FORBIDDEN'
        throw err
      }
      if (mode === 'incoming' && row.requestedBy === String(userId)) {
        const err = new Error('只能拒绝别人发来的请求')
        err.code = 'INVALID_REQUEST_ACTION'
        throw err
      }
      if (mode === 'outgoing' && row.requestedBy !== String(userId)) {
        const err = new Error('只能取消自己发出的请求')
        err.code = 'INVALID_REQUEST_ACTION'
        throw err
      }

      await db.exec('DELETE FROM friendships WHERE id = ?', [requestId])
    })
  }
}

module.exports = new FriendModel()
