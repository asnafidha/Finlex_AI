const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/opening-balances?company_id=xxx
router.get('/', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.code, a.name, a.type, a.nature, a.opening_balance, ag.name as group_name
       FROM accounts a LEFT JOIN account_groups ag ON ag.id=a.group_id
       WHERE a.company_id=$1 ORDER BY a.code`,
      [company_id]
    )
    const total_debit  = rows.filter(r => ['asset','expense'].includes(r.type)).reduce((s,r) => s + parseFloat(r.opening_balance||0), 0)
    const total_credit = rows.filter(r => ['liability','equity','revenue'].includes(r.type)).reduce((s,r) => s + parseFloat(r.opening_balance||0), 0)
    res.json({ accounts: rows, total_debit, total_credit, is_balanced: Math.abs(total_debit - total_credit) < 0.01 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/opening-balances — save balances (main endpoint used by frontend)
// Body: { company_id, as_of_date, balances: [{account_id, amount}], strict }
router.post('/', async (req, res) => {
  const { company_id, as_of_date, balances, strict = true } = req.body
  if (!company_id || !balances?.length)
    return res.status(400).json({ error: 'company_id and balances array required' })

  // Load account types to correctly categorise debit/credit nature
  const { rows: accTypes } = await pool.query(
    'SELECT id, type FROM accounts WHERE company_id=$1', [company_id]
  )
  const typeMap = {}
  accTypes.forEach(a => { typeMap[a.id] = a.type })

  // Compute totals: debit-nature = asset+expense, credit-nature = liability+equity+revenue
  let debitTotal = 0, creditTotal = 0
  balances.forEach(b => {
    const t = typeMap[b.account_id]
    const amt = parseFloat(b.amount || 0)
    if (['asset','expense'].includes(t))          debitTotal += amt
    else if (['liability','equity','revenue'].includes(t)) creditTotal += amt
  })

  const diff = Math.abs(debitTotal - creditTotal)

  // If strict mode and unbalanced, reject
  if (strict && diff > 0.01) {
    return res.status(400).json({
      error: `Opening balances don't tally. Debit-nature total: ₹${debitTotal.toFixed(2)}, Credit-nature total: ₹${creditTotal.toFixed(2)}, Difference: ₹${diff.toFixed(2)}. Uncheck "Auto-adjust" to override.`,
      debit_total: debitTotal,
      credit_total: creditTotal,
      difference: diff,
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let adjustment_note = null

    // If not strict and unbalanced, auto-adjust to Retained Earnings (account 3002)
    if (!strict && diff > 0.01) {
      const { rows: reRows } = await client.query(
        'SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, '3002']
      )
      if (reRows.length) {
        const reId = reRows[0].id
        const existing = balances.find(b => b.account_id === reId)
        const adjustment = debitTotal > creditTotal ? -(debitTotal - creditTotal) : (creditTotal - debitTotal)
        if (existing) {
          existing.amount = parseFloat(existing.amount || 0) + adjustment
        } else {
          balances.push({ account_id: reId, amount: adjustment })
        }
        adjustment_note = `₹${Math.abs(adjustment).toFixed(2)} auto-adjusted to Retained Earnings (3002)`
      }
    }

    for (const b of balances) {
      await client.query(
        'UPDATE accounts SET opening_balance=$1 WHERE id=$2 AND company_id=$3',
        [parseFloat(b.amount || 0), b.account_id, company_id]
      )
    }

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,'OPENING_BALANCE_SAVED','accounts',NULL,$3)`,
      [company_id, req.user.id, JSON.stringify({ accounts_updated: balances.length, as_of_date, debit_total: debitTotal, credit_total: creditTotal })]
    )

    await client.query('COMMIT')
    res.json({
      message:         `Opening balances saved for ${balances.length} accounts`,
      debit_total:     debitTotal,
      credit_total:    creditTotal,
      is_balanced:     diff < 0.01,
      adjustment_note,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// POST /api/opening-balances/import — same as above (alias used by api.js importCsv)
router.post('/import', (req, res, next) => {
  req.url = '/'; router.handle(req, res, next)
})

// GET /api/opening-balances/template — CSV download
router.get('/template', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      'SELECT id, code, name, type, nature FROM accounts WHERE company_id=$1 ORDER BY code', [company_id]
    )
    let csv = 'account_id,code,account_name,type,nature,opening_balance\n'
    rows.forEach(r => { csv += `${r.id},${r.code},"${r.name}",${r.type},${r.nature},0.00\n` })
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="opening_balances_template.csv"')
    res.send(csv)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router