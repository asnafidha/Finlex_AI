const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// Tax slabs FY 2024-25
const TAX_SLABS_NEW = [
  { min:0, max:300000, rate:0 }, { min:300000, max:700000, rate:5 },
  { min:700000, max:1000000, rate:10 }, { min:1000000, max:1200000, rate:15 },
  { min:1200000, max:1500000, rate:20 }, { min:1500000, max:Infinity, rate:30 },
]
const TAX_SLABS_OLD = [
  { min:0, max:250000, rate:0 }, { min:250000, max:500000, rate:5 },
  { min:500000, max:1000000, rate:20 }, { min:1000000, max:Infinity, rate:30 },
]

function calcTax(income, slabs) {
  let tax = 0
  for (const s of slabs) {
    if (income <= s.min) break
    tax += (Math.min(income, s.max) - s.min) * s.rate / 100
  }
  return tax
}

// GET /api/advance-tax/plan?company_id=xxx&fy=2024-25&regime=new
router.get('/plan', async (req, res) => {
  const { company_id, fy = '2024-25', regime = 'new' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    const { rows: revRows } = await pool.query(
      `SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) as total
       FROM accounts a JOIN journal_entry_lines jel ON jel.account_id=a.id
       JOIN journal_entries je ON je.id=jel.journal_entry_id
       WHERE a.company_id=$1 AND a.type='revenue' AND je.is_posted=true`, [company_id]
    )
    const { rows: expRows } = await pool.query(
      `SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) as total
       FROM accounts a JOIN journal_entry_lines jel ON jel.account_id=a.id
       JOIN journal_entries je ON je.id=jel.journal_entry_id
       WHERE a.company_id=$1 AND a.type='expense' AND je.is_posted=true`, [company_id]
    )

    const gross_revenue  = parseFloat(revRows[0].total || 0)
    const total_expenses = parseFloat(expRows[0].total || 0)
    const net_profit     = gross_revenue - total_expenses
    const std_deduction  = regime === 'old' ? 50000 : 75000
    const taxable_income = Math.max(0, net_profit - std_deduction)

    const slabs         = regime === 'new' ? TAX_SLABS_NEW : TAX_SLABS_OLD
    const income_tax    = calcTax(taxable_income, slabs)
    const rebate_limit  = regime === 'new' ? 700000 : 500000
    const rebate_cap    = regime === 'new' ? 25000  : 12500
    const rebate        = taxable_income <= rebate_limit ? Math.min(income_tax, rebate_cap) : 0
    const tax_after_reb = Math.max(0, income_tax - rebate)
    const total_tax     = Math.round(tax_after_reb * 1.04)   // 4% cess

    // Sec 208: advance tax not required if total tax < ₹10,000
    if (total_tax < 10000) {
      return res.json({
        advance_tax_required: false,
        message: `Total estimated tax ₹${total_tax.toLocaleString('en-IN')} is below ₹10,000 threshold. Advance tax not required under Sec 208.`,
        tax_summary: { gross_revenue, net_profit, taxable_income, total_tax },
      })
    }

    // Read actual advance tax paid (account 1011)
    const { rows: paidRows } = await pool.query(
      `SELECT COALESCE(a.opening_balance,0)+COALESCE(SUM(jel.debit_amount),0)-COALESCE(SUM(jel.credit_amount),0) AS balance
       FROM accounts a LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.code='1011' GROUP BY a.id,a.opening_balance`,
      [company_id]
    )
    const total_advance_paid = Math.max(0, parseFloat(paidRows[0]?.balance || 0))

    // TDS receivable (reduces liability)
    const { rows: tdsRows } = await pool.query(
      `SELECT COALESCE(a.opening_balance,0)+COALESCE(SUM(jel.debit_amount),0)-COALESCE(SUM(jel.credit_amount),0) AS balance
       FROM accounts a LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
       LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.code='1007' GROUP BY a.id,a.opening_balance`,
      [company_id]
    )
    const tds_receivable = Math.max(0, parseFloat(tdsRows[0]?.balance || 0))

    // Net tax for advance tax = total_tax - TDS
    const net_tax_for_advance = Math.max(0, total_tax - tds_receivable)
    const remaining_to_pay    = Math.max(0, net_tax_for_advance - total_advance_paid)

    // Quarterly instalments per Sec 208
    // 15% by Jun 15, 45% by Sep 15, 75% by Dec 15, 100% by Mar 15
    const today = new Date()
    const fyStartYear = fy.split('-')[0]
    const fyEndYear   = parseInt(fyStartYear) + 1

    const instalment_schedule = [
      { instalment: 1, label: '1st instalment (15%)', due_date: `${fyStartYear}-06-15`, cumulative_pct: 15 },
      { instalment: 2, label: '2nd instalment (45%)', due_date: `${fyStartYear}-09-15`, cumulative_pct: 45 },
      { instalment: 3, label: '3rd instalment (75%)', due_date: `${fyStartYear}-12-15`, cumulative_pct: 75 },
      { instalment: 4, label: '4th instalment (100%)',due_date: `${fyEndYear}-03-15`,   cumulative_pct: 100 },
    ]

    // For each instalment compute due, paid, shortfall, interest risk
    const instalments = instalment_schedule.map((inst, idx) => {
      const due_date      = new Date(inst.due_date)
      const cumulative_due = Math.round(net_tax_for_advance * inst.cumulative_pct / 100)
      const this_instalment = idx === 0
        ? Math.round(net_tax_for_advance * 0.15)
        : Math.round(net_tax_for_advance * (inst.cumulative_pct - instalment_schedule[idx-1].cumulative_pct) / 100)

      const status = today > due_date
        ? (total_advance_paid >= cumulative_due ? 'paid' : 'overdue')
        : 'upcoming'

      const shortfall = status === 'overdue' ? Math.max(0, cumulative_due - total_advance_paid) : 0
      const interest_risk = shortfall > 0
        ? `Sec 234C interest: ₹${Math.round(shortfall * 0.01 * (idx < 3 ? 3 : 1)).toLocaleString('en-IN')}/quarter`
        : null

      return { ...inst, cumulative_due, this_instalment, status, shortfall, interest_risk }
    })

    const advice = remaining_to_pay > 0
      ? `₹${remaining_to_pay.toLocaleString('en-IN')} advance tax still due. Pay via Challan ITNS 280 at tin.nsdl.com or your bank.`
      : `All advance tax paid. No action needed.`

    res.json({
      advance_tax_required: true,
      financial_year: fy, regime,
      tax_summary: {
        gross_revenue: Math.round(gross_revenue), net_profit: Math.round(net_profit),
        taxable_income: Math.round(taxable_income), total_tax,
        tds_receivable: Math.round(tds_receivable), net_tax_for_advance: Math.round(net_tax_for_advance),
        total_advance_paid: Math.round(total_advance_paid), remaining_to_pay: Math.round(remaining_to_pay),
      },
      instalments,
      advice,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/advance-tax/record-payment
router.post('/record-payment', async (req, res) => {
  const { company_id, amount, payment_date, challan_no, instalment } = req.body
  if (!company_id || !amount || !payment_date)
    return res.status(400).json({ error: 'company_id, amount, payment_date required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }

    const advTaxAcc = await getAcc('1011') // Advance Tax Paid
    const bankAcc   = await getAcc('1002') // Bank

    if (!advTaxAcc) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Account 1011 (Advance Tax Paid) not found. Run migration_v2.sql first.' })
    }

    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id])
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`

    const narration = `Advance Tax Payment — Q${instalment || '?'} — ${challan_no ? 'Challan: ' + challan_no : 'Challan pending'}`
    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,narration,is_posted,created_by)
       VALUES($1,$2,$3,'advance_tax',$4,true,$5) RETURNING id`,
      [company_id, entryNum, payment_date, narration, req.user.id]
    )
    const jeId = je.rows[0].id

    // Dr Advance Tax Paid (asset), Cr Bank
    await client.query(
      `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,0,$4)`,
      [jeId, advTaxAcc, parseFloat(amount), narration]
    )
    if (bankAcc) await client.query(
      `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,0,$3,$4)`,
      [jeId, bankAcc, parseFloat(amount), 'Advance tax paid via bank']
    )

    // Mark Q compliance deadline as completed if applicable
    if (instalment) {
      await client.query(
        `UPDATE compliance_deadlines SET status='completed' WHERE company_id=$1 AND type='ADVANCE_TAX' AND name LIKE $2`,
        [company_id, `%Q${instalment}%`]
      )
    }

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,'ADVANCE_TAX_PAID','journal_entries',$3,$4)`,
      [company_id, req.user.id, jeId, JSON.stringify({ amount, payment_date, challan_no, instalment })]
    )

    await client.query('COMMIT')
    res.json({
      message:       'Advance tax payment recorded',
      journal_entry: entryNum,
      amount:        parseFloat(amount),
      payment_date,
      challan_no:    challan_no || null,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

module.exports = router