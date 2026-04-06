const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/reports/trial-balance?company_id=xxx&from=2024-04-01&to=2025-03-31
router.get('/trial-balance', async (req, res) => {
  const { company_id, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT a.code, a.name, a.type,
              COALESCE(SUM(jel.debit_amount),0)  AS total_debit,
              COALESCE(SUM(jel.credit_amount),0) AS total_credit,
              COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0) AS balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id
         AND je.is_posted=true
         AND ($2::date IS NULL OR je.entry_date >= $2)
         AND ($3::date IS NULL OR je.entry_date <= $3)
       WHERE a.company_id=$1
       GROUP BY a.id,a.code,a.name,a.type
       HAVING COALESCE(SUM(jel.debit_amount),0)!=0 OR COALESCE(SUM(jel.credit_amount),0)!=0
       ORDER BY a.code`,
      [company_id, from||null, to||null]
    )
    const total_debit  = rows.reduce((s,r) => s + parseFloat(r.total_debit),  0)
    const total_credit = rows.reduce((s,r) => s + parseFloat(r.total_credit), 0)
    res.json({ accounts: rows, total_debit, total_credit, is_balanced: Math.abs(total_debit - total_credit) < 0.01 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/reports/pl?company_id=xxx
router.get('/pl', async (req, res) => {
  const { company_id, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT a.code, a.name, a.type,
              COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0) AS amount
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id
         AND je.is_posted=true
         AND ($2::date IS NULL OR je.entry_date >= $2)
         AND ($3::date IS NULL OR je.entry_date <= $3)
       WHERE a.company_id=$1 AND a.type IN ('revenue','expense')
       GROUP BY a.id,a.code,a.name,a.type ORDER BY a.type DESC,a.code`,
      [company_id, from||null, to||null]
    )
    const revenue  = rows.filter(r => r.type === 'revenue')
    const expenses = rows.filter(r => r.type === 'expense')
    const total_revenue  = revenue.reduce((s,r) => s + parseFloat(r.amount), 0)
    const total_expenses = expenses.reduce((s,r) => s + Math.abs(parseFloat(r.amount)), 0)
    const net_profit = total_revenue - total_expenses
    res.json({ revenue, expenses, total_revenue, total_expenses, net_profit, is_profit: net_profit >= 0 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/reports/balance-sheet?company_id=xxx&as_of=2025-03-31
router.get('/balance-sheet', async (req, res) => {
  const { company_id, as_of } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT a.code, a.name, a.type,
              COALESCE(a.opening_balance,0) as opening_balance,
              COALESCE(SUM(jel.debit_amount),0)  AS total_debit,
              COALESCE(SUM(jel.credit_amount),0) AS total_credit,
              CASE
                WHEN a.type='asset'
                THEN COALESCE(a.opening_balance,0) + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0)
                ELSE COALESCE(a.opening_balance,0) + COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
              END AS closing_balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id
         AND je.is_posted=true AND ($2::date IS NULL OR je.entry_date<=$2)
       WHERE a.company_id=$1 AND a.type IN ('asset','liability','equity')
       GROUP BY a.id,a.code,a.name,a.type,a.opening_balance ORDER BY a.type,a.code`,
      [company_id, as_of||null]
    )
    const { rows: plRows } = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN a.type='revenue' THEN jel.credit_amount-jel.debit_amount ELSE 0 END),0)
            - COALESCE(SUM(CASE WHEN a.type='expense' THEN jel.debit_amount-jel.credit_amount ELSE 0 END),0) AS net_profit
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id=jel.journal_entry_id
       JOIN accounts a ON a.id=jel.account_id
       WHERE je.company_id=$1 AND je.is_posted=true AND a.type IN ('revenue','expense')
         AND ($2::date IS NULL OR je.entry_date<=$2)`,
      [company_id, as_of||null]
    )
    const net_profit        = parseFloat(plRows[0]?.net_profit || 0)
    const assets            = rows.filter(r => r.type === 'asset')
    const liabilities       = rows.filter(r => r.type === 'liability')
    const equity            = rows.filter(r => r.type === 'equity')
    const total_assets      = assets.reduce((s,r) => s + parseFloat(r.closing_balance), 0)
    const total_liabilities = liabilities.reduce((s,r) => s + parseFloat(r.closing_balance), 0)
    const total_equity      = equity.reduce((s,r) => s + parseFloat(r.closing_balance), 0) + net_profit
    res.json({ assets, liabilities, equity, net_profit, total_assets, total_liabilities, total_equity, is_balanced: Math.abs(total_assets-(total_liabilities+total_equity))<0.01 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/reports/ledger?company_id=xxx&account_code=1001
router.get('/ledger', async (req, res) => {
  const { company_id, account_code, from, to } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let query = `
      SELECT je.entry_date,je.entry_number,je.narration,
             a.code as account_code,a.name as account_name,a.type as account_type,
             jel.debit_amount,jel.credit_amount,je.reference_type,je.reference_id
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id=jel.journal_entry_id
      JOIN accounts a ON a.id=jel.account_id
      WHERE je.company_id=$1 AND je.is_posted=true`
    const params = [company_id]
    if (account_code) { params.push(account_code); query += ` AND a.code=$${params.length}` }
    if (from)         { params.push(from);          query += ` AND je.entry_date>=$${params.length}` }
    if (to)           { params.push(to);            query += ` AND je.entry_date<=$${params.length}` }
    query += ' ORDER BY a.code,je.entry_date,je.entry_number'
    const { rows } = await pool.query(query, params)
    const balanceMap = {}
    const ledger = rows.map(r => {
      const key = r.account_code
      if (!balanceMap[key]) balanceMap[key] = 0
      const isDebitNature = ['asset','expense'].includes(r.account_type)
      balanceMap[key] += isDebitNature
        ? parseFloat(r.debit_amount) - parseFloat(r.credit_amount)
        : parseFloat(r.credit_amount) - parseFloat(r.debit_amount)
      return { ...r, running_balance: balanceMap[key] }
    })
    res.json(ledger)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/reports/gst-summary?company_id=xxx&month=3&year=2025
router.get('/gst-summary', async (req, res) => {
  const { company_id, month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT invoice_type,
              COUNT(*) as invoice_count,
              COALESCE(SUM(taxable_amount),0) as taxable_value,
              COALESCE(SUM(cgst_amount),0) as total_cgst,
              COALESCE(SUM(sgst_amount),0) as total_sgst,
              COALESCE(SUM(igst_amount),0) as total_igst,
              COALESCE(SUM(total_amount),0) as total_amount
       FROM invoices
       WHERE company_id=$1 AND status!='cancelled'
         AND ($2::int IS NULL OR EXTRACT(MONTH FROM invoice_date)=$2)
         AND ($3::int IS NULL OR EXTRACT(YEAR FROM invoice_date)=$3)
       GROUP BY invoice_type`,
      [company_id, month||null, year||null]
    )
    const sales    = rows.find(r => r.invoice_type==='sale')     || {}
    const purchase = rows.find(r => r.invoice_type==='purchase') || {}
    const output_tax  = parseFloat(sales.total_cgst||0)+parseFloat(sales.total_sgst||0)+parseFloat(sales.total_igst||0)
    const input_tax   = parseFloat(purchase.total_cgst||0)+parseFloat(purchase.total_sgst||0)+parseFloat(purchase.total_igst||0)
    res.json({ sales, purchase, output_tax, input_tax, net_payable: output_tax - input_tax })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router