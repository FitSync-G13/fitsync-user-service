const { Pool } = require('pg');
const logger = require('./logger');

// Support both connection string and individual parameters
const getConnectionConfig = () => {
  if (process.env.DATABASE_URL) {
    // Use connection string if provided
    // Check if SSL is requested in the connection string
    const url = process.env.DATABASE_URL;
    const hasSSL = url.includes('sslmode=');

    if (hasSSL) {
      return {
        connectionString: url,
        ssl: {
          rejectUnauthorized: false  // Allow insecure certs for development
        }
      };
    }

    // Plain connection without SSL
    return {
      connectionString: url
    };
  }

  // Build connection from individual parameters (no SSL for local Docker)
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

  return {
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD
  };
};

const config = getConnectionConfig();

const pool = new Pool(config);

pool.on('connect', () => {
  logger.info('Database connection established with TLS');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;
