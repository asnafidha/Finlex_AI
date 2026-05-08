const router = require('express').Router()
const pool = require('../config/db')
const auth = require('../middleware/auth')

router.use(auth)

const TDS_SECTIONS = {
  '192': { description: 'Salary', rate_individual: 0, rate_company: 0, threshold: 250000 },
  '194': { description: 'Dividend', rate_individual: 10, rate_company: 10, threshold: 5000 },
  '194A': { description: 'Interest (other than securities)', rate_individual: 10, rate_company: 10, threshold: 40000 },
  '194B': { description: 'Winnings from lottery', rate_individual: 30, rate_company: 30, threshold: 10000 },
  '194C': { description: 'Payment to Contractors', rate_individual: 1, rate_company: 2, threshold: 30000 },
  '194H': { description: 'Commission / Brokerage', rate_individual: 5, rate_company: 5, threshold: 15000 },
  '194I': { description: 'Rent', rate_individual: 10, rate_company: 10, threshold: 240000 },
  '194J': { description: 'Professional / Technical Services', rate_individual: 10, rate_company: 10, threshold: 30000 },
}

// GET /api/tds/sections
router.get('/sections', (req, res) => {
  const sections = Object.entries(TDS_SECTIONS).map(([code, d]) => ({ code, ...d }))
  res.json(sections)
})

// POST /api/tds/calculate
router.post('/calculate', (req, res) => {
  const { amount, section, party_type = 'company', pan_available = true } = req.body
  if (!amount || !section) return res.status(400).json({ error: 'amount and section required' })
  const sec = TDS_SECTIONS[section]
  if (!sec) return res.status(400).json({ error: `Invalid section. Valid: ${Object.keys(TDS_SECTIONS).join(', ')}` })
  const base_rate = party_type === 'individual' ? sec.rate_individual : sec.rate_company
  const effective_rate = !pan_available ? Math.max(base_rate, 20) : base_rate
  const tds_amount = (parseFloat(amount) * effective_rate) / 100
  res.json({
    section, description: sec.description,
    gross_amount: parseFloat(amount),
    tds_rate: effective_rate,
    tds_amount: Math.round(tds_amount * 100) / 100,
    net_payable: Math.round((parseFloat(amount) - tds_amount) * 100) / 100,
    pan_available,
    threshold: sec.threshold,
    above_threshold: parseFloat(amount) > sec.threshold,
  })
})

// POST /api/tds/entries — save TDS entry + auto journal
router.post('/entries', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { company_id, party_name, party_pan, section, gross_amount, tds_rate, tds_amount, payment_date, payment_nature, challan_no } = req.body
    if (!company_id || !party_name || !section || !gross_amount || !tds_amount || !payment_date)
      return res.status(400).json({ error: 'company_id, party_name, section, gross_amount, tds_amount, payment_date required' })

    const { rows } = await client.query(
      `INSERT INTO tds_entries(company_id,party_name,party_pan,section,gross_amount,tds_rate,tds_amount,net_amount,payment_date,payment_nature,challan_no,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [company_id, party_name, party_pan || null, section,
        gross_amount, tds_rate || 0, tds_amount,
        parseFloat(gross_amount) - parseFloat(tds_amount),
        payment_date, payment_nature || null, challan_no || null, req.user.id]
    )

    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }
    const tdsPayable = await getAcc('2005')
    const bankAcc = await getAcc('1002')
    const expenseAcc = await getAcc('5107')

    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id])
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,narration,is_posted,created_by)
       VALUES($1,$2,$3,'tds',$4,true,$5) RETURNING id`,
      [company_id, entryNum, payment_date, `TDS on ${payment_nature || section} — ${party_name} — Section ${section}`, req.user.id]
    )
    const jeId = je.rows[0].id

    const addLine = async (account_id, debit, credit, narration) => {
      if (!account_id) return
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, debit || 0, credit || 0, narration]
      )
    }

    await addLine(expenseAcc, gross_amount, 0, `${payment_nature || 'Expense'} — ${party_name}`)
    await addLine(tdsPayable, 0, tds_amount, `TDS @ ${tds_rate}% u/s ${section}`)
    await addLine(bankAcc, 0, parseFloat(gross_amount) - parseFloat(tds_amount), `Net payment to ${party_name}`)

    await client.query('COMMIT')
    res.status(201).json({ entry: rows[0], journal_entry: entryNum })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// GET /api/tds/entries?company_id=xxx
