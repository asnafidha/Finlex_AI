const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

const VALID_STATE_CODES = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37']

async function auditLog(client, company_id, user_id, action, table_name, record_id, old_values, new_values, ip) {
  try {
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,old_values,new_values,ip_address)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [company_id, user_id, action, table_name, record_id,
       old_values ? JSON.stringify(old_values) : null,
       new_values ? JSON.stringify(new_values) : null,
       ip || null]
    )
  } catch (_) {}
}

router.get('/', async (req, res) => {
  const { company_id, invoice_type } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let query = `SELECT i.*, COUNT(ii.id) as item_count FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id=i.id WHERE i.company_id=$1`
    const params = [company_id]
    if (invoice_type) { params.push(invoice_type); query += ` AND i.invoice_type=$${params.length}` }
    query += ' GROUP BY i.id ORDER BY i.invoice_date DESC'
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const inv = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id])
    if (!inv.rows.length) return res.status(404).json({ error: 'Invoice not found' })
    const items = await pool.query('SELECT * FROM invoice_items WHERE invoice_id=$1', [req.params.id])
    res.json({ ...inv.rows[0], items: items.rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  const { company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_address, party_state, items, notes, tds_section, tds_amount: tds_amount_input } = req.body

  if (!company_id || !invoice_type || !invoice_number || !invoice_date || !party_name || !items?.length)
    return res.status(400).json({ error: 'Missing required fields: company_id, invoice_type, invoice_number, invoice_date, party_name, items' })

  if (!['sale','purchase'].includes(invoice_type))
    return res.status(400).json({ error: 'invoice_type must be sale or purchase' })

  if (party_state && !VALID_STATE_CODES.includes(party_state))
    return res.status(400).json({ error: `Invalid state code: ${party_state}` })

  const company = await pool.query('SELECT state_code FROM companies WHERE id=$1', [company_id])
  if (!company.rows.length) return res.status(404).json({ error: 'Company not found' })
  const companyState = company.rows[0].state_code

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0
    const isInterState = party_state && companyState && party_state !== companyState

    const processedItems = items.map(item => {
      const taxable = parseFloat(item.quantity) * parseFloat(item.rate)
      const gstRate = parseFloat(item.gst_rate || 18)
      const igst    = isInterState ? (taxable * gstRate) / 100 : 0
      const cgst    = !isInterState ? (taxable * gstRate) / 200 : 0
      const sgst    = !isInterState ? (taxable * gstRate) / 200 : 0
      const total   = taxable + igst + cgst + sgst
      subtotal += taxable; totalCgst += cgst; totalSgst += sgst; totalIgst += igst
      return {
        description: item.description, hsn_sac_code: item.hsn_sac_code || null,
        quantity: parseFloat(item.quantity), unit: item.unit || 'NOS',
        rate: parseFloat(item.rate), taxable_amount: taxable, gst_rate: gstRate,
        cgst_rate: isInterState ? 0 : gstRate/2, sgst_rate: isInterState ? 0 : gstRate/2,
        igst_rate: isInterState ? gstRate : 0,
        cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst, total_amount: total
      }
    })

    const totalAmount    = subtotal + totalCgst + totalSgst + totalIgst
    const tdsAmountFinal = parseFloat(tds_amount_input || 0)

    const inv = await client.query(
      `INSERT INTO invoices
       (company_id,invoice_type,invoice_number,invoice_date,due_date,
        party_name,party_gstin,party_address,party_state,
        subtotal,taxable_amount,cgst_amount,sgst_amount,igst_amount,
        total_amount,notes,status,payment_status,tds_section,tds_amount)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'confirmed','unpaid',$17,$18)
       RETURNING *`,
      [company_id, invoice_type, invoice_number, invoice_date, due_date||null,
       party_name, party_gstin||null, party_address||null, party_state||companyState,
       subtotal, subtotal /* taxable_amount = subtotal */, totalCgst, totalSgst, totalIgst, totalAmount, notes||null,
       tds_section||null, tdsAmountFinal||null]
    )
    const invoice = inv.rows[0]

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO invoice_items(invoice_id,description,hsn_sac_code,quantity,unit,rate,taxable_amount,gst_rate,cgst_rate,sgst_rate,igst_rate,cgst_amount,sgst_amount,igst_amount,total_amount)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [invoice.id, item.description, item.hsn_sac_code, item.quantity, item.unit, item.rate,
         item.taxable_amount, item.gst_rate, item.cgst_rate, item.sgst_rate, item.igst_rate,
         item.cgst_amount, item.sgst_amount, item.igst_amount, item.total_amount]
      )
    }

    await createJournal(client, company_id, invoice, totalCgst, totalSgst, totalIgst, req.user.id, tdsAmountFinal, tds_section)

    // Full audit log for invoice creation
    await auditLog(client, company_id, req.user.id, 'INVOICE_CREATED', 'invoices', invoice.id, null,
      { invoice_number, invoice_type, party_name, total_amount: totalAmount, tds_amount: tdsAmountFinal },
      req.ip)

    await client.query('COMMIT')
    res.status(201).json({ ...invoice, items: processedItems })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(400).json({ error: `Invoice number "${invoice_number}" already exists` })
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

