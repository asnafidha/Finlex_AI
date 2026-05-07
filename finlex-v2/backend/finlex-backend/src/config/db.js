// ✅ FIXED VERSION - No Hardcoded Credentials
// Location: src/config/db.js

const { Pool } = require('pg')
require('dotenv').config()

// ✅ SECURITY: Validate all required environment variables exist
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missingVars = requiredEnvVars.filter(v => !process.env[v])

if (missingVars.length > 0) {
  console.error(`❌ FATAL: Missing required environment variables: ${missingVars.join(', ')}`)
  console.error('Set these in your .env file before starting the server')
  process.exit(1)
}

// ✅ SECURITY: Warn if using default password (dev only)
if (process.env.DB_PASSWORD === 'postgres123') {
  console.warn('⚠️  WARNING: Using default database password. This is OK for development only!')
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: Default password NOT allowed in production')
    process.exit(1)
  }
}

// ✅ SECURITY: Validate port is numeric
const dbPort = parseInt(process.env.DB_PORT)
if (isNaN(dbPort)) {
  console.error('❌ FATAL: DB_PORT must be a number')
  process.exit(1)
}

// ✅ Connection pool with proper error handling
const pool = new Pool({
  host: process.env.DB_HOST,
  port: dbPort,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,                      // Max connections in pool
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Fail fast if can't connect in 5s
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// ✅ Connection logging
pool.on('connect', () => {
  console.log(`✅ PostgreSQL connected to ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`)
})

// ✅ Error handler with graceful shutdown
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err)
  process.exit(-1)
})

// ✅ Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...')
  await pool.end()
  process.exit(0)
})

module.exports = pool