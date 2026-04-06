require('dotenv').config()
const express = require('express')
const cors    = require('cors')

const app = express()

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000']
  : true

app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── Phase 1 ────────────────────────────────────────────────
app.use('/api/auth',             require('./routes/auth'))
app.use('/api/companies',        require('./routes/companies'))
app.use('/api/accounts',         require('./routes/accounts'))
app.use('/api/invoices',         require('./routes/invoices'))
app.use('/api/payments',         require('./routes/payments'))
app.use('/api/journals',         require('./routes/journals'))
app.use('/api/reports',          require('./routes/reports'))
app.use('/api/compliance',       require('./routes/compliance'))
app.use('/api/ca',               require('./routes/ca'))
app.use('/api/ai',               require('./routes/ai'))

// ── Phase 2 ────────────────────────────────────────────────
app.use('/api/tds',              require('./routes/tds'))
app.use('/api/gstr',             require('./routes/gstr'))
app.use('/api/itc',              require('./routes/itc'))
app.use('/api/itr',              require('./routes/itr'))
app.use('/api/audit-trail',      require('./routes/audit_trail'))

// ── Phase 3 ────────────────────────────────────────────────
app.use('/api/actions',          require('./routes/actions'))

// ── Phase 4 (V2 features) ──────────────────────────────────
app.use('/api/credit-notes',     require('./routes/credit_notes'))
app.use('/api/opening-balances', require('./routes/opening_balances'))
app.use('/api/bank-recon',       require('./routes/bank_reconciliation'))
app.use('/api/payroll',          require('./routes/payroll'))
app.use('/api/depreciation',     require('./routes/depreciation'))
app.use('/api/advance-tax',      require('./routes/advance_tax'))

// ── Health ─────────────────────────────────────────────────
app.get('/',           (req, res) => res.json({ status: 'FinLex API running', version: '4.1.0' }))
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '4.1.0', timestamp: new Date().toISOString() }))

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }))

// ── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌', err.stack)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`🚀 FinLex v4.1 → http://localhost:${PORT}`))