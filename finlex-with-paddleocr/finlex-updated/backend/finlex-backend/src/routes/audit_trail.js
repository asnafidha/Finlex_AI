const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/audit-trail?company_id=xxx&limit=50&offset=0
router.get('/', async (req, res) => {
  const { company_id, limit=50, offset=0 } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT al.id,al.action,al.table_name,al.record_id,al.old_values,al.new_values,al.ip_address,al.created_at,
              u.name as user_name,u.email as user_email
       FROM audit_log al
       LEFT JOIN users u ON u.id=al.user_id
       WHERE al.company_id=$1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [company_id, limit, offset]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/audit-trail — log an action
router.post('/', async (req, res) => {
  const { company_id, action, table_name, record_id, old_values, new_values } = req.body
  if (!company_id || !action) return res.status(400).json({ error: 'company_id and action required' })
  try {
    await pool.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,old_values,new_values,ip_address)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [company_id, req.user.id, action, table_name||null, record_id||null,
       old_values ? JSON.stringify(old_values) : null,
       new_values ? JSON.stringify(new_values) : null,
       req.ip||null]
    )
    res.status(201).json({ message: 'Logged' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router