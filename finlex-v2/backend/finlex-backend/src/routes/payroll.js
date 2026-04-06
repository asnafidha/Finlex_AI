const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// POST /api/payroll/calculate — auto-compute PF/ESIC/TDS from salary components
// Called before saving to show breakdown to user
router.post('/calculate', (req, res) => {
  const { gross_salary, basic, hra, is_esic_applicable } = req.body
  if (!gross_salary) return res.status(400).json({ error: 'gross_salary required' })

  const gross = parseFloat(gross_salary)
  const b     = parseFloat(basic || gross * 0.5)  // default basic = 50% gross

  // EPF (PF) Rules:
  // Employee: 12% of basic (capped at 12% of ₹15,000 = ₹1,800 if basic > ₹15,000)
  // Employer: 12% of basic (8.33% → EPS, 3.67% → EPF), same cap
  // Exemption: employee can opt out if basic > ₹15,000 (but usually deducted)
  const pf_wage     = Math.min(b, 15000)  // EPF wage ceiling ₹15,000
  const pf_employee = Math.round(pf_wage * 0.12)  // 12%
  const pf_eps      = Math.round(pf_wage * 0.0833) // 8.33% → EPS
  const pf_epf      = Math.round(pf_wage * 0.0367) // 3.67% → EPF
  const pf_employer = pf_eps + pf_epf  // = 12%

  // ESIC Rules:
  // Applicable only if gross salary ≤ ₹21,000/month
  // Employee: 0.75%, Employer: 3.25% of gross
  const esic_applicable = is_esic_applicable !== false && gross <= 21000
  const esic_employee = esic_applicable ? Math.round(gross * 0.0075) : 0
  const esic_employer = esic_applicable ? Math.round(gross * 0.0325) : 0

  // Profession Tax (state-specific; approximate for Maharashtra/Karnataka common slabs)
  // Skip for simplicity — user can enter as other_deductions

  const net_salary = gross - pf_employee - esic_employee
  const cost_to_company = gross + pf_employer + esic_employer

  res.json({
    gross_salary: gross, basic: b,
    pf: { employee: pf_employee, employer: pf_employer, eps: pf_eps, epf: pf_epf, wage_ceiling: pf_wage, note: pf_wage < b ? `Basic capped at ₹15,000 for PF calculation` : null },
    esic: { applicable: esic_applicable, employee: esic_employee, employer: esic_employer, note: !esic_applicable ? `ESIC not applicable (gross > ₹21,000/month)` : `0.75% employee + 3.25% employer` },
    net_salary, cost_to_company,
  })
})

