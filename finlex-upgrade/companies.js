const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/companies
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

// GET /api/companies/:id
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

// POST /api/companies — create company + default accounts + realistic compliance deadlines
router.post('/', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const {
      name, gstin, pan, state_code, state_name,
      address, email, phone, financial_year,
      fy_start_date, fy_end_date, business_type
    } = req.body

    if (!name || !pan || !state_code)
      return res.status(400).json({ error: 'name, pan, state_code required' })

    // Always derive FY from current date so deadlines are never in the past
    const now        = new Date()
    const curYear    = now.getFullYear()
    const curMonth   = now.getMonth() + 1  // 1-12
    // Indian FY: Apr–Mar. If we're Jan–Mar, FY started last year
    const fyStartYear = curMonth >= 4 ? curYear : curYear - 1
    const fyEndYear   = fyStartYear + 1

    const fyStart = fy_start_date || `${fyStartYear}-04-01`
    const fyEnd   = fy_end_date   || `${fyEndYear}-03-31`
    const fy      = financial_year || `${fyStartYear}-${String(fyEndYear).slice(2)}`

    const { rows } = await client.query(
      `INSERT INTO companies
       (name,gstin,pan,state_code,state_name,address,email,phone,
        financial_year,fy_start_date,fy_end_date,business_type,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, gstin||null, pan, state_code, state_name||null,
       address||null, email||null, phone||null,
       fy, fyStart, fyEnd,
       business_type||'private_limited', req.user.id]
    )
    const company = rows[0]

    // Grant CA access
    await client.query(
      `INSERT INTO ca_company_access(ca_id,company_id,role) VALUES($1,$2,'owner')`,
      [req.user.id, company.id]
    )

    // Create default chart of accounts
    await client.query('SELECT setup_default_accounts($1)', [company.id])

    // ── Realistic compliance deadlines based on CURRENT date ──
    // Only create future + near-past deadlines, never 600-days-overdue ones.
    // We generate for the current FY and only include months from April to current month + 3 ahead.
    const deadlines = []

    const MONTHS = [
      'Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'
    ]

    for (let m = 0; m < 12; m++) {
      // m=0 → April of fyStartYear, m=11 → March of fyEndYear
      const calMonth  = m < 9 ? m + 4 : m - 8        // 1-indexed calendar month
      const calYear   = m < 9 ? fyStartYear : fyEndYear
      const monthName = MONTHS[m]

      // GSTR-1: 11th of following month
      const gstr1Due = new Date(calYear, calMonth, 11)   // calMonth is 0-indexed JS month = following month
      // GSTR-3B: 20th of following month
      const gstr3bDue = new Date(calYear, calMonth, 20)

      // Only add if not more than 90 days in the past (avoid stale overdue data)
      const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000)

      if (gstr1Due > ninetyDaysAgo) {
        deadlines.push({
          name: `GSTR-1 Filing (${monthName})`,
          type: 'GST',
          due:  gstr1Due.toISOString().split('T')[0],
        })
      }
      if (gstr3bDue > ninetyDaysAgo) {
        deadlines.push({
          name: `GSTR-3B Filing (${monthName})`,
          type: 'GST',
          due:  gstr3bDue.toISOString().split('T')[0],
        })
      }
    }

    // TDS Quarterly returns
    const tdsQuarters = [
      { q: 'Q1', due: `${fyStartYear}-07-31` },
      { q: 'Q2', due: `${fyStartYear}-10-31` },
      { q: 'Q3', due: `${fyEndYear}-01-31` },
      { q: 'Q4', due: `${fyEndYear}-05-31` },
    ]
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000)
    for (const q of tdsQuarters) {
      if (new Date(q.due) > ninetyDaysAgo) {
        deadlines.push({ name: `TDS Return ${q.q}`, type: 'TDS', due: q.due })
      }
    }

    // Advance Tax
    const advTaxDates = [
      { name: 'Advance Tax Q1 (15%)', due: `${fyStartYear}-06-15` },
      { name: 'Advance Tax Q2 (45%)', due: `${fyStartYear}-09-15` },
      { name: 'Advance Tax Q3 (75%)', due: `${fyStartYear}-12-15` },
      { name: 'Advance Tax Q4 (100%)', due: `${fyEndYear}-03-15` },
    ]
    for (const t of advTaxDates) {
      if (new Date(t.due) > ninetyDaysAgo) {
        deadlines.push({ name: t.name, type: 'ADVANCE_TAX', due: t.due })
      }
    }

    // Annual filings
    const annualDates = [
      { name: `ITR Filing FY ${fy}`, type: 'ITR', due: `${fyEndYear}-07-31` },
      { name: 'ROC Annual Return', type: 'ROC', due: `${fyEndYear}-09-30` },
    ]
    for (const t of annualDates) {
      if (new Date(t.due) > ninetyDaysAgo) {
        deadlines.push(t)
      }
    }

    for (const d of deadlines) {
      await client.query(
        `INSERT INTO compliance_deadlines(company_id,type,name,due_date,financial_year,period,status)
         VALUES($1,$2,$3,$4,$5,NULL,'pending')`,
        [company.id, d.type, d.name, d.due, fy]
      )
    }

    await client.query('COMMIT')
    res.status(201).json(company)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Create company error:', err)
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// PUT /api/companies/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, gstin, pan, state_code, state_name, address, email, phone } = req.body
    const { rows } = await pool.query(
      `UPDATE companies SET name=$1,gstin=$2,pan=$3,state_code=$4,state_name=$5,
       address=$6,email=$7,phone=$8,updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [name, gstin||null, pan, state_code, state_name||null,
       address||null, email||null, phone||null, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
