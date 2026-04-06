const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.* FROM companies c
       JOIN ca_company_access cca ON cca.company_id=c.id
       WHERE cca.ca_id=$1 ORDER BY c.name`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.* FROM companies c
       JOIN ca_company_access cca ON cca.company_id=c.id
       WHERE c.id=$1 AND cca.ca_id=$2`,
      [req.params.id, req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Company not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { name, gstin, pan, tan, state_code, state_name, address, email, phone, financial_year, fy_start_date, fy_end_date, business_type } = req.body

    if (!name || !pan || !state_code)
      return res.status(400).json({ error: 'name, pan, state_code required' })

    const now = new Date()
    const curYear = now.getFullYear()
    const curMonth = now.getMonth() + 1
    const fyStartYear = curMonth >= 4 ? curYear : curYear - 1
    const fyEndYear   = fyStartYear + 1

    const fyStart = fy_start_date || `${fyStartYear}-04-01`
    const fyEnd   = fy_end_date   || `${fyEndYear}-03-31`
    const fy      = financial_year || `${fyStartYear}-${String(fyEndYear).slice(2)}`

    const { rows } = await client.query(
      `INSERT INTO companies(name,gstin,pan,tan,state_code,state_name,address,email,phone,financial_year,fy_start_date,fy_end_date,business_type,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [name, gstin||null, pan, tan||null, state_code, state_name||null, address||null, email||null, phone||null, fy, fyStart, fyEnd, business_type||'private_limited', req.user.id]
    )
    const company = rows[0]

    await client.query(`INSERT INTO ca_company_access(ca_id,company_id,role) VALUES($1,$2,'owner')`, [req.user.id, company.id])
    await client.query('SELECT setup_default_accounts($1)', [company.id])

    const deadlines = []
    const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000)

    for (let m = 0; m < 12; m++) {
      const calMonth  = m < 9 ? m + 4 : m - 8
      const calYear   = m < 9 ? fyStartYear : fyEndYear
      const monthName = MONTHS[m]
      const gstr1Due  = new Date(calYear, calMonth, 11)
      const gstr3bDue = new Date(calYear, calMonth, 20)
      if (gstr1Due  > ninetyDaysAgo) deadlines.push({ name: `GSTR-1 Filing (${monthName})`,  type: 'GST', due: gstr1Due.toISOString().split('T')[0] })
      if (gstr3bDue > ninetyDaysAgo) deadlines.push({ name: `GSTR-3B Filing (${monthName})`, type: 'GST', due: gstr3bDue.toISOString().split('T')[0] })
    }

    const tdsQuarters = [
      { q: 'Q1', due: `${fyStartYear}-07-31` }, { q: 'Q2', due: `${fyStartYear}-10-31` },
      { q: 'Q3', due: `${fyEndYear}-01-31` },   { q: 'Q4', due: `${fyEndYear}-05-31` },
    ]
    for (const q of tdsQuarters) {
      if (new Date(q.due) > ninetyDaysAgo) deadlines.push({ name: `TDS Return ${q.q}`, type: 'TDS', due: q.due })
    }

    const advTaxDates = [
      { name: 'Advance Tax Q1 (15%)', due: `${fyStartYear}-06-15` },
      { name: 'Advance Tax Q2 (45%)', due: `${fyStartYear}-09-15` },
      { name: 'Advance Tax Q3 (75%)', due: `${fyStartYear}-12-15` },
      { name: 'Advance Tax Q4 (100%)', due: `${fyEndYear}-03-15` },
    ]
    for (const t of advTaxDates) {
      if (new Date(t.due) > ninetyDaysAgo) deadlines.push(t)
    }

    const annualDates = [
      { name: `ITR Filing FY ${fy}`, type: 'ITR', due: `${fyEndYear}-07-31` },
      { name: 'ROC Annual Return',   type: 'ROC', due: `${fyEndYear}-09-30` },
    ]
    for (const t of annualDates) {
      if (new Date(t.due) > ninetyDaysAgo) deadlines.push(t)
    }

    for (const d of deadlines) {
      await client.query(
        `INSERT INTO compliance_deadlines(company_id,type,name,due_date,financial_year,period,status) VALUES($1,$2,$3,$4,$5,NULL,'pending')`,
        [company.id, d.type, d.name, d.due, fy]
      )
    }

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,'COMPANY_CREATED','companies',$3,$4)`,
      [company.id, req.user.id, company.id, JSON.stringify({ name, gstin, pan, tan, state_code })]
    )

    await client.query('COMMIT')
    res.status(201).json(company)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

router.put('/:id', async (req, res) => {
  try {
    const { name, gstin, pan, tan, state_code, state_name, address, email, phone } = req.body
    const { rows: old } = await pool.query('SELECT * FROM companies WHERE id=$1', [req.params.id])
    if (!old.length) return res.status(404).json({ error: 'Not found' })
    const { rows } = await pool.query(
      `UPDATE companies SET name=$1,gstin=$2,pan=$3,tan=$4,state_code=$5,state_name=$6,address=$7,email=$8,phone=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [name, gstin||null, pan, tan||null, state_code, state_name||null, address||null, email||null, phone||null, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    // Audit
    const client = await pool.connect()
    try {
      await client.query(
        `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,old_values,new_values) VALUES($1,$2,'COMPANY_UPDATED','companies',$3,$4,$5)`,
        [rows[0].id, req.user.id, rows[0].id, JSON.stringify({ name: old[0].name, gstin: old[0].gstin, tan: old[0].tan }), JSON.stringify({ name, gstin, tan })]
      )
    } finally { client.release() }
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router