const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/accounts?company_id=xxx&type=asset
router.get('/', async (req, res) => {
  const { company_id, type } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let query = `SELECT a.*, ag.name as group_name FROM accounts a LEFT JOIN account_groups ag ON ag.id = a.group_id WHERE a.company_id=$1`
    const params = [company_id]
    if (type) { params.push(type); query += ` AND a.type=$${params.length}` }
    query += ' ORDER BY a.code'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/accounts/grouped?company_id=xxx
router.get('/grouped', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT a.*, ag.name as group_name FROM accounts a LEFT JOIN account_groups ag ON ag.id=a.group_id WHERE a.company_id=$1 ORDER BY a.code`,
      [company_id]
    )
    const grouped = {
      asset:     rows.filter(r => r.type === 'asset'),
      liability: rows.filter(r => r.type === 'liability'),
      equity:    rows.filter(r => r.type === 'equity'),
      revenue:   rows.filter(r => r.type === 'revenue'),
      expense:   rows.filter(r => r.type === 'expense'),
    }
    res.json(grouped)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/accounts
router.post('/', async (req, res) => {
  const { company_id, code, name, type, sub_type, parent_id, opening_balance } = req.body
  if (!company_id || !code || !name || !type)
    return res.status(400).json({ error: 'company_id, code, name, type required' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO accounts(company_id,code,name,type,sub_type,parent_id,opening_balance)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [company_id, code, name, type, sub_type||null, parent_id||null, opening_balance||0]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Account code already exists' })
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/accounts/:id
router.put('/:id', async (req, res) => {
  const { name, sub_type, opening_balance } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE accounts SET name=$1,sub_type=$2,opening_balance=$3 WHERE id=$4 AND is_system=false RETURNING *`,
      [name, sub_type||null, opening_balance||0, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Account not found or is a system account' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router