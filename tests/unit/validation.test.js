const { validate, schemas } = require('../../src/middleware/validation');

describe('Validation Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('validate function', () => {
    it('should call next() with valid data', () => {
      const schema = schemas.login;
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      const middleware = validate(schema);
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.validatedBody).toEqual(mockReq.body);
    });

    it('should return 400 with validation errors for invalid data', () => {
      const schema = schemas.login;
      mockReq.body = {
        email: 'invalid-email',
        password: ''
      };

      const middleware = validate(schema);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: expect.any(Array)
        })
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should strip unknown fields', () => {
      const schema = schemas.login;
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123',
        unknownField: 'should be removed'
      };

      const middleware = validate(schema);
      middleware(mockReq, mockRes, mockNext);

      expect(mockReq.validatedBody).not.toHaveProperty('unknownField');
      expect(mockReq.validatedBody).toEqual({
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should return all validation errors at once', () => {
      const schema = schemas.login;
      mockReq.body = {}; // Missing both required fields

      const middleware = validate(schema);
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.arrayContaining([
              expect.objectContaining({ field: 'email' }),
              expect.objectContaining({ field: 'password' })
            ])
          })
        })
      );
    });
  });

  describe('schemas.register', () => {
    const validateRegister = validate(schemas.register);

    it('should validate valid registration data', () => {
      mockReq.body = {
        email: 'newuser@example.com',
        password: 'SecurePass123',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid email format', () => {
      mockReq.body = {
        email: 'invalid-email',
        password: 'SecurePass123',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.arrayContaining([
              expect.objectContaining({ field: 'email' })
            ])
          })
        })
      );
    });

    it('should reject password shorter than 8 characters', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'short',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.arrayContaining([
              expect.objectContaining({ field: 'password' })
            ])
          })
        })
      );
    });

    it('should reject invalid role', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'SecurePass123',
        role: 'superuser', // Invalid role
        first_name: 'John',
        last_name: 'Doe'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.arrayContaining([
              expect.objectContaining({ field: 'role' })
            ])
          })
        })
      );
    });

    it('should accept all valid roles', () => {
      const validRoles = ['admin', 'trainer', 'client', 'gym_owner'];

      validRoles.forEach(role => {
        mockReq.body = {
          email: 'user@example.com',
          password: 'SecurePass123',
          role: role,
          first_name: 'John',
          last_name: 'Doe'
        };
        mockNext.mockClear();

        validateRegister(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });

    it('should validate optional phone number format', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'SecurePass123',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe',
        phone: 'invalid-phone'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should accept valid phone number', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'SecurePass123',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe',
        phone: '+12345678901'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate date_of_birth as ISO date', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'SecurePass123',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: 'invalid-date'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should accept valid ISO date for date_of_birth', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'SecurePass123',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1990-01-15'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate gym_id as UUID', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'SecurePass123',
        role: 'client',
        first_name: 'John',
        last_name: 'Doe',
        gym_id: 'not-a-uuid'
      };

      validateRegister(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('schemas.login', () => {
    const validateLogin = validate(schemas.login);

    it('should validate valid login data', () => {
      mockReq.body = {
        email: 'user@example.com',
        password: 'password123'
      };

      validateLogin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require email', () => {
      mockReq.body = {
        password: 'password123'
      };

      validateLogin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should require password', () => {
      mockReq.body = {
        email: 'user@example.com'
      };

      validateLogin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('schemas.refreshToken', () => {
    const validateRefresh = validate(schemas.refreshToken);

    it('should validate valid refresh token request', () => {
      mockReq.body = {
        refresh_token: 'some-refresh-token-value'
      };

      validateRefresh(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require refresh_token', () => {
      mockReq.body = {};

      validateRefresh(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('schemas.updateProfile', () => {
    const validateUpdateProfile = validate(schemas.updateProfile);

    it('should validate valid profile update data', () => {
      mockReq.body = {
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+19876543210'
      };

      validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept empty body (all fields optional)', () => {
      mockReq.body = {};

      validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate nested address object', () => {
      mockReq.body = {
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country: 'USA'
        }
      };

      validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate profile_image_url as URI', () => {
      mockReq.body = {
        profile_image_url: 'not-a-url'
      };

      validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should accept valid profile_image_url', () => {
      mockReq.body = {
        profile_image_url: 'https://example.com/image.jpg'
      };

      validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('schemas.changePassword', () => {
    const validateChangePassword = validate(schemas.changePassword);

    it('should validate valid password change request', () => {
      mockReq.body = {
        current_password: 'OldPassword123',
        new_password: 'NewSecurePass456'
      };

      validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require current_password', () => {
      mockReq.body = {
        new_password: 'NewSecurePass456'
      };

      validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should require new_password to be at least 8 characters', () => {
      mockReq.body = {
        current_password: 'OldPassword123',
        new_password: 'short'
      };

      validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('schemas.updateRole', () => {
    const validateUpdateRole = validate(schemas.updateRole);

    it('should validate valid role update', () => {
      mockReq.body = {
        role: 'trainer'
      };

      validateUpdateRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid role', () => {
      mockReq.body = {
        role: 'superadmin'
      };

      validateUpdateRole(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('schemas.createGym', () => {
    const validateCreateGym = validate(schemas.createGym);

    it('should validate valid gym creation data', () => {
      mockReq.body = {
        name: 'FitGym Central',
        description: 'A great gym',
        address: {
          street: '123 Fitness Ave',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
          country: 'USA'
        }
      };

      validateCreateGym(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require gym name', () => {
      mockReq.body = {
        address: {
          street: '123 Fitness Ave',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
          country: 'USA'
        }
      };

      validateCreateGym(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should require complete address', () => {
      mockReq.body = {
        name: 'FitGym Central',
        address: {
          street: '123 Fitness Ave'
          // Missing other required fields
        }
      };

      validateCreateGym(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should validate optional website as URI', () => {
      mockReq.body = {
        name: 'FitGym Central',
        address: {
          street: '123 Fitness Ave',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
          country: 'USA'
        },
        website: 'not-a-url'
      };

      validateCreateGym(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should accept valid amenities array', () => {
      mockReq.body = {
        name: 'FitGym Central',
        address: {
          street: '123 Fitness Ave',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
          country: 'USA'
        },
        amenities: ['pool', 'sauna', 'parking']
      };

      validateCreateGym(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
