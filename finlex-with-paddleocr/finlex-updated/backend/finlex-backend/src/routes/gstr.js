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
    taxable_value: parseFloat(inv.taxable_amount||0),
    cgst: parseFloat(inv.cgst_amount||0), sgst: parseFloat(inv.sgst_amount||0), igst: parseFloat(inv.igst_amount||0),
  }
}

// GET /api/gstr/gstr1?company_id=xxx&month=3&year=2025
router.get('/gstr1', async (req, res) => {
  const { company_id, month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })
    const company  = coRows[0]
    const invoices = await getSalesInvoices(company_id, month, year)
    const b2b  = invoices.filter(i => i.party_gstin)
    const b2c  = invoices.filter(i => !i.party_gstin && parseFloat(i.total_amount)<=250000)
    const b2cl = invoices.filter(i => !i.party_gstin && parseFloat(i.total_amount)>250000)

    // HSN Summary
    const hsnMap = {}
    invoices.forEach(inv => {
      if (!inv.items || inv.items === '[]') return
      const items = Array.isArray(inv.items) ? inv.items : JSON.parse(inv.items)
      items.forEach(item => {
        const key = item.hsn_sac_code || 'UNKNOWN'
        if (!hsnMap[key]) hsnMap[key] = { hsn_sac_code:key, description:item.description, uqc:'NOS', total_quantity:0, total_value:0, taxable_value:0, cgst:0, sgst:0, igst:0 }
        hsnMap[key].total_quantity += parseFloat(item.quantity||0)
        hsnMap[key].total_value    += parseFloat(item.total_amount||0)
        hsnMap[key].taxable_value  += parseFloat(item.taxable_amount||0)
        hsnMap[key].cgst           += parseFloat(item.cgst_amount||0)
        hsnMap[key].sgst           += parseFloat(item.sgst_amount||0)
        hsnMap[key].igst           += parseFloat(item.igst_amount||0)
      })
    })

    const summary = {
      total_invoices: invoices.length,
      total_taxable:  invoices.reduce((s,i)=>s+parseFloat(i.taxable_amount||0),0),
      total_cgst:     invoices.reduce((s,i)=>s+parseFloat(i.cgst_amount||0),0),
      total_sgst:     invoices.reduce((s,i)=>s+parseFloat(i.sgst_amount||0),0),
      total_igst:     invoices.reduce((s,i)=>s+parseFloat(i.igst_amount||0),0),
      total_value:    invoices.reduce((s,i)=>s+parseFloat(i.total_amount||0),0),
    }

    res.json({ gstin:company.gstin, company:company.name, period:{month,year}, summary, b2b:b2b.map(formatB2B), b2c:b2c.map(formatB2C), b2cl:b2cl.map(formatB2C), hsn_summary:Object.values(hsnMap) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/gstr/gstr3b?company_id=xxx&month=3&year=2025
router.get('/gstr3b', async (req, res) => {
  const { company_id, month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })
    let where = `WHERE company_id=$1 AND status!='cancelled'`
    const params = [company_id]
    if (month) { params.push(month); where += ` AND EXTRACT(MONTH FROM invoice_date)=$${params.length}` }
    if (year)  { params.push(year);  where += ` AND EXTRACT(YEAR FROM invoice_date)=$${params.length}` }
    const { rows: sales }     = await pool.query(`SELECT COALESCE(SUM(taxable_amount),0) as taxable,COALESCE(SUM(cgst_amount),0) as cgst,COALESCE(SUM(sgst_amount),0) as sgst,COALESCE(SUM(igst_amount),0) as igst FROM invoices ${where} AND invoice_type='sale'`, params)
    const { rows: purchases } = await pool.query(`SELECT COALESCE(SUM(cgst_amount),0) as cgst_itc,COALESCE(SUM(sgst_amount),0) as sgst_itc,COALESCE(SUM(igst_amount),0) as igst_itc FROM invoices ${where} AND invoice_type='purchase'`, params)
    const output_tax = parseFloat(sales[0].cgst||0)+parseFloat(sales[0].sgst||0)+parseFloat(sales[0].igst||0)
    const itc_total  = parseFloat(purchases[0].cgst_itc||0)+parseFloat(purchases[0].sgst_itc||0)+parseFloat(purchases[0].igst_itc||0)
    res.json({
      gstin:coRows[0].gstin, company:coRows[0].name, period:{month,year},
      outward_supplies:{ taxable_value:parseFloat(sales[0].taxable||0), cgst:parseFloat(sales[0].cgst||0), sgst:parseFloat(sales[0].sgst||0), igst:parseFloat(sales[0].igst||0), total_tax:output_tax },
      itc_available:{ cgst:parseFloat(purchases[0].cgst_itc||0), sgst:parseFloat(purchases[0].sgst_itc||0), igst:parseFloat(purchases[0].igst_itc||0), total_itc:itc_total },
      tax_payable:{ output_tax, itc_utilized:Math.min(itc_total,output_tax), net_payable:Math.max(0,output_tax-itc_total) },
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/gstr/export-json?company_id=xxx&type=gstr1&month=3&year=2025
router.get('/export-json', async (req, res) => {
  const { company_id, type, month, year } = req.query
  if (!company_id || !type) return res.status(400).json({ error: 'company_id and type required' })
  if (!['gstr1','gstr3b'].includes(type)) return res.status(400).json({ error: 'type must be gstr1 or gstr3b' })
  try {
    const { rows: coRows } = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id])
    if (!coRows.length) return res.status(404).json({ error: 'Company not found' })
    const invoices = await getSalesInvoices(company_id, month, year)
    const b2b  = invoices.filter(i=>i.party_gstin)
    const b2c  = invoices.filter(i=>!i.party_gstin&&parseFloat(i.total_amount)<=250000)
    const data = {
      gstin:coRows[0].gstin, company:coRows[0].name, period:{month,year},
      b2b:b2b.map(formatB2B), b2c:b2c.map(formatB2C),
      summary:{ total_invoices:invoices.length, total_value:invoices.reduce((s,i)=>s+parseFloat(i.total_amount||0),0) }
    }
    const filename = `${type}_${year||'all'}_${month?String(month).padStart(2,'0'):'all'}_${coRows[0].gstin||'export'}.json`
    res.setHeader('Content-Type','application/json')
    res.setHeader('Content-Disposition',`attachment; filename="${filename}"`)
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/gstr/export-csv
router.get('/export-csv', async (req, res) => {
  const { company_id, type='gstr1', month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const invoices = await getSalesInvoices(company_id, month, year)
    let csv = 'Invoice No,Invoice Date,Party Name,GSTIN,Place of Supply,Taxable Value,CGST,SGST,IGST,Invoice Value\n'
    invoices.forEach(inv => {
      csv += [inv.invoice_number, new Date(inv.invoice_date).toLocaleDateString('en-IN'), `"${inv.party_name}"`, inv.party_gstin||'', inv.party_state||'', inv.taxable_amount, inv.cgst_amount||0, inv.sgst_amount||0, inv.igst_amount||0, inv.total_amount].join(',') + '\n'
    })
    const filename = `${type}_${year||'all'}_${month?String(month).padStart(2,'0'):'all'}.csv`
    res.setHeader('Content-Type','text/csv')
    res.setHeader('Content-Disposition',`attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router