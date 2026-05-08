// ✅ FIXED VERSION - Authorization Bypass Patched
// Location: src/middleware/companyAccess.js

const pool = require('../config/db')

module.exports = async (req, res, next) => {
  // ✅ CRITICAL FIX: Extract company_id and REQUIRE it (don't silently skip)
  const company_id = req.body?.company_id || req.query?.company_id || req.params?.company_id

  // ✅ SECURITY: If no company_id provided, return error instead of silently skipping auth
  if (!company_id) {
    return res.status(400).json({
      error: 'company_id is required',
      message: 'This endpoint requires a company_id parameter'
    })
  }

  try {
    // ✅ SECURITY: Check BOTH ca_company_access (shared) AND companies.created_by (owned)
    // This allows CA to access companies they own OR companies shared with them
    const { rows } = await pool.query(
      `SELECT 1 FROM ca_company_access
       WHERE ca_id=$1 AND company_id=$2
       UNION
       SELECT 1 FROM companies
       WHERE id=$2 AND created_by=$1`,
      [req.user.id, company_id]
    )

    if (!rows.length) {
      return res.status(403).json({
        error: 'Access denied to this company',
        message: 'You do not have permission to access this company'
      })
    }

    // ✅ Attach company_id to request for logging
    req.company_id = company_id
    next()
  } catch (err) {
    // ✅ SECURITY: Return error instead of just returning
    console.error('Company access check failed:', err.message)
    return res.status(500).json({
      error: 'Authorization check failed',
      message: err.message
    })
  }
}