const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { redisClient } = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

/**
 * Generate access token
 */
function generateAccessToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    gym_id: user.gym_id
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    issuer: 'fitsync-user-service',
    audience: 'fitsync-api'
  });
}

/**
 * Generate refresh token
 */
function generateRefreshToken(user) {
  const payload = {
    id: user.id,
    type: 'refresh'
  };

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY,
    issuer: 'fitsync-user-service',
    audience: 'fitsync-api'
  });
}

/**
 * Generate token hash for storage
 */
function generateTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'fitsync-user-service',
      audience: 'fitsync-api'
    });
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
}

/**
 * Verify refresh token
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'fitsync-user-service',
      audience: 'fitsync-api'
    });
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

/**
 * Store refresh token in Redis with expiry
 */
async function storeRefreshToken(userId, token, expiresInSeconds = 604800) {
  const key = `refresh_token:${userId}:${generateTokenHash(token)}`;
  await redisClient.setEx(key, expiresInSeconds, token);
}

/**
 * Revoke refresh token
 */
async function revokeRefreshToken(userId, token) {
  const key = `refresh_token:${userId}:${generateTokenHash(token)}`;
  await redisClient.del(key);
}

/**
 * Check if refresh token is valid in Redis
 */
async function isRefreshTokenValid(userId, token) {
  const key = `refresh_token:${userId}:${generateTokenHash(token)}`;
  const storedToken = await redisClient.get(key);
  return storedToken === token;
}

/**
 * Revoke all user tokens
 */
async function revokeAllUserTokens(userId) {
  const pattern = `refresh_token:${userId}:*`;
  const keys = await redisClient.keys(pattern);

  if (keys.length > 0) {
    await redisClient.del(keys);
  }
}

/**
 * Cache user data in Redis
 */
async function cacheUserData(userId, userData, expiresInSeconds = 900) {
  const key = `user:${userId}`;
  await redisClient.setEx(key, expiresInSeconds, JSON.stringify(userData));
}

/**
 * Get cached user data
 */
async function getCachedUserData(userId) {
  const key = `user:${userId}`;
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Invalidate user cache
 */
async function invalidateUserCache(userId) {
  const key = `user:${userId}`;
  await redisClient.del(key);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenHash,
  verifyAccessToken,
  verifyRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid,
  revokeAllUserTokens,
  cacheUserData,
  getCachedUserData,
  invalidateUserCache
};
