const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/journals — List all journal entries
// ══════════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows } = await pool.query(
      `SELECT je.*,
              COUNT(jel.id) as line_count,
              COALESCE(SUM(jel.debit_amount),0) as total_debit,
              COALESCE(SUM(jel.credit_amount),0) as total_credit,
              -- Show if entry has been reversed
              CASE WHEN je.reversed_by IS NOT NULL THEN true ELSE false END as is_reversed,
              -- Show if entry is a reversal
              CASE WHEN je.reverses IS NOT NULL THEN true ELSE false END as is_reversal
       FROM journal_entries je
       LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       WHERE je.company_id=$1
       GROUP BY je.id 
       ORDER BY je.entry_date DESC, je.entry_number DESC`,
      [company_id]
    )
    res.json(rows)
  } catch (err) { 
    console.error('List journals error:', err)
    res.status(500).json({ error: err.message }) 
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/journals/:id — Get single journal entry with lines
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const je = await pool.query(
      `SELECT je.* FROM journal_entries je
       JOIN ca_company_access cca ON cca.company_id=je.company_id
       WHERE je.id=$1 AND cca.ca_id=$2`,
      [req.params.id, req.user.id]
    )
    if (!je.rows.length) return res.status(404).json({ error: 'Journal entry not found' })
    
    const lines = await pool.query(
      `SELECT jel.*, a.name as account_name, a.code as account_code, a.type as account_type
       FROM journal_entry_lines jel
       JOIN accounts a ON a.id=jel.account_id
       WHERE jel.journal_entry_id=$1
       ORDER BY jel.id`,
      [req.params.id]
    )
    
    res.json({ ...je.rows[0], lines: lines.rows })
  } catch (err) { 
    console.error('Get journal error:', err)
    res.status(500).json({ error: err.message }) 
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/journals — Create manual journal entry with validation
// CRITICAL FIX: Validates balance, checks period lock, prevents bad data
// ══════════════════════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const { company_id, entry_date, narration, lines } = req.body
  
  if (!company_id || !entry_date || !narration || !lines?.length)
    return res.status(400).json({ error: 'company_id, entry_date, narration, lines required' })

  // Verify CA has access
  const { rows: access } = await pool.query(
    'SELECT 1 FROM ca_company_access WHERE ca_id=$1 AND company_id=$2', 
    [req.user.id, company_id]
  )
  if (!access.length) return res.status(403).json({ error: 'Access denied to this company' })

  // ══════════════════════════════════════════════════════════════
  // VALIDATION 1: Check if period is locked
  // ══════════════════════════════════════════════════════════════
  const { rows: periodCheck } = await pool.query(
    `SELECT id, period_name FROM financial_periods 
     WHERE company_id=$1 
       AND $2 BETWEEN start_date AND end_date 
       AND is_closed=true 
     LIMIT 1`,
    [company_id, entry_date]
  )
  
  if (periodCheck.length > 0) {
    return res.status(400).json({ 
      error: 'Period is locked',
      details: `The period "${periodCheck[0].period_name}" is closed. Cannot post entries to closed periods.`
    })
  }

  // ══════════════════════════════════════════════════════════════
  // VALIDATION 2: Check debits = credits
  // ══════════════════════════════════════════════════════════════
  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit_amount)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit_amount) || 0), 0)
  
  if (Math.abs(totalDebit - totalCredit) > 0.01)
    return res.status(400).json({ 
      error: `Journal entry is not balanced`,
      details: {
        total_debit: totalDebit.toFixed(2),
        total_credit: totalCredit.toFixed(2),
        difference: (totalDebit - totalCredit).toFixed(2)
      }
    })

  // ══════════════════════════════════════════════════════════════
  // VALIDATION 3: Each line must have debit XOR credit (not both)
  // ══════════════════════════════════════════════════════════════
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const debit = parseFloat(line.debit_amount || 0)
    const credit = parseFloat(line.credit_amount || 0)
    
    if (debit > 0 && credit > 0) {
      return res.status(400).json({
        error: 'Invalid line entry',
        details: `Line ${i+1}: Cannot have both debit (${debit}) and credit (${credit}). Use separate lines.`
      })
    }
    
    if (debit === 0 && credit === 0) {
      return res.status(400).json({
        error: 'Invalid line entry',
        details: `Line ${i+1}: Must have either debit or credit amount.`
      })
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // Generate entry number
    const { rows: countRows } = await client.query(
      'SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id]
    )
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`

    const je = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,narration,reference_type,is_posted,created_by,is_editable)
       VALUES($1,$2,$3,$4,'manual',true,$5,false) RETURNING *`,
      [company_id, entryNum, entry_date, narration, req.user.id]
    )
    
    for (const line of lines) {
      // ══════════════════════════════════════════════════════════════
      // VALIDATION 4: Verify account belongs to this company
      // ══════════════════════════════════════════════════════════════
      const accCheck = await client.query(
        'SELECT id, code, name, type FROM accounts WHERE id=$1 AND company_id=$2', 
        [line.account_id, company_id]
      )
      if (!accCheck.rows.length) {
        await client.query('ROLLBACK')
        return res.status(400).json({ 
          error: `Invalid account`,
          details: `Account id ${line.account_id} does not belong to this company` 
        })
      }
      
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) 
         VALUES($1,$2,$3,$4,$5)`,
        [je.rows[0].id, line.account_id, line.debit_amount||0, line.credit_amount||0, line.narration||null]
      )
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) 
       VALUES($1,$2,'JOURNAL_POSTED','journal_entries',$3,$4)`,
      [company_id, req.user.id, je.rows[0].id, JSON.stringify({ 
        entry_number: entryNum, 
        narration, 
        total_debit: totalDebit, 
        total_credit: totalCredit,
        lines: lines.length 
      })]
    )

    await client.query('COMMIT')
    res.status(201).json(je.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Create journal error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/journals/:id/reverse — Reverse a journal entry
// CRITICAL: Proper reversal system (don't edit, create reverse entry)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/reverse', async (req, res) => {
  const { reason } = req.body
  
  if (!reason) return res.status(400).json({ error: 'Reason for reversal required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get original entry
    const { rows: jeRows } = await client.query(
      `SELECT je.* FROM journal_entries je
       JOIN ca_company_access cca ON cca.company_id=je.company_id
       WHERE je.id=$1 AND cca.ca_id=$2`,
      [req.params.id, req.user.id]
    )
    
    if (!jeRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Journal entry not found' })
    }
    
    const originalJe = jeRows[0]
    
    // Check if already reversed
    if (originalJe.reversed_by) {
      await client.query('ROLLBACK')
      return res.status(400).json({ 
        error: 'Entry already reversed',
        details: `This entry was already reversed by journal entry ${originalJe.reversed_by}`
      })
    }
    
    // Check if entry is editable (system entries should not be reversed manually)
    if (originalJe.reference_type === 'opening') {
      await client.query('ROLLBACK')
      return res.status(400).json({ 
        error: 'Cannot reverse opening entry',
        details: 'Opening balance entries must be corrected via the opening balances module'
      })
    }

    // Check period lock
    const { rows: periodCheck } = await pool.query(
      `SELECT id, period_name FROM financial_periods 
       WHERE company_id=$1 
         AND CURRENT_DATE BETWEEN start_date AND end_date 
         AND is_closed=true 
       LIMIT 1`,
      [originalJe.company_id]
    )
    
    if (periodCheck.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ 
        error: 'Current period is locked',
        details: `Cannot create reversal entries in closed period "${periodCheck[0].period_name}"`
      })
    }

    // Get all lines from original entry
    const { rows: lines } = await client.query(
      `SELECT * FROM journal_entry_lines WHERE journal_entry_id=$1 ORDER BY id`,
      [originalJe.id]
    )

    // Generate new entry number
    const { rows: countRows } = await client.query(
      'SELECT COUNT(*) FROM journal_entries WHERE company_id=$1',
      [originalJe.company_id]
    )
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`

    // Create reversal entry
    const { rows: [revJe] } = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,reference_id,narration,is_posted,created_by,is_editable,reverses)
       VALUES($1,$2,$3,'reversal',$4,$5,true,$6,false,$7) RETURNING *`,
      [originalJe.company_id, entryNum, new Date().toISOString().split('T')[0], 
       originalJe.reference_id, `REVERSAL of ${originalJe.entry_number}: ${reason}`,
       req.user.id, originalJe.id]
    )

    // Create reversed lines (swap debit/credit)
    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) 
         VALUES($1,$2,$3,$4,$5)`,
        [revJe.id, line.account_id, line.credit_amount, line.debit_amount, `Reversal: ${line.narration || ''}`]
      )
    }

    // Mark original entry as reversed
    await client.query(
      'UPDATE journal_entries SET reversed_by=$1 WHERE id=$2',
      [revJe.id, originalJe.id]
    )

    // Audit log
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,old_values,new_values) 
       VALUES($1,$2,'JOURNAL_REVERSED','journal_entries',$3,$4,$5)`,
      [originalJe.company_id, req.user.id, originalJe.id,
       JSON.stringify({ original_entry: originalJe.entry_number }),
       JSON.stringify({ reversal_entry: entryNum, reason })]
    )

    await client.query('COMMIT')
    res.status(201).json({
      message: 'Entry reversed successfully',
      original_entry: originalJe.entry_number,
      reversal_entry: revJe
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Reverse journal error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/journals/:id — Delete UNPOSTED journal entries only
// CRITICAL: Cannot delete posted entries - use reversal instead
// ══════════════════════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: jeRows } = await client.query(
      `SELECT je.* FROM journal_entries je
       JOIN ca_company_access cca ON cca.company_id=je.company_id
       WHERE je.id=$1 AND cca.ca_id=$2`,
      [req.params.id, req.user.id]
    )
    
    if (!jeRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Journal entry not found' })
    }
    
    const je = jeRows[0]
    
    if (je.is_posted) {
      await client.query('ROLLBACK')
      return res.status(400).json({ 
        error: 'Cannot delete posted entry',
        details: 'Use the reversal endpoint to reverse this entry instead of deleting it'
      })
    }

    // Delete lines first
    await client.query('DELETE FROM journal_entry_lines WHERE journal_entry_id=$1', [je.id])
    
    // Delete entry
    await client.query('DELETE FROM journal_entries WHERE id=$1', [je.id])

    // Audit log
    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,old_values) 
       VALUES($1,$2,'JOURNAL_DELETED','journal_entries',$3,$4)`,
      [je.company_id, req.user.id, je.id, JSON.stringify({ entry_number: je.entry_number })]
    )

    await client.query('COMMIT')
    res.json({ message: 'Journal entry deleted successfully' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Delete journal error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

module.exports = router