router.get('/entries', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query('SELECT * FROM tds_entries WHERE company_id=$1 ORDER BY payment_date DESC', [company_id])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/tds/summary?company_id=xxx&quarter=Q4&year=2025
router.get('/summary', async (req, res) => {
  const { company_id, quarter, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  const quarterMonths = { Q1: [4, 5, 6], Q2: [7, 8, 9], Q3: [10, 11, 12], Q4: [1, 2, 3] }
  const months = quarter ? quarterMonths[quarter] : null
  try {
    let query = `SELECT section,payment_nature,COUNT(*) as transactions,SUM(gross_amount) as total_gross,SUM(tds_amount) as total_tds,SUM(net_amount) as total_net FROM tds_entries WHERE company_id=$1`
    const params = [company_id]
    if (year) { params.push(year); query += ` AND EXTRACT(YEAR FROM payment_date)=$${params.length}` }
    if (months) { params.push(months); query += ` AND EXTRACT(MONTH FROM payment_date)=ANY($${params.length}::int[])` }
    query += ' GROUP BY section,payment_nature ORDER BY total_tds DESC'
    const { rows } = await pool.query(query, params)
    res.json({ entries: rows, total_tds_deducted: rows.reduce((s, r) => s + parseFloat(r.total_tds || 0), 0), quarter, year })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/tds/export-return?company_id=xxx&quarter=Q4&year=2025&format=json
// Exports TDS return in TRACES-compatible 26Q/27Q format
router.get('/export-return', async (req, res) => {
  const { company_id, quarter = 'Q4', year = new Date().getFullYear(), format = 'json' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  const quarterMonths = { Q1: [4, 5, 6], Q2: [7, 8, 9], Q3: [10, 11, 12], Q4: [1, 2, 3] }
  const months = quarterMonths[quarter] || quarterMonths['Q4']
  const nonSalarySection = ['194', '194A', '194B', '194C', '194H', '194I', '194J']

  try {
    const { rows: compRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!compRows.length) return res.status(404).json({ error: 'Company not found' })
    const company = compRows[0]

    const { rows: entries } = await pool.query(
      `SELECT * FROM tds_entries WHERE company_id=$1
       AND EXTRACT(MONTH FROM payment_date)=ANY($2::int[])
       AND EXTRACT(YEAR FROM payment_date)=$3
       ORDER BY payment_date ASC`,
      [company_id, months, year]
    )

    // Determine form type: 26Q for non-salary domestic, 27Q for non-resident
    const form = '26Q'

    // Build TRACES-compatible structure
    const deductees = entries.map((e, idx) => ({
      sr_no: idx + 1,
      deductee_name: e.party_name,
      deductee_pan: e.party_pan || 'PANNOTAVBL',
      section: e.section,
      payment_nature: e.payment_nature || TDS_SECTIONS[e.section]?.description || e.section,
      payment_date: e.payment_date ? new Date(e.payment_date).toISOString().split('T')[0] : '',
      gross_amount: parseFloat(e.gross_amount || 0),
      tds_rate: parseFloat(e.tds_rate || 0),
      tds_amount: parseFloat(e.tds_amount || 0),
      net_amount: parseFloat(e.net_amount || 0),
      challan_no: e.challan_no || '',
      deposited: e.deposited || false,
    }))

    const totalGross = entries.reduce((s, e) => s + parseFloat(e.gross_amount || 0), 0)
    const totalTDS = entries.reduce((s, e) => s + parseFloat(e.tds_amount || 0), 0)

    const returnData = {
      form,
      quarter,
      financial_year: quarter === 'Q4' ? `${parseInt(year) - 1}-${year}` : `${year}-${parseInt(year) + 1}`,
      deductor: {
        name: company.name,
        tan: company.tan || 'TAN_NOT_SET',
        gstin: company.gstin || '',
        address: company.address || '',
        state_code: company.state_code || '',
      },
      summary: {
        total_deductees: deductees.length,
        total_gross_paid: totalGross,
        total_tds_deducted: totalTDS,
        total_net_paid: totalGross - totalTDS,
      },
      deductee_details: deductees,
      generated_at: new Date().toISOString(),
      note: `TDS Return ${form} for ${quarter} ${year} — ${deductees.length} deductee entries`,
    }

    if (format === 'csv') {
      // Build CSV
      const headers = ['Sr No', 'Deductee Name', 'PAN', 'Section', 'Payment Nature', 'Payment Date', 'Gross Amount', 'TDS Rate %', 'TDS Amount', 'Net Amount', 'Challan No']
      const csvRows = deductees.map(d => [
        d.sr_no, `"${d.deductee_name}"`, d.deductee_pan, d.section,
        `"${d.payment_nature}"`, d.payment_date,
        d.gross_amount.toFixed(2), d.tds_rate.toFixed(2), d.tds_amount.toFixed(2),
        d.net_amount.toFixed(2), d.challan_no,
      ])
      const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="TDS_${form}_${quarter}_${year}.csv"`)
      return res.send(csv)
    }

    res.json(returnData)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router