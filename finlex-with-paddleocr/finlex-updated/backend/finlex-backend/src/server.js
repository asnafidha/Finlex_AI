require('dotenv').config()
const express = require('express')
const cors    = require('cors')

const app = express()

app.use(cors({
  origin: '*',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Phase 1 Routes ───────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'))
app.use('/api/companies',  require('./routes/companies'))
app.use('/api/accounts',   require('./routes/accounts'))
app.use('/api/invoices',   require('./routes/invoices'))
app.use('/api/payments',   require('./routes/payments'))
app.use('/api/journals',   require('./routes/journals'))
app.use('/api/reports',    require('./routes/reports'))
app.use('/api/compliance', require('./routes/compliance'))
app.use('/api/ca',         require('./routes/ca'))
app.use('/api/ai',         require('./routes/ai'))

// ── Phase 2 Routes ───────────────────────────────────────────
app.use('/api/tds',         require('./routes/tds'))
app.use('/api/gstr',        require('./routes/gstr'))
app.use('/api/itc',         require('./routes/itc'))
app.use('/api/itr',         require('./routes/itr'))
app.use('/api/audit-trail', require('./routes/audit_trail'))

// ── Phase 3 Routes (SaaS Upgrade) ────────────────────────────
app.use('/api/actions',     require('./routes/actions'))

// ── Health Check ─────────────────────────────────────────────
app.get('/',           (req, res) => res.json({ status: 'FinLex API running', version: '3.0.0' }))
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'FinLex API healthy', version: '3.0.0', timestamp: new Date().toISOString() }))

// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }))

// ── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌', err.stack)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`🚀 FinLex server running on http://localhost:${PORT}`))