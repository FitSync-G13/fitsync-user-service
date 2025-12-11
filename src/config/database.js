const { Pool } = require('pg');
const logger = require('./logger');

// Database configuration using connection string
// For production: Set DATABASE_URL with sslmode=require for TLS
// For local dev: Set DATABASE_URL without sslmode for plain connection
const getConnectionConfig = () => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Enable SSL if sslmode is specified in connection string
  if (url.includes('sslmode=')) {
    return {
      connectionString: url,
      ssl: {
        rejectUnauthorized: false  // DevOps will handle proper certs in production
      }
    };
  }

  // Plain connection for local development
  return {
    connectionString: url
  };
};

const config = getConnectionConfig();

const pool = new Pool(config);

pool.on('connect', () => {
  const sslStatus = config.ssl ? 'with TLS' : 'without TLS';
  logger.info(`Database connection established ${sslStatus}`);
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;
