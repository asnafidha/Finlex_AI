// ✅ FIXED VERSION - Enhanced Security Headers & HTTPS Enforcement
// Location: src/server.js

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const morgan = require('morgan')

const app = express()

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: Request Logging
// ════════════════════════════════════════════════════════════
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))


app.set('trust proxy', 1)

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: HTTPS Enforcement (Production)
// ════════════════════════════════════════════════════════════
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure) return next()

    return res.redirect(301, `https://${req.hostname}${req.url}`)
  })
}

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: Enhanced Security Headers
// ════════════════════════════════════════════════════════════
app.use(helmet({
  // Content Security Policy: Only allow resources from same origin
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Vite in dev
      styleSrc: ["'self'", "'unsafe-inline'"],   // unsafe-inline for React inline styles
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173'],
      frameSrc: ["'none'"],  // Prevent clickjacking
    },
  },
  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Enable XSS filter
  xssFilter: true,
  // HSTS: Tell browsers to use HTTPS only
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
}))

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: Trust Proxy (for load balancers)
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: Rate Limiting
// ════════════════════════════════════════════════════════════

// Strict limit on authentication endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 attempts
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production', // Disable in dev
})

// General API limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // Max 300 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
})

// ✅ SECURITY: Stricter limit on AI endpoints (expensive operations)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Only 10 AI requests per minute
  message: { error: 'AI endpoints are rate limited. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/auth', authLimiter)
app.use('/api/ai', aiLimiter)
app.use('/api/', apiLimiter)

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: CORS with strict validation
// ════════════════════════════════════════════════════════════

// Get allowed origins from environment
const frontendUrl = process.env.FRONTEND_URL?.trim()
const allowedOrigins = frontendUrl
  ? [
      frontendUrl,
      'http://localhost:5173', // Vite dev server
      'http://localhost:5174',
      'http://localhost:3000',
    ]
  : []

if (allowedOrigins.length === 0) {
  console.warn('⚠️  No FRONTEND_URL set. CORS will be permissive in development.')
}

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true, // Permissive in dev
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200,
  })
)

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: Body Parser with Size Limit
// ════════════════════════════════════════════════════════════
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ════════════════════════════════════════════════════════════
// ✅ SECURITY: Remove sensitive headers from responses
// ════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By')
  res.removeHeader('Server')
  next()
})

// ════════════════════════════════════════════════════════════
// ROUTES — Phase 1
// ════════════════════════════════════════════════════════════
app.use('/api/auth', require('./routes/auth'))
app.use('/api/companies', require('./routes/companies'))
app.use('/api/accounts', require('./routes/accounts'))
app.use('/api/invoices', require('./routes/invoices'))
app.use('/api/payments', require('./routes/payments'))
app.use('/api/journals', require('./routes/journals'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api/compliance', require('./routes/compliance'))
app.use('/api/ca', require('./routes/ca'))
app.use('/api/ai', require('./routes/ai'))

// ════════════════════════════════════════════════════════════
// ROUTES — Phase 2
// ════════════════════════════════════════════════════════════
app.use('/api/tds', require('./routes/tds'))
app.use('/api/gstr', require('./routes/gstr'))
app.use('/api/itc', require('./routes/itc'))
app.use('/api/itr', require('./routes/itr'))
app.use('/api/audit-trail', require('./routes/audit_trail'))

// ════════════════════════════════════════════════════════════
    // ROUTES — Phase 3
    // ════════════════════════════════════════════════════════════
    app.use('/api/actions', require('./routes/actions'))

    // ════════════════════════════════════════════════════════════
    // ROUTES — Phase 4 (V2 features)
    // ════════════════════════════════════════════════════════════
    app.use('/api/credit-notes', require('./routes/credit_notes'))
    app.use('/api/opening-balances', require('./routes/opening_balances'))
    app.use('/api/bank-recon', require('./routes/bank_reconciliation'))
    app.use('/api/payroll', require('./routes/payroll'))
    app.use('/api/depreciation', require('./routes/depreciation'))
    app.use('/api/advance-tax', require('./routes/advance_tax'))
    app.use('/api/party-ledger', require('./routes/party_ledger'))
    app.use('/api/fy-lock', require('./routes/fy_lock'))
    app.use('/api/audit', require('./routes/audit_risk'))
    app.use('/api/client-collab', require('./routes/client_collab'))

// ════════════════════════════════════════════════════════════
// ✅ HEALTH CHECK ENDPOINTS
// ════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: 'FinLex API running',
    version: '4.1.0',
    environment: process.env.NODE_ENV || 'development',
  })
})

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '4.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// ════════════════════════════════════════════════════════════
// ✅ 404 Handler
// ════════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  })
})

// ════════════════════════════════════════════════════════════
// ✅ GLOBAL ERROR HANDLER
// ════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  // Log error with request context
  console.error('❌ Error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    status: err.status || 500,
    timestamp: new Date().toISOString(),
  })

  // Don't expose stack trace to clients in production
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message

  res.status(err.status || 500).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
})

// ════════════════════════════════════════════════════════════
// ✅ UNHANDLED PROMISE REJECTION HANDLER
// ════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  // In production, you might want to alert/log to external service
})

// ════════════════════════════════════════════════════════════
// ✅ UNCAUGHT EXCEPTION HANDLER
// ════════════════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err)
  process.exit(1)
})

// ════════════════════════════════════════════════════════════
// ✅ START SERVER
// ════════════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT) || 5000

if (isNaN(PORT)) {
  console.error('❌ PORT must be a valid number')
  process.exit(1)
}

const server = app.listen(PORT, () => {
  console.log(`🚀 FinLex v4.1 → ${process.env.NODE_ENV === 'production' ? 'HTTPS' : 'HTTP'}://localhost:${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
})

// ✅ Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})