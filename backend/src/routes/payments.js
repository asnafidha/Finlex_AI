const router = require('express').Router()
const pool = require('../config/db')
const auth = require('../middleware/auth')
const companyAccess = require('../middleware/companyAccess')

router.use(auth)
router.use(companyAccess)

// ── Account-code helper for payment modes ─────────────────────
// All electronic modes route through the bank account (1002).
// Cash goes through cash-in-hand (1001).
const MODE_ACCOUNT_CODE = {
  cash: '1001',
  bank: '1002',
  upi: '1002',
  cheque: '1002',
  neft: '1002',
  rtgs: '1002',
  credit_card: '1002',
}

// ── Balance check for an account ─────────────────────────────
async function getAccountBalance(client, company_id, account_id) {
  // FOR UPDATE locks the account row so concurrent requests can't both pass
  // the balance check and overdraw the account simultaneously
  const { rows } = await client.query(
    `SELECT COALESCE(a.opening_balance,0)
          + COALESCE(SUM(jel.debit_amount),0)
          - COALESCE(SUM(jel.credit_amount),0) AS balance
     FROM accounts a
     LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id
     LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.is_posted=true
     WHERE a.id=$1 AND a.company_id=$2
     GROUP BY a.id, a.opening_balance
     FOR UPDATE OF a`,
    [account_id, company_id]
  )
  return parseFloat(rows[0]?.balance || 0)
}

