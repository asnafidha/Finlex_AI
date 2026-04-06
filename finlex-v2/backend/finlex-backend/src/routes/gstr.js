const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

async function getSalesInvoices(company_id, month, year) {
  let query = `
    SELECT i.*,
      COALESCE(json_agg(json_build_object(
        'description',ii.description,'hsn_sac_code',ii.hsn_sac_code,
        'quantity',ii.quantity,'rate',ii.rate,
        'taxable_amount',ii.taxable_amount,'gst_rate',ii.gst_rate,
        'cgst_amount',ii.cgst_amount,'sgst_amount',ii.sgst_amount,
        'igst_amount',ii.igst_amount,'total_amount',ii.total_amount
      )) FILTER (WHERE ii.id IS NOT NULL), '[]') as items
    FROM invoices i
    LEFT JOIN invoice_items ii ON ii.invoice_id=i.id
    WHERE i.company_id=$1 AND i.invoice_type='sale' AND i.status!='cancelled'`
  const params = [company_id]
  if (month) { params.push(month); query += ` AND EXTRACT(MONTH FROM i.invoice_date)=$${params.length}` }
  if (year)  { params.push(year);  query += ` AND EXTRACT(YEAR FROM i.invoice_date)=$${params.length}` }
  query += ' GROUP BY i.id ORDER BY i.invoice_date'
  const { rows } = await pool.query(query, params)
  return rows
}

function formatB2B(inv) {
  return {
    gstin: inv.party_gstin, party_name: inv.party_name,
    invoice_number: inv.invoice_number, invoice_date: inv.invoice_date,
    invoice_value: parseFloat(inv.total_amount),
    place_of_supply: inv.party_state,
    taxable_value: parseFloat(inv.taxable_amount||0),
    cgst: parseFloat(inv.cgst_amount||0), sgst: parseFloat(inv.sgst_amount||0), igst: parseFloat(inv.igst_amount||0),
  }
}
function formatB2C(inv) {
  return {
    party_name: inv.party_name, invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date, invoice_value: parseFloat(inv.total_amount),
    place_of_supply: inv.party_state,
    taxable_value: parseFloat(inv.taxable_amount||0),
    cgst: parseFloat(inv.cgst_amount||0), sgst: parseFloat(inv.sgst_amount||0), igst: parseFloat(inv.igst_amount||0),
  }
}

// CGST Rule 88A: correct ITC utilization order
// Step 1: IGST ITC → offset IGST liability first, then CGST, then SGST
// Step 2: CGST ITC → offset CGST liability only (then remaining IGST)
// Step 3: SGST ITC → offset SGST liability only (then remaining IGST)
// Cross-utilization CGST ↔ SGST is NOT allowed
function computeITCUtilization(output_igst, output_cgst, output_sgst, itc_igst, itc_cgst, itc_sgst) {
  let rem_igst_out = output_igst, rem_cgst_out = output_cgst, rem_sgst_out = output_sgst
  let rem_igst_itc = itc_igst,   rem_cgst_itc = itc_cgst,   rem_sgst_itc = itc_sgst

  // Step 1: Use IGST ITC — against IGST first
  const igst_vs_igst = Math.min(rem_igst_itc, rem_igst_out)
  rem_igst_out -= igst_vs_igst; rem_igst_itc -= igst_vs_igst

  // Remaining IGST ITC → against CGST
  const igst_vs_cgst = Math.min(rem_igst_itc, rem_cgst_out)
  rem_cgst_out -= igst_vs_cgst; rem_igst_itc -= igst_vs_cgst

  // Remaining IGST ITC → against SGST
  const igst_vs_sgst = Math.min(rem_igst_itc, rem_sgst_out)
  rem_sgst_out -= igst_vs_sgst; rem_igst_itc -= igst_vs_sgst

  // Step 2: Use CGST ITC — against CGST only, then remaining IGST
  const cgst_vs_cgst = Math.min(rem_cgst_itc, rem_cgst_out)
  rem_cgst_out -= cgst_vs_cgst; rem_cgst_itc -= cgst_vs_cgst
  const cgst_vs_igst = Math.min(rem_cgst_itc, rem_igst_out)
  rem_igst_out -= cgst_vs_igst; rem_cgst_itc -= cgst_vs_igst

  // Step 3: Use SGST ITC — against SGST only, then remaining IGST
  const sgst_vs_sgst = Math.min(rem_sgst_itc, rem_sgst_out)
  rem_sgst_out -= sgst_vs_sgst; rem_sgst_itc -= sgst_vs_sgst
  const sgst_vs_igst = Math.min(rem_sgst_itc, rem_igst_out)
  rem_igst_out -= sgst_vs_igst; rem_sgst_itc -= sgst_vs_igst

  const total_output = output_igst + output_cgst + output_sgst
  const total_itc    = itc_igst + itc_cgst + itc_sgst
  const net_payable_igst = Math.max(0, rem_igst_out)
  const net_payable_cgst = Math.max(0, rem_cgst_out)
  const net_payable_sgst = Math.max(0, rem_sgst_out)
  const net_payable = net_payable_igst + net_payable_cgst + net_payable_sgst

  return {
    output: { igst: output_igst, cgst: output_cgst, sgst: output_sgst, total: total_output },
    itc_available: { igst: itc_igst, cgst: itc_cgst, sgst: itc_sgst, total: total_itc },
    itc_utilized: {
      igst: itc_igst - rem_igst_itc,
      cgst: itc_cgst - rem_cgst_itc,
      sgst: itc_sgst - rem_sgst_itc,
      total: total_itc - (rem_igst_itc + rem_cgst_itc + rem_sgst_itc),
    },
    itc_balance: { igst: rem_igst_itc, cgst: rem_cgst_itc, sgst: rem_sgst_itc },
    net_payable: { igst: net_payable_igst, cgst: net_payable_cgst, sgst: net_payable_sgst, total: net_payable },
    rule_88a_applied: true,
    note: 'ITC utilization as per CGST Rule 88A: IGST→IGST→CGST→SGST; CGST→CGST→IGST; SGST→SGST→IGST. Cross-utilization CGST↔SGST not allowed.',
  }
}

