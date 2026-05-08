const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// IT Act WDV rates (Appendix I — Income Tax Rules 1962)
const IT_ACT_WDV_RATES = {
  'Buildings (Residential)':          0.05,
  'Buildings (Non-residential)':      0.10,
  'Furniture & Fittings':             0.10,
  'Plant & Machinery (General)':      0.15,
  'Motor Cars (not used for hire)':   0.15,
  'Motor Cars (used for hire)':       0.30,
  'Computer & Software':              0.40,
  'Books (Annual Publications)':      1.00,
  'Books (Other)':                    0.40,
  'Ships':                            0.20,
  'Aircraft':                         0.40,
}

// Companies Act 2013 — Schedule II useful lives (SLM)
const COMPANIES_ACT_SLM = {
  'Buildings (RCC)':          60,
  'Buildings (Other)':        30,
  'Plant & Machinery':        15,
  'Furniture & Fixtures':     10,
  'Computers':                3,
  'Vehicles':                 8,
  'Office Equipment':         5,
  'Electrical Installations': 10,
  'Ships':                    25,
}

// GET /api/depreciation/reference-rates
router.get('/reference-rates', (req, res) => {
  res.json({
    income_tax_wdv_rates: IT_ACT_WDV_RATES,
    companies_act_slm_years: COMPANIES_ACT_SLM,
    note: 'WDV rates per IT Act Appendix I, Rule 5. SLM lives per Companies Act 2013 Schedule II.',
  })
})

