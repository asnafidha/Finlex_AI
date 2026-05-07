const router = require('express').Router()
const pool = require('../config/db')
const auth = require('../middleware/auth')
const companyAccess = require('../middleware/companyAccess')

router.use(auth)


// All rates and thresholds per Finance Act 2024 / CBDT Circulars
const TDS_SECTIONS = {
  '192':   { description: 'Salary', rate_individual: 0, rate_company: 0, threshold: 250000, note: 'Slab rate applies; compute separately' },
  '193':   { description: 'Interest on securities', rate_individual: 10, rate_company: 10, threshold: 10000 },
  '194':   { description: 'Dividend', rate_individual: 10, rate_company: 10, threshold: 5000 },
  '194A':  { description: 'Interest — Bank/Co-op/Post Office', rate_individual: 10, rate_company: 10, threshold: 40000, note: 'Threshold ₹40,000 for banks/co-op. ₹50,000 for senior citizens. ₹5,000 for others.' },
  '194A_OTHER': { description: 'Interest — Others (non-bank)', rate_individual: 10, rate_company: 10, threshold: 5000 },
  '194B':  { description: 'Winnings — Lottery / Puzzle / Game', rate_individual: 30, rate_company: 30, threshold: 10000 },
  '194BB': { description: 'Winnings — Horse Race', rate_individual: 30, rate_company: 30, threshold: 10000 },
  '194C':  { description: 'Payment to Contractors', rate_individual: 1, rate_company: 2, threshold: 30000, aggregate_threshold: 100000, note: 'Per-payment ₹30,000 OR aggregate ₹1,00,000 per FY to same party' },
  '194D':  { description: 'Insurance Commission', rate_individual: 5, rate_company: 10, threshold: 15000 },
  '194DA': { description: 'Maturity of Life Insurance', rate_individual: 5, rate_company: 5, threshold: 100000 },
  '194G':  { description: 'Commission on lottery tickets', rate_individual: 5, rate_company: 5, threshold: 15000 },
  '194H':  { description: 'Commission / Brokerage', rate_individual: 5, rate_company: 5, threshold: 15000 },
  '194I_LAND':  { description: 'Rent — Land / Building / Furniture', rate_individual: 10, rate_company: 10, threshold: 240000, note: 'Annual threshold ₹2,40,000' },
  '194I_PLANT': { description: 'Rent — Plant & Machinery', rate_individual: 2,  rate_company: 2,  threshold: 240000, note: '2% rate for P&M rent' },
  '194IA': { description: 'Transfer of immovable property', rate_individual: 1, rate_company: 1, threshold: 5000000 },
  '194IB': { description: 'Rent by individuals (>₹50,000/month)', rate_individual: 5, rate_company: 5, threshold: 50000, note: 'Per-month threshold ₹50,000' },
  '194IC': { description: 'Joint development agreement — monetary consideration', rate_individual: 10, rate_company: 10, threshold: 0 },
  '194J':  { description: 'Professional Services (CA, Doctor, Lawyer etc)', rate_individual: 10, rate_company: 10, threshold: 30000 },
  '194J_TECH': { description: 'Technical Services / Call Centre', rate_individual: 2, rate_company: 2, threshold: 30000, note: 'Reduced to 2% from FY 2020-21' },
  '194K':  { description: 'Income from Mutual Fund units', rate_individual: 10, rate_company: 10, threshold: 5000 },
  '194LA': { description: 'Compensation on compulsory acquisition', rate_individual: 10, rate_company: 10, threshold: 250000 },
  '194LB': { description: 'Interest from Infrastructure Debt Fund', rate_individual: 5, rate_company: 5, threshold: 0 },
  '194LC': { description: 'Interest — foreign currency borrowing', rate_individual: 5, rate_company: 5, threshold: 0 },
  '194M':  { description: 'Contractual/commission payments by individuals (>₹50L)', rate_individual: 5, rate_company: 5, threshold: 5000000 },
  '194N':  { description: 'Cash withdrawal > ₹1Cr', rate_individual: 2, rate_company: 2, threshold: 10000000 },
  '194O':  { description: 'E-commerce operator to e-commerce participant', rate_individual: 1, rate_company: 1, threshold: 500000 },
  '194P':  { description: 'Pension / Salary — senior citizens (bank deducts)', rate_individual: 0, rate_company: 0, threshold: 500000, note: 'Slab rate; bank deducts directly' },
  '194Q':  { description: 'Purchase of goods (buyer > ₹10Cr turnover)', rate_individual: 0.1, rate_company: 0.1, threshold: 5000000, note: 'Applies to buyer with >₹10Cr PY turnover' },
  '194R':  { description: 'Perquisites / benefits to business', rate_individual: 10, rate_company: 10, threshold: 20000 },
  '194S':  { description: 'Payment for virtual digital assets (crypto)', rate_individual: 1, rate_company: 1, threshold: 10000 },
  '195':   { description: 'Payments to non-residents', rate_individual: 0, rate_company: 0, threshold: 0, note: 'DTAA rate applies; consult for each case' },
  '206C':  { description: 'TCS — Timber / Tendu Leaves / Scrap / Minerals', rate_individual: 1, rate_company: 1, threshold: 0, note: 'Tax Collected at Source' },
}

