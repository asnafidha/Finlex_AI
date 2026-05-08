const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/ca/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const { rows: companies } = await pool.query(
      `SELECT c.*, cca.role as ca_role
       FROM companies c
       JOIN ca_company_access cca ON cca.company_id=c.id
       WHERE cca.ca_id=$1 ORDER BY c.name`,
      [req.user.id]
    )

    const today = new Date().toISOString().split('T')[0]
    const dashboard = await Promise.all(companies.map(async (company) => {
      const [complianceR, invR, plR, tdsR, nextDeadlineR] = await Promise.all([
        pool.query(
          `SELECT
            COUNT(*) FILTER (WHERE due_date < $2 AND status='pending')                      AS overdue,
            COUNT(*) FILTER (WHERE due_date BETWEEN $2 AND $2::date+7 AND status='pending') AS due_this_week,
            COUNT(*) FILTER (WHERE status='completed')                                       AS completed,
            COUNT(*) FILTER (WHERE status='pending')                                         AS pending
           FROM compliance_deadlines WHERE company_id=$1`,
          [company.id, today]
        ),
        pool.query(
          `SELECT
            COUNT(*) FILTER (WHERE invoice_type='sale')     AS total_sales,
            COUNT(*) FILTER (WHERE invoice_type='purchase') AS total_purchases,
            COALESCE(SUM(total_amount) FILTER (WHERE invoice_type='sale'),0)    AS total_revenue,
            COALESCE(SUM(total_amount) FILTER (WHERE invoice_type='purchase'),0) AS total_purchases_amt,
            COUNT(*) FILTER (WHERE payment_status='unpaid' AND invoice_type='sale')     AS unpaid_invoices,
            COALESCE(SUM(total_amount) FILTER (WHERE payment_status='unpaid' AND invoice_type='sale'),0) AS unpaid_amount
           FROM invoices WHERE company_id=$1 AND status!='cancelled'`,
          [company.id]
        ),
        pool.query(
          `SELECT
            COALESCE(SUM(jel.credit_amount - jel.debit_amount) FILTER (WHERE a.type='revenue'),0) AS net_revenue,
            COALESCE(SUM(jel.debit_amount - jel.credit_amount) FILTER (WHERE a.type='expense'),0) AS net_expense
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted=true
           JOIN accounts a ON a.id = jel.account_id
           WHERE je.company_id=$1`,
          [company.id]
        ),
        pool.query(
          `SELECT COALESCE(SUM(tds_amount),0) AS total_tds
           FROM tds_entries WHERE company_id=$1`,
          [company.id]
        ),
        pool.query(
          `SELECT name, type, due_date,
            CEIL(EXTRACT(EPOCH FROM (due_date - NOW()))/86400) AS days_left
           FROM compliance_deadlines
           WHERE company_id=$1 AND status='pending' AND due_date >= $2
           ORDER BY due_date ASC LIMIT 1`,
          [company.id, today]
        ),
      ])

      const c   = complianceR.rows[0]
      const inv = invR.rows[0]
      const pl  = plR.rows[0]
      const net_profit = parseFloat(pl.net_revenue||0) - parseFloat(pl.net_expense||0)

      const total = parseInt(c.pending||0) + parseInt(c.completed||0)
      const score = total > 0 ? Math.round((parseInt(c.completed||0)/total)*100) : 100

      return {
        ...company,
        compliance: c,
        invoices:   inv,
        net_profit,
        total_tds:  parseFloat(tdsR.rows[0]?.total_tds||0),
        next_deadline: nextDeadlineR.rows[0] || null,
        compliance_score: score,
        health: parseInt(c.overdue||0)      > 0 ? 'critical'
              : parseInt(c.due_this_week||0) > 0 ? 'warning' : 'good',
      }
    }))

    // CA-level aggregates
    const total_revenue  = dashboard.reduce((s,c) => s + parseFloat(c.invoices?.total_revenue||0), 0)
    const total_unpaid   = dashboard.reduce((s,c) => s + parseFloat(c.invoices?.unpaid_amount||0), 0)
    const total_tds      = dashboard.reduce((s,c) => s + parseFloat(c.total_tds||0), 0)
    const total_overdue  = dashboard.reduce((s,c) => s + parseInt(c.compliance?.overdue||0), 0)

    res.json({
      total_companies: dashboard.length,
      critical:  dashboard.filter(c => c.health==='critical').length,
      warning:   dashboard.filter(c => c.health==='warning').length,
      good:      dashboard.filter(c => c.health==='good').length,
      total_revenue, total_unpaid, total_tds, total_overdue,
      companies: dashboard,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/ca/companies/:id/summary
router.get('/companies/:id/summary', async (req, res) => {
  try {
    const company_id = req.params.id
    const { rows: company } = await pool.query(
      `SELECT c.* FROM companies c JOIN ca_company_access cca ON cca.company_id=c.id WHERE c.id=$1 AND cca.ca_id=$2`,
      [company_id, req.user.id]
    )
    if (!company.length) return res.status(404).json({ error: 'Company not found' })

    const [deadlinesR, recentInvR, tbR] = await Promise.all([
      pool.query(`SELECT * FROM compliance_deadlines WHERE company_id=$1 ORDER BY due_date ASC LIMIT 5`, [company_id]),
      pool.query(`SELECT id,invoice_type,invoice_number,invoice_date,party_name,total_amount,payment_status,status FROM invoices WHERE company_id=$1 ORDER BY created_at DESC LIMIT 5`, [company_id]),
      pool.query(`SELECT COALESCE(SUM(jel.debit_amount),0) AS total_debit, COALESCE(SUM(jel.credit_amount),0) AS total_credit FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.journal_entry_id WHERE je.company_id=$1 AND je.is_posted=true`, [company_id]),
    ])

    res.json({
      company:         company[0],
      deadlines:       deadlinesR.rows,
      recent_invoices: recentInvR.rows,
      trial_balance:   tbR.rows[0],
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router