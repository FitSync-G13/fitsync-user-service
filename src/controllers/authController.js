const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../config/logger');
const {
  generateAccessToken,
  generateRefreshToken,
  generateTokenHash,
  verifyRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid,
  revokeAllUserTokens,
  cacheUserData
} = require('../utils/jwt');

/**
 * Register new user
 */
exports.register = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { email, password, role, first_name, last_name, phone, date_of_birth, gym_id } = req.validatedBody;

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const result = await client.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, date_of_birth, gym_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, role, first_name, last_name, phone, date_of_birth, gym_id, created_at`,
      [email, password_hash, role, first_name, last_name, phone, date_of_birth, gym_id]
    );

    const user = result.rows[0];

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in Redis (7 days)
    await storeRefreshToken(user.id, refreshToken, 604800);

    // Store session in database
    await client.query(
      `INSERT INTO sessions (user_id, refresh_token, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
      [
        user.id,
        refreshToken,
        generateTokenHash(refreshToken),
        req.ip,
        req.get('user-agent')
      ]
    );

    logger.info(`User registered: ${user.email} (${user.role})`);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          gym_id: user.gym_id
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'Bearer',
          expires_in: 900 // 15 minutes in seconds
        }
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to register user',
        timestamp: new Date().toISOString()
      }
    });
  } finally {
    client.release();
  }
};

/**
 * Login user
 */
exports.login = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { email, password } = req.validatedBody;

    // Find user
    const result = await client.query(
      `SELECT id, email, password_hash, role, first_name, last_name, phone, gym_id, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date().toISOString()
        }
      });
    }

    const user = result.rows[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Your account has been disabled',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Update last login
    await client.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    await storeRefreshToken(user.id, refreshToken, 604800);

    // Store session
    await client.query(
      `INSERT INTO sessions (user_id, refresh_token, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
      [
        user.id,
        refreshToken,
        generateTokenHash(refreshToken),
        req.ip,
        req.get('user-agent')
      ]
    );

    // Cache user data
    await cacheUserData(user.id, {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      gym_id: user.gym_id
    });

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          gym_id: user.gym_id
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'Bearer',
          expires_in: 900
        }
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to login',
        timestamp: new Date().toISOString()
      }
    });
  } finally {
    client.release();
  }
};

/**
 * Refresh access token
 */
exports.refresh = async (req, res) => {
  try {
    const { refresh_token } = req.validatedBody;

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refresh_token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired refresh token',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check if token is valid in Redis
    const isValid = await isRefreshTokenValid(decoded.id, refresh_token);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_REVOKED',
          message: 'Refresh token has been revoked',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Get user data
    const result = await db.query(
      `SELECT id, email, role, first_name, last_name, gym_id, is_active
       FROM users WHERE id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_USER',
          message: 'User not found or inactive',
          timestamp: new Date().toISOString()
        }
      });
    }

    const user = result.rows[0];

    // Generate new access token
    const accessToken = generateAccessToken(user);

    logger.info(`Token refreshed for user: ${user.email}`);

    res.json({
      success: true,
      data: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_FAILED',
        message: 'Failed to refresh token',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Logout user
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;
    const authHeader = req.headers.authorization;
    const refreshToken = req.body.refresh_token;

    // Revoke specific refresh token if provided
    if (refreshToken) {
      await revokeRefreshToken(userId, refreshToken);
    }

    // Optionally revoke all tokens
    if (req.body.all_devices) {
      await revokeAllUserTokens(userId);
    }

    logger.info(`User logged out: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Failed to logout',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * OAuth callback (mock implementation)
 */
exports.oauthCallback = async (req, res) => {
  // This is a mock implementation
  // In production, you would integrate with Passport.js strategies
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'OAuth integration not implemented in this mock',
      timestamp: new Date().toISOString()
    }
  });
};