router.get('/sections', (req, res) => {
  res.json(Object.entries(TDS_SECTIONS).map(([code, d]) => ({ code, ...d })))
})

router.post('/calculate', async (req, res) => {
  const { amount, section, party_type = 'company', pan_available = true, company_id, party_name } = req.body
  if (!amount || !section) return res.status(400).json({ error: 'amount and section required' })
  const sec = TDS_SECTIONS[section]
  if (!sec) return res.status(400).json({ error: `Invalid section. Valid: ${Object.keys(TDS_SECTIONS).join(', ')}` })

  const base_rate      = party_type === 'individual' ? sec.rate_individual : sec.rate_company
  // PAN not available → max(base_rate, 20%) per Sec 206AA
  const effective_rate = !pan_available ? Math.max(base_rate, 20) : base_rate
  const gross          = parseFloat(amount)
  const tds_amount     = Math.round((gross * effective_rate / 100) * 100) / 100

  // 194C aggregate check: if company_id and party_name provided, check FY aggregate
  let aggregate_info = null
  if (section === '194C' && company_id && party_name) {
    try {
      const fyStart = new Date().getMonth() >= 3
        ? `${new Date().getFullYear()}-04-01`
        : `${new Date().getFullYear()-1}-04-01`
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(gross_amount),0) as fy_aggregate FROM tds_entries
         WHERE company_id=$1 AND party_name=$2 AND section='194C' AND payment_date >= $3`,
        [company_id, party_name, fyStart]
      )
      const fy_total = parseFloat(rows[0].fy_aggregate || 0)
      aggregate_info = {
        fy_aggregate_so_far: fy_total,
        after_this_payment: fy_total + gross,
        aggregate_threshold: 100000,
        aggregate_crossed: (fy_total + gross) > 100000,
        per_payment_threshold: 30000,
        per_payment_crossed: gross > 30000,
        tds_triggered: gross > 30000 || (fy_total + gross) > 100000,
      }
    } catch (_) {}
  }

  res.json({
    section, description: sec.description, gross_amount: gross,
    tds_rate: effective_rate, tds_amount,
    net_payable: Math.round((gross - tds_amount) * 100) / 100,
    pan_available, threshold: sec.threshold, above_threshold: gross > sec.threshold,
    pan_note: !pan_available ? `PAN not available → rate = max(${base_rate}%, 20%) = ${effective_rate}% per Sec 206AA` : null,
    section_note: sec.note || null,
    aggregate_info,
  })
})

router.post('/entries', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { company_id, party_name, party_pan, section, gross_amount, tds_rate, tds_amount, payment_date, payment_nature, challan_no, deposited, deposit_date } = req.body
    if (!company_id || !party_name || !section || !gross_amount || !tds_amount || !payment_date)
      return res.status(400).json({ error: 'company_id, party_name, section, gross_amount, tds_amount, payment_date required' })

    const { rows } = await client.query(
      `INSERT INTO tds_entries(company_id,party_name,party_pan,section,gross_amount,tds_rate,tds_amount,net_amount,payment_date,payment_nature,challan_no,deposited,deposit_date,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [company_id, party_name, party_pan||null, section,
       gross_amount, tds_rate||0, tds_amount, parseFloat(gross_amount) - parseFloat(tds_amount),
       payment_date, payment_nature||null, challan_no||null, deposited||false, deposit_date||null, req.user.id]
    )

    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }

    // Pick expense account based on section
    let expCode = '5107' // Professional Fees default
    if (section === '194C' || section === '194M') expCode = '5003'        // Direct Labour / Contract
    if (section === '194I_LAND' || section === '194I_PLANT' || section === '194IB') expCode = '5102' // Rent
    if (section === '194H' || section === '194G') expCode = '5107'        // Commission → Misc Expense

    const tdsPayable = await getAcc('2005')
    const bankAcc    = await getAcc('1002')
    const expenseAcc = await getAcc(expCode)

    const { rows: countRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 AS next
       FROM journal_entries WHERE company_id=$1 FOR UPDATE`,
      [company_id]
    )
    const entryNum = `JE-${String(countRows[0].next).padStart(4, '0')}`

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,narration,is_posted,created_by)
       VALUES($1,$2,$3,'tds',$4,true,$5) RETURNING id`,
      [company_id, entryNum, payment_date,
       `TDS on ${payment_nature || TDS_SECTIONS[section]?.description || section} — ${party_name} — Sec ${section}`,
       req.user.id]
    )
    const jeId = je.rows[0].id

    const addLine = async (account_id, debit, credit, narration) => {
      if (!account_id || (debit === 0 && credit === 0)) return
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, debit||0, credit||0, narration]
      )
    }

    const net_paid = parseFloat(gross_amount) - parseFloat(tds_amount)
    await addLine(expenseAcc, gross_amount, 0, `${payment_nature || TDS_SECTIONS[section]?.description} — ${party_name}`)
    await addLine(tdsPayable, 0, tds_amount, `TDS @ ${tds_rate}% u/s ${section} — ${party_name}`)
    await addLine(bankAcc,    0, net_paid,   `Net payment to ${party_name}`)

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,'TDS_ENTRY_POSTED','tds_entries',$3,$4)`,
      [company_id, req.user.id, rows[0].id, JSON.stringify({ party_name, section, gross_amount, tds_amount, challan_no })]
    )

    await client.query('COMMIT')
    res.status(201).json({ entry: rows[0], journal_entry: entryNum })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

router.patch('/entries/:id/deposit', async (req, res) => {
  const { challan_no, deposit_date } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE tds_entries SET deposited=true, challan_no=COALESCE($1,challan_no), deposit_date=COALESCE($2,deposit_date) WHERE id=$3 RETURNING *`,
      [challan_no||null, deposit_date||null, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'TDS entry not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/entries', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query('SELECT * FROM tds_entries WHERE company_id=$1 ORDER BY payment_date DESC', [company_id])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/tds/aggregate-check?company_id=&party_name=&section=194C
// Check cumulative 194C payments to a party in current FY
router.get('/aggregate-check', async (req, res) => {
  const { company_id, party_name, section = '194C' } = req.query
  if (!company_id || !party_name) return res.status(400).json({ error: 'company_id and party_name required' })
  try {
    const fyStart = new Date().getMonth() >= 3
      ? `${new Date().getFullYear()}-04-01`
      : `${new Date().getFullYear()-1}-04-01`
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(gross_amount),0) as fy_aggregate, COUNT(*) as transaction_count
       FROM tds_entries WHERE company_id=$1 AND party_name=$2 AND section=$3 AND payment_date >= $4`,
      [company_id, party_name, section, fyStart]
    )
    const fy_total = parseFloat(rows[0].fy_aggregate || 0)
    const threshold = TDS_SECTIONS[section]?.aggregate_threshold || TDS_SECTIONS[section]?.threshold || 0
    res.json({
      party_name, section, fy_start: fyStart,
      fy_aggregate: fy_total, transaction_count: parseInt(rows[0].transaction_count),
      aggregate_threshold: threshold,
      remaining_before_tds: Math.max(0, threshold - fy_total),
      threshold_crossed: fy_total > threshold,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/summary', async (req, res) => {
  const { company_id, quarter, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  const quarterMonths = { Q1: [4,5,6], Q2: [7,8,9], Q3: [10,11,12], Q4: [1,2,3] }
  const months = quarter ? quarterMonths[quarter] : null
  try {
    let query = `SELECT section,payment_nature,COUNT(*) as transactions,
                 SUM(gross_amount) as total_gross,SUM(tds_amount) as total_tds,SUM(net_amount) as total_net,
                 COUNT(*) FILTER (WHERE deposited=true) as deposited_count,
                 COUNT(*) FILTER (WHERE deposited=false) as pending_deposit_count
                 FROM tds_entries WHERE company_id=$1`
    const params = [company_id]
    if (year)   { params.push(year);   query += ` AND EXTRACT(YEAR FROM payment_date)=$${params.length}` }
    if (months) { params.push(months); query += ` AND EXTRACT(MONTH FROM payment_date)=ANY($${params.length}::int[])` }
    query += ' GROUP BY section,payment_nature ORDER BY total_tds DESC'
    const { rows } = await pool.query(query, params)
    res.json({
      entries: rows,
      total_tds_deducted: rows.reduce((s,r) => s + parseFloat(r.total_tds||0), 0),
      total_pending_deposit: rows.reduce((s,r) => s + parseFloat(r.pending_deposit_count||0) * parseFloat(r.total_tds||0) / Math.max(parseInt(r.transactions),1), 0),
      quarter, year,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/export-return', async (req, res) => {
  const { company_id, quarter = 'Q4', year = new Date().getFullYear(), format = 'json' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  const quarterMonths = { Q1: [4,5,6], Q2: [7,8,9], Q3: [10,11,12], Q4: [1,2,3] }
  const months = quarterMonths[quarter] || quarterMonths['Q4']

  try {
    const { rows: compRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!compRows.length) return res.status(404).json({ error: 'Company not found' })
    const company = compRows[0]

    const { rows: entries } = await pool.query(
      `SELECT * FROM tds_entries WHERE company_id=$1
       AND EXTRACT(MONTH FROM payment_date)=ANY($2::int[])
       AND EXTRACT(YEAR FROM payment_date)=$3 ORDER BY payment_date ASC`,
      [company_id, months, year]
    )

    const deductees = entries.map((e, idx) => ({
      sr_no:          idx + 1,
      deductee_name:  e.party_name,
      deductee_pan:   e.party_pan || 'PANNOTAVBL',
      section:        e.section,
      payment_nature: e.payment_nature || TDS_SECTIONS[e.section]?.description || e.section,
      payment_date:   e.payment_date ? new Date(e.payment_date).toISOString().split('T')[0] : '',
      gross_amount:   parseFloat(e.gross_amount || 0),
      tds_rate:       parseFloat(e.tds_rate || 0),
      tds_amount:     parseFloat(e.tds_amount || 0),
      net_amount:     parseFloat(e.net_amount || 0),
      challan_no:     e.challan_no || '',
      deposited:      e.deposited || false,
      deposit_date:   e.deposit_date ? new Date(e.deposit_date).toISOString().split('T')[0] : '',
    }))

    const totalGross = entries.reduce((s,e) => s + parseFloat(e.gross_amount||0), 0)
    const totalTDS   = entries.reduce((s,e) => s + parseFloat(e.tds_amount||0), 0)
    const fyStr      = quarter === 'Q4' ? `${parseInt(year)-1}-${year}` : `${year}-${parseInt(year)+1}`

    const returnData = {
      form: '26Q', quarter, financial_year: fyStr,
      deductor: {
        name: company.name,
        tan:  company.tan || 'APPLY_FOR_TAN',
        gstin: company.gstin || '', pan: company.pan || '',
        address: company.address || '', state_code: company.state_code || '',
      },
      summary: {
        total_deductees: deductees.length,
        total_gross_paid: Math.round(totalGross * 100) / 100,
        total_tds_deducted: Math.round(totalTDS * 100) / 100,
        total_net_paid: Math.round((totalGross - totalTDS) * 100) / 100,
        pending_deposit: deductees.filter(d => !d.deposited).length,
      },
      deductee_details: deductees,
      generated_at: new Date().toISOString(),
    }

    if (format === 'csv') {
      const headers = ['Sr No','Deductee Name','PAN','Section','Payment Nature','Payment Date','Gross Amount','TDS Rate %','TDS Amount','Net Amount','Challan No','Deposited','Deposit Date']
      const csvRows = deductees.map(d => [
        d.sr_no, `"${d.deductee_name}"`, d.deductee_pan, d.section, `"${d.payment_nature}"`,
        d.payment_date, d.gross_amount.toFixed(2), d.tds_rate.toFixed(2),
        d.tds_amount.toFixed(2), d.net_amount.toFixed(2), d.challan_no, d.deposited, d.deposit_date,
      ])
      const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="TDS_26Q_${quarter}_${year}.csv"`)
      return res.send(csv)
    }

    res.json(returnData)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router