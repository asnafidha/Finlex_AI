const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// FY 2024-25 (AY 2025-26) — Finance Act 2024
const TAX_SLABS_NEW = [
  { min: 0,        max: 300000,   rate: 0  },
  { min: 300000,   max: 700000,   rate: 5  },
  { min: 700000,   max: 1000000,  rate: 10 },
  { min: 1000000,  max: 1200000,  rate: 15 },
  { min: 1200000,  max: 1500000,  rate: 20 },
  { min: 1500000,  max: Infinity, rate: 30 },
]
const TAX_SLABS_OLD = [
  { min: 0,        max: 250000,   rate: 0  },
  { min: 250000,   max: 500000,   rate: 5  },
  { min: 500000,   max: 1000000,  rate: 20 },
  { min: 1000000,  max: Infinity, rate: 30 },
]

function calculateTax(income, slabs) {
  let tax = 0
  const breakdown = []
  for (const slab of slabs) {
    if (income <= slab.min) break
    const taxable  = Math.min(income, slab.max) - slab.min
    const slab_tax = (taxable * slab.rate) / 100
    tax += slab_tax
    if (slab_tax > 0) breakdown.push({
      slab: `₹${(slab.min/100000).toFixed(slab.min % 100000 === 0 ? 0 : 1)}L – ${slab.max === Infinity ? 'Above' : '₹'+(slab.max/100000).toFixed(slab.max % 100000 === 0 ? 0 : 1)+'L'}`,
      rate: slab.rate, taxable_amount: Math.round(taxable), tax: Math.round(slab_tax)
    })
  }
  return { tax, breakdown }
}

function computeSurcharge(income, tax_after_rebate, regime) {
  // Surcharge applies to BOTH regimes for income > 50L
  // New regime: capped at 25% (Budget 2023)
  // Old regime: 10% > 50L, 15% > 1Cr, 25% > 2Cr, 37% > 5Cr (37% removed from new regime)
  let rate = 0
  if (regime === 'new') {
    if (income > 50000000)      rate = 0.25
    else if (income > 20000000) rate = 0.25
    else if (income > 10000000) rate = 0.15
    else if (income > 5000000)  rate = 0.10
  } else {
    if (income > 50000000)      rate = 0.37
    else if (income > 20000000) rate = 0.25
    else if (income > 10000000) rate = 0.15
    else if (income > 5000000)  rate = 0.10
  }
  // Marginal relief: surcharge cannot exceed income above threshold
  const surcharge = tax_after_rebate * rate
  return Math.round(surcharge)
}

