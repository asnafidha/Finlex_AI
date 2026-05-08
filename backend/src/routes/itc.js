const router = require('express').Router()
const pool = require('../config/db')
const auth = require('../middleware/auth')

router.use(auth)

// GET /api/itc/purchase-register?company_id=xxx&month=3&year=2025
router.get('/purchase-register', async (req, res) => {
  const { company_id, month, year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let query = `
      SELECT i.invoice_number,i.invoice_date,i.party_name,i.party_gstin,
             i.taxable_amount,i.cgst_amount,i.sgst_amount,i.igst_amount,
             i.cgst_amount+i.sgst_amount+i.igst_amount as total_itc,
             i.total_amount,i.status
      FROM invoices i
      WHERE i.company_id=$1 AND i.invoice_type='purchase' AND i.status!='cancelled'`
    const params = [company_id]
    if (month) { params.push(month); query += ` AND EXTRACT(MONTH FROM i.invoice_date)=$${params.length}` }
    if (year) { params.push(year); query += ` AND EXTRACT(YEAR FROM i.invoice_date)=$${params.length}` }
    query += ' ORDER BY i.invoice_date'
    const { rows } = await pool.query(query, params)
    const total_itc = rows.reduce((s, r) => s + parseFloat(r.total_itc || 0), 0)
    res.json({ invoices: rows, total_itc, count: rows.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/itc/reconcile — match GSTR-2B data against purchase register
router.post('/reconcile', async (req, res) => {
  const { company_id, month, year, gstr2b_data: rawGstr2b } = req.body
  if (!company_id || !rawGstr2b) return res.status(400).json({ error: 'company_id and gstr2b_data required' })
  try {
    // Normalise GSTR-2B JSON — GST portal exports a nested object, not a plain array.
    // Real format: { data: { docDetails: [ { itms:[{itm_det:{...}}] } ] } }
    // We flatten everything into a flat array of invoice-like objects.
    let gstr2b_data = []
    if (Array.isArray(rawGstr2b)) {
      // Already a flat array (legacy / manual paste)
      gstr2b_data = rawGstr2b
    } else if (rawGstr2b && typeof rawGstr2b === 'object') {
      // GST portal nested format
      const docDetails = rawGstr2b?.data?.docDetails
        || rawGstr2b?.docDetails
        || rawGstr2b?.data?.b2b
        || rawGstr2b?.b2b
        || []
      for (const supplier of docDetails) {
        const gstin = supplier.ctin || supplier.gstin || ''
        const docs = supplier.docs || supplier.itms || []
        for (const doc of docs) {
          // Handle both flat and itm_det style
          const det = doc.itm_det || doc
          gstr2b_data.push({
            invoice_number: doc.inum || doc.invoice_number || '',
            gstin,
            invoice_value: parseFloat(doc.val || doc.invoice_value || 0),
            itc_amount: parseFloat(det.elg_itc || det.itc_amount || (parseFloat(det.igst || 0) + parseFloat(det.cgst || 0) + parseFloat(det.sgst || 0))),
            igst: parseFloat(det.igst || 0),
            cgst: parseFloat(det.cgst || 0),
            sgst: parseFloat(det.sgst || 0),
          })
        }
      }
    }

    let query = `SELECT invoice_number,invoice_date,party_name,party_gstin,cgst_amount,sgst_amount,igst_amount,cgst_amount+sgst_amount+igst_amount as total_itc FROM invoices WHERE company_id=$1 AND invoice_type='purchase' AND status!='cancelled'`
    const params = [company_id]
    if (month) { params.push(month); query += ` AND EXTRACT(MONTH FROM invoice_date)=$${params.length}` }
    if (year) { params.push(year); query += ` AND EXTRACT(YEAR FROM invoice_date)=$${params.length}` }
    const { rows: ourInvoices } = await pool.query(query, params)

    // Normalize invoice number for robust matching (trim, uppercase, remove special chars)
    const normalize = (s) => (s || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

    const matched = [], mismatched = [], missing_in_2b = [], missing_in_books = []
    ourInvoices.forEach(ourInv => {
      const ourNorm = normalize(ourInv.invoice_number)
      const ourITC = parseFloat(ourInv.total_itc || 0)
      const match = gstr2b_data.find(g => {
        // Match 1: normalized invoice number exact match
        if (normalize(g.invoice_number) === ourNorm) return true
        // Match 2: GSTIN match + ITC amount tolerance ±5%
        if (g.gstin && ourInv.party_gstin && g.gstin === ourInv.party_gstin) {
          const gITC = parseFloat(g.itc_amount || 0)
          if (ourITC > 0 && gITC > 0 && Math.abs(gITC - ourITC) / ourITC < 0.05) return true
        }
        // Match 3: invoice_value match (legacy format)
        if (g.gstin === ourInv.party_gstin && Math.abs(parseFloat(g.invoice_value || 0) - ourITC) < 1) return true
        return false
      })
      if (match) {
        const diff = Math.abs(parseFloat(match.itc_amount || 0) - ourITC)
        if (diff < 1) matched.push({ ...ourInv, gstr2b: match, status: 'matched' })
        else mismatched.push({ ...ourInv, gstr2b: match, status: 'mismatch', difference: diff, our_itc: ourITC, gstr2b_itc: parseFloat(match.itc_amount || 0) })
      } else missing_in_2b.push({ ...ourInv, status: 'missing_in_2b', note: 'Vendor may not have filed return' })
    })
    gstr2b_data.forEach(g => {
      const gNorm = normalize(g.invoice_number)
      if (!ourInvoices.find(o => normalize(o.invoice_number) === gNorm))
        missing_in_books.push({ ...g, status: 'missing_in_books', note: 'Not recorded in your books' })
    })

    const ineligible_itc = missing_in_2b.reduce((s, r) => s + parseFloat(r.total_itc || 0), 0)

    res.json({
      summary: { total_our_invoices: ourInvoices.length, total_gstr2b_entries: gstr2b_data.length, matched: matched.length, mismatched: mismatched.length, missing_in_2b: missing_in_2b.length, missing_in_books: missing_in_books.length, our_total_itc: ourInvoices.reduce((s, r) => s + parseFloat(r.total_itc || 0), 0), eligible_itc: matched.reduce((s, r) => s + parseFloat(r.total_itc || 0), 0), ineligible_itc },
      matched, mismatched, missing_in_2b, missing_in_books
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router