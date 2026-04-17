'use strict'

const { v4: uuidv4 } = require('uuid')

const { queryAll, execute, withTransaction } = require('../db')
const { getCatalog, getCatalogItem } = require('../config/shopCatalog')

class ShopModel {
  async getState(userId) {
    const progress = await this._ensureProgress(userId)
    const inventory = await queryAll(
      `SELECT
         item_key AS "itemKey",
         item_name AS name,
         item_tag AS tag,
         quantity,
         total_spent AS "totalSpent",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM user_store_items
       WHERE user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [userId]
    )
    const history = await queryAll(
      `SELECT
         item_key AS "itemKey",
         item_name AS name,
         item_tag AS tag,
         unit_price AS "unitPrice",
         quantity,
         total_price AS "totalPrice",
         created_at AS "createdAt"
       FROM shop_purchase_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 8`,
      [userId]
    )

    const ownedMap = new Map(inventory.map(item => [item.itemKey, item.quantity]))
    const catalog = getCatalog().map(item => ({
      ...item,
      owned: ownedMap.get(item.itemKey) || 0,
      affordable: (progress.coins || 0) >= item.price,
    }))

    const summary = inventory.reduce((acc, item) => {
      acc.ownedKinds += 1
      acc.ownedCount += item.quantity || 0
      acc.spentTotal += item.totalSpent || 0
      return acc
    }, { ownedKinds: 0, ownedCount: 0, spentTotal: 0 })

    return {
      coins: progress.coins || 0,
      catalog,
      inventory,
      history,
      summary,
    }
  }

  async purchase(userId, itemKey, quantity = 1) {
    const item = getCatalogItem(itemKey)
    if (!item) {
      const err = new Error('商品不存在')
      err.code = 'ITEM_NOT_FOUND'
      throw err
    }

    const normalizedQuantity = parseInt(quantity, 10)
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 9) {
      const err = new Error('购买数量无效')
      err.code = 'INVALID_QUANTITY'
      throw err
    }

    const now = new Date().toISOString()
    const totalPrice = item.price * normalizedQuantity

    await withTransaction(async db => {
      const progress = await this._ensureProgress(userId, db)
      if ((progress.coins || 0) < totalPrice) {
        const err = new Error('金币不足')
        err.code = 'INSUFFICIENT_COINS'
        throw err
      }

      await db.exec(
        'UPDATE user_bbq_progress SET coins = coins - ?, updated_at = ? WHERE user_id = ?',
        [totalPrice, now, userId]
      )

      const existing = await db.one(
        `SELECT id, quantity, total_spent AS "totalSpent"
         FROM user_store_items
         WHERE user_id = ? AND item_key = ?`,
        [userId, item.itemKey]
      )

      if (existing) {
        await db.exec(
          `UPDATE user_store_items
           SET item_name = ?, item_tag = ?, quantity = ?, total_spent = ?, updated_at = ?
           WHERE id = ?`,
          [
            item.name,
            item.tag,
            (existing.quantity || 0) + normalizedQuantity,
            (existing.totalSpent || 0) + totalPrice,
            now,
            existing.id,
          ]
        )
      } else {
        await db.exec(
          `INSERT INTO user_store_items (
             id, user_id, item_key, item_name, item_tag, quantity, total_spent, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            userId,
            item.itemKey,
            item.name,
            item.tag,
            normalizedQuantity,
            totalPrice,
            now,
            now,
          ]
        )
      }

      await db.exec(
        `INSERT INTO shop_purchase_logs (
           id, user_id, item_key, item_name, item_tag, unit_price, quantity, total_price, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          userId,
          item.itemKey,
          item.name,
          item.tag,
          item.price,
          normalizedQuantity,
          totalPrice,
          now,
        ]
      )
    })

    return {
      itemKey: item.itemKey,
      quantity: normalizedQuantity,
      totalPrice,
      state: await this.getState(userId),
    }
  }

  async _ensureProgress(userId, adapter = null) {
    const db = adapter || {
      one: async (sql, params) => queryAll(sql, params).then(rows => rows[0] || null),
      exec: execute,
    }
    let progress = await db.one(
      `SELECT
         user_id,
         coins,
         max_level AS "maxLevel",
         total_score AS "totalScore"
       FROM user_bbq_progress
       WHERE user_id = ?`,
      [userId]
    )

    if (!progress) {
      const now = new Date().toISOString()
      await db.exec(
        `INSERT INTO user_bbq_progress (
           user_id, max_level, total_score, level_stars, coins, last_played, created_at, updated_at
         ) VALUES (?, 1, 0, '{}', 0, ?, ?, ?)`,
        [userId, now, now, now]
      )
      progress = {
        user_id: userId,
        coins: 0,
        maxLevel: 1,
        totalScore: 0,
      }
    }

    return progress
  }
}

module.exports = new ShopModel()
