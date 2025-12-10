// Mock dependencies before importing
jest.mock('../../src/utils/jwt', () => ({
  verifyAccessToken: jest.fn()
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

const { authenticate, authorize, optionalAuth } = require('../../src/middleware/auth');
const { verifyAccessToken } = require('../../src/utils/jwt');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      user: null
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should call next() with valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'client'
      };

      mockReq.headers.authorization = 'Bearer valid-token';
      verifyAccessToken.mockReturnValue(mockUser);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockUser);
    });

    it('should return 401 when no authorization header', async () => {
      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          message: 'No token provided'
        })
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header does not start with Bearer', async () => {
      mockReq.headers.authorization = 'Basic some-token';

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          message: 'No token provided'
        })
      });
    });

    it('should return 401 when token verification fails', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token'
        })
      });
    });

    it('should extract token correctly from Bearer prefix', async () => {
      const token = 'my-jwt-token-12345';
      mockReq.headers.authorization = `Bearer ${token}`;
      verifyAccessToken.mockReturnValue({ id: 'user-123' });

      await authenticate(mockReq, mockRes, mockNext);

      expect(verifyAccessToken).toHaveBeenCalledWith(token);
    });
  });

  describe('authorize', () => {
    it('should call next() when user has allowed role', () => {
      mockReq.user = { id: 'user-123', role: 'admin' };

      const middleware = authorize('admin', 'trainer');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() when user role is in multiple allowed roles', () => {
      mockReq.user = { id: 'user-123', role: 'trainer' };

      const middleware = authorize('admin', 'trainer', 'gym_owner');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      mockReq.user = null;

      const middleware = authorize('admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        })
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user role is not allowed', () => {
      mockReq.user = { id: 'user-123', role: 'client' };

      const middleware = authorize('admin', 'trainer');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        })
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should work with single role', () => {
      mockReq.user = { id: 'user-123', role: 'admin' };

      const middleware = authorize('admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should set user when valid token is provided', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'client'
      };

      mockReq.headers.authorization = 'Bearer valid-token';
      verifyAccessToken.mockReturnValue(mockUser);

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toEqual(mockUser);
    });

    it('should call next() without setting user when no token provided', async () => {
      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeNull();
    });

    it('should call next() without error when token is invalid', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';
      verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeNull();
      // Should NOT return error response
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should not set user when authorization header is not Bearer type', async () => {
      mockReq.headers.authorization = 'Basic some-credentials';

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeNull();
      expect(verifyAccessToken).not.toHaveBeenCalled();
    });
  });
});
