const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  let token = null
  
  // ✅ PRIORITY 1: Check HttpOnly cookie first (for web browsers)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token
  }
  
  // ✅ PRIORITY 2: Fallback to Authorization header (for mobile apps / API clients)
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1]
  }
  
  // ❌ No token found in either location
  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' })
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' })
    }
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}