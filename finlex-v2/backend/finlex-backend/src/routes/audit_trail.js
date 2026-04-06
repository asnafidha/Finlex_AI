const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/audit-trail?company_id=xxx&limit=50&action=&from=&to=
router.get('/', async (req, res) => {
  const { company_id, limit = 100, action, from, to, table_name } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let query = `
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.company_id=$1`
    const params = [company_id]
    if (action)     { params.push(action);      query += ` AND al.action=$${params.length}` }
    if (table_name) { params.push(table_name);  query += ` AND al.table_name=$${params.length}` }
    if (from)       { params.push(from);        query += ` AND al.created_at>=$${params.length}` }
    if (to)         { params.push(to);          query += ` AND al.created_at<=$${params.length}` }
    params.push(parseInt(limit))
    query += ` ORDER BY al.created_at DESC LIMIT $${params.length}`
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/audit-trail/actions — list distinct action types for filter
router.get('/actions', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT action FROM audit_log WHERE company_id=$1 ORDER BY action', [company_id]
    )
    res.json(rows.map(r => r.action))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router