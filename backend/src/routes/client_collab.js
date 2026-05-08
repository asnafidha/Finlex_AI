const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// ══════════════════════════════════════════════════════════════
// GET /api/client-collab/requests?company_id=xxx
// List all document requests for a company
// ══════════════════════════════════════════════════════════════
router.get('/requests', async (req, res) => {
  const { company_id, status } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    let q = `
      SELECT
        dr.id, dr.title, dr.description, dr.due_date,
        dr.status, dr.priority, dr.period,
        dr.created_at, dr.updated_at,
        u.name AS created_by_name,
        COUNT(dri.id)                                                    AS total_items,
        COUNT(dri.id) FILTER (WHERE dri.status = 'uploaded')            AS uploaded_items,
        COUNT(dri.id) FILTER (WHERE dri.status = 'approved')            AS approved_items,
        COUNT(dri.id) FILTER (WHERE dri.status = 'pending')             AS pending_items,
        COUNT(dri.id) FILTER (WHERE dri.status = 'rejected')            AS rejected_items
      FROM document_requests dr
      LEFT JOIN users u ON u.id = dr.created_by
      LEFT JOIN document_request_items dri ON dri.request_id = dr.id
      WHERE dr.company_id = $1
    `
    const params = [company_id]
    if (status) { params.push(status); q += ` AND dr.status = $${params.length}` }
    q += ` GROUP BY dr.id, u.name ORDER BY dr.created_at DESC`

    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (err) {
    console.error('List requests error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/client-collab/requests/:id
// Get single request with all items and comments
// ══════════════════════════════════════════════════════════════
router.get('/requests/:id', async (req, res) => {
  try {
    // Request header
    const { rows: reqRows } = await pool.query(
      `SELECT dr.*, u.name AS created_by_name
       FROM document_requests dr
       LEFT JOIN users u ON u.id = dr.created_by
       WHERE dr.id = $1`,
      [req.params.id]
    )
    if (!reqRows.length) return res.status(404).json({ error: 'Request not found' })

    // Items
    const { rows: items } = await pool.query(
      `SELECT * FROM document_request_items WHERE request_id = $1 ORDER BY id ASC`,
      [req.params.id]
    )

    // Comments
    const { rows: comments } = await pool.query(
      `SELECT rc.*, u.name AS user_name
       FROM request_comments rc
       LEFT JOIN users u ON u.id = rc.user_id
       WHERE rc.request_id = $1
       ORDER BY rc.created_at ASC`,
      [req.params.id]
    )

    res.json({ ...reqRows[0], items, comments })
  } catch (err) {
    console.error('Get request error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// POST /api/client-collab/requests
// Create a new document request with checklist items
// ══════════════════════════════════════════════════════════════
router.post('/requests', async (req, res) => {
  const { company_id, title, description, due_date, priority, period, items } = req.body

  if (!company_id || !title)
    return res.status(400).json({ error: 'company_id and title are required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [request] } = await client.query(
      `INSERT INTO document_requests
         (company_id, created_by, title, description, due_date, priority, period)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [company_id, req.user.id, title, description || null,
       due_date || null, priority || 'normal', period || null]
    )

    // Insert checklist items if provided
    const insertedItems = []
    if (items && items.length > 0) {
      for (const item of items) {
        const { rows: [inserted] } = await client.query(
          `INSERT INTO document_request_items
             (request_id, document_name, document_type, description, is_required)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [request.id, item.document_name, item.document_type || 'other',
           item.description || null, item.is_required !== false]
        )
        insertedItems.push(inserted)
      }
    }

    // Create notification
    await client.query(
      `INSERT INTO request_notifications
         (request_id, user_id, type, message)
       VALUES ($1,$2,'request_created',$3)`,
      [request.id, req.user.id,
       `New document request created: "${title}" for period ${period || 'N/A'}`]
    )

    await client.query('COMMIT')
    res.status(201).json({ ...request, items: insertedItems })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Create request error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════
// PUT /api/client-collab/requests/:id
// Update request (status, due date, priority)
// ══════════════════════════════════════════════════════════════
router.put('/requests/:id', async (req, res) => {
  const { title, description, due_date, priority, period, status } = req.body

  try {
    const { rows } = await pool.query(
      `UPDATE document_requests
       SET title=$1, description=$2, due_date=$3, priority=$4,
           period=$5, status=$6, updated_at=NOW()
       WHERE id=$7
       RETURNING *`,
      [title, description, due_date || null, priority || 'normal',
       period, status || 'open', req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Request not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('Update request error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// DELETE /api/client-collab/requests/:id
// ══════════════════════════════════════════════════════════════
router.delete('/requests/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM document_requests WHERE id=$1', [req.params.id])
    res.json({ message: 'Request deleted' })
  } catch (err) {
    console.error('Delete request error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// POST /api/client-collab/requests/:id/items
// Add a single item to an existing request
// ══════════════════════════════════════════════════════════════
router.post('/requests/:id/items', async (req, res) => {
  const { document_name, document_type, description, is_required } = req.body
  if (!document_name) return res.status(400).json({ error: 'document_name required' })

  try {
    const { rows: [item] } = await pool.query(
      `INSERT INTO document_request_items
         (request_id, document_name, document_type, description, is_required)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, document_name, document_type || 'other',
       description || null, is_required !== false]
    )
    res.status(201).json(item)
  } catch (err) {
    console.error('Add item error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// PATCH /api/client-collab/items/:itemId/status
// Update item status — approve / reject / mark uploaded
// ══════════════════════════════════════════════════════════════
router.patch('/items/:itemId/status', async (req, res) => {
  const { status, notes, file_name, file_size } = req.body
  const allowed = ['pending', 'uploaded', 'approved', 'rejected']
  if (!allowed.includes(status))
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [item] } = await client.query(
      `UPDATE document_request_items
       SET status=$1, notes=$2,
           uploaded_at = CASE WHEN $1='uploaded' THEN NOW() ELSE uploaded_at END,
           file_name   = COALESCE($3, file_name),
           file_size   = COALESCE($4, file_size),
           updated_at  = NOW()
       WHERE id=$5 RETURNING *`,
      [status, notes || null, file_name || null, file_size || null, req.params.itemId]
    )
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item not found' }) }

    // Auto-update parent request status based on items
    const { rows: allItems } = await client.query(
      `SELECT status FROM document_request_items WHERE request_id=$1`, [item.request_id]
    )
    const allApproved  = allItems.every(i => i.status === 'approved')
    const anyUploaded  = allItems.some(i => ['uploaded','approved'].includes(i.status))
    const anyRejected  = allItems.some(i => i.status === 'rejected')

    let reqStatus = 'open'
    if (allApproved) reqStatus = 'completed'
    else if (anyUploaded || anyRejected) reqStatus = 'in_progress'

    await client.query(
      `UPDATE document_requests SET status=$1, updated_at=NOW() WHERE id=$2`,
      [reqStatus, item.request_id]
    )

    // Notification
    const notifType = status === 'approved' ? 'item_approved'
                    : status === 'rejected' ? 'item_rejected'
                    : status === 'uploaded' ? 'item_uploaded' : null
    if (notifType) {
      await client.query(
        `INSERT INTO request_notifications (request_id, user_id, type, message)
         VALUES ($1,$2,$3,$4)`,
        [item.request_id, req.user.id, notifType,
         `"${item.document_name}" marked as ${status}`]
      )
    }

    await client.query('COMMIT')
    res.json(item)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Update item status error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════
// DELETE /api/client-collab/items/:itemId
// ══════════════════════════════════════════════════════════════
router.delete('/items/:itemId', async (req, res) => {
  try {
    await pool.query('DELETE FROM document_request_items WHERE id=$1', [req.params.itemId])
    res.json({ message: 'Item deleted' })
  } catch (err) {
    console.error('Delete item error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// POST /api/client-collab/requests/:id/comments
// Add a comment/note to a request
// ══════════════════════════════════════════════════════════════
router.post('/requests/:id/comments', async (req, res) => {
  const { message, is_internal } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [comment] } = await client.query(
      `INSERT INTO request_comments (request_id, user_id, message, is_internal)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.user.id, message, is_internal || false]
    )

    // Get user name for response
    const { rows: [user] } = await client.query(
      'SELECT name FROM users WHERE id=$1', [req.user.id]
    )

    // Notification
    await client.query(
      `INSERT INTO request_notifications (request_id, user_id, type, message)
       VALUES ($1,$2,'comment_added',$3)`,
      [req.params.id, req.user.id, `New comment: "${message.substring(0, 80)}..."`]
    )

    await client.query('COMMIT')
    res.status(201).json({ ...comment, user_name: user?.name })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Add comment error:', err)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════
// GET /api/client-collab/notifications?user_id=xxx&unread_only=true
// ══════════════════════════════════════════════════════════════
router.get('/notifications', async (req, res) => {
  const { unread_only } = req.query
  try {
    let q = `
      SELECT rn.*, dr.title AS request_title, dr.company_id
      FROM request_notifications rn
      LEFT JOIN document_requests dr ON dr.id = rn.request_id
      WHERE rn.user_id = $1
    `
    if (unread_only === 'true') q += ' AND rn.is_read = false'
    q += ' ORDER BY rn.created_at DESC LIMIT 50'

    const { rows } = await pool.query(q, [req.user.id])
    res.json(rows)
  } catch (err) {
    console.error('Get notifications error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// PATCH /api/client-collab/notifications/mark-read
// Mark all notifications as read
// ══════════════════════════════════════════════════════════════
router.patch('/notifications/mark-read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE request_notifications SET is_read=true WHERE user_id=$1`,
      [req.user.id]
    )
    res.json({ message: 'All notifications marked as read' })
  } catch (err) {
    console.error('Mark read error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════
// GET /api/client-collab/summary?company_id=xxx
// Dashboard summary stats
// ══════════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  const { company_id } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })

  try {
    const { rows: [stats] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')        AS open_requests,
         COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE status = 'completed')   AS completed,
         COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed','cancelled')) AS overdue
       FROM document_requests
       WHERE company_id = $1`,
      [company_id]
    )

    const { rows: [itemStats] } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE dri.status = 'pending')  AS pending_docs,
         COUNT(*) FILTER (WHERE dri.status = 'uploaded') AS uploaded_docs,
         COUNT(*) FILTER (WHERE dri.status = 'approved') AS approved_docs,
         COUNT(*) FILTER (WHERE dri.status = 'rejected') AS rejected_docs
       FROM document_request_items dri
       JOIN document_requests dr ON dr.id = dri.request_id
       WHERE dr.company_id = $1`,
      [company_id]
    )

    const { rows: upcoming } = await pool.query(
      `SELECT id, title, due_date, status, priority
       FROM document_requests
       WHERE company_id=$1
         AND status NOT IN ('completed','cancelled')
         AND due_date IS NOT NULL
       ORDER BY due_date ASC LIMIT 5`,
      [company_id]
    )

    res.json({ ...stats, ...itemStats, upcoming_deadlines: upcoming })
  } catch (err) {
    console.error('Summary error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router