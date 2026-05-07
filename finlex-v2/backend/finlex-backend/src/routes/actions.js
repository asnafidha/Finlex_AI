const router = require('express').Router()
const pool = require('../config/db')
const auth = require('../middleware/auth')

router.use(auth)

// GET /api/actions?company_id=xxx
// Returns prioritised action items with ₹ impact for the Action Center widget
router.get('/', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const actions = []

    // ── 1. Overdue compliance filings ─────────────────────────
    const { rows: overdueFilings } = await pool.query(
      `SELECT name, type, due_date,
              CEIL(EXTRACT(EPOCH FROM (NOW() - due_date))/86400) AS days_overdue
       FROM compliance_deadlines
       WHERE company_id=$1 AND status='pending' AND due_date < $2
       ORDER BY due_date ASC LIMIT 5`,
      [company_id, todayStr]
    )

    for (const f of overdueFilings) {
      const penaltyMap = { GST: 50, TDS: 200, ITR: 1000, ROC: 100, ADVANCE_TAX: 1 }
      const dailyPenalty = penaltyMap[f.type] || 50
      const riskAmt = Math.min(parseFloat(f.days_overdue) * dailyPenalty, 10000)
      actions.push({
        id: `overdue_${f.type}_${f.name}`,
        type: 'overdue_filing',
        priority: 'critical',
        title: `${f.name} overdue`,
        subtitle: `${Math.round(f.days_overdue)} days late`,
        amount: riskAmt,
        amount_label: `₹${riskAmt.toLocaleString('en-IN')} penalty risk`,
        cta: 'File Now',
        page: f.type === 'GST' ? 'compliance' : f.type === 'TDS' ? 'tds' : f.type === 'ITR' ? 'itr' : 'compliance',
        icon: '🚨',
      })
    }

    // ── 2. Upcoming filings in next 7 days ────────────────────
    const { rows: upcomingFilings } = await pool.query(
      `SELECT name, type, due_date,
              CEIL(EXTRACT(EPOCH FROM (due_date - NOW()))/86400) AS days_left
       FROM compliance_deadlines
       WHERE company_id=$1 AND status='pending'
         AND due_date BETWEEN $2 AND $2::date + 7
       ORDER BY due_date ASC LIMIT 3`,
      [company_id, todayStr]
    )

    for (const f of upcomingFilings) {
      actions.push({
        id: `upcoming_${f.type}_${f.name}`,
        type: 'upcoming_filing',
        priority: 'warning',
        title: `${f.name} due soon`,
        subtitle: `${Math.round(f.days_left)} days left`,
        amount: null,
        amount_label: `Due ${new Date(f.due_date).toLocaleDateString('en-IN')}`,
        cta: 'Prepare Now',
        page: f.type === 'GST' ? 'gstr' : f.type === 'TDS' ? 'tds' : f.type === 'ITR' ? 'itr' : 'compliance',
        icon: '⏰',
      })
    }

    // ── 3. Unpaid sales invoices ──────────────────────────────
    const { rows: unpaidInv } = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount),0) AS total
       FROM invoices
       WHERE company_id=$1 AND invoice_type='sale'
         AND payment_status IN ('unpaid','partial') AND status!='cancelled'`,
      [company_id]
    )
    const unpaidAmt = parseFloat(unpaidInv[0]?.total || 0)
    const unpaidCnt = parseInt(unpaidInv[0]?.cnt || 0)

    if (unpaidAmt > 0) {
      actions.push({
        id: 'unpaid_invoices',
        type: 'unpaid_invoices',
        priority: unpaidAmt > 100000 ? 'critical' : 'warning',
        title: `${unpaidCnt} unpaid invoice${unpaidCnt !== 1 ? 's' : ''}`,
        subtitle: 'Cash stuck with customers',
        amount: unpaidAmt,
        amount_label: `₹${unpaidAmt.toLocaleString('en-IN')} receivable`,
        cta: 'View Aging',
        page: 'payments',
        icon: '💰',
      })
    }

    // ── 4. ITC not reconciled ─────────────────────────────────
    const { rows: itcRows } = await pool.query(
      `SELECT
         COALESCE(a.opening_balance,0)
         + COALESCE(SUM(jel.debit_amount),0)
         - COALESCE(SUM(jel.credit_amount),0) AS balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.code IN ('1004','1005','1006')
       GROUP BY a.id, a.opening_balance`,
      [company_id]
    )
    const itcBalance = itcRows.reduce((s, r) => s + parseFloat(r.balance || 0), 0)

    if (itcBalance > 500) {
      actions.push({
        id: 'itc_unreconciled',
        type: 'itc_gap',
        priority: 'warning',
        title: 'ITC not reconciled with GSTR-2B',
        subtitle: 'Potential input tax credit loss',
        amount: itcBalance,
        amount_label: `₹${itcBalance.toLocaleString('en-IN')} ITC claimable`,
        cta: 'Reconcile Now',
        page: 'itc',
        icon: '✅',
      })
    }

    // ── 5. TDS pending deposit ────────────────────────────────
    const { rows: tdsRows } = await pool.query(
      `SELECT COALESCE(SUM(tds_amount),0) AS total
       FROM tds_entries
       WHERE company_id=$1 AND (challan_no IS NULL OR challan_no='')`,
      [company_id]
    )
    const tdsPending = parseFloat(tdsRows[0]?.total || 0)

    if (tdsPending > 0) {
      actions.push({
        id: 'tds_pending',
        type: 'tds_pending',
        priority: 'warning',
        title: 'TDS not yet deposited',
        subtitle: 'Missing challan numbers',
        amount: tdsPending,
        amount_label: `₹${tdsPending.toLocaleString('en-IN')} TDS payable`,
        cta: 'Pay TDS',
        page: 'tds',
        icon: '🏛️',
      })
    }

    // ── 6. Unpaid purchase bills ──────────────────────────────
    const { rows: payableRows } = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount),0) AS total
       FROM invoices
       WHERE company_id=$1 AND invoice_type='purchase'
         AND payment_status IN ('unpaid','partial') AND status!='cancelled'`,
      [company_id]
    )
    const payableAmt = parseFloat(payableRows[0]?.total || 0)
    const payableCnt = parseInt(payableRows[0]?.cnt || 0)

    if (payableAmt > 0) {
      actions.push({
        id: 'vendor_payables',
        type: 'vendor_payables',
        priority: 'info',
        title: `${payableCnt} vendor bill${payableCnt !== 1 ? 's' : ''} unpaid`,
        subtitle: 'Accounts payable outstanding',
        amount: payableAmt,
        amount_label: `₹${payableAmt.toLocaleString('en-IN')} payable`,
        cta: 'Record Payment',
        page: 'payments',
        icon: '📋',
      })
    }

    // Sort: critical first, then warning, then info
    const order = { critical: 0, warning: 1, info: 2 }
    actions.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3))

    res.json({
      actions,
      summary: {
        critical: actions.filter(a => a.priority === 'critical').length,
        warning: actions.filter(a => a.priority === 'warning').length,
        info: actions.filter(a => a.priority === 'info').length,
        total: actions.length,
        total_risk_amount: actions.reduce((s, a) => s + (a.amount || 0), 0),
      }
    })
  } catch (err) {
    console.error('Actions error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router