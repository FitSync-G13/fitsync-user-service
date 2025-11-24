const bcrypt = require('bcrypt');
const db = require('../config/database');
const logger = require('../config/logger');
const { invalidateUserCache, cacheUserData, getCachedUserData } = require('../utils/jwt');

/**
 * Get current user profile
 */
exports.getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    // Try cache first
    let user = await getCachedUserData(userId);

    if (!user) {
      const result = await db.query(
        `SELECT id, email, role, first_name, last_name, phone, date_of_birth,
                address, profile_image_url, gym_id, created_at, last_login, is_active
         FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString()
          }
        });
      }

      user = result.rows[0];
      await cacheUserData(userId, user);
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch user profile',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Update current user profile
 */
exports.updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.validatedBody;

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_UPDATES',
          message: 'No fields to update',
          timestamp: new Date().toISOString()
        }
      });
    }

    values.push(userId);

    const result = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, role, first_name, last_name, phone, date_of_birth,
                 address, profile_image_url, gym_id, updated_at`,
      values
    );

    const user = result.rows[0];

    // Invalidate cache
    await invalidateUserCache(userId);

    logger.info(`User updated profile: ${req.user.email}`);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: 'Failed to update profile',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Get user by ID (admin only)
 */
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT id, email, role, first_name, last_name, phone, date_of_birth,
              address, profile_image_url, gym_id, created_at, last_login, is_active
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date().toISOString()
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch user',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * List users with filters
 */
exports.listUsers = async (req, res) => {
  try {
    const { role, gym_id, is_active, page = 1, limit = 20, search } = req.query;

    const conditions = [];
    const values = [];
    let paramCount = 1;

    if (role) {
      conditions.push(`role = $${paramCount}`);
      values.push(role);
      paramCount++;
    }

    if (gym_id) {
      conditions.push(`gym_id = $${paramCount}`);
      values.push(gym_id);
      paramCount++;
    }

    if (is_active !== undefined) {
      conditions.push(`is_active = $${paramCount}`);
      values.push(is_active === 'true');
      paramCount++;
    }

    if (search) {
      conditions.push(`(first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR email ILIKE $${paramCount})`);
      values.push(`%${search}%`);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT id, email, role, first_name, last_name, phone, gym_id, created_at, last_login, is_active
         FROM users ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        [...values, limit, offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM users ${whereClause}`,
        values
      )
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total_count: totalCount,
        total_pages: totalPages
      }
    });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch users',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Update user role (admin only)
 */
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.validatedBody;

    const result = await db.query(
      `UPDATE users SET role = $1 WHERE id = $2
       RETURNING id, email, role, first_name, last_name`,
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date().toISOString()
        }
      });
    }

    await invalidateUserCache(id);

    logger.info(`User role updated by admin: ${result.rows[0].email} -> ${role}`);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Update role error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: 'Failed to update user role',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Soft delete user
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE users SET is_active = false WHERE id = $1
       RETURNING id, email`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date().toISOString()
        }
      });
    }

    await invalidateUserCache(id);

    logger.info(`User deactivated: ${result.rows[0].email}`);

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: 'Failed to deactivate user',
        timestamp: new Date().toISOString()
      }
    });
  }
};
