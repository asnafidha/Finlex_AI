const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// ──────────────────────────────────────────────────────────────
// GET /api/reports/trial-balance?company_id=xxx&from=...&to=...
//
// FIX: Trial balance now returns explicit opening_debit, opening_credit,
//      period_debit, period_credit, closing_debit, closing_credit columns.
//      No more ambiguous net "balance" that requires sign-flipping.
//      SUM(closing_debit) must equal SUM(closing_credit) for a balanced TB.
// ──────────────────────────────────────────────────────────────
router.get('/trial-balance', async (req, res) => {
  const { company_id, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT
         a.code, a.name, a.type,
         -- Opening columns (from the new explicit debit/credit fields)
         COALESCE(a.opening_debit,  0) AS opening_debit,
         COALESCE(a.opening_credit, 0) AS opening_credit,
         -- Period movements
         COALESCE(SUM(jel.debit_amount),  0) AS period_debit,
         COALESCE(SUM(jel.credit_amount), 0) AS period_credit,
         -- Closing: opening + period, then collapse to one-sided per account nature
         -- For debit-nature accounts  (asset, expense):
         --   closing_debit  = opening_debit  + period_debit  - period_credit - opening_credit
         --   (opening_credit handles contra accounts that open on the credit side)
         -- For credit-nature accounts (liability, equity, revenue):
         --   closing_credit = opening_credit + period_credit - period_debit  - opening_debit
         CASE
           WHEN a.type IN ('asset','expense') THEN
             GREATEST(0,
               COALESCE(a.opening_debit,0)  + COALESCE(SUM(jel.debit_amount),0)
             - COALESCE(a.opening_credit,0) - COALESCE(SUM(jel.credit_amount),0)
             )
           ELSE 0
         END AS closing_debit,
         CASE
           WHEN a.type IN ('liability','equity','revenue') THEN
             GREATEST(0,
               COALESCE(a.opening_credit,0)  + COALESCE(SUM(jel.credit_amount),0)
             - COALESCE(a.opening_debit,0)   - COALESCE(SUM(jel.debit_amount),0)
             )
           ELSE 0
         END AS closing_credit
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.is_posted = true
         AND je.reference_type != 'opening'   -- opening entry is captured via opening_debit/credit columns, not period movements
         AND ($2::date IS NULL OR je.entry_date >= $2)
         AND ($3::date IS NULL OR je.entry_date <= $3)
       WHERE a.company_id = $1
       GROUP BY a.id, a.code, a.name, a.type, a.opening_debit, a.opening_credit
       HAVING
         COALESCE(a.opening_debit, 0)  != 0 OR
         COALESCE(a.opening_credit, 0) != 0 OR
         COALESCE(SUM(jel.debit_amount),  0) != 0 OR
         COALESCE(SUM(jel.credit_amount), 0) != 0
       ORDER BY a.code`,
      [company_id, from || null, to || null]
    )

    const total_opening_debit  = rows.reduce((s, r) => s + parseFloat(r.opening_debit),  0)
    const total_opening_credit = rows.reduce((s, r) => s + parseFloat(r.opening_credit), 0)
    const total_period_debit   = rows.reduce((s, r) => s + parseFloat(r.period_debit),   0)
    const total_period_credit  = rows.reduce((s, r) => s + parseFloat(r.period_credit),  0)
    const total_closing_debit  = rows.reduce((s, r) => s + parseFloat(r.closing_debit),  0)
    const total_closing_credit = rows.reduce((s, r) => s + parseFloat(r.closing_credit), 0)

    res.json({
      accounts: rows,
      total_opening_debit,
      total_opening_credit,
      total_period_debit,
      total_period_credit,
      total_closing_debit,
      total_closing_credit,
      is_balanced: Math.abs(total_closing_debit - total_closing_credit) < 0.01
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ──────────────────────────────────────────────────────────────
// GET /api/reports/pl?company_id=xxx&from=...&to=...
// ──────────────────────────────────────────────────────────────
router.get('/pl', async (req, res) => {
  const { company_id, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT a.code, a.name, a.type,
              COALESCE(SUM(jel.debit_amount),  0) AS total_debit,
              COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
              -- Revenue: credit - debit (positive = income earned)
              -- Expense: debit - credit (positive = expense incurred)
              CASE
                WHEN a.type = 'revenue' THEN COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
                ELSE                         COALESCE(SUM(jel.debit_amount),0)  - COALESCE(SUM(jel.credit_amount),0)
              END AS amount
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.is_posted = true
         AND je.reference_type != 'opening'
         AND ($2::date IS NULL OR je.entry_date >= $2)
         AND ($3::date IS NULL OR je.entry_date <= $3)
       WHERE a.company_id = $1 AND a.type IN ('revenue','expense')
       GROUP BY a.id, a.code, a.name, a.type
       ORDER BY a.type DESC, a.code`,
      [company_id, from || null, to || null]
    )
    const revenue  = rows.filter(r => r.type === 'revenue')
    const expenses = rows.filter(r => r.type === 'expense')
    const total_revenue  = revenue.reduce((s, r)  => s + parseFloat(r.amount), 0)
    const total_expenses = expenses.reduce((s, r) => s + parseFloat(r.amount), 0)
    const net_profit = total_revenue - total_expenses
    res.json({ revenue, expenses, total_revenue, total_expenses, net_profit, is_profit: net_profit >= 0 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ──────────────────────────────────────────────────────────────
// GET /api/reports/balance-sheet?company_id=xxx&as_of=2025-03-31
//
// FIX: Closing entries guard — once year-end closing entries have been
//      posted (companies.closing_entries_posted = true), net_profit has
//      already been transferred to Retained Earnings, so we must NOT
//      add it again. Without this guard you get double-counted equity.
// ──────────────────────────────────────────────────────────────
router.get('/balance-sheet', async (req, res) => {
  const { company_id, as_of } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    // Check if year-end closing entries have already been posted
    const { rows: coRows } = await pool.query(
      'SELECT closing_entries_posted FROM companies WHERE id=$1', [company_id]
    )
    const closing_entries_posted = coRows[0]?.closing_entries_posted || false

    const { rows } = await pool.query(
      `SELECT
         a.code, a.name, a.type,
         COALESCE(a.opening_debit,  0) AS opening_debit,
         COALESCE(a.opening_credit, 0) AS opening_credit,
         COALESCE(SUM(jel.debit_amount),  0) AS total_debit,
         COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
         -- Closing balance for B/S accounts using explicit opening columns
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
       WHERE a.company_id = $1 AND a.type IN ('asset','liability','equity')
       GROUP BY a.id, a.code, a.name, a.type, a.opening_debit, a.opening_credit
       ORDER BY a.type, a.code`,
      [company_id, as_of || null]
    )

    // FIX: Only compute net_profit separately if closing entries have NOT been posted.
    // Once closing entries are posted, P&L has been transferred to Retained Earnings
    // (an equity account), so adding net_profit again would double-count it.
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

    const assets      = rows.filter(r => r.type === 'asset')
    const liabilities = rows.filter(r => r.type === 'liability')
    const equity      = rows.filter(r => r.type === 'equity')

    const total_assets      = assets.reduce((s, r)      => s + parseFloat(r.closing_balance), 0)
    const total_liabilities = liabilities.reduce((s, r) => s + parseFloat(r.closing_balance), 0)
    const total_equity_accounts = equity.reduce((s, r)  => s + parseFloat(r.closing_balance), 0)
    const total_equity = total_equity_accounts + net_profit

    res.json({
      assets, liabilities, equity,
      net_profit,
      closing_entries_posted,
      total_assets,
      total_liabilities,
      total_equity,
      is_balanced: Math.abs(total_assets - (total_liabilities + total_equity)) < 0.01
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ──────────────────────────────────────────────────────────────
// GET /api/reports/ledger?company_id=xxx&account_code=1001
//
// FIX: Running balance correctly seeded from opening_debit/opening_credit.
//      Opening entry journal lines (reference_type='opening') are excluded
//      from the period movements since they are represented by the opening
//      columns already. This prevents double-counting the opening balance.
// ──────────────────────────────────────────────────────────────
router.get('/ledger', async (req, res) => {
  const { company_id, account_code, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    // Fetch opening debit/credit for accounts in scope
    let obQuery = `SELECT a.code, a.type, a.opening_debit, a.opening_credit
                   FROM accounts a WHERE a.company_id=$1`
    const obParams = [company_id]
    if (account_code) { obParams.push(account_code); obQuery += ` AND a.code=$${obParams.length}` }
    const { rows: obRows } = await pool.query(obQuery, obParams)

    const openingMap = {}
    obRows.forEach(r => {
      const isDebitNature = ['asset','expense'].includes(r.type)
      // Seed running balance as the net opening amount in account's natural direction
      openingMap[r.code] = {
        type: r.type,
        opening: isDebitNature
          ? parseFloat(r.opening_debit || 0) - parseFloat(r.opening_credit || 0)
          : parseFloat(r.opening_credit || 0) - parseFloat(r.opening_debit || 0)
      }
    })

    let query = `
      SELECT
        je.entry_date, je.entry_number, je.narration,
        a.code AS account_code, a.name AS account_name, a.type AS account_type,
        jel.debit_amount, jel.credit_amount, je.reference_type, je.reference_id
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounts a ON a.id = jel.account_id
      WHERE je.company_id = $1
        AND je.is_posted = true
        AND je.reference_type != 'opening'  -- opening balance already seeded above
`
    const params = [company_id]
    if (account_code) { params.push(account_code); query += ` AND a.code=$${params.length}` }
    if (from)         { params.push(from);          query += ` AND je.entry_date>=$${params.length}` }
    if (to)           { params.push(to);            query += ` AND je.entry_date<=$${params.length}` }
    query += ' ORDER BY a.code, je.entry_date, je.entry_number'

    const { rows } = await pool.query(query, params)

    const balanceMap = {}
    const ledger = rows.map(r => {
      const key = r.account_code
      if (balanceMap[key] === undefined) {
        balanceMap[key] = openingMap[key]?.opening ?? 0
      }
      const isDebitNature = ['asset','expense'].includes(r.account_type)
      balanceMap[key] += isDebitNature
        ? parseFloat(r.debit_amount) - parseFloat(r.credit_amount)
        : parseFloat(r.credit_amount) - parseFloat(r.debit_amount)
      return { ...r, running_balance: balanceMap[key] }
    })
    res.json(ledger)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ──────────────────────────────────────────────────────────────
// GET /api/reports/gst-summary?company_id=xxx&month=3&year=2025
// ──────────────────────────────────────────────────────────────
router.get('/gst-summary', async (req, res) => {
  const { company_id, month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT invoice_type,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(taxable_amount), 0) AS taxable_value,
              COALESCE(SUM(cgst_amount), 0) AS total_cgst,
              COALESCE(SUM(sgst_amount), 0) AS total_sgst,
              COALESCE(SUM(igst_amount), 0) AS total_igst,
              COALESCE(SUM(total_amount), 0) AS total_amount
       FROM invoices
       WHERE company_id = $1 AND status != 'cancelled'
         AND ($2::int IS NULL OR EXTRACT(MONTH FROM invoice_date) = $2)
         AND ($3::int IS NULL OR EXTRACT(YEAR  FROM invoice_date) = $3)
       GROUP BY invoice_type`,
      [company_id, month || null, year || null]
    )
    const sales    = rows.find(r => r.invoice_type === 'sale')     || {}
    const purchase = rows.find(r => r.invoice_type === 'purchase') || {}
    const output_tax = parseFloat(sales.total_cgst||0) + parseFloat(sales.total_sgst||0) + parseFloat(sales.total_igst||0)
    const input_tax  = parseFloat(purchase.total_cgst||0) + parseFloat(purchase.total_sgst||0) + parseFloat(purchase.total_igst||0)
    res.json({ sales, purchase, output_tax, input_tax, net_payable: output_tax - input_tax })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router