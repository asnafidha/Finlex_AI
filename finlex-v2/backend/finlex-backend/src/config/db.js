const { Pool } = require('pg')
require('dotenv').config()
 
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'finlex_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
})
 
pool.on('connect', () => console.log('✅ PostgreSQL connected'))
pool.on('error',  (err) => { console.error('❌ PostgreSQL error:', err); process.exit(-1) })
 
module.exports = pool
 