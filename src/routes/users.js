const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// Current user routes
router.get('/me', authenticate, userController.getMe);
router.put('/me', authenticate, validate(schemas.updateProfile), userController.updateMe);

// Admin routes - Allow all authenticated users to list (controller will filter appropriately)
router.get('/', authenticate, userController.listUsers);
router.get('/gyms', authenticate, userController.listGyms);
router.get('/:id', authenticate, authorize('admin', 'gym_owner', 'trainer'), userController.getUserById);
router.put('/:id/role', authenticate, authorize('admin'), validate(schemas.updateRole), userController.updateUserRole);
router.delete('/:id', authenticate, authorize('admin'), userController.deleteUser);

module.exports = router;
