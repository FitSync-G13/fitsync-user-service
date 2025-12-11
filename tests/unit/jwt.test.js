const jwt = require('jsonwebtoken');

// Mock Redis client
jest.mock('../../src/config/redis', () => ({
  redisClient: {
    setEx: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([])
  }
}));

// Import after mocking
const {
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
} = require('../../src/utils/jwt');

const { redisClient } = require('../../src/config/redis');

describe('JWT Utilities', () => {
  const mockUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    role: 'client',
    gym_id: '123e4567-e89b-12d3-a456-426614174001'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const token = generateAccessToken(mockUser);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should include user data in token payload', () => {
      const token = generateAccessToken(mockUser);
      const decoded = jwt.decode(token);
      
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.gym_id).toBe(mockUser.gym_id);
    });

    it('should include correct issuer and audience', () => {
      const token = generateAccessToken(mockUser);
      const decoded = jwt.decode(token);
      
      expect(decoded.iss).toBe('fitsync-user-service');
      expect(decoded.aud).toBe('fitsync-api');
    });

    it('should set expiration time', () => {
      const token = generateAccessToken(mockUser);
      const decoded = jwt.decode(token);
      
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid JWT refresh token', () => {
      const token = generateRefreshToken(mockUser);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include user id and type in payload', () => {
      const token = generateRefreshToken(mockUser);
      const decoded = jwt.decode(token);
      
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.type).toBe('refresh');
    });

    it('should NOT include sensitive user data', () => {
      const token = generateRefreshToken(mockUser);
      const decoded = jwt.decode(token);
      
      expect(decoded.email).toBeUndefined();
      expect(decoded.role).toBeUndefined();
    });
  });

  describe('generateTokenHash', () => {
    it('should generate a consistent hash for the same token', () => {
      const token = 'test-token-12345';
      const hash1 = generateTokenHash(token);
      const hash2 = generateTokenHash(token);
      
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different tokens', () => {
      const hash1 = generateTokenHash('token-1');
      const hash2 = generateTokenHash('token-2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should return a 64-character hex string (SHA256)', () => {
      const hash = generateTokenHash('test-token');
      
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid access token', () => {
      const token = generateAccessToken(mockUser);
      const decoded = verifyAccessToken(token);
      
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyAccessToken('invalid-token')).toThrow('Invalid or expired access token');
    });

    it('should throw error for expired token', () => {
      const expiredToken = jwt.sign(
        { id: mockUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '-1s', issuer: 'fitsync-user-service', audience: 'fitsync-api' }
      );
      
      expect(() => verifyAccessToken(expiredToken)).toThrow('Invalid or expired access token');
    });

    it('should throw error for token with wrong issuer', () => {
      const wrongIssuerToken = jwt.sign(
        { id: mockUser.id },
        process.env.JWT_SECRET,
        { expiresIn: '15m', issuer: 'wrong-issuer', audience: 'fitsync-api' }
      );
      
      expect(() => verifyAccessToken(wrongIssuerToken)).toThrow('Invalid or expired access token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token', () => {
      const token = generateRefreshToken(mockUser);
      const decoded = verifyRefreshToken(token);
      
      expect(decoded.id).toBe(mockUser.id);
      expect(decoded.type).toBe('refresh');
    });

    it('should throw error for invalid refresh token', () => {
      expect(() => verifyRefreshToken('invalid-token')).toThrow('Invalid or expired refresh token');
    });
  });

  describe('Redis Token Operations', () => {
    describe('storeRefreshToken', () => {
      it('should store refresh token in Redis with correct key', async () => {
        const token = 'test-refresh-token';
        await storeRefreshToken(mockUser.id, token, 604800);
        
        expect(redisClient.setEx).toHaveBeenCalledTimes(1);
        expect(redisClient.setEx).toHaveBeenCalledWith(
          expect.stringContaining(`refresh_token:${mockUser.id}:`),
          604800,
          token
        );
      });
    });

    describe('revokeRefreshToken', () => {
      it('should delete refresh token from Redis', async () => {
        const token = 'test-refresh-token';
        await revokeRefreshToken(mockUser.id, token);
        
        expect(redisClient.del).toHaveBeenCalledTimes(1);
        expect(redisClient.del).toHaveBeenCalledWith(
          expect.stringContaining(`refresh_token:${mockUser.id}:`)
        );
      });
    });

    describe('isRefreshTokenValid', () => {
      it('should return true when token exists and matches', async () => {
        const token = 'valid-token';
        redisClient.get.mockResolvedValueOnce(token);
        
        const isValid = await isRefreshTokenValid(mockUser.id, token);
        
        expect(isValid).toBe(true);
      });

      it('should return false when token does not exist', async () => {
        redisClient.get.mockResolvedValueOnce(null);
        
        const isValid = await isRefreshTokenValid(mockUser.id, 'non-existent-token');
        
        expect(isValid).toBe(false);
      });

      it('should return false when token does not match', async () => {
        redisClient.get.mockResolvedValueOnce('different-token');
        
        const isValid = await isRefreshTokenValid(mockUser.id, 'original-token');
        
        expect(isValid).toBe(false);
      });
    });

    describe('revokeAllUserTokens', () => {
      it('should delete all tokens for a user', async () => {
        const mockKeys = [
          `refresh_token:${mockUser.id}:hash1`,
          `refresh_token:${mockUser.id}:hash2`
        ];
        redisClient.keys.mockResolvedValueOnce(mockKeys);
        
        await revokeAllUserTokens(mockUser.id);
        
        expect(redisClient.keys).toHaveBeenCalledWith(`refresh_token:${mockUser.id}:*`);
        expect(redisClient.del).toHaveBeenCalledWith(mockKeys);
      });

      it('should not call del if no keys found', async () => {
        redisClient.keys.mockResolvedValueOnce([]);
        
        await revokeAllUserTokens(mockUser.id);
        
        expect(redisClient.keys).toHaveBeenCalled();
        expect(redisClient.del).not.toHaveBeenCalled();
      });
    });
  });

  describe('User Cache Operations', () => {
    describe('cacheUserData', () => {
      it('should cache user data in Redis', async () => {
        const userData = { id: mockUser.id, email: mockUser.email };
        await cacheUserData(mockUser.id, userData, 900);
        
        expect(redisClient.setEx).toHaveBeenCalledWith(
          `user:${mockUser.id}`,
          900,
          JSON.stringify(userData)
        );
      });
    });

    describe('getCachedUserData', () => {
      it('should return parsed user data when cache exists', async () => {
        const userData = { id: mockUser.id, email: mockUser.email };
        redisClient.get.mockResolvedValueOnce(JSON.stringify(userData));
        
        const result = await getCachedUserData(mockUser.id);
        
        expect(result).toEqual(userData);
      });

      it('should return null when cache does not exist', async () => {
        redisClient.get.mockResolvedValueOnce(null);
        
        const result = await getCachedUserData(mockUser.id);
        
        expect(result).toBeNull();
      });
    });

    describe('invalidateUserCache', () => {
      it('should delete user cache from Redis', async () => {
        await invalidateUserCache(mockUser.id);
        
        expect(redisClient.del).toHaveBeenCalledWith(`user:${mockUser.id}`);
      });
    });
  });
});
