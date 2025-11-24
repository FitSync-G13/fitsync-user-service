const Joi = require('joi');

/**
 * Validate request body against Joi schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors,
          timestamp: new Date().toISOString()
        }
      });
    }

    req.validatedBody = value;
    next();
  };
};

/**
 * Validation schemas
 */
const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    role: Joi.string().valid('admin', 'trainer', 'client', 'gym_owner').required(),
    first_name: Joi.string().required(),
    last_name: Joi.string().required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    date_of_birth: Joi.date().iso().optional(),
    gym_id: Joi.string().uuid().optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  refreshToken: Joi.object({
    refresh_token: Joi.string().required()
  }),

  updateProfile: Joi.object({
    first_name: Joi.string().optional(),
    last_name: Joi.string().optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    date_of_birth: Joi.date().iso().optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      postal_code: Joi.string().optional(),
      country: Joi.string().optional()
    }).optional(),
    profile_image_url: Joi.string().uri().optional()
  }),

  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(8).required()
  }),

  updateRole: Joi.object({
    role: Joi.string().valid('admin', 'trainer', 'client', 'gym_owner').required()
  }),

  createGym: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      postal_code: Joi.string().required(),
      country: Joi.string().required()
    }).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    email: Joi.string().email().optional(),
    website: Joi.string().uri().optional(),
    opening_hours: Joi.object().optional(),
    amenities: Joi.array().items(Joi.string()).optional()
  })
};

module.exports = {
  validate,
  schemas
};
