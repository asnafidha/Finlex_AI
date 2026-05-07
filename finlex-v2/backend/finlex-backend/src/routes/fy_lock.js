// ============================================================
// Feature D: Financial Year Lock
// POST /api/fy-lock/:company_id/lock   — lock the FY
// POST /api/fy-lock/:company_id/unlock — unlock the FY
// GET  /api/fy-lock/:company_id        — get lock status
// ============================================================
const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/fy-lock/:company_id
router.get('/:company_id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.financial_year, c.fy_start_date, c.fy_end_date,
              c.fy_locked, c.fy_locked_at, c.fy_locked_by,
              u.name AS locked_by_name
       FROM companies c
       LEFT JOIN users u ON u.id = c.fy_locked_by
       WHERE c.id = $1`,
      [req.params.company_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Company not found' })
    res.json(rows[0])
  } catch (err) { 
    res.status(500).json({ error: err.message })
  }
})

// POST /api/fy-lock/:company_id/lock
router.post('/:company_id/lock', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'SELECT fy_locked, financial_year FROM companies WHERE id = $1 FOR UPDATE',
      [req.params.company_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Company not found' })
    if (rows[0].fy_locked) return res.status(400).json({ error: `Financial year ${rows[0].financial_year} is already locked` })

    await client.query(
      `UPDATE companies SET fy_locked = true, fy_locked_at = NOW(), fy_locked_by = $1 WHERE id = $2`,
      [req.user.id, req.params.company_id]
    )
    await client.query(
      `INSERT INTO audit_log(company_id, user_id, action, table_name, record_id, new_values)
       VALUES($1, $2, 'FY_LOCKED', 'companies', $3, $4)`,
      [req.params.company_id, req.user.id, req.params.company_id,
       JSON.stringify({ financial_year: rows[0].financial_year, locked_at: new Date() })]
    )
    await client.query('COMMIT')
    res.json({ message: `Financial year ${rows[0].financial_year} locked successfully. No new entries allowed.`, fy_locked: true })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// POST /api/fy-lock/:company_id/unlock
router.post('/:company_id/unlock', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'SELECT fy_locked, financial_year FROM companies WHERE id = $1 FOR UPDATE',
      [req.params.company_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Company not found' })
    if (!rows[0].fy_locked) return res.status(400).json({ error: `Financial year ${rows[0].financial_year} is not locked` })

    await client.query(
      `UPDATE companies SET fy_locked = false, fy_locked_at = NULL, fy_locked_by = NULL WHERE id = $1`,
      [req.params.company_id]
    )
    await client.query(
      `INSERT INTO audit_log(company_id, user_id, action, table_name, record_id, new_values)
       VALUES($1, $2, 'FY_UNLOCKED', 'companies', $3, $4)`,
      [req.params.company_id, req.user.id, req.params.company_id,
       JSON.stringify({ financial_year: rows[0].financial_year, unlocked_at: new Date() })]
    )
    await client.query('COMMIT')
    res.json({ message: `Financial year ${rows[0].financial_year} unlocked.`, fy_locked: false })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

module.exports = router