router.get('/computation', async (req, res) => {
  const { company_id, fy = '2024-25', regime = 'new', taxpayer_type = 'individual' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })

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

    // Standard deduction REMOVED — only for salaried (ITR-1/2), NOT for business income (ITR-3/4)
    // Business income is taxed on net profit directly
    const std_deduction = 0

    // Brought forward business loss from prior years (Sec 72 — max 8 years)
    // TODO: store in DB when implemented; using 0 as default
    const brought_forward_loss = 0
    const taxable_income = Math.max(0, net_profit - brought_forward_loss)

    const slabs = regime === 'new' ? TAX_SLABS_NEW : TAX_SLABS_OLD
    const { tax: income_tax, breakdown } = calculateTax(taxable_income, slabs)

    // Sec 87A rebate (FY 2024-25)
    // New regime: ≤ ₹7,00,000 → rebate = min(tax, ₹25,000)
    // Old regime: ≤ ₹5,00,000 → rebate = min(tax, ₹12,500)
    const rebate_limit = regime === 'new' ? 700000 : 500000
    const rebate_cap   = regime === 'new' ? 25000  : 12500
    const rebate_87a   = taxable_income <= rebate_limit ? Math.min(income_tax, rebate_cap) : 0
    const tax_after_rebate = Math.max(0, income_tax - rebate_87a)

    // Surcharge (both regimes, correct caps)
    const surcharge = computeSurcharge(taxable_income, tax_after_rebate, regime)

    // 4% Health & Education Cess on (tax after rebate + surcharge)
    const base_for_cess  = tax_after_rebate + surcharge
    const cess           = Math.round(base_for_cess * 0.04)
    const total_tax      = base_for_cess + cess

    // Prepaid taxes — from correct accounts
    const getAccBalance = async (code) => {
      const { rows } = await pool.query(
        `SELECT COALESCE(a.opening_balance,0)+COALESCE(SUM(jel.debit_amount),0)-COALESCE(SUM(jel.credit_amount),0) AS bal
         FROM accounts a
         LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
         LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
         WHERE a.company_id=$1 AND a.code=$2 GROUP BY a.id,a.opening_balance`, [company_id, code]
      )
      return Math.max(0, parseFloat(rows[0]?.bal || 0))
    }

    const tds_deducted         = await getAccBalance('1007') // TDS Receivable
    const advance_tax_paid     = await getAccBalance('1011') // Advance Tax Paid
    const self_assessment_paid = await getAccBalance('1012') // Self Assessment Tax Paid

    const total_prepaid    = tds_deducted + advance_tax_paid + self_assessment_paid
    const net_tax_payable  = Math.max(0, total_tax - total_prepaid)
    const refund_due       = total_tax < total_prepaid ? total_prepaid - total_tax : 0

    // Advance tax instalments — only if total_tax >= ₹10,000
    // (below ₹10,000 no advance tax obligation — Sec 208)
    const advance_tax_applicable = total_tax >= 10000
    const instalments = advance_tax_applicable ? [
      { quarter: 'Q1', due_date: 'Jun 15', cumulative_pct: 15, amount: Math.round(total_tax * 0.15), note: '15% of estimated annual tax' },
      { quarter: 'Q2', due_date: 'Sep 15', cumulative_pct: 45, amount: Math.round(total_tax * 0.30), note: '30% of estimated annual tax' },
      { quarter: 'Q3', due_date: 'Dec 15', cumulative_pct: 75, amount: Math.round(total_tax * 0.30), note: '30% of estimated annual tax' },
      { quarter: 'Q4', due_date: 'Mar 15', cumulative_pct: 100, amount: Math.round(total_tax * 0.25), note: '25% of estimated annual tax' },
    ] : []

    // Compare regimes
    // Comparison uses net_profit directly (no std deduction for business)
    const { tax: new_raw } = calculateTax(Math.max(0, net_profit), TAX_SLABS_NEW)
    const new_rebate = Math.max(0, net_profit) <= 700000 ? Math.min(new_raw, 25000) : 0
    const new_total  = Math.round(((new_raw - new_rebate) + computeSurcharge(Math.max(0, net_profit), Math.max(0, new_raw - new_rebate), 'new')) * 1.04)

    const { tax: old_raw } = calculateTax(Math.max(0, net_profit), TAX_SLABS_OLD)
    const old_rebate = Math.max(0, net_profit) <= 500000 ? Math.min(old_raw, 12500) : 0
    const old_total  = Math.round(((old_raw - old_rebate) + computeSurcharge(Math.max(0, net_profit), Math.max(0, old_raw - old_rebate), 'old')) * 1.04)

    const itr_json = {
      ITR: {
        ITR4: {
          PartA_GEN1: {
            PersonalInfo: { AssesseeName: coRows[0].name, PAN: coRows[0].pan || 'PENDING', AY: `${fy.split('-')[0]}${fy.split('-')[1]}` },
          },
          ScheduleBP: {
            GrossReceipt: Math.round(gross_revenue), GrossProfit: Math.round(net_profit),
            Expenses: Math.round(total_expenses), NetProfit: Math.round(net_profit),
          },
          TaxComputation: {
            TotalIncome: Math.round(taxable_income), IncomeTax: Math.round(income_tax),
            Rebate87A: Math.round(rebate_87a), TaxAfterRebate: Math.round(tax_after_rebate),
            Surcharge: surcharge, HealthEducationCess: cess, TotalTaxAndCess: total_tax,
          },
          ScheduleTDS: { TDSonSalary: 0, TDSonOtherIncome: Math.round(tds_deducted) },
          ScheduleIT:  { AdvanceTax: Math.round(advance_tax_paid) },
          TaxPaid: {
            TaxDeductedAtSource: Math.round(tds_deducted),
            AdvanceTaxPaid:      Math.round(advance_tax_paid),
            SelfAssessmentTax:   Math.round(self_assessment_paid),
            TotalTaxPaid:        Math.round(total_prepaid),
          },
          Refund:     { RefundDue: Math.round(refund_due) },
          TaxPayable: Math.round(net_tax_payable),
        }
      }
    }

    res.json({
      company: coRows[0].name, financial_year: fy, regime, taxpayer_type,
      income_computation: {
        gross_revenue: Math.round(gross_revenue), total_expenses: Math.round(total_expenses),
        net_profit: Math.round(net_profit),
        standard_deduction: 0,  // not applicable for business income
        brought_forward_loss: brought_forward_loss,
        taxable_income: Math.round(taxable_income),
      },
      tax_computation: {
        breakdown, income_tax: Math.round(income_tax),
        rebate_87a: Math.round(rebate_87a), tax_after_rebate: Math.round(tax_after_rebate),
        surcharge, cess_4_percent: cess, total_tax,
      },
      tax_payment: {
        tds_deducted: Math.round(tds_deducted),
        advance_tax_paid: Math.round(advance_tax_paid),
        self_assessment_tax: Math.round(self_assessment_paid),
        total_prepaid: Math.round(total_prepaid),
        net_tax_payable: Math.round(net_tax_payable),
        refund_due: Math.round(refund_due),
        total_tax_payable: Math.round(net_tax_payable),
      },
      advance_tax: {
        applicable: advance_tax_applicable,
        reason: !advance_tax_applicable ? 'Total tax liability < ₹10,000 — advance tax not required (Sec 208)' : null,
        instalments,
      },
      itr_json,
      comparison: {
        new_regime: new_total, old_regime: old_total,
        recommended: new_total <= old_total ? 'new' : 'old',
        savings: Math.abs(new_total - old_total),
      },
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/export-json', (req, res) => {
  const { company_id, fy = '2024-25', regime = 'new' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  res.redirect(307, `/api/itr/computation?company_id=${company_id}&fy=${fy}&regime=${regime}`)
})

module.exports = router