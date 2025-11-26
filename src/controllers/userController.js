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

/**
 * List all gyms
 */
exports.listGyms = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT id, name, description, address, phone, email, website,
                amenities, opening_hours, created_at
         FROM gyms
         ORDER BY name ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      db.query('SELECT COUNT(*) FROM gyms')
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
    logger.error('List gyms error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch gyms',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Get multiple users by IDs (batch fetch for inter-service communication)
 */
exports.getUsersBatch = async (req, res) => {
  try {
    const { user_ids } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'user_ids must be a non-empty array',
          timestamp: new Date().toISOString()
        }
      });
    }

    if (user_ids.length > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_IDS',
          message: 'Maximum 100 user IDs allowed per batch request',
          timestamp: new Date().toISOString()
        }
      });
    }

    const placeholders = user_ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT id, email, role, first_name, last_name, phone, profile_image_url, gym_id, is_active
       FROM users WHERE id IN (${placeholders})`,
      user_ids
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Batch get users error:', error);
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
 * Get role-specific information for a user
 */
exports.getUserRoleInfo = async (req, res) => {
  try {
    const { id } = req.params;

    const userResult = await db.query(
      'SELECT id, role, first_name, last_name FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          timestamp: new Date().toISOString()
        }
      });
    }

    const user = userResult.rows[0];
    let roleSpecificData = {};

    switch (user.role) {
      case 'trainer':
        const trainerResult = await db.query(
          `SELECT certifications, specializations, years_experience, bio, rating
           FROM trainer_profiles WHERE user_id = $1`,
          [id]
        );
        roleSpecificData = trainerResult.rows[0] || {
          certifications: [],
          specializations: [],
          years_experience: 0,
          bio: null,
          rating: null
        };
        break;

      case 'client':
        const clientResult = await db.query(
          `SELECT health_clearance, emergency_contact, fitness_level, goals
           FROM client_profiles WHERE user_id = $1`,
          [id]
        );
        roleSpecificData = clientResult.rows[0] || {
          health_clearance: false,
          emergency_contact: null,
          fitness_level: null,
          goals: []
        };
        break;

      case 'gym_owner':
      case 'admin':
        // For gym owners and admins, return basic info
        roleSpecificData = {
          role: user.role,
          permissions: ['full_access']
        };
        break;

      default:
        roleSpecificData = { role: user.role };
    }

    res.json({
      success: true,
      data: {
        user_id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        ...roleSpecificData
      }
    });
  } catch (error) {
    logger.error('Get user role info error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch role information',
        timestamp: new Date().toISOString()
      }
    });
  }
};
