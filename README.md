# FitSync User Service

User management and authentication service for the FitSync multi-repository application.

## Features

- User authentication (JWT)
- User registration and profile management
- Role-based access control (Admin, Trainer, Client, Gym Owner)
- Password hashing and security
- Session management with Redis
- User database operations

## Running the Full FitSync Application

This service is part of the FitSync multi-repository application. To run the complete application:

### Prerequisites

- Docker Desktop installed and running
- Git installed

### Quick Start - Full Application

1. **Clone all repositories:**

```bash
mkdir fitsync-app && cd fitsync-app

git clone https://github.com/FitSync-G13/fitsync-docker-compose.git
git clone https://github.com/FitSync-G13/fitsync-api-gateway.git
git clone https://github.com/FitSync-G13/fitsync-user-service.git
git clone https://github.com/FitSync-G13/fitsync-training-service.git
git clone https://github.com/FitSync-G13/fitsync-schedule-service.git
git clone https://github.com/FitSync-G13/fitsync-progress-service.git
git clone https://github.com/FitSync-G13/fitsync-notification-service.git
git clone https://github.com/FitSync-G13/fitsync-frontend.git
```

2. **Run setup:**

```bash
cd fitsync-docker-compose
./setup.sh    # Linux/Mac
setup.bat     # Windows
```

3. **Access:** http://localhost:3000

## Development - Run This Service Locally

1. **Start infrastructure:**
```bash
cd ../fitsync-docker-compose
docker compose up -d userdb redis
docker compose stop user-service
```

2. **Install dependencies:**
```bash
cd ../fitsync-user-service
npm install
```

3. **Configure environment (.env):**
```env
PORT=3001
DATABASE_URL=postgresql://fitsync:fitsync123@localhost:5432/userdb
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
```

4. **Run migrations and seeds:**
```bash
npm run migrate
npm run seed
```

5. **Start development server:**
```bash
npm run dev
```

Service runs on http://localhost:3001

## API Endpoints

- `POST  /api/auth/register` - Register new user
- `POST  /api/auth/login` - Login user
- `POST  /api/auth/refresh` - Refresh token
- `GET  /api/users/:id` - Get user by ID
- `PUT  /api/users/:id` - Update user
- `DELETE  /api/users/:id` - Delete user

## Testing

### Test Framework

This service uses **Jest** as the testing framework with the following setup:
- Unit tests for core functionality
- Mocked dependencies (database, Redis, logger)
- Code coverage reporting

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Structure

```
tests/
├── setup.js                    # Jest setup (env vars, global config)
└── unit/
    ├── jwt.test.js             # JWT utility tests
    ├── authController.test.js  # Auth controller tests
    ├── validation.test.js      # Validation middleware tests
    └── auth.middleware.test.js # Auth middleware tests
```

### Test Suites

| Test File | Tests | What's Covered |
|-----------|-------|----------------|
| `jwt.test.js` | 27 | Token generation (access/refresh), token verification, token hashing, Redis operations (store, revoke, validate), user caching |
| `authController.test.js` | 20 | User registration, login flow, password hashing, token refresh, logout, error handling |
| `validation.test.js` | 34 | All Joi schemas (register, login, refreshToken, updateProfile, changePassword, updateRole, createGym), field validation |
| `auth.middleware.test.js` | 14 | JWT authentication middleware, role-based authorization, optional authentication |

### Test Details

#### JWT Utility Tests (`jwt.test.js`)
- **Token Generation**: Validates JWT structure, payload content, issuer/audience claims
- **Token Verification**: Tests valid tokens, expired tokens, invalid signatures, wrong issuer
- **Token Hashing**: SHA256 consistency and uniqueness
- **Redis Operations**: Store, revoke, validate refresh tokens; user cache operations

#### Auth Controller Tests (`authController.test.js`)
- **Register**: Success flow, duplicate user handling, password hashing, database error handling
- **Login**: Valid credentials, invalid password, non-existent user, disabled accounts
- **Refresh**: Valid refresh, expired tokens, revoked tokens, inactive users
- **Logout**: Single device logout, all devices logout, error handling

#### Validation Tests (`validation.test.js`)
- **Schema validation**: Email format, password length, role values
- **Optional fields**: Phone number format (E.164), date of birth (ISO), UUID validation
- **Complex objects**: Nested address objects, arrays (amenities), URI validation

#### Auth Middleware Tests (`auth.middleware.test.js`)
- **authenticate**: Token extraction, verification, missing token handling
- **authorize**: Role-based access control, multiple allowed roles
- **optionalAuth**: Non-failing authentication for optional endpoints

### Coverage Targets

| Module | Statements | Functions | Lines |
|--------|------------|-----------|-------|
| `jwt.js` | 100% | 100% | 100% |
| `validation.js` | 100% | 100% | 100% |
| `auth.js` (middleware) | 88% | 100% | 88% |
| `authController.js` | 95% | 100% | 95% |

### Writing New Tests

1. Create test files in `tests/unit/` with `.test.js` suffix
2. Mock external dependencies (database, Redis) at the top of the file
3. Use `beforeEach` to reset mocks between tests
4. Follow the existing patterns for request/response mocking

Example:
```javascript
jest.mock('../../src/config/database', () => ({
  connect: jest.fn(),
  query: jest.fn()
}));

describe('My Feature', () => {
  let mockReq, mockRes;
  
  beforeEach(() => {
    mockReq = { body: {}, headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    // Test implementation
  });
});
```

## Database Schema

Main tables:
- `users` - User accounts and profiles
- `roles` - User roles and permissions
- `sessions` - Active user sessions

## More Information

See [fitsync-docker-compose](https://github.com/FitSync-G13/fitsync-docker-compose) for complete documentation.

## License

MIT

