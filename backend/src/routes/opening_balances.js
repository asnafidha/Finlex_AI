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
      `SELECT a.id, a.code, a.name, a.type, a.nature,
              a.opening_debit, a.opening_credit,
              a.opening_balance,
              ag.name as group_name
       FROM accounts a LEFT JOIN account_groups ag ON ag.id=a.group_id
       WHERE a.company_id=$1 ORDER BY a.code`,
      [company_id]
    )
    // Total debit = sum of all opening_debit columns
    // Total credit = sum of all opening_credit columns
    // These must be equal for a balanced opening entry
    const total_debit  = rows.reduce((s,r) => s + parseFloat(r.opening_debit  || 0), 0)
    const total_credit = rows.reduce((s,r) => s + parseFloat(r.opening_credit || 0), 0)
    res.json({
      accounts: rows,
      total_debit,
      total_credit,
      is_balanced: Math.abs(total_debit - total_credit) < 0.01
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/opening-balances
// Body: {
//   company_id,
//   as_of_date,          -- date for the opening journal entry (typically fy_start_date - 1 day)
//   balances: [{ account_id, debit, credit }],   -- NEW: explicit debit/credit per account
//   strict               -- if true, reject if not balanced (default true)
// }
//
// DESIGN: Each balance entry now carries explicit debit and credit amounts.
// The caller must send exactly one > 0 per account (contra accounts handled naturally).
// We:
//   1. Validate each row: debit >= 0, credit >= 0, not both > 0
//   2. Check total_debit == total_credit (strict mode)
//   3. Auto-adjust to Retained Earnings if not strict
//   4. UPDATE accounts.opening_debit / opening_credit (trigger keeps opening_balance in sync)
//   5. Create / replace the Opening Journal Entry in journal_entries so the
//      ledger and trial balance reflect opening balances as proper posted lines
router.post('/', async (req, res) => {
  const { company_id, as_of_date, balances, strict = true } = req.body
  if (!company_id || !balances?.length)
    return res.status(400).json({ error: 'company_id and balances array required' })

  // FIX: Verify CA has access to this company
  const { rows: access } = await pool.query(
    'SELECT 1 FROM ca_company_access WHERE ca_id=$1 AND company_id=$2', [req.user.id, company_id]
  )
  if (!access.length) return res.status(403).json({ error: 'Access denied to this company' })

  // Validate each balance row
  for (const b of balances) {
    const d = parseFloat(b.debit  || 0)
    const c = parseFloat(b.credit || 0)
    if (d < 0 || c < 0)
      return res.status(400).json({ error: `account_id ${b.account_id}: debit and credit must be >= 0` })
    if (d > 0 && c > 0)
      return res.status(400).json({ error: `account_id ${b.account_id}: debit and credit cannot both be > 0 on the same account` })
  }

  // Fetch account types for all accounts in the payload
  const ids = balances.map(b => b.account_id)
  const { rows: accRows } = await pool.query(
    `SELECT id, type, code FROM accounts WHERE id = ANY($1) AND company_id=$2`,
    [ids, company_id]
  )
  if (accRows.length !== ids.length) {
    const foundIds = new Set(accRows.map(r => r.id))
    const missing = ids.filter(id => !foundIds.has(id))
    return res.status(400).json({ error: `account_id(s) ${missing.join(',')} do not belong to company ${company_id}` })
  }

  // Compute totals using explicit debit/credit columns
  let totalDebit = 0, totalCredit = 0
  balances.forEach(b => {
    totalDebit  += parseFloat(b.debit  || 0)
    totalCredit += parseFloat(b.credit || 0)
  })
  const diff = Math.abs(totalDebit - totalCredit)

  if (strict && diff > 0.01) {
    return res.status(400).json({
      error: `Opening balances don't tally. Total Debit: ₹${totalDebit.toFixed(2)}, Total Credit: ₹${totalCredit.toFixed(2)}, Difference: ₹${diff.toFixed(2)}. Uncheck "Auto-adjust" to override.`,
      total_debit: totalDebit,
      total_credit: totalCredit,
      difference: diff,
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let adjustment_note = null

    // Auto-adjust to Retained Earnings (3002) if not strict
    if (!strict && diff > 0.01) {
      const { rows: reRows } = await client.query(
        'SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, '3002']
      )
      if (reRows.length) {
        const reId = reRows[0].id
        const existing = balances.find(b => b.account_id === reId)
        if (totalDebit > totalCredit) {
          // Need more credit — add to Retained Earnings credit
          const adj = totalDebit - totalCredit
          if (existing) existing.credit = parseFloat(existing.credit || 0) + adj
          else balances.push({ account_id: reId, debit: 0, credit: adj })
          totalCredit += adj
        } else {
          // Need more debit — reduce Retained Earnings credit (or go negative → debit)
          const adj = totalCredit - totalDebit
          if (existing) {
            const newCredit = parseFloat(existing.credit || 0) - adj
            if (newCredit >= 0) { existing.credit = newCredit }
            else { existing.credit = 0; existing.debit = Math.abs(newCredit) }
          } else {
            balances.push({ account_id: reId, debit: adj, credit: 0 })
          }
          totalDebit += adj
        }
        adjustment_note = `₹${diff.toFixed(2)} auto-adjusted to Retained Earnings (3002)`
      }
    }

    // ── Step 1: Update opening_debit / opening_credit on each account ──────
    for (const b of balances) {
      await client.query(
        `UPDATE accounts
         SET opening_debit=$1, opening_credit=$2
         WHERE id=$3 AND company_id=$4`,
        [parseFloat(b.debit || 0), parseFloat(b.credit || 0), b.account_id, company_id]
        // The sync_opening_balance trigger automatically keeps opening_balance in sync
      )
    }

    // ── Step 2: Create / replace the Opening Journal Entry ────────────────
    // This is the "Dr Assets, Cr Capital/Liabilities" entry that initialises
    // the ledger. It uses reference_type='opening' so reports can easily
    // exclude it from period P&L but include it in ledger running balances.
    //
    // We delete any previous opening entry and re-create it so re-saves are safe.
    const { rows: oldOBJe } = await client.query(
      `SELECT id FROM journal_entries WHERE company_id=$1 AND reference_type='opening'`,
      [company_id]
    )
    for (const oje of oldOBJe) {
      await client.query('DELETE FROM journal_entry_lines WHERE journal_entry_id=$1', [oje.id])
      await client.query('DELETE FROM journal_entries WHERE id=$1', [oje.id])
    }

    // Only create an opening entry if there are non-zero balances
    const hasNonZero = balances.some(b => parseFloat(b.debit || 0) > 0 || parseFloat(b.credit || 0) > 0)
    if (hasNonZero) {
      const entryDate = as_of_date || (await client.query(
        'SELECT fy_start_date FROM companies WHERE id=$1', [company_id]
      )).rows[0]?.fy_start_date || new Date().toISOString().split('T')[0]

      const { rows: jeRow } = await client.query(
        `INSERT INTO journal_entries
           (company_id, entry_number, entry_date, reference_type, narration, is_posted, created_by)
         VALUES ($1, 'OB-0001', $2, 'opening', 'Opening Balance Entry', true, $3)
         RETURNING id`,
        [company_id, entryDate, req.user.id]
      )
      const jeId = jeRow[0].id

      // Insert lines: one debit line per account with opening_debit > 0,
      //               one credit line per account with opening_credit > 0
      for (const b of balances) {
        const d = parseFloat(b.debit  || 0)
        const c = parseFloat(b.credit || 0)
        if (d > 0) {
          await client.query(
            `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
             VALUES($1,$2,$3,0,'Opening balance')`,
            [jeId, b.account_id, d]
          )
        } else if (c > 0) {
          await client.query(
            `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
             VALUES($1,$2,0,$3,'Opening balance')`,
            [jeId, b.account_id, c]
          )
        }
      }
      // NOTE: The DEFERRABLE trigger trg_enforce_double_entry will verify
      // SUM(debit) = SUM(credit) at COMMIT time. If balances are not equal
      // the transaction will be rolled back with a clear error.
    }

    // ── Step 3: Log the import ─────────────────────────────────────────────
    await client.query(
      `INSERT INTO opening_balance_imports
         (company_id, as_of_date, financial_year, total_debit, total_credit, is_balanced, imported_by)
       SELECT $1, $2::date,
              c.financial_year,
              $3, $4, $5, $6
       FROM companies c WHERE c.id=$1`,
      [company_id, as_of_date || null, totalDebit, totalCredit, diff < 0.01, req.user.id]
    )

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values)
       VALUES($1,$2,'OPENING_BALANCE_SAVED','accounts',NULL,$3)`,
      [company_id, req.user.id, JSON.stringify({
        accounts_updated: balances.length,
        as_of_date,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_balanced: diff < 0.01
      })]
    )

    await client.query('COMMIT')
    res.json({
      message:         `Opening balances saved for ${balances.length} accounts`,
      total_debit:     totalDebit,
      total_credit:    totalCredit,
      is_balanced:     diff < 0.01,
      adjustment_note,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// POST /api/opening-balances/import — CSV import alias
// Accepts CSV with columns: account_id, debit, credit
// Also supports legacy format with just opening_balance (auto-splits by account type)
router.post('/import', async (req, res, next) => {
  const { company_id, as_of_date, rows: csvRows, strict = false } = req.body
  if (!company_id || !csvRows?.length)
    return res.status(400).json({ error: 'company_id and rows required' })

  // Convert legacy single-column format if needed
  // Legacy: { account_id, opening_balance } → new: { account_id, debit, credit }
  const { rows: accTypes } = await pool.query(
    'SELECT id, type FROM accounts WHERE company_id=$1', [company_id]
  )
  const typeMap = {}
  accTypes.forEach(a => { typeMap[a.id] = a.type })

  const balances = csvRows.map(r => {
    // If caller already sends debit/credit, use them directly
    if (r.debit !== undefined || r.credit !== undefined) {
      return { account_id: parseInt(r.account_id), debit: parseFloat(r.debit || 0), credit: parseFloat(r.credit || 0) }
    }
    // Legacy: split opening_balance by account type
    const amt = parseFloat(r.opening_balance || r.amount || 0)
    const type = typeMap[parseInt(r.account_id)]
    if (['asset','expense'].includes(type)) {
      return { account_id: parseInt(r.account_id), debit: Math.max(0, amt), credit: Math.max(0, -amt) }
    } else {
      return { account_id: parseInt(r.account_id), debit: Math.max(0, -amt), credit: Math.max(0, amt) }
    }
  })

  // Delegate to the main POST handler by re-forming the request body
  req.body = { company_id, as_of_date, balances, strict }
  req.url = '/'
  router.handle(req, res, next)
})

// GET /api/opening-balances/template — CSV download (updated to debit/credit columns)
router.get('/template', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT id, code, name, type, nature, opening_debit, opening_credit
       FROM accounts WHERE company_id=$1 ORDER BY code`,
      [company_id]
    )
    let csv = 'account_id,code,account_name,type,nature,debit,credit\n'
    rows.forEach(r => {
      csv += `${r.id},${r.code},"${r.name}",${r.type},${r.nature},${parseFloat(r.opening_debit||0).toFixed(2)},${parseFloat(r.opening_credit||0).toFixed(2)}\n`
    })
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="opening_balances_template.csv"')
    res.send(csv)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router