const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

const VALID_STATE_CODES = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37']

// GET /api/credit-notes?company_id=xxx&note_type=credit
router.get('/', async (req, res) => {
  const { company_id, note_type } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = `SELECT n.*, COUNT(ni.id) as item_count FROM credit_debit_notes n LEFT JOIN credit_debit_note_items ni ON ni.note_id=n.id WHERE n.company_id=$1`
    const params = [company_id]
    if (note_type) { params.push(note_type); q += ` AND n.note_type=$${params.length}` }
    q += ' GROUP BY n.id ORDER BY n.note_date DESC'
    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/credit-notes/:id
router.get('/:id', async (req, res) => {
  try {
    // FIX: Validate CA has access to the company this note belongs to
    const note = await pool.query(
      `SELECT n.* FROM credit_debit_notes n
       WHERE n.id=$1 AND n.company_id IN (
         SELECT company_id FROM ca_company_access WHERE ca_id=$2
         UNION SELECT id FROM companies WHERE created_by=$2
       )`,
      [req.params.id, req.user.id]
    )
    if (!note.rows.length) return res.status(404).json({ error: 'Note not found' })
    const items = await pool.query('SELECT * FROM credit_debit_note_items WHERE note_id=$1', [req.params.id])
    res.json({ ...note.rows[0], items: items.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/credit-notes
router.post('/', async (req, res) => {
  const { company_id, note_type, note_number, note_date, original_invoice_id, original_invoice_number, party_name, party_gstin, party_state, reason, items } = req.body

  if (!company_id || !note_type || !note_number || !note_date || !party_name || !items?.length)
    return res.status(400).json({ error: 'company_id, note_type, note_number, note_date, party_name, items required' })

  if (!['credit', 'debit'].includes(note_type))
    return res.status(400).json({ error: 'note_type must be credit or debit' })

  // CGST Act Sec 34: credit note must be issued before Sep 30 of following FY
  // or date of annual return (whichever is earlier)
  if (note_type === 'credit' && original_invoice_id) {
    const noteDate = new Date(note_date)
    const noteYear = noteDate.getFullYear()
    const noteMonth = noteDate.getMonth() + 1 // 1-12
    // Find the FY of the original invoice
    try {
      const { rows: invRows } = await pool.query('SELECT invoice_date FROM invoices WHERE id=$1', [original_invoice_id])
      if (invRows.length) {
        const invDate = new Date(invRows[0].invoice_date)
        const invFyEnd = invDate.getMonth() >= 3 ? invDate.getFullYear() + 1 : invDate.getFullYear()
        // Time limit: Sep 30 of following FY (invFyEnd + 1 year, month Sep)
        const timeLimit = new Date(`${invFyEnd}-09-30`)
        if (noteDate > timeLimit) {
          return res.status(400).json({
            error: `Credit note time limit exceeded. Per CGST Act Sec 34, credit note for invoices in FY ${invFyEnd-1}-${String(invFyEnd).slice(2)} must be issued by ${timeLimit.toLocaleDateString('en-IN')}. Note date: ${noteDate.toLocaleDateString('en-IN')}.`
          })
        }
      }
    } catch (_) {} // Don't block if check fails
  }

  const company = await pool.query('SELECT state_code FROM companies WHERE id=$1', [company_id])
  if (!company.rows.length) return res.status(404).json({ error: 'Company not found' })
  const companyState = company.rows[0].state_code
  const isInterState = party_state && companyState && party_state !== companyState

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0

    const processedItems = items.map(item => {
      const taxable = Math.round(parseFloat(item.quantity) * parseFloat(item.rate) * 100) / 100
      const gstRate = parseFloat(item.gst_rate || 18)
      const igst    = isInterState ? Math.round(taxable * gstRate) / 100 : 0
      const cgst    = !isInterState ? Math.round(taxable * gstRate / 2) / 100 : 0
      const sgst    = !isInterState ? Math.round(taxable * gstRate / 2) / 100 : 0
      const total   = Math.round((taxable + igst + cgst + sgst) * 100) / 100
      subtotal  = Math.round((subtotal  + taxable) * 100) / 100
      totalCgst = Math.round((totalCgst + cgst)    * 100) / 100
      totalSgst = Math.round((totalSgst + sgst)    * 100) / 100
      totalIgst = Math.round((totalIgst + igst)    * 100) / 100
      return { ...item, taxable_amount: taxable, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst, total_amount: total, gst_rate: gstRate }
    })

    const totalAmount = subtotal + totalCgst + totalSgst + totalIgst

    const { rows: [note] } = await client.query(
      `INSERT INTO credit_debit_notes(company_id,note_type,note_number,note_date,original_invoice_id,original_invoice_number,party_name,party_gstin,party_state,reason,subtotal,taxable_amount,cgst_amount,sgst_amount,igst_amount,total_amount,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [company_id, note_type, note_number, note_date, original_invoice_id||null, original_invoice_number||null,
       party_name, party_gstin||null, party_state||companyState, reason||null,
       subtotal, subtotal, totalCgst, totalSgst, totalIgst, totalAmount, req.user.id]
    )

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO credit_debit_note_items(note_id,description,hsn_sac_code,quantity,unit,rate,taxable_amount,gst_rate,cgst_amount,sgst_amount,igst_amount,total_amount)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [note.id, item.description, item.hsn_sac_code||null, item.quantity, item.unit||'NOS',
         item.rate, item.taxable_amount, item.gst_rate, item.cgst_amount, item.sgst_amount, item.igst_amount, item.total_amount]
      )
    }

    // Journal entry: Credit Note on sale reduces AR and reverses GST
    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }
    const { rows: countRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 AS next
       FROM journal_entries WHERE company_id=$1 FOR UPDATE`,
      [company_id]
    )
    const entryNum = `JE-${String(countRows[0].next).padStart(4, '0')}`
    const isCredit = note_type === 'credit'

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
       VALUES($1,$2,$3,'credit_note',$4,$5,true,$6) RETURNING id`,
      [company_id, entryNum, note_date, note.id,
       `${isCredit ? 'Credit' : 'Debit'} Note ${note_number} — ${party_name}${reason ? ' — '+reason : ''}`, req.user.id]
    )
    const jeId = je.rows[0].id

    const addLine = async (account_id, debit, credit, narr) => {
      if (!account_id) return
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, debit||0, credit||0, narr]
      )
    }

    if (isCredit) {
      // Credit note on sale: Dr Sales Returns, Dr Output GST, Cr AR
      const salesReturns = await getAcc('4003')
      const cgstPayable  = await getAcc('2002')
      const sgstPayable  = await getAcc('2003')
      const igstPayable  = await getAcc('2004')
      const receivable   = await getAcc('1003')
      await addLine(salesReturns, subtotal, 0, 'Sales returns / credit note')
      if (totalCgst > 0) await addLine(cgstPayable, totalCgst, 0, 'CGST reversed on credit note')
      if (totalSgst > 0) await addLine(sgstPayable, totalSgst, 0, 'SGST reversed on credit note')
      if (totalIgst > 0) await addLine(igstPayable, totalIgst, 0, 'IGST reversed on credit note')
      await addLine(receivable, 0, totalAmount, 'AR reduced by credit note')
    } else {
      // Debit note on purchase: Dr AP, Cr Purchase Returns, Cr Input GST
      const payable       = await getAcc('2001')
      const purchReturns  = await getAcc('5002')
      const cgstInput     = await getAcc('1004')
      const sgstInput     = await getAcc('1005')
      const igstInput     = await getAcc('1006')
      await addLine(payable, totalAmount, 0, 'AP reduced by debit note')
      await addLine(purchReturns, 0, subtotal, 'Purchase returns / debit note')
      if (totalCgst > 0) await addLine(cgstInput, 0, totalCgst, 'CGST input reversed')
      if (totalSgst > 0) await addLine(sgstInput, 0, totalSgst, 'SGST input reversed')
      if (totalIgst > 0) await addLine(igstInput, 0, totalIgst, 'IGST input reversed')
    }

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,$3,'credit_debit_notes',$4,$5)`,
      [company_id, req.user.id, isCredit ? 'CREDIT_NOTE_CREATED' : 'DEBIT_NOTE_CREATED', note.id,
       JSON.stringify({ note_number, note_type, party_name, total_amount: totalAmount })]
    )

    await client.query('COMMIT')
    res.status(201).json({ ...note, items: processedItems })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(400).json({ error: `Note number "${note_number}" already exists` })
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

module.exports = router