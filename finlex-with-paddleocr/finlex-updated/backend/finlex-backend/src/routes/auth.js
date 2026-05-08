const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'ca' } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email, password required' })

    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email])
    if (exists.rows.length)
      return res.status(400).json({ error: 'Email already registered' })

    const hash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role`,
      [name, email, hash, role]
    )
    const token = jwt.sign({ id: rows[0].id, email: rows[0].email }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.status(201).json({ user: rows[0], token })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'email and password required' })

    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email])
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, rows[0].password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign({ id: rows[0].id, email: rows[0].email }, process.env.JWT_SECRET, { expiresIn: '7d' })
    const { password_hash, ...user } = rows[0]
    res.json({ user, token })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json(req.user))

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'current_password and new_password required' })
  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' })
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id])
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    const valid = await bcrypt.compare(current_password, rows[0].password_hash)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })
    const hash = await bcrypt.hash(new_password, 12)
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id])
    res.json({ message: 'Password changed successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router