router.patch('/:id/cancel', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: invRows } = await client.query('SELECT * FROM invoices WHERE id=$1', [req.params.id])
    if (!invRows.length) return res.status(404).json({ error: 'Invoice not found' })
    const invoice = invRows[0]

    if (invoice.status === 'cancelled')
      return res.status(400).json({ error: 'Invoice already cancelled' })
    if (invoice.payment_status === 'paid')
      return res.status(400).json({ error: 'Cannot cancel a paid invoice. Reverse the payment first.' })

    await client.query(`UPDATE invoices SET status='cancelled', updated_at=NOW() WHERE id=$1`, [invoice.id])

    const { rows: jeRows } = await client.query(
      `SELECT id, entry_number FROM journal_entries WHERE reference_id=$1 AND reference_type='invoice' AND company_id=$2`,
      [invoice.id, invoice.company_id]
    )

    if (jeRows.length > 0) {
      const { rows: lines } = await client.query(
        `SELECT * FROM journal_entry_lines WHERE journal_entry_id=$1`, [jeRows[0].id]
      )
      const { rows: countRows } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [invoice.company_id])
      const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`
      const { rows: [revJe] } = await client.query(
        `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
         VALUES($1,$2,$3,'reversal',$4,$5,true,$6) RETURNING id`,
        [invoice.company_id, entryNum, new Date().toISOString().split('T')[0], invoice.id,
         `REVERSAL: ${invoice.invoice_type === 'sale' ? 'Sales' : 'Purchase'} Invoice ${invoice.invoice_number} — ${invoice.party_name} [Cancelled]`,
         req.user.id]
      )
      for (const line of lines) {
        await client.query(
          `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
          [revJe.id, line.account_id, line.credit_amount, line.debit_amount, `Reversal: ${line.narration}`]
        )
      }
    }

    const { rows: tdsJeRows } = await client.query(
      `SELECT id FROM journal_entries WHERE reference_id=$1 AND reference_type='tds' AND company_id=$2`,
      [invoice.id, invoice.company_id]
    )
    for (const tdsJe of tdsJeRows) {
      const { rows: tdsLines } = await client.query(`SELECT * FROM journal_entry_lines WHERE journal_entry_id=$1`, [tdsJe.id])
      const { rows: tdsCount } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [invoice.company_id])
      const tdsRevNum = `JE-${String(parseInt(tdsCount[0].count) + 1).padStart(4, '0')}`
      const { rows: [tdsRevJe] } = await client.query(
        `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
         VALUES($1,$2,$3,'reversal',$4,$5,true,$6) RETURNING id`,
        [invoice.company_id, tdsRevNum, new Date().toISOString().split('T')[0], invoice.id,
         `REVERSAL: TDS for ${invoice.invoice_number} [Cancelled]`, req.user.id]
      )
      for (const line of tdsLines) {
        await client.query(
          `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
          [tdsRevJe.id, line.account_id, line.credit_amount, line.debit_amount, `Reversal: ${line.narration}`]
        )
      }
    }

    await client.query(
      `DELETE FROM tds_entries WHERE company_id=$1 AND party_name=$2 AND payment_date=$3`,
      [invoice.company_id, invoice.party_name, invoice.invoice_date]
    )

    await client.query(
      `UPDATE invoices SET invoice_number=invoice_number||'-VOID-'||id::text WHERE id=$1`, [invoice.id]
    )

    await auditLog(client, invoice.company_id, req.user.id, 'INVOICE_CANCELLED', 'invoices', invoice.id,
      { invoice_number: invoice.invoice_number, status: invoice.status },
      { invoice_number: invoice.invoice_number + '-VOID-' + invoice.id, status: 'cancelled', party: invoice.party_name, amount: invoice.total_amount },
      req.ip)

    await client.query('COMMIT')
    res.json({
      message: `Invoice ${invoice.invoice_number} cancelled — journals reversed, TDS cleared, number freed`,
      reversal_entry: jeRows.length > 0 ? 'created' : 'no_journal_found'
    })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

router.patch('/:id/status', async (req, res) => {
  const { status, payment_status } = req.body
  try {
    const { rows: old } = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id])
    if (!old.length) return res.status(404).json({ error: 'Invoice not found' })
    const { rows } = await pool.query(
      `UPDATE invoices SET status=COALESCE($1,status), payment_status=COALESCE($2,payment_status), updated_at=NOW() WHERE id=$3 RETURNING *`,
      [status||null, payment_status||null, req.params.id]
    )
    const client = await pool.connect()
    try {
      await auditLog(client, rows[0].company_id, req.user.id, 'INVOICE_STATUS_UPDATED', 'invoices', rows[0].id,
        { status: old[0].status, payment_status: old[0].payment_status },
        { status: rows[0].status, payment_status: rows[0].payment_status }, req.ip)
    } finally { client.release() }
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

async function createJournal(client, companyId, invoice, cgst, sgst, igst, userId, tdsAmount=0, tdsSection=null) {
  const getAcc = async (code) => {
    const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [companyId, code])
    return r.rows[0]?.id
  }

  const isSale = invoice.invoice_type === 'sale'
  const { rows: countRows } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [companyId])
  const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`

  const je = await client.query(
    `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
     VALUES($1,$2,$3,'invoice',$4,$5,true,$6) RETURNING id`,
    [companyId, entryNum, invoice.invoice_date, invoice.id,
     `${isSale ? 'Sales' : 'Purchase'} Invoice ${invoice.invoice_number} — ${invoice.party_name}`, userId]
  )
  const jeId = je.rows[0].id

  const addLine = async (account_id, debit, credit, narration) => {
    if (!account_id) return
    await client.query(
      `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
      [jeId, account_id, debit||0, credit||0, narration]
    )
  }

  if (isSale) {
    const receivable  = await getAcc('1003')
    const salesRev    = await getAcc('4001')
    const cgstPayable = await getAcc('2002')
    const sgstPayable = await getAcc('2003')
    const igstPayable = await getAcc('2004')
    await addLine(receivable, invoice.total_amount, 0, 'Accounts Receivable')
    await addLine(salesRev,   0, invoice.subtotal, 'Sales Revenue')
    if (cgst > 0) await addLine(cgstPayable, 0, cgst, 'CGST Payable')
    if (sgst > 0) await addLine(sgstPayable, 0, sgst, 'SGST Payable')
    if (igst > 0) await addLine(igstPayable, 0, igst, 'IGST Payable')
  } else {
    const purchases   = await getAcc('5001')
    const cgstInput   = await getAcc('1004')
    const sgstInput   = await getAcc('1005')
    const igstInput   = await getAcc('1006')
    const payable     = await getAcc('2001')
    await addLine(purchases, invoice.subtotal, 0, 'Purchases')
    if (cgst > 0) await addLine(cgstInput, cgst, 0, 'GST Input CGST')
    if (sgst > 0) await addLine(sgstInput, sgst, 0, 'GST Input SGST')
    if (igst > 0) await addLine(igstInput, igst, 0, 'GST Input IGST')
    if (tdsAmount > 0) {
      const tdsPayable = await getAcc('2005')
      await addLine(payable,    0, invoice.total_amount - tdsAmount, 'Accounts Payable (net of TDS)')
      await addLine(tdsPayable, 0, tdsAmount, `TDS Payable u/s ${tdsSection||'194'}`)
    } else {
      await addLine(payable, 0, invoice.total_amount, 'Accounts Payable')
    }
  }
}

module.exports = router