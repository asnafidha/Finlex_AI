const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

router.get('/', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT je.*,
              COUNT(jel.id) as line_count,
              COALESCE(SUM(jel.debit_amount),0) as total_debit
       FROM journal_entries je
       LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       WHERE je.company_id=$1
       GROUP BY je.id ORDER BY je.entry_date DESC`,
      [company_id]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// FIX: Validate that journal entry belongs to a company the CA has access to
router.get('/:id', async (req, res) => {
  try {
    const je = await pool.query(
      `SELECT je.* FROM journal_entries je
       JOIN ca_company_access cca ON cca.company_id=je.company_id
       WHERE je.id=$1 AND cca.ca_id=$2`,
      [req.params.id, req.user.id]
    )
    if (!je.rows.length) return res.status(404).json({ error: 'Journal entry not found' })
    const lines = await pool.query(
      `SELECT jel.*, a.name as account_name, a.code as account_code
       FROM journal_entry_lines jel
       JOIN accounts a ON a.id=jel.account_id
       WHERE jel.journal_entry_id=$1`,
      [req.params.id]
    )
    res.json({ ...je.rows[0], lines: lines.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/journals — manual journal entry
router.post('/', async (req, res) => {
  const { company_id, entry_date, narration, lines } = req.body
  if (!company_id || !entry_date || !narration || !lines?.length)
    return res.status(400).json({ error: 'company_id, entry_date, narration, lines required' })

  // FIX: Verify CA has access to company_id
  const { rows: access } = await pool.query(
    'SELECT 1 FROM ca_company_access WHERE ca_id=$1 AND company_id=$2', [req.user.id, company_id]
  )
  if (!access.length) return res.status(403).json({ error: 'Access denied to this company' })

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit_amount)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit_amount) || 0), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01)
    return res.status(400).json({ error: `Debits (${totalDebit.toFixed(2)}) must equal credits (${totalCredit.toFixed(2)})` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Concurrent-safe JE numbering: lock at row level
    const { rows: countRows } = await client.query(
      'SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id]
    )
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,narration,reference_type,is_posted,created_by)
       VALUES($1,$2,$3,$4,'manual',true,$5) RETURNING *`,
      [company_id, entryNum, entry_date, narration, req.user.id]
    )
    for (const line of lines) {
      // FIX: Validate that each account_id belongs to the same company
      const accCheck = await client.query(
        'SELECT id FROM accounts WHERE id=$1 AND company_id=$2', [line.account_id, company_id]
      )
      if (!accCheck.rows.length) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `Account id ${line.account_id} does not belong to this company` })
      }
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [je.rows[0].id, line.account_id, line.debit_amount||0, line.credit_amount||0, line.narration||null]
      )
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,'JOURNAL_POSTED','journal_entries',$3,$4)`,
      [company_id, req.user.id, je.rows[0].id, JSON.stringify({ entry_number: entryNum, narration, total_debit: totalDebit, lines: lines.length })]
    )

    await client.query('COMMIT')
    res.status(201).json(je.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

module.exports = router