// Compute GST late fee per CGST Act
function computeLateFee(due_date_str, filing_date_str, is_nil_return, tax_due) {
  const due  = new Date(due_date_str)
  const filed = filing_date_str ? new Date(filing_date_str) : new Date()
  if (filed <= due) return { late_fee_cgst: 0, late_fee_sgst: 0, interest: 0, total: 0, days_late: 0 }
  const days_late = Math.ceil((filed - due) / (1000 * 60 * 60 * 24))

  // Late fee: ₹50/day (₹25 CGST + ₹25 SGST), max ₹10,000 (₹5,000 each)
  // NIL return: ₹20/day (₹10 CGST + ₹10 SGST), max ₹500 (₹250 each)
  const daily = is_nil_return ? 20 : 50
  const cap   = is_nil_return ? 500 : 10000
  const late_fee_total = Math.min(days_late * daily, cap)
  const late_fee_cgst  = late_fee_total / 2
  const late_fee_sgst  = late_fee_total / 2

  // 18% p.a. interest on unpaid tax (simple interest, not compound)
  const interest = tax_due > 0 ? Math.round(tax_due * 0.18 * days_late / 365) : 0

  return { days_late, late_fee_cgst, late_fee_sgst, late_fee_total, interest, total: late_fee_total + interest }
}

