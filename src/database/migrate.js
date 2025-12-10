const db = require('../config/database');
const logger = require('../config/logger');

const migrations = [
  {
    name: 'create_users_table',
    up: `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'trainer', 'client', 'gym_owner')),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(20),
        date_of_birth DATE,
        address JSONB,
        profile_image_url TEXT,
        gym_id UUID,
        oauth_provider VARCHAR(50),
        oauth_provider_id VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        UNIQUE(oauth_provider, oauth_provider_id)
      );

      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_role ON users(role);
      CREATE INDEX idx_users_gym_id ON users(gym_id);
      CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_provider_id);
    `
  },
  {
    name: 'create_sessions_table',
    up: `
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP
      );

      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
    `
  },
  {
    name: 'create_gyms_table',
    up: `
      CREATE TABLE IF NOT EXISTS gyms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        address JSONB NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        website VARCHAR(255),
        opening_hours JSONB,
        amenities TEXT[],
        owner_id UUID REFERENCES users(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_gyms_owner_id ON gyms(owner_id);

      -- Add foreign key constraint for gym_id in users table
      ALTER TABLE users ADD CONSTRAINT fk_users_gym_id
        FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE SET NULL;
    `
  },
  {
    name: 'create_audit_logs_table',
    up: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id UUID,
        old_values JSONB,
        new_values JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE INDEX idx_audit_logs_action ON audit_logs(action);
    `
  },
  {
    name: 'create_updated_at_trigger',
    up: `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_gyms_updated_at BEFORE UPDATE ON gyms
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `
  }
];

async function runMigrations() {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get executed migrations
    const { rows: executed } = await client.query(
      'SELECT name FROM migrations'
    );
    const executedNames = new Set(executed.map(row => row.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedNames.has(migration.name)) {
        logger.info(`Running migration: ${migration.name}`);
        await client.query(migration.up);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
        logger.info(`Completed migration: ${migration.name}`);
      }
    }

    await client.query('COMMIT');
    logger.info('All migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Database migration completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Database migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
