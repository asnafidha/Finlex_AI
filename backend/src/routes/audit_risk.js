const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/audit/risk-sweep?company_id=xxx
// Full AI Risk Sweep — Indian tax compliance rule engine
// Checks 15+ rules across TDS, GST, P&L, journals, compliance
// ══════════════════════════════════════════════════════════════════════════════
router.get('/risk-sweep', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  const findings = []
  const summary  = { critical: 0, high: 0, medium: 0, low: 0, total: 0, total_risk_amount: 0 }

  const addFinding = (f) => {
    findings.push(f)
    summary[f.severity] = (summary[f.severity] || 0) + 1
    summary.total++
    summary.total_risk_amount += f.risk_amount || 0
  }

  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // ── RULE 1: Missing TDS on purchase invoices ──────────────
    // Check purchases above threshold with no TDS entry
    const { rows: purchaseInvs } = await pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.party_name,
              i.taxable_amount, i.total_amount,
              COALESCE(string_agg(ii.description, ', '), '') as descriptions
       FROM invoices i
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE i.company_id=$1 AND i.invoice_type='purchase'
         AND i.status!='cancelled' AND i.taxable_amount >= 30000
       GROUP BY i.id
       ORDER BY i.taxable_amount DESC`,
      [company_id]
    )

    const TDS_RULES = [
      { kw: ['consultant','consulting','advisory','professional','ca ','chartered','legal','lawyer','advocate','doctor','architect'], section: '194J', rate: 10, label: 'Professional Services' },
      { kw: ['technical','software','it service','saas','amc','maintenance','support service','technology'], section: '194J', rate: 2, label: 'Technical Services' },
      { kw: ['contractor','construction','civil','works','labour','labor','fabricat'], section: '194C', rate: 1, label: 'Contractor' },
      { kw: ['rent','lease','property','building','office space','premises'], section: '194I', rate: 10, label: 'Rent' },
      { kw: ['commission','brokerage','agency'], section: '194H', rate: 5, label: 'Commission/Brokerage' },
      { kw: ['interest','loan','finance charge','borrowing'], section: '194A', rate: 10, label: 'Interest' },
      { kw: ['transport','logistics','freight','courier','cargo'], section: '194C', rate: 1, label: 'Transport' },
    ]

    for (const inv of purchaseInvs) {
      const combined = ((inv.party_name || '') + ' ' + (inv.descriptions || '')).toLowerCase()
      for (const rule of TDS_RULES) {
        if (rule.kw.some(k => combined.includes(k))) {
          // Check if TDS entry exists for this invoice date + vendor
          const { rows: tdsCheck } = await pool.query(
            `SELECT id FROM tds_entries
             WHERE company_id=$1 AND party_name=$2
               AND payment_date BETWEEN $3::date - 7 AND $3::date + 7`,
            [company_id, inv.party_name, inv.invoice_date]
          )
          if (tdsCheck.length === 0) {
            const tdsAmt = Math.round(parseFloat(inv.taxable_amount) * rule.rate / 100)
            addFinding({
              id:           `missing_tds_${inv.id}`,
              category:     'TDS',
              severity:     'critical',
              title:        `Missing TDS u/s ${rule.section} — ${inv.party_name}`,
              description:  `${inv.invoice_number} (₹${parseFloat(inv.taxable_amount).toLocaleString('en-IN')}) appears to be ${rule.label}. TDS @${rule.rate}% = ₹${tdsAmt.toLocaleString('en-IN')} should have been deducted.`,
              invoice:      inv.invoice_number,
              vendor:       inv.party_name,
              law:          `Section ${rule.section} — TDS on ${rule.label}`,
              action:       `Create TDS entry for ₹${tdsAmt.toLocaleString('en-IN')} u/s ${rule.section}`,
              risk_amount:  tdsAmt,
              date:         inv.invoice_date,
            })
          }
          break
        }
      }
    }

    // ── RULE 2: 194C Aggregate threshold breach ───────────────
    // Single contractor payments < ₹30k but aggregate > ₹1L in FY
    const { rows: contractorAgg } = await pool.query(
      `SELECT party_name, COUNT(*) as payments,
              SUM(taxable_amount) as total,
              MIN(invoice_date) as first_date
       FROM invoices
       WHERE company_id=$1 AND invoice_type='purchase' AND status!='cancelled'
         AND EXTRACT(YEAR FROM invoice_date) = EXTRACT(YEAR FROM NOW())
       GROUP BY party_name
       HAVING SUM(taxable_amount) > 100000`,
      [company_id]
    )
    for (const c of contractorAgg) {
      const combined = (c.party_name || '').toLowerCase()
      const isContractor = ['contractor','transport','logistics','labour','construction','civil','works'].some(k => combined.includes(k))
      if (isContractor) {
        const { rows: tdsCheck } = await pool.query(
          `SELECT COUNT(*) as cnt FROM tds_entries
           WHERE company_id=$1 AND party_name=$2 AND section='194C'`,
          [company_id, c.party_name]
        )
        if (parseInt(tdsCheck[0]?.cnt || 0) === 0) {
          addFinding({
            id:           `194c_aggregate_${c.party_name}`,
            category:     'TDS',
            severity:     'high',
            title:        `194C Aggregate Threshold Breached — ${c.party_name}`,
            description:  `${c.payments} payments totalling ₹${parseFloat(c.total).toLocaleString('en-IN')} exceed the ₹1,00,000 annual aggregate limit. TDS @1% now mandatory on all payments.`,
            vendor:       c.party_name,
            law:          'Section 194C — TDS if aggregate exceeds ₹1,00,000/FY',
            action:       `Deduct TDS @1% = ₹${Math.round(parseFloat(c.total) * 0.01).toLocaleString('en-IN')} retroactively`,
            risk_amount:  Math.round(parseFloat(c.total) * 0.01),
            date:         c.first_date,
          })
        }
      }
    }

    // ── RULE 3: ITC on blocked credits (Sec 17(5)) ───────────
    // Check if ITC claimed on motor vehicles, food, personal consumption
    const BLOCKED_ITC_KEYWORDS = [
      { kw: ['motor vehicle','car purchase','vehicle purchase','automobile'], reason: 'Motor vehicles (Sec 17(5)(a)) — ITC blocked except for transport business' },
      { kw: ['restaurant','dining','canteen','food','catering','swiggy','zomato'], reason: 'Food & beverages (Sec 17(5)(b)) — ITC blocked' },
      { kw: ['club membership','health club','fitness','gym'], reason: 'Club membership (Sec 17(5)(b)) — ITC blocked' },
      { kw: ['personal consumption','personal use'], reason: 'Personal consumption (Sec 17(5)) — ITC blocked' },
    ]
    const { rows: allPurchases } = await pool.query(
      `SELECT i.id, i.invoice_number, i.party_name, i.invoice_date,
              i.cgst_amount, i.sgst_amount, i.igst_amount,
              COALESCE(string_agg(ii.description, ' '), '') as descriptions
       FROM invoices i
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE i.company_id=$1 AND i.invoice_type='purchase' AND i.status!='cancelled'
         AND (i.cgst_amount > 0 OR i.sgst_amount > 0 OR i.igst_amount > 0)
       GROUP BY i.id`,
      [company_id]
    )
    for (const inv of allPurchases) {
      const combined = ((inv.party_name || '') + ' ' + (inv.descriptions || '')).toLowerCase()
      for (const blocked of BLOCKED_ITC_KEYWORDS) {
        if (blocked.kw.some(k => combined.includes(k))) {
          const itcAmt = parseFloat(inv.cgst_amount || 0) + parseFloat(inv.sgst_amount || 0) + parseFloat(inv.igst_amount || 0)
          addFinding({
            id:           `blocked_itc_${inv.id}`,
            category:     'GST',
            severity:     'high',
            title:        `Blocked ITC Claimed — ${inv.invoice_number}`,
            description:  `ITC of ₹${itcAmt.toLocaleString('en-IN')} on ${inv.party_name} may be ineligible. ${blocked.reason}`,
            invoice:      inv.invoice_number,
            vendor:       inv.party_name,
            law:          'Section 17(5) CGST Act — Blocked Credits',
            action:       `Reverse ITC entry of ₹${itcAmt.toLocaleString('en-IN')} and reclassify as expense`,
            risk_amount:  itcAmt,
            date:         inv.invoice_date,
          })
          break
        }
      }
    }

    // ── RULE 4: Capital vs Revenue misclassification ──────────
    // Equipment/machinery > ₹50k booked as expense instead of fixed asset
    const ASSET_KEYWORDS = ['equipment','machinery','computer','laptop','server','printer','furniture','vehicle','ac','air conditioner','camera','phone','tablet','hardware','tool','machine']
    for (const inv of allPurchases) {
      const combined = ((inv.party_name || '') + ' ' + (inv.descriptions || '')).toLowerCase()
      if (parseFloat(inv.taxable_amount || 0) > 50000 &&
          ASSET_KEYWORDS.some(k => combined.includes(k))) {
        addFinding({
          id:           `capital_misclass_${inv.id}`,
          category:     'Accounting',
          severity:     'medium',
          title:        `Possible Capital Expenditure in Revenue — ${inv.invoice_number}`,
          description:  `${inv.party_name} (₹${parseFloat(inv.taxable_amount || 0).toLocaleString('en-IN')}) may be a fixed asset. Booking as expense overstates costs and understates assets. Should be capitalized and depreciated.`,
          invoice:      inv.invoice_number,
          vendor:       inv.party_name,
          law:          'AS-10 / Ind AS-16 — Property, Plant & Equipment',
          action:       'Reclassify to Fixed Assets and setup depreciation schedule',
          risk_amount:  parseFloat(inv.taxable_amount || 0),
          date:         inv.invoice_date,
        })
      }
    }

    // ── RULE 5: GST output tax mismatch ──────────────────────
    // Compare output tax in invoices vs output GST accounts in journals
    const { rows: invGST } = await pool.query(
      `SELECT COALESCE(SUM(cgst_amount),0) as cgst,
              COALESCE(SUM(sgst_amount),0) as sgst,
              COALESCE(SUM(igst_amount),0) as igst
       FROM invoices
       WHERE company_id=$1 AND invoice_type='sale' AND status!='cancelled'`,
      [company_id]
    )
    const { rows: journalGST } = await pool.query(
      `SELECT a.code, COALESCE(SUM(jel.credit_amount),0) as credited
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.code IN ('2002','2003','2004')
       GROUP BY a.code`,
      [company_id]
    )
    const invTotal = parseFloat(invGST[0]?.cgst || 0) + parseFloat(invGST[0]?.sgst || 0) + parseFloat(invGST[0]?.igst || 0)
    const jeTotal  = journalGST.reduce((s, r) => s + parseFloat(r.credited || 0), 0)
    const gstDiff  = Math.abs(invTotal - jeTotal)
    if (gstDiff > 1) {
      addFinding({
        id:           'gst_output_mismatch',
        category:     'GST',
        severity:     'critical',
        title:        'Output GST Mismatch — Invoices vs Journals',
        description:  `Invoice records show ₹${invTotal.toLocaleString('en-IN')} output GST but journal entries show ₹${jeTotal.toLocaleString('en-IN')}. Difference of ₹${gstDiff.toLocaleString('en-IN')} could cause GSTR-3B filing errors.`,
        law:          'CGST Act Section 37 — GSTR-1 must match books',
        action:       'Reconcile output GST accounts with invoice register',
        risk_amount:  gstDiff,
      })
    }

    // ── RULE 6: TDS not deposited (missing challan) ───────────
    const { rows: tdsPending } = await pool.query(
      `SELECT section, COUNT(*) as entries,
              SUM(tds_amount) as total,
              MIN(payment_date) as oldest
       FROM tds_entries
       WHERE company_id=$1 AND (challan_no IS NULL OR challan_no='')
       GROUP BY section`,
      [company_id]
    )
    for (const t of tdsPending) {
      const daysOld = Math.floor((today - new Date(t.oldest)) / 86400000)
      const penalty = daysOld > 7 ? Math.round(parseFloat(t.total) * 0.015 * Math.ceil(daysOld / 30)) : 0
      addFinding({
        id:           `tds_undeposited_${t.section}`,
        category:     'TDS',
        severity:     daysOld > 30 ? 'critical' : 'high',
        title:        `TDS u/s ${t.section} Not Deposited — ₹${parseFloat(t.total).toLocaleString('en-IN')}`,
        description:  `${t.entries} TDS entries totalling ₹${parseFloat(t.total).toLocaleString('en-IN')} have no challan number. Oldest entry is ${daysOld} days old.${penalty > 0 ? ` Interest u/s 201(1A) @1.5%/month = ₹${penalty.toLocaleString('en-IN')} accruing.` : ''}`,
        law:          'Section 200 ITACT — TDS must be deposited by 7th of next month',
        action:       `Pay via Challan ITNS 281 and update challan number in TDS module`,
        risk_amount:  parseFloat(t.total) + penalty,
      })
    }

    // ── RULE 7: Overdue compliance filings ───────────────────
    const { rows: overdueFilings } = await pool.query(
      `SELECT name, type, due_date,
              CEIL(EXTRACT(EPOCH FROM (NOW() - due_date))/86400) AS days_overdue
       FROM compliance_deadlines
       WHERE company_id=$1 AND status='pending' AND due_date < $2
       ORDER BY due_date ASC`,
      [company_id, todayStr]
    )
    const PENALTY_MAP = { GST: 50, TDS: 200, ITR: 1000, ROC: 100, ADVANCE_TAX: 0 }
    for (const f of overdueFilings) {
      const days = Math.round(parseFloat(f.days_overdue))
      const dailyPenalty = PENALTY_MAP[f.type] || 50
      const penalty = Math.min(days * dailyPenalty, 10000)
      addFinding({
        id:           `overdue_${f.type}_${f.name}`,
        category:     'Compliance',
        severity:     days > 30 ? 'critical' : 'high',
        title:        `${f.name} — ${days} Days Overdue`,
        description:  `Due date was ${new Date(f.due_date).toLocaleDateString('en-IN')}. Late filing penalty of ₹${penalty.toLocaleString('en-IN')} has accrued${f.type === 'GST' ? ' (₹50/day max ₹10,000)' : ''}.`,
        law:          f.type === 'GST' ? 'Section 47 CGST Act' : f.type === 'TDS' ? 'Section 234E Income Tax Act' : 'Income Tax Act',
        action:       `File ${f.name} immediately to stop penalty`,
        risk_amount:  penalty,
        date:         f.due_date,
      })
    }

    // ── RULE 8: Unreconciled ITC balance ─────────────────────
    const { rows: itcAccs } = await pool.query(
      `SELECT a.code, a.name,
              COALESCE(a.opening_balance,0) + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0) AS balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.code IN ('1004','1005','1006')
       GROUP BY a.id, a.code, a.name, a.opening_balance`,
      [company_id]
    )
    const totalITC = itcAccs.reduce((s, r) => s + parseFloat(r.balance || 0), 0)
    if (totalITC > 5000) {
      addFinding({
        id:           'itc_unreconciled',
        category:     'GST',
        severity:     totalITC > 50000 ? 'high' : 'medium',
        title:        `₹${totalITC.toLocaleString('en-IN')} ITC Pending Reconciliation`,
        description:  `Input Tax Credit of ₹${totalITC.toLocaleString('en-IN')} is sitting in input GST accounts but hasn't been reconciled with GSTR-2B. Unreconciled ITC can be disallowed during GST audit.`,
        law:          'Rule 36(4) CGST Rules — ITC restricted to GSTR-2B matched invoices',
        action:       'Download GSTR-2B from portal and reconcile with purchase register',
        risk_amount:  totalITC,
      })
    }

    // ── RULE 9: Journal entry imbalance check ────────────────
    const { rows: imbalanced } = await pool.query(
      `SELECT je.entry_number, je.entry_date,
              ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as diff
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       WHERE je.company_id=$1 AND je.is_posted=true
       GROUP BY je.id, je.entry_number, je.entry_date
       HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01`,
      [company_id]
    )
    for (const je of imbalanced) {
      addFinding({
        id:           `imbalanced_je_${je.entry_number}`,
        category:     'Accounting',
        severity:     'critical',
        title:        `Imbalanced Journal Entry — ${je.entry_number}`,
        description:  `Journal entry ${je.entry_number} dated ${new Date(je.entry_date).toLocaleDateString('en-IN')} has a debit/credit difference of ₹${parseFloat(je.diff).toLocaleString('en-IN')}. This violates double-entry accounting principles.`,
        law:          'Double-entry bookkeeping — every debit must have equal credit',
        action:       `Review and correct ${je.entry_number} immediately`,
        risk_amount:  parseFloat(je.diff),
      })
    }

    // ── RULE 10: Large cash transactions > ₹2L ───────────────
    const { rows: cashTxns } = await pool.query(
      `SELECT je.entry_number, je.entry_date, jel.debit_amount, jel.credit_amount, jel.narration
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN accounts a ON a.id = jel.account_id
       WHERE je.company_id=$1 AND a.code='1001'
         AND (jel.debit_amount > 200000 OR jel.credit_amount > 200000)`,
      [company_id]
    )
    for (const txn of cashTxns) {
      const amt = parseFloat(txn.debit_amount || txn.credit_amount)
      addFinding({
        id:           `cash_txn_${txn.entry_number}`,
        category:     'Compliance',
        severity:     'high',
        title:        `Cash Transaction > ₹2,00,000 — ${txn.entry_number}`,
        description:  `Cash transaction of ₹${amt.toLocaleString('en-IN')} on ${new Date(txn.entry_date).toLocaleDateString('en-IN')}. Section 269ST prohibits cash receipts > ₹2L. Penalty = 100% of amount.`,
        law:          'Section 269ST Income Tax Act — Cash receipt > ₹2L prohibited',
        action:       'Verify this was via banking channel. If cash, penalty of 100% applies.',
        risk_amount:  amt,
        date:         txn.entry_date,
      })
    }

    // ── RULE 11: Negative account balance anomaly ─────────────
    // Asset accounts should not have credit balance (except accumulated depreciation)
    const { rows: negAssets } = await pool.query(
      `SELECT a.code, a.name,
              COALESCE(a.opening_balance,0) + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0) AS balance
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.type='asset' AND a.code NOT IN ('1105')
       GROUP BY a.id, a.code, a.name, a.opening_balance
       HAVING COALESCE(a.opening_balance,0) + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0) < -0.01`,
      [company_id]
    )
    for (const acc of negAssets) {
      addFinding({
        id:           `neg_asset_${acc.code}`,
        category:     'Accounting',
        severity:     'medium',
        title:        `Negative Balance in Asset Account — ${acc.name}`,
        description:  `${acc.name} (code ${acc.code}) has a negative balance of ₹${Math.abs(parseFloat(acc.balance)).toLocaleString('en-IN')}. Asset accounts should not have credit balances — this indicates a posting error.`,
        law:          'Basic accounting principles — asset accounts are debit-nature',
        action:       `Review ledger for ${acc.name} and identify incorrect entries`,
        risk_amount:  Math.abs(parseFloat(acc.balance)),
      })
    }

    // ── RULE 12: Advance tax liability check ─────────────────
    const { rows: plData } = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN a.type='revenue' THEN jel.credit_amount - jel.debit_amount ELSE 0 END), 0) as revenue,
         COALESCE(SUM(CASE WHEN a.type='expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END), 0) as expenses
       FROM accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted=true
       WHERE a.company_id=$1 AND a.type IN ('revenue','expense')`,
      [company_id]
    )
    const netProfit = parseFloat(plData[0]?.revenue || 0) - parseFloat(plData[0]?.expenses || 0)
    // Rough tax estimate — 5% slab on profit above ₹3L
    if (netProfit > 300000) {
      const estTax = Math.round((netProfit - 300000) * 0.05 * 1.04)
      const { rows: advTax } = await pool.query(
        `SELECT COALESCE(SUM(jel.debit_amount),0) as paid
         FROM accounts a
         JOIN journal_entry_lines jel ON jel.account_id = a.id
         WHERE a.company_id=$1 AND a.code='1011'`,
        [company_id]
      )
      const paid = parseFloat(advTax[0]?.paid || 0)
      if (paid < estTax * 0.9) {
        addFinding({
          id:           'advance_tax_gap',
          category:     'Tax',
          severity:     'medium',
          title:        `Advance Tax Shortfall — Est. ₹${estTax.toLocaleString('en-IN')} Due`,
          description:  `Based on current P&L, estimated tax liability is ₹${estTax.toLocaleString('en-IN')}. Advance tax paid: ₹${paid.toLocaleString('en-IN')}. Shortfall may attract interest u/s 234B/234C.`,
          law:          'Section 208 Income Tax Act — Advance tax mandatory if liability > ₹10,000',
          action:       'Pay advance tax via Challan ITNS 280 before 15th March',
          risk_amount:  Math.max(0, estTax - paid),
        })
      }
    }

    // Sort findings: critical → high → medium → low
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    findings.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4))

    // Update summary counts
    summary.critical = findings.filter(f => f.severity === 'critical').length
    summary.high     = findings.filter(f => f.severity === 'high').length
    summary.medium   = findings.filter(f => f.severity === 'medium').length
    summary.low      = findings.filter(f => f.severity === 'low').length
    summary.total    = findings.length
    summary.total_risk_amount = findings.reduce((s, f) => s + (f.risk_amount || 0), 0)

    res.json({
      findings,
      summary,
      swept_at: new Date().toISOString(),
      rules_checked: 12,
    })
  } catch (err) {
    console.error('Risk sweep error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router