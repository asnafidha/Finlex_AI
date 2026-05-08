const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// POST /api/payments
router.post('/', async (req, res) => {
  const { company_id, payment_type, invoice_id, amount, payment_date, payment_mode, reference, notes } = req.body

  if (!company_id || !payment_type || !invoice_id || !amount || !payment_date)
    return res.status(400).json({ error: 'company_id, payment_type, invoice_id, amount, payment_date required' })

  if (!['received','made'].includes(payment_type))
    return res.status(400).json({ error: 'payment_type must be received or made' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: invRows } = await client.query('SELECT * FROM invoices WHERE id=$1 AND company_id=$2', [invoice_id, company_id])
    if (!invRows.length) return res.status(404).json({ error: 'Invoice not found' })
    const invoice = invRows[0]

    if (parseFloat(amount) > parseFloat(invoice.total_amount))
      return res.status(400).json({ error: `Payment cannot exceed invoice total ₹${invoice.total_amount}` })

    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }

    const mode = payment_mode || 'bank'
    const cashOrBank = mode === 'cash' ? await getAcc('1001') : await getAcc('1002')
    const receivable = await getAcc('1003')
    const payable    = await getAcc('2001')

    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id])
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`
    const narration = payment_type === 'received'
      ? `Payment received — ${invoice.party_name} — ${invoice.invoice_number}`
      : `Payment made — ${invoice.party_name} — ${invoice.invoice_number}`

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
       VALUES($1,$2,$3,'payment',$4,$5,true,$6) RETURNING id`,
      [company_id, entryNum, payment_date, invoice_id, narration, req.user.id]
    )
    const jeId = je.rows[0].id

    const addLine = async (account_id, debit, credit, desc) => {
      if (!account_id) return
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, debit||0, credit||0, desc]
      )
    }

    if (payment_type === 'received') {
      await addLine(cashOrBank, amount, 0, `Payment via ${mode}`)
      await addLine(receivable, 0, amount, `Invoice ${invoice.invoice_number} cleared`)
    } else {
      await addLine(payable,    amount, 0, `Invoice ${invoice.invoice_number} cleared`)
      await addLine(cashOrBank, 0, amount, `Payment via ${mode}`)
    }

    const newStatus = parseFloat(amount) >= parseFloat(invoice.total_amount) ? 'paid' : 'partial'
    await client.query('UPDATE invoices SET payment_status=$1,updated_at=NOW() WHERE id=$2', [newStatus, invoice_id])

    await client.query('COMMIT')
    res.status(201).json({ message: 'Payment recorded', entry_number: entryNum, amount: parseFloat(amount), payment_type, invoice_status: newStatus })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// GET /api/payments?company_id=xxx
router.get('/', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT je.entry_number,je.entry_date,je.narration,je.reference_id as invoice_id,
              jel.debit_amount,jel.credit_amount,a.code as account_code,a.name as account_name
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       JOIN accounts a ON a.id=jel.account_id
       WHERE je.company_id=$1 AND je.reference_type='payment'
       ORDER BY je.entry_date DESC`,
      [company_id]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router