// GET /api/gstr/gstr1?company_id=xxx&month=3&year=2025&filer_type=monthly
router.get('/gstr1', async (req, res) => {
  const { company_id, month, year, filer_type = 'monthly' } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })
    const company  = coRows[0]
    const invoices = await getSalesInvoices(company_id, month, year)

    // B2B: has GSTIN
    const b2b  = invoices.filter(i => i.party_gstin)
    // B2CS: no GSTIN, invoice value ≤ ₹2,50,000 (intra-state or inter-state)
    const b2cs = invoices.filter(i => !i.party_gstin && parseFloat(i.total_amount) <= 250000)
    // B2CL: no GSTIN, invoice value > ₹2,50,000 (inter-state only per GST rules)
    const b2cl = invoices.filter(i => !i.party_gstin && parseFloat(i.total_amount) > 250000)

    // Also include credit notes if any
    const { rows: creditNotes } = await pool.query(
      `SELECT * FROM credit_debit_notes WHERE company_id=$1 AND note_type='credit'
       ${month ? `AND EXTRACT(MONTH FROM note_date)=${month}` : ''}
       ${year  ? `AND EXTRACT(YEAR FROM note_date)=${year}`   : ''}`,
      [company_id]
    )

    // HSN Summary (from invoice items only, excl cancelled)
    const hsnMap = {}
    invoices.forEach(inv => {
      if (!inv.items || inv.items === '[]') return
      const items = Array.isArray(inv.items) ? inv.items : JSON.parse(inv.items)
      items.forEach(item => {
        const key = item.hsn_sac_code || 'UNKNOWN'
        if (!hsnMap[key]) hsnMap[key] = { hsn_sac_code: key, description: item.description, uqc: 'NOS', total_quantity: 0, total_value: 0, taxable_value: 0, cgst: 0, sgst: 0, igst: 0 }
        hsnMap[key].total_quantity += parseFloat(item.quantity || 0)
        hsnMap[key].total_value    += parseFloat(item.total_amount || 0)
        hsnMap[key].taxable_value  += parseFloat(item.taxable_amount || 0)
        hsnMap[key].cgst           += parseFloat(item.cgst_amount || 0)
        hsnMap[key].sgst           += parseFloat(item.sgst_amount || 0)
        hsnMap[key].igst           += parseFloat(item.igst_amount || 0)
      })
    })

    const summary = {
      total_invoices: invoices.length,
      total_taxable:  invoices.reduce((s,i) => s + parseFloat(i.taxable_amount||0), 0),
      total_cgst:     invoices.reduce((s,i) => s + parseFloat(i.cgst_amount||0), 0),
      total_sgst:     invoices.reduce((s,i) => s + parseFloat(i.sgst_amount||0), 0),
      total_igst:     invoices.reduce((s,i) => s + parseFloat(i.igst_amount||0), 0),
      total_value:    invoices.reduce((s,i) => s + parseFloat(i.total_amount||0), 0),
    }

    // Due date based on filer type
    // Monthly filer: 11th of following month
    // QRMP quarterly filer: 13th of month after quarter end
    let due_date = null
    if (month && year) {
      const dueMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1
      const dueYear  = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year)
      const dueDay   = filer_type === 'qrmp' ? 13 : 11
      due_date = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${dueDay}`
    }

    res.json({
      gstin: company.gstin, company: company.name,
      period: { month, year }, filer_type, due_date,
      summary, b2b: b2b.map(formatB2B), b2cs: b2cs.map(formatB2C), b2cl: b2cl.map(formatB2C),
      credit_notes: creditNotes.map(n => ({
        note_number: n.note_number, note_date: n.note_date, party_name: n.party_name,
        party_gstin: n.party_gstin, total_amount: n.total_amount,
        cgst: n.cgst_amount, sgst: n.sgst_amount, igst: n.igst_amount,
      })),
      hsn_summary: Object.values(hsnMap),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/gstr/gstr3b?company_id=xxx&month=3&year=2025&filing_date=2025-04-25
router.get('/gstr3b', async (req, res) => {
  const { company_id, month, year, filing_date } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })

    let where = `WHERE company_id=$1 AND status!='cancelled'`
    const params = [company_id]
    if (month) { params.push(month); where += ` AND EXTRACT(MONTH FROM invoice_date)=$${params.length}` }
    if (year)  { params.push(year);  where += ` AND EXTRACT(YEAR FROM invoice_date)=$${params.length}` }

    const { rows: sales }     = await pool.query(
      `SELECT COALESCE(SUM(taxable_amount),0) as taxable,
              COALESCE(SUM(cgst_amount),0) as cgst,
              COALESCE(SUM(sgst_amount),0) as sgst,
              COALESCE(SUM(igst_amount),0) as igst
       FROM invoices ${where} AND invoice_type='sale'`, params
    )
    const { rows: purchases } = await pool.query(
      `SELECT COALESCE(SUM(cgst_amount),0) as cgst_itc,
              COALESCE(SUM(sgst_amount),0) as sgst_itc,
              COALESCE(SUM(igst_amount),0) as igst_itc
       FROM invoices ${where} AND invoice_type='purchase'`, params
    )

    const out_igst = parseFloat(sales[0].igst || 0)
    const out_cgst = parseFloat(sales[0].cgst || 0)
    const out_sgst = parseFloat(sales[0].sgst || 0)
    const itc_igst = parseFloat(purchases[0].igst_itc || 0)
    const itc_cgst = parseFloat(purchases[0].cgst_itc || 0)
    const itc_sgst = parseFloat(purchases[0].sgst_itc || 0)

    // Apply correct ITC utilization order per Rule 88A
    const itc = computeITCUtilization(out_igst, out_cgst, out_sgst, itc_igst, itc_cgst, itc_sgst)

    // Due date: 20th of following month for GSTR-3B
    let due_date = null, late_fee_info = null
    if (month && year) {
      const dueMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1
      const dueYear  = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year)
      due_date = `${dueYear}-${String(dueMonth).padStart(2,'0')}-20`

      const is_nil = (out_igst + out_cgst + out_sgst) === 0
      late_fee_info = computeLateFee(due_date, filing_date || null, is_nil, itc.net_payable.total)
    }

    res.json({
      gstin: coRows[0].gstin, company: coRows[0].name,
      period: { month, year }, due_date,
      outward_supplies: {
        taxable_value: parseFloat(sales[0].taxable || 0),
        cgst: out_cgst, sgst: out_sgst, igst: out_igst,
        total_tax: out_igst + out_cgst + out_sgst,
      },
      itc_utilization: itc,
      // Backward compat
      itc_available: itc.itc_available,
      tax_payable: { output_tax: out_igst+out_cgst+out_sgst, itc_utilized: itc.itc_utilized.total, net_payable: itc.net_payable.total },
      late_fee: late_fee_info,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/gstr/late-fee?company_id=&type=gstr3b&month=&year=&filing_date=
router.get('/late-fee', async (req, res) => {
  const { company_id, type = 'gstr3b', month, year, filing_date } = req.query
  if (!company_id || !month || !year) return res.status(400).json({ error: 'company_id, month, year required' })
  try {
    const m = parseInt(month), y = parseInt(year)
    const dueMonth = m === 12 ? 1 : m + 1
    const dueYear  = m === 12 ? y + 1 : y
    const dueDay   = type === 'gstr1' ? 11 : 20
    const due_date = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${dueDay}`

    // Check if NIL return (no sales in the month)
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) as total FROM invoices
       WHERE company_id=$1 AND invoice_type='sale' AND status!='cancelled'
       AND EXTRACT(MONTH FROM invoice_date)=$2 AND EXTRACT(YEAR FROM invoice_date)=$3`,
      [company_id, month, year]
    )
    const total_sales = parseFloat(rows[0].total || 0)
    const is_nil = total_sales === 0

    // Tax due (for GSTR-3B interest calculation)
    let tax_due = 0
    if (type === 'gstr3b') {
      const { rows: taxRows } = await pool.query(
        `SELECT COALESCE(SUM(cgst_amount+sgst_amount+igst_amount),0) as output_tax FROM invoices
         WHERE company_id=$1 AND invoice_type='sale' AND status!='cancelled'
         AND EXTRACT(MONTH FROM invoice_date)=$2 AND EXTRACT(YEAR FROM invoice_date)=$3`,
        [company_id, month, year]
      )
      tax_due = parseFloat(taxRows[0].output_tax || 0)
    }

    const fee = computeLateFee(due_date, filing_date || null, is_nil, tax_due)
    res.json({ return_type: type, period: { month, year }, due_date, is_nil_return: is_nil, ...fee })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/export-json', async (req, res) => {
  const { company_id, type, month, year } = req.query
  if (!company_id || !type) return res.status(400).json({ error: 'company_id and type required' })
  if (!['gstr1','gstr3b'].includes(type)) return res.status(400).json({ error: 'type must be gstr1 or gstr3b' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })
    const invoices = await getSalesInvoices(company_id, month, year)
    const b2b  = invoices.filter(i => i.party_gstin)
    const b2cs = invoices.filter(i => !i.party_gstin && parseFloat(i.total_amount) <= 250000)
    const data = {
      gstin: coRows[0].gstin, company: coRows[0].name, period: { month, year },
      b2b: b2b.map(formatB2B), b2cs: b2cs.map(formatB2C),
      summary: { total_invoices: invoices.length, total_value: invoices.reduce((s,i) => s + parseFloat(i.total_amount||0), 0) }
    }
    const filename = `${type}_${year||'all'}_${month ? String(month).padStart(2,'0') : 'all'}_${coRows[0].gstin||'export'}.json`
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/export-csv', async (req, res) => {
  const { company_id, type = 'gstr1', month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const invoices = await getSalesInvoices(company_id, month, year)
    let csv = 'Invoice No,Invoice Date,Party Name,GSTIN,Place of Supply,Taxable Value,CGST,SGST,IGST,Invoice Value\n'
    invoices.forEach(inv => {
      csv += [inv.invoice_number, new Date(inv.invoice_date).toLocaleDateString('en-IN'),
              `"${inv.party_name}"`, inv.party_gstin||'', inv.party_state||'',
              inv.taxable_amount, inv.cgst_amount||0, inv.sgst_amount||0, inv.igst_amount||0, inv.total_amount
             ].join(',') + '\n'
    })
    const filename = `${type}_${year||'all'}_${month ? String(month).padStart(2,'0') : 'all'}.csv`
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router