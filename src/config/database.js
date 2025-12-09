const { Pool } = require('pg');
const logger = require('./logger');

// Support both connection string and individual parameters
const getConnectionConfig = () => {
  if (process.env.DATABASE_URL) {
    // Use connection string if provided
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false  // Allow insecure certs for development
      }
    };
  }

  // Build connection string from individual parameters
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const connectionString = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require`;

  return {
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false  // Allow insecure certs for development
    }
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
