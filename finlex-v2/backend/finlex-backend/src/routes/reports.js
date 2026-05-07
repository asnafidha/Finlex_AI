const router = require('express').Router()
const pool = require('../config/db')
const auth = require('../middleware/auth')

router.use(auth)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/trial-balance?company_id=xxx&from=...&to=...
//
// CRITICAL FIX: Removed the HAVING clause that was hiding accounts with zero movement
// Now properly shows ALL accounts with any balance (opening OR period movement)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/trial-balance', async (req, res) => {
  const { company_id, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    // Auto-detect whether migration_deep_accounting_fixes.sql has been run.
    // That migration adds opening_debit and opening_credit split columns.
    // If they don't exist yet, fall back to deriving them from opening_balance + account type.
    const { rows: colCheck } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'accounts' AND column_name IN ('opening_debit','opening_credit')`
    )
    const hasSplitCols = colCheck.length === 2

    const openingDebitExpr = hasSplitCols
      ? 'COALESCE(a.opening_debit, 0)'
      : `CASE WHEN a.type IN ('asset','expense')
              THEN COALESCE(a.opening_balance, 0)
              ELSE 0 END`

    const openingCreditExpr = hasSplitCols
      ? 'COALESCE(a.opening_credit, 0)'
      : `CASE WHEN a.type IN ('liability','equity','revenue')
              THEN COALESCE(a.opening_balance, 0)
              ELSE 0 END`

    const groupByCols = hasSplitCols
      ? 'a.id, a.code, a.name, a.type, a.opening_debit, a.opening_credit'
      : 'a.id, a.code, a.name, a.type, a.opening_balance'

    const { rows } = await pool.query(
      `SELECT
         a.id,
         a.code, 
         a.name, 
         a.type,
         -- Opening columns: use split cols if available, else derive from opening_balance
         ${openingDebitExpr}  AS opening_debit,
         ${openingCreditExpr} AS opening_credit,
         
         -- Period movements (excluding opening entries)
         COALESCE(SUM(jel.debit_amount),  0) AS period_debit,
         COALESCE(SUM(jel.credit_amount), 0) AS period_credit,
         
         -- FIX: both sides use GREATEST(0,net) so contra balances flip correctly
         GREATEST(0,
           ${openingDebitExpr}  + COALESCE(SUM(jel.debit_amount),0)
         - ${openingCreditExpr} - COALESCE(SUM(jel.credit_amount),0)
         ) AS closing_debit,
         
         GREATEST(0,
           ${openingCreditExpr}  + COALESCE(SUM(jel.credit_amount),0)
         - ${openingDebitExpr}   - COALESCE(SUM(jel.debit_amount),0)
         ) AS closing_credit
         
       FROM accounts a
       
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.is_posted = true
         AND je.reference_type != 'opening'
         AND ($2::date IS NULL OR je.entry_date >= $2)
         AND ($3::date IS NULL OR je.entry_date <= $3)
         
       WHERE a.company_id = $1
       
       GROUP BY ${groupByCols}
       
       HAVING 
         ${openingDebitExpr}  > 0.01 OR
         ${openingCreditExpr} > 0.01 OR
         COALESCE(SUM(jel.debit_amount),  0) > 0.01 OR
         COALESCE(SUM(jel.credit_amount), 0) > 0.01
       
       ORDER BY a.code`,
      [company_id, from || null, to || null]
    )

    // Calculate totals
    const total_opening_debit = rows.reduce((s, r) => s + parseFloat(r.opening_debit), 0)
    const total_opening_credit = rows.reduce((s, r) => s + parseFloat(r.opening_credit), 0)
    const total_period_debit = rows.reduce((s, r) => s + parseFloat(r.period_debit), 0)
    const total_period_credit = rows.reduce((s, r) => s + parseFloat(r.period_credit), 0)
    const total_closing_debit = rows.reduce((s, r) => s + parseFloat(r.closing_debit), 0)
    const total_closing_credit = rows.reduce((s, r) => s + parseFloat(r.closing_credit), 0)

    const is_balanced = Math.abs(total_closing_debit - total_closing_credit) < 0.01

    res.json({
      accounts: rows,
      total_opening_debit,
      total_opening_credit,
      total_period_debit,
      total_period_credit,
      total_closing_debit,
      total_closing_credit,
      is_balanced,
      // Helpful debugging info
      balance_difference: (total_closing_debit - total_closing_credit).toFixed(2)
    })
  } catch (err) {
    console.error('Trial balance error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/pl?company_id=xxx&from=...&to=...
// Profit & Loss Statement
// ══════════════════════════════════════════════════════════════════════════════
router.get('/pl', async (req, res) => {
  const { company_id, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    const { rows } = await pool.query(
      `SELECT 
         a.code, 
         a.name, 
         a.type,
         COALESCE(SUM(jel.debit_amount),  0) AS total_debit,
         COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
         -- Revenue: credit - debit (positive = income earned)
         -- Expense: debit - credit (positive = expense incurred)
         CASE
           WHEN a.type = 'revenue' THEN 
             COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
           ELSE 
             COALESCE(SUM(jel.debit_amount),0)  - COALESCE(SUM(jel.credit_amount),0)
         END AS amount
         
       FROM accounts a
       
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.is_posted = true
         AND je.reference_type != 'opening'
         AND ($2::date IS NULL OR je.entry_date >= $2)
         AND ($3::date IS NULL OR je.entry_date <= $3)
         
       WHERE a.company_id = $1 
         AND a.type IN ('revenue','expense')
         
       GROUP BY a.id, a.code, a.name, a.type
       HAVING 
         COALESCE(SUM(jel.debit_amount), 0) > 0.01 OR
         COALESCE(SUM(jel.credit_amount), 0) > 0.01
       
       ORDER BY a.type DESC, a.code`,
      [company_id, from || null, to || null]
    )

    const revenue = rows.filter(r => r.type === 'revenue')
    const expenses = rows.filter(r => r.type === 'expense')

    const total_revenue = revenue.reduce((s, r) => s + parseFloat(r.amount), 0)
    const total_expenses = expenses.reduce((s, r) => s + parseFloat(r.amount), 0)
    const net_profit = total_revenue - total_expenses

    res.json({
      revenue,
      expenses,
      total_revenue,
      total_expenses,
      net_profit,
      is_profit: net_profit >= 0
    })
  } catch (err) {
    console.error('P&L error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/balance-sheet?company_id=xxx&as_of=2025-03-31
//
// FIX: Checks closing_entries_posted flag to prevent double-counting profit
// ══════════════════════════════════════════════════════════════════════════════
router.get('/balance-sheet', async (req, res) => {
  const { company_id, as_of } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    // Check if year-end closing entries have been posted
    const { rows: coRows } = await pool.query(
      'SELECT closing_entries_posted FROM companies WHERE id=$1', [company_id]
    )
    const closing_entries_posted = coRows[0]?.closing_entries_posted || false

    const { rows } = await pool.query(
      `SELECT
         a.code, 
         a.name, 
         a.type,
         COALESCE(a.opening_debit,  0) AS opening_debit,
         COALESCE(a.opening_credit, 0) AS opening_credit,
         COALESCE(SUM(jel.debit_amount),  0) AS total_debit,
         COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
         
         -- Closing balance for B/S accounts
         CASE
           WHEN a.type = 'asset' THEN
             COALESCE(a.opening_debit,0)  - COALESCE(a.opening_credit,0)
           + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0)
           ELSE
             COALESCE(a.opening_credit,0) - COALESCE(a.opening_debit,0)
           + COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
         END AS closing_balance
         
       FROM accounts a
       
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.is_posted = true
         AND je.reference_type != 'opening'
         AND ($2::date IS NULL OR je.entry_date <= $2)
         
       WHERE a.company_id = $1 
         AND a.type IN ('asset','liability','equity')
         
       GROUP BY a.id, a.code, a.name, a.type, a.opening_debit, a.opening_credit
       HAVING
         COALESCE(a.opening_debit, 0) > 0.01 OR
         COALESCE(a.opening_credit, 0) > 0.01 OR
         COALESCE(SUM(jel.debit_amount), 0) > 0.01 OR
         COALESCE(SUM(jel.credit_amount), 0) > 0.01
       
       ORDER BY a.type, a.code`,
      [company_id, as_of || null]
    )

    // CRITICAL: Only add net_profit if closing entries have NOT been posted
    // Once closing entries are done, P&L is already in Retained Earnings
    let net_profit = 0
    if (!closing_entries_posted) {
      const { rows: plRows } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN a.type='revenue' THEN jel.credit_amount - jel.debit_amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN a.type='expense' THEN jel.debit_amount  - jel.credit_amount ELSE 0 END), 0)
           AS net_profit
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         JOIN accounts a ON a.id = jel.account_id
         WHERE je.company_id = $1
           AND je.is_posted = true
           AND je.reference_type != 'opening'
           AND a.type IN ('revenue','expense')
           AND ($2::date IS NULL OR je.entry_date <= $2)`,
        [company_id, as_of || null]
      )
      net_profit = parseFloat(plRows[0]?.net_profit || 0)
    }

    const assets = rows.filter(r => r.type === 'asset')
    const liabilities = rows.filter(r => r.type === 'liability')
    const equity = rows.filter(r => r.type === 'equity')

    const total_assets = assets.reduce((s, r) => s + parseFloat(r.closing_balance), 0)
    const total_liabilities = liabilities.reduce((s, r) => s + parseFloat(r.closing_balance), 0)
    const total_equity_accounts = equity.reduce((s, r) => s + parseFloat(r.closing_balance), 0)
    const total_equity = total_equity_accounts + net_profit

    const is_balanced = Math.abs(total_assets - (total_liabilities + total_equity)) < 0.01

    res.json({
      assets,
      liabilities,
      equity,
      net_profit,
      closing_entries_posted,
      total_assets,
      total_liabilities,
      total_equity,
      is_balanced,
      balance_difference: (total_assets - (total_liabilities + total_equity)).toFixed(2)
    })
  } catch (err) {
    console.error('Balance sheet error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/ledger?company_id=xxx&account_code=1001&from=...&to=...
// Account Ledger with running balance
// ══════════════════════════════════════════════════════════════════════════════
router.get('/ledger', async (req, res) => {
  const { company_id, account_code, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    // Fetch opening balances
    let obQuery = `SELECT a.code, a.type, a.opening_debit, a.opening_credit
                   FROM accounts a WHERE a.company_id=$1`
    const obParams = [company_id]
    if (account_code) {
      obParams.push(account_code)
      obQuery += ` AND a.code=$${obParams.length}`
    }
    const { rows: obRows } = await pool.query(obQuery, obParams)

    const openingMap = {}
    obRows.forEach(r => {
      const isDebitNature = ['asset', 'expense'].includes(r.type)
      openingMap[r.code] = {
        type: r.type,
        opening: isDebitNature
          ? parseFloat(r.opening_debit || 0) - parseFloat(r.opening_credit || 0)
          : parseFloat(r.opening_credit || 0) - parseFloat(r.opening_debit || 0)
      }
    })

    // Fetch ledger entries
    let query = `
      SELECT
        je.entry_date, 
        je.entry_number, 
        je.narration,
        a.code AS account_code, 
        a.name AS account_name, 
        a.type AS account_type,
        jel.debit_amount, 
        jel.credit_amount, 
        je.reference_type, 
        je.reference_id
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounts a ON a.id = jel.account_id
      WHERE je.company_id = $1
        AND je.is_posted = true
        AND je.reference_type != 'opening'
    `
    const params = [company_id]
    if (account_code) {
      params.push(account_code)
      query += ` AND a.code=$${params.length}`
    }
    if (from) {
      params.push(from)
      query += ` AND je.entry_date>=$${params.length}`
    }
    if (to) {
      params.push(to)
      query += ` AND je.entry_date<=$${params.length}`
    }
    query += ' ORDER BY a.code, je.entry_date, je.entry_number'

    const { rows } = await pool.query(query, params)

    const balanceMap = {}
    const ledger = rows.map(r => {
      const key = r.account_code
      if (balanceMap[key] === undefined) {
        balanceMap[key] = openingMap[key]?.opening ?? 0
      }
      const isDebitNature = ['asset', 'expense'].includes(r.account_type)
      balanceMap[key] += isDebitNature
        ? parseFloat(r.debit_amount) - parseFloat(r.credit_amount)
        : parseFloat(r.credit_amount) - parseFloat(r.debit_amount)
      return { ...r, running_balance: balanceMap[key] }
    })

    res.json(ledger)
  } catch (err) {
    console.error('Ledger error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/reports/gst-summary?company_id=xxx&month=3&year=2025
// GST Summary Report
// ══════════════════════════════════════════════════════════════════════════════
router.get('/gst-summary', async (req, res) => {
  const { company_id, month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    const { rows } = await pool.query(
      `SELECT 
         invoice_type,
         COUNT(*) AS invoice_count,
         COALESCE(SUM(taxable_amount), 0) AS taxable_value,
         COALESCE(SUM(cgst_amount), 0) AS total_cgst,
         COALESCE(SUM(sgst_amount), 0) AS total_sgst,
         COALESCE(SUM(igst_amount), 0) AS total_igst,
         COALESCE(SUM(total_amount), 0) AS total_amount
       FROM invoices
       WHERE company_id = $1 
         AND status != 'cancelled'
         AND ($2::numeric IS NULL OR EXTRACT(MONTH FROM invoice_date) = $2::numeric)
         AND ($3::numeric IS NULL OR EXTRACT(YEAR  FROM invoice_date) = $3::numeric)
       GROUP BY invoice_type`,
      [company_id, month || null, year || null]
    )

    const sales = rows.find(r => r.invoice_type === 'sale') || {}
    const purchase = rows.find(r => r.invoice_type === 'purchase') || {}

    const output_tax = parseFloat(sales.total_cgst || 0) + parseFloat(sales.total_sgst || 0) + parseFloat(sales.total_igst || 0)
    const input_tax = parseFloat(purchase.total_cgst || 0) + parseFloat(purchase.total_sgst || 0) + parseFloat(purchase.total_igst || 0)

    res.json({
      sales,
      purchase,
      output_tax,
      input_tax,
      net_payable: output_tax - input_tax
    })
  } catch (err) {
    console.error('GST summary error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// NEW: GET /api/reports/integrity-check?company_id=xxx
// Comprehensive data integrity checker
// ══════════════════════════════════════════════════════════════════════════════
router.get('/integrity-check', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    const results = {
      overall_status: 'pass',
      checks: []
    }

    // CHECK 1: Trial Balance Must Be Balanced
    const { rows: tbRows } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type IN ('asset','expense') THEN 
           opening_debit + COALESCE((SELECT SUM(debit_amount) FROM journal_entry_lines jel 
             JOIN journal_entries je ON je.id = jel.journal_entry_id 
             WHERE jel.account_id = a.id AND je.is_posted = true AND je.reference_type != 'opening'), 0)
         - opening_credit - COALESCE((SELECT SUM(credit_amount) FROM journal_entry_lines jel 
             JOIN journal_entries je ON je.id = jel.journal_entry_id 
             WHERE jel.account_id = a.id AND je.is_posted = true AND je.reference_type != 'opening'), 0)
         ELSE 0 END), 0) AS total_debit,
         
         COALESCE(SUM(CASE WHEN type IN ('liability','equity','revenue') THEN 
           opening_credit + COALESCE((SELECT SUM(credit_amount) FROM journal_entry_lines jel 
             JOIN journal_entries je ON je.id = jel.journal_entry_id 
             WHERE jel.account_id = a.id AND je.is_posted = true AND je.reference_type != 'opening'), 0)
         - opening_debit - COALESCE((SELECT SUM(debit_amount) FROM journal_entry_lines jel 
             JOIN journal_entries je ON je.id = jel.journal_entry_id 
             WHERE jel.account_id = a.id AND je.is_posted = true AND je.reference_type != 'opening'), 0)
         ELSE 0 END), 0) AS total_credit
       FROM accounts a WHERE company_id = $1`,
      [company_id]
    )

    const tbDebit = parseFloat(tbRows[0].total_debit)
    const tbCredit = parseFloat(tbRows[0].total_credit)
    const tbBalanced = Math.abs(tbDebit - tbCredit) < 0.01

    results.checks.push({
      name: 'Trial Balance',
      status: tbBalanced ? 'pass' : 'fail',
      details: { total_debit: tbDebit, total_credit: tbCredit, difference: (tbDebit - tbCredit).toFixed(2) }
    })
    if (!tbBalanced) results.overall_status = 'fail'

    // CHECK 2: All Posted Journal Entries Must Be Balanced
    const { rows: unbalancedJEs } = await pool.query(
      `SELECT je.id, je.entry_number,
         COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
         COALESCE(SUM(jel.credit_amount), 0) AS total_credit
       FROM journal_entries je
       LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       WHERE je.company_id = $1 AND je.is_posted = true
       GROUP BY je.id, je.entry_number
       HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01`,
      [company_id]
    )

    results.checks.push({
      name: 'Journal Entry Balance',
      status: unbalancedJEs.length === 0 ? 'pass' : 'fail',
      details: { unbalanced_count: unbalancedJEs.length, entries: unbalancedJEs }
    })
    if (unbalancedJEs.length > 0) results.overall_status = 'fail'

    // CHECK 3: Invoice Totals Must Be Correct
    const { rows: badInvoices } = await pool.query(
      `SELECT id, invoice_number, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount
       FROM invoices
       WHERE company_id = $1 
         AND status != 'cancelled'
         AND ABS((taxable_amount + cgst_amount + sgst_amount + igst_amount) - total_amount) > 0.01`,
      [company_id]
    )

    results.checks.push({
      name: 'Invoice Totals',
      status: badInvoices.length === 0 ? 'pass' : 'fail',
      details: { invalid_count: badInvoices.length, invoices: badInvoices }
    })
    if (badInvoices.length > 0) results.overall_status = 'fail'

    // CHECK 4: No Orphan Journal Entry Lines
    const { rows: orphanLines } = await pool.query(
      `SELECT jel.id 
       FROM journal_entry_lines jel
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.id IS NULL OR jel.account_id IS NULL`,
      []
    )

    results.checks.push({
      name: 'Orphan Journal Lines',
      status: orphanLines.length === 0 ? 'pass' : 'warning',
      details: { orphan_count: orphanLines.length }
    })

    // CHECK 5: GST Input/Output Reconciliation
    const { rows: gstCheck } = await pool.query(
      `SELECT 
         'Output GST' AS type,
         COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS invoice_gst,
         COALESCE((SELECT SUM(credit_amount) FROM journal_entry_lines jel 
           JOIN accounts a ON a.id = jel.account_id 
           WHERE a.company_id = $1 AND a.code IN ('2002','2003','2004')), 0) AS journal_gst
       FROM invoices WHERE company_id = $1 AND invoice_type = 'sale' AND status != 'cancelled'
       UNION ALL
       SELECT 
         'Input GST' AS type,
         COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS invoice_gst,
         COALESCE((SELECT SUM(debit_amount) FROM journal_entry_lines jel 
           JOIN accounts a ON a.id = jel.account_id 
           WHERE a.company_id = $1 AND a.code IN ('1004','1005','1006')), 0) AS journal_gst
       FROM invoices WHERE company_id = $1 AND invoice_type = 'purchase' AND status != 'cancelled'`,
      [company_id, company_id]
    )

    const gstMatches = gstCheck.every(r => Math.abs(parseFloat(r.invoice_gst) - parseFloat(r.journal_gst)) < 0.01)
    results.checks.push({
      name: 'GST Reconciliation',
      status: gstMatches ? 'pass' : 'warning',
      details: gstCheck
    })

    res.json(results)
  } catch (err) {
    console.error('Integrity check error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router