// ══════════════════════════════════════════════════════════════════════════
// GET /api/payments?company_id=xxx[&invoice_id=yyy]
// Returns clean payment history — one row per payment (not raw journal lines)
// ══════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const { company_id, invoice_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = `
      SELECT
        je.id              AS journal_entry_id,
        je.entry_number,
        je.entry_date      AS payment_date,
        je.narration,
        je.reference_id    AS invoice_id,
        i.invoice_number,
        i.party_name,
        i.total_amount     AS invoice_total,
        COALESCE(
          SUM(jel.debit_amount) FILTER (WHERE a.type='asset' AND a.code IN ('1001','1002')),
          SUM(jel.credit_amount) FILTER (WHERE a.type='liability')
        , 0)               AS amount_paid,
        CASE WHEN je.reversed_by IS NOT NULL THEN true ELSE false END AS is_reversed,
        CASE WHEN je.reverses   IS NOT NULL THEN true ELSE false END AS is_reversal,
        je.reversed_by,
        je.reverses
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
      JOIN accounts a ON a.id=jel.account_id
      LEFT JOIN invoices i ON i.id=je.reference_id
      WHERE je.company_id=$1
        AND je.reference_type IN ('payment','reversal')
    `
    const params = [company_id]
    if (invoice_id) {
      params.push(invoice_id)
      q += ` AND je.reference_id=$${params.length}`
    }
    q += ` GROUP BY je.id, je.entry_number, je.entry_date, je.narration, je.reference_id,
                    i.invoice_number, i.party_name, i.total_amount,
                    je.reversed_by, je.reverses
           ORDER BY je.entry_date DESC, je.entry_number DESC`

    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (err) {
    console.error('List payments error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════
// POST /api/payments — Record payment against an invoice
// Payment modes: cash | bank | upi | cheque | neft | rtgs | credit_card
// ══════════════════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const {
    company_id, payment_type, invoice_id,
    amount, payment_date,
    payment_mode, reference, notes
  } = req.body

  if (!company_id || !payment_type || !invoice_id || !amount || !payment_date)
    return res.status(400).json({ error: 'company_id, payment_type, invoice_id, amount, payment_date required' })

  if (!['received', 'made'].includes(payment_type))
    return res.status(400).json({ error: 'payment_type must be received or made' })

  const mode = (payment_mode || 'bank').toLowerCase()
  if (!MODE_ACCOUNT_CODE[mode])
    return res.status(400).json({ error: `Invalid payment_mode. Allowed: ${Object.keys(MODE_ACCOUNT_CODE).join(', ')}` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock invoice row
    const { rows: invRows } = await client.query(
      'SELECT * FROM invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [invoice_id, company_id]
    )
    if (!invRows.length) return res.status(404).json({ error: 'Invoice not found' })
    const invoice = invRows[0]

    if (invoice.status === 'cancelled')
      return res.status(400).json({ error: 'Cannot record payment for a cancelled invoice' })

    // Cumulative paid amount for this invoice
    const { rows: paidRows } = await client.query(
      `SELECT COALESCE(SUM(
         CASE WHEN $1='received' THEN jel.debit_amount
              ELSE jel.credit_amount END
       ),0) AS already_paid
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       JOIN accounts a ON a.id=jel.account_id
       WHERE je.reference_id=$2 AND je.reference_type='payment'
         AND je.company_id=$3 AND je.reversed_by IS NULL
         AND a.code IN ('1001','1002')`,
      [payment_type, invoice_id, company_id]
    )
    const already_paid = parseFloat(paidRows[0]?.already_paid || 0)
    const new_amount = parseFloat(amount)
    const total_invoice = parseFloat(invoice.total_amount)

    if (new_amount <= 0)
      return res.status(400).json({ error: 'Payment amount must be greater than 0' })

    if (already_paid + new_amount > total_invoice + 0.01)
      return res.status(400).json({
        error: `Payment of ₹${new_amount.toLocaleString('en-IN')} exceeds remaining balance. Already paid: ₹${already_paid.toLocaleString('en-IN')}, Invoice total: ₹${total_invoice.toLocaleString('en-IN')}, Remaining: ₹${(total_invoice - already_paid).toLocaleString('en-IN')}`
      })

    // Resolve accounts
    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }
    const modeAccId = await getAcc(MODE_ACCOUNT_CODE[mode])
    const receivable = await getAcc('1003')
    const payable = await getAcc('2001')

    if (!modeAccId)
      return res.status(400).json({ error: `Account for payment mode "${mode}" not found. Ensure accounts 1001/1002 exist.` })

    // ── NEGATIVE BANK GUARD ──────────────────────────────────
    if (payment_type === 'made') {
      // We are paying out — bank/cash will be credited (reduced)
      const currentBalance = await getAccountBalance(client, company_id, modeAccId)
      if (currentBalance - new_amount < -0.01) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: `Insufficient ${mode} balance. Current balance: ₹${currentBalance.toLocaleString('en-IN')}, Payment: ₹${new_amount.toLocaleString('en-IN')}`,
          current_balance: currentBalance,
          payment_amount: new_amount,
          shortfall: new_amount - currentBalance
        })
      }
    }

    // Generate JE number
    const { rows: countRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 AS next
       FROM journal_entries WHERE company_id=$1 FOR UPDATE`,
      [company_id]
    )
    const entryNum = `JE-${String(countRows[0].next).padStart(4, '0')}`
    const modeLabel = mode.toUpperCase()
    const narration = payment_type === 'received'
      ? `Payment received [${modeLabel}] — ${invoice.party_name} — ${invoice.invoice_number}${reference ? ' Ref: ' + reference : ''}`
      : `Payment made [${modeLabel}] — ${invoice.party_name} — ${invoice.invoice_number}${reference ? ' Ref: ' + reference : ''}`

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
        [jeId, account_id, debit || 0, credit || 0, desc]
      )
    }

    if (payment_type === 'received') {
      // Money IN: Bank/Cash Dr, AR Cr
      await addLine(modeAccId, new_amount, 0, `Payment via ${modeLabel}`)
      await addLine(receivable, 0, new_amount, `Invoice ${invoice.invoice_number} cleared`)
    } else {
      // Money OUT: AP Dr, Bank/Cash Cr
      await addLine(payable, new_amount, 0, `Invoice ${invoice.invoice_number} cleared`)
      await addLine(modeAccId, 0, new_amount, `Payment via ${modeLabel}`)
    }

    // Update invoice payment status
    const total_paid_now = already_paid + new_amount
    const newStatus = total_paid_now >= total_invoice - 0.01 ? 'paid' : 'partial'
    await client.query('UPDATE invoices SET payment_status=$1,updated_at=NOW() WHERE id=$2', [newStatus, invoice_id])

    // Audit log
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values)
       VALUES($1,$2,'PAYMENT_RECORDED','invoices',$3,$4)`,
      [company_id, req.user.id, invoice_id,
        JSON.stringify({ entry: entryNum, amount: new_amount, type: payment_type, mode, invoice: invoice.invoice_number, already_paid, total_paid_now })]
    )

    await client.query('COMMIT')
    res.status(201).json({
      message: 'Payment recorded',
      entry_number: entryNum,
      amount: new_amount,
      payment_type,
      payment_mode: mode,
      already_paid,
      total_paid: total_paid_now,
      remaining: Math.max(0, total_invoice - total_paid_now),
      invoice_status: newStatus,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Record payment error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════════════════
// POST /api/payments/:jeId/reverse — Reverse a recorded payment
// ══════════════════════════════════════════════════════════════════════════
router.post('/:jeId/reverse', async (req, res) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ error: 'reason is required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get original payment journal entry
    const { rows: jeRows } = await client.query(
      `SELECT je.* FROM journal_entries je
       WHERE je.id=$1 AND je.reference_type='payment'`,
      [req.params.jeId]
    )
    if (!jeRows.length)
      return res.status(404).json({ error: 'Payment journal entry not found or not a payment entry' })

    const orig = jeRows[0]

    if (orig.reversed_by) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Payment already reversed' })
    }

    // Get all lines from the original entry
    const { rows: lines } = await client.query(
      'SELECT * FROM journal_entry_lines WHERE journal_entry_id=$1 ORDER BY id',
      [orig.id]
    )

    // Generate reversal JE number
    const { rows: countRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 AS next
       FROM journal_entries WHERE company_id=$1 FOR UPDATE`,
      [orig.company_id]
    )
    const revEntryNum = `JE-${String(countRows[0].next).padStart(4, '0')}`

    const { rows: [revJe] } = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by,reverses)
       VALUES($1,$2,$3,'reversal',$4,$5,true,$6,$7) RETURNING id`,
      [orig.company_id, revEntryNum, new Date().toISOString().split('T')[0],
      orig.reference_id, `REVERSAL of ${orig.entry_number}: ${reason}`,
      req.user.id, orig.id]
    )

    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration)
         VALUES($1,$2,$3,$4,$5)`,
        [revJe.id, line.account_id, line.credit_amount, line.debit_amount, `Reversal: ${line.narration || ''}`]
      )
    }

    // Mark original as reversed
    await client.query('UPDATE journal_entries SET reversed_by=$1 WHERE id=$2', [revJe.id, orig.id])

    // Recalculate invoice payment status
    const invoice_id = orig.reference_id
    if (invoice_id) {
      const { rows: invRows } = await client.query('SELECT total_amount FROM invoices WHERE id=$1', [invoice_id])
      if (invRows.length) {
        const totalAmount = parseFloat(invRows[0].total_amount)
        const { rows: paidRows } = await client.query(
          `SELECT COALESCE(SUM(jel.debit_amount),0) AS paid
           FROM journal_entries je
           JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
           JOIN accounts a ON a.id=jel.account_id
           WHERE je.reference_id=$1 AND je.reference_type='payment'
             AND je.reversed_by IS NULL AND a.code IN ('1001','1002')`,
          [invoice_id]
        )
        const totalPaid = parseFloat(paidRows[0]?.paid || 0)
        const newStatus = totalPaid <= 0 ? 'unpaid' : totalPaid >= totalAmount - 0.01 ? 'paid' : 'partial'
        await client.query('UPDATE invoices SET payment_status=$1,updated_at=NOW() WHERE id=$2', [newStatus, invoice_id])
      }
    }

    // Audit
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values)
       VALUES($1,$2,'PAYMENT_REVERSED','journal_entries',$3,$4)`,
      [orig.company_id, req.user.id, orig.id,
      JSON.stringify({ original_entry: orig.entry_number, reversal_entry: revEntryNum, reason })]
    )

    await client.query('COMMIT')
    res.status(201).json({
      message: 'Payment reversed successfully',
      original_entry: orig.entry_number,
      reversal_entry: revEntryNum,
      reversal_entry_id: revJe.id,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Payment reversal error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════════════════
// POST /api/payments/advance — Record advance / on-account payment (no invoice)
// ══════════════════════════════════════════════════════════════════════════
router.post('/advance', async (req, res) => {
  const {
    company_id, payment_type, party_name,
    amount, payment_date,
    payment_mode, reference, notes
  } = req.body

  if (!company_id || !payment_type || !party_name || !amount || !payment_date)
    return res.status(400).json({ error: 'company_id, payment_type, party_name, amount, payment_date required' })

  if (!['received', 'made'].includes(payment_type))
    return res.status(400).json({ error: 'payment_type must be received or made' })

  const mode = (payment_mode || 'bank').toLowerCase()
  if (!MODE_ACCOUNT_CODE[mode])
    return res.status(400).json({ error: `Invalid payment_mode. Allowed: ${Object.keys(MODE_ACCOUNT_CODE).join(', ')}` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }

    const modeAccId = await getAcc(MODE_ACCOUNT_CODE[mode])
    if (!modeAccId)
      return res.status(400).json({ error: `Account for payment mode "${mode}" not found` })

    const new_amount = parseFloat(amount)
    if (new_amount <= 0)
      return res.status(400).json({ error: 'Amount must be greater than 0' })

    // Negative bank guard for outgoing advance
    if (payment_type === 'made') {
      const currentBalance = await getAccountBalance(client, company_id, modeAccId)
      if (currentBalance - new_amount < -0.01) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: `Insufficient ${mode} balance. Current: ₹${currentBalance.toLocaleString('en-IN')}, Required: ₹${new_amount.toLocaleString('en-IN')}`,
          current_balance: currentBalance,
          shortfall: new_amount - currentBalance
        })
      }
    }

    // ADV number
    const { rows: countRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 AS next
       FROM journal_entries WHERE company_id=$1 AND narration LIKE 'Advance%' FOR UPDATE`,
      [company_id]
    )
    // Use overall JE counter to avoid collisions
    const { rows: jeCountRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 AS next
       FROM journal_entries WHERE company_id=$1 FOR UPDATE`,
      [company_id]
    )
    const entryNum = `JE-${String(jeCountRows[0].next).padStart(4, '0')}`
    const modeLabel = mode.toUpperCase()
    const narration = payment_type === 'received'
      ? `Advance received [${modeLabel}] — ${party_name}${reference ? ' Ref: ' + reference : ''}`
      : `Advance paid [${modeLabel}] — ${party_name}${reference ? ' Ref: ' + reference : ''}`

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,narration,is_posted,created_by)
       VALUES($1,$2,$3,'advance',$4,true,$5) RETURNING id`,
      [company_id, entryNum, payment_date, narration, req.user.id]
    )
    const jeId = je.rows[0].id

    // Advance accounts:
    // received → Dr Bank, Cr Customer Advances (2006)
    // made     → Dr Vendor Advances (1008), Cr Bank
    const advAccId = payment_type === 'received'
      ? await getAcc('2006')  // Customer Advances (liability)
      : await getAcc('1008')  // Vendor Advances (asset)

    if (!advAccId) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: payment_type === 'received'
          ? 'Customer Advances account (2006) not found. Please run the migration script to add it.'
          : 'Vendor Advances account (1008) not found. Please run the migration script to add it.'
      })
    }

    const addLine = async (account_id, debit, credit, desc) => {
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, debit || 0, credit || 0, desc]
      )
    }

    if (payment_type === 'received') {
      await addLine(modeAccId, new_amount, 0, `Advance received via ${modeLabel}`)
      await addLine(advAccId, 0, new_amount, `Customer advance — ${party_name}`)
    } else {
      await addLine(advAccId, new_amount, 0, `Vendor advance — ${party_name}`)
      await addLine(modeAccId, 0, new_amount, `Advance paid via ${modeLabel}`)
    }

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values)
       VALUES($1,$2,'ADVANCE_RECORDED','journal_entries',$3,$4)`,
      [company_id, req.user.id, jeId,
        JSON.stringify({ entry: entryNum, amount: new_amount, type: payment_type, mode, party: party_name })]
    )

    await client.query('COMMIT')
    res.status(201).json({
      message: 'Advance payment recorded',
      entry_number: entryNum,
      journal_id: jeId,
      amount: new_amount,
      payment_type,
      payment_mode: mode,
      party_name,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Advance payment error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════════════════
// GET /api/payments/advances?company_id=xxx[&payment_type=received|made]
// ══════════════════════════════════════════════════════════════════════════
router.get('/advances', async (req, res) => {
  const { company_id, payment_type } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = `
      SELECT je.id, je.entry_number, je.entry_date, je.narration,
             COALESCE(SUM(CASE WHEN a.code IN ('1001','1002') THEN jel.debit_amount  ELSE 0 END),0) as received,
             COALESCE(SUM(CASE WHEN a.code IN ('1001','1002') THEN jel.credit_amount ELSE 0 END),0) as paid_out,
             CASE WHEN je.reversed_by IS NOT NULL THEN true ELSE false END as is_reversed
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
      JOIN accounts a ON a.id=jel.account_id
      WHERE je.company_id=$1 AND je.reference_type='advance'
    `
    const params = [company_id]
    q += ' GROUP BY je.id, je.entry_number, je.entry_date, je.narration, je.reversed_by ORDER BY je.entry_date DESC'
    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (err) {
    console.error('List advances error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════
// GET /api/payments/aging?company_id=xxx&type=receivable|payable
// Returns aging buckets (0-30, 31-60, 61-90, 90+) per party
// ══════════════════════════════════════════════════════════════════════════
router.get('/aging', async (req, res) => {
  const { company_id, type } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  if (!['receivable', 'payable'].includes(type))
    return res.status(400).json({ error: 'type must be receivable or payable' })

  const invoiceType = type === 'receivable' ? 'sale' : 'purchase'

  try {
    const { rows } = await pool.query(
      `SELECT
         i.party_name,
         i.invoice_number,
         i.invoice_date,
         i.due_date,
         i.total_amount,
         COALESCE(paid.total_paid, 0)                                AS total_paid,
         GREATEST(0, i.total_amount - COALESCE(paid.total_paid, 0)) AS outstanding,
         (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)) AS days_overdue
       FROM invoices i
       LEFT JOIN (
         SELECT je.reference_id AS invoice_id,
                SUM(jel.debit_amount) FILTER (WHERE a.code IN ('1001','1002') AND je.reference_type='payment') AS total_paid
         FROM journal_entries je
         JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
         JOIN accounts a ON a.id=jel.account_id
         WHERE je.company_id=$1 AND je.reversed_by IS NULL
         GROUP BY je.reference_id
       ) paid ON paid.invoice_id=i.id
       WHERE i.company_id=$1
         AND i.invoice_type=$2
         AND i.payment_status IN ('unpaid','partial')
         AND i.status != 'cancelled'
       ORDER BY days_overdue DESC`,
      [company_id, invoiceType]
    )

    // Bucket the results
    const buckets = { '0_30': [], '31_60': [], '61_90': [], 'over_90': [], 'not_due': [] }
    const totals = { '0_30': 0, '31_60': 0, '61_90': 0, 'over_90': 0, 'not_due': 0, grand_total: 0 }

    for (const r of rows) {
      const outstanding = parseFloat(r.outstanding)
      const days = parseFloat(r.days_overdue)
      if (outstanding <= 0) continue

      let bucket
      if (days < 0) bucket = 'not_due'
      else if (days <= 30) bucket = '0_30'
      else if (days <= 60) bucket = '31_60'
      else if (days <= 90) bucket = '61_90'
      else bucket = 'over_90'

      buckets[bucket].push({
        party_name: r.party_name,
        invoice_number: r.invoice_number,
        invoice_date: r.invoice_date,
        due_date: r.due_date,
        invoice_total: parseFloat(r.total_amount),
        total_paid: parseFloat(r.total_paid),
        outstanding,
        days_overdue: Math.round(days),
      })
      totals[bucket] += outstanding
      totals.grand_total += outstanding
    }

    res.json({ type, invoiceType, buckets, totals })
  } catch (err) {
    console.error('Aging report error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════
// POST /api/payments/apply-advance — Adjust an advance against an invoice
// Moves the advance balance to the invoice (clears AR/AP)
//
// Body: { company_id, advance_je_id, invoice_id, amount }
//
// Accounting:
//   Customer advance applied → Dr Customer Advances (2006), Cr Accounts Receivable (1003)
//   Vendor advance applied   → Dr Accounts Payable (2001),  Cr Vendor Advances (1008)
// ══════════════════════════════════════════════════════════════════════════
router.post('/apply-advance', async (req, res) => {
  const { company_id, advance_je_id, invoice_id, amount } = req.body

  if (!company_id || !advance_je_id || !invoice_id || !amount)
    return res.status(400).json({ error: 'company_id, advance_je_id, invoice_id, amount required' })

  const applyAmount = parseFloat(amount)
  if (applyAmount <= 0)
    return res.status(400).json({ error: 'amount must be greater than 0' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Validate advance JE ─────────────────────────────────
    const { rows: advRows } = await client.query(
      `SELECT je.*, jel.account_id, jel.credit_amount, a.code
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       JOIN accounts a ON a.id = jel.account_id
       WHERE je.id = $1 AND je.company_id = $2 AND je.reference_type = 'advance'
         AND a.code IN ('2006','1008')`,
      [advance_je_id, company_id]
    )
    if (!advRows.length)
      return res.status(404).json({ error: 'Advance journal entry not found' })

    const advRow = advRows[0]
    if (advRow.reversed_by)
      return res.status(400).json({ error: 'Advance has already been reversed' })

    const isCustomerAdvance = advRow.code === '2006'

    // ── Validate invoice ────────────────────────────────────
    const { rows: invRows } = await client.query(
      'SELECT * FROM invoices WHERE id=$1 AND company_id=$2 FOR UPDATE',
      [invoice_id, company_id]
    )
    if (!invRows.length) return res.status(404).json({ error: 'Invoice not found' })
    const invoice = invRows[0]

    if (invoice.status === 'cancelled')
      return res.status(400).json({ error: 'Cannot apply advance to a cancelled invoice' })

    // Validate that advance type matches invoice type
    const expectedInvoiceType = isCustomerAdvance ? 'sale' : 'purchase'
    if (invoice.invoice_type !== expectedInvoiceType)
      return res.status(400).json({
        error: `Cannot apply ${isCustomerAdvance ? 'customer' : 'vendor'} advance to a ${invoice.invoice_type} invoice`
      })

    // ── Check available advance balance ─────────────────────
    // Available = original advance amount - previously applied amounts
    const { rows: alreadyApplied } = await client.query(
      `SELECT COALESCE(SUM(jel.debit_amount),0) AS applied
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       JOIN accounts a ON a.id = jel.account_id
       WHERE je.reference_id = $1 AND je.reference_type = 'advance_applied'
         AND je.company_id = $2 AND je.reversed_by IS NULL
         AND a.code = $3`,
      [advance_je_id, company_id, isCustomerAdvance ? '2006' : '2001']
    )
    const originalAmount = parseFloat(advRow.credit_amount)
    const previouslyApplied = parseFloat(alreadyApplied[0]?.applied || 0)
    const availableBalance = originalAmount - previouslyApplied

    if (applyAmount > availableBalance + 0.01)
      return res.status(400).json({
        error: `Apply amount ₹${applyAmount.toLocaleString('en-IN')} exceeds available advance balance ₹${availableBalance.toLocaleString('en-IN')}`,
        available: availableBalance,
        requested: applyAmount
      })

    // ── Resolve account IDs ─────────────────────────────────
    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }
    const advAccId = advRow.account_id
    const tradeAccId = isCustomerAdvance
      ? await getAcc('1003')  // Accounts Receivable
      : await getAcc('2001')  // Accounts Payable

    if (!tradeAccId)
      return res.status(400).json({ error: `${isCustomerAdvance ? 'Accounts Receivable (1003)' : 'Accounts Payable (2001)'} account not found` })

    // ── Generate JE number ──────────────────────────────────
    const { rows: countRows } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 4) AS INTEGER)), 0) + 1 AS next
       FROM journal_entries WHERE company_id=$1 FOR UPDATE`,
      [company_id]
    )
    const entryNum = `JE-${String(countRows[0].next).padStart(4, '0')}`
    const narration = isCustomerAdvance
      ? `Advance applied — ${invoice.party_name} — ${invoice.invoice_number} (Adv ref: JE-${String(advance_je_id).padStart(4, '0')})`
      : `Advance adjusted — ${invoice.party_name} — ${invoice.invoice_number} (Adv ref: JE-${String(advance_je_id).padStart(4, '0')})`

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by)
       VALUES($1,$2,$3,'advance_applied',$4,$5,true,$6) RETURNING id`,
      [company_id, entryNum, new Date().toISOString().split('T')[0], advance_je_id, narration, req.user.id]
    )
    const jeId = je.rows[0].id

    const addLine = async (account_id, debit, credit, desc) => {
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,$4,$5)`,
        [jeId, account_id, debit || 0, credit || 0, desc]
      )
    }

    if (isCustomerAdvance) {
      // Dr Customer Advances (2006) — reduce liability
      // Cr Accounts Receivable (1003) — clear what customer owes
      await addLine(advAccId, applyAmount, 0, `Advance applied against ${invoice.invoice_number}`)
      await addLine(tradeAccId, 0, applyAmount, `Invoice cleared via advance — ${invoice.party_name}`)
    } else {
      // Dr Accounts Payable (2001) — reduce what we owe vendor
      // Cr Vendor Advances (1008) — reduce advance asset
      await addLine(tradeAccId, applyAmount, 0, `Invoice cleared via advance — ${invoice.party_name}`)
      await addLine(advAccId, 0, applyAmount, `Advance applied against ${invoice.invoice_number}`)
    }

    // Update invoice payment status
    const { rows: paidRows } = await client.query(
      `SELECT COALESCE(SUM(
         CASE WHEN a.code IN ('1001','1002') THEN jel.debit_amount ELSE 0 END
       ),0) AS cash_paid,
       COALESCE(SUM(
         CASE WHEN a.code IN ('1003','2001') THEN jel.credit_amount ELSE 0 END
       ),0) AS advance_applied
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       JOIN accounts a ON a.id=jel.account_id
       WHERE je.reference_id=$1 AND je.reference_type IN ('payment','advance_applied')
         AND je.company_id=$2 AND je.reversed_by IS NULL`,
      [invoice_id, company_id]
    )
    const totalPaid = parseFloat(paidRows[0]?.cash_paid || 0) + parseFloat(paidRows[0]?.advance_applied || 0) + applyAmount
    const invoiceTotal = parseFloat(invoice.total_amount)
    const newStatus = totalPaid >= invoiceTotal - 0.01 ? 'paid' : 'partial'
    await client.query('UPDATE invoices SET payment_status=$1,updated_at=NOW() WHERE id=$2', [newStatus, invoice_id])

    // Audit
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values)
       VALUES($1,$2,'ADVANCE_APPLIED','journal_entries',$3,$4)`,
      [company_id, req.user.id, jeId,
        JSON.stringify({ entry: entryNum, amount: applyAmount, advance_je_id, invoice_id, invoice_number: invoice.invoice_number, party: invoice.party_name })]
    )

    await client.query('COMMIT')
    res.status(201).json({
      message: 'Advance applied successfully',
      entry_number: entryNum,
      journal_id: jeId,
      amount_applied: applyAmount,
      advance_remaining: availableBalance - applyAmount,
      invoice_status: newStatus,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Apply advance error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

module.exports = router