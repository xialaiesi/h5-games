'use strict'

const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')

const { execute, queryOne } = require('../db')
const UserModel = require('../models/UserModel')

const JWT_SECRET = () => process.env.JWT_SECRET || 'default_dev_secret_change_in_production'
const JWT_EXPIRES = '7d'
const BCRYPT_ROUNDS = 10
const PHONE_RE = /^1\d{10}$/

class AuthService {
  async register({ phone, password, nickname }) {
    const normalizedPhone = this._normalizePhone(phone)

    if (!normalizedPhone || !PHONE_RE.test(normalizedPhone)) {
      const err = new Error('手机号格式不正确')
      err.code = 'INVALID_PHONE'
      throw err
    }
    if (!password || password.length < 6) {
      const err = new Error('密码长度不能少于 6 位')
      err.code = 'INVALID_PASSWORD'
      throw err
    }
    if (!nickname || nickname.length < 2 || nickname.length > 12) {
      const err = new Error('昵称长度须在 2~12 字符之间')
      err.code = 'INVALID_NICKNAME'
      throw err
    }

    if (await UserModel.findByPhone(normalizedPhone)) {
      const err = new Error('该手机号已被注册')
      err.code = 'PHONE_EXISTS'
      throw err
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await UserModel.create({ phone: normalizedPhone, password_hash, nickname })
    const token = this._signToken(user)

    return { token, user: this._publicUser(user) }
  }

  async login({ phone, email, password }) {
    const normalizedPhone = this._normalizePhone(phone)
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

    if ((!normalizedPhone && !normalizedEmail) || !password) {
      const err = new Error('手机号和密码不能为空')
      err.code = 'MISSING_FIELDS'
      throw err
    }

    const user = normalizedPhone
      ? await UserModel.findByPhone(normalizedPhone)
      : await UserModel.findByEmail(normalizedEmail)

    if (!user) {
      const err = new Error('手机号或密码错误')
      err.code = 'INVALID_CREDENTIALS'
      throw err
    }

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      const err = new Error('手机号或密码错误')
      err.code = 'INVALID_CREDENTIALS'
      throw err
    }

    const token = this._signToken(user)
    return { token, user: this._publicUser(user) }
  }

  async resetPassword({ phone, password }) {
    const normalizedPhone = this._normalizePhone(phone)

    this._assertPhone(normalizedPhone)
    this._assertPassword(password)

    const user = await UserModel.findByPhone(normalizedPhone)
    if (!user) {
      const err = new Error('该手机号还没有注册')
      err.code = 'PHONE_NOT_FOUND'
      throw err
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const updatedUser = await UserModel.updatePassword(user.id, password_hash)
    const token = this._signToken(updatedUser)
    return { token, user: this._publicUser(updatedUser) }
  }

  async changePassword({ userId, currentPassword, newPassword }) {
    if (!currentPassword || !newPassword) {
      const err = new Error('请填写当前密码和新密码')
      err.code = 'MISSING_FIELDS'
      throw err
    }

    this._assertPassword(newPassword)

    const user = await UserModel.findById(userId)
    if (!user) {
      const err = new Error('用户不存在')
      err.code = 'USER_NOT_FOUND'
      throw err
    }

    const match = await bcrypt.compare(currentPassword, user.password_hash)
    if (!match) {
      const err = new Error('当前密码不正确')
      err.code = 'INVALID_CREDENTIALS'
      throw err
    }

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await UserModel.updatePassword(user.id, password_hash)
    return { message: '密码已更新' }
  }

  async refresh(oldToken) {
    if (!oldToken) {
      const err = new Error('缺少 token')
      err.code = 'MISSING_TOKEN'
      throw err
    }

    let payload
    try {
      payload = jwt.verify(oldToken, JWT_SECRET(), { ignoreExpiration: true })
    } catch {
      const err = new Error('token 无效')
      err.code = 'INVALID_TOKEN'
      throw err
    }

    if (await this._isBlacklisted(payload.jti)) {
      const err = new Error('token 已失效')
      err.code = 'TOKEN_REVOKED'
      throw err
    }

    const user = await UserModel.findById(payload.sub)
    if (!user) {
      const err = new Error('用户不存在')
      err.code = 'USER_NOT_FOUND'
      throw err
    }

    await this._blacklist(payload.jti, payload.exp)
    const token = this._signToken(user)
    return { token }
  }

  async logout(token) {
    if (!token) return
    try {
      const payload = jwt.verify(token, JWT_SECRET(), { ignoreExpiration: true })
      await this._blacklist(payload.jti, payload.exp)
    } catch {
      // token 本身无效，忽略
    }
  }

  async verify(token) {
    if (!token) {
      const err = new Error('缺少 token')
      err.code = 'MISSING_TOKEN'
      err.status = 401
      throw err
    }

    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET())
    } catch (e) {
      const err = new Error(e.name === 'TokenExpiredError' ? 'token 已过期' : 'token 无效')
      err.code = e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
      err.status = 401
      throw err
    }

    if (await this._isBlacklisted(payload.jti)) {
      const err = new Error('token 已失效（已登出）')
      err.code = 'TOKEN_REVOKED'
      err.status = 401
      throw err
    }

    return {
      userId: payload.sub,
      nickname: payload.nickname,
      phone: payload.phone || null,
      email: payload.email,
      jti: payload.jti,
    }
  }

  _signToken(user) {
    return jwt.sign(
      {
        sub: user.id,
        nickname: user.nickname,
        phone: user.phone || null,
        email: user.email,
        jti: uuidv4(),
      },
      JWT_SECRET(),
      { expiresIn: JWT_EXPIRES }
    )
  }

  async _blacklist(jti, expUnix) {
    if (!jti) return

    try {
      const expiresAt = expUnix
        ? new Date(expUnix * 1000).toISOString()
        : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

      await execute(
        'INSERT INTO token_blacklist (jti, expires_at) VALUES (?, ?) ON CONFLICT (jti) DO NOTHING',
        [jti, expiresAt]
      )
    } catch (err) {
      console.error('[AuthService] 写入黑名单失败:', err.message)
    }
  }

  async _isBlacklisted(jti) {
    if (!jti) return false

    const now = new Date().toISOString()
    const row = await queryOne(
      'SELECT jti FROM token_blacklist WHERE jti = ? AND expires_at > ?',
      [jti, now]
    )
    return !!row
  }

  _publicUser(user) {
    const { password_hash, ...pub } = user
    return {
      ...pub,
      createdAt: pub.created_at,
      updatedAt: pub.updated_at,
    }
  }

  _assertPhone(phone) {
    if (!phone || !PHONE_RE.test(phone)) {
      const err = new Error('手机号格式不正确')
      err.code = 'INVALID_PHONE'
      throw err
    }
  }

  _assertPassword(password) {
    if (!password || password.length < 6) {
      const err = new Error('密码长度不能少于 6 位')
      err.code = 'INVALID_PASSWORD'
      throw err
    }
  }

  _normalizePhone(phone) {
    return String(phone || '')
      .replace(/[^\d]/g, '')
      .trim()
  }
}

module.exports = new AuthService()
