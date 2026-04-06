const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/compliance?company_id=xxx&status=pending&type=GST
router.get('/', async (req, res) => {
  const { company_id, status, type } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let query = `SELECT * FROM compliance_deadlines WHERE company_id=$1`
    const params = [company_id]
    if (status) { params.push(status); query += ` AND status=$${params.length}` }
    if (type)   { params.push(type);   query += ` AND type=$${params.length}` }
    query += ' ORDER BY due_date ASC'
    const { rows } = await pool.query(query, params)
    const today = new Date()
    const updated = rows.map(r => ({
      ...r,
      status: r.status === 'pending' && new Date(r.due_date) < today ? 'overdue' : r.status,
      days_left: Math.ceil((new Date(r.due_date) - today) / (1000*60*60*24))
    }))
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/compliance/dashboard?company_id=xxx
router.get('/dashboard', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const today = new Date().toISOString().split('T')[0]
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE due_date < $2 AND status='pending')                        AS overdue,
        COUNT(*) FILTER (WHERE due_date BETWEEN $2 AND $2::date+7 AND status='pending')   AS due_this_week,
        COUNT(*) FILTER (WHERE status='completed')                                         AS completed,
        COUNT(*) FILTER (WHERE status='pending')                                           AS pending
       FROM compliance_deadlines WHERE company_id=$1`,
      [company_id, today]
    )
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/compliance — add a custom deadline
router.post('/', async (req, res) => {
  const { company_id, type, name, due_date, financial_year, period, notes } = req.body
  if (!company_id || !type || !name || !due_date)
    return res.status(400).json({ error: 'company_id, type, name, due_date required' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO compliance_deadlines(company_id,type,name,due_date,financial_year,period,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [company_id, type, name, due_date, financial_year||null, period||null, notes||null]
    )
    res.status(201).json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/compliance/:id/complete
router.patch('/:id/complete', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE compliance_deadlines SET status='completed',notes=COALESCE($1,notes) WHERE id=$2 RETURNING *`,
      [req.body.notes||null, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Deadline not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/compliance/:id/reopen
router.patch('/:id/reopen', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE compliance_deadlines SET status='pending' WHERE id=$1 RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Deadline not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router