router.get('/', async (req, res) => {
  const { company_id, month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = 'SELECT * FROM payroll_entries WHERE company_id=$1'
    const params = [company_id]
    if (month) { params.push(month); q += ` AND month=$${params.length}` }
    if (year)  { params.push(year);  q += ` AND year=$${params.length}` }
    q += ' ORDER BY year DESC, month DESC, employee_name'
    const { rows } = await pool.query(q, params)
    const total_gross = rows.reduce((s,r) => s + parseFloat(r.gross_salary||0), 0)
    const total_net   = rows.reduce((s,r) => s + parseFloat(r.net_salary||0), 0)
    const total_tds   = rows.reduce((s,r) => s + parseFloat(r.tds_amount||0), 0)
    const total_pf    = rows.reduce((s,r) => s + parseFloat(r.pf_employee||0) + parseFloat(r.pf_employer||0), 0)
    res.json({ entries: rows, summary: { total_gross, total_net, total_tds, total_pf, count: rows.length } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  const {
    company_id, employee_name, employee_pan,
    month, year, gross_salary, basic, hra, allowances,
    pf_employee, pf_employer, esic_employee, esic_employer,
    tds_amount, other_deductions, payment_date, payment_mode
  } = req.body

  if (!company_id || !employee_name || !month || !year || !gross_salary)
    return res.status(400).json({ error: 'company_id, employee_name, month, year, gross_salary required' })

  const gross        = parseFloat(gross_salary)
  const pf_emp_amt   = parseFloat(pf_employee   || 0)
  const pf_er_amt    = parseFloat(pf_employer   || 0)
  const esic_emp_amt = parseFloat(esic_employee || 0)
  const esic_er_amt  = parseFloat(esic_employer || 0)
  const tds_amt      = parseFloat(tds_amount    || 0)
  const other_ded    = parseFloat(other_deductions || 0)
  const net_salary   = Math.round((gross - pf_emp_amt - esic_emp_amt - tds_amt - other_ded) * 100) / 100

  if (net_salary < 0)
    return res.status(400).json({ error: `Net salary is negative (₹${net_salary.toFixed(2)}). Check deductions.` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }

    const salaryExp   = await getAcc('5101')
    const pfExp       = await getAcc('5113')
    const esicExp     = await getAcc('5114')
    const pfPayable   = await getAcc('2008')
    const esicPayable = await getAcc('2009')
    const tdsPayable  = await getAcc('2005')
    const salPayable  = await getAcc('2007')
    const bankAcc     = await getAcc('1002')

    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id])
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`
    const monthName = new Date(0, month - 1).toLocaleString('en-IN', { month: 'long' })

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,narration,is_posted,created_by)
       VALUES($1,$2,$3,'payroll',$4,true,$5) RETURNING id`,
      [company_id, entryNum, payment_date || new Date().toISOString().split('T')[0],
       `Salary — ${employee_name} — ${monthName} ${year}`, req.user.id]
    )
    const jeId = je.rows[0].id

    const addLine = async (account_id, debit, credit, narr) => {
      if (!account_id || (Math.round(debit*100) === 0 && Math.round(credit*100) === 0)) return
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, Math.round(debit*100)/100 || 0, Math.round(credit*100)/100 || 0, narr]
      )
    }

    // Debit: Salary Expense (gross) + PF Employer + ESIC Employer
    await addLine(salaryExp,  gross,       0, `Gross salary — ${employee_name}`)
    if (pf_er_amt   > 0) await addLine(pfExp,   pf_er_amt,   0, `PF employer contribution — ${employee_name}`)
    if (esic_er_amt > 0) await addLine(esicExp, esic_er_amt, 0, `ESIC employer contribution — ${employee_name}`)

    // Credit: PF (employee+employer), ESIC, TDS, Bank/Payable
    if (pf_emp_amt + pf_er_amt > 0)      await addLine(pfPayable,   0, pf_emp_amt + pf_er_amt, `PF payable — ${employee_name} (employee ₹${pf_emp_amt} + employer ₹${pf_er_amt})`)
    if (esic_emp_amt + esic_er_amt > 0)  await addLine(esicPayable, 0, esic_emp_amt + esic_er_amt, `ESIC payable — ${employee_name}`)
    if (tds_amt > 0)                      await addLine(tdsPayable,  0, tds_amt, `TDS on salary u/s 192 — ${employee_name}`)
    if (other_ded > 0)                    await addLine(salPayable,  0, other_ded, `Other deductions — ${employee_name}`)

    if (payment_date) {
      await addLine(bankAcc,    0, net_salary, `Net salary paid — ${employee_name}`)
    } else {
      await addLine(salPayable, 0, net_salary, `Net salary payable — ${employee_name}`)
    }

    const { rows: [entry] } = await client.query(
      `INSERT INTO payroll_entries(company_id,employee_name,employee_pan,month,year,gross_salary,basic,hra,allowances,pf_employee,pf_employer,esic_employee,esic_employer,tds_amount,other_deductions,net_salary,payment_date,payment_mode,journal_entry_id,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [company_id, employee_name, employee_pan||null, month, year, gross,
       parseFloat(basic||0), parseFloat(hra||0), parseFloat(allowances||0),
       pf_emp_amt, pf_er_amt, esic_emp_amt, esic_er_amt,
       tds_amt, other_ded, net_salary, payment_date||null, payment_mode||'bank', jeId, req.user.id]
    )

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,'PAYROLL_POSTED','payroll_entries',$3,$4)`,
      [company_id, req.user.id, entry.id,
       JSON.stringify({ employee_name, month, year, gross, net: net_salary, pf: pf_emp_amt+pf_er_amt, tds: tds_amt })]
    )

    await client.query('COMMIT')
    res.status(201).json({ entry, journal_entry: entryNum })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

router.get('/summary', async (req, res) => {
  const { company_id, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = `SELECT month, year, COUNT(*) as employees,
             SUM(gross_salary) as total_gross, SUM(net_salary) as total_net,
             SUM(tds_amount) as total_tds, SUM(pf_employee+pf_employer) as total_pf,
             SUM(esic_employee+esic_employer) as total_esic
             FROM payroll_entries WHERE company_id=$1`
    const params = [company_id]
    if (year) { params.push(year); q += ` AND year=$${params.length}` }
    q += ' GROUP BY month, year ORDER BY year DESC, month DESC'
    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router