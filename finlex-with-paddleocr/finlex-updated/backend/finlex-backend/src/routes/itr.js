const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

const TAX_SLABS_NEW = [
  { min:0,       max:300000,   rate:0  },
  { min:300000,  max:600000,   rate:5  },
  { min:600000,  max:900000,   rate:10 },
  { min:900000,  max:1200000,  rate:15 },
  { min:1200000, max:1500000,  rate:20 },
  { min:1500000, max:Infinity, rate:30 },
]
const TAX_SLABS_OLD = [
  { min:0,       max:250000,   rate:0  },
  { min:250000,  max:500000,   rate:5  },
  { min:500000,  max:1000000,  rate:20 },
  { min:1000000, max:Infinity, rate:30 },
]

function calculateTax(income, slabs) {
  let tax = 0
  const breakdown = []
  for (const slab of slabs) {
    if (income <= slab.min) break
    const taxable  = Math.min(income, slab.max) - slab.min
    const slab_tax = (taxable * slab.rate) / 100
    tax += slab_tax
    if (slab_tax > 0) breakdown.push({ slab:`₹${(slab.min/100000).toFixed(0)}L – ${slab.max===Infinity?'Above':'₹'+(slab.max/100000).toFixed(0)+'L'}`, rate:slab.rate, taxable_amount:taxable, tax:slab_tax })
  }
  const cess = tax * 0.04
  return { tax, cess, total_tax: tax+cess, breakdown }
}

// GET /api/itr/computation?company_id=xxx&fy=2024-25&regime=new
router.get('/computation', async (req, res) => {
  const { company_id, fy='2024-25', regime='new' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })

    const { rows: revRows } = await pool.query(
      `SELECT COALESCE(SUM(jel.credit_amount-jel.debit_amount),0) as total
       FROM accounts a JOIN journal_entry_lines jel ON jel.account_id=a.id JOIN journal_entries je ON je.id=jel.journal_entry_id
       WHERE a.company_id=$1 AND a.type='revenue' AND je.is_posted=true`, [company_id]
    )
    const { rows: expRows } = await pool.query(
      `SELECT COALESCE(SUM(jel.debit_amount-jel.credit_amount),0) as total
       FROM accounts a JOIN journal_entry_lines jel ON jel.account_id=a.id JOIN journal_entries je ON je.id=jel.journal_entry_id
       WHERE a.company_id=$1 AND a.type='expense' AND je.is_posted=true`, [company_id]
    )

    const gross_revenue  = parseFloat(revRows[0].total||0)
    const total_expenses = parseFloat(expRows[0].total||0)
    const net_profit     = gross_revenue - total_expenses
    const std_deduction  = regime==='old' ? 50000 : 75000
    const taxable_income = Math.max(0, net_profit - std_deduction)

    const slabs = regime==='new' ? TAX_SLABS_NEW : TAX_SLABS_OLD
    const { tax, cess, total_tax, breakdown } = calculateTax(taxable_income, slabs)

    // ── Tax payments: read from real account balances ──────────
    // TDS deducted ON US (receivable) — account 1007 if exists, else estimate from sales
    // Advance tax paid — account 1008 if exists
    // Self-assessment tax paid — account 1009 if exists
    // Fallback: tds_entries are TDS we deducted from vendors (TDS payable), NOT TDS deducted on us

    const getAccBalance = async (code) => {
      const { rows } = await pool.query(
        `SELECT COALESCE(a.opening_balance,0)+COALESCE(SUM(jel.debit_amount),0)-COALESCE(SUM(jel.credit_amount),0) AS bal
         FROM accounts a
         LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
         LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
         WHERE a.company_id=$1 AND a.code=$2
         GROUP BY a.id,a.opening_balance`, [company_id, code]
      )
      return Math.max(0, parseFloat(rows[0]?.bal || 0))
    }

    // TDS deducted on us = TDS Receivable account (1007), or sum TDS on our sales invoices
    let tds_deducted = await getAccBalance('1007')
    if (tds_deducted === 0) {
      // Fallback: estimate 2% of sales (commonly deducted u/s 194C/194J) — user can override
      // Better: check tds_entries where we are the deductee — not tracked separately yet
      tds_deducted = 0  // honest zero until user records it
    }

    const advance_tax_paid    = await getAccBalance('1008')  // Advance Tax Paid account
    const self_assessment_paid = await getAccBalance('1009') // Self Assessment Tax Paid

    const total_prepaid   = tds_deducted + advance_tax_paid + self_assessment_paid
    const net_tax_payable = Math.max(0, total_tax - total_prepaid)
    const refund_due      = total_tax < total_prepaid ? total_prepaid - total_tax : 0

    const new_tax = calculateTax(taxable_income, TAX_SLABS_NEW).total_tax
    const old_tax = calculateTax(taxable_income, TAX_SLABS_OLD).total_tax

    // ITR-3 / ITR-4 JSON export structure (Schedule TDS + TI + TTI)
    const itr_json = {
      ITR: {
        ITR4: {
          PartA_GEN1: {
            PersonalInfo: { AssesseeName: coRows[0].name, PAN: coRows[0].pan || 'PENDING', AY: fy.replace('-','') },
          },
          ScheduleBP: {
            GrossReceipt: gross_revenue,
            GrossProfit: net_profit,
            Expenses: total_expenses,
            NetProfit: net_profit,
          },
          TaxComputation: {
            TotalIncome: taxable_income,
            TaxPayable: total_tax,
            Rebate87A: taxable_income <= 700000 && regime === 'new' ? Math.min(total_tax, 25000) : 0,
            TaxAfterRebate: total_tax,
            SurchargeOnTax: 0,
            HealthEducationCess: cess,
            TotalTaxAndCess: total_tax,
          },
          ScheduleTDS: {
            TDSonSalary: 0,
            TDSonOtherIncome: tds_deducted,
          },
          ScheduleIT: { AdvanceTax: advance_tax_paid },
          TaxPaid: {
            TaxDeductedAtSource: tds_deducted,
            AdvanceTaxPaid: advance_tax_paid,
            SelfAssessmentTax: self_assessment_paid,
            TotalTaxPaid: total_prepaid,
          },
          Refund: { RefundDue: refund_due },
          TaxPayable: net_tax_payable,
        }
      }
    }

    res.json({
      company: coRows[0].name, financial_year: fy, regime,
      income_computation: { gross_revenue, total_expenses, net_profit, standard_deduction:std_deduction, taxable_income },
      tax_computation: { breakdown, income_tax:tax, cess_4_percent:cess, total_tax },
      tax_payment: {
        tds_deducted,
        advance_tax_paid,
        self_assessment_tax: self_assessment_paid,
        total_prepaid,
        net_tax_payable,
        refund_due,
        // legacy field — keep for any existing UI
        total_tax_payable: net_tax_payable,
      },
      itr_json,
      comparison: { new_regime:new_tax, old_regime:old_tax, recommended:new_tax<=old_tax?'new':'old', savings:Math.abs(new_tax-old_tax) },
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})


// POST /api/itr/export-json — download ITR JSON for filing
router.get('/export-json', async (req, res) => {
  const { company_id, fy='2024-25', regime='new' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    // Reuse computation endpoint logic — call it internally
    const compRes = await new Promise((resolve) => {
      const fakeReq = { query: { company_id, fy, regime }, user: req.user }
      const fakeRes = { json: (d) => resolve(d), status: () => ({ json: resolve }) }
      // We'll just re-query directly instead
      resolve(null)
    })
    // Redirect to computation and stream JSON
    res.redirect(307, `/api/itr/computation?company_id=${company_id}&fy=${fy}&regime=${regime}`)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router