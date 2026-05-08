// ============================================================
// Feature J: Party Ledger System
// GET /api/party-ledger?company_id=xxx            — list all parties with balances
// GET /api/party-ledger/statement?company_id=xxx&party_name=yyy — full ledger per party
// ============================================================
const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// GET /api/party-ledger?company_id=xxx&type=vendor|customer
// Returns all distinct parties with their outstanding balance
router.get('/', async (req, res) => {
  const { company_id, type } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let typeFilter = ''
    const params = [company_id]
    if (type === 'customer') { typeFilter = "AND invoice_type='sale'" }
    else if (type === 'vendor') { typeFilter = "AND invoice_type='purchase'" }

    const { rows } = await pool.query(
      `SELECT
         party_name,
         party_gstin,
         -- Determine party type: if only sales = customer, only purchase = vendor, both = both
         CASE
           WHEN COUNT(*) FILTER (WHERE invoice_type='sale' AND status!='cancelled') > 0
            AND COUNT(*) FILTER (WHERE invoice_type='purchase' AND status!='cancelled') > 0
           THEN 'both'
           WHEN COUNT(*) FILTER (WHERE invoice_type='sale' AND status!='cancelled') > 0
           THEN 'sale'
           ELSE 'purchase'
         END AS invoice_type,
         COUNT(*) FILTER (WHERE status != 'cancelled')                             AS total_invoices,
         COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled'), 0)       AS total_invoiced,
         COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled' AND payment_status = 'paid'), 0)    AS total_paid,
         COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled' AND payment_status = 'unpaid'), 0)  AS total_outstanding,
         COALESCE(SUM(total_amount) FILTER (WHERE status != 'cancelled' AND payment_status = 'partial'), 0) AS total_partial,
         MAX(invoice_date) FILTER (WHERE status != 'cancelled')                    AS last_invoice_date
       FROM invoices
       WHERE company_id = $1 ${typeFilter}
       GROUP BY party_name, party_gstin
       ORDER BY total_outstanding DESC, party_name`,
      params
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/party-ledger/statement?company_id=xxx&party_name=yyy&from=&to=
// Full transaction-by-transaction ledger for one party (like Tally party ledger)
router.get('/statement', async (req, res) => {
  const { company_id, party_name, from, to } = req.query
  if (!company_id || !party_name) return res.status(400).json({ error: 'company_id and party_name required' })
  try {
    let dateFilter = ''
    const params = [company_id, party_name]
    if (from) { params.push(from); dateFilter += ` AND invoice_date >= $${params.length}` }
    if (to)   { params.push(to);   dateFilter += ` AND invoice_date <= $${params.length}` }

    const { rows: invoices } = await pool.query(
      `SELECT
         id, invoice_number, invoice_date, invoice_type, status, payment_status,
         subtotal, cgst_amount, sgst_amount, igst_amount, total_amount, tds_amount,
         notes
       FROM invoices
       WHERE company_id = $1 AND party_name = $2 AND status != 'cancelled'
       ${dateFilter}
       ORDER BY invoice_date ASC, id ASC`,
      params
    )

    // Fetch payments from journal entries (no separate payments table — payments go through JEs)
    const invoiceIds = invoices.map(i => i.id)
    let payments = []
    if (invoiceIds.length > 0) {
      const { rows: pmtRows } = await pool.query(
        `SELECT
           je.id,
           je.entry_date        AS payment_date,
           je.reference_id      AS invoice_id,
           i.invoice_number,
           i.invoice_type,
           -- payment amount = cash/bank line in the JE
           COALESCE(SUM(
             CASE WHEN a.code IN ('1001','1002') THEN
               CASE WHEN i.invoice_type='sale' THEN jel.credit_amount   -- receipt reduces receivable
                    ELSE jel.debit_amount                                -- payment reduces payable
               END
             ELSE 0 END
           ), 0)                AS amount,
           CASE WHEN i.invoice_type='sale' THEN 'received' ELSE 'made' END AS payment_type,
           'bank'               AS payment_mode,
           je.narration         AS reference
         FROM journal_entries je
         JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
         JOIN accounts a ON a.id = jel.account_id
         JOIN invoices i ON i.id = je.reference_id
         WHERE je.company_id = $1
           AND je.reference_type = 'payment'
           AND je.reference_id = ANY($2::int[])
         GROUP BY je.id, je.entry_date, je.reference_id, i.invoice_number, i.invoice_type, je.narration
         ORDER BY je.entry_date ASC`,
        [company_id, invoiceIds]
      )
      payments = pmtRows
    }

    // Build running balance ledger (like Tally's party ledger view)
    const ledgerEntries = []
    let runningBalance = 0

    // Merge invoices + payments into chronological order
    const allEvents = [
      ...invoices.map(i => ({ ...i, _type: 'invoice', _date: i.invoice_date })),
      ...payments.map(p => ({ ...p, _type: 'payment', _date: p.payment_date })),
    ].sort((a, b) => new Date(a._date) - new Date(b._date) || a.id - b.id)

    for (const ev of allEvents) {
      if (ev._type === 'invoice') {
        const amount = parseFloat(ev.total_amount)
        const debit  = ev.invoice_type === 'purchase' ? 0 : amount   // sale = debit (receivable)
        const credit = ev.invoice_type === 'purchase' ? amount : 0   // purchase = credit (payable)
        runningBalance += (debit - credit)
        ledgerEntries.push({
          date:        ev.invoice_date,
          type:        'invoice',
          ref:         ev.invoice_number,
          description: `${ev.invoice_type === 'sale' ? 'Sales' : 'Purchase'} Invoice`,
          debit:       debit,
          credit:      credit,
          balance:     runningBalance,
          invoice_type: ev.invoice_type,
          payment_status: ev.payment_status,
        })
      } else {
        const amount = parseFloat(ev.amount)
        const isReceipt = ev.payment_type === 'received'
        const debit  = isReceipt ? 0 : amount    // payment made = debit (reduces payable)
        const credit = isReceipt ? amount : 0    // receipt = credit (reduces receivable)
        runningBalance += (debit - credit)
        ledgerEntries.push({
          date:        ev.payment_date,
          type:        'payment',
          ref:         ev.invoice_number,
          description: `Payment ${ev.payment_type} — ${ev.payment_mode || 'bank'}`,
          debit:       debit,
          credit:      credit,
          balance:     runningBalance,
          payment_mode: ev.payment_mode,
          reference:   ev.reference,
        })
      }
    }

    const summary = {
      party_name,
      total_invoiced:    invoices.reduce((s, i) => s + parseFloat(i.total_amount), 0),
      total_paid:        payments.reduce((s, p) => s + parseFloat(p.amount), 0),
      closing_balance:   runningBalance,
      balance_type:      runningBalance >= 0 ? 'Dr' : 'Cr',
    }

    res.json({ summary, ledger: ledgerEntries })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router