// GET /api/depreciation/schedules?company_id=xxx
// Also handles /schedule alias
router.get('/schedules', async (req, res) => {
  const { company_id, financial_year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = `
      SELECT fa.*,
        COALESCE(SUM(de.depreciation), 0) AS total_dep_posted,
        COUNT(de.id) AS years_posted
      FROM fixed_assets fa
      LEFT JOIN depreciation_entries de ON de.asset_id = fa.id
      WHERE fa.company_id = $1 AND fa.is_active = true
      GROUP BY fa.id
      ORDER BY fa.asset_name`
    const { rows } = await pool.query(q, [company_id])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})
router.get('/schedule', (req, res) => res.redirect(307, `/api/depreciation/schedules?${new URLSearchParams(req.query).toString()}`))

// GET /api/depreciation/schedules/:id/preview — full schedule table
router.get('/schedules/:id/preview', async (req, res) => {
  try {
    // FIX: Validate CA has access to the company this asset belongs to
    const { rows } = await pool.query(
      `SELECT fa.* FROM fixed_assets fa
       JOIN ca_company_access cca ON cca.company_id=fa.company_id
       WHERE fa.id=$1 AND cca.ca_id=$2`,
      [req.params.id, req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Asset not found' })
    const asset = rows[0]

    const cost       = parseFloat(asset.cost_price)
    const salvage    = parseFloat(asset.salvage_value || 0)
    const wdv_rate   = parseFloat(asset.wdv_rate || 0.15)
    const life       = parseInt(asset.useful_life_years || 5)

    const years = []
    let opening = cost
    let totalDep = 0
    const maxYears = asset.method === 'WDV' ? Math.min(Math.ceil(Math.log(salvage / cost) / Math.log(1 - wdv_rate)) + 5, 50) : life

    for (let y = 1; y <= maxYears; y++) {
      let dep = 0
      if (asset.method === 'SLM') {
        dep = (cost - salvage) / life
        if (y > life) break
      } else {
        dep = opening * wdv_rate
        if (opening - dep < salvage) dep = Math.max(0, opening - salvage)
      }
      dep = Math.round(dep * 100) / 100
      if (dep <= 0) break
      const closing = Math.round((opening - dep) * 100) / 100
      totalDep += dep
      years.push({ year: y, opening_wdv: opening, dep_amount: dep, closing_wdv: closing })
      opening = closing
      if (closing <= salvage + 1) break
    }

    res.json({
      asset_name: asset.asset_name,
      method:     asset.method,
      cost,
      salvage_value: salvage,
      total_depreciation: Math.round(totalDep * 100) / 100,
      years,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/depreciation/schedules — create a new asset schedule
router.post('/schedules', async (req, res) => {
  const { company_id, asset_name, asset_code, category, purchase_date, cost, salvage_value, useful_life_years, method, wdv_rate, financial_year } = req.body
  if (!company_id || !asset_name || !purchase_date || !cost)
    return res.status(400).json({ error: 'company_id, asset_name, purchase_date, cost required' })
  if (method === 'SLM' && !useful_life_years)
    return res.status(400).json({ error: 'useful_life_years required for SLM method' })
  if (method === 'WDV' && !wdv_rate)
    return res.status(400).json({ error: 'wdv_rate required for WDV method' })

  // FIX: Verify CA has access to this company
  const { rows: access } = await pool.query(
    'SELECT 1 FROM ca_company_access WHERE ca_id=$1 AND company_id=$2', [req.user.id, company_id]
  )
  if (!access.length) return res.status(403).json({ error: 'Access denied to this company' })

  try {
    const { rows } = await pool.query(
      `INSERT INTO fixed_assets(company_id,asset_name,asset_code,category,purchase_date,cost_price,salvage_value,useful_life_years,method,wdv_rate,current_wdv,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [company_id, asset_name, asset_code || null, category || null, purchase_date,
       parseFloat(cost), parseFloat(salvage_value || 0),
       parseInt(useful_life_years || 5), method || 'WDV',
       parseFloat(wdv_rate || 0.15), parseFloat(cost), req.user.id]
    )
    res.status(201).json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/depreciation/schedules/:id/post — post depreciation for a FY
router.post('/schedules/:id/post', async (req, res) => {
  const { financial_year, post_date } = req.body
  if (!financial_year) return res.status(400).json({ error: 'financial_year required (e.g. 2024-25)' })
  const assetId = parseInt(req.params.id)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: assetRows } = await client.query('SELECT * FROM fixed_assets WHERE id=$1', [assetId])
    if (!assetRows.length) return res.status(404).json({ error: 'Asset not found' })
    const asset = assetRows[0]
    const company_id = asset.company_id

    // Check already posted
    const { rows: existing } = await client.query(
      'SELECT id FROM depreciation_entries WHERE asset_id=$1 AND financial_year=$2', [assetId, financial_year]
    )
    if (existing.length) return res.status(400).json({ error: `Depreciation already posted for ${financial_year}` })

    const opening_wdv = parseFloat(asset.current_wdv || asset.cost_price)
    const cost        = parseFloat(asset.cost_price)
    const salvage     = parseFloat(asset.salvage_value || 0)

    let dep = 0
    if (asset.method === 'SLM') {
      dep = (cost - salvage) / parseInt(asset.useful_life_years || 5)
    } else {
      dep = opening_wdv * parseFloat(asset.wdv_rate || 0.15)
    }
    dep = Math.min(dep, Math.max(0, opening_wdv - salvage))
    dep = Math.round(dep * 100) / 100

    if (dep <= 0) {
      await client.query('ROLLBACK')
      return res.json({ message: 'Asset fully depreciated', dep_amount: 0 })
    }

    const closing_wdv = Math.round((opening_wdv - dep) * 100) / 100

    // Post journal entry
    const getAcc = async (code) => {
      const r = await client.query('SELECT id FROM accounts WHERE company_id=$1 AND code=$2', [company_id, code])
      return r.rows[0]?.id
    }
    const deprExpAcc  = await getAcc('5109') // Depreciation
    const accumDeprAcc = await getAcc('1105') // Accumulated Depreciation

    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM journal_entries WHERE company_id=$1', [company_id])
    const entryNum = `JE-${String(parseInt(countRows[0].count) + 1).padStart(4, '0')}`
    const entryDate = post_date || `${financial_year.split('-')[1]}-03-31`

    const { rows: [je] } = await client.query(
      `INSERT INTO journal_entries(company_id,entry_number,entry_date,reference_type,narration,is_posted,created_by)
       VALUES($1,$2,$3,'depreciation',$4,true,$5) RETURNING id`,
      [company_id, entryNum, entryDate,
       `Depreciation — ${asset.asset_name} — FY ${financial_year} (${asset.method})`, req.user.id]
    )

    if (deprExpAcc) await client.query(
      `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,$3,0,$4)`,
      [je.id, deprExpAcc, dep, `Depreciation on ${asset.asset_name}`]
    )
    if (accumDeprAcc) await client.query(
      `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_amount,credit_amount,narration) VALUES($1,$2,0,$3,$4)`,
      [je.id, accumDeprAcc, dep, `Acc. depreciation — ${asset.asset_name}`]
    )

    await client.query(
      `INSERT INTO depreciation_entries(company_id,asset_id,financial_year,opening_wdv,depreciation,closing_wdv,method,journal_entry_id,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [company_id, assetId, financial_year, opening_wdv, dep, closing_wdv, asset.method, je.id, req.user.id]
    )

    await client.query('UPDATE fixed_assets SET current_wdv=$1 WHERE id=$2', [closing_wdv, assetId])

    await client.query(
      `INSERT INTO audit_log(company_id,user_id,action,table_name,record_id,new_values) VALUES($1,$2,'DEPRECIATION_POSTED','fixed_assets',$3,$4)`,
      [company_id, req.user.id, assetId, JSON.stringify({ asset_name: asset.asset_name, financial_year, dep_amount: dep, journal: entryNum })]
    )

    await client.query('COMMIT')
    res.json({ message: 'Depreciation posted', dep_amount: dep, opening_wdv, closing_wdv, journal_entry: entryNum })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

// GET /api/depreciation/summary?company_id=xxx&financial_year=2024-25
router.get('/summary', async (req, res) => {
  const { company_id, financial_year } = req.query
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    let q = `SELECT de.*, fa.asset_name, fa.method, fa.cost_price FROM depreciation_entries de JOIN fixed_assets fa ON fa.id=de.asset_id WHERE de.company_id=$1`
    const params = [company_id]
    if (financial_year) { params.push(financial_year); q += ` AND de.financial_year=$${params.length}` }
    q += ' ORDER BY fa.asset_name, de.financial_year'
    const { rows } = await pool.query(q, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Keep old endpoints working too
router.post('/assets', (req, res) => {
  req.url = '/schedules'; req.method = 'POST'; router.handle(req, res)
})
router.get('/assets', (req, res) => {
  res.redirect(307, `/api/depreciation/schedules?${new URLSearchParams(req.query).toString()}`)
})
router.post('/compute', async (req, res) => {
  // Map old /compute to schedule-based posting
  const { company_id, financial_year } = req.body
  if (!company_id) return res.status(400).json({ error: 'company_id required' })
  try {
    const { rows: assets } = await pool.query('SELECT id FROM fixed_assets WHERE company_id=$1 AND is_active=true', [company_id])
    const results = []
    for (const a of assets) {
      try {
        const fakeReq = { ...req, params: { id: a.id }, body: { financial_year, post_date: null } }
        // Just collect asset ids and return — user should use /schedules/:id/post
        results.push({ asset_id: a.id, status: 'use_schedule_post_endpoint' })
      } catch (_) {}
    }
    res.json({ message: 'Use POST /api/depreciation/schedules/:id/post for each asset', assets: results })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router