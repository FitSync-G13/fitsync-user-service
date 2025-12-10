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

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh token
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## Database Schema

Main tables:
- `users` - User accounts and profiles
- `roles` - User roles and permissions
- `sessions` - Active user sessions

## More Information

See [fitsync-docker-compose](https://github.com/FitSync-G13/fitsync-docker-compose) for complete documentation.

## License

MIT
