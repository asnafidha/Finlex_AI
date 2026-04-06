const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/bank-recon?company_id=xxx&matched=true/false
router.get('/', async (req, res) => {
  const { company_id, matched } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = `SELECT bs.*, je.entry_number as matched_entry_number, je.narration as je_narration
             FROM bank_statements bs
             LEFT JOIN journal_entries je ON je.id = bs.matched_je_id
             WHERE bs.company_id=$1`
    const params = [company_id]
    if (matched === 'true')  { q += ` AND bs.matched=true` }
    if (matched === 'false') { q += ` AND bs.matched=false` }
    q += ' ORDER BY bs.statement_date DESC'
    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/bank-recon/summary?company_id=xxx
router.get('/summary', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE matched=true)  AS matched_count,
         COUNT(*) FILTER (WHERE matched=false) AS unmatched_count,
         COUNT(*)                               AS total_count,
         MAX(statement_date)                    AS last_statement_date
       FROM bank_statements WHERE company_id=$1`,
      [company_id]
    )

    // Book balance = bank account balance from journal entries
    const { rows: balRows } = await pool.query(
      `SELECT COALESCE(a.opening_balance,0)+COALESCE(SUM(jel.debit_amount),0)-COALESCE(SUM(jel.credit_amount),0) AS balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.code='1002'
       GROUP BY a.id, a.opening_balance`,
      [company_id]
    )

    const s = stats[0]
    res.json({
      matched_count:       parseInt(s.matched_count || 0),
      unmatched_count:     parseInt(s.unmatched_count || 0),
      total_count:         parseInt(s.total_count || 0),
      last_statement_date: s.last_statement_date,
      book_balance:        parseFloat(balRows[0]?.balance || 0),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/bank-recon/import  (also handles /upload alias)
router.post('/import', async (req, res) => {
  const { company_id, statements } = req.body
  if (!company_id || !statements?.length)
    return res.status(400).json({ error: 'company_id and statements array required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get bank account id
    const { rows: accRows } = await client.query(
      'SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, '1002']
    )
    const account_id = accRows[0]?.id
    if (!account_id) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Bank account (1002) not found for this company' })
    }

    let inserted = 0, duplicates = 0

    for (const s of statements) {
      if (!s.statement_date || (!parseFloat(s.debit || 0) && !parseFloat(s.credit || 0))) continue

      const debit  = Math.abs(parseFloat(s.debit  || 0))
      const credit = Math.abs(parseFloat(s.credit || 0))

      // Check duplicate (same date + description + amount)
      const { rows: dup } = await client.query(
        `SELECT id FROM bank_statements WHERE company_id=$1 AND statement_date=$2 AND description=$3 AND debit_amount=$4 AND credit_amount=$5`,
        [company_id, s.statement_date, s.description || '', debit, credit]
      )
      if (dup.length > 0) { duplicates++; continue }

      await client.query(
        `INSERT INTO bank_statements(company_id,account_id,statement_date,description,debit_amount,credit_amount,balance,reference)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [company_id, account_id, s.statement_date, s.description || '', debit, credit,
         parseFloat(s.balance || 0), s.reference || null]
      )
      inserted++
    }

    // Auto-match newly inserted lines
    let auto_matched = 0
    const { rows: unmatched } = await client.query(
      'SELECT * FROM bank_statements WHERE company_id=$1 AND matched=false', [company_id]
    )

    for (const stmt of unmatched) {
      const amt = parseFloat(stmt.debit_amount) > 0 ? parseFloat(stmt.debit_amount) : parseFloat(stmt.credit_amount)
      const col = parseFloat(stmt.debit_amount) > 0 ? 'jel.credit_amount' : 'jel.debit_amount'

      const { rows: jeMatches } = await client.query(
        `SELECT je.id FROM journal_entries je
         JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
         JOIN accounts a ON a.id=jel.account_id
         WHERE je.company_id=$1 AND a.id=$2 AND ${col}=$3
           AND je.entry_date BETWEEN $4::date-3 AND $4::date+3
         ORDER BY ABS(EXTRACT(EPOCH FROM (je.entry_date - $4::date))) ASC LIMIT 1`,
        [company_id, account_id, amt, stmt.statement_date]
      )

      if (jeMatches.length > 0) {
        await client.query(
          'UPDATE bank_statements SET matched=true, matched_je_id=$1 WHERE id=$2',
          [jeMatches[0].id, stmt.id]
        )
        auto_matched++
      }
    }

    await client.query('COMMIT')
    res.json({ message: 'Import complete', imported: inserted, duplicates, auto_matched })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// POST /api/bank-recon/upload — alias
router.post('/upload', (req, res, next) => {
  if (req.body.lines) req.body.statements = req.body.lines
  req.url = '/import'; router.handle(req, res, next)
})

// POST /api/bank-recon/auto-match — run auto-match on all unmatched
router.post('/auto-match', async (req, res) => {
  const { company_id } = req.body
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: accRows } = await client.query(
      'SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, '1002']
    )
    const account_id = accRows[0]?.id
    if (!account_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Bank account not found' }) }

    const { rows: unmatched } = await client.query(
      'SELECT * FROM bank_statements WHERE company_id=$1 AND matched=false ORDER BY statement_date', [company_id]
    )

    let matched = 0
    for (const stmt of unmatched) {
      const amt = parseFloat(stmt.debit_amount) > 0 ? parseFloat(stmt.debit_amount) : parseFloat(stmt.credit_amount)
      const col = parseFloat(stmt.debit_amount) > 0 ? 'jel.credit_amount' : 'jel.debit_amount'

      const { rows: jeMatches } = await client.query(
        `SELECT je.id FROM journal_entries je
         JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
         JOIN accounts a ON a.id=jel.account_id
         WHERE je.company_id=$1 AND a.id=$2 AND ${col}=$3
           AND je.entry_date BETWEEN $4::date-5 AND $4::date+5
         ORDER BY ABS(EXTRACT(EPOCH FROM (je.entry_date - $4::date))) ASC LIMIT 1`,
        [company_id, account_id, amt, stmt.statement_date]
      )

      if (jeMatches.length > 0) {
        await client.query(
          'UPDATE bank_statements SET matched=true, matched_je_id=$1 WHERE id=$2',
          [jeMatches[0].id, stmt.id]
        )
        matched++
      }
    }

    await client.query('COMMIT')
    res.json({ message: 'Auto-match complete', matched, total: unmatched.length, remaining: unmatched.length - matched })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// PATCH /api/bank-recon/:id/match
router.patch('/:id/match', async (req, res) => {
  const { journal_entry_id } = req.body
  if (!journal_entry_id) return res.status(400).json({ error: 'journal_entry_id required' })
  try {
    const { rows } = await pool.query(
      'UPDATE bank_statements SET matched=true, matched_je_id=$1 WHERE id=$2 RETURNING *',
      [journal_entry_id, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Statement line not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH /api/bank-recon/:id/unmatch
router.patch('/:id/unmatch', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE bank_statements SET matched=false, matched_je_id=NULL WHERE id=$1 RETURNING *',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Statement line not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE /api/bank-recon/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bank_statements WHERE id=$1', [req.params.id])
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router