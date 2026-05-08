// ============================================================
// Feature I: Auto Account Detection
// GET /api/auto-account?description=Rent+Paid&company_id=xxx
// Returns the best matching account for a description keyword
// ============================================================
const router = require('express').Router()
const pool   = require('../config/db')
const auth   = require('../middleware/auth')

router.use(auth)

// Keyword → account code mapping (priority order, first match wins)
// These map to the standard chart of accounts in setup_default_accounts
const KEYWORD_MAP = [
  // Expenses — Indirect
  { keywords: ['salary','salaries','wages','payroll','staff payment'],      code: '5101', name: 'Salaries & Wages' },
  { keywords: ['rent','lease','premise','office rent','shop rent'],         code: '5102', name: 'Rent' },
  { keywords: ['electricity','power','eb bill','bescom','msedcl','electric bill'], code: '5103', name: 'Electricity' },
  { keywords: ['internet','broadband','wifi','jio','airtel','bsnl','phone','mobile','telephone','data'], code: '5104', name: 'Internet & Phone' },
  { keywords: ['stationery','office supplies','printing','paper','toner'],  code: '5105', name: 'Office Supplies' },
  { keywords: ['travel','conveyance','fuel','petrol','diesel','cab','uber','ola','auto','flight','train ticket','hotel','lodging'], code: '5106', name: 'Travel & Conveyance' },
  { keywords: ['professional','legal','advocate','lawyer','ca fee','audit fee','consultant','advisory','legal service','legal expert','chartered accountant','cs fee'], code: '5107', name: 'Professional Fees' },
  { keywords: ['bank charge','bank fee','processing fee','dd charge','swift','neft charge'], code: '5108', name: 'Bank Charges' },
  { keywords: ['depreciation','amortization'],                              code: '5109', name: 'Depreciation' },
  { keywords: ['interest on loan','loan interest','emi interest','overdraft interest'], code: '5110', name: 'Interest on Loan' },
  { keywords: ['gst penalty','gst late fee','gst fine'],                   code: '5111', name: 'GST Late Fee' },
  { keywords: ['software','saas','subscription','license','microsoft','tally','quickbooks','zoom','slack','aws','cloud'], code: '5112', name: 'Miscellaneous Expense' },
  { keywords: ['repair','maintenance','amc','service charge','upkeep'],    code: '5112', name: 'Miscellaneous Expense' },
  { keywords: ['advertisement','marketing','digital marketing','promotion','seo','google ads','facebook ads'], code: '5112', name: 'Miscellaneous Expense' },
  { keywords: ['insurance','premium','policy','mediclaim'],                code: '5112', name: 'Miscellaneous Expense' },
  { keywords: ['miscellaneous','misc','other expense','sundry expense'],   code: '5112', name: 'Miscellaneous Expense' },

  // Expenses — Direct
  { keywords: ['purchase','raw material','stock','inventory','goods'],     code: '5001', name: 'Purchases' },
  { keywords: ['labour','direct labour','contract labour','job work'],     code: '5003', name: 'Direct Labour' },

  // Revenue
  { keywords: ['sale','sales','sold','revenue'],                           code: '4001', name: 'Sales Revenue' },
  { keywords: ['service','services rendered','consulting','service revenue'], code: '4002', name: 'Service Revenue' },
  { keywords: ['interest income','bank interest','fd interest'],           code: '4101', name: 'Interest Income' },
  { keywords: ['discount received','rebate received'],                     code: '4102', name: 'Discount Received' },
  { keywords: ['other income','miscellaneous income'],                     code: '4103', name: 'Other Income' },

  // Assets
  { keywords: ['machinery','plant','equipment','machine'],                 code: '1101', name: 'Plant & Machinery' },
  { keywords: ['furniture','fixture','office furniture'],                  code: '1102', name: 'Furniture & Fixtures' },
  { keywords: ['computer','laptop','desktop','server','it equipment'],     code: '1103', name: 'Computer Equipment' },
  { keywords: ['land','building','property'],                              code: '1104', name: 'Land & Building' },
]

// GET /api/auto-account?description=Legal+Services+from+ABC&company_id=xxx
router.get('/', async (req, res) => {
  const { description, company_id } = req.query
  if (!description) return res.status(400).json({ error: 'description required' })

  const lower = description.toLowerCase().trim()

  // Find best matching rule (first keyword match wins)
  let matched = null
  for (const rule of KEYWORD_MAP) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      matched = rule
      break
    }
  }

  if (!matched) {
    return res.json({ matched: false, suggestion: null, message: 'No account match found — please select manually' })
  }

  // If company_id provided, also return the actual account id from DB
  let account = null
  if (company_id) {
    try {
      const { rows } = await pool.query(
        'SELECT id, code, name, type FROM accounts WHERE company_id=$1 AND code=$2',
        [company_id, matched.code]
      )
      account = rows[0] || null
    } catch (_) { /* non-fatal — still return the suggestion */ }
  }

  res.json({
    matched: true,
    suggestion: {
      code: matched.code,
      name: matched.name,
      account_id: account?.id || null,
      type:       account?.type || null,
    },
    matched_keyword: matched.keywords.find(kw => lower.includes(kw)),
    message: `Auto-detected: ${matched.name} (${matched.code})`,
  })
})

// POST /api/auto-account/batch — detect accounts for multiple descriptions at once
router.post('/batch', async (req, res) => {
  const { descriptions, company_id } = req.body
  if (!descriptions || !Array.isArray(descriptions))
    return res.status(400).json({ error: 'descriptions array required' })

  const results = descriptions.map(desc => {
    const lower = (desc || '').toLowerCase().trim()
    const rule  = KEYWORD_MAP.find(r => r.keywords.some(kw => lower.includes(kw)))
    return rule
      ? { description: desc, matched: true, code: rule.code, name: rule.name }
      : { description: desc, matched: false, code: null, name: null }
  })

  // If company_id provided, enrich with account IDs
  if (company_id) {
    const codes = [...new Set(results.filter(r => r.code).map(r => r.code))]
    if (codes.length > 0) {
      try {
        const { rows } = await pool.query(
          `SELECT id, code FROM accounts WHERE company_id=$1 AND code = ANY($2::text[])`,
          [company_id, codes]
        )
        const codeToId = Object.fromEntries(rows.map(r => [r.code, r.id]))
        results.forEach(r => { if (r.code) r.account_id = codeToId[r.code] || null })
      } catch (_) { /* non-fatal */ }
    }
  }

  res.json(results)
})

module.exports = router