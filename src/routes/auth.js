const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// Public routes
router.post('/register', validate(schemas.register), authController.register);
router.post('/login', validate(schemas.login), authController.login);
router.post('/refresh', validate(schemas.refreshToken), authController.refresh);
router.post('/oauth/google', authController.oauthCallback);
router.post('/oauth/github', authController.oauthCallback);

// Protected routes
router.post('/logout', authenticate, authController.logout);

module.exports = router;
