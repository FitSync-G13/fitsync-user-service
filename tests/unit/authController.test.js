const bcrypt = require('bcrypt');

// Mock dependencies
jest.mock('../../src/config/database', () => ({
  connect: jest.fn(),
  query: jest.fn()
}));

jest.mock('../../src/config/redis', () => ({
  redisClient: {
    setEx: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([])
  }
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

jest.mock('../../src/utils/jwt', () => ({
  generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
  generateTokenHash: jest.fn().mockReturnValue('mock-token-hash'),
  verifyRefreshToken: jest.fn(),
  storeRefreshToken: jest.fn().mockResolvedValue(undefined),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  isRefreshTokenValid: jest.fn(),
  revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
  cacheUserData: jest.fn().mockResolvedValue(undefined)
}));

const authController = require('../../src/controllers/authController');
const db = require('../../src/config/database');
const jwtUtils = require('../../src/utils/jwt');
const logger = require('../../src/config/logger');

describe('Auth Controller', () => {
  let mockReq;
  let mockRes;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    db.connect.mockResolvedValue(mockClient);
    db.query = jest.fn();

    mockReq = {
      validatedBody: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      headers: { authorization: 'Bearer mock-token' },
      user: { id: 'user-123', email: 'test@example.com' },
      body: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('register', () => {
    const validRegistrationData = {
      email: 'newuser@example.com',
      password: 'SecurePass123',
      role: 'client',
      first_name: 'John',
      last_name: 'Doe',
      phone: '+1234567890',
      date_of_birth: '1990-01-01',
      gym_id: null
    };

    beforeEach(() => {
      mockReq.validatedBody = { ...validRegistrationData };
    });

    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'new-user-id',
        email: validRegistrationData.email,
        role: validRegistrationData.role,
        first_name: validRegistrationData.first_name,
        last_name: validRegistrationData.last_name,
        phone: validRegistrationData.phone,
        date_of_birth: validRegistrationData.date_of_birth,
        gym_id: null,
        created_at: new Date().toISOString()
      };

      // No existing user
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ rows: [mockUser] }) // Insert user
        .mockResolvedValueOnce({ rows: [] }); // Insert session

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: expect.objectContaining({
            id: mockUser.id,
            email: mockUser.email,
            role: mockUser.role
          }),
          tokens: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            token_type: 'Bearer',
            expires_in: 900
          }
        }
      });
      expect(jwtUtils.storeRefreshToken).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should return 409 if user already exists', async () => {
      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ id: 'existing-user-id' }] 
      });

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'USER_EXISTS',
          message: 'User with this email already exists'
        })
      });
    });

    it('should hash the password before storing', async () => {
      const mockUser = {
        id: 'new-user-id',
        email: validRegistrationData.email,
        role: 'client',
        first_name: 'John',
        last_name: 'Doe'
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });

      await authController.register(mockReq, mockRes);

      // Verify password was hashed (check the INSERT query call)
      const insertCall = mockClient.query.mock.calls[1];
      const passwordHash = insertCall[1][1]; // Second parameter is password_hash

      // Password hash should NOT equal plain password
      expect(passwordHash).not.toBe(validRegistrationData.password);
      // Password hash should be a bcrypt hash (starts with $2b$)
      expect(passwordHash).toMatch(/^\$2[aby]?\$/);
    });

    it('should return 500 on database error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await authController.register(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'REGISTRATION_FAILED'
        })
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should release database client after successful registration', async () => {
      const mockUser = {
        id: 'new-user-id',
        email: validRegistrationData.email,
        role: 'client',
        first_name: 'John',
        last_name: 'Doe'
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });

      await authController.register(mockReq, mockRes);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release database client on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await authController.register(mockReq, mockRes);

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'user@example.com',
      password: 'SecurePass123'
    };

    beforeEach(() => {
      mockReq.validatedBody = { ...validLoginData };
    });

    it('should login user successfully with valid credentials', async () => {
      const passwordHash = await bcrypt.hash(validLoginData.password, 10);
      const mockUser = {
        id: 'user-123',
        email: validLoginData.email,
        password_hash: passwordHash,
        role: 'client',
        first_name: 'John',
        last_name: 'Doe',
        phone: '+1234567890',
        gym_id: null,
        is_active: true
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [] }) // Update last login
        .mockResolvedValueOnce({ rows: [] }); // Insert session

      await authController.login(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          user: expect.objectContaining({
            id: mockUser.id,
            email: mockUser.email
          }),
          tokens: expect.objectContaining({
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token'
          })
        })
      });
    });

    it('should return 401 for non-existent user', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        })
      });
    });

    it('should return 401 for invalid password', async () => {
      const mockUser = {
        id: 'user-123',
        email: validLoginData.email,
        password_hash: await bcrypt.hash('DifferentPassword', 10),
        role: 'client',
        is_active: true
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockUser] });

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'INVALID_CREDENTIALS'
        })
      });
    });

    it('should return 403 for disabled account', async () => {
      const mockUser = {
        id: 'user-123',
        email: validLoginData.email,
        password_hash: await bcrypt.hash(validLoginData.password, 10),
        role: 'client',
        is_active: false
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockUser] });

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'ACCOUNT_DISABLED',
          message: 'Your account has been disabled'
        })
      });
    });

    it('should update last login time on successful login', async () => {
      const passwordHash = await bcrypt.hash(validLoginData.password, 10);
      const mockUser = {
        id: 'user-123',
        email: validLoginData.email,
        password_hash: passwordHash,
        role: 'client',
        is_active: true
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await authController.login(mockReq, mockRes);

      // Second query should be the update last login
      expect(mockClient.query.mock.calls[1][0]).toContain('UPDATE users SET last_login');
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      mockReq.validatedBody = { refresh_token: 'valid-refresh-token' };
    });

    it('should refresh access token successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'user@example.com',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe',
        gym_id: null,
        is_active: true
      };

      jwtUtils.verifyRefreshToken.mockReturnValueOnce({ id: mockUser.id });
      jwtUtils.isRefreshTokenValid.mockResolvedValueOnce(true);
      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      await authController.refresh(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 900
        }
      });
    });

    it('should return 401 for invalid refresh token', async () => {
      jwtUtils.verifyRefreshToken.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      await authController.refresh(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'INVALID_TOKEN'
        })
      });
    });

    it('should return 401 for revoked refresh token', async () => {
      jwtUtils.verifyRefreshToken.mockReturnValueOnce({ id: 'user-123' });
      jwtUtils.isRefreshTokenValid.mockResolvedValueOnce(false);

      await authController.refresh(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'TOKEN_REVOKED'
        })
      });
    });

    it('should return 401 for inactive user', async () => {
      const mockUser = {
        id: 'user-123',
        is_active: false
      };

      jwtUtils.verifyRefreshToken.mockReturnValueOnce({ id: mockUser.id });
      jwtUtils.isRefreshTokenValid.mockResolvedValueOnce(true);
      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      await authController.refresh(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'INVALID_USER'
        })
      });
    });
  });

  describe('logout', () => {
    beforeEach(() => {
      mockReq.user = { id: 'user-123', email: 'user@example.com' };
      mockReq.body = {};
    });

    it('should logout successfully', async () => {
      await authController.logout(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully'
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should revoke specific refresh token if provided', async () => {
      mockReq.body.refresh_token = 'token-to-revoke';

      await authController.logout(mockReq, mockRes);

      expect(jwtUtils.revokeRefreshToken).toHaveBeenCalledWith(
        mockReq.user.id,
        'token-to-revoke'
      );
    });

    it('should revoke all tokens if all_devices flag is set', async () => {
      mockReq.body.all_devices = true;

      await authController.logout(mockReq, mockRes);

      expect(jwtUtils.revokeAllUserTokens).toHaveBeenCalledWith(mockReq.user.id);
    });

    it('should handle logout errors gracefully', async () => {
      jwtUtils.revokeRefreshToken.mockRejectedValueOnce(new Error('Redis error'));
      mockReq.body.refresh_token = 'token-to-revoke';

      await authController.logout(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'LOGOUT_FAILED'
        })
      });
    });
  });

  describe('oauthCallback', () => {
    it('should return 501 not implemented', async () => {
      await authController.oauthCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(501);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'NOT_IMPLEMENTED'
        })
      });
